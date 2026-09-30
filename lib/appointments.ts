import { supabase } from "@/lib/supabase";

export type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";
export type PaymentStatus = "pending" | "awaiting_payment" | "paid" | "failed" | "refunded" | "partially_refunded" | null;

export interface Appointment {
  id: string;
  referenceNo: string;
  patient: string;
  email: string;
  phone: string;
  service: string;
  serviceCategory: string;
  visitKind: "standard" | "consultation_follow_up";
  parentAppointmentId: string | null;
  date: string;
  time: string;
  status: AppointmentStatus;
  paymentStatus: PaymentStatus;
  amount: number;
  notes: string;
}

export function appointmentStatusLabel(appointment: Pick<Appointment, "status" | "paymentStatus">) {
  if (appointment.status === "pending" && appointment.paymentStatus === "awaiting_payment") return "Awaiting payment";
  if (appointment.status === "no_show") return "No show";
  return appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1);
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export async function fetchAppointments() {
  const response = await fetch("/api/appointments", { headers: await authHeaders() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to load appointments.");
  return result.appointments as Appointment[];
}

export async function updateAppointmentStatus(id: string, status: AppointmentStatus) {
  const response = await fetch("/api/appointments", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ id, status }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to update the appointment.");
}

export async function cancelAppointment(id: string, reason: string) {
  const response = await fetch("/api/appointments", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ id, status: "cancelled", reason }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to cancel the appointment.");
}
