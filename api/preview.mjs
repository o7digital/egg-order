import { anomalies } from '../lib/anomalies.mjs';
import { audit } from '../lib/store.mjs';
import { localizeResponse } from '../lib/locale.mjs';
import Papa from 'papaparse';
import { createHash } from 'node:crypto';
import { session, sign, publicUser, sameOrigin, scopedUser } from '../lib/auth.mjs';
import { validate } from '../lib/csv.mjs';
export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  localizeResponse(req, res);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Méthode non autorisée.' }); }
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Origine non autorisée.' });
  let user = await session(req);
  if (!user) return res.status(401).json({ error: 'Votre session a expiré. Reconnectez-vous.' });
  if (req.body?.restaurant && user.role !== 'superuser' && !user.restaurants?.includes(req.body.restaurant) && req.body.restaurant !== user.restaurant) return res.status(403).json({error:'Ce compte ne peut envoyer que pour son restaurant.'});
  try {
    user = scopedUser(user, req.body?.restaurant);
    const file = validate({ ...req.body, restaurant: user.restaurant });
    const text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
    const parsed = Papa.parse(text, { skipEmptyLines: 'greedy', delimitersToGuess: [',', ';', '\t', '|'] });
    if (parsed.errors.length || parsed.data.length < 2 || parsed.data[0].length < 2 || parsed.data.some(row => row.length !== parsed.data[0].length)) throw Error('CSV illisible ou colonnes incohérentes. Vérifiez l’export R365 (UTF-8, avec en-têtes et au moins une ligne).');
    if (parsed.data[0].length > 100) throw Error('Le fichier contient trop de colonnes (100 maximum).');
    const alerts = await anomalies(parsed.data[0],parsed.data.slice(1));
    if(process.env.PORTAL_ACCOUNTS_ENABLED === 'true' && alerts.some(a=>a.severity==='error')) await audit('product_error',user,{filename:req.body.filename,message:'Catalogue validation failed',alerts:alerts.slice(0,100)});
    if(alerts.some(a=>a.severity==='error')) return res.status(422).json({error:'Product validation failed. '+alerts.slice(0,5).map(a=>a.message+(a.row?' Row '+a.row+': '+a.product:'')).join(' '),alerts});
    if (process.env.PORTAL_ACCOUNTS_ENABLED === 'true') await audit('preview', user, {filename:req.body.filename,rows:parsed.data.length-1});
    const previewToken = sign({ type: 'preview', ...publicUser(user), rowCount: parsed.data.length - 1, filename: req.body.filename, digest: createHash('sha256').update(file.bytes).digest('hex'), exp: Date.now() + 15 * 60 * 1000 });
    return res.status(200).json({ alerts, restaurant: user.restaurant, filename: req.body.filename, bytes: file.bytes.length, headers: parsed.data[0], rows: parsed.data.slice(1, 21), rowCount: parsed.data.length - 1, previewToken });
  } catch (error) { if(process.env.PORTAL_ACCOUNTS_ENABLED === 'true') await audit('validation_error',user,{message:error.message}).catch(()=>{}); return res.status(400).json({ error: error.message }); }
}
