import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scryptSync, randomUUID } from 'node:crypto';
import recovery from '../api/password-recovery.mjs';
import account from '../api/account.mjs';
import loginSession from '../api/session.mjs';
import { command } from '../lib/store.mjs';
import { session, sign, checkPassword } from '../lib/auth.mjs';
import { directory } from '../lib/directory.mjs';
import { PRIVACY_VERSION, PRIVACY_HASH } from '../lib/privacy.mjs';

const folder = await mkdtemp(join(tmpdir(), 'artimex-recovery-'));
const port = 24000 + Math.floor(Math.random() * 15000), email = 'olivier.steineur@gmail.com';
const database = join(folder, 'portal.sqlite3'), capture = join(folder, 'mail.jsonl'), config = join(folder, 'mail.json');
await writeFile(config, JSON.stringify({ from: 'no-reply@o7digitalgroup.com', recipients: [email], host: '127.0.0.1', port: port + 1 }));
Object.assign(process.env, { ARTIMEX_SESSION_SECRET: 'recovery-test-secret', PORTAL_ACCOUNTS_ENABLED: 'true', PORTAL_STORE_URL: `http://127.0.0.1:${port}`, PORTAL_STORE_TOKEN: 'test', ARTIMEX_EMAIL_2FA_USERS: email });
const smtp = spawn('python3', ['scripts/smtp-fixture.py'], { env: { ...process.env, SMTP_PORT: String(port + 1), SMTP_CAPTURE: capture }, stdio: 'ignore' });
const store = spawn('python3', ['ops/store.py'], { env: { ...process.env, PORTAL_PORT: String(port), PORTAL_DB_PATH: database, PORTAL_MAIL_CONFIG: config }, stdio: 'ignore' });
const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(v) { this.body = v; return this; } });
const invoke = async (handler, body, headers = {}, method = 'POST') => { const res = response(); await handler({ method, headers, body }, res); return res; };
const cookies = res => [res.headers['Set-Cookie']].flat().filter(Boolean).map(v => v.split(';')[0]).join('; ');
const mail = async () => { try { return (await readFile(capture, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse); } catch { return []; } };
const latestCode = async () => (await mail()).filter(m => /reset code|restablecer la contraseña/.test(m.text)).at(-1).text.match(/\b\d{6}\b/)[0];
const acknowledgment = { acknowledged: true, language: 'en', version: PRIVACY_VERSION, hash: PRIVACY_HASH };
const resetLimits = async (address = email) => {
  const bucket = Math.floor(Date.now() / 600000);
  await command('SET', `portal:recovery-send:${address}:${bucket}`, '0');
  await command('SET', `portal:recovery-ip:unknown:${bucket}`, '0');
};
const seed = async (address = email, mustChangePassword = false) => {
  const record = { salt: 'qa', hash: scryptSync('Existing-personal-password', 'qa', 64).toString('hex'), version: randomUUID(), mustChangePassword, expiresAt: mustChangePassword ? 1 : null };
  await command('SET', 'portal:account:' + address, JSON.stringify(record));
  return record;
};
const request = address => invoke(recovery, { action: 'request', email: address || email });
const verifyCode = (res, code) => invoke(recovery, { action: 'verify', challengeId: res.body.challengeId, code }, { cookie: cookies(res) });
const change = (res, password = 'New-personal-password', privacyAcknowledgment = acknowledgment) => invoke(account, { action: 'change-password', newPassword: password, privacyAcknowledgment }, { cookie: cookies(res) });
const ttl = id => Number(execFileSync('python3', ['-c', 'import sqlite3,sys,time; r=sqlite3.connect(sys.argv[1]).execute("SELECT expires FROM kv WHERE key=?",(sys.argv[2],)).fetchone(); print(int(r is not None and r[0] is not None and r[0]>time.time()))', database, 'portal:recovery:' + id], { encoding: 'utf8' }).trim());

try {
  let ready = false;
  for (let i = 0; i < 100; i++) { try { await command('GET', 'portal:health'); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 50)); } }
  assert(ready);
  await command('SET', 'portal:profiles', JSON.stringify(directory.map(u => ({ ...u, active: true }))));
  const original = await seed();
  const oldSession = { cookie: 'artimex_session=' + sign({ type: 'session', email, version: original.version, exp: Date.now() + 600000 }) };

  assert.equal((await invoke(recovery, {}, {}, 'GET')).code, 405);
  assert.equal((await invoke(recovery, { action: 'request', email }, { host: 'portal.local', origin: 'https://attacker.invalid' })).code, 403);
  assert.equal((await request('bad-address')).code, 400);
  const missing = await request('missing@example.invalid');
  assert.equal(missing.code, 200); assert.equal((await mail()).length, 0);
  let requested = await request();
  assert.equal(requested.code, 200); assert.equal(requested.body.message, missing.body.message);
  assert.deepEqual(Object.keys(requested.body), Object.keys(missing.body));
  assert.equal((await session({ headers: oldSession })).email, email, 'Requesting recovery must not revoke existing access');
  assert.equal(JSON.parse(await command('GET', 'portal:account:' + email)).version, original.version);
  assert.equal((await session({ headers: { cookie: cookies(requested) } })), null);
  const code = await latestCode(), record = JSON.parse(await command('GET', 'portal:recovery:' + requested.body.challengeId));
  assert.equal(record.digest.length, 64); assert(!JSON.stringify(record).includes(code)); assert.equal(ttl(requested.body.challengeId), 1);
  assert.equal((await verifyCode(requested, '000000')).code, 401);
  assert.equal(ttl(requested.body.challengeId), 1, 'Wrong guesses must keep storage expiry');
  const verified = await verifyCode(requested, code);
  assert.equal(verified.code, 200); assert(verified.body.recovery);
  assert.equal(ttl(requested.body.challengeId), 1, 'Atomic verification must keep storage expiry');
  assert.equal(await session({ headers: { cookie: cookies(verified) } }), null, 'Recovery only grants password-change access');
  assert.equal((await verifyCode(requested, code)).code, 401, 'Code cannot be replayed');
  assert.equal((await change(verified, 'short')).code, 400);
  assert.equal((await change(verified, 'Existing-personal-password')).code, 400);
  assert.equal((await change(verified, 'New-personal-password', null)).code, 422);
  const results = await Promise.all([change(verified), change(verified)]);
  assert.equal(results.filter(r => r.code === 200).length, 1, 'Concurrent resets may only consume one grant');
  const completed = results.find(r => r.code === 200);
  assert(completed.body.passwordReset); assert.equal(await session({ headers: { cookie: cookies(completed) } }), null);
  assert.equal(await session({ headers: oldSession }), null, 'Saving the password revokes previous sessions');
  assert(checkPassword('New-personal-password', JSON.parse(await command('GET', 'portal:account:' + email))));
  assert.equal((await change(verified, 'Another-personal-password')).code, 401);
  assert((await mail()).some(m => m.subject === 'Artimex — Password changed' && !m.text.includes('New-personal-password')));
  const login = await invoke(account, { email, password: 'New-personal-password' });
  assert(login.body.verificationRequired, 'Recovery must preserve the account’s normal MFA enrollment');
  assert.equal(JSON.parse(await command('GET', 'portal:privacy:' + email)).method, 'password_recovery');

  await resetLimits(); requested = await request(); const oldCode = await latestCode();
  const newer = await request(); const newCode = await latestCode();
  assert.equal((await verifyCode(requested, oldCode)).code, 401, 'Resending invalidates the old code');
  const concurrent = await Promise.all([verifyCode(newer, newCode), verifyCode(newer, newCode)]);
  assert.equal(concurrent.filter(r => r.code === 200).length, 1);
  const oldGrant = concurrent.find(r => r.code === 200);
  await request();
  assert.equal((await change(oldGrant)).code, 401, 'Resending also invalidates an already verified grant');

  await resetLimits(); requested = await request(); const lockedCode = await latestCode();
  for (let i = 0; i < 5; i++) assert.equal((await verifyCode(requested, '000000')).code, i === 4 ? 429 : 401);
  assert.equal((await verifyCode(requested, lockedCode)).code, 429);
  await resetLimits(); requested = await request(); const staleCode = await latestCode();
  await seed(); assert.equal((await verifyCode(requested, staleCode)).code, 401, 'An administrative reset invalidates outstanding recovery');
  await resetLimits(); requested = await request(); const canceledCode = await latestCode();
  await invoke(loginSession, null, { cookie: cookies(requested) }, 'DELETE');
  assert.equal((await verifyCode(requested, canceledCode)).code, 401);
  await resetLimits(); requested = await request(); const expiredCode = await latestCode();
  const key = 'portal:recovery:' + requested.body.challengeId, expired = JSON.parse(await command('GET', key));
  await command('SET', key, JSON.stringify({ ...expired, exp: Date.now() - 1 }));
  assert.equal((await verifyCode(requested, expiredCode)).code, 401);

  await resetLimits(); const beforeLimit = (await mail()).length;
  for (let i = 0; i < 4; i++) assert.equal((await request()).code, 200);
  assert.equal((await mail()).length, beforeLimit + 3, 'Account email flooding is limited without revealing account state');
  await command('SET', `portal:recovery-ip:unknown:${Math.floor(Date.now() / 600000)}`, '20');
  assert.equal((await request()).code, 429);

  const other = 'christian.garcia@gallogiro.com'; await seed(other, true); await resetLimits(other);
  requested = await request(other); assert.equal((await mail()).at(-1).to, other, 'Recovery is available outside the MFA pilot');
  const otherVerified = await verifyCode(requested, await latestCode()); assert.equal(otherVerified.code, 200, 'An expired temporary password must not block mailbox recovery');
  assert.equal((await change(otherVerified)).code, 200);
  const otherLogin = await invoke(account, { email: other, password: 'New-personal-password' });
  assert.equal(otherLogin.code, 200); assert(!otherLogin.body.verificationRequired, 'Recovery does not enroll other users in MFA');
  await assert.rejects(command('SENDOTP', other, '123456', 'en', 'login'), 'MFA recipient allowlist remains separate');
  await assert.rejects(command('SENDRECOVERY', 'unapproved@example.invalid', '123456', 'en', 'reset'));
  const profileList = JSON.parse(await command('GET', 'portal:profiles')).map(u => u.email === other ? { ...u, active: false } : u);
  await command('SET', 'portal:profiles', JSON.stringify(profileList)); await resetLimits(other);
  const beforeDisabled = (await mail()).length, disabled = await request(other);
  assert.equal(disabled.body.message, missing.body.message); assert.equal((await mail()).length, beforeDisabled);
  assert.equal((await verifyCode(disabled, '123456')).code, 401);
  await resetLimits();
  await writeFile(config, JSON.stringify({ from: 'no-reply@o7digitalgroup.com', recipients: [email], host: '127.0.0.1', port: port + 2 }));
  const unavailable = await request(); assert.equal(unavailable.body.message, missing.body.message, 'Mail failure cannot disclose account state');
  const events = (await command('LRANGE', 'portal:events', 0, 100)).map(JSON.parse);
  assert(events.some(e => e.type === 'password_recovery_completed'));
  assert(events.every(e => !JSON.stringify(e).includes('New-personal-password') && !Object.hasOwn(e, 'code')));
  console.log('Password recovery passed with real SQLite + SMTP: neutral responses, active-account delivery, separate MFA pilot, restricted grants, code expiry/guess limits, resend/cancel/version invalidation, concurrent single use, privacy validation, notification, session revocation and email/IP rate limits.');
} finally {
  store.kill(); smtp.kill();
  await Promise.all([store.exitCode === null ? new Promise(resolve => store.once('exit', resolve)) : null, smtp.exitCode === null ? new Promise(resolve => smtp.once('exit', resolve)) : null]);
  await rm(folder, { recursive: true, force: true });
}
