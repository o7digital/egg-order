import { sign, publicUser } from './auth.mjs';
export function issueSession(res, user, version, change = false, mfa = false, clearChallenge = false, authenticatorId = null, extra = {}) {
  const identity = publicUser(authenticatorId ? { ...user, authenticatorAvailable: true } : user);
  const token = sign({ type: change ? 'password_change' : 'session', ...identity, version, mfa, ...(authenticatorId ? { authenticatorId } : {}), exp: Date.now() + (change ? 600000 : 28800000) });
  const cookie = `artimex_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${change ? 600 : 28800}`;
  res.setHeader('Set-Cookie', clearChallenge ? ['artimex_email_challenge=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0', 'artimex_totp_challenge=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0', cookie] : cookie);
  return res.status(200).json(change ? { mustChangePassword: true } : { ...identity, ...extra });
}
