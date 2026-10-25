// Run locally with PORTAL_STORE_URL and PORTAL_STORE_TOKEN; plaintext credentials stay outside source control.
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { writeFile, chmod } from 'node:fs/promises';
import { directory } from '../lib/directory.mjs';
import { command } from '../lib/store.mjs';
const records=[];
for(const user of directory) {
 const key='portal:account:'+user.email;
 if(await command('GET',key)) {console.log('Already provisioned:',user.email);continue;}
 const password='Egg-'+randomBytes(12).toString('base64url'),salt=randomBytes(16).toString('hex'),expiresAt=Date.now()+7*86400000;
 const record={salt,hash:scryptSync(password,salt,64).toString('hex'),version:randomUUID(),mustChangePassword:true,expiresAt};
 // CAS with null creates only an absent record, avoiding accidental resets.
 if(!await command('CAS',key,null,JSON.stringify(record))) throw Error('Account changed concurrently: '+user.email);
 records.push({email:user.email,restaurants:user.restaurants,role:user.role,password,expiresAt:new Date(expiresAt).toISOString()});
}
if(records.length){const path='.vercel/temporary-accounts-'+Date.now()+'.json';await writeFile(path,JSON.stringify(records,null,2),{mode:0o600});await chmod(path,0o600);console.log('Created',records.length,'accounts. Credentials saved privately:',path);}
