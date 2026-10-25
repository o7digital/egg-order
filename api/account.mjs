import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import { profiles } from '../lib/profiles.mjs';
import { command, audit } from '../lib/store.mjs';
import { sameOrigin, checkPassword, sign, verify, publicUser } from '../lib/auth.mjs';
const cookie=(req)=>(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('artimex_session='))?.slice(16);
function issue(res,user,version,change=false) {
 const token=sign({type:change?'password_change':'session',...publicUser(user),version,exp:Date.now()+(change?600000:28800000)});
 res.setHeader('Set-Cookie',`artimex_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${change?600:28800}`);
 return res.status(200).json(change?{mustChangePassword:true}:publicUser(user));
}
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') return res.status(405).json({error:'Method not allowed.'});
 if(!sameOrigin(req)) return res.status(403).json({error:'Request origin not allowed.'});
 if(process.env.PORTAL_ACCOUNTS_ENABLED!=='true') return res.status(503).json({error:'Account provisioning is not enabled yet.'});
 try {
 if(req.body?.action==='change-password') {
  const data=verify(cookie(req));
  const user=data?.type==='password_change'&&(await profiles()).find(u=>u.email===data.email&&u.active!==false);
  if(!user) return res.status(401).json({error:'Sign in again with your temporary password.'});
  const raw=await command('GET','portal:account:'+user.email),stored=raw&&JSON.parse(raw);
  if(!stored||!stored.mustChangePassword||stored.version!==data.version||stored.expiresAt<Date.now()) return res.status(401).json({error:'Temporary password expired or already used.'});
  const password=req.body.newPassword;
  if(typeof password!=='string'||password.length<12||password.length>256) return res.status(400).json({error:'Choose a new password of 12–256 characters.'});
  if(checkPassword(password,stored)) return res.status(400).json({error:'Choose a different password from your temporary password.'});
  const salt=randomBytes(16).toString('hex'),version=randomUUID();
  const changed=await command('CAS','portal:account:'+user.email,raw,JSON.stringify({salt,hash:scryptSync(password,salt,64).toString('hex'),version,mustChangePassword:false}));
  if(!changed) return res.status(409).json({error:'Account already changed. Please sign in again.'});
  await audit('password_changed',user);await audit('login',user,access(req));
  return issue(res,user,version);
 }
 const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
 if(!email||email.length>254||typeof req.body.password!=='string'||req.body.password.length>256) return res.status(401).json({error:'Incorrect email address or password.'});
 const window=Math.floor(Date.now()/600000);
 const rate=await command('INCRTTL',`portal:rate:${email}:${window}`,660);
 const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||'unknown').split(',')[0].trim().slice(0,100);
 const ipRate=await command('INCRTTL',`portal:ip:${ip}:${window}`,660);
 if(rate>10||ipRate>100) return res.status(429).json({error:'Too many attempts. Try again in 10 minutes.'});
 const user=(await profiles()).find(u=>u.email===email&&u.active!==false),raw=user&&await command('GET','portal:account:'+email),stored=raw&&JSON.parse(raw);
 if(!stored||!checkPassword(req.body.password,stored)||(stored.mustChangePassword&&stored.expiresAt<Date.now())) {
  await audit('login_failed',user||{email},access(req));return res.status(401).json({error:'Incorrect email address or password, or temporary password expired.'});
 }
 await audit(stored.mustChangePassword?'temporary_login':'login',user,access(req));
 return issue(res,user,stored.version,stored.mustChangePassword);
 } catch {return res.status(503).json({error:'Account service unavailable. Contact Artimex.'});}
}

function access(req){return {ip:String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||'').split(',')[0].trim().slice(0,100),agent:String(req.headers['user-agent']||'').slice(0,240)};}
