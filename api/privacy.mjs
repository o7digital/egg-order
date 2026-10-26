import { privacyFor } from '../lib/privacy.mjs';
export default function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed.'});}
 const language=new URL(req.url||'/api/privacy','https://portal.local').searchParams.get('lang')==='es'?'es':'en';
 res.setHeader('Content-Language',language);return res.status(200).json(privacyFor(language));
}
