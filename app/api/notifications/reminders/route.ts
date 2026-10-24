import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { clinicalDatabase } from "@/lib/clinicalServer";
import { dueReminders } from "@/lib/appointmentReminders";
import { notifyTimedReminder, notifyPrescriptionReady, type ReadyPrescription } from "@/lib/bookingNotifications";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`), actual = Buffer.from(request.headers.get("authorization") || "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const now = Date.now(), date = (value: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
  try {
    const db = clinicalDatabase();
    const { data, error } = await db.from("appointments").select("id,status,appointment_date,appointment_time,consultation_mode").eq("status", "confirmed").gte("appointment_date", date(now)).lte("appointment_date", date(now + 25 * 3_600_000)).order("appointment_date").order("appointment_time").limit(1000);
    if (error) throw error;
    const due = (data || []).flatMap(appointment => dueReminders(appointment, now).map(kind => ({ id: appointment.id, kind }))).sort((a, b) => (a.kind === "online15m" ? 0 : a.kind === "1h" ? 1 : 2) - (b.kind === "online15m" ? 0 : b.kind === "1h" ? 1 : 2));
    let processed = 0, failed = 0;
    for (const reminder of due) {
      if (Date.now() - now > 35_000) break;
      try { await notifyTimedReminder(db, reminder.id, reminder.kind, now); processed++; }
      catch { failed++; console.error("An appointment reminder could not be processed."); }
    }
    // Recover an alert if the issuing request stopped after committing the prescription.
    if (Date.now() - now < 35_000) {
      const documents = await db.from("medical_documents").select("id,reference_no,appointment_id,document_type,released_to_patient").eq("document_type", "prescription").eq("released_to_patient", true).gte("issued_at", new Date(now - 24 * 3_600_000).toISOString()).order("issued_at", { ascending: false }).limit(100);
      if (documents.error) throw documents.error;
      const rows = (documents.data || []) as ReadyPrescription[], events = rows.map(row => `prescription_ready:${row.id}`);
      if (events.length) {
        const [deliveries, notices] = await Promise.all([
          db.from("notification_deliveries").select("event,channel").in("event", events).eq("status", "sent"),
          db.from("app_notifications").select("event").in("event", events),
        ]);
        if (deliveries.error || notices.error) throw deliveries.error || notices.error;
        const complete = new Set((notices.data || []).map(row => row.event));
        const sent = new Set((deliveries.data || []).map(row => `${row.event}:${row.channel}`));
        for (const document of rows) {
          const event = `prescription_ready:${document.id}`;
          if (complete.has(event) && (!process.env.RESEND_API_KEY || sent.has(`${event}:email`))) continue;
          if (Date.now() - now > 35_000) break;
          try { await notifyPrescriptionReady(db, document); processed++; }
          catch { failed++; console.error("A prescription notification could not be processed."); }
        }
      }
    }
    return NextResponse.json({ ok: failed === 0, processed, failed, due: due.length }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to process reminders." }, { status: 500 });
  }
}
