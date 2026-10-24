import { NextResponse } from "next/server";
import { clinicalDatabase, clinicalUser } from "@/lib/clinicalServer";
import { validatePrescription } from "@/lib/consultation";

export async function GET(request: Request) {
  try {
    if (!(await clinicalUser(request))?.isDoctor) return NextResponse.json({ error: "Doctor access is required." }, { status: 403 });
    const { data, error } = await clinicalDatabase().from("prescription_templates").select("id, name, prescription").order("name");
    if (error) throw error;
    return NextResponse.json({ templates: data || [] });
  } catch { return NextResponse.json({ error: "Unable to load prescription templates." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const auth = await clinicalUser(request);
    if (!auth?.isDoctor) return NextResponse.json({ error: "Doctor access is required." }, { status: 403 });
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name || name.length > 120) return NextResponse.json({ error: "Enter a template name up to 120 characters." }, { status: 400 });
    let prescription;
    try { prescription = validatePrescription(body.prescription); } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
    if (!prescription.medicines.length) return NextResponse.json({ error: "Add at least one medicine to save a template." }, { status: 400 });
    const { data, error } = await clinicalDatabase().from("prescription_templates").insert({ name, prescription: { ...prescription, followUpDate: "", releaseToPatient: true }, created_by: auth.user.id }).select("id, name, prescription").single();
    if (error) throw error;
    return NextResponse.json({ template: data }, { status: 201 });
  } catch { return NextResponse.json({ error: "Unable to save prescription template." }, { status: 500 }); }
}
