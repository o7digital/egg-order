import { randomUUID, createHash } from 'node:crypto';
import QRCode from 'qrcode';
import { command, audit } from './store.mjs';
import { session, sign, verify, checkPassword } from './auth.mjs';
import { profiles } from './profiles.mjs';
import { issueSession } from './mfa-session.mjs';
import { temporaryExpired } from './credentials.mjs';
import { totpPilot, authenticatorReady, newAuthenticator, encryptSeed, checkAuthenticator, newBackupCodes } from './totp-crypto.mjs';

const cookieName = 'artimex_totp_challenge';
export const clearAuthenticatorCookie = () => `${cookieName}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
const cookieToken = (req, name) => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1);
const sessionBinding = req => createHash('sha256').update(cookieToken(req, 'artimex_session') || '').digest('hex');
const error = (req, res, status, code, en, es) => res.status(status).json({ code, error: req.headers['x-portal-language'] === 'es' ? es : en });
const expired = (req, res) => error(req, res, 401, 'AUTHENTICATOR_EXPIRED', 'Verification expired. Sign in again.', 'La verificación venció. Inicie sesión de nuevo.');
const invalid = (req, res, locked = false) => error(req, res, locked ? 429 : 401, locked ? 'AUTHENTICATOR_LOCKED' : 'AUTHENTICATOR_INVALID', locked ? 'Too many attempts. Sign in again after 10 minutes.' : 'Invalid or already used code. Wait for a new code, or use an unused recovery code.', locked ? 'Demasiados intentos. Inicie sesión de nuevo después de 10 minutos.' : 'Código no válido o ya utilizado. Espere otro código o use un código de recuperación sin utilizar.');
async function rate(req, email, purpose, max) {
  const bucket = Math.floor(Date.now() / 600000);
  const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim().slice(0, 100);
  const [account, address] = await Promise.all([command('INCRTTL', `portal:totp-rate:${purpose}:${email}:${bucket}`, 660), command('INCRTTL', `portal:totp-ip:${purpose}:${ip}:${bucket}`, 660)]);
  return account <= max && address <= max * 5;
}
export async function activeState(email, credential) {
  const key = 'portal:totp:' + email, raw = await command('GET', key), record = raw && JSON.parse(raw);
  if (credential.authenticatorId && (!record?.enabled || record.id !== credential.authenticatorId) || record?.enabled && record.id !== credential.authenticatorId) throw Error('Authenticator state unavailable.');
  return { key, raw, record };
}

export async function authenticatorSettings(req, res) {
  const user = await session(req);
  if (!user) return error(req, res, 401, 'AUTHENTICATOR_SESSION', 'Sign in again to manage Google Authenticator.', 'Inicie sesión de nuevo para administrar Google Authenticator.');
  const accountKey = 'portal:account:' + user.email, accountRaw = await command('GET', accountKey), credential = accountRaw && JSON.parse(accountRaw);
  if (!credential || credential.mustChangePassword) return expired(req, res);
  const allowed = totpPilot(user.email) || !!credential.authenticatorId;
  if (!allowed) return req.method === 'GET' ? res.status(200).json({ available: false, enabled: false }) : error(req, res, 403, 'AUTHENTICATOR_PILOT', 'Google Authenticator is not enabled for this account pilot.', 'Google Authenticator no está habilitado para esta cuenta en la prueba piloto.');
  const state = await activeState(user.email, credential);
  if (req.method === 'GET') return res.status(200).json({ available: true, configured: authenticatorReady(), enabled: !!credential.authenticatorId, recoveryCodesRemaining: state.record?.enabled ? state.record.backupHashes.length : 0, enabledAt: state.record?.enabledAt || null });
  if (!authenticatorReady()) return error(req, res, 503, 'AUTHENTICATOR_UNAVAILABLE', 'Google Authenticator is temporarily unavailable. Contact IT.', 'Google Authenticator no está disponible temporalmente. Contacte a TI.');
  const action = req.body?.action;
  if (['authenticator-start', 'authenticator-disable', 'authenticator-backup'].includes(action)) {
    if (!await rate(req, user.email, 'manage', 10)) return invalid(req, res, true);
    if (typeof req.body.password !== 'string' || req.body.password.length > 256 || !checkPassword(req.body.password, credential)) return error(req, res, 400, 'AUTHENTICATOR_PASSWORD', 'Your current password is incorrect.', 'Su contraseña actual es incorrecta.');
  }
  if (action === 'authenticator-start') {
    const emailPilot = (process.env.ARTIMEX_EMAIL_2FA_USERS || '').split(',').map(e => e.trim().toLowerCase()).includes(user.email);
    if (emailPilot && verify(cookieToken(req, 'artimex_session'))?.mfa !== true) return error(req, res, 401, 'AUTHENTICATOR_REAUTH', 'Sign out and sign in with your email code before setting up Google Authenticator.', 'Cierre sesión e inicie sesión con su código de correo antes de configurar Google Authenticator.');
    if (credential.authenticatorId || state.record?.enabled) return error(req, res, 409, 'AUTHENTICATOR_ENABLED', 'Google Authenticator is already enabled.', 'Google Authenticator ya está habilitado.');
    const id = randomUUID(), totp = newAuthenticator(user.email), secret = totp.secret.base32, exp = Date.now() + 600000;
    const pending = { id, email: user.email, version: credential.version, binding: sessionBinding(req), encrypted: encryptSeed(secret, user.email, id), attempts: 0, exp };
    await command('SET', `portal:totp-enroll:${user.email}:${id}`, JSON.stringify(pending), 'EX', 600);
    await command('SET', 'portal:totp-enroll-current:' + user.email, id, 'EX', 600);
    const qrDataUrl = await QRCode.toDataURL(totp.toString(), { errorCorrectionLevel: 'M', margin: 4, width: 280 });
    await audit('authenticator_setup_started', user).catch(() => {});
    return res.status(200).json({ enrollmentId: id, secret, qrDataUrl, expiresIn: 600 });
  }
  if (action === 'authenticator-confirm' || action === 'authenticator-cancel') {
    const id = req.body.enrollmentId;
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) return expired(req, res);
    const key = `portal:totp-enroll:${user.email}:${id}`, raw = await command('GET', key), pending = raw && JSON.parse(raw);
    const currentKey = 'portal:totp-enroll-current:' + user.email, current = await command('GET', currentKey);
    if (!pending || pending.consumed || pending.exp <= Date.now() || pending.version !== credential.version || pending.binding !== sessionBinding(req) || current !== id) return expired(req, res);
    if (action === 'authenticator-cancel') {
      await command('CAS', key, raw, JSON.stringify({ ...pending, consumed: true, encrypted: null }));
      return res.status(200).json({ cancelled: true });
    }
    if (credential.authenticatorId || state.record?.enabled) return expired(req, res);
    if (pending.attempts >= 5 || !await rate(req, user.email, 'setup', 15)) return invalid(req, res, true);
    const verified = checkAuthenticator(pending, user.email, req.body.code);
    if (!verified) {
      if (!await command('CAS', key, raw, JSON.stringify({ ...pending, attempts: pending.attempts + 1 }))) return expired(req, res);
      return invalid(req, res, pending.attempts + 1 >= 5);
    }
    const backup = newBackupCodes(user.email, id), version = randomUUID(), enabledAt = new Date().toISOString();
    const record = { id, enabled: true, encrypted: pending.encrypted, lastStep: verified.lastStep, backupHashes: backup.hashes, enabledAt };
    const nextCredential = { ...credential, version, authenticatorId: id };
    const event = JSON.stringify({ id: randomUUID(), at: enabledAt, type: 'authenticator_enabled', email: user.email, restaurant: user.restaurant || '' });
    const changed = await command('MULTICAS', [
      { key: state.key, expected: state.raw, value: JSON.stringify(record) },
      { key: accountKey, expected: accountRaw, value: JSON.stringify(nextCredential) },
      { key, expected: raw, value: JSON.stringify({ ...pending, encrypted: null, consumed: true }) },
      { key: currentKey, expected: id, value: '' }
    ], event);
    if (!changed) return expired(req, res);
    return issueSession(res, user, version, false, true, true, id, { enabled: true, backupCodes: backup.codes });
  }
  if (['authenticator-disable', 'authenticator-backup'].includes(action)) {
    if (!credential.authenticatorId || !state.record?.enabled) return expired(req, res);
    if (!await rate(req, user.email, 'verify', 15)) return invalid(req, res, true);
    const next = checkAuthenticator(state.record, user.email, req.body.code, req.body.method === 'recovery' ? 'recovery' : 'totp');
    if (!next) return invalid(req, res);
    const version = randomUUID(), disabled = action === 'authenticator-disable';
    const backup = disabled ? null : newBackupCodes(user.email, state.record.id);
    const nextCredential = { ...credential, version };
    if (disabled) delete nextCredential.authenticatorId;
    const value = disabled ? { id: state.record.id, enabled: false, disabledAt: new Date().toISOString() } : { ...next, backupHashes: backup.hashes };
    const event = JSON.stringify({ id: randomUUID(), at: new Date().toISOString(), type: disabled ? 'authenticator_disabled' : 'authenticator_backup_regenerated', email: user.email, restaurant: user.restaurant || '' });
    if (!await command('MULTICAS', [{ key: state.key, expected: state.raw, value: JSON.stringify(value) }, { key: accountKey, expected: accountRaw, value: JSON.stringify(nextCredential) }], event)) return expired(req, res);
    return issueSession(res, user, version, false, true, true, disabled ? null : state.record.id, { enabled: !disabled, ...(backup ? { backupCodes: backup.codes } : {}) });
  }
  return error(req, res, 400, 'AUTHENTICATOR_ACTION', 'Invalid authenticator action.', 'Acción de autenticador no válida.');
}

export async function beginAuthenticatorChallenge(req, res, user, credential, change) {
  if (!authenticatorReady()) throw Error('Authenticator unavailable.');
  const { record } = await activeState(user.email, credential);
  const id = randomUUID(), exp = Date.now() + 300000;
  const challenge = { id, email: user.email, version: credential.version, authenticatorId: record.id, next: change ? 'password_change' : 'session', attempts: 0, exp };
  await command('SET', 'portal:totp-challenge:' + id, JSON.stringify(challenge), 'EX', 300);
  await command('SET', 'portal:totp-challenge-current:' + user.email, id, 'EX', 300);
  const token = sign({ type: 'totp_challenge', id, email: user.email, exp });
  res.setHeader('Set-Cookie', `${cookieName}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=300`);
  return res.status(200).json({ verificationRequired: true, verificationMethod: 'authenticator', challengeId: id, expiresIn: 300 });
}

export async function verifyAuthenticatorChallenge(req, res) {
  const token = verify(cookieToken(req, cookieName));
  if (token?.type !== 'totp_challenge' || token.id !== req.body?.challengeId) return expired(req, res);
  const user = (await profiles()).find(u => u.email === token.email && u.active !== false);
  if (!user) return expired(req, res);
  if (!await rate(req, user.email, 'verify', 15)) return invalid(req, res, true);
  const accountKey = 'portal:account:' + user.email, accountRaw = await command('GET', accountKey), credential = accountRaw && JSON.parse(accountRaw);
  if (!credential?.authenticatorId || temporaryExpired(credential)) return expired(req, res);
  const currentKey = 'portal:totp-challenge-current:' + user.email;
  if (await command('GET', currentKey) !== token.id) return expired(req, res);
  for (let attempt = 0; attempt < 8; attempt++) {
    const key = 'portal:totp-challenge:' + token.id, raw = await command('GET', key), challenge = raw && JSON.parse(raw);
    if (!challenge || challenge.consumed || challenge.exp <= Date.now() || challenge.email !== user.email || challenge.version !== credential.version || challenge.authenticatorId !== credential.authenticatorId) return expired(req, res);
    if (challenge.attempts >= 5) return invalid(req, res, true);
    const state = await activeState(user.email, credential);
    const method = req.body.method === 'recovery' ? 'recovery' : 'totp';
    const verified = checkAuthenticator(state.record, user.email, req.body.code, method);
    if (!verified) {
      if (!await command('CAS', key, raw, JSON.stringify({ ...challenge, attempts: challenge.attempts + 1 }))) continue;
      await audit('authenticator_code_failed', user).catch(() => {});
      return invalid(req, res, challenge.attempts + 1 >= 5);
    }
    if ((challenge.next === 'password_change') !== !!credential.mustChangePassword) return expired(req, res);
    const event = JSON.stringify({ id: randomUUID(), at: new Date().toISOString(), type: 'authenticator_verified', email: user.email, restaurant: user.restaurant || '', method });
    if (!await command('MULTICAS', [
      { key: state.key, expected: state.raw, value: JSON.stringify(verified) },
      { key, expected: raw, value: JSON.stringify({ ...challenge, consumed: true }) },
      { key: accountKey, expected: accountRaw, value: accountRaw },
      { key: currentKey, expected: token.id, value: '' }
    ], event)) continue;
    await audit(credential.mustChangePassword ? 'temporary_login' : 'login', user).catch(() => {});
    return issueSession(res, user, credential.version, credential.mustChangePassword, true, true, credential.authenticatorId);
  }
  return error(req, res, 409, 'AUTHENTICATOR_CONFLICT', 'Verification changed. Sign in again.', 'La verificación cambió. Inicie sesión de nuevo.');
}

export async function cancelAuthenticatorChallenge(req) {
  const token = verify(cookieToken(req, cookieName));
  if (token?.type !== 'totp_challenge') return;
  const key = 'portal:totp-challenge:' + token.id, raw = await command('GET', key);
  if (raw) await command('CAS', key, raw, JSON.stringify({ ...JSON.parse(raw), consumed: true }));
}
