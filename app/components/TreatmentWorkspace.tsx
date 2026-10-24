"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clinicalApi } from "@/lib/clinicalApi";
import type { Appointment } from "@/lib/appointments";
import { fetchPatients, type PatientRecord } from "@/lib/patients";
import { clinicalDateLabel } from "@/lib/patientProgress";
import { defaultTreatmentFields, emptyTreatmentForm, treatmentSteps, validateTreatmentStep, type TreatmentForm, type TreatmentProtocol } from "@/lib/treatment";
import ConsultationPatientRecord from "./ConsultationPatientRecord";

type Treatment = { appointmentId: string; clientId: string; referenceNo: string; date: string; time: string; appointmentStatus: string; patient: string; email: string; phone: string; service: string; case: Record<string, unknown> | null; protocol: TreatmentProtocol | null; intake?: React.ComponentProps<typeof ConsultationPatientRecord>["intake"] };
function savedForm(item: Treatment): TreatmentForm {
  const value = item.case || {}, string = (key: string) => typeof value[key] === "string" ? value[key] as string : "";
  return { consentGiven: value.consent_given === true, consentSignatureName: string("consent_signature_name"), anesthesiaType: string("anesthesia_type") || "none", anesthesiaProduct: string("anesthesia_product"), anesthesiaAmount: string("anesthesia_amount"), anesthesiaNotes: string("anesthesia_notes"), procedureDetails: (value.procedure_details || {}) as Record<string, string>, procedureNotes: string("procedure_notes"), procedureDate: string("performed_on") || item.date, postcareInstructions: string("postcare_instructions") || item.protocol?.postcare_instructions || "", postcareGiven: value.postcare_given === true, followUpRequired: value.follow_up_required === true, followUpDate: string("follow_up_date"), followUpNotes: string("follow_up_notes") };
}

export default function TreatmentWorkspace({ appointments, onOpenRecords, onCompleted, initialAppointmentId = null }: { appointments: Appointment[]; onOpenRecords: () => void; onCompleted: () => Promise<void>; initialAppointmentId?: string | null }) {
  const [items, setItems] = useState<Treatment[]>([]), [patients, setPatients] = useState<PatientRecord[]>([]), [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(initialAppointmentId), [tab, setTab] = useState<"record" | "charting">("record"), [step, setStep] = useState(1), [form, setForm] = useState<TreatmentForm>(emptyTreatmentForm);
  const [query, setQuery] = useState(""), [saving, setSaving] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const drafts = useRef(new Map<string, { form: TreatmentForm; step: number }>());
  const visible = useMemo(() => items.filter(item => [item.patient, item.service, item.referenceNo].some(value => value.toLowerCase().includes(query.toLowerCase()))), [items, query]);
  const selected = visible.find(item => item.appointmentId === selectedId) || visible[0] || null;
  const appointment = appointments.find(item => item.id === selected?.appointmentId);
  const completed = selected?.case?.status === "completed" || selected?.appointmentStatus === "completed";
  const fields = selected?.protocol?.procedure_fields || defaultTreatmentFields;

  useEffect(() => {
    let active = true;
    void Promise.all([clinicalApi("/api/treatments"), fetchPatients()]).then(([result, records]) => { if (active) { setItems(result.cases || []); setPatients(records); } }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (initialAppointmentId) queueMicrotask(() => setSelectedId(initialAppointmentId)); }, [initialAppointmentId]);
  useEffect(() => {
    if (!selected) return;
    const draft = drafts.current.get(selected.appointmentId);
    queueMicrotask(() => { setForm(draft?.form || savedForm(selected)); setStep(completed ? 5 : draft?.step || Math.min(5, Number(selected.case?.current_step) || 1)); setError(""); });
  }, [selected, completed]);

  function update(patch: Partial<TreatmentForm>) {
    const next = { ...form, ...patch }; setForm(next);
    if (selected) drafts.current.set(selected.appointmentId, { form: next, step });
    setNotice("");
  }
  function navigate(target: number) {
    setStep(target); setError("");
    if (selected) drafts.current.set(selected.appointmentId, { form, step: target });
  }
  async function save(target = step, finish = false) {
    if (!selected || completed) return false;
    const validation = validateTreatmentStep(form, selected.protocol, target, finish);
    if (validation) { setError(validation); return false; }
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await clinicalApi("/api/treatments", { method: "PATCH", body: JSON.stringify({ appointmentId: selected.appointmentId, currentStep: target, status: finish ? "completed" : "in_progress", ...form }) });
      drafts.current.delete(selected.appointmentId);
      setItems(values => values.map(item => item.appointmentId === selected.appointmentId ? { ...item, case: result.case, appointmentStatus: finish ? "completed" : item.appointmentStatus } : item));
      setStep(target); setNotice(finish ? "Treatment finalized. The dated procedure and follow-up request are saved to the patient record." : "Treatment draft saved.");
      if (finish) { try { await onCompleted(); } catch { setNotice("Treatment finalized. Refresh the appointment list to update its status."); } }
      return true;
    } catch (error) { setError((error as Error).message); return false; } finally { setSaving(false); }
  }
  async function goTo(target: number) {
    if (completed || target <= step) { navigate(target); return; }
    await save(target);
  }

  return <div className="tw-workspace treatment-workspace consultation-workspace">
    <section className="pr-hero"><div><p className="dk-welcome-label">Treatments / Medical procedures</p><h1>Treatment workspace</h1><span>Patient records, procedure charting, and follow-up care in one workspace.</span></div></section>
    <div className="cw-layout"><aside><header><h2>Procedure queue</h2><input aria-label="Search treatment visits" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search patient or treatment..." /></header><div>{visible.map(item => <button type="button" className={selected?.appointmentId === item.appointmentId ? "active" : ""} disabled={saving} onClick={() => setSelectedId(item.appointmentId)} key={item.appointmentId}><strong>{item.patient}</strong><span>{item.date} · {item.time}</span><small>{item.service}</small><em>{item.case?.status === "completed" || item.appointmentStatus === "completed" ? "Completed" : "In progress"}</em></button>)}</div></aside>
    <main>{selected ? <><header className="cw-selected-header"><div><span className="clinical-pill">Medical procedure</span> <small>{selected.referenceNo}</small><h2>{selected.patient}</h2><p>{selected.service} · {clinicalDateLabel(selected.date)} at {selected.time}</p></div><span className={`clinical-pill ${completed ? "completed" : ""}`}>{completed ? "Completed" : "In progress"}</span></header>
      <nav className="consultation-tabs" role="tablist" aria-label="Treatment workspace"><button type="button" role="tab" aria-selected={tab === "record"} className={tab === "record" ? "active" : ""} onClick={() => setTab("record")}><i aria-hidden="true" className="fa-solid fa-address-card" /> Patient record</button><button type="button" role="tab" aria-selected={tab === "charting"} className={tab === "charting" ? "active" : ""} onClick={() => setTab("charting")}><i aria-hidden="true" className="fa-solid fa-pen-to-square" /> Charting</button></nav>
      {tab === "record" ? appointment ? <ConsultationPatientRecord patient={patients.find(patient => patient.id === selected.clientId)} appointment={appointment} intake={selected.intake} onOpenRecords={onOpenRecords} /> : <p className="clinical-help">Loading the appointment record. Refresh if it does not appear.</p> : <div className="consultation-charting">
        <nav className="consultation-stepper treatment-stepper" aria-label="Treatment steps">{treatmentSteps.map((label, index) => <button type="button" key={label} className={step === index + 1 ? "active" : step > index + 1 || completed ? "done" : ""} aria-current={step === index + 1 ? "step" : undefined} disabled={saving} onClick={() => void goTo(index + 1)}><b>{step > index + 1 || completed ? <i aria-hidden="true" className="fa-solid fa-check" /> : index + 1}</b><span>{label}</span></button>)}</nav>
        {completed && <p className="clinical-success">This treatment is finalized. Review the chart here; add later photos and progress notes under Patient record.</p>}
        {error && <p className="bk-form-error" role="alert">{error}</p>}{notice && <p className="clinical-success" role="status">{notice}</p>}
        <section className="tw-form treatment-chart-card"><fieldset className="clinical-fieldset" disabled={saving || completed}>
          {step === 1 && <><h3>{selected.protocol?.consent_title || `${selected.service} consent`}</h3><div className="tw-consent">{String(selected.case?.consent_text_snapshot || selected.protocol?.consent_text || "The procedure, benefits, alternatives, material risks, and aftercare have been explained. The patient had an opportunity to ask questions and voluntarily consents to treatment.")}</div><label><span>Patient signature / acknowledgment name</span><input maxLength={250} value={form.consentSignatureName} onChange={event => update({ consentSignatureName: event.target.value })} /></label><label className="tw-check"><input type="checkbox" checked={form.consentGiven} onChange={event => update({ consentGiven: event.target.checked })} /><span>The patient reviewed and accepted this consent in the presence of clinic staff.</span></label></>}
          {step === 2 && <><h3>Pre-treatment anesthesia</h3><p>Record what was actually administered. Select None when anesthesia is not required.</p><label><span>Anesthesia type</span><select value={form.anesthesiaType} onChange={event => update({ anesthesiaType: event.target.value })}>{(selected.protocol?.allowed_anesthesia || ["none", "topical", "local"]).map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label><div className="tw-grid"><label><span>Anesthesia product</span><input maxLength={1000} value={form.anesthesiaProduct} onChange={event => update({ anesthesiaProduct: event.target.value })} /></label><label><span>Amount / concentration</span><input maxLength={1000} value={form.anesthesiaAmount} onChange={event => update({ anesthesiaAmount: event.target.value })} /></label></div><label><span>Anesthesia notes</span><textarea maxLength={10000} value={form.anesthesiaNotes} onChange={event => update({ anesthesiaNotes: event.target.value })} /></label></>}
          {step === 3 && <><h3>{selected.service} procedure record</h3><label><span>Procedure date</span><input type="date" value={form.procedureDate} onChange={event => update({ procedureDate: event.target.value })} /></label><div className="tw-grid">{fields.map(field => <label key={field.key}><span>{field.label}{field.required ? " *" : ""}</span><input maxLength={2000} required={field.required} value={form.procedureDetails[field.key] || ""} onChange={event => update({ procedureDetails: { ...form.procedureDetails, [field.key]: event.target.value } })} /></label>)}</div><label><span>Procedure description / notes</span><textarea maxLength={10000} rows={5} placeholder="Describe the procedures performed that day, areas treated, and observations." value={form.procedureNotes} onChange={event => update({ procedureNotes: event.target.value })} /></label></>}
          {step === 4 && <><h3>Post-care & follow-up</h3><label><span>Instructions provided</span><textarea maxLength={10000} value={form.postcareInstructions} onChange={event => update({ postcareInstructions: event.target.value })} /></label><label className="tw-check"><input type="checkbox" checked={form.postcareGiven} onChange={event => update({ postcareGiven: event.target.checked })} /><span>Post-care instructions were explained and given to the patient.</span></label><label className="tw-check"><input type="checkbox" checked={form.followUpRequired} onChange={event => update({ followUpRequired: event.target.checked })} /><span>Request a follow-up consultation</span></label>{form.followUpRequired && <><label><span>Requested follow-up consultation date</span><input type="date" min={form.procedureDate} value={form.followUpDate} onChange={event => update({ followUpDate: event.target.value })} /></label><label><span>Follow-up instructions</span><textarea maxLength={2000} value={form.followUpNotes} onChange={event => update({ followUpNotes: event.target.value })} /></label><p className="clinical-help">This requested date is saved in the patient record. Schedule an appointment separately to reserve a slot.</p></>}</>}
        </fieldset>
        {step === 5 && <><div className="clinical-section-heading"><span><i aria-hidden="true" className="fa-solid fa-check-double" /></span><div><h3>Review & finalize</h3><p>Review the procedure and aftercare before completing this visit.</p></div></div><div className="consultation-final-summary"><div><small>Patient consent</small><p>{form.consentGiven ? `Acknowledged by ${form.consentSignatureName}` : "Not acknowledged"}</p></div><div><small>Anesthesia</small><p>{[form.anesthesiaType, form.anesthesiaProduct, form.anesthesiaAmount, form.anesthesiaNotes].filter(Boolean).join(" · ")}</p></div><div><small>Procedure · {form.procedureDate && clinicalDateLabel(form.procedureDate)}</small><p>{fields.filter(field => form.procedureDetails[field.key]).map(field => `${field.label}: ${form.procedureDetails[field.key]}`).join("\n")}</p><p>{form.procedureNotes || "No additional procedure notes."}</p></div><div><small>Post-care</small><p>{form.postcareInstructions || "No written instructions recorded."}</p><p>{form.postcareGiven ? "Instructions explained and provided." : "Not confirmed."}</p></div><div><small>Requested follow-up consultation</small><p>{form.followUpRequired && form.followUpDate ? clinicalDateLabel(form.followUpDate) : "No follow-up requested."}</p><p>{form.followUpRequired && form.followUpNotes}</p></div><div><small>Treatment status</small><p><span className={`clinical-pill ${completed ? "completed" : ""}`}>{completed ? "Completed" : "In progress"}</span></p><p>{completed ? "Finalized chart saved for review." : "Finalize to mark the treatment and appointment as completed."}</p></div></div></>}
        </section>
        <footer className="consultation-chart-footer"><button type="button" className="dk-btn dk-btn-outline" disabled={saving || step === 1} onClick={() => navigate(step - 1)}>Back</button><div>{!completed && <button type="button" className="dk-btn dk-btn-outline" disabled={saving} onClick={() => void save()}>Save draft</button>}{step < 5 ? <button type="button" className="dk-btn dk-btn-pink" disabled={saving} onClick={() => void goTo(step + 1)}>Next: {treatmentSteps[step]}</button> : !completed && <button type="button" className="dk-btn dk-btn-pink" disabled={saving} onClick={() => void save(5, true)}><i aria-hidden="true" className="fa-solid fa-check-double" /> {saving ? "Saving..." : "Finalize treatment"}</button>}</div></footer>
      </div>}</> : <div className="clinical-empty"><i aria-hidden="true" className="fa-solid fa-syringe" /><p>{loading ? "Loading treatment appointments..." : "No matching treatment appointments."}</p>{error && <p role="alert">{error}</p>}</div>}</main></div>
  </div>;
}
