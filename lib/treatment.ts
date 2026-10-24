import { validClinicalDate } from "@/lib/patientProgress";

export type TreatmentField = { key: string; label: string; type: string; required: boolean };
export type TreatmentProtocol = { consent_title: string; consent_version: string; consent_text: string | null; anesthesia_requirement: string; allowed_anesthesia: string[]; procedure_fields: TreatmentField[]; postcare_instructions: string | null; default_follow_up_days: number | null };
export type TreatmentForm = { consentGiven: boolean; consentSignatureName: string; anesthesiaType: string; anesthesiaProduct: string; anesthesiaAmount: string; anesthesiaNotes: string; procedureDetails: Record<string, string>; procedureNotes: string; procedureDate: string; postcareInstructions: string; postcareGiven: boolean; followUpRequired: boolean; followUpDate: string; followUpNotes: string };
export const treatmentSteps = ["Consent", "Anesthesia", "Procedure", "Post-care", "Finalize"];
export const defaultTreatmentFields: TreatmentField[] = [{ key: "treatment_area", label: "Treatment area", type: "text", required: true }, { key: "product_device", label: "Product or device", type: "text", required: false }, { key: "settings_dose", label: "Settings or dose", type: "text", required: false }, { key: "lot_number", label: "Lot / batch number", type: "text", required: false }];
export const emptyTreatmentForm = (): TreatmentForm => ({ consentGiven: false, consentSignatureName: "", anesthesiaType: "none", anesthesiaProduct: "", anesthesiaAmount: "", anesthesiaNotes: "", procedureDetails: {}, procedureNotes: "", procedureDate: "", postcareInstructions: "", postcareGiven: false, followUpRequired: false, followUpDate: "", followUpNotes: "" });

export function validateTreatmentStep(form: TreatmentForm, protocol: TreatmentProtocol | null, target: number, complete = false) {
  if ((target > 1 || complete) && (!form.consentGiven || !form.consentSignatureName.trim())) return "Patient acknowledgment and signature name are required.";
  if (!["none", "topical", "local"].includes(form.anesthesiaType) || ((target > 2 || complete || form.anesthesiaType !== "none") && !(protocol?.allowed_anesthesia || ["none", "topical", "local"]).includes(form.anesthesiaType))) return "Choose an allowed anesthesia type.";
  if ((target > 2 || complete) && protocol?.anesthesia_requirement === "required" && form.anesthesiaType === "none") return "This treatment requires an anesthesia record.";
  if (target > 3 || complete) {
    if (!validClinicalDate(form.procedureDate)) return "Choose a valid date for the procedure.";
    if ((protocol?.procedure_fields || defaultTreatmentFields).some(field => field.required && !String(form.procedureDetails[field.key] || "").trim())) return "Complete all required procedure fields.";
  }
  if ((target > 4 || complete) && !form.postcareGiven) return "Confirm that post-care instructions were provided.";
  if (form.followUpRequired && (!validClinicalDate(form.followUpDate) || (form.procedureDate && form.followUpDate < form.procedureDate))) return "Choose a follow-up consultation date on or after the procedure.";
  return null;
}
