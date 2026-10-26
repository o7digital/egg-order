import { randomInt, randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { command, audit } from './store.mjs';
import { sign, verify, publicUser } from './auth.mjs';
import { profiles } from './profiles.mjs';
import { temporaryExpired } from './credentials.mjs';
export const requiresEmail2fa=email=>(process.env.ARTIMEX_EMAIL_2FA_USERS||'').split(',').map(e=>e.trim().toLowerCase()).filter(Boolean).includes(email);
const digest=(id,code)=>createHmac('sha256',process.env.ARTIMEX_SESSION_SECRET).update(id+':'+code).digest('hex');
const challengeCookie='artimex_email_challenge';
export function issueSession(res,user,version,change=false,mfa=false,clearChallenge=false) {
 const token=sign({type:change?'password_change':'session',...publicUser(user),version,mfa,exp:Date.now()+(change?600000:28800000)});
 const session=`artimex_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${change?600:28800}`;
 res.setHeader('Set-Cookie',clearChallenge?[`${challengeCookie}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`,session]:session);
 return res.status(200).json(change?{mustChangePassword:true}:publicUser(user));
}
export async function issueAccess(req,res,user,version,change=false,mfa=false) {
 if(!requiresEmail2fa(user.email)||mfa)return issueSession(res,user,version,change,mfa);
 const bucket=Math.floor(Date.now()/600000),sent=await command('INCRTTL','portal:otp-send:'+user.email+':'+bucket,660);
 if(sent>5)return res.status(429).json({code:'OTP_SEND_LIMIT',error:'Too many verification emails. Try again in 10 minutes.'});
 const id=randomUUID(),code=String(randomInt(100000,1000000)),exp=Date.now()+600000;
 const record={id,email:user.email,version,next:change?'password_change':'session',digest:digest(id,code),attempts:0,exp};
 const key='portal:otp:'+id,raw=JSON.stringify(record);await command('SET',key,raw,'EX',600);await command('SET','portal:otp-current:'+user.email,id,'EX',600);
 try{await command('SENDOTP',user.email,code,req.headers['x-portal-language']==='es'?'es':'en',change?'activation':'login');}
 catch{await command('CAS',key,raw,JSON.stringify({...record,digest:'',consumed:true})).catch(()=>{});return res.status(503).json({code:'OTP_EMAIL_UNAVAILABLE',error:'Verification email could not be sent. Contact Artimex.'});}
 const token=sign({type:'email_challenge',id,email:user.email,exp});res.setHeader('Set-Cookie',`${challengeCookie}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=600`);
 await audit('email_code_sent',user).catch(()=>{});
 const [name,domain]=user.email.split('@');return res.status(200).json({verificationRequired:true,challengeId:id,destination:name.slice(0,2)+'•••@'+domain,expiresIn:600});
}
export async function verifyEmailCode(req,res) {
 const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(challengeCookie+'='));
 const challenge=cookie&&verify(cookie.slice(challengeCookie.length+1));
 if(challenge?.type!=='email_challenge'||req.body?.challengeId!==challenge.id)return res.status(401).json({code:'OTP_EXPIRED',error:'Verification expired. Sign in again to request a new code.'});
 const code=req.body?.code;if(typeof code!=='string'||!/^\d{6}$/.test(code))return res.status(400).json({code:'OTP_INVALID',error:'Enter the six-digit verification code.'});
 const activeId=await command('GET','portal:otp-current:'+challenge.email);if(activeId!==challenge.id)return res.status(401).json({code:'OTP_EXPIRED',error:'Verification expired. Sign in again to request a new code.'});
 const user=(await profiles()).find(u=>u.email===challenge.email&&u.active!==false);const credentialRaw=user&&await command('GET','portal:account:'+user.email),credential=credentialRaw&&JSON.parse(credentialRaw);
 if(!user||!credential||temporaryExpired(credential))return res.status(401).json({code:'OTP_EXPIRED',error:'Verification expired. Sign in again to request a new code.'});
 for(let attempt=0;attempt<8;attempt++){
  const key='portal:otp:'+challenge.id,raw=await command('GET',key),stored=raw&&JSON.parse(raw);
  if(!stored||stored.consumed||stored.exp<Date.now()||stored.email!==user.email||stored.version!==credential.version)return res.status(401).json({code:'OTP_EXPIRED',error:'Verification expired. Sign in again to request a new code.'});
  if(stored.attempts>=5)return res.status(429).json({code:'OTP_LOCKED',error:'Too many incorrect codes. Sign in again to request a new code.'});
  const expected=digest(challenge.id,code),valid=stored.digest.length===expected.length&&timingSafeEqual(Buffer.from(stored.digest),Buffer.from(expected));
  const next={...stored,attempts:stored.attempts+1,...(valid?{consumed:true,digest:''}:{})};
  if(!await command('CAS',key,raw,JSON.stringify(next)))continue;
  if(!valid){await audit('email_code_failed',user).catch(()=>{});return res.status(stored.attempts+1>=5?429:401).json({code:stored.attempts+1>=5?'OTP_LOCKED':'OTP_INVALID',error:stored.attempts+1>=5?'Too many incorrect codes. Sign in again to request a new code.':'Incorrect verification code.'});}
  if((stored.next==='password_change')!==!!credential.mustChangePassword)return res.status(401).json({code:'OTP_EXPIRED',error:'Verification expired. Sign in again to request a new code.'});
  await audit('email_code_verified',user).catch(()=>{});if(!credential.mustChangePassword)await audit('login',user).catch(()=>{});
  return issueSession(res,user,credential.version,credential.mustChangePassword,true,true);
 }
 return res.status(409).json({error:'Verification changed concurrently. Try again.'});
}

export async function cancelEmailChallenge(req){
 const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(challengeCookie+'='));const token=cookie&&verify(cookie.slice(challengeCookie.length+1));if(token?.type!=='email_challenge')return;
 const key='portal:otp:'+token.id,raw=await command('GET',key);if(raw){const record=JSON.parse(raw);await command('CAS',key,raw,JSON.stringify({...record,consumed:true,digest:''}));}
}
