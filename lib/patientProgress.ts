export const PATIENT_PHOTO_BUCKET = "patient-clinical-media";
export const MAX_PATIENT_PHOTO_BYTES = 3 * 1024 * 1024;
export type PatientPhotoKind = "profile" | "before" | "after" | "progress";
export type PatientPhoto = { id: string; kind: PatientPhotoKind; taken_on: string; area: string; description: string; url: string; appointment_id: string | null };
export type PatientProgressEntry = { id: string; source: "note" | "consultation" | "treatment"; date: string; title: string; description: string; plan?: string; followUpDate: string | null; followUpNotes: string; bookedFollowUpDate?: string | null; bookedFollowUpStatus?: string | null };
export type PatientProgressData = { photos: PatientPhoto[]; entries: PatientProgressEntry[] };

export function validClinicalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function clinicDate() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); }
export function clinicalDateLabel(value: string) { return new Date(`${value}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }); }

export function validateProgressNote(input: Record<string, unknown>) {
  if (!validClinicalDate(input.visitDate)) throw new Error("Choose a valid procedure or visit date.");
  const description = String(input.description || "").trim();
  if (!description || description.length > 10000) throw new Error("Describe the procedures or progress in up to 10,000 characters.");
  const followUpDate = input.followUpDate ? String(input.followUpDate) : null;
  if (followUpDate && (!validClinicalDate(followUpDate) || followUpDate < input.visitDate)) throw new Error("The follow-up date must be on or after this visit.");
  const followUpNotes = String(input.followUpNotes || "").trim();
  if (followUpNotes.length > 2000) throw new Error("Keep follow-up instructions within 2,000 characters.");
  return { visit_date: input.visitDate, description, follow_up_date: followUpDate, follow_up_notes: followUpNotes };
}
