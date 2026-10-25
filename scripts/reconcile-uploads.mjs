// Recover receipts for files deposited before audit logging existed. Never invent an uploader or import status.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { command } from '../lib/store.mjs';
const locations=JSON.parse(readFileSync(new URL('../assets/restaurants.json',import.meta.url),'utf8'));
const files=JSON.parse(execFileSync('ssh',['-o','BatchMode=yes','o7-vps','sudo','python3','-'],{encoding:'utf8',input:`import pathlib,json,csv,io
files=[]
for file in pathlib.Path('/srv/artimex/incoming').glob('*.csv'):
    if file.is_symlink() or not file.is_file(): continue
    size=file.stat().st_size
    if size>2*1024*1024: continue
    rows=None
    try:
        text=file.read_text(encoding='utf-8-sig')
        dialect=csv.Sniffer().sniff(text[:8192],delimiters=',;\\t|')
        rows=max(0,sum(1 for row in csv.reader(io.StringIO(text),dialect) if any(c.strip() for c in row))-1)
    except (ValueError,UnicodeError,csv.Error): pass
    files.append({'filename':file.name,'bytes':size,'rows':rows})
print(json.dumps(files))
`}));
const events=(await command('LRANGE','portal:events',0,9999)).map(JSON.parse);
let recovered=0;
for(const file of files.sort((a,b)=>a.filename.localeCompare(b.filename))) {
 if(events.some(e=>e.type==='upload'&&e.filename===file.filename))continue;
 const location=locations.find(l=>file.filename.startsWith(l.name.replace(/[^A-Za-z0-9_-]+/g,'-')+'_'));
 const match=file.filename.match(/_(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d)-(\d{3})Z_[a-f0-9-]{36}_(.*)$/);
 if(!location||!match)continue;
 const at=`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`;
 await command('LPUSH','portal:events',JSON.stringify({id:createHash('sha256').update('historical:'+file.filename).digest('hex'),at,type:'upload',email:'',restaurant:location.name,...file,originalFilename:match[6],source:'server_recovery',status:'deposited_import_pending',message:'Recovered from Artimex server. Original uploader was not recorded. GlobalBake import status unknown.'}));recovered++;
}
console.log('Historical server receipts recovered:',recovered);
