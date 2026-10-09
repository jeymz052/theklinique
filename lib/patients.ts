import { supabase } from "@/lib/supabase";

export interface PatientRecord {
  id: string;
  patientNo: string;
  linkedAccount: boolean;
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  sex: string;
  address: string;
  civilStatus: string;
  bloodType: string;
  allergies: string;
  medicalHistory: string;
  currentMedications: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  notes: string;
  source: "signup" | "booking" | "manual";
  completedVisits: number;
  totalAppointments: number;
  lastVisit: string | null;
  createdAt: string;
  archivedAt: string | null;
  archiveReason: string;
  procedures: { id: string; service: string; status: string; completedAt: string | null }[];
}

export type PatientInput = Pick<PatientRecord, "fullName" | "email" | "phone" | "dateOfBirth" | "sex" | "address" | "civilStatus" | "bloodType" | "allergies" | "medicalHistory" | "currentMedications" | "emergencyContactName" | "emergencyContactPhone" | "notes">;

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export async function fetchPatients() {
  const response = await fetch("/api/patients", { headers: await authHeaders() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to load patient records.");
  return result.patients as PatientRecord[];
}

export async function createPatient(input: PatientInput) {
  const response = await fetch("/api/patients", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(input) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to create the patient record.");
  return result.patient as PatientRecord;
}

export async function updatePatient(patient: PatientRecord) {
  const response = await fetch("/api/patients", { method: "PATCH", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(patient) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to update the patient record.");
  return result.patient as PatientRecord;
}

export async function setPatientArchived(id: string, archived: boolean, reason = "") {
  const response = await fetch("/api/patients", { method: "PATCH", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ id, action: archived ? "archive" : "restore", reason }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to update the patient record.");
  return result.patient as PatientRecord;
}
