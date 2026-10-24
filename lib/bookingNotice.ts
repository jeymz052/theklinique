type Related<T> = T | T[] | null | undefined;
type Service = { name: string; slug?: string; is_package?: boolean; service_categories?: Related<{ slug: string }> };
export type NoticeBooking = {
  consultation_mode?: string;
  visit_kind?: string;
  services: Related<Service>;
  products?: Related<{ name: string }>;
  appointment_services?: { services: Related<{ name: string }> }[];
  packageNames?: string[];
};
const first = <T,>(value: Related<T>) => Array.isArray(value) ? value[0] : value;

export function describeBooking(details: NoticeBooking) {
  const service = first(details.services), category = first(service?.service_categories)?.slug;
  const online = details.consultation_mode === "online" || service?.slug === "online-consultation";
  const consultation = online || category === "consultations" || ["consult-dr-kharyl", "follow-up-check-up"].includes(service?.slug || "");
  const packageOnly = !consultation && (category === "package-bookings" || service?.is_package || service?.slug === "glow-plans-package-booking");
  const packageNames = Array.from(new Set([...(details.packageNames || []), first(details.products)?.name].filter((value): value is string => Boolean(value))));
  const procedureNames = Array.from(new Set([!packageOnly ? service?.name : undefined, ...(details.appointment_services || []).map(item => first(item.services)?.name)].filter((value): value is string => Boolean(value))));
  const label = consultation ? `${online ? "Online" : "Clinic"}${details.visit_kind === "consultation_follow_up" ? " follow-up" : ""} consultation` : packageOnly ? "Package booking" : packageNames.length ? "Procedure & package booking" : "Procedure";
  const names = [...procedureNames, ...packageNames];
  if (!names.length && service?.name) names.push(service.name);
  return { label, summary: `${label}${names.length ? `: ${names.join("; ")}` : ""}`, online };
}

export function specificNotice(details: NoticeBooking, title: string, body: string) {
  const notice = describeBooking(details);
  return { title: title.startsWith(`${notice.label} · `) ? title : `${notice.label} · ${title}`, body: body.startsWith(`${notice.summary}. `) ? body : `${notice.summary}. ${body}` };
}
