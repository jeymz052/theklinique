import { NextResponse } from "next/server";
import { clinicalDatabase, clinicalUser } from "@/lib/clinicalServer";
import { defaultConsultationSettings, consultationSettingsFromRow } from "@/lib/consultation";
import { zoomConfiguration } from "@/lib/zoom";

export async function GET(request: Request) {
  try {
    const auth = await clinicalUser(request);
    if (!auth?.isDoctor) return NextResponse.json({ error: "Doctor access is required." }, { status: 403 });
    const db = clinicalDatabase();
    const [settings, clinic] = await Promise.all([db.from("consultation_settings").select("*").eq("id", 1).single(), db.from("clinic_settings").select("clinic_name, doctor_name, address, city, province, contact_phone, contact_email").eq("id", 1).single()]);
    if (settings.error || clinic.error) throw settings.error || clinic.error;
    return NextResponse.json({ settings: consultationSettingsFromRow(settings.data), clinic: clinic.data, zoom: zoomConfiguration() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Consultation settings:", error);
    return NextResponse.json({ error: "Unable to load consultation settings. Apply the online consultation migration first." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await clinicalUser(request);
    if (!auth?.isDoctor) return NextResponse.json({ error: "Doctor access is required." }, { status: 403 });
    const input = await request.json();
    const settings = Object.fromEntries(Object.keys(defaultConsultationSettings).map(key => [key, String(input[key] || "").trim()]));
    settings.zoom_meeting_number = settings.zoom_meeting_number.replace(/[\s-]/g, "");
    if (settings.zoom_meeting_number && !/^\d{9,11}$/.test(settings.zoom_meeting_number)) return NextResponse.json({ error: "Enter a valid 9–11 digit Zoom meeting ID." }, { status: 400 });
    if (!/^#[0-9a-f]{6}$/i.test(settings.accent_color) || settings.specialty.length > 250 || settings.prc_number.length > 50 || settings.prescription_heading.length > 150 || settings.prescription_footer.length > 1500) return NextResponse.json({ error: "Check the prescription appearance and doctor details." }, { status: 400 });
    if (settings.signature_data_url && (!/^data:image\/(png|jpeg);base64,[a-z0-9+/=]+$/i.test(settings.signature_data_url) || settings.signature_data_url.length > 400000)) return NextResponse.json({ error: "Upload a PNG or JPG signature smaller than 280 KB." }, { status: 400 });
    const { data, error } = await clinicalDatabase().from("consultation_settings").update({ ...settings, video_mode: "zoom", meeting_url: "", updated_at: new Date().toISOString(), updated_by: auth.user.id }).eq("id", 1).select().single();
    if (error?.code === "PGRST204" || error?.code === "42703") return NextResponse.json({ error: "Apply the embedded Zoom database migration (20261026_add_embedded_zoom.sql), then save again." }, { status: 409 });
    if (error) throw error;
    return NextResponse.json({ settings: consultationSettingsFromRow(data) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Saving consultation settings:", error);
    return NextResponse.json({ error: "Unable to save consultation settings." }, { status: 500 });
  }
}
