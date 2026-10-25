import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import account from '../api/account.mjs';
import dashboard from '../api/dashboard.mjs';
import { directory } from '../lib/directory.mjs';
import { scopedUser, session } from '../lib/auth.mjs';
import { anomalies } from '../lib/anomalies.mjs';
const shared=directory.find(u=>u.email==='egg-bellflower@gallogiro.com');
assert.deepEqual(shared.restaurants,['EGG Bristol','EGG Bellflower']);
assert.equal(scopedUser(shared,'EGG Bellflower').restaurant,'EGG Bellflower');
assert.throws(()=>scopedUser(shared,'EGG Pacific'));
assert.equal(directory.filter(u=>u.role==='superuser').length,5);
Object.assign(process.env,{PORTAL_ACCOUNTS_ENABLED:'true',ARTIMEX_SESSION_SECRET:'test',RESEND_API_KEY:'test',PORTAL_EMAIL_FROM:'test@example.com',PORTAL_REDIS_URL:'https://redis.test',PORTAL_REDIS_TOKEN:'test'});
const db=new Map();let emailCode;let sends=0;
global.fetch=async(url,options)=>{
 if(url==='https://api.resend.com/emails'){emailCode=JSON.parse(options.body).text.match(/code is (\d{6})/)[1];sends++;return {ok:true};}
 const [op,...a]=JSON.parse(options.body);let result;
 if(op==='INCR'){result=(Number(db.get(a[0]))||0)+1;db.set(a[0],result);}
 if(op==='SET'){db.set(a[0],a[1]);result='OK';}
 if(op==='GET')result=db.get(a[0])||null;
 if(op==='LPUSH')result=1;
 if(op==='EVAL'){const key=a[2],raw=db.get(key);result=null;if(raw){const d=JSON.parse(raw);d.attempts++;if(d.attempts>5)db.delete(key);else if(d.digest===a[3]){db.delete(key);result=raw;}else db.set(key,JSON.stringify(d));}}
 return {ok:true,json:async()=>({result})};
};
const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
const request=async body=>{const r=res();await account({method:'POST',headers:{},body},r);return r;};
const email=shared.email,password='A-long-test-password';
let r=await request({action:'setup',email,password});assert.equal(r.code,200);assert(!r.headers['Set-Cookie']);const challenge=r.body.challenge;
r=await request({action:'verify',email,password,challenge,code:'000000'});assert.equal(r.code,401);
r=await request({action:'verify',email,password,challenge,code:emailCode});assert.equal(r.code,200);assert.equal(session({headers:{cookie:r.headers['Set-Cookie']}}).email,email);
r=await request({action:'verify',email,password,challenge,code:emailCode});assert.equal(r.code,401);
r=await request({email,password:'wrong'});assert.equal(r.code,401);
r=await request({email,password});assert.equal(r.code,200);assert(r.body.verificationRequired);assert(!r.headers['Set-Cookie']);assert.equal(sends,2);
const codeChallenge=r.body.challenge;
for(let i=0;i<6;i++) await request({action:'verify',email,password,challenge:codeChallenge,code:'000000'});
r=await request({action:'verify',email,password,challenge:codeChallenge,code:emailCode});assert.equal(r.code,401);
r=res();await dashboard({method:'GET',headers:{}},r);assert.equal(r.code,403);
process.env.ARTIMEX_PRODUCT_CATALOG='["SKU1"]';
assert.equal((await anomalies(['SKU','Qty'],[['OTHER','2']]))[0].code,'UNKNOWN_PRODUCT');
assert.deepEqual(await anomalies(['SKU','Qty'],[['SKU1','2']]),[]);
console.log('Multi-location permissions, five super users, activation, mandatory email code, replay/guess protection, dashboard isolation and product checks passed');
