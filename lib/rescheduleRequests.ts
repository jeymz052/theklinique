import { supabase } from "@/lib/supabase";

export type RescheduleRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface RescheduleRequest {
  id: string;
  appointmentId: string;
  referenceNo: string;
  patient: string;
  service: string;
  currentDate: string;
  currentTime: string;
  requestedDate: string;
  requestedTime: string;
  reason: string;
  status: RescheduleRequestStatus;
  reviewNote: string;
  createdAt: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export async function fetchRescheduleRequests() {
  const response = await fetch("/api/reschedule-requests", { headers: await authHeaders() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to load reschedule requests.");
  return result.requests as RescheduleRequest[];
}

export async function createRescheduleRequest(appointmentId: string, requestedDate: string, requestedTime: string, reason: string) {
  const response = await fetch("/api/reschedule-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ appointmentId, requestedDate, requestedTime, reason }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to submit the reschedule request.");
  return result.request as RescheduleRequest;
}

export async function reviewRescheduleRequest(requestId: string, decision: "approved" | "rejected", reviewNote = "") {
  const response = await fetch("/api/reschedule-requests", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ requestId, decision, reviewNote }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to review the reschedule request.");
}
