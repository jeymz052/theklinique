export const ONLINE_CONSULTATION_SLUG = "online-consultation";
export const ONLINE_CONSULTATION_FEE = 600;
export type ConsultationMode = "clinic" | "online";

export function bookingPayment(mode: ConsultationMode, followUp = false) {
  return {
    amount: mode === "online" ? ONLINE_CONSULTATION_FEE : 500,
    kind: mode === "online" ? "online_consultation_fee" : followUp ? "consultation_follow_up_fee" : "reservation_fee",
    credited_to_visit: mode !== "online" && !followUp,
    full_fee: mode === "online" || followUp,
  };
}

export function canJoinOnlineVisit(date: string, time: string, status: string, now = Date.now()) {
  const start = new Date(`${date}T${time.slice(0, 5)}:00+08:00`).getTime();
  return status === "confirmed" && Number.isFinite(start) && now >= start - 15 * 60_000 && now < start + 60 * 60_000;
}

export type Medicine = {
  id: string; genericName: string; brand: string; strengthForm: string; dose: string;
  frequency: string; duration: string; quantity: string; instructions: string; indication: string;
};
export type PrescriptionDraft = { medicines: Medicine[]; notes: string; followUpDate: string; releaseToPatient: boolean };
export const emptyPrescription = (): PrescriptionDraft => ({ medicines: [], notes: "", followUpDate: "", releaseToPatient: true });
export type ConsultationSettings = {
  zoom_meeting_number: string; signature_data_url: string; prc_number: string; specialty: string;
  prescription_heading: string; prescription_footer: string; accent_color: string;
};
export const defaultConsultationSettings: ConsultationSettings = {
  zoom_meeting_number: "", signature_data_url: "", prc_number: "", specialty: "Medical & Aesthetic Doctor",
  prescription_heading: "Electronic Prescription", prescription_footer: "", accent_color: "#c0385f",
};
export function consultationSettingsFromRow(row: Record<string, unknown>): ConsultationSettings {
  return Object.fromEntries(Object.entries(defaultConsultationSettings).map(([key, fallback]) => [key, typeof row[key] === "string" ? row[key] : fallback])) as ConsultationSettings;
}
export type PrescriptionContent = {
  patient: { name: string; patientNo: string; dateOfBirth: string; sex: string; address: string };
  prescriber: { name: string; specialty: string; prcNumber: string; signatureDataUrl: string };
  clinic: { name: string; address: string; phone: string; email: string };
  prescription: PrescriptionDraft;
  appearance: { heading: string; footer: string; accentColor: string };
};
export type MedicalDocument = {
  id: string; reference_no: string; appointment_id: string; client_id: string; doctor_id: string;
  document_type: "prescription" | "certificate" | "lab_request" | "referral" | "consent" | "aftercare";
  title: string; content: PrescriptionContent; released_to_patient: boolean; issued_at: string;
};

export function validatePrescription(value: unknown): PrescriptionDraft {
  if (!value || typeof value !== "object") throw new Error("A prescription is required.");
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.medicines) || input.medicines.length > 30) throw new Error("A prescription can contain up to 30 medicines.");
  const medicines = input.medicines.map((item: unknown, index: number) => {
    if (!item || typeof item !== "object") throw new Error("Invalid medicine details.");
    const medicine = item as Record<string, unknown>;
    const result = Object.fromEntries(["id", "genericName", "brand", "strengthForm", "dose", "frequency", "duration", "quantity", "instructions", "indication"].map(key => [key, String(medicine[key] || "").trim().slice(0, 1000)])) as Medicine;
    result.id ||= `medicine-${index}`;
    if (![result.genericName, result.strengthForm, result.dose, result.frequency, result.duration, result.quantity].every(Boolean)) throw new Error(`Complete the required details for medicine ${index + 1}.`);
    return result;
  });
  const followUpDate = String(input.followUpDate || "");
  if (followUpDate && (!/^\d{4}-\d{2}-\d{2}$/.test(followUpDate) || new Date(`${followUpDate}T00:00:00Z`).toISOString().slice(0, 10) !== followUpDate)) throw new Error("Enter a valid follow-up date.");
  return { medicines, notes: String(input.notes || "").trim().slice(0, 10000), followUpDate, releaseToPatient: input.releaseToPatient !== false };
}
