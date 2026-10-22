import { users, session, sign, checkPassword, publicUser, sameOrigin } from '../lib/auth.mjs';
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Origine non autorisée.' });
  if (req.method === 'GET') {
    const user = session(req); return user ? res.status(200).json(publicUser(user)) : res.status(401).json({ error: 'Connectez-vous à votre compte restaurant.' });
  }
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', 'artimex_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'); return res.status(200).json({ ok: true });
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST, DELETE'); return res.status(405).json({ error: 'Méthode non autorisée.' }); }
  if (!process.env.ARTIMEX_SESSION_SECRET || !users().length) return res.status(503).json({ error: 'Connexion non configurée.' });
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body?.password;
  const user = users().find(u => u.email === email);
  if (typeof password !== 'string' || password.length > 256 || !user || !checkPassword(password, user)) return res.status(401).json({ error: 'Adresse e-mail ou mot de passe incorrect.' });
  const token = sign({ type: 'session', ...publicUser(user), exp: Date.now() + 8 * 60 * 60 * 1000 });
  res.setHeader('Set-Cookie', `artimex_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
  return res.status(200).json(publicUser(user));
}
