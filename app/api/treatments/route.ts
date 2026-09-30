import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

function db() {
  if (!url || !service) throw new Error("Supabase is not configured.");
  return createClient(url, service, { auth: { persistSession: false } });
}

async function clinician(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !url || !anon) return null;
  const auth = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data } = await auth.auth.getUser();
  if (!data.user) return null;
  if (["doctor", "superadmin"].includes(String(data.user.app_metadata?.role || ""))) return data.user;
  const { data: profile } = await db().from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  return ["doctor", "superadmin"].includes(String(profile?.role)) ? data.user : null;
}

function first<T>(value: T | T[] | null | undefined) { return Array.isArray(value) ? value[0] : value; }
type CategoryRel = { slug: string };
type ServiceRel = { name: string; service_categories: CategoryRel | CategoryRel[] | null };
type ClientRel = { full_name: string; email: string | null; phone: string };
type AppointmentRow = { id: string; reference_no: string; appointment_date: string; appointment_time: string; status: string; service_id: string; clients: ClientRel | ClientRel[] | null; services: ServiceRel | ServiceRel[] | null; treatment_cases: Record<string, unknown>[] | null };

export async function GET(request: Request) {
  if (!await clinician(request)) return NextResponse.json({ error: "Doctor access is required." }, { status: 403 });
  try {
    const database = db();
    const [appointments, protocols] = await Promise.all([
      database.from("appointments").select("id, reference_no, appointment_date, appointment_time, status, service_id, clients(full_name, email, phone), services(name, service_categories(slug)), treatment_cases(*)").in("status", ["confirmed", "completed"]).order("appointment_date"),
      database.from("treatment_protocols").select("*").eq("is_active", true),
    ]);
    if (appointments.error || protocols.error) throw appointments.error || protocols.error;
    const cases = ((appointments.data || []) as unknown as AppointmentRow[])
      .filter((item) => first(first(item.services)?.service_categories)?.slug !== "consultations")
      .map((item) => ({
        appointmentId: item.id, referenceNo: item.reference_no, date: item.appointment_date,
        time: item.appointment_time.slice(0, 5), appointmentStatus: item.status,
        patient: first(item.clients)?.full_name || "Unknown patient", email: first(item.clients)?.email || "",
        phone: first(item.clients)?.phone || "", service: first(item.services)?.name || "Treatment",
        serviceId: item.service_id, case: item.treatment_cases?.[0] || null,
        protocol: (protocols.data || []).find((protocol) => protocol.service_id === item.service_id) || null,
      }));
    return NextResponse.json({ cases });
  } catch (error) {
    console.error("Unable to load treatment cases:", error);
    return NextResponse.json({ error: "Unable to load treatment cases." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await clinician(request);
  if (!user) return NextResponse.json({ error: "Doctor access is required." }, { status: 403 });
  try {
    const body = await request.json();
    const appointmentId = String(body.appointmentId || "");
    const database = db();
    const { data: appointment, error: appointmentError } = await database
      .from("appointments")
      .select("id, client_id, service_id, status, services!inner(service_categories!inner(slug))")
      .eq("id", appointmentId)
      .single();
    if (appointmentError || !appointment) return NextResponse.json({ error: "Treatment appointment not found." }, { status: 404 });
    const appointmentService = first(appointment.services);
    if (first(appointmentService?.service_categories)?.slug === "consultations") {
      return NextResponse.json({ error: "Consultations must be charted in the consultation workspace." }, { status: 409 });
    }
    if (!["confirmed", "completed"].includes(appointment.status)) return NextResponse.json({ error: "Only confirmed treatment appointments can be opened." }, { status: 409 });

    const step = Math.max(1, Math.min(4, Number(body.currentStep) || 1));
    const complete = body.status === "completed";
    const now = new Date().toISOString();
    if (step >= 3 && body.consentGiven !== true) return NextResponse.json({ error: "Patient consent is required before treatment." }, { status: 400 });
    if (complete && body.postcareGiven !== true) return NextResponse.json({ error: "Confirm that post-care instructions were provided." }, { status: 400 });

    const record = {
      appointment_id: appointmentId, client_id: appointment.client_id, service_id: appointment.service_id,
      doctor_id: user.id, status: complete ? "completed" : "in_progress", current_step: complete ? 4 : step,
      consultation_notes: null, consent_given: body.consentGiven === true,
      consent_signature_name: String(body.consentSignatureName || "").trim() || null,
      consent_version: String(body.consentVersion || "") || null,
      consent_text_snapshot: String(body.consentTextSnapshot || "") || null,
      consented_at: body.consentGiven ? now : null, consent_witnessed_by: body.consentGiven ? user.id : null,
      anesthesia_type: body.anesthesiaType || null, anesthesia_product: String(body.anesthesiaProduct || "").trim() || null,
      anesthesia_amount: String(body.anesthesiaAmount || "").trim() || null,
      anesthesia_applied_at: body.anesthesiaType && body.anesthesiaType !== "none" ? now : null,
      anesthesia_notes: String(body.anesthesiaNotes || "").trim() || null,
      procedure_details: body.procedureDetails || {}, procedure_notes: String(body.procedureNotes || "").trim() || null,
      procedure_started_at: step >= 3 ? now : null, procedure_completed_at: step >= 4 || complete ? now : null,
      postcare_instructions: String(body.postcareInstructions || "").trim() || null,
      postcare_given: body.postcareGiven === true, postcare_given_at: body.postcareGiven ? now : null,
      follow_up_required: false, follow_up_date: null, follow_up_time: null, follow_up_notes: null,
      completed_at: complete ? now : null, updated_at: now,
    };
    const saved = await database.from("treatment_cases").upsert(record, { onConflict: "appointment_id" }).select().single();
    if (saved.error) throw saved.error;
    if (complete) {
      const result = await database.from("appointments").update({ status: "completed", completed_at: now }).eq("id", appointmentId).eq("status", "confirmed");
      if (result.error) throw result.error;
    }
    return NextResponse.json({ case: saved.data });
  } catch (error) {
    console.error("Unable to save treatment workflow:", error);
    return NextResponse.json({ error: "Unable to save the treatment workflow." }, { status: 500 });
  }
}
