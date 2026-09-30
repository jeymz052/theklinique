export const CLINIC_TIME_ZONE = "Asia/Manila";

export type SlotStatus = "available" | "unavailable" | "past";
export type BookingSlot = { time: string; label: string; status: SlotStatus };

export function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function normalizeTime(value: string) {
  return value.slice(0, 5);
}

export function formatSlotLabel(time: string) {
  const [hoursText, minutes] = normalizeTime(time).split(":");
  const hours = Number(hoursText);
  const period = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${minutes} ${period}`;
}

export function hourlyTimes(openTime: string, closeTime: string) {
  const [openHour, openMinute] = normalizeTime(openTime).split(":").map(Number);
  const [closeHour, closeMinute] = normalizeTime(closeTime).split(":").map(Number);
  const start = openHour * 60 + openMinute;
  const end = closeHour * 60 + closeMinute;
  const times: string[] = [];
  for (let minute = start; minute < end; minute += 60) {
    times.push(`${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
  }
  return times;
}

export function clinicNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${value.year}-${value.month}-${value.day}`, time: `${value.hour}:${value.minute}` };
}
