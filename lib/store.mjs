import { randomUUID } from 'node:crypto';
export const ready = () => Boolean(process.env.PORTAL_STORE_URL && process.env.PORTAL_STORE_TOKEN);
export async function command(...args) {
 if (!ready()) throw Error('Persistent portal storage is not configured. Contact Artimex.');
 const r = await fetch(process.env.PORTAL_STORE_URL, {method:'POST',headers:{Authorization:`Bearer ${process.env.PORTAL_STORE_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
 if (!r.ok) throw Error('Portal storage unavailable.');
 const data=await r.json(); if(data.error) throw Error('Portal storage unavailable.'); return data.result;
}
export async function audit(type,user,details={}) {
 return command('LPUSH','portal:events',JSON.stringify({id:randomUUID(),at:new Date().toISOString(),type,email:user?.email||'',restaurant:user?.restaurant||'',...details}));
}
