"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { clinicalApi } from "@/lib/clinicalApi";
import { validatePrescription, type Medicine, type MedicalDocument, type PrescriptionContent, type PrescriptionDraft } from "@/lib/consultation";
import PrescriptionDocument from "./PrescriptionDocument";
import MedicalDocumentActions from "./MedicalDocumentActions";

type Template = { id: string; name: string; prescription: PrescriptionDraft };
const blankMedicine = (): Medicine => ({ id: crypto.randomUUID(), genericName: "", brand: "", strengthForm: "", dose: "", frequency: "", duration: "", quantity: "", instructions: "", indication: "" });
const frequencies = ["once a day", "twice a day", "3 times a day", "every 8 hours", "as needed"];
const instructions = ["Take before bedtime", "Take with or without food", "Take after meals", "Take 30 minutes before meals"];

export default function PrescriptionBuilder({ appointmentId, value, onChange, content, document, onSave, onIssued, onEditingChange, disabled = false }: {
  appointmentId: string; value: PrescriptionDraft; onChange: (value: PrescriptionDraft) => void; content: PrescriptionContent;
  document?: MedicalDocument; onSave: (prescription?: PrescriptionDraft) => Promise<boolean>; onIssued: (document: MedicalDocument) => void; onEditingChange: (editing: boolean) => void; disabled?: boolean;
}) {
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateMode, setTemplateMode] = useState<"load" | "save" | null>(null);
  const [templateName, setTemplateName] = useState("");
  const locked = Boolean(document) || disabled;
  useEffect(() => { onEditingChange(Boolean(editing) || busy); return () => onEditingChange(false); }, [editing, busy, onEditingChange]);
  useEffect(() => { let active = true; void clinicalApi("/api/prescription-templates").then(result => { if (active) setTemplates(result.templates); }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, []);
  function updateMedicine(key: keyof Medicine, text: string) { setEditing(current => current ? { ...current, [key]: text } : current); }
  function saveMedicine(event: React.FormEvent) {
    event.preventDefault(); if (!editing) return;
    try {
      const medicine = validatePrescription({ ...value, medicines: [editing] }).medicines[0];
      onChange({ ...value, medicines: value.medicines.some(item => item.id === medicine.id) ? value.medicines.map(item => item.id === medicine.id ? medicine : item) : [...value.medicines, medicine] });
      setEditing(null); setError(""); setPreview(false);
    } catch (error) { setError((error as Error).message); }
  }
  function autoQuantity() {
    if (!editing) return;
    const perDay: Record<string, number> = { "once a day": 1, "twice a day": 2, "3 times a day": 3, "every 8 hours": 3 };
    const days = /^(\d+)\s*days?$/i.exec(editing.duration)?.[1];
    const dose = /^(\d+(?:\.\d+)?)\s*(?:tablets?|capsules?)$/i.exec(editing.dose)?.[1];
    const count = perDay[editing.frequency];
    if (!days || !dose || !count) { setError("Auto-calculate needs a tablet/capsule dose, a daily frequency, and duration in days. Enter quantity manually for other schedules."); return; }
    updateMedicine("quantity", String(Math.ceil(Number(days) * Number(dose) * count))); setError("");
  }
  async function saveTemplate() {
    setBusy(true); setError("");
    try {
      const result = await clinicalApi("/api/prescription-templates", { method: "POST", body: JSON.stringify({ name: templateName, prescription: value }) });
      setTemplates(items => [...items, result.template]); setTemplateMode(null); setTemplateName(""); setMessage("Prescription template saved.");
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  function review() {
    try {
      if (editing) throw new Error("Save or cancel the medicine you are editing first.");
      if (!validatePrescription(value).medicines.length) throw new Error("Add at least one medicine to review.");
      setPreview(true); setError("");
    } catch (error) { setError((error as Error).message); }
  }
  async function issue() {
    setBusy(true); setError("");
    try {
      if (!await onSave({ ...value, releaseToPatient: true })) return;
      const result = await clinicalApi("/api/medical-documents", { method: "POST", body: JSON.stringify({ appointmentId }) });
      onIssued(result.document); setPreview(false); setMessage(result.document.released_to_patient ? "Prescription issued and released to the patient's Medical Documents." : "Prescription issued as a clinic copy.");
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  return <section className="rx-builder">
    <header className="clinical-section-heading"><span><i aria-hidden="true" className="fa-solid fa-file-prescription" /></span><div><h3>{document ? "Issued prescription" : "Create prescription"}</h3><p>{document ? "This original prescription is preserved in Medical Documents." : "Build the medication order, review the signed document, then confirm issuance."}</p></div>{!locked && <b className="clinical-pill">{value.medicines.length} medicine{value.medicines.length === 1 ? "" : "s"}</b>}</header>
    {error && <p className="bk-form-error" role="alert">{error}</p>}{message && <p className="clinical-success" role="status">{message}</p>}
    {document ? <><div className="clinical-actions"><b className="clinical-pill completed">{document.released_to_patient ? "Released to patient portal" : "Clinic copy"}</b><Link href={`/dashboard/medical-document?id=${document.id}`} target="_blank" className="dk-btn dk-btn-outline">Open document <i aria-hidden="true" className="fa-solid fa-arrow-up-right-from-square" /></Link><MedicalDocumentActions key={document.id} document={document} doctor /></div><PrescriptionDocument content={document.content} reference={document.reference_no} issuedAt={document.issued_at} /></> : preview ? <><div className="clinical-actions"><button type="button" className="dk-btn dk-btn-outline" onClick={() => setPreview(false)}>← Edit prescription</button><span>Review patient details, medication orders, and your signature.</span></div><PrescriptionDocument content={{ ...content, prescription: value }} reference="PREVIEW" preview /><div className="clinical-actions"><button type="button" className="dk-btn dk-btn-outline" onClick={() => setPreview(false)}>Edit prescription</button><button type="button" className="dk-btn dk-btn-pink" disabled={busy || locked} onClick={() => void issue()}>{busy ? "Issuing…" : "Confirm & issue prescription"}</button></div></> : <>
      <div className="rx-patient-card"><span className="rx-avatar">{content.patient.name.split(" ").map(word => word[0]).slice(0, 2).join("")}</span><div><small>{content.patient.patientNo || "Patient record"}</small><h3>{content.patient.name}</h3><p>{[content.patient.sex, content.patient.dateOfBirth].filter(Boolean).join(" · ")}</p></div><i aria-hidden="true" className="fa-solid fa-lock" /></div>
      <div className="rx-medicine-list">{value.medicines.map((medicine, index) => <article key={medicine.id}><small>MEDICINE {index + 1}</small><h3>{medicine.genericName}</h3>{medicine.brand && <p>{medicine.brand}</p>}<p><strong>{medicine.strengthForm} · Qty {medicine.quantity}</strong></p><p>Sig. {medicine.dose}, {medicine.frequency} for {medicine.duration}</p>{medicine.instructions && <p><em>{medicine.instructions}</em></p>}{medicine.indication && <p>Indication: {medicine.indication}</p>}<div><button type="button" disabled={locked || Boolean(editing)} onClick={() => setEditing({ ...medicine })}><i aria-hidden="true" className="fa-solid fa-pen" /> Edit</button><button type="button" disabled={locked || Boolean(editing)} onClick={() => onChange({ ...value, medicines: value.medicines.filter(item => item.id !== medicine.id) })}><i aria-hidden="true" className="fa-regular fa-trash-can" /> Remove</button></div></article>)}</div>
      {!value.medicines.length && !editing && <div className="rx-empty"><i aria-hidden="true" className="fa-solid fa-prescription" /><h3>No medicines added yet</h3><p>Add a medicine or load one of your saved templates.</p><button type="button" className="dk-btn dk-btn-pink" disabled={locked} onClick={() => setEditing(blankMedicine())}><i aria-hidden="true" className="fa-solid fa-plus" /> Add first medicine</button></div>}
      {editing && <form className="rx-medicine-editor" onSubmit={saveMedicine}><header><h3>{value.medicines.some(item => item.id === editing.id) ? "Edit medicine" : "Add medicine"}</h3><button type="button" onClick={() => { setEditing(null); setError(""); }}>Cancel</button></header><div className="rx-fields">
        <label className="wide">Generic name *<input required maxLength={1000} value={editing.genericName} onChange={e => updateMedicine("genericName", e.target.value)} placeholder="Enter the medicine's generic name" /></label>
        <label>Brand (optional)<input value={editing.brand} maxLength={1000} onChange={e => updateMedicine("brand", e.target.value)} placeholder="Generic only if left blank" /></label><label>Strength and form *<input required maxLength={1000} value={editing.strengthForm} onChange={e => updateMedicine("strengthForm", e.target.value)} placeholder="e.g. 10 mg tablet" /></label>
        <label>Dose *<input required maxLength={1000} value={editing.dose} onChange={e => updateMedicine("dose", e.target.value)} placeholder="e.g. 1 tablet" /></label><label>Frequency *<input required maxLength={1000} aria-label="Frequency *" value={editing.frequency} onChange={e => updateMedicine("frequency", e.target.value)} placeholder="Enter frequency" /><span className="rx-quick-options">{frequencies.map(text => <button key={text} type="button" onClick={() => updateMedicine("frequency", text)}>{text}</button>)}</span></label>
        <label>Duration *<input required maxLength={1000} aria-label="Duration *" value={editing.duration} onChange={e => updateMedicine("duration", e.target.value)} placeholder="e.g. 5 days" /><span className="rx-quick-options">{[3, 5, 7, 14, 30].map(days => <button key={days} type="button" onClick={() => updateMedicine("duration", `${days} days`)}>{days} days</button>)}</span></label><label htmlFor="rx-quantity"><span className="rx-label-row">Quantity *<button type="button" aria-label="Auto-calculate" onClick={autoQuantity}>Auto-calculate</button></span><input required maxLength={1000} id="rx-quantity" aria-label="Quantity *" value={editing.quantity} onChange={e => updateMedicine("quantity", e.target.value)} placeholder="Enter total quantity" /></label>
        <label className="wide">Instructions<input maxLength={1000} aria-label="Instructions" value={editing.instructions} onChange={e => updateMedicine("instructions", e.target.value)} placeholder="Additional instructions for this medicine" /><span className="rx-quick-options">{instructions.map(text => <button key={text} type="button" onClick={() => updateMedicine("instructions", text)}>{text}</button>)}</span></label><label className="wide">Indication<input maxLength={1000} value={editing.indication} onChange={e => updateMedicine("indication", e.target.value)} placeholder="Reason for prescribing (optional)" /></label>
      </div><button className="dk-btn dk-btn-pink" type="submit">Save medicine</button></form>}
      <div className="rx-fields"><label className="wide">Doctor&apos;s notes & instructions<textarea rows={4} value={value.notes} disabled={locked} maxLength={10000} onChange={e => onChange({ ...value, notes: e.target.value })} placeholder="Additional clinical advice and instructions…" /></label><label>Follow-up date (optional)<input type="date" value={value.followUpDate} disabled={locked} onChange={e => onChange({ ...value, followUpDate: e.target.value })} /></label><p className="clinical-help">Confirming issuance saves the prescription in Medical Documents and releases it to the patient portal.</p></div>
      <div className="rx-builder-tools"><button type="button" className="dk-btn dk-btn-outline" disabled={locked || Boolean(editing) || value.medicines.length >= 30} onClick={() => setEditing(blankMedicine())}><i aria-hidden="true" className="fa-solid fa-plus" /> Add medicine</button><button type="button" className="dk-btn dk-btn-outline" disabled={locked || Boolean(editing)} onClick={() => setTemplateMode("load")}>Load template</button><button type="button" className="dk-btn dk-btn-outline" disabled={locked || !value.medicines.length || Boolean(editing)} onClick={() => setTemplateMode("save")}>Save template</button><button type="button" className="dk-btn dk-btn-pink" disabled={locked || !value.medicines.length} onClick={review}><i aria-hidden="true" className="fa-regular fa-eye" /> Review prescription</button></div>
      {templateMode && <section className="rx-template-panel"><header><h3>{templateMode === "save" ? "Save prescription template" : "Load prescription template"}</h3><button type="button" onClick={() => setTemplateMode(null)}>Close</button></header>{templateMode === "save" ? <><label>Template name<input maxLength={120} value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Name this reusable prescription" /></label><p>Medicine details and notes are saved. Patient details and follow-up dates are excluded.</p><button type="button" className="dk-btn dk-btn-pink" disabled={busy || !templateName.trim()} onClick={() => void saveTemplate()}>{busy ? "Saving…" : "Save template"}</button></> : <>{value.medicines.length > 0 && <p>Loading a template replaces the current medicine list and notes.</p>}{templates.map(template => <button type="button" className="rx-template-option" key={template.id} onClick={() => { onChange({ ...template.prescription, followUpDate: value.followUpDate, releaseToPatient: value.releaseToPatient, medicines: template.prescription.medicines.map(item => ({ ...item, id: crypto.randomUUID() })) }); setTemplateMode(null); setMessage(`Loaded ${template.name}. Review each medicine for this patient.`); }}><strong>{template.name}</strong><span>{template.prescription.medicines.length} medicines</span></button>)}{!templates.length && <p>No saved templates yet. Build a prescription and save it for later use.</p>}</>}</section>}
    </>}
  </section>;
}
