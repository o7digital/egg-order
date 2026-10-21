import SftpClient from 'ssh2-sftp-client';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
export const config = { maxDuration: 30 };
export function validate(body) {
  const { restaurant, filename, content } = body || {};
  if (typeof restaurant !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 ._-]{1,79}$/.test(restaurant)) throw Error('Indiquez le nom du restaurant (2 à 80 caractères).');
  if (typeof filename !== 'string' || !/\.csv$/i.test(filename) || filename.length > 180 || /[\/\\\x00-\x1f]/.test(filename)) throw Error('Sélectionnez un fichier .csv.');
  if (typeof content !== 'string' || content.length > 2800000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) throw Error('Fichier invalide ou trop volumineux (2 Mo maximum).');
  const bytes = Buffer.from(content, 'base64');
  if (!bytes.length || bytes.length > 2 * 1024 * 1024 || bytes.includes(0)) throw Error('Le CSV doit être un fichier texte non vide de 2 Mo maximum.');
  const slug = restaurant.trim().replace(/[^A-Za-z0-9_-]+/g, '-');
  const original = filename.slice(0, -4).replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 80) || 'export';
  return { bytes, name: `${slug}_${new Date().toISOString().replace(/[:.]/g, '-')}_${randomUUID()}_${original}.csv` };
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Méthode non autorisée.' }); }
  const expected = process.env.ARTIMEX_UPLOAD_CODE;
  if (!expected || !process.env.ARTIMEX_SFTP_PASSWORD || !process.env.ARTIMEX_SFTP_FINGERPRINT) return res.status(503).json({ error: 'Service de dépôt non configuré. Contactez Artimex.' });
  const provided = typeof req.headers['x-upload-code'] === 'string' ? req.headers['x-upload-code'] : '';
  const hash = value => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(hash(provided), hash(expected))) return res.status(401).json({ error: 'Code d’accès incorrect.' });
  let file;
  try { file = validate(req.body); } catch (error) { return res.status(400).json({ error: error.message }); }
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
