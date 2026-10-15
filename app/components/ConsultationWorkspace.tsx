"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Appointment } from "@/lib/appointments";

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
};
type Intake = { appointment_id: string; chief_concern: string | null; treatment_goals: string | null; allergies_snapshot: string | null; medications_snapshot: string | null; medical_history_snapshot: string | null; custom_answers?:Record<string,{label:string;answer:string}>; information_confirmed_at: string };
type ProcedureOption = { id: string; category_id: string; subcategory: string | null; name: string; description: string | null; price: number; price_note: string | null; duration_mins: number | null };
type ProcedureCategory = { id: string; name: string; slug: string };
type PackageOption = { id: string; name: string; description: string | null; price: number; category: string; subcategory: string };

type Draft = {
  clinicalAssessment: string;
  subjectiveNotes: string;
  objectiveNotes: string;
  treatmentPlan: string;
  followUpRequired: boolean;
  followUpRecommendedDate: string;
  followUpNotes: string;
};

const emptyDraft: Draft = {
  clinicalAssessment: "",
  subjectiveNotes: "",
  objectiveNotes: "",
  treatmentPlan: "",
  followUpRequired: false,
  followUpRecommendedDate: "",
  followUpNotes: "",
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
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selected = visits.find((item) => item.id === selectedId) || visits[0] || null;
  const visible = visits.filter((item) => !query.trim() || [item.patient, item.service, item.referenceNo].some((value) => value.toLowerCase().includes(query.toLowerCase())));

  useEffect(() => {
    if (initialAppointmentId) queueMicrotask(() => setSelectedId(initialAppointmentId));
  }, [initialAppointmentId]);

  async function headers() {
    const { data } = await supabase.auth.getSession();
    return { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}` };
  }

  useEffect(() => {
    void headers()
      .then((value) => fetch("/api/consultations", { headers: value }))
      .then((response) => response.json())
      .then((result) => { setCharts(result.charts || []); setIntakes(result.intakes || []); setProcedures(result.procedures || []); setProcedureCategories(result.procedureCategories || []); setPackages(result.packages || []); });
  }, []);

  useEffect(() => {
    const chart = charts.find((item) => item.appointment_id === selected?.id);
    queueMicrotask(() => {
      setDraft(chart ? {
        clinicalAssessment: chart.clinical_assessment || "",
        subjectiveNotes: chart.subjective_notes || "",
        objectiveNotes: chart.objective_notes || "",
        treatmentPlan: chart.treatment_plan || "",
        followUpRequired: chart.follow_up_required,
        followUpRecommendedDate: chart.follow_up_recommended_date || "",
        followUpNotes: chart.follow_up_notes || "",
      } : emptyDraft);
      setProcedurePanelOpen(false);
      setProcedureServiceIds([]);
      setPackageProductIds([]);
      setCatalogMode("procedures");
      setProcedureCategoryId("");
      setProcedureQuery("");
    });
  }, [charts, selected?.id]);

  async function save(status: "in_progress" | "completed", addProcedure = false) {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/consultations", {
        method: "PATCH",
        headers: await headers(),
        body: JSON.stringify({ appointmentId: selected.id, ...draft, status, procedureServiceIds: addProcedure ? procedureServiceIds : [], packageProductIds: addProcedure ? packageProductIds : [] }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setCharts((items) => [...items.filter((item) => item.appointment_id !== selected.id), result.chart]);
      if (status === "completed") await onCompleted();
      if (result.procedureAppointmentId) await onOpenProcedure(result.procedureAppointmentId);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to save chart.");
    } finally {
      setSaving(false);
    }
  }

  const ready = visits.filter((item) => item.status === "confirmed" && !charts.some((chart) => chart.appointment_id === item.id && chart.status === "in_progress")).length;
  const selectedIntake = intakes.find((item) => item.appointment_id === selected?.id);
  const selectedProcedures = procedures.filter((item) => procedureServiceIds.includes(item.id));
  const selectedPackages = packages.filter((item) => packageProductIds.includes(item.id));
  const selectedItemCount = selectedProcedures.length + selectedPackages.length;
  const toggleProcedure = (id: string) => setProcedureServiceIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  const togglePackage = (id: string) => setPackageProductIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  const visibleProcedures = procedures.filter((item) => {
    const needle = procedureQuery.trim().toLowerCase();
    return (!procedureCategoryId || item.category_id === procedureCategoryId) && (!needle || [item.name, item.subcategory || "", item.description || ""].some((value) => value.toLowerCase().includes(needle)));
  });

  return <div className="cw-workspace">
    <section className="pr-hero">
      <div><p className="dk-welcome-label">Consultations / Clinical Workspace</p><h1>Visit workspace</h1><span>Open a confirmed consultation, review the patient, and complete the clinical chart.</span></div>
      <button type="button" className="dk-btn dk-btn-outline" onClick={onOpenRecords}><i className="fa-solid fa-folder-open"/> Patient Records</button>
    </section>
    <section className="ma-stats">
      <article><div><span>Ready</span><strong>{ready}</strong><p>Confirmed consultations</p></div><i className="fa-solid fa-list-check"/></article>
      <article><div><span>In progress</span><strong>{charts.filter((chart) => chart.status === "in_progress").length}</strong><p>Active charts</p></div><i className="fa-solid fa-stethoscope"/></article>
      <article><div><span>Notes done</span><strong>{charts.filter((chart) => chart.status === "completed").length}</strong><p>Completed charts</p></div><i className="fa-solid fa-circle-check"/></article>
      <article><div><span>Queue</span><strong>{visits.length}</strong><p>Consultation visits</p></div><i className="fa-solid fa-users"/></article>
    </section>
    <div className="cw-layout">
      <aside>
        <header><p className="dk-welcome-label">Queue</p><h2>Select a consultation</h2><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient or consultation..."/></header>
        <div>{visible.map((item) => <button type="button" className={selected?.id === item.id ? "active" : ""} key={item.id} onClick={() => setSelectedId(item.id)}><strong>{item.patient}</strong><span>{item.date} · {item.time}</span><small>{item.service}</small></button>)}</div>
      </aside>
      <main>{selected ? <>
        <header><div><span className="ma-visit-pill">Consultation</span><small>{selected.referenceNo}</small><h2>{selected.patient}</h2><p>Dr. Kharyl · {selected.date} at {selected.time}</p><strong>{selected.service}</strong></div><button type="button" className="dk-btn dk-btn-outline" onClick={onOpenRecords}><i className="fa-solid fa-address-card"/> Patient record</button></header>
        {selectedIntake && <section className="cw-intake-summary"><div><p className="dk-welcome-label">Patient-confirmed intake</p><h3>{selectedIntake.chief_concern || "No concern provided"}</h3><span>Reviewed {new Date(selectedIntake.information_confirmed_at).toLocaleDateString("en-PH")}</span></div><dl><div><dt>Goals</dt><dd>{selectedIntake.treatment_goals || "Not provided"}</dd></div><div><dt>Allergies</dt><dd>{selectedIntake.allergies_snapshot || "Not provided"}</dd></div><div><dt>Medications</dt><dd>{selectedIntake.medications_snapshot || "Not provided"}</dd></div><div><dt>History</dt><dd>{selectedIntake.medical_history_snapshot || "Not provided"}</dd></div>{Object.entries(selectedIntake.custom_answers||{}).map(([id,value])=><div key={id}><dt>{value.label}</dt><dd>{value.answer}</dd></div>)}</dl></section>}
        <section className="cw-form">
          <h3><i className="fa-solid fa-stethoscope"/> Assessment & consultation notes</h3>
          <label><span>Clinical assessment</span><textarea value={draft.clinicalAssessment} onChange={(event) => setDraft({ ...draft, clinicalAssessment: event.target.value })}/></label>
          <label><span>Subjective</span><textarea value={draft.subjectiveNotes} onChange={(event) => setDraft({ ...draft, subjectiveNotes: event.target.value })} placeholder="Patient concerns, symptoms, and history..."/></label>
          <label><span>Objective</span><textarea value={draft.objectiveNotes} onChange={(event) => setDraft({ ...draft, objectiveNotes: event.target.value })} placeholder="Findings and observations..."/></label>
          <label><span>Treatment plan</span><textarea value={draft.treatmentPlan} onChange={(event) => setDraft({ ...draft, treatmentPlan: event.target.value })}/></label>
          <section className="cw-followup">
            <div><span className="cw-followup-icon"><i className="fa-solid fa-calendar-check"/></span><div><h3>Consultation follow-up</h3><p>This is a separate ₱500 check-up appointment. The patient chooses an available slot and pays online to confirm it.</p></div><label className="cw-followup-toggle"><input type="checkbox" checked={draft.followUpRequired} onChange={(event) => setDraft({ ...draft, followUpRequired: event.target.checked })}/><span>Recommend follow-up</span></label></div>
            {draft.followUpRequired && <div className="cw-followup-fields"><label><span>Recommended date (optional)</span><input type="date" value={draft.followUpRecommendedDate} onChange={(event) => setDraft({ ...draft, followUpRecommendedDate: event.target.value })}/></label><label><span>Instructions for the patient (optional)</span><textarea value={draft.followUpNotes} onChange={(event) => setDraft({ ...draft, followUpNotes: event.target.value })} placeholder="What should be reviewed during the follow-up?"/></label></div>}
          </section>
          <section className="cw-add-procedure">
            <button type="button" className="cw-add-procedure-toggle" aria-expanded={procedurePanelOpen} aria-controls="post-consult-procedure-picker" onClick={() => setProcedurePanelOpen((open) => !open)}><span className="cw-followup-icon"><i className="fa-solid fa-syringe"/></span><span><h3>Procedure or package after consultation</h3><p>If the patient decides to proceed today, expand this section to select procedures and packages.</p></span><em>{selectedItemCount ? `${selectedItemCount} selected` : "Optional"}</em><i className={`fa-solid fa-chevron-${procedurePanelOpen ? "up" : "down"}`}/></button>
            {procedurePanelOpen && <div className="cw-procedure-picker" id="post-consult-procedure-picker">
              <div className="cw-catalog-mode"><button type="button" className={catalogMode === "procedures" ? "active" : ""} onClick={() => setCatalogMode("procedures")}><i className="fa-solid fa-syringe"/> Medical Procedures</button><button type="button" className={catalogMode === "packages" ? "active" : ""} onClick={() => setCatalogMode("packages")}><i className="fa-solid fa-box-open"/> Packages</button></div>
              {catalogMode === "procedures" ? <><div className="cw-procedure-tools"><div className="cw-procedure-categories"><button type="button" className={!procedureCategoryId ? "active" : ""} onClick={() => setProcedureCategoryId("")}>All</button>{procedureCategories.map((category) => <button type="button" key={category.id} className={procedureCategoryId === category.id ? "active" : ""} onClick={() => setProcedureCategoryId(category.id)}>{category.name}</button>)}</div><label className="cw-procedure-search"><i className="fa-solid fa-magnifying-glass"/><input value={procedureQuery} onChange={(event) => setProcedureQuery(event.target.value)} placeholder="Search procedures..."/></label></div><div className="cw-procedure-grid">{visibleProcedures.map((procedure) => <button type="button" key={procedure.id} className={procedureServiceIds.includes(procedure.id) ? "selected" : ""} onClick={() => toggleProcedure(procedure.id)}><span><small>{procedureCategories.find((category) => category.id === procedure.category_id)?.name}{procedure.subcategory ? ` · ${procedure.subcategory}` : ""}</small><strong>{procedure.name}</strong>{procedure.description && <p>{procedure.description}</p>}</span><span className="cw-procedure-meta">{procedure.duration_mins ? <em><i className="fa-regular fa-clock"/> {procedure.duration_mins} min</em> : <em/>}<b>PHP {Number(procedure.price).toLocaleString()}</b><i className={procedureServiceIds.includes(procedure.id) ? "fa-solid fa-square-check" : "fa-regular fa-square"}/></span></button>)}{!visibleProcedures.length && <p className="cw-procedure-empty">No procedures match this category or search.</p>}</div></> : <div className="cw-procedure-grid">{packages.map((item) => <button type="button" key={item.id} className={packageProductIds.includes(item.id) ? "selected" : ""} onClick={() => togglePackage(item.id)}><span><small>{item.category}{item.subcategory ? ` · ${item.subcategory}` : ""}</small><strong>{item.name}</strong>{item.description && <p>{item.description}</p>}</span><span className="cw-procedure-meta"><em>Package</em><b>PHP {Number(item.price).toLocaleString()}</b><i className={packageProductIds.includes(item.id) ? "fa-solid fa-square-check" : "fa-regular fa-square"}/></span></button>)}{!packages.length && <p className="cw-procedure-empty">No packages are currently available.</p>}</div>}
              <footer className="cw-procedure-selection"><span>{selectedItemCount ? <><i className="fa-solid fa-circle-check"/><small>Selected items</small><strong>{selectedProcedures.length} procedure{selectedProcedures.length === 1 ? "" : "s"} · {selectedPackages.length} package{selectedPackages.length === 1 ? "" : "s"}</strong></> : <><i className="fa-regular fa-circle"/><small>Nothing selected</small><strong>Choose procedures or packages above</strong></>}</span><button disabled={saving || !selectedItemCount} type="button" className="dk-btn dk-btn-pink" onClick={() => save("completed", true)}><i className="fa-solid fa-arrow-right"/> Finalize &amp; start</button></footer>
            </div>}
          </section>
          {error && <p className="bk-form-error">{error}</p>}
          <footer><button disabled={saving} type="button" className="dk-btn dk-btn-outline" onClick={() => save("in_progress")}><i className="fa-solid fa-floppy-disk"/> Save draft</button><button disabled={saving} type="button" className="dk-btn dk-btn-pink" onClick={() => save("completed")}><i className="fa-solid fa-check-double"/> Finalize chart</button></footer>
        </section>
      </> : <div className="pr-loading"><i className="fa-regular fa-calendar-xmark"/>No confirmed consultation visits available.</div>}</main>
    </div>
  </div>;
}
