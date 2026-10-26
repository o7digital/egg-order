"""Private, authenticated SQLite storage bridge for the Artimex Vercel API."""
import hmac, json, os, sqlite3, time, re, smtplib
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
DB = os.environ.get('PORTAL_DB_PATH', '/data/portal.sqlite3')
TOKEN = os.environ['PORTAL_STORE_TOKEN']
@contextmanager
def connect():
    db = sqlite3.connect(DB, timeout=15)
    db.execute('PRAGMA journal_mode=WAL')
    try:
        with db: yield db
    finally: db.close()
with connect() as db:
    db.executescript('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires REAL); CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT NOT NULL);')
def send_otp(args):
    email,code,language,purpose=args
    with open(os.environ.get('PORTAL_MAIL_CONFIG','/data/mail-config.json')) as stream: config=json.load(stream)
    if email not in config.get('recipients',[]) or not isinstance(code,str) or not re.fullmatch(r'[0-9]{6}',code) or language not in ('en','es') or purpose not in ('login','activation'): raise ValueError()
    message=EmailMessage();message['From']='Artimex Portal <'+config['from']+'>';message['To']=email
    message['Subject']='Artimex — Código de verificación' if language=='es' else 'Artimex — Verification code'
    message['Date']=formatdate(localtime=False);message['Message-ID']=make_msgid(domain=config['from'].split('@')[1])
    if language=='es': text=f'Su código de verificación de Artimex es: {code}\n\nVence en 10 minutos. Ingréselo únicamente en https://orderstogb.artimexbakery.com/\nNo comparta este código. Si no solicitó el acceso, ignore este mensaje y contacte a TI.\n\nArtimex Portal'
    else: text=f'Your Artimex verification code is: {code}\n\nExpires in 10 minutes. Enter it only at https://orderstogb.artimexbakery.com/\nDo not share this code. If you did not request sign-in, ignore this message and contact IT.\n\nArtimex Portal'
    message.set_content(text)
    with smtplib.SMTP(config.get('host','postfix-mailcow'),int(config.get('port',25)),timeout=15) as smtp:
        smtp.ehlo();smtp.send_message(message)
    return {'queued':True,'messageId':message['Message-ID']}
def command(args):
    op, *a = args
    if op=='SENDOTP': return send_otp(a)
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        db.execute('DELETE FROM kv WHERE expires IS NOT NULL AND expires <= ?', (time.time(),))
        if op in ('GET', 'SET', 'CAS', 'INCRTTL'):
            key = a[0]
            if not isinstance(key,str) or not key.startswith('portal:') or len(key)>512: raise ValueError()
            row = db.execute('SELECT value FROM kv WHERE key=?',(key,)).fetchone()
            current = row[0] if row else None
            if op=='GET': return current
            if op=='SET':
                expiry=time.time()+int(a[3]) if len(a)==4 and a[2]=='EX' else None
                db.execute('INSERT INTO kv(key,value,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires',(key,a[1],expiry));return 'OK'
            if op=='CAS':
                if current!=a[1]: return 0
                db.execute('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(key,a[2]));return 1
            if op=='INCRTTL':
                n=int(current or 0)+1
                db.execute('INSERT INTO kv(key,value,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(key,str(n),time.time()+int(a[1])));return n
        if op=='MULTICAS':
            changes=a[0]
            if not isinstance(changes,list) or not 1<=len(changes)<=5: raise ValueError()
            for change in changes:
                key=change['key']
                if not key.startswith('portal:') or len(key)>512: raise ValueError()
                row=db.execute('SELECT value FROM kv WHERE key=?',(key,)).fetchone()
                if (row[0] if row else None)!=change['expected']: return 0
            for change in changes:
                db.execute('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=NULL',(change['key'],change['value']))
            if len(a)>1: db.execute('INSERT INTO events(value) VALUES(?)',(a[1],))
            return 1
        if op=='LPUSH' and a[0]=='portal:events':
            db.execute('INSERT INTO events(value) VALUES(?)',(a[1],));return 1
        if op=='LRANGE' and a[0]=='portal:events':
            start=max(0,int(a[1]));count=min(10000,int(a[2])-start+1)
            return [r[0] for r in db.execute('SELECT value FROM events ORDER BY id DESC LIMIT ? OFFSET ?',(count,start))]
        raise ValueError()
class Handler(BaseHTTPRequestHandler):
    def reply(self,status,data):
        body=json.dumps(data).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def do_POST(self):
        if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+TOKEN): return self.reply(401,{'error':'Unauthorized'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=262144: return self.reply(413,{'error':'Request too large'})
            args=json.loads(self.rfile.read(size))
            if not isinstance(args,list) or not 1<=len(args)<=5: raise ValueError()
            return self.reply(200,{'result':command(args)})
        except (ValueError,TypeError,IndexError,KeyError): self.reply(400,{'error':'Invalid command'})
        except Exception: self.reply(503,{'error':'Storage unavailable'})
    def log_message(self,*args): pass
if __name__=='__main__': ThreadingHTTPServer(('0.0.0.0',int(os.environ.get('PORTAL_PORT','8080'))),Handler).serve_forever()
