import { createClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
type ClinicRole = "superadmin" | "doctor" | "secretary" | "patient";

function adminClient() {
  if (!url || !serviceRoleKey) throw new Error("Supabase server credentials are not configured.");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

async function requestUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !url || !anonKey) return null;
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

async function roleFor(user: User): Promise<ClinicRole> {
  const claim = String(user.app_metadata?.role || "");
  if (["superadmin", "doctor", "secretary", "patient"].includes(claim)) return claim as ClinicRole;
  const { data } = await adminClient().from("profiles").select("role").eq("id", user.id).maybeSingle();
  return (["superadmin", "doctor", "secretary"].includes(String(data?.role)) ? data?.role : "patient") as ClinicRole;
}

async function requireStaff(request: Request) {
  const user = await requestUser(request);
  if (!user) return { error: NextResponse.json({ error: "Sign in is required." }, { status: 401 }) };
  const role = await roleFor(user);
  if (!["superadmin", "doctor"].includes(role)) return { error: NextResponse.json({ error: "Doctor access is required for patient medical records." }, { status: 403 }) };
  return { user, role };
}

type AppointmentRow = { appointment_date: string; status: string };
function first<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] : value; }
type TreatmentRow = { id: string; status: string; completed_at: string | null; services: { name: string } | { name: string }[] | null };
type PatientRow = {
  id: string; auth_user_id: string | null; patient_no: string | null; full_name: string; email: string | null; phone: string;
  date_of_birth: string | null; sex: string | null; address: string | null; civil_status: string | null; blood_type: string | null;
  allergies: string | null; medical_history: string | null; current_medications: string | null; emergency_contact_name: string | null;
  emergency_contact_phone: string | null; notes: string | null; record_source: string; created_at: string; appointments: AppointmentRow[] | null; treatment_cases: TreatmentRow[] | null;
};

function serialize(row: PatientRow) {
  const appointments = row.appointments || [];
  const completed = appointments.filter((item) => item.status === "completed");
  const lastVisit = completed.map((item) => item.appointment_date).sort().at(-1) || null;
  return {
    id: row.id, patientNo: row.patient_no || `TKP-${row.id.slice(0, 8).toUpperCase()}`, linkedAccount: Boolean(row.auth_user_id),
    fullName: row.full_name, email: row.email || "", phone: row.phone || "", dateOfBirth: row.date_of_birth || "", sex: row.sex || "",
    address: row.address || "", civilStatus: row.civil_status || "", bloodType: row.blood_type || "", allergies: row.allergies || "",
    medicalHistory: row.medical_history || "", currentMedications: row.current_medications || "", emergencyContactName: row.emergency_contact_name || "",
    emergencyContactPhone: row.emergency_contact_phone || "", notes: row.notes || "", source: row.record_source,
    completedVisits: completed.length, totalAppointments: appointments.length, lastVisit, createdAt: row.created_at,
    procedures: (row.treatment_cases || []).map((item) => ({ id: item.id, service: first(item.services)?.name || "Treatment", status: item.status, completedAt: item.completed_at })),
  };
}

const select = "id, auth_user_id, patient_no, full_name, email, phone, date_of_birth, sex, address, civil_status, blood_type, allergies, medical_history, current_medications, emergency_contact_name, emergency_contact_phone, notes, record_source, created_at, appointments(appointment_date, status), treatment_cases(id, status, completed_at, services(name))";

export async function GET(request: Request) {
  const auth = await requireStaff(request);
  if (auth.error) return auth.error;
  try {
    const { data, error } = await adminClient().from("clients").select(select).order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ patients: ((data || []) as unknown as PatientRow[]).map(serialize) });
  } catch (error) {
    console.error("Unable to load patient records:", error);
    return NextResponse.json({ error: "Unable to load patient records." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireStaff(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const fullName = String(body.fullName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    if (!fullName) return NextResponse.json({ error: "Patient name is required." }, { status: 400 });
    const { data, error } = await adminClient().from("clients").insert({
      full_name: fullName, email: email || null, phone, date_of_birth: body.dateOfBirth || null,
      sex: body.sex || null, address: String(body.address || "").trim() || null, notes: String(body.notes || "").trim() || null,
      record_source: "manual",
    }).select(select).single();
    if (error?.code === "23505") return NextResponse.json({ error: "A patient record already uses that email address." }, { status: 409 });
    if (error || !data) throw error || new Error("Patient record was not created.");
    return NextResponse.json({ patient: serialize(data as unknown as PatientRow) });
  } catch (error) {
    console.error("Unable to create patient record:", error);
    return NextResponse.json({ error: "Unable to create the patient record." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireStaff(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const id = String(body.id || "");
    const fullName = String(body.fullName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const sex = ["female", "male", "other", "prefer_not_to_say"].includes(body.sex) ? body.sex : null;
    if (!id || !fullName) return NextResponse.json({ error: "Patient and full name are required." }, { status: 400 });
    const changes = {
      full_name: fullName, email: email || null, phone: String(body.phone || "").trim(), date_of_birth: body.dateOfBirth || null, sex,
      address: String(body.address || "").trim() || null, civil_status: String(body.civilStatus || "").trim() || null,
      blood_type: String(body.bloodType || "").trim() || null, allergies: String(body.allergies || "").trim() || null,
      medical_history: String(body.medicalHistory || "").trim() || null, current_medications: String(body.currentMedications || "").trim() || null,
      emergency_contact_name: String(body.emergencyContactName || "").trim() || null, emergency_contact_phone: String(body.emergencyContactPhone || "").trim() || null,
      notes: String(body.notes || "").trim() || null, updated_at: new Date().toISOString(),
    };
    const { data, error } = await adminClient().from("clients").update(changes).eq("id", id).select(select).single();
    if (error?.code === "23505") return NextResponse.json({ error: "A patient record already uses that email address." }, { status: 409 });
    if (error || !data) throw error || new Error("Patient record was not updated.");
    return NextResponse.json({ patient: serialize(data as unknown as PatientRow) });
  } catch (error) {
    console.error("Unable to update patient record:", error);
    return NextResponse.json({ error: "Unable to update the patient record." }, { status: 500 });
  }
}
