import { session } from '../lib/auth.mjs';
import { command } from '../lib/store.mjs';
import { directory } from '../lib/directory.mjs';
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET') return res.status(405).json({error:'Method not allowed.'});
 if(session(req)?.role!=='superuser') return res.status(403).json({error:'Super user access required.'});
 try {
 const events=(await command('LRANGE','portal:events',0,9999)).map(JSON.parse);
 const locations=[...new Set(directory.flatMap(u=>u.restaurants).filter(Boolean))].map(restaurant=>{
 const own=events.filter(e=>e.restaurant===restaurant);
 return {restaurant,uploads:own.filter(e=>e.type==='upload').length,rows:own.filter(e=>e.type==='upload').reduce((n,e)=>n+(e.rows||0),0),errors:own.filter(e=>e.type.endsWith('_error')).length,lastUpload:own.find(e=>e.type==='upload')?.at||''};
 });
 res.status(200).json({locations,events,accounts:directory,window:'Latest 10,000 events',integration:{system:'Hugging Face',status:process.env.HF_TOKEN && process.env.HF_MODEL ? 'Configured for advisory anomaly analysis' : 'Awaiting HF_TOKEN and HF_MODEL',catalogue:process.env.ARTIMEX_PRODUCT_CATALOG ? 'Configured' : 'Missing official product catalogue'}});
 } catch(error) {res.status(503).json({error:error.message});}
}
