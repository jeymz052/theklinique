import { randomUUID } from "crypto";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { clinicalDatabase, clinicalUser } from "@/lib/clinicalServer";
import { MAX_PATIENT_PHOTO_BYTES, PATIENT_PHOTO_BUCKET, validClinicalDate, validateProgressNote, type PatientProgressEntry } from "@/lib/patientProgress";

export const runtime = "nodejs";
const privateHeaders = { "Cache-Control": "private, no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const auth = await clinicalUser(request);
    if (!auth) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    if (!auth.isDoctor) return NextResponse.json({ error: "Doctor access is required for clinical photos and progress notes." }, { status: 403 });
    const clientId = new URL(request.url).searchParams.get("clientId") || "";
    if (!uuid.test(clientId)) return NextResponse.json({ error: "Select a patient record." }, { status: 400 });
    const db = clinicalDatabase();
    let photoQuery = db.from("patient_photos").select("*").eq("client_id", clientId).order("taken_on", { ascending: false }).order("created_at", { ascending: false });
    if (new URL(request.url).searchParams.get("photos") === "profile") photoQuery = photoQuery.eq("kind", "profile");
    const [photos, notes, charts, treatments, appointments] = await Promise.all([
      photoQuery,
      db.from("patient_progress_notes").select("*").eq("client_id", clientId).order("visit_date", { ascending: false }),
      db.from("consultation_charts").select("appointment_id,clinical_assessment,treatment_plan,follow_up_required,follow_up_recommended_date,follow_up_notes,follow_up_appointment_id").eq("client_id", clientId),
      db.from("treatment_cases").select("id,appointment_id,status,performed_on,procedure_notes,follow_up_required,follow_up_date,follow_up_notes").eq("client_id", clientId),
      db.from("appointments").select("id,appointment_date,status,services(name)").eq("client_id", clientId),
    ]);
    for (const result of [photos, notes, charts, treatments, appointments]) if (result.error) throw result.error;
    const rows = photos.data || [];
    const signed = rows.length ? await db.storage.from(PATIENT_PHOTO_BUCKET).createSignedUrls(rows.map(photo => photo.storage_path), 3600) : { data: [], error: null };
    if (signed.error || signed.data?.some(item => !item.signedUrl)) throw signed.error || new Error("Unable to access a clinical photo.");
    const visits = new Map((appointments.data || []).map(visit => [visit.id, visit]));
    const entries: PatientProgressEntry[] = (notes.data || []).map(note => ({ id: note.id, source: "note", date: note.visit_date, title: "Procedure / progress note", description: note.description, followUpDate: note.follow_up_date, followUpNotes: note.follow_up_notes }));
    for (const chart of charts.data || []) {
      const visit = visits.get(chart.appointment_id);
      if (!visit) continue;
      const followUp = chart.follow_up_appointment_id ? visits.get(chart.follow_up_appointment_id) : null;
      entries.push({ id: `consultation-${chart.appointment_id}`, source: "consultation", date: visit.appointment_date, title: "Consultation", description: chart.clinical_assessment || "Consultation chart", plan: chart.treatment_plan || "", followUpDate: chart.follow_up_required ? chart.follow_up_recommended_date : null, followUpNotes: chart.follow_up_notes || "", bookedFollowUpDate: followUp?.appointment_date, bookedFollowUpStatus: followUp?.status });
    }
    for (const treatment of treatments.data || []) {
      const visit = visits.get(treatment.appointment_id);
      if (!visit || (!treatment.procedure_notes && treatment.status !== "completed" && !treatment.follow_up_required)) continue;
      const service = Array.isArray(visit.services) ? visit.services[0] : visit.services;
      entries.push({ id: `treatment-${treatment.id}`, source: "treatment", date: treatment.performed_on || visit.appointment_date, title: service?.name || "Treatment", description: treatment.procedure_notes || "Treatment completed. See the procedure chart for details.", followUpDate: treatment.follow_up_required ? treatment.follow_up_date : null, followUpNotes: treatment.follow_up_notes || "" });
    }
    entries.sort((a, b) => b.date.localeCompare(a.date));
    return NextResponse.json({ photos: rows.map(photo => ({ id: photo.id, kind: photo.kind, taken_on: photo.taken_on, area: photo.area, description: photo.description, appointment_id: photo.appointment_id, url: signed.data?.find(item => item.path === photo.storage_path)?.signedUrl || "" })), entries }, { headers: privateHeaders });
  } catch (error) {
    console.error("Patient clinical progress:", error);
    return NextResponse.json({ error: "Unable to load clinical photos and progress. Apply the patient progress migration first." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await clinicalUser(request);
    if (!auth) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    if (!auth.isDoctor) return NextResponse.json({ error: "Doctor access is required." }, { status: 403 });
    const multipart = request.headers.get("content-type")?.includes("multipart/form-data");
    const form = multipart ? await request.formData() : null;
    const input = form ? Object.fromEntries(form.entries()) : await request.json();
    const clientId = String(input.clientId || ""), appointmentId = input.appointmentId ? String(input.appointmentId) : null;
    if (!uuid.test(clientId) || (appointmentId && !uuid.test(appointmentId))) return NextResponse.json({ error: "Select a valid patient and visit." }, { status: 400 });
    const db = clinicalDatabase();
    const patient = await db.from("clients").select("id").eq("id", clientId).maybeSingle();
    if (patient.error) throw patient.error;
    if (!patient.data) return NextResponse.json({ error: "Patient record not found." }, { status: 404 });
    let treatmentVisit = false;
    if (appointmentId) {
      const visit = await db.from("appointments").select("id,services!inner(service_categories!inner(slug))").eq("id", appointmentId).eq("client_id", clientId).maybeSingle();
      if (visit.error) throw visit.error;
      if (!visit.data) return NextResponse.json({ error: "This visit does not belong to the selected patient." }, { status: 409 });
      const service = Array.isArray(visit.data.services) ? visit.data.services[0] : visit.data.services;
      const category = Array.isArray(service?.service_categories) ? service.service_categories[0] : service?.service_categories;
      treatmentVisit = Boolean(category?.slug && category.slug !== "consultations");
    }
    if (!form) {
      let note;
      try { note = validateProgressNote(input); } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
      const saved = await db.from("patient_progress_notes").insert({ ...note, client_id: clientId, appointment_id: appointmentId, created_by: auth.user.id }).select("id").single();
      if (saved.error) throw saved.error;
      return NextResponse.json({ id: saved.data.id }, { status: 201, headers: privateHeaders });
    }
    const file = form.get("file");
    const kind = String(input.kind || ""), date = String(input.takenOn || ""), area = String(input.area || "").trim(), description = String(input.description || "").trim();
    if (!["profile", "before", "after", "progress"].includes(kind) || !validClinicalDate(date) || area.length > 150 || description.length > 2000) return NextResponse.json({ error: "Choose a photo type, date, and valid description." }, { status: 400 });
    if (kind !== "profile" && !treatmentVisit) return NextResponse.json({ error: "Before, after, and progress photos can only be added from a treatment visit." }, { status: 400 });
    if (!(file instanceof File) || !file.size || file.size > MAX_PATIENT_PHOTO_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) return NextResponse.json({ error: "Choose a JPG, PNG or WebP photo up to 3 MB after resizing." }, { status: 400 });
    let bytes: Buffer;
    try {
      const source = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 });
      const metadata = await source.metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format || "") || (metadata.pages || 1) > 1) throw new Error("Unsupported photo.");
      bytes = await source.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
      if (bytes.length > MAX_PATIENT_PHOTO_BYTES) throw new Error("Photo too large.");
    } catch { return NextResponse.json({ error: "This photo could not be read. Choose a valid JPG, PNG or WebP image." }, { status: 400 }); }
    const previous = kind === "profile" ? await db.from("patient_photos").select("id,storage_path").eq("client_id", clientId).eq("kind", "profile").maybeSingle() : null;
    if (previous?.error) throw previous.error;
    const path = `${clientId}/${randomUUID()}.webp`;
    const uploaded = await db.storage.from(PATIENT_PHOTO_BUCKET).upload(path, bytes, { contentType: "image/webp", cacheControl: "0", upsert: false });
    if (uploaded.error) throw uploaded.error;
    const saved = await db.from("patient_photos").upsert({ id: previous?.data?.id || randomUUID(), client_id: clientId, appointment_id: appointmentId, kind, taken_on: date, area, description, storage_path: path, created_by: auth.user.id }).select("id").single();
    if (saved.error) {
      await db.storage.from(PATIENT_PHOTO_BUCKET).remove([path]);
      throw saved.error;
    }
    if (previous?.data?.storage_path) await db.storage.from(PATIENT_PHOTO_BUCKET).remove([previous.data.storage_path]);
    return NextResponse.json({ id: saved.data.id }, { status: 201, headers: privateHeaders });
  } catch (error) {
    console.error("Saving patient clinical progress:", error);
    return NextResponse.json({ error: "Unable to save this patient record. Check that the patient progress migration is applied." }, { status: 500 });
  }
}
