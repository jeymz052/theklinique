import { NextResponse } from "next/server";
import { documentAccess } from "@/lib/medicalDocumentsServer";
import { createPrescriptionPdf, prescriptionPdfFilename } from "@/lib/prescriptionPdf";
import { deliverEmail } from "@/lib/notificationDelivery";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const access = await documentAccess(request, id);
    if (!access?.auth.isDoctor) return NextResponse.json({ error: "Doctor access is required." }, { status: 403 });
    const { document, db } = access;
    if (document.document_type !== "prescription" || !document.released_to_patient) return NextResponse.json({ error: "Only prescriptions released to the patient can be emailed." }, { status: 409 });
    const body = await request.json();
    if (typeof body.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.requestId)) return NextResponse.json({ error: "A valid email request is required." }, { status: 400 });
    const client = await db.from("clients").select("email").eq("id", document.client_id).single();
    if (client.error) throw client.error;
    const email = client.data?.email?.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Add a valid email to the patient's record first." }, { status: 409 });
    const bytes = await createPrescriptionPdf(document);
    await deliverEmail(db, { appointmentId: document.appointment_id, event: `medical_document_email:${document.id}:${body.requestId}`, to: email, subject: `Your prescription PDF - ${document.reference_no}`, html: "<p>Your prescription from The Klinique is attached as a PDF.</p><p>You can also find it in Medical Documents in your patient portal.</p><p>The Klinique Medical Aesthetics</p>", attachments: [{ filename: prescriptionPdfFilename(document), content: Buffer.from(bytes).toString("base64") }] });
    return NextResponse.json({ email, message: "Prescription PDF email queued." }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "The PDF email could not be sent. Please try again." }, { status: 503 });
  }
}
