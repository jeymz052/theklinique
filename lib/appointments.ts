import { supabase } from "@/lib/supabase";

export type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled";

export interface Appointment {
  id: string;
  referenceNo: string;
  patient: string;
  email: string;
  phone: string;
  service: string;
  date: string;
  time: string;
  status: AppointmentStatus;
  amount: number;
  notes: string;
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
