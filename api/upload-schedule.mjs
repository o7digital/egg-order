import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { session, sameOrigin } from '../lib/auth.mjs';
import { command } from '../lib/store.mjs';
import { buildScheduleReport, localStamp, validDate, addDays, weekStart, SCHEDULE_TIMEZONE } from '../lib/upload-schedule.mjs';
const locations = JSON.parse(readFileSync(new URL('../assets/restaurants.json', import.meta.url), 'utf8'));
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const es = req.headers['x-portal-language'] === 'es';
  const error = (status, en, spanish) => res.status(status).json({ error: es ? spanish : en });
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return error(405, 'Method not allowed.', 'Método no permitido.'); }
  if (req.method === 'POST' && !sameOrigin(req)) return error(403, 'Request origin not allowed.', 'Origen de solicitud no permitido.');
  const user = await session(req);
  if (!user) return error(401, 'Sign in to view your order calendar.', 'Inicie sesión para ver su calendario de pedidos.');
  const allowed = locations.filter(l => user.role === 'superuser' || user.role === 'manager' && (user.restaurants || [user.restaurant]).includes(l.name));
  const now = Date.now(), today = localStamp(now).slice(0, 10);
  try {
    if (req.method === 'POST') {
      const location = allowed.find(l => l.id === req.body?.restaurantId);
      if (!location) return error(403, 'You can only edit your assigned restaurants.', 'Solo puede editar sus restaurantes asignados.');
      const key = 'portal:upload-plan:' + location.id, raw = await command('GET', key), stored = raw && JSON.parse(raw);
      const { days, cutoff, effectiveFrom, version } = req.body;
      if (version !== (stored?.version || null)) return error(409, 'The plan changed. Refresh before saving again.', 'El plan cambió. Actualice antes de guardarlo de nuevo.');
      if (!Array.isArray(days) || ![2, 3].includes(days.length) || new Set(days).size !== days.length || days.some(d => !Number.isInteger(d) || d < 1 || d > 7)) return error(400, 'Choose two or three different upload days.', 'Elija dos o tres días de envío diferentes.');
      if (typeof cutoff !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff)) return error(400, 'Choose a valid cutoff time.', 'Elija una hora límite válida.');
      const minimum = stored ? addDays(today, 1) : today;
      if (!validDate(effectiveFrom) || effectiveFrom < minimum) return error(400, stored ? 'Plan changes start tomorrow or later to preserve past reports.' : 'Choose today or a future start date.', stored ? 'Los cambios empiezan mañana o después para conservar los reportes anteriores.' : 'Elija hoy o una fecha futura de inicio.');
      const revision = { id: randomUUID(), days: [...days].sort((a, b) => a - b), cutoff, effectiveFrom, createdAt: new Date(now).toISOString(), updatedBy: user.email };
      const value = { restaurantId: location.id, version: randomUUID(), revisions: [...(stored?.revisions || []).filter(r => r.effectiveFrom < effectiveFrom), revision] };
      const event = JSON.stringify({ id: randomUUID(), at: revision.createdAt, type: 'upload_plan_updated', email: user.email, restaurant: location.name, before: stored?.revisions.at(-1) || null, after: revision });
      if (!await command('MULTICAS', [{ key, expected: raw, value: JSON.stringify(value) }], event)) return error(409, 'The plan changed. Refresh before saving again.', 'El plan cambió. Actualice antes de guardarlo de nuevo.');
      return res.status(200).json({ ok: true, version: value.version });
    }
    const query = new URL(req.url || '/api/upload-schedule', 'https://portal.local').searchParams;
    const from = query.get('from') || weekStart(today), to = query.get('to') || (validDate(from) ? addDays(from, 6) : ''), requested = query.get('restaurant') || '';
    if (!validDate(from) || !validDate(to) || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 92) return error(400, 'Choose a valid period of up to 93 days.', 'Elija un período válido de hasta 93 días.');
    if (requested && !allowed.some(l => l.id === requested)) return error(403, 'You can only view your assigned restaurants.', 'Solo puede ver sus restaurantes asignados.');
    const selected = allowed.filter(l => !requested || l.id === requested), plans = {};
    await Promise.all(selected.map(async l => { const raw = await command('GET', 'portal:upload-plan:' + l.id); plans[l.id] = raw ? JSON.parse(raw) : null; }));
    const allEvents = (await command('LRANGE', 'portal:events', 0, 9999)).map(JSON.parse);
    const events = allEvents.filter(e => user.role === 'superuser' || allowed.some(l => l.name === e.restaurant));
    const historyStartDate = allEvents.filter(e => Number.isFinite(Date.parse(e.at))).map(e => localStamp(e.at).slice(0, 10)).sort()[0] || null;
    const report = buildScheduleReport(selected, plans, events, { from, to, now, historyLimited: allEvents.length === 10000, historyStartDate });
    return res.status(200).json({ ...report, generatedAt: new Date(now).toISOString(), timeZone: SCHEDULE_TIMEZONE, locations: allowed, plans: selected.map(l => ({ restaurantId: l.id, version: plans[l.id]?.version || null, configuration: plans[l.id]?.revisions.at(-1) || null, minEffectiveDate: plans[l.id] ? addDays(today, 1) : today })) });
  } catch { return error(503, 'The order calendar is unavailable. Please try again.', 'El calendario de pedidos no está disponible. Inténtelo de nuevo.'); }
}
