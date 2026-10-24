import { NextResponse } from "next/server";
import { clinicalDatabase, clinicalUser } from "@/lib/clinicalServer";
import { validateTreatmentStep, type TreatmentForm, type TreatmentProtocol } from "@/lib/treatment";
import { validClinicalDate } from "@/lib/patientProgress";

function first<T>(value: T | T[] | null | undefined) { return Array.isArray(value) ? value[0] : value; }
const privateHeaders = { "Cache-Control": "private, no-store" };
type AppointmentRow = { id: string; client_id: string; reference_no: string; appointment_date: string; appointment_time: string; status: string; service_id: string; clients: { full_name: string; email: string; phone: string } | null; services: { name: string; service_categories: { slug: string } | null } | null; products: { name: string } | null; treatment_cases: Record<string, unknown>[]; appointment_intakes: Record<string, unknown>[] };

export async function GET(request: Request) {
  try {
    const auth = await clinicalUser(request);
    if (!auth) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    if (!auth.isDoctor) return NextResponse.json({ error: "Doctor access is required." }, { status: 403 });
    const database = clinicalDatabase();
    const [appointments, protocols] = await Promise.all([
      database.from("appointments").select("id, client_id, reference_no, appointment_date, appointment_time, status, service_id, clients(full_name, email, phone), services(name, service_categories(slug)), products(name), treatment_cases(*), appointment_intakes(*)").in("status", ["confirmed", "completed"]).order("appointment_date"),
      database.from("treatment_protocols").select("*").eq("is_active", true),
    ]);
    if (appointments.error || protocols.error) throw appointments.error || protocols.error;
    const cases = ((appointments.data || []) as unknown as AppointmentRow[])
      .filter(item => first(first(item.services)?.service_categories)?.slug !== "consultations")
      .map(item => ({
        appointmentId: item.id, clientId: item.client_id, referenceNo: item.reference_no, date: item.appointment_date,
        time: item.appointment_time.slice(0, 5), appointmentStatus: item.status,
        patient: first(item.clients)?.full_name || "Unknown patient", email: first(item.clients)?.email || "",
        phone: first(item.clients)?.phone || "", service: first(item.products)?.name || first(item.services)?.name || "Treatment",
        serviceId: item.service_id, case: first(item.treatment_cases) || null, intake: first(item.appointment_intakes),
        protocol: (protocols.data || []).find(protocol => protocol.service_id === item.service_id) || null,
      }));
    return NextResponse.json({ cases }, { headers: privateHeaders });
  } catch (error) {
    console.error("Unable to load treatment cases:", error);
    return NextResponse.json({ error: "Unable to load treatment cases." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await clinicalUser(request);
    if (!auth) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    if (!auth.isDoctor) return NextResponse.json({ error: "Doctor access is required." }, { status: 403 });
    const body = await request.json();
    const appointmentId = String(body.appointmentId || "");
    const step = Number(body.currentStep);
    if (!Number.isInteger(step) || step < 1 || step > 5 || !["in_progress", "completed"].includes(body.status)) return NextResponse.json({ error: "Choose a valid treatment step and status." }, { status: 400 });
    const database = clinicalDatabase();
    const { data: appointment, error: appointmentError } = await database.from("appointments")
      .select("id,client_id,service_id,status,services!inner(service_categories!inner(slug))").eq("id", appointmentId).single();
    if (appointmentError || !appointment) return NextResponse.json({ error: "Treatment appointment not found." }, { status: 404 });
    if (first(first(appointment.services)?.service_categories)?.slug === "consultations") return NextResponse.json({ error: "Consultations must be charted in the consultation workspace." }, { status: 409 });
    if (appointment.status !== "confirmed") return NextResponse.json({ error: "Only confirmed treatments can be edited. Completed treatments are available for review." }, { status: 409 });
    const protocolResult = await database.from("treatment_protocols").select("*").eq("service_id", appointment.service_id).eq("is_active", true).maybeSingle();
    if (protocolResult.error) throw protocolResult.error;
    const protocol = protocolResult.data as TreatmentProtocol | null;
    const string = (value: unknown) => typeof value === "string" ? value.trim() : "";
    const details = body.procedureDetails;
    if (!details || typeof details !== "object" || Array.isArray(details) || Object.keys(details).length > 50 || Object.values(details).some(value => typeof value !== "string" || value.length > 2000)) return NextResponse.json({ error: "Provide valid procedure details." }, { status: 400 });
    const form: TreatmentForm = {
      consentGiven: body.consentGiven === true, consentSignatureName: string(body.consentSignatureName),
      anesthesiaType: string(body.anesthesiaType) || "none", anesthesiaProduct: string(body.anesthesiaProduct), anesthesiaAmount: string(body.anesthesiaAmount), anesthesiaNotes: string(body.anesthesiaNotes),
      procedureDetails: details, procedureNotes: string(body.procedureNotes), procedureDate: string(body.procedureDate),
      postcareInstructions: string(body.postcareInstructions), postcareGiven: body.postcareGiven === true,
      followUpRequired: body.followUpRequired === true, followUpDate: string(body.followUpDate), followUpNotes: string(body.followUpNotes),
    };
    if (form.consentSignatureName.length > 250 || form.anesthesiaProduct.length > 1000 || form.anesthesiaAmount.length > 1000 || [form.anesthesiaNotes, form.procedureNotes, form.postcareInstructions].some(value => value.length > 10000) || form.followUpNotes.length > 2000) return NextResponse.json({ error: "Keep clinical notes within the supported field lengths." }, { status: 400 });
    if (form.procedureDate && !validClinicalDate(form.procedureDate)) return NextResponse.json({ error: "Choose a valid procedure date." }, { status: 400 });
    const complete = body.status === "completed";
    const validation = validateTreatmentStep(form, protocol, step, complete);
    if (validation) return NextResponse.json({ error: validation }, { status: 400 });
    const record = {
      current_step: complete ? 5 : step, consent_given: form.consentGiven, consent_signature_name: form.consentSignatureName || null,
      consent_version: protocol?.consent_version || "1.0", consent_text_snapshot: protocol?.consent_text || "The procedure, benefits, alternatives, material risks, and aftercare have been explained. The patient had an opportunity to ask questions and voluntarily consents to treatment.",
      anesthesia_type: form.anesthesiaType, anesthesia_product: form.anesthesiaProduct || null, anesthesia_amount: form.anesthesiaAmount || null, anesthesia_notes: form.anesthesiaNotes || null,
      procedure_details: form.procedureDetails, procedure_notes: form.procedureNotes || null, performed_on: form.procedureDate || null,
      postcare_instructions: form.postcareInstructions || null, postcare_given: form.postcareGiven,
      follow_up_required: form.followUpRequired, follow_up_date: form.followUpRequired ? form.followUpDate : null, follow_up_notes: form.followUpRequired ? form.followUpNotes : null,
    };
    const saved = await database.rpc("save_treatment_chart", { p_appointment_id: appointmentId, p_doctor_id: auth.user.id, p_record: record, p_complete: complete }).single();
    if (saved.error) {
      if (saved.error.code === "P0001") return NextResponse.json({ error: saved.error.message }, { status: 409 });
      throw saved.error;
    }
    return NextResponse.json({ case: saved.data }, { headers: privateHeaders });
  } catch (error) {
    console.error("Unable to save treatment workflow:", error);
    return NextResponse.json({ error: "Unable to save the treatment workflow. Check that the patient progress migration is applied." }, { status: 500 });
  }
}
