import { randomInt, randomUUID, scryptSync, randomBytes, createHmac } from 'node:crypto';
import { directory } from '../lib/directory.mjs';
import { command, audit } from '../lib/store.mjs';
import { sameOrigin, checkPassword, sign, publicUser } from '../lib/auth.mjs';
const digest = (id,code) => createHmac('sha256',process.env.ARTIMEX_SESSION_SECRET).update(id+':'+code).digest('hex');
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') return res.status(405).json({error:'Method not allowed.'});
 if(!sameOrigin(req)) return res.status(403).json({error:'Request origin not allowed.'});
 if(!process.env.RESEND_API_KEY || !process.env.PORTAL_EMAIL_FROM || !process.env.ARTIMEX_SESSION_SECRET) return res.status(503).json({error:'Email verification is not configured. Contact Artimex.'});
 try {
 if(process.env.PORTAL_ACCOUNTS_ENABLED !== 'true') return res.status(503).json({error:'New accounts are awaiting email and storage configuration. The existing pilot login remains available.'});
 const email=String(req.body?.email||'').trim().toLowerCase();
 if(email.length>254) return res.status(400).json({error:'Invalid email address.'});
 const user=directory.find(u=>u.email===email&&!u.pending);
 if(req.body?.action==='verify') {
  const {challenge,code,password}=req.body;
  if(typeof challenge!=='string'||!/^\d{6}$/.test(code||'')) return res.status(400).json({error:'Invalid verification code.'});
  // Consume atomically on success; cap guesses across all serverless instances.
  const result=await command('EVAL',`local v=redis.call('GET',KEYS[1]); if not v then return nil end; local d=cjson.decode(v); d.attempts=d.attempts+1; if d.attempts>5 then redis.call('DEL',KEYS[1]); return nil end; if d.digest~=ARGV[1] then redis.call('SET',KEYS[1],cjson.encode(d),'KEEPTTL'); return nil end; redis.call('DEL',KEYS[1]); return v`,1,'portal:otp:'+challenge,digest(challenge,code));
  const pending=result&&JSON.parse(result);
  if(!pending||!user||pending.email!==email) return res.status(401).json({error:'Invalid or expired verification code. Request a new code.'});
  if(pending.setup) {
   if(typeof password!=='string'||password.length<12||password.length>256) return res.status(400).json({error:'Choose a password of 12–256 characters and request a new code.'});
   const salt=randomBytes(16).toString('hex');
   await command('SET','portal:account:'+email,JSON.stringify({salt,hash:scryptSync(password,salt,64).toString('hex')}));
  }
  await audit('login',user);
  const token=sign({type:'session',...publicUser(user),exp:Date.now()+28800000});
  res.setHeader('Set-Cookie',`artimex_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
  return res.status(200).json(publicUser(user));
 }
 const rate=await command('INCR','portal:rate:'+email+':'+Math.floor(Date.now()/600000));
 if(rate===1) await command('EXPIRE','portal:rate:'+email+':'+Math.floor(Date.now()/600000),660);
 if(rate>5) return res.status(429).json({error:'Too many requests. Try again in 10 minutes.'});
 const challenge=randomUUID();
 if(!user) return res.status(200).json({challenge,verificationRequired:true});
 const stored=await command('GET','portal:account:'+email);
 const setup=req.body?.action==='setup';
 if(!setup && (!stored || typeof req.body.password!=='string'||req.body.password.length>256||!checkPassword(req.body.password,JSON.parse(stored)))) {await audit('login_failed',user);return res.status(401).json({error:'Incorrect email address or password. Use Activate / reset account if needed.'});}
 const code=String(randomInt(100000,1000000));
 await command('SET','portal:otp:'+challenge,JSON.stringify({email,setup,attempts:0,digest:digest(challenge,code)}),'EX',600);
 const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.PORTAL_EMAIL_FROM,to:[email],subject:'Artimex portal verification code',text:`Your ${setup?'account activation / password reset':'sign-in'} code is ${code}. Expires in 10 minutes. Do not share this code.`}),signal:AbortSignal.timeout(10000)});
 if(!sent.ok) {await command('DEL','portal:otp:'+challenge);throw Error('Verification email could not be sent. Contact Artimex.');}
 return res.status(200).json({challenge,verificationRequired:true});
 } catch(error) {return res.status(503).json({error:error.message});}
}
