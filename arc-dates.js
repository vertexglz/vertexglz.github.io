// Calendar dates use UTC as a timezone-neutral representation; 'now' uses Moscow.
export const dateKey = (date) => date.toISOString().slice(0, 10);
export function addDays(date, amount) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}
export function getArcDates(now = new Date(), selectedDay = null) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type) => parts.find((item) => item.type === type).value;
  const today = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00Z`);
  const weekStart = addDays(today, 1 - (today.getUTCDay() || 7));
  const weekEnd = addDays(weekStart, 6);
  const center = selectedDay ? new Date(`${selectedDay}T00:00:00Z`) : today;
  const days = Array.from({ length: 7 }, (_, index) => addDays(center, index - 3));
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const from = dateKey(new Date(Math.min(monthStart, weekStart, days[0])));
  const to = dateKey(new Date(Math.max(weekEnd, days[6])));
  const nextMidnight = new Date(`${dateKey(addDays(today, 1))}T00:00:00+03:00`);
  return { today, center, days, weekStart, weekEnd, monthStart, from, to, nextMidnight };
}
