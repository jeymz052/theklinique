"use client";

import { useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { supabase } from "@/lib/supabase";
import type { Appointment } from "@/lib/appointments";
import { clinicalApi } from "@/lib/clinicalApi";
import { fetchPatients, type PatientRecord } from "@/lib/patients";
import { emptyPrescription, defaultConsultationSettings, type ConsultationSettings, type MedicalDocument, type PrescriptionContent, type PrescriptionDraft } from "@/lib/consultation";
import ZoomCall from "./ZoomCall";
import PrescriptionBuilder from "./PrescriptionBuilder";
import ConsultationPatientRecord from "./ConsultationPatientRecord";

type Chart = {
  appointment_id: string;
  clinical_assessment: string | null;
  subjective_notes: string | null;
  objective_notes: string | null;
  treatment_plan: string | null;
  follow_up_required: boolean;
  follow_up_recommended_date: string | null;
  follow_up_notes: string | null;
  follow_up_appointment_id: string | null;
  status: "ready" | "in_progress" | "completed";
  prescription_draft: PrescriptionDraft | null;
  no_prescription_required: boolean;
};
type Intake = { appointment_id: string; chief_concern: string | null; treatment_goals: string | null; allergies_snapshot: string | null; medications_snapshot: string | null; medical_history_snapshot: string | null; custom_answers?:Record<string,{label:string;answer:string}>; information_confirmed_at: string };
type ProcedureOption = { id: string; category_id: string; subcategory: string | null; name: string; description: string | null; price: number; price_note: string | null; duration_mins: number | null };
type ProcedureCategory = { id: string; name: string; slug: string };
type PackageOption = { id: string; name: string; description: string | null; price: number; category: string; subcategory: string };

type Draft = {
  chartStatus: Chart["status"];
  clinicalAssessment: string;
  subjectiveNotes: string;
  objectiveNotes: string;
  treatmentPlan: string;
  followUpRequired: boolean;
  followUpRecommendedDate: string;
  followUpNotes: string;
  prescriptionDraft: PrescriptionDraft;
  noPrescriptionRequired: boolean;
};

const emptyDraft: Draft = {
  chartStatus: "ready",
  clinicalAssessment: "",
  subjectiveNotes: "",
  objectiveNotes: "",
  treatmentPlan: "",
  followUpRequired: false,
  followUpRecommendedDate: "",
  followUpNotes: "",
  prescriptionDraft: emptyPrescription(),
  noPrescriptionRequired: false,
};

export default function ConsultationWorkspace({ appointments, onCompleted, onOpenRecords, onOpenProcedure, initialAppointmentId = null }: {
  appointments: Appointment[];
  onCompleted: () => Promise<void>;
  onOpenRecords: () => void;
  onOpenProcedure: (appointmentId: string) => Promise<void>;
  initialAppointmentId?: string | null;
}) {
  const visits = useMemo(
    () => appointments
      .filter((item) => item.serviceCategory === "consultations" && ["confirmed", "completed"].includes(item.status))
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
    [appointments],
  );
  const [charts, setCharts] = useState<Chart[]>([]);
  const [intakes, setIntakes] = useState<Intake[]>([]);
  const [procedures, setProcedures] = useState<ProcedureOption[]>([]);
  const [procedureCategories, setProcedureCategories] = useState<ProcedureCategory[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [procedureServiceIds, setProcedureServiceIds] = useState<string[]>([]);
  const [packageProductIds, setPackageProductIds] = useState<string[]>([]);
  const [catalogMode, setCatalogMode] = useState<"procedures" | "packages">("procedures");
  const [procedureCategoryId, setProcedureCategoryId] = useState("");
  const [procedureQuery, setProcedureQuery] = useState("");
  const [procedurePanelOpen, setProcedurePanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialAppointmentId || visits[0]?.id || null);
  const [query, setQuery] = useState("");
  const [draft, setDraftState] = useState<Draft>(emptyDraft);
  const unsavedDrafts = useRef(new Map<string, Draft>());
  const [medicineEditing, setMedicineEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"record" | "charting">("record");
  const [step, setStep] = useState(0);
  const [modeFilter, setModeFilter] = useState<"all" | "clinic" | "online">("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [settings, setSettings] = useState<ConsultationSettings>(defaultConsultationSettings);
  const [zoomVisit, setZoomVisit] = useState<{ id: string; title: string } | null>(null);
  const [zoomReady, setZoomReady] = useState(false);
  const [clinic, setClinic] = useState({ clinic_name: "The Klinique", doctor_name: "Dr. Kharyl", address: "", city: "", province: "", contact_phone: "", contact_email: "" });
  const chartStatus = (item: Appointment) => charts.find(chart => chart.appointment_id === item.id)?.status || (item.status === "completed" ? "completed" : "ready");
  const visible = visits.filter(item => (modeFilter === "all" || (item.consultationMode || "clinic") === modeFilter) && (statusFilter === "all" || chartStatus(item) === statusFilter) && (!query.trim() || [item.patient, item.service, item.referenceNo].some(value => value.toLowerCase().includes(query.toLowerCase()))));
  const selected = visible.find(item => item.id === selectedId) || visible[0] || null;
  const online = selected?.consultationMode === "online";
  const steps = online ? ["Assessment", "Prescription", "Finalize"] : ["Assessment", "Finalize"];
  const completed = selected?.status === "completed" || Boolean(selected && chartStatus(selected) === "completed");
  const patient = patients.find(item => item.id === selected?.clientId);
  const issuedPrescription = documents.find(item => item.appointment_id === selected?.id && item.document_type === "prescription");
  function setDraft(update: SetStateAction<Draft>) {
    setDraftState(current => {
      const next = typeof update === "function" ? update(current) : update;
      if (selected) unsavedDrafts.current.set(selected.id, next);
      return next;
    });
  }

  useEffect(() => {
    if (initialAppointmentId) queueMicrotask(() => setSelectedId(initialAppointmentId));
  }, [initialAppointmentId]);

  async function headers() {
    const { data } = await supabase.auth.getSession();
    return { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}` };
  }

  useEffect(() => {
    let active = true;
    void Promise.all([clinicalApi("/api/consultations"), fetchPatients(), clinicalApi("/api/consultation-settings"), clinicalApi("/api/medical-documents")])
      .then(([result, records, configuration, medicalDocuments]) => {
        if (!active) return;
        setCharts(result.charts || []); setIntakes(result.intakes || []); setProcedures(result.procedures || []); setProcedureCategories(result.procedureCategories || []); setPackages(result.packages || []);
        setPatients(records); setSettings({ ...defaultConsultationSettings, ...configuration.settings }); setZoomReady(configuration.zoom?.configured === true); setClinic(configuration.clinic); setDocuments(medicalDocuments.documents);
      }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const chart = charts.find((item) => item.appointment_id === selected?.id);
    queueMicrotask(() => {
      setDraftState(unsavedDrafts.current.get(selected?.id || "") || (chart ? {
        chartStatus: selected?.status === "completed" ? "completed" : chart.status,
        clinicalAssessment: chart.clinical_assessment || "",
        subjectiveNotes: chart.subjective_notes || "",
        objectiveNotes: chart.objective_notes || "",
        treatmentPlan: chart.treatment_plan || "",
        followUpRequired: chart.follow_up_required,
        followUpRecommendedDate: chart.follow_up_recommended_date || "",
        followUpNotes: chart.follow_up_notes || "",
        prescriptionDraft: chart.prescription_draft || emptyPrescription(),
        noPrescriptionRequired: chart.no_prescription_required || false,
      } : { ...emptyDraft, chartStatus: selected?.status === "completed" ? "completed" : "ready", prescriptionDraft: emptyPrescription() }));
      setProcedurePanelOpen(selected?.status === "completed" || chart?.status === "completed");
      setProcedureServiceIds([]);
      setPackageProductIds([]);
      setCatalogMode("procedures");
      setProcedureCategoryId("");
      setProcedureQuery("");
    });
  }, [charts, selected?.id, selected?.status]);

  useEffect(() => { queueMicrotask(() => { setStep(0); setMessage(""); }); }, [selected?.id]);

  async function save(status: Chart["status"], addProcedure = false, prescription?: PrescriptionDraft) {
    if (!selected) return false;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/consultations", {
        method: "PATCH",
        headers: await headers(),
        body: JSON.stringify({ appointmentId: selected.id, ...draft, ...(prescription ? { prescriptionDraft: prescription } : {}), status, procedureServiceIds: addProcedure ? procedureServiceIds : [], packageProductIds: addProcedure ? packageProductIds : [] }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      unsavedDrafts.current.delete(selected.id);
      setCharts((items) => [...items.filter((item) => item.appointment_id !== selected.id), result.chart]);
      if (status === "completed") await onCompleted();
      if (result.procedureAppointmentId) await onOpenProcedure(result.procedureAppointmentId);
      setMessage(status === "completed" ? "Consultation chart finalized." : "Consultation draft saved.");
      return true;
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to save chart.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const ready = visits.filter((item) => item.status === "confirmed" && !charts.some((chart) => chart.appointment_id === item.id && chart.status === "in_progress")).length;
  const selectedIntake = intakes.find((item) => item.appointment_id === selected?.id);
  const prescriptionContent: PrescriptionContent = {
    patient: { name: selected?.patient || "", patientNo: patient?.patientNo || "", dateOfBirth: patient?.dateOfBirth || "", sex: patient?.sex || "", address: patient?.address || "" },
    prescriber: { name: clinic.doctor_name, specialty: settings.specialty, prcNumber: settings.prc_number, signatureDataUrl: settings.signature_data_url },
    clinic: { name: clinic.clinic_name, address: [clinic.address, clinic.city, clinic.province].filter(Boolean).join(", "), phone: clinic.contact_phone, email: clinic.contact_email },
    prescription: draft.prescriptionDraft, appearance: { heading: settings.prescription_heading, footer: settings.prescription_footer, accentColor: settings.accent_color },
  };
  const selectedProcedures = procedures.filter((item) => procedureServiceIds.includes(item.id));
  const selectedPackages = packages.filter((item) => packageProductIds.includes(item.id));
  const selectedItemCount = selectedProcedures.length + selectedPackages.length;
  const toggleProcedure = (id: string) => setProcedureServiceIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  const togglePackage = (id: string) => setPackageProductIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  const visibleProcedures = procedures.filter((item) => {
    const needle = procedureQuery.trim().toLowerCase();
    return (!procedureCategoryId || item.category_id === procedureCategoryId) && (!needle || [item.name, item.subcategory || "", item.description || ""].some((value) => value.toLowerCase().includes(needle)));
  });

  return <div className={`cw-workspace consultation-workspace ${zoomVisit ? "zoom-active" : ""}`}>
    <section className="pr-hero"><div><p className="dk-welcome-label">Consultations / Clinical workspace</p><h1>Visit workspace</h1><span>Review the patient record, document the visit, and release a prescription from one workspace.</span></div><button type="button" className="dk-btn dk-btn-outline" onClick={onOpenRecords}><i aria-hidden="true" className="fa-solid fa-folder-open" /> Patient records</button></section>
    <section className="ma-stats">
      <article><div><span>Ready</span><strong>{ready}</strong><p>{visits.filter(item => item.consultationMode === "online" && chartStatus(item) === "ready").length} online</p></div><i aria-hidden="true" className="fa-solid fa-list-check" /></article>
      <article><div><span>In progress</span><strong>{visits.filter(item => chartStatus(item) === "in_progress").length}</strong><p>Active charts</p></div><i aria-hidden="true" className="fa-solid fa-stethoscope" /></article>
      <article><div><span>Notes done</span><strong>{visits.filter(item => chartStatus(item) === "completed").length}</strong><p>Completed charts</p></div><i aria-hidden="true" className="fa-solid fa-circle-check" /></article>
      <article><div><span>Visits</span><strong>{visits.length}</strong><p>Clinic and online</p></div><i aria-hidden="true" className="fa-solid fa-users" /></article>
    </section>
    {error && <p className="bk-form-error" role="alert">{error}</p>}{message && <p className="clinical-success" role="status">{message}</p>}
    {loading ? <div className="pr-loading">Loading consultations and patient records...</div> : <div className="cw-layout">
      <aside><header><p className="dk-welcome-label">Consultation queue</p><h2>Select a visit</h2><input aria-label="Search consultations" disabled={saving || medicineEditing} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search patient or reference..." /><div className="clinical-filters compact" aria-label="Visit location">{(["all", "clinic", "online"] as const).map(mode => <button type="button" key={mode} disabled={saving || medicineEditing} className={modeFilter === mode ? "active" : ""} onClick={() => setModeFilter(mode)}>{mode === "all" ? "All visits" : mode === "online" ? "Online" : "Clinic"}</button>)}</div><select aria-label="Chart status" disabled={saving || medicineEditing} value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All chart statuses</option><option value="ready">Ready</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select></header><div>{visible.map(item => <button type="button" disabled={saving || medicineEditing} className={selected?.id === item.id ? "active" : ""} key={item.id} onClick={() => setSelectedId(item.id)}><span className="cw-queue-name"><strong>{item.patient}</strong><b className={`clinical-pill ${item.consultationMode === "online" ? "online" : "clinic"}`}>{item.consultationMode === "online" ? "Online" : "Clinic"}</b></span><span>{item.date} | {item.time} PHT</span><small>{item.service}</small><em>{chartStatus(item).replaceAll("_", " ")}</em></button>)}{!visible.length && <div className="clinical-empty"><i aria-hidden="true" className="fa-regular fa-calendar-xmark" /><p>No visits match these filters.</p></div>}</div></aside>
      <main>{selected ? <>
        <header className="cw-selected-header"><div><span className={`clinical-pill ${online ? "online" : "clinic"}`}>{online ? "Online consultation" : "Clinic consultation"}</span><small>{selected.referenceNo}</small><h2>{selected.patient}</h2><p>{clinic.doctor_name} | {selected.date} at {selected.time} PHT</p><strong>{selected.service}</strong></div>{online && <div className="consultation-meeting-card"><p className="dk-welcome-label"><i aria-hidden="true" className="fa-solid fa-video" /> Embedded Zoom</p><h3>Zoom inside your workspace</h3><p>{completed ? "This visit is complete." : !zoomReady || !settings.zoom_meeting_number ? "Finish the Zoom room setup in consultation settings." : zoomVisit ? "Your call stays open while you review records and chart." : "Start the room as host, then admit your patient from the waiting room."}</p><button className="dk-btn dk-btn-pink" type="button" disabled={selected.status !== "confirmed" || completed || !zoomReady || !settings.zoom_meeting_number || Boolean(zoomVisit)} onClick={() => setZoomVisit({ id: selected.id, title: selected.patient })}><i aria-hidden="true" className="fa-solid fa-video" /> {zoomVisit ? "Call open" : "Start Zoom consultation"}</button>{(!zoomReady || !settings.zoom_meeting_number) && <a href="/dashboard/doctor?view=settings&tab=online">Open consultation settings</a>}</div>}</header>
        <nav className="consultation-tabs" role="tablist" aria-label="Visit workspace"><button type="button" role="tab" disabled={saving || medicineEditing} aria-selected={tab === "record"} className={tab === "record" ? "active" : ""} onClick={() => setTab("record")}><i aria-hidden="true" className="fa-solid fa-address-card" /> Patient record</button><button type="button" role="tab" disabled={saving || medicineEditing} aria-selected={tab === "charting"} className={tab === "charting" ? "active" : ""} onClick={() => setTab("charting")}><i aria-hidden="true" className="fa-solid fa-pen-to-square" /> Charting</button></nav>
        {tab === "record" ? <ConsultationPatientRecord patient={patient} appointment={selected} intake={selectedIntake} onOpenRecords={onOpenRecords} /> : <div className="consultation-charting">
          <nav className="consultation-stepper" aria-label="Charting steps">{steps.map((label, index) => <button type="button" disabled={saving || medicineEditing} key={label} aria-current={step === index ? "step" : undefined} className={step === index ? "active" : index < step ? "done" : ""} onClick={() => setStep(index)}><b>{index < step ? <i aria-hidden="true" className="fa-solid fa-check" /> : index + 1}</b><span>{label}</span></button>)}</nav>
          {completed && <p className="clinical-success"><i aria-hidden="true" className="fa-solid fa-circle-check" /> This consultation is finalized. The chart and issued prescription are available for review.</p>}
          {step === 0 && <section className="cw-form"><header className="clinical-section-heading"><span><i aria-hidden="true" className="fa-solid fa-stethoscope" /></span><div><h3>Assessment & consultation notes</h3><p>Record the clinical assessment, subjective and objective findings, and plan.</p></div></header><fieldset disabled={completed || saving} className="clinical-fieldset">
            <label><span>Clinical assessment *</span><textarea value={draft.clinicalAssessment} onChange={event => setDraft({ ...draft, clinicalAssessment: event.target.value })} placeholder="Clinical assessment and diagnosis..." /></label>
            <label><span>Subjective</span><textarea value={draft.subjectiveNotes} onChange={event => setDraft({ ...draft, subjectiveNotes: event.target.value })} placeholder="Patient complaints, symptoms, and history of present illness..." /></label>
            <label><span>Objective</span><textarea value={draft.objectiveNotes} onChange={event => setDraft({ ...draft, objectiveNotes: event.target.value })} placeholder={online ? "Video observations and patient-reported measurements..." : "Vital signs, examination findings, and observations..."} /></label>
            <label><span>Treatment plan *</span><textarea value={draft.treatmentPlan} onChange={event => setDraft({ ...draft, treatmentPlan: event.target.value })} placeholder="Care plan, advice, and next steps..." /></label>
          <section className="cw-followup">
            <div><span className="cw-followup-icon"><i aria-hidden="true" className="fa-solid fa-calendar-check"/></span><div><h3>Consultation follow-up</h3><p>This is a separate ₱500 check-up appointment. The patient chooses an available slot and pays online to confirm it.</p></div><label className="cw-followup-toggle"><input type="checkbox" checked={draft.followUpRequired} onChange={(event) => setDraft({ ...draft, followUpRequired: event.target.checked })}/><span>Recommend follow-up</span></label></div>
            {draft.followUpRequired && <div className="cw-followup-fields"><label><span>Recommended date (optional)</span><input type="date" value={draft.followUpRecommendedDate} onChange={(event) => setDraft({ ...draft, followUpRecommendedDate: event.target.value })}/></label><label><span>Instructions for the patient (optional)</span><textarea value={draft.followUpNotes} onChange={(event) => setDraft({ ...draft, followUpNotes: event.target.value })} placeholder="What should be reviewed during the follow-up?"/></label></div>}
          </section>
          </fieldset></section>}
          {online && step === 1 && <section className="consultation-rx-step"><label className="clinical-checkbox clinical-no-prescription"><input type="checkbox" checked={draft.noPrescriptionRequired} disabled={completed || saving || medicineEditing || Boolean(issuedPrescription) || draft.prescriptionDraft.medicines.length > 0} onChange={event => setDraft({ ...draft, noPrescriptionRequired: event.target.checked })} /><span><strong>No prescription required</strong><small>Confirm this when medication is not needed for this visit.</small></span></label>{!draft.noPrescriptionRequired && <PrescriptionBuilder key={selected.id} appointmentId={selected.id} value={draft.prescriptionDraft} onChange={prescriptionDraft => setDraft(current => ({ ...current, prescriptionDraft }))} content={prescriptionContent} document={issuedPrescription} onEditingChange={setMedicineEditing} onSave={prescription => save("in_progress", false, prescription)} onIssued={document => setDocuments(items => [...items.filter(item => item.id !== document.id), document])} disabled={completed || saving} />}</section>}
          {step === steps.length - 1 && <section className="cw-form"><header className="clinical-section-heading"><span><i aria-hidden="true" className="fa-solid fa-check-double" /></span><div><h3>Review & finalize</h3><p>Review the chart and documents before completing the visit.</p></div></header><div className="consultation-final-summary"><div><small>Clinical assessment</small><p>{draft.clinicalAssessment || "No assessment recorded"}</p></div><div><small>Subjective & objective notes</small><p>{[draft.subjectiveNotes, draft.objectiveNotes].filter(Boolean).join("\n\n") || "No notes recorded"}</p></div><div><small>Treatment plan</small><p>{draft.treatmentPlan || "No treatment plan recorded"}</p></div><div><small>{online ? "Digital prescription" : "Clinic documents"}</small><p>{online ? issuedPrescription ? `${issuedPrescription.reference_no} | ${issuedPrescription.released_to_patient ? "Released to patient portal" : "Clinic copy"}` : draft.noPrescriptionRequired ? "No prescription required" : "Issue a prescription in step 2, or confirm no prescription is required." : "Prescriptions and clinical forms are handled in person for clinic consultations."}</p></div></div>
          {!online && <>          <section className="cw-add-procedure">
            <button type="button" className="cw-add-procedure-toggle" aria-expanded={procedurePanelOpen} aria-controls="post-consult-procedure-picker" onClick={() => setProcedurePanelOpen((open) => !open)}><span className="cw-followup-icon"><i aria-hidden="true" className="fa-solid fa-syringe"/></span><span><h3>Procedure or package after consultation</h3><p>If the patient decides to proceed today, expand this section to select procedures and packages.</p></span><em>{selectedItemCount ? `${selectedItemCount} selected` : "Optional"}</em><i aria-hidden="true" className={`fa-solid fa-chevron-${procedurePanelOpen ? "up" : "down"}`}/></button>
            {procedurePanelOpen && <div className="cw-procedure-picker" id="post-consult-procedure-picker">
              <div className="cw-catalog-mode"><button type="button" className={catalogMode === "procedures" ? "active" : ""} onClick={() => setCatalogMode("procedures")}><i aria-hidden="true" className="fa-solid fa-syringe"/> Medical Procedures</button><button type="button" className={catalogMode === "packages" ? "active" : ""} onClick={() => setCatalogMode("packages")}><i aria-hidden="true" className="fa-solid fa-box-open"/> Packages</button></div>
              {catalogMode === "procedures" ? <><div className="cw-procedure-tools"><div className="cw-procedure-categories"><button type="button" className={!procedureCategoryId ? "active" : ""} onClick={() => setProcedureCategoryId("")}>All</button>{procedureCategories.map((category) => <button type="button" key={category.id} className={procedureCategoryId === category.id ? "active" : ""} onClick={() => setProcedureCategoryId(category.id)}>{category.name}</button>)}</div><label className="cw-procedure-search"><i aria-hidden="true" className="fa-solid fa-magnifying-glass"/><input value={procedureQuery} onChange={(event) => setProcedureQuery(event.target.value)} placeholder="Search procedures..."/></label></div><div className="cw-procedure-grid">{visibleProcedures.map((procedure) => <button type="button" key={procedure.id} className={procedureServiceIds.includes(procedure.id) ? "selected" : ""} onClick={() => toggleProcedure(procedure.id)}><span><small>{procedureCategories.find((category) => category.id === procedure.category_id)?.name}{procedure.subcategory ? ` · ${procedure.subcategory}` : ""}</small><strong>{procedure.name}</strong>{procedure.description && <p>{procedure.description}</p>}</span><span className="cw-procedure-meta">{procedure.duration_mins ? <em><i aria-hidden="true" className="fa-regular fa-clock"/> {procedure.duration_mins} min</em> : <em/>}<b>PHP {Number(procedure.price).toLocaleString()}</b><i aria-hidden="true" className={procedureServiceIds.includes(procedure.id) ? "fa-solid fa-square-check" : "fa-regular fa-square"}/></span></button>)}{!visibleProcedures.length && <p className="cw-procedure-empty">No procedures match this category or search.</p>}</div></> : <div className="cw-procedure-grid">{packages.map((item) => <button type="button" key={item.id} className={packageProductIds.includes(item.id) ? "selected" : ""} onClick={() => togglePackage(item.id)}><span><small>{item.category}{item.subcategory ? ` · ${item.subcategory}` : ""}</small><strong>{item.name}</strong>{item.description && <p>{item.description}</p>}</span><span className="cw-procedure-meta"><em>Package</em><b>PHP {Number(item.price).toLocaleString()}</b><i aria-hidden="true" className={packageProductIds.includes(item.id) ? "fa-solid fa-square-check" : "fa-regular fa-square"}/></span></button>)}{!packages.length && <p className="cw-procedure-empty">No packages are currently available.</p>}</div>}
              <footer className="cw-procedure-selection"><span>{selectedItemCount ? <><i aria-hidden="true" className="fa-solid fa-circle-check"/><small>Selected items</small><strong>{selectedProcedures.length} procedure{selectedProcedures.length === 1 ? "" : "s"} · {selectedPackages.length} package{selectedPackages.length === 1 ? "" : "s"}</strong></> : <><i aria-hidden="true" className="fa-regular fa-circle"/><small>Nothing selected</small><strong>Choose procedures or packages above</strong></>}</span><button disabled={saving || !selectedItemCount} type="button" className="dk-btn dk-btn-pink" onClick={() => save("completed", true)}><i aria-hidden="true" className="fa-solid fa-arrow-right"/> {completed ? "Start procedure / package" : "Finalize & start"}</button></footer>
            </div>}
          </section>
          </>}
          </section>}
          {step === steps.length - 1 && <section className="consultation-status-card" aria-labelledby="consultation-status-title">
            <header className="clinical-section-heading"><span><i aria-hidden="true" className="fa-solid fa-clipboard-check" /></span><div><h3 id="consultation-status-title">Consultation status</h3><p>{completed ? "This consultation is completed. Its saved status is shown below." : "Choose Ready or In Progress to keep the visit open. Choose Completed when the chart and documents are ready."}</p></div><b className={`clinical-pill ${completed ? "completed" : ""}`}>Saved: {selected && chartStatus(selected).replaceAll("_", " ")}</b></header>
            <fieldset className="consultation-status-options" aria-label="Consultation status" disabled={Boolean(completed) || saving}>
              {([{ value: "ready", label: "Ready", icon: "fa-list-check" }, { value: "in_progress", label: "In Progress", icon: "fa-stethoscope" }, { value: "completed", label: "Completed", icon: "fa-circle-check" }] as const).map(option => <label key={option.value} className={(completed ? "completed" : draft.chartStatus) === option.value ? "active" : ""}><input type="radio" name="consultation-status" value={option.value} checked={(completed ? "completed" : draft.chartStatus) === option.value} onChange={() => setDraft(current => ({ ...current, chartStatus: option.value }))} /><span><i aria-hidden="true" className={`fa-solid ${option.icon}`} />{option.label}</span></label>)}
            </fieldset>
          </section>}
          <footer className="consultation-chart-footer"><button type="button" className="dk-btn dk-btn-outline" disabled={step === 0 || saving || medicineEditing} onClick={() => setStep(current => current - 1)}>Back</button><div>{!completed && step < steps.length - 1 && <button disabled={saving || medicineEditing} type="button" className="dk-btn dk-btn-outline" onClick={() => void save("in_progress")}><i aria-hidden="true" className="fa-solid fa-floppy-disk" /> {saving ? "Saving..." : "Save draft"}</button>}{step < steps.length - 1 ? <button type="button" className="dk-btn dk-btn-pink" disabled={saving || medicineEditing} onClick={async () => { if (completed || await save("in_progress")) setStep(current => current + 1); }}>Next: {steps[step + 1]} <i aria-hidden="true" className="fa-solid fa-arrow-right" /></button> : !completed && <button disabled={saving || (draft.chartStatus === "completed" && (!draft.clinicalAssessment.trim() || !draft.treatmentPlan.trim() || (online && !issuedPrescription && !draft.noPrescriptionRequired)))} type="button" className="dk-btn dk-btn-pink" onClick={() => void save(draft.chartStatus)}><i aria-hidden="true" className={draft.chartStatus === "completed" ? "fa-solid fa-check-double" : "fa-solid fa-floppy-disk"} /> {saving ? "Saving..." : draft.chartStatus === "completed" ? "Save & finalize chart" : "Save chart"}</button>}</div></footer>
        </div>}
      </> : <div className="clinical-empty"><i aria-hidden="true" className="fa-regular fa-calendar-xmark" /><h3>No consultation selected</h3><p>Confirmed clinic and online consultations will appear in the queue.</p></div>}</main>
    </div>}
    {zoomVisit && <ZoomCall key={zoomVisit.id} appointmentId={zoomVisit.id} title={zoomVisit.title} onClose={() => setZoomVisit(null)} />}
  </div>;
}
