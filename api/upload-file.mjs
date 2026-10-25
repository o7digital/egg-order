import SftpClient from 'ssh2-sftp-client';
import { createHash } from 'node:crypto';
import { session } from '../lib/auth.mjs';
import { command, audit } from '../lib/store.mjs';
export const config={maxDuration:30};
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed.'});
 const user=await session(req);if(user?.role!=='superuser')return res.status(403).json({error:'Super administrator access required.'});
 const id=new URL(req.url||'/','https://portal.local').searchParams.get('id');
 const client=new SftpClient();
 try {
 const event=(await command('LRANGE','portal:events',0,9999)).map(JSON.parse).find(e=>e.id===id&&e.type==='upload');
 if(!event||!event.filename||!/^[-A-Za-z0-9_.]+\.csv$/.test(event.filename))return res.status(404).json({error:'Upload not found.'});
 await client.connect({host:'51.178.36.17',port:22,username:'artimex-depot',password:process.env.ARTIMEX_SFTP_PASSWORD,readyTimeout:12000,hostVerifier:key=>'SHA256:'+createHash('sha256').update(key).digest('base64').replace(/=+$/,'')===process.env.ARTIMEX_SFTP_FINGERPRINT});
 const stat=await client.stat('/incoming/'+event.filename);if(stat.size>2*1024*1024)return res.status(413).json({error:'File exceeds portal download limit.'});
 const bytes=await client.get('/incoming/'+event.filename);await audit('file_download',user,{filename:event.filename});
 res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="${event.filename}"`);res.setHeader('X-Content-Type-Options','nosniff');return res.status(200).send(bytes);
 }catch{return res.status(502).json({error:'The original file is unavailable. It may have been moved for import.'});}finally{await client.end().catch(()=>{});}
}
