import { sameOrigin } from '../lib/auth.mjs';
import { localizeResponse } from '../lib/locale.mjs';
import { requestPasswordRecovery, verifyPasswordRecovery } from '../lib/password-recovery.mjs';

export default async function handler(req, res) {
  localizeResponse(req, res);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed.' }); }
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Request origin not allowed.' });
  if (process.env.PORTAL_ACCOUNTS_ENABLED !== 'true' || !process.env.ARTIMEX_SESSION_SECRET) return res.status(503).json({ error: 'Account service unavailable. Contact Artimex.' });
  try {
    if (req.body?.action === 'request') return await requestPasswordRecovery(req, res);
    if (req.body?.action === 'verify') return await verifyPasswordRecovery(req, res);
    return res.status(400).json({ error: 'Invalid account action.' });
  } catch {
    return res.status(503).json({ error: 'Account service unavailable. Contact Artimex.' });
  }
}
