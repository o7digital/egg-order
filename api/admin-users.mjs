import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { session, sameOrigin } from '../lib/auth.mjs';
import { profileState, safeProfile } from '../lib/profiles.mjs';
import { command } from '../lib/store.mjs';
const locations=JSON.parse(readFileSync(new URL('../assets/restaurants.json',import.meta.url),'utf8')).map(l=>l.name);
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
 if(!sameOrigin(req))return res.status(403).json({error:'Request origin not allowed.'});
 const actor=await session(req);
 if(actor?.role!=='superuser')return res.status(403).json({error:'Super administrator access required.'});
 try {
 const {raw,profiles}=await profileState();
 if(!profiles.some(u=>u.email===actor.email&&u.role==='superuser'&&u.active!==false))return res.status(403).json({error:'Administrator access has been revoked.'});
 const email=String(req.body?.email||'').trim().toLowerCase(),action=req.body?.action;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return res.status(400).json({error:'Enter a valid email address.'});
 let target=profiles.find(u=>u.email===email);
 if(!['create','update','reset-password'].includes(action))return res.status(400).json({error:'Invalid account action.'});
 if(action==='create'&&target)return res.status(409).json({error:'This email already has an account. Edit its restaurant assignments.'});
 if(action!=='create'&&!target)return res.status(404).json({error:'Account not found.'});
 if(email===actor.email && (action==='reset-password'||req.body.active===false||req.body.role&&req.body.role!=='superuser'))return res.status(400).json({error:'Keep your own administrator access active. Another administrator can reset your password.'});
 const before=target&&safeProfile(target);
 if(action==='create'||action==='update') {
  const name=String(req.body.name||'').trim();
  const role=req.body.role,restaurants=req.body.restaurants;
  if(!name||name.length>100||!['superuser','manager'].includes(role)||!Array.isArray(restaurants)||restaurants.some(r=>!locations.includes(r))||(role==='manager'&&!restaurants.length)||typeof req.body.active!=='boolean')return res.status(400).json({error:'Provide a name, role, status and valid restaurant assignments. Managers need at least one restaurant.'});
  const managers=restaurants.map(restaurant=>({restaurant,name:String(req.body.managers?.find(m=>m.restaurant===restaurant)?.name||target?.managers?.find(m=>m.restaurant===restaurant)?.name||name).trim().slice(0,100)}));
  const updated={email,name,role,restaurants:[...new Set(restaurants)],restaurant:role==='manager'?restaurants[0]:undefined,managers,active:req.body.active};
  if(target)profiles.splice(profiles.indexOf(target),1,updated);else profiles.push(updated);target=updated;
 }
 if(!profiles.some(u=>u.role==='superuser'&&u.active!==false))return res.status(400).json({error:'At least one active super administrator is required.'});
 const accountKey='portal:account:'+email,accountRaw=await command('GET',accountKey);
 let credentials=accountRaw&&JSON.parse(accountRaw),temporaryPassword;
 if(action==='create'||action==='reset-password') {
  temporaryPassword='Egg-'+randomBytes(12).toString('base64url');const salt=randomBytes(16).toString('hex');
  credentials={salt,hash:scryptSync(temporaryPassword,salt,64).toString('hex'),version:randomUUID(),mustChangePassword:true,expiresAt:Date.now()+7*86400000};
 } else if(credentials&&email!==actor.email) credentials={...credentials,version:randomUUID()};
 const changes=[{key:'portal:profiles',expected:raw,value:JSON.stringify(profiles)}];
 if(credentials)changes.push({key:accountKey,expected:accountRaw,value:JSON.stringify(credentials)});
 const event=JSON.stringify({id:randomUUID(),at:new Date().toISOString(),type:'admin_'+action.replaceAll('-','_'),email:actor.email,restaurant:'',target:email,before,after:safeProfile(target)});
 if(!await command('MULTICAS',changes,event))return res.status(409).json({error:'An account was changed concurrently. Refresh and try again.'});

 return res.status(action==='create'?201:200).json({user:safeProfile(target),...(temporaryPassword?{temporaryPassword,expiresAt:new Date(credentials.expiresAt).toISOString()}:{})});
 } catch {return res.status(503).json({error:'Account administration unavailable. Refresh before retrying.'});}
}
