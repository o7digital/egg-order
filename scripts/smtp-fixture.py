"""Local-only SMTP receiver used by MFA integration tests; never sends external email."""
import json, os, socketserver
from email import policy
from email.parser import BytesParser
class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.wfile.write(b'220 localhost test SMTP\r\n')
        while True:
            line=self.rfile.readline()
            if not line: break
            command=line.split(b' ',1)[0].upper().strip()
            if command in (b'EHLO',b'HELO'): self.wfile.write(b'250-localhost\r\n250 SIZE 100000\r\n')
            elif command in (b'MAIL',b'RCPT',b'RSET',b'NOOP'): self.wfile.write(b'250 OK\r\n')
            elif command==b'DATA':
                self.wfile.write(b'354 End with dot\r\n');data=b''
                while True:
                    chunk=self.rfile.readline()
                    if chunk in (b'.\r\n',b'.\n',b''): break
                    data+=chunk
                message=BytesParser(policy=policy.default).parsebytes(data)
                with open(os.environ['SMTP_CAPTURE'],'a') as capture: capture.write(json.dumps({'to':message['To'],'subject':message['Subject'],'text':message.get_body(preferencelist=('plain',)).get_content()})+'\n')
                self.wfile.write(b'250 Queued\r\n')
            elif command==b'QUIT': self.wfile.write(b'221 Bye\r\n');break
            else: self.wfile.write(b'502 Unsupported\r\n')
class Server(socketserver.ThreadingTCPServer): allow_reuse_address=True
Server(('127.0.0.1',int(os.environ['SMTP_PORT'])),Handler).serve_forever()
