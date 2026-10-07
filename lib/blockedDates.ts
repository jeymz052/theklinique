export type PublicBlockedDate = { blocked_date: string; reason: string | null };
export type BlockedDatePeriod = { start: string; end: string; reason: string | null };

function dateValue(value: string) { return new Date(`${value}T00:00:00`); }
function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function groupBlockedDates(blocks: PublicBlockedDate[]): BlockedDatePeriod[] {
  return [...blocks].sort((a, b) => a.blocked_date.localeCompare(b.blocked_date)).reduce<BlockedDatePeriod[]>((periods, block) => {
    const previous = periods.at(-1);
    const next = previous ? dateValue(previous.end) : null;
    next?.setDate(next.getDate() + 1);
    if (previous && next && dateKey(next) === block.blocked_date && previous.reason === block.reason) previous.end = block.blocked_date;
    else periods.push({ start: block.blocked_date, end: block.blocked_date, reason: block.reason });
    return periods;
  }, []);
}

export function blockedDateAnnouncement(period: BlockedDatePeriod) {
  return `Dr. Kharyl is not available ${period.start === period.end ? "on" : "from"} ${blockedDatePeriodLabel(period)}${period.reason ? `. Reason: ${period.reason}` : ""}.`;
}

export function blockedDatePeriodLabel(period: BlockedDatePeriod) {
  const start = dateValue(period.start), end = dateValue(period.end);
  const full = (date: Date) => date.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
  if (period.start === period.end) return full(start);
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${start.toLocaleDateString("en-PH", { month: "long", day: "numeric" })}–${end.getDate()}, ${end.getFullYear()}`;
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${start.toLocaleDateString("en-PH", { month: "long", day: "numeric" })}–${end.toLocaleDateString("en-PH", { month: "long", day: "numeric" })}, ${end.getFullYear()}`;
  }
  return `${full(start)}–${full(end)}`;
}
