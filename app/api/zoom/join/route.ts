import { NextResponse } from "next/server";
import { clinicalDatabase, clinicalUser } from "@/lib/clinicalServer";
import { canJoinOnlineVisit } from "@/lib/consultation";
import { zoomAccountToken, zoomMeeting, zoomHostToken, zoomSignature, ZoomError } from "@/lib/zoom";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export async function POST(request: Request) {
  let doctor = false;
  try {
    const auth = await clinicalUser(request);
    if (!auth) return NextResponse.json({ error: "Sign in to join your consultation." }, { status: 401, headers });
    doctor = auth.isDoctor;
    if (!doctor && auth.role !== "patient") return NextResponse.json({ error: "Patient or doctor access is required." }, { status: 403, headers });
    const input = await request.json().catch(() => null);
    const id = input?.appointmentId;
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: "Choose a valid appointment." }, { status: 400, headers });
    const db = clinicalDatabase();
    // Ownership is checked before configuration, Zoom requests, or credential creation.
    const { data: visit, error } = await db.from("appointments").select("id, client_id, consultation_mode, status, appointment_date, appointment_time").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!visit) return NextResponse.json({ error: "Online consultation not found." }, { status: 404, headers });
    const { data: patient, error: patientError } = await db.from("clients").select("auth_user_id, full_name").eq("id", visit.client_id).maybeSingle();
    if (patientError) throw patientError;
    if (!doctor && patient?.auth_user_id !== auth.user.id) return NextResponse.json({ error: "Online consultation not found." }, { status: 404, headers });
    if (visit.consultation_mode !== "online" || visit.status !== "confirmed") return NextResponse.json({ error: "Only confirmed online consultations can be joined." }, { status: 409, headers });
    if (!doctor && !canJoinOnlineVisit(visit.appointment_date, visit.appointment_time, visit.status)) return NextResponse.json({ error: "Joining opens 15 minutes before your appointment and closes one hour after its scheduled start." }, { status: 403, headers });
    const { data: settings, error: settingsError } = await db.from("consultation_settings").select("*").eq("id", 1).single();
    if (settingsError) throw settingsError;
    const accessToken = await zoomAccountToken();
    const meeting = await zoomMeeting(accessToken, settings.zoom_meeting_number);
    const zak = doctor ? await zoomHostToken(accessToken, meeting.hostId) : undefined;
    let userName = patient?.full_name || "Patient";
    if (doctor) {
      const { data: clinic } = await db.from("clinic_settings").select("doctor_name").eq("id", 1).single();
      userName = clinic?.doctor_name || "Dr. Kharyl";
    }
    return NextResponse.json({ signature: zoomSignature(meeting.number, doctor ? 1 : 0), meetingNumber: meeting.number, password: meeting.password, userName: userName.slice(0, 80), ...(zak ? { zak } : {}) }, { headers });
  } catch (error) {
    // Never log Zoom response bodies, signatures, account tokens, or host tokens.
    const status = error instanceof ZoomError ? error.status : 500;
    const message = doctor && error instanceof ZoomError ? error.message : "Unable to open the online consultation. Please try again or contact the clinic.";
    return NextResponse.json({ error: message }, { status, headers });
  }
}
