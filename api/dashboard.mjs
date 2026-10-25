import { readFileSync } from 'node:fs';
import { session } from '../lib/auth.mjs';
import { command } from '../lib/store.mjs';
import { profiles, safeProfile } from '../lib/profiles.mjs';
import { buildReport } from '../lib/reports.mjs';
const locations=JSON.parse(readFileSync(new URL('../assets/restaurants.json',import.meta.url),'utf8'));
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed.'});
 if((await session(req))?.role!=='superuser')return res.status(403).json({error:'Super user access required.'});
 try {
 const query=new URL(req.url||'/api/dashboard','https://portal.local').searchParams;
 const filter=Object.fromEntries(['from','to','restaurant','email'].map(k=>[k,query.get(k)||'']));
 if(['from','to'].some(k=>filter[k]&&(!/^\d{4}-\d{2}-\d{2}$/.test(filter[k])||!Number.isFinite(Date.parse(filter[k]))))||filter.from&&filter.to&&filter.from>filter.to)return res.status(400).json({error:'Choose a valid date range.'});
 const events=(await command('LRANGE','portal:events',0,9999)).map(JSON.parse).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
 const accounts=await Promise.all((await profiles()).map(async u=>{
  const raw=await command('GET','portal:account:'+u.email),credentials=raw&&JSON.parse(raw);
  return {...safeProfile(u),status:u.active===false?'disabled':!credentials?'unprovisioned':credentials.mustChangePassword?(credentials.expiresAt<Date.now()?'expired':'invited'):'active',lastLogin:events.find(e=>e.type==='login'&&e.email===u.email)?.at||null};
 }));
 const report=buildReport(events,accounts,locations,filter);
 res.status(200).json({...report,accounts,allLocations:locations,filter,generatedAt:new Date().toISOString(),historyLimit:10000,historyLimited:events.length===10000,integration:{hf:!!(process.env.HF_TOKEN&&process.env.HF_MODEL),catalogue:!!process.env.ARTIMEX_PRODUCT_CATALOG,globalBake:false}});
 }catch{return res.status(503).json({error:'Dashboard unavailable. Please refresh.'});}
}
