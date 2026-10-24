import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { clinicalDatabase, clinicalUser } from "@/lib/clinicalServer";
import { validatePrescription, type PrescriptionContent } from "@/lib/consultation";
import { notifyPrescriptionReady, type ReadyPrescription } from "@/lib/bookingNotifications";

async function announcePrescription(db: ReturnType<typeof clinicalDatabase>, document: Parameters<typeof notifyPrescriptionReady>[1]) {
  if (!document?.released_to_patient) return;
  try { await notifyPrescriptionReady(db, document); }
  catch { console.error("Prescription was issued; its notification will be retried by the reminder job."); }
}

export async function GET(request: Request) {
  try {
    const auth = await clinicalUser(request);
    if (!auth) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    if (!auth.isDoctor && auth.role !== "patient") return NextResponse.json({ error: "Medical document access is restricted." }, { status: 403 });
    const db = clinicalDatabase();
    const params = new URL(request.url).searchParams;
    let query = db.from("medical_documents").select("*").order("issued_at", { ascending: false });
    if (!auth.isDoctor) {
      const { data, error } = await db.from("clients").select("id").eq("auth_user_id", auth.user.id);
      if (error) throw error;
      query = query.in("client_id", (data || []).map(row => row.id)).eq("released_to_patient", true);
    }
    if (params.get("id")) query = query.eq("id", params.get("id"));
    if (params.get("appointmentId")) query = query.eq("appointment_id", params.get("appointmentId"));
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ documents: data || [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Medical documents:", error);
    return NextResponse.json({ error: "Unable to load medical documents. Apply the online consultation migration first." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await clinicalUser(request);
    if (!auth?.isDoctor) return NextResponse.json({ error: "Doctor access is required to issue prescriptions." }, { status: 403 });
    const { appointmentId } = await request.json();
    if (typeof appointmentId !== "string") return NextResponse.json({ error: "Select a consultation." }, { status: 400 });
    const db = clinicalDatabase();
    const appointmentResult = await db.from("appointments").select("id, client_id, status, consultation_mode, clients(full_name, patient_no, date_of_birth, sex, address)").eq("id", appointmentId).single();
    const appointment = appointmentResult.data;
    if (appointmentResult.error || !appointment) return NextResponse.json({ error: "Consultation not found." }, { status: 404 });
    if (appointment.consultation_mode !== "online" || !["confirmed", "completed"].includes(appointment.status)) return NextResponse.json({ error: "Prescriptions can be issued for confirmed online consultations." }, { status: 409 });
    const [existing, chart, settings, clinic] = await Promise.all([
      db.from("medical_documents").select("*").eq("appointment_id", appointmentId).eq("document_type", "prescription").maybeSingle(),
      db.from("consultation_charts").select("prescription_draft, clinical_assessment, no_prescription_required").eq("appointment_id", appointmentId).maybeSingle(),
      db.from("consultation_settings").select("*").eq("id", 1).single(),
      db.from("clinic_settings").select("*").eq("id", 1).single(),
    ]);
    if (existing.error || chart.error || settings.error || clinic.error) throw existing.error || chart.error || settings.error || clinic.error;
    if (existing.data) {
      await announcePrescription(db, existing.data);
      return NextResponse.json({ document: existing.data });
    }
    if (!chart.data?.clinical_assessment?.trim() || chart.data.no_prescription_required) return NextResponse.json({ error: "Save the clinical assessment and prescription before issuing." }, { status: 409 });
    let prescription;
    try { prescription = validatePrescription(chart.data.prescription_draft); } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
    if (!prescription.medicines.length) return NextResponse.json({ error: "Add at least one medicine." }, { status: 400 });
    const s = settings.data, c = clinic.data;
    if (!s.signature_data_url || !s.prc_number || !c.doctor_name) return NextResponse.json({ error: "Set the doctor's signature and PRC license number in Settings → Online consultation first." }, { status: 409 });
    const patient = Array.isArray(appointment.clients) ? appointment.clients[0] : appointment.clients;
    if (!patient) throw new Error("Patient record missing.");
    const content: PrescriptionContent = {
      patient: { name: patient.full_name, patientNo: patient.patient_no || "", dateOfBirth: patient.date_of_birth || "", sex: patient.sex || "", address: patient.address || "" },
      prescriber: { name: c.doctor_name, specialty: s.specialty, prcNumber: s.prc_number, signatureDataUrl: s.signature_data_url },
      clinic: { name: c.clinic_name, address: [c.address, c.city, c.province].filter(Boolean).join(", "), phone: c.contact_phone, email: c.contact_email },
      prescription, appearance: { heading: s.prescription_heading, footer: s.prescription_footer, accentColor: s.accent_color },
    };
    const id = randomUUID();
    const { data, error } = await db.rpc("issue_consultation_prescription", { p_appointment_id: appointmentId, p_doctor_id: auth.user.id, p_id: id, p_content: content }).single();
    if (error?.code === "P0001") return NextResponse.json({ error: error.message }, { status: 409 });
    if (error) throw error;
    await announcePrescription(db, data as ReadyPrescription);
    return NextResponse.json({ document: data }, { status: 201 });
  } catch (error) {
    console.error("Issuing prescription:", error);
    return NextResponse.json({ error: "Unable to issue the prescription." }, { status: 500 });
  }
}
