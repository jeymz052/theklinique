import type { MedicalDocument, PrescriptionContent } from "@/lib/consultation";

export const prescriptionPageWidth = 850;
export const prescriptionLogoPath = "/images/the_klinique_logo-removebg-preview.png";

const html = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
export const prescriptionAccent = (value: string) => /^#[0-9a-f]{6}$/i.test(value) ? value : "#c0385f";
export const prescriptionClassName = (preview: boolean) => `rx-paper${preview ? " rx-preview" : ""}`;

export function prescriptionPdfFilename(document: Pick<MedicalDocument, "id" | "reference_no">) {
  return `Prescription-${document.reference_no.replace(/[^a-zA-Z0-9-]/g, "") || document.id}.pdf`;
}

export function prescriptionBodyMarkup({ content, reference, issuedAt, preview = false, logoSrc = prescriptionLogoPath }: {
  content: PrescriptionContent; reference: string; issuedAt?: string; preview?: boolean; logoSrc?: string;
}) {
  const { patient, prescriber, clinic, prescription, appearance } = content;
  const date = issuedAt ? new Date(issuedAt) : new Date();
  const clinicDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const birth = patient.dateOfBirth;
  const age = /^\d{4}-\d{2}-\d{2}$/.test(birth) ? Number(clinicDate.slice(0, 4)) - Number(birth.slice(0, 4)) - (clinicDate.slice(5) < birth.slice(5) ? 1 : 0) : null;
  // Only local/data artwork is allowed; document rendering never fetches an arbitrary URL.
  const logo = logoSrc === prescriptionLogoPath || /^data:image\/png;base64,[a-z0-9+/=]+$/i.test(logoSrc) ? logoSrc : prescriptionLogoPath;
  const signature = /^data:image\/(png|jpeg);base64,[a-z0-9+/=\r\n]+$/i.test(prescriber.signatureDataUrl || "") ? prescriber.signatureDataUrl : "";
  return `${preview ? '<span class="rx-watermark">PREVIEW · NOT ISSUED</span>' : ""}
    <header class="rx-letterhead"><div><img src="${html(logo)}" alt="The Klinique" /><span>${html(clinic.name)}</span></div><div><small>${preview ? "Prescription preview" : "Prescription ID"}</small><strong>${html(reference)}</strong><span>${html(appearance.heading || "Electronic Prescription")}</span></div></header>
    <section class="rx-prescriber"><h2>${html(prescriber.name)}</h2><p>${html(prescriber.specialty)}</p><h3>${html(clinic.name)}</h3><p>${html(clinic.address)}</p><small>${html([clinic.phone, clinic.email].filter(Boolean).join(" · "))}</small></section>
    <div class="rx-patient"><div><p>Patient: <strong>${html(patient.name)}</strong></p><p>${patient.patientNo ? `<span>Patient no.: ${html(patient.patientNo)}<br /></span>` : ""}${age !== null ? `<span>Age: ${age} years · </span>` : ""}Sex: ${html(patient.sex || "Not recorded")}</p>${patient.address ? `<p>Address: ${html(patient.address)}</p>` : ""}</div><div><p>${preview ? "Preview date" : "Prescribed on"}</p><strong>${html(date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "long" }))}</strong><p>${html(date.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }))} PHT</p></div></div>
    <div class="rx-symbol">℞<span></span></div>
    <div class="rx-medicines">${prescription.medicines.map((medicine, index) => `<section><h3>${index + 1}. ${html(medicine.genericName)}</h3>${medicine.brand ? `<p class="rx-brand">${html(medicine.brand)}</p>` : ""}<p><strong>${html(medicine.strengthForm)} · Quantity: ${html(medicine.quantity)}</strong></p><p>Sig. ${html(medicine.dose)}, ${html(medicine.frequency)} for ${html(medicine.duration)}</p>${medicine.instructions ? `<p><em>${html(medicine.instructions)}</em></p>` : ""}${medicine.indication ? `<p>Indication: ${html(medicine.indication)}</p>` : ""}</section>`).join("")}</div>
    ${prescription.notes || prescription.followUpDate ? `<section class="rx-notes"><strong>Doctor's instructions</strong><p>${html(prescription.notes)}</p>${prescription.followUpDate ? `<p>Follow-up: ${html(prescription.followUpDate)}</p>` : ""}</section>` : ""}
    <div class="rx-signature">${signature ? `<img src="${html(signature)}" alt="${html(`Signature of ${prescriber.name}`)}" />` : ""}<strong>${html(prescriber.name)}</strong><span>${html(prescriber.specialty)}</span><b>PRC License No.: ${html(prescriber.prcNumber || "Not set")}</b></div>
    <footer class="rx-footer"><p>End of prescription</p>${appearance.footer ? `<p>${html(appearance.footer)}</p>` : ""}<small>The prescription was issued by the named prescriber. Verify the prescriber and prescription details before dispensing.</small></footer>`;
}
