import { temporaryCredential } from '../lib/credentials.mjs';
// Run locally with PORTAL_STORE_URL and PORTAL_STORE_TOKEN; plaintext credentials stay outside source control.
import { writeFile, chmod } from 'node:fs/promises';
import { directory } from '../lib/directory.mjs';
import { command } from '../lib/store.mjs';
const records=[];
for(const user of directory) {
 const key='portal:account:'+user.email;
 if(await command('GET',key)) {console.log('Already provisioned:',user.email);continue;}
 const {password,record}=temporaryCredential();
 // CAS with null creates only an absent record, avoiding accidental resets.
 if(!await command('CAS',key,null,JSON.stringify(record))) throw Error('Account changed concurrently: '+user.email);
 records.push({email:user.email,restaurants:user.restaurants,role:user.role,password,expiresAt:null});
}
if(records.length){const path='.vercel/temporary-accounts-'+Date.now()+'.json';await writeFile(path,JSON.stringify(records,null,2),{mode:0o600});await chmod(path,0o600);console.log('Created',records.length,'accounts. Credentials saved privately:',path);}
