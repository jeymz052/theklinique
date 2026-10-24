import { NextResponse } from "next/server";
import { clinicalDatabase, clinicalUser } from "@/lib/clinicalServer";
import { canJoinOnlineVisit } from "@/lib/consultation";
import { zoomConfiguration } from "@/lib/zoom";

export async function GET(request: Request) {
  try {
    const auth = await clinicalUser(request);
    if (!auth) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    if (!auth.isDoctor && auth.role !== "patient") return NextResponse.json({ error: "Patient or doctor access is required." }, { status: 403 });
    const db = clinicalDatabase();
    let query = db.from("appointments").select("id, reference_no, appointment_date, appointment_time, status, payments(status)").eq("consultation_mode", "online").order("appointment_date", { ascending: false }).order("appointment_time");
    if (!auth.isDoctor) {
      const { data, error } = await db.from("clients").select("id").eq("auth_user_id", auth.user.id);
      if (error) throw error;
      query = query.in("client_id", (data || []).map(row => row.id));
    }
    const [visits, settings] = await Promise.all([query, db.from("consultation_settings").select("zoom_meeting_number").eq("id", 1).single()]);
    if (visits.error || settings.error) throw visits.error || settings.error;
    const meetingConfigured = /^\d{9,11}$/.test(settings.data.zoom_meeting_number || "") && zoomConfiguration().configured;
    return NextResponse.json({ visits: (visits.data || []).map(visit => {
      const joinAvailable = meetingConfigured && (auth.isDoctor ? visit.status === "confirmed" : canJoinOnlineVisit(visit.appointment_date, visit.appointment_time, visit.status));
      return { ...visit, provider: "Zoom", meetingConfigured, joinAvailable };
    }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Online consultations:", error);
    return NextResponse.json({ error: "Unable to load online consultations." }, { status: 500 });
  }
}
