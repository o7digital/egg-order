// Prepare the client's access handoff locally. Never commit or deploy the generated files.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {profiles} from '../lib/profiles.mjs';
import {command} from '../lib/store.mjs';
import {checkPassword} from '../lib/auth.mjs';
import {temporaryCredential} from '../lib/credentials.mjs';
const candidates=[];
for(const file of await readdir('.vercel')){
 if(!/^(temporary-accounts-|client-access-).*\.json$/.test(file)&&file!=='olivier-reset.json')continue;
 try{const data=JSON.parse(await readFile('.vercel/'+file,'utf8'));candidates.push(...(Array.isArray(data)?data:[data]));}catch{}
}
const stamp=Date.now(),path=`.vercel/client-access-${stamp}.json`,rows=[];
for(const user of await profiles()){
 const key='portal:account:'+user.email,raw=await command('GET',key),current=raw&&JSON.parse(raw),names=[...new Set((user.managers||[]).map(m=>m.name))];
 const row={name:names.length?names.join(' / '):user.name,email:user.email,role:user.role,restaurants:user.restaurants||[],status:'',password:''};
 if(user.active===false)row.status='Disabled — access not changed';
 else if(current&&!current.mustChangePassword)row.status='Already active — personal password unchanged';
 else{
  const known=current&&candidates.find(c=>c.email===user.email&&typeof c.password==='string'&&checkPassword(c.password,current));
  const generated=known?{password:known.password,record:{...current,expiresAt:null}}:temporaryCredential();
  row.password=generated.password;row.status='Prepared — applying';rows.push(row);await writeFile(path,JSON.stringify(rows,null,2),{mode:0o600});
  const event=JSON.stringify({id:randomUUID(),at:new Date().toISOString(),type:'access_handoff_prepared',email:'',target:user.email,restaurant:'',message:'Provisional access prepared until activation; existing personal passwords preserved.'});
  if(!await command('MULTICAS',[{key,expected:raw,value:JSON.stringify(generated.record)}],event)){row.status='Concurrent change — requires review';row.password='';await writeFile(path,JSON.stringify(rows,null,2),{mode:0o600});throw Error('Account changed concurrently: '+user.email);}
  row.status='Ready for first activation';await writeFile(path,JSON.stringify(rows,null,2),{mode:0o600});continue;
 }
 rows.push(row);await writeFile(path,JSON.stringify(rows,null,2),{mode:0o600});
}
const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
const csvPath=`.vercel/client-access-${stamp}.csv`;
await writeFile(csvPath,'\uFEFF'+[['Name','Email','Role','Restaurants','Status','Provisional password'],...rows.map(r=>[r.name,r.email,r.role,r.restaurants.join('; '),r.status,r.password])].map(row=>row.map(cell).join(',')).join('\r\n'),{mode:0o600});
const chris=rows.find(r=>r.email==='christian.garcia@gallogiro.com');if(!chris)throw Error('Chris account missing from approved profiles');
const access=chris.password?`Provisional password: ${chris.password}\n\nThis password remains valid until you complete first-time activation or an administrator resets/revokes it. At first sign-in, choose and confirm a personal password (at least 12 characters), read the portal privacy notice and acknowledge its receipt.`:'Your account is already activated. Please use your existing personal password; it has not been changed.';
const draft=`Subject: Artimex Portal — Your Access and GlobalBake TEST Validation\n\nHi Chris,\n\nWe have prepared the portal accounts and restaurant assignments. You do not need to create the users or generate their initial passwords. Users who have not yet activated their accounts have provisional passwords; existing personal passwords have been left unchanged.\n\nPortal: https://orderstogb.artimexbakery.com/\nUser guide (English / Spanish): https://orderstogb.artimexbakery.com/guide.html\n\nYour Super Administrator account:\nEmail: christian.garcia@gallogiro.com\n${access}\n\nThe prepared user-access list is supplied separately for secure delivery. Each user replaces their provisional password at first activation. Please verify the restaurant assignments and confirm you can access the dashboard, GM reports and upload history.\n\nEmail verification is currently being piloted with Olivier’s Gmail only. It has not been rolled out to the other client accounts.\n\nFor now, all imports must be tested in GlobalBake TEST only. Confirm that test files cannot be collected by a production importer before uploading. A portal receipt confirms delivery to Artimex’s server, not a completed GlobalBake import.\n\nPlease let us know the outcome of your access and TEST import checks, including any error message, filename and time. Do not include passwords in support messages.\n\nThanks,\nOlivier\n`;
await writeFile('.vercel/email-chris-ready.txt',draft,{mode:0o600});
console.log(JSON.stringify({accounts:rows.length,provisional:rows.filter(r=>r.password).length,alreadyActive:rows.filter(r=>r.status.startsWith('Already')).length,csv:csvPath,emailDraft:'.vercel/email-chris-ready.txt'}));
