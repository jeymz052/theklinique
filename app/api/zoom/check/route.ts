import { NextResponse } from "next/server";
import { clinicalDatabase, clinicalUser } from "@/lib/clinicalServer";
import { zoomAccountToken, zoomMeeting, zoomHostToken, ZoomError } from "@/lib/zoom";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const auth = await clinicalUser(request);
    if (!auth?.isDoctor) return NextResponse.json({ error: "Doctor access is required." }, { status: 403, headers });
    const { data, error } = await clinicalDatabase().from("consultation_settings").select("*").eq("id", 1).single();
    if (error) throw error;
    const token = await zoomAccountToken();
    const meeting = await zoomMeeting(token, data.zoom_meeting_number);
    await zoomHostToken(token, meeting.hostId);
    return NextResponse.json({ message: `Zoom is ready: ${meeting.topic}. Waiting room and doctor hosting are enabled.` }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ZoomError ? error.message : "Unable to check Zoom configuration." }, { status: error instanceof ZoomError ? error.status : 500, headers });
  }
}
