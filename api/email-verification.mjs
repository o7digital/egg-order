import { localizeResponse } from '../lib/locale.mjs';
import { sameOrigin } from '../lib/auth.mjs';
import { verifyEmailCode } from '../lib/email-2fa.mjs';
import { verifyAuthenticatorChallenge } from '../lib/authenticator.mjs';
export default async function handler(req,res) {
 const authenticator=req.body?.factor==='authenticator';
 if(!authenticator)localizeResponse(req,res);
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed.'});}
 if(!sameOrigin(req))return res.status(403).json({error:'Request origin not allowed.'});
 try{return authenticator?await verifyAuthenticatorChallenge(req,res):await verifyEmailCode(req,res);}catch{return res.status(503).json({error:authenticator&&req.headers['x-portal-language']==='es'?'La verificación no está disponible. Inténtelo de nuevo.':'Verification service unavailable. Please try again.'});}
}
