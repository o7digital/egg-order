import { randomBytes, createCipheriv, createDecipheriv, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { Secret, TOTP } from 'otpauth';

export const totpPilot = email => (process.env.ARTIMEX_TOTP_PILOT_USERS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean).includes(email);
function key(purpose) {
  const master = Buffer.from(process.env.ARTIMEX_TOTP_ENCRYPTION_KEY || '', 'base64');
  if (master.length !== 32) throw Error('Authenticator encryption is not configured.');
  return Buffer.from(hkdfSync('sha256', master, 'artimex-authenticator-v1', purpose, 32));
}
export function authenticatorReady() { try { key('encryption'); return true; } catch { return false; } }
export function newAuthenticator(email) {
  return new TOTP({ issuer: 'Artimex Portal', label: email, algorithm: 'SHA1', digits: 6, period: 30, secret: new Secret({ size: 20 }) });
}
export const authenticator = (email, secret) => new TOTP({ issuer: 'Artimex Portal', label: email, algorithm: 'SHA1', digits: 6, period: 30, secret });
export function encryptSeed(secret, email, id) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key('encryption'), iv);
  cipher.setAAD(Buffer.from(email + ':' + id));
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}
export function decryptSeed(record, email) {
  const { iv, ciphertext, tag } = record.encrypted;
  const decipher = createDecipheriv('aes-256-gcm', key('encryption'), Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(email + ':' + record.id));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
export const normalizeBackup = code => typeof code === 'string' ? code.replace(/[\s-]/g, '').toLowerCase() : '';
export const backupDigest = (email, id, code) => createHmac('sha256', key('backup-hmac')).update(email + ':' + id + ':' + normalizeBackup(code)).digest('hex');
export function newBackupCodes(email, id) {
  const codes = Array.from({ length: 10 }, () => randomBytes(10).toString('hex').match(/.{4}/g).join('-').toUpperCase());
  return { codes, hashes: codes.map(code => backupDigest(email, id, code)) };
}
export function checkAuthenticator(record, email, code, method = 'totp', now = Date.now()) {
  if (method === 'recovery') {
    if (!/^[a-f0-9]{20}$/.test(normalizeBackup(code))) return null;
    const actual = backupDigest(email, record.id, code);
    const index = record.backupHashes.findIndex(hash => hash.length === actual.length && timingSafeEqual(Buffer.from(hash), Buffer.from(actual)));
    if (index < 0) return null;
    return { ...record, backupHashes: record.backupHashes.filter((_, i) => i !== index) };
  }
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const totp = authenticator(email, decryptSeed(record, email));
  const delta = totp.validate({ token: code, timestamp: now, window: 1, afterCounter: record.lastStep ?? null });
  if (delta === null) return null;
  return { ...record, lastStep: Math.floor(now / 30000) + delta };
}
