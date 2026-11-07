export const MINUTE = 60_000;
export const DAY = 86_400_000;

/** Fecha local en formato AAAA-MM-DD. Las estadísticas diarias usan la medianoche local. */
export function dayKey(d: Date | number = new Date()): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function startOfDay(d: Date | number): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date | number, n: number): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function endOfToday(now: Date | number = new Date()): Date {
  return addDays(now, 1);
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Texto corto para cuándo vuelve una tarjeta: "1 min", "10 min", "3 h", "1 día", "12 días", "2,5 meses". */
export function intervalLabel(due: Date, now: Date): string {
  const ms = due.getTime() - now.getTime();
  const min = Math.max(1, Math.round(ms / MINUTE));
  if (min < 60) return `${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 20) return `${hours} h`;
  const days = Math.max(1, Math.round(ms / DAY));
  if (days < 30) return plural(days, 'día', 'días');
  if (days < 365) {
    const months = Math.round((days / 30) * 10) / 10;
    return months === 1 ? '1 mes' : `${String(months).replace('.', ',')} meses`;
  }
  const years = Math.round((days / 365) * 10) / 10;
  return years === 1 ? '1 año' : `${String(years).replace('.', ',')} años`;
}
