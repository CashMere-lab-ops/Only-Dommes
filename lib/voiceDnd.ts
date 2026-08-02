/** Returns true if "now" falls inside creator DND window (local time).
 * Supports overnight ranges e.g. 22:00 → 08:00.
 */
export function isWithinVoiceDnd(
  enabled: boolean | null | undefined,
  start: string | null | undefined, // "HH:MM"
  end: string | null | undefined
): boolean {
  if (!enabled || !start || !end) return false;
  const parse = (t: string) => {
    const [h, m] = t.split(':').map((x) => parseInt(x, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };
  const s = parse(start);
  const e = parse(end);
  if (s === null || e === null) return false;

  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();

  if (s === e) return true; // 24h dnd
  if (s < e) {
    // same day e.g. 09:00–17:00
    return mins >= s && mins < e;
  }
  // overnight e.g. 22:00–08:00
  return mins >= s || mins < e;
}
