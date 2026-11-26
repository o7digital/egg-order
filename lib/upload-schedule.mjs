export const SCHEDULE_TIMEZONE = 'America/Los_Angeles';
const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: SCHEDULE_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function localStamp(value = Date.now()) {
  const p = Object.fromEntries(formatter.formatToParts(new Date(value)).map(p => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const addDays = (date, count) => new Date(Date.parse(date + 'T12:00:00Z') + count * 86400000).toISOString().slice(0, 10);
export const weekday = date => new Date(date + 'T12:00:00Z').getUTCDay() || 7;
export const weekStart = date => addDays(date, 1 - weekday(date));
export function planOnDate(plan, date) {
  return plan?.revisions?.filter(r => r.effectiveFrom <= date).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.createdAt.localeCompare(b.createdAt)).at(-1) || null;
}

export function buildScheduleReport(locations, plans, events, { from, to, now = Date.now(), historyLimited = false, historyStartDate = null } = {}) {
  const stamp = localStamp(now), today = stamp.slice(0, 10), byDay = new Map(), seen = new Set();
  let oldest = historyStartDate;
  for (const e of events) {
    if (!Number.isFinite(Date.parse(e.at))) continue;
    const local = localStamp(e.at), date = local.slice(0, 10);
    if (!oldest || date < oldest) oldest = date;
    if (e.type !== 'upload' || date < from || date > to) continue;
    const identity = e.filename || e.id;
    if (identity && seen.has(identity)) continue;
    if (identity) seen.add(identity);
    const key = e.restaurant + ':' + date, uploads = byDay.get(key) || [];
    uploads.push({ id: e.id, at: e.at, localTime: local.slice(11), filename: e.originalFilename || e.filename || '', receiptFilename: e.filename || '', rows: e.rows ?? null, email: e.email || '' });
    byDay.set(key, uploads);
  }
  const rows = locations.map(location => {
    const plan = plans[location.id], days = [];
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const revision = planOnDate(plan, date), deadline = revision ? date + 'T' + revision.cutoff : null;
      // A new plan cannot create a missed deadline that preceded its creation.
      const scheduled = !!revision && revision.days.includes(weekday(date)) && deadline >= localStamp(revision.createdAt);
      const uploads = (byDay.get(location.name + ':' + date) || []).sort((a, b) => a.at.localeCompare(b.at));
      const complete = !historyLimited || !!oldest && date > oldest;
      let status = !revision ? 'unconfigured' : 'not_scheduled';
      if (scheduled) {
        if (uploads.length) status = uploads[0].localTime <= revision.cutoff ? 'received' : complete ? 'late' : 'unverified';
        else status = stamp <= deadline ? (date === today ? 'due_today' : 'upcoming') : complete ? 'missing' : 'unverified';
      } else if (uploads.length) status = 'extra';
      days.push({ date, scheduled, cutoff: scheduled ? revision.cutoff : null, status, uploads });
    }
    const count = status => days.filter(d => d.status === status).length;
    const expected = days.filter(d => d.scheduled).length, received = count('received'), late = count('late'), missing = count('missing');
    const settled = received + late + missing;
    return { id: location.id, restaurant: location.name, configured: !!plan, days, expected, received, late, missing, upcoming: count('upcoming') + count('due_today'), unverified: count('unverified'), extraFiles: days.filter(d => !d.scheduled).reduce((n, d) => n + d.uploads.length, 0), files: days.reduce((n, d) => n + d.uploads.length, 0), onTimeRate: settled ? Math.round(received / settled * 100) : null };
  });
  const summary = Object.fromEntries(['expected', 'received', 'late', 'missing', 'upcoming', 'unverified', 'extraFiles', 'files'].map(key => [key, rows.reduce((n, row) => n + row[key], 0)]));
  const settled = summary.received + summary.late + summary.missing;
  return { rows, summary: { ...summary, configured: rows.filter(r => r.configured).length, locations: rows.length, onTimeRate: settled ? Math.round(summary.received / settled * 100) : null }, from, to, today, timeZone: SCHEDULE_TIMEZONE, historyLimited };
}
