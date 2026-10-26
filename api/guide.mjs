import { session } from '../lib/auth.mjs';
import { guideFor } from '../lib/guide-content.mjs';
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed.'});}
 const language=new URL(req.url||'/api/guide','https://portal.local').searchParams.get('lang')==='es'?'es':'en';
 const user=await session(req),role=user?.role==='superuser'?'superuser':user?'manager':'guest';
 return res.status(200).json({language,role,updated:'2026-10-25',version:'1.1',articles:guideFor(role,language)});
}
