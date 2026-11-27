import { randomInt, randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { command, audit } from './store.mjs';
import { profiles } from './profiles.mjs';
import { sign, verify } from './auth.mjs';

export const recoveryCookie = 'artimex_recovery';
export const recoveryMessage = 'If this account is active, a reset code will be sent to its email address. Check your inbox and spam, or contact IT.';
const digest = (id, code) => createHmac('sha256', process.env.ARTIMEX_SESSION_SECRET).update('recovery:' + id + ':' + code).digest('hex');
const expired = () => ({ code: 'RECOVERY_EXPIRED', error: 'Password recovery expired. Request a new reset code.' });
const readCookie = req => {
  const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(recoveryCookie + '='));
  return cookie && verify(cookie.slice(recoveryCookie.length + 1));
};
const cookieValue = token => `${recoveryCookie}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${token ? 600 : 0}`;
export const clearRecoveryCookie = () => cookieValue('');

export async function requestPasswordRecovery(req, res) {
  const started = Date.now();
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const bucket = Math.floor(Date.now() / 600000);
  const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim().slice(0, 100);
  const [count, ipCount] = await Promise.all([
    command('INCRTTL', `portal:recovery-send:${email}:${bucket}`, 660),
    command('INCRTTL', `portal:recovery-ip:${ip}:${bucket}`, 660)
  ]);
  if (ipCount > 20) return res.status(429).json({ error: 'Too many attempts. Try again in 10 minutes.' });
  const id = randomUUID(), code = String(randomInt(100000, 1000000)), exp = Date.now() + 600000;
  if (count <= 3) {
    const user = (await profiles()).find(u => u.email === email && u.active !== false);
    const raw = await command('GET', 'portal:account:' + email), storedAccount = user && raw && JSON.parse(raw);
    const account = storedAccount?.passwordless ? null : storedAccount;
    const record = { id, email, version: account?.version || '', digest: digest(id, code), attempts: 0, exp };
    // The same expiring records and response are used for unrecognized addresses.
    await command('SET', 'portal:recovery:' + id, JSON.stringify(record), 'EX', 600);
    await command('SET', 'portal:recovery-current:' + email, id, 'EX', 600);
    if (account) {
      try {
        await command('SENDRECOVERY', email, code, req.headers['x-portal-language'] === 'es' ? 'es' : 'en', 'reset');
        await audit('password_recovery_requested', user).catch(() => {});
      } catch {
        await audit('password_recovery_email_failed', user).catch(() => {});
      }
    }
  }
  // Avoid the quick response for an unknown account revealing directory membership.
  await delay(Math.max(0, 1500 - (Date.now() - started)));
  res.setHeader('Set-Cookie', cookieValue(sign({ type: 'password_recovery', id, email, exp })));
  return res.status(200).json({ challengeId: id, expiresIn: 600, message: recoveryMessage });
}

export async function verifyPasswordRecovery(req, res) {
  const challenge = readCookie(req);
  if (challenge?.type !== 'password_recovery' || challenge.id !== req.body?.challengeId) return res.status(401).json(expired());
  const code = req.body?.code;
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the six-digit verification code.' });
  const user = (await profiles()).find(u => u.email === challenge.email && u.active !== false);
  const accountKey = 'portal:account:' + challenge.email, currentKey = 'portal:recovery-current:' + challenge.email;
  const [accountRaw, current] = await Promise.all([command('GET', accountKey), command('GET', currentKey)]);
  const account = accountRaw && JSON.parse(accountRaw);
  if (!user || !account || account.passwordless || current !== challenge.id) return res.status(401).json(expired());
  for (let attempt = 0; attempt < 8; attempt++) {
    const key = 'portal:recovery:' + challenge.id, raw = await command('GET', key), stored = raw && JSON.parse(raw);
    if (!stored || stored.verified || stored.completed || stored.exp <= Date.now() || stored.email !== user.email || stored.version !== account.version) return res.status(401).json(expired());
    if (stored.attempts >= 5) return res.status(429).json({ code: 'RECOVERY_LOCKED', error: 'Too many incorrect codes. Request a new reset code.' });
    const expected = digest(challenge.id, code);
    const valid = stored.digest.length === expected.length && timingSafeEqual(Buffer.from(stored.digest), Buffer.from(expected));
    const next = { ...stored, attempts: stored.attempts + 1, ...(valid ? { verified: true, digest: '' } : {}) };
    const changes = [{ key, expected: raw, value: JSON.stringify(next) }];
    if (valid) changes.push({ key: accountKey, expected: accountRaw, value: accountRaw }, { key: currentKey, expected: challenge.id, value: challenge.id });
    if (!await command('MULTICAS', changes)) continue;
    if (!valid) return res.status(next.attempts >= 5 ? 429 : 401).json({ code: next.attempts >= 5 ? 'RECOVERY_LOCKED' : 'RECOVERY_INVALID', error: next.attempts >= 5 ? 'Too many incorrect codes. Request a new reset code.' : 'Incorrect verification code.' });
    const token = sign({ type: 'password_change', email: user.email, version: account.version, mfa: true, recovery: challenge.id, exp: stored.exp });
    res.setHeader('Set-Cookie', [cookieValue(''), `artimex_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${Math.max(1, Math.floor((stored.exp - Date.now()) / 1000))}`]);
    await audit('password_recovery_verified', user).catch(() => {});
    return res.status(200).json({ mustChangePassword: true, recovery: true });
  }
  return res.status(409).json({ error: 'Account already changed. Please sign in again.' });
}

export async function recoveryGrant(data) {
  if (typeof data?.recovery !== 'string') return null;
  const key = 'portal:recovery:' + data.recovery, currentKey = 'portal:recovery-current:' + data.email;
  const [raw, current] = await Promise.all([command('GET', key), command('GET', currentKey)]);
  const record = raw && JSON.parse(raw);
  if (!record?.verified || record.completed || record.exp <= Date.now() || record.id !== data.recovery || record.email !== data.email || record.version !== data.version || current !== data.recovery) return null;
  return [
    { key, expected: raw, value: JSON.stringify({ ...record, completed: true }) },
    { key: currentKey, expected: data.recovery, value: '' }
  ];
}

export async function cancelPasswordRecovery(req) {
  const data = readCookie(req);
  if (data?.type !== 'password_recovery') return;
  const key = 'portal:recovery:' + data.id, raw = await command('GET', key);
  if (raw) await command('CAS', key, raw, JSON.stringify({ ...JSON.parse(raw), completed: true, digest: '' }));
}
