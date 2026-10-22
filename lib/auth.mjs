import { createHmac, timingSafeEqual, scryptSync } from 'node:crypto';
export function sign(data) {
  if (!process.env.ARTIMEX_SESSION_SECRET) throw Error('Session non configurée');
  const value = Buffer.from(JSON.stringify(data)).toString('base64url');
  return value + '.' + createHmac('sha256', process.env.ARTIMEX_SESSION_SECRET).update(value).digest('base64url');
}
export function verify(token) {
  try {
    if (typeof token !== 'string' || token.split('.').length !== 2) return null;
    const [value, signature] = token.split('.');
    const expected = sign(JSON.parse(Buffer.from(value, 'base64url').toString())).split('.')[1];
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(value, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch { return null; }
}
export function users() { return JSON.parse(process.env.ARTIMEX_PORTAL_USERS || '[]'); }
export function session(req) {
  const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('artimex_session='));
  const data = cookie && verify(cookie.slice('artimex_session='.length));
  return data?.type === 'session' ? users().find(u => u.email === data.email && u.restaurant === data.restaurant) : null;
}
export function checkPassword(password, user) {
  const actual = scryptSync(password, user.salt, 64);
  const expected = Buffer.from(user.hash, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function sameOrigin(req) {
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; }
}
export const publicUser = user => ({ email: user.email, restaurant: user.restaurant });
