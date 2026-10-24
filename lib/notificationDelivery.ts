import type { SupabaseClient } from "@supabase/supabase-js";

// The unique database key reserves each recipient/event before contacting a provider.
// Resend also deduplicates retries if a server stops after the provider accepts it.
export async function reserveDelivery(db: SupabaseClient, appointmentId: string, channel: "email" | "sms", event: string, recipient: string) {
  const inserted = await db.from("notification_deliveries").insert({ appointment_id: appointmentId, channel, event, recipient }).select("id").single();
  if (!inserted.error) return inserted.data.id as string;
  if (inserted.error.code !== "23505") throw inserted.error;
  const existing = await db.from("notification_deliveries").select("id,status,created_at").eq("appointment_id", appointmentId).eq("channel", channel).eq("event", event).eq("recipient", recipient).maybeSingle();
  if (existing.error) throw existing.error;
  const row = existing.data;
  if (!row || row.status === "sent") return null;
  // Never retry an ambiguous SMS automatically: Semaphore has no idempotency key.
  const staleEmail = channel === "email" && row.status === "processing" && Date.now() - Date.parse(row.created_at) > 60_000;
  if (channel === "email" && row.status === "processing" && !staleEmail) throw new Error("This email is still processing. Try again shortly.");
  if (row.status !== "failed" && !staleEmail) return null;
  const claimed = await db.from("notification_deliveries").update({ status: "processing", error_message: null, created_at: new Date().toISOString() }).eq("id", row.id).eq("status", row.status).eq("created_at", row.created_at).select("id").maybeSingle();
  if (claimed.error) throw claimed.error;
  return claimed.data?.id as string | undefined;
}

export async function finishDelivery(db: SupabaseClient, id: string, status: "sent" | "failed", providerId?: string, errorMessage?: string) {
  const { error } = await db.from("notification_deliveries").update({ status, provider_id: providerId || null, error_message: errorMessage || null, sent_at: status === "sent" ? new Date().toISOString() : null }).eq("id", id);
  if (error) throw error;
}

export async function deliverEmail(db: SupabaseClient, input: { appointmentId: string; event: string; to: string; subject: string; html: string; attachments?: { filename: string; content: string }[] }) {
  const apiKey = process.env.RESEND_API_KEY, from = process.env.RESEND_FROM;
  if (!apiKey || !from) throw new Error("Email delivery is not configured.");
  const id = await reserveDelivery(db, input.appointmentId, "email", input.event, input.to.toLowerCase());
  if (!id) return { queued: false };
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `notification-${id}` }, signal: AbortSignal.timeout(12_000), body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html, ...(input.attachments ? { attachments: input.attachments } : {}) }) });
    const result = await response.json();
    if (!response.ok || !result.id) throw new Error(result?.message || "Email delivery was rejected.");
    await finishDelivery(db, id, "sent", result.id);
    return { queued: true };
  } catch (error) {
    await finishDelivery(db, id, "failed", undefined, error instanceof Error ? error.message : "Email delivery failed.");
    throw error;
  }
}
