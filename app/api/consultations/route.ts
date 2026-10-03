import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { notifyConsultationFollowUpRecommended } from "@/lib/bookingNotifications";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
function admin() { if (!url || !serviceKey) throw new Error("Supabase is not configured."); return createClient(url, serviceKey, { auth: { persistSession: false } }); }
async function doctor(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !url || !anonKey) return null;
  const auth = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data } = await auth.auth.getUser(); if (!data.user) return null;
  const claimed = String(data.user.app_metadata?.role || "");
  if (["doctor", "superadmin"].includes(claimed)) return data.user;
  const { data: profile } = await admin().from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  return ["doctor", "superadmin"].includes(String(profile?.role)) ? data.user : null;
}

export async function GET(request: Request) {
  if (!await doctor(request)) return NextResponse.json({ error: "Doctor access is required." }, { status: 403 });
  const database = admin();
  const [charts, intakes] = await Promise.all([
    database.from("consultation_charts").select("appointment_id, clinical_assessment, subjective_notes, objective_notes, treatment_plan, follow_up_required, follow_up_recommended_date, follow_up_notes, follow_up_appointment_id, status, started_at, completed_at"),
    database.from("appointment_intakes").select("appointment_id, chief_concern, treatment_goals, allergies_snapshot, medications_snapshot, medical_history_snapshot, pregnancy_status, previous_reactions, recent_procedures, custom_answers, information_confirmed_at"),
  ]);
  if (charts.error || intakes.error) return NextResponse.json({ error: "Unable to load consultation charts." }, { status: 500 });
  return NextResponse.json({ charts: charts.data || [], intakes: intakes.data || [] });
}

export async function PATCH(request: Request) {
  const user = await doctor(request);
  if (!user) return NextResponse.json({ error: "Doctor access is required." }, { status: 403 });
  try {
    const body = await request.json();
    const appointmentId = String(body.appointmentId || "");
    const status = ["ready", "in_progress", "completed"].includes(body.status) ? body.status : "in_progress";
    const followUpRequired = body.followUpRequired === true;
    const followUpRecommendedDate = followUpRequired && /^\d{4}-\d{2}-\d{2}$/.test(String(body.followUpRecommendedDate || ""))
      ? String(body.followUpRecommendedDate)
      : null;
    const db = admin();
    const { data: appointment, error: appointmentError } = await db.from("appointments").select("id, client_id, status, services!inner(service_categories!inner(slug))").eq("id", appointmentId).single();
    if (appointmentError || !appointment) return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
    const appointmentService = Array.isArray(appointment.services) ? appointment.services[0] : appointment.services;
    const category = Array.isArray(appointmentService?.service_categories) ? appointmentService.service_categories[0] : appointmentService?.service_categories;
    if (category?.slug !== "consultations") return NextResponse.json({ error: "Treatments must be documented in the treatment workspace." }, { status: 409 });
    if (!["confirmed", "completed"].includes(appointment.status)) return NextResponse.json({ error: "Only confirmed appointments can be charted." }, { status: 409 });
    const { data: existingChart } = await db.from("consultation_charts").select("follow_up_appointment_id").eq("appointment_id", appointmentId).maybeSingle();
    if (existingChart?.follow_up_appointment_id && !followUpRequired) {
      return NextResponse.json({ error: "This recommendation already has a booked follow-up and cannot be removed." }, { status: 409 });
    }
    const now = new Date().toISOString();
    const { data, error } = await db.from("consultation_charts").upsert({
      appointment_id: appointmentId,
      client_id: appointment.client_id,
      doctor_id: user.id,
      clinical_assessment: String(body.clinicalAssessment || "").trim() || null,
      subjective_notes: String(body.subjectiveNotes || "").trim() || null,
      objective_notes: String(body.objectiveNotes || "").trim() || null,
      treatment_plan: String(body.treatmentPlan || "").trim() || null,
      follow_up_required: followUpRequired,
      follow_up_recommended_date: followUpRecommendedDate,
      follow_up_notes: followUpRequired ? String(body.followUpNotes || "").trim() || null : null,
      status,
      started_at: status !== "ready" ? now : null,
      completed_at: status === "completed" ? now : null,
      updated_at: now,
    }, { onConflict: "appointment_id" }).select().single();
    if (error) throw error;
    if (status === "completed") {
      await db.from("appointments").update({ status: "completed", completed_at: now }).eq("id", appointmentId).eq("status", "confirmed");
      if (followUpRequired) {
        try {
          await notifyConsultationFollowUpRecommended(db, appointmentId, followUpRecommendedDate, String(body.followUpNotes || "").trim());
        } catch (notificationError) {
          console.error("Unable to send the consultation follow-up recommendation:", notificationError);
        }
      }
    }
    return NextResponse.json({ chart: data });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to save the consultation chart." }, { status: 500 }); }
}
