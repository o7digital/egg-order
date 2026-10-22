import SftpClient from 'ssh2-sftp-client';
import { createHash } from 'node:crypto';
import { session, verify, sameOrigin } from '../lib/auth.mjs';
import { validate } from '../lib/csv.mjs';
export { validate } from '../lib/csv.mjs';
export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Méthode non autorisée.' }); }
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Origine non autorisée.' });
  const user = session(req);
  if (!user) return res.status(401).json({ error: 'Votre session a expiré. Reconnectez-vous.' });
  if (!process.env.ARTIMEX_SFTP_PASSWORD || !process.env.ARTIMEX_SFTP_FINGERPRINT) return res.status(503).json({ error: 'Service de dépôt non configuré.' });
  let file;
  try {
    if (req.body?.restaurant && req.body.restaurant !== user.restaurant) return res.status(403).json({ error: 'Ce compte ne peut envoyer que pour son restaurant.' });
    file = validate({ ...req.body, restaurant: user.restaurant });
    const approval = verify(req.body?.previewToken || '');
    if (!approval || approval.type !== 'preview' || approval.email !== user.email || approval.restaurant !== user.restaurant || approval.filename !== req.body.filename || approval.digest !== createHash('sha256').update(file.bytes).digest('hex')) return res.status(400).json({ error: 'Vérifiez l’aperçu de ce fichier avant de valider son envoi.' });
  } catch (error) { return res.status(400).json({ error: error.message }); }
  const client = new SftpClient();
  let staged;
  try {
    await client.connect({ host: '51.178.36.17', port: 22, username: 'artimex-depot', password: process.env.ARTIMEX_SFTP_PASSWORD, readyTimeout: 12000,
      hostVerifier: key => 'SHA256:' + createHash('sha256').update(key).digest('base64').replace(/=+$/, '') === process.env.ARTIMEX_SFTP_FINGERPRINT });
    staged = `/incoming/${file.name}.part`;
    await client.put(file.bytes, staged);
    await client.rename(staged, `/incoming/${file.name}`);
    staged = undefined;
    return res.status(201).json({ filename: file.name, status: 'deposited', message: 'CSV déposé sur le serveur Artimex. Import dans GlobalBake à effectuer par notre équipe.' });
  } catch {
    return res.status(502).json({ error: 'Le dépôt n’a pas pu être confirmé. Contactez Artimex avant de renvoyer le fichier.' });
  } finally {
    if (staged) await client.delete(staged, true).catch(() => {});
    await client.end().catch(() => {});
  }
}
