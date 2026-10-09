"use client";

import { useEffect, useMemo, useState } from "react";
import { createPatient, fetchPatients, setPatientArchived, updatePatient, type PatientInput, type PatientRecord } from "@/lib/patients";
import { fetchAppointments } from "@/lib/appointments";

type Props = { onBookPatient: (patient: PatientRecord) => void; onResolveAppointment?: () => void };
const blankPatient: PatientInput = { fullName:"",email:"",phone:"",dateOfBirth:"",sex:"",address:"",civilStatus:"",bloodType:"",allergies:"",medicalHistory:"",currentMedications:"",emergencyContactName:"",emergencyContactPhone:"",notes:"" };

function age(date: string) {
  if (!date) return null;
  const birth = new Date(`${date}T00:00:00`);
  const now = new Date();
  let value = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) value--;
  return value;
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "PT";
}

export default function PatientRecordsWorkspace({ onBookPatient, onResolveAppointment }: Props) {
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"all" | "linked" | "manual" | "archived">("all");
  const [selected, setSelected] = useState<PatientRecord | null>(null);
  const [draft, setDraft] = useState<PatientRecord | null>(null);
  const [adding, setAdding] = useState(false);
  const [newPatient, setNewPatient] = useState<PatientInput>(blankPatient);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [recordTab, setRecordTab] = useState<"personal" | "contact" | "medical">("personal");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [addStep,setAddStep]=useState(1);

  useEffect(() => {
    fetchPatients().then(setPatients).catch((value) => setError(value.message)).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return patients.filter((patient) => {
      const sourceMatch = source === "archived" ? Boolean(patient.archivedAt) : !patient.archivedAt && (source === "all" || (source === "linked" ? patient.linkedAccount : !patient.linkedAccount));
      return sourceMatch && (!needle || [patient.fullName, patient.email, patient.phone, patient.patientNo].some((value) => value.toLowerCase().includes(needle)));
    });
  }, [patients, query, source]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function bookNewAppointment(patient: PatientRecord) {
    setError("");
    try {
      const appointments = await fetchAppointments();
      const existing = appointments.find((item) => item.clientId === patient.id && (item.status === "pending" || (item.status === "cancelled" && item.cancellationReason === "Reservation payment deadline expired")));
      if (existing) {
        setError(`${patient.fullName} already has a ${existing.status === "pending" ? "pending unpaid" : "recently expired"} booking (${existing.referenceNo}). Resolve it from Appointments before creating a new one.`);
        onResolveAppointment?.();
        return;
      }
      onBookPatient(patient);
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to check existing appointments."); }
  }

  function openRecord(patient: PatientRecord) {
    setSelected(patient); setDraft({ ...patient }); setRecordTab("personal"); setError(""); setNotice("");
  }

  async function saveRecord(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const saved = await updatePatient(draft);
      setPatients((items) => items.map((item) => item.id === saved.id ? saved : item));
      setSelected(saved); setDraft(saved); setNotice("Patient record saved.");
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to save patient record."); }
    finally { setSaving(false); }
  }

  async function addPatient(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const saved = await createPatient(newPatient);
      setPatients((items) => [saved, ...items]); setAdding(false); setAddStep(1); setNewPatient(blankPatient); openRecord(saved);
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to add patient."); }
    finally { setSaving(false); }
  }

  async function changeArchive(patient:PatientRecord,archive:boolean){const reason=archive?window.prompt("Reason for archiving this patient:")?.trim():"";if(archive&&!reason)return;setSaving(true);setError("");try{const saved=await setPatientArchived(patient.id,archive,reason);setPatients(items=>items.map(item=>item.id===saved.id?saved:item));if(archive){setSelected(null);setDraft(null)}else{setSelected(saved);setDraft(saved)}}catch(value){setError(value instanceof Error?value.message:"Unable to update patient.")}finally{setSaving(false)}}

  if (selected && draft) return <div className="pr-workspace">
    <button type="button" className="pr-back" onClick={() => { setSelected(null); setDraft(null); }}><i className="fa-solid fa-arrow-left" /> Patient records</button>
    <form onSubmit={saveRecord}>
      <section className="pr-chart-head">
        <div className="pr-chart-person"><span>{initials(draft.fullName)}</span><div><small>Patient Chart</small><h2>{draft.fullName}</h2><p>{draft.patientNo} · {draft.sex ? draft.sex.replaceAll("_", " ") : "Sex not recorded"}</p></div></div>
        <div className="pr-chart-actions"><em className={draft.linkedAccount ? "linked" : "manual"}>{draft.archivedAt?"Archived":draft.linkedAccount ? "Linked patient account" : "Manual record"}</em><button type="button" className="dk-btn dk-btn-outline" disabled={saving} onClick={()=>void changeArchive(draft,!draft.archivedAt)}><i className={`fa-solid ${draft.archivedAt?"fa-box-open":"fa-box-archive"}`}/> {draft.archivedAt?"Restore patient":"Archive patient"}</button><button type="submit" className="dk-cta-btn" disabled={saving||Boolean(draft.archivedAt)}><i className={`fa-solid ${saving ? "fa-spinner fa-spin" : "fa-floppy-disk"}`} /> {saving ? "Saving" : "Save changes"}</button></div>
      </section>
      <section className="pr-chart-stats"><div><i className="fa-solid fa-calendar-check" /><span>Completed visits<strong>{draft.completedVisits}</strong></span></div><div><i className="fa-solid fa-clock-rotate-left" /><span>Last visit<strong>{draft.lastVisit ? new Date(`${draft.lastVisit}T00:00:00`).toLocaleDateString("en-PH", { dateStyle: "medium" }) : "None"}</strong></span></div><div><i className="fa-solid fa-link" /><span>Portal account<strong>{draft.linkedAccount ? "Connected" : "Not connected"}</strong></span></div></section>
      <div className="pr-record-actions"><button type="button" className="dk-btn dk-btn-outline" onClick={() => void bookNewAppointment(draft)}><i className="fa-solid fa-calendar-plus" /> {draft.linkedAccount ? "Book new appointment" : "Convert to appointment"}</button><span>{draft.linkedAccount ? "Create a new booking for this portal patient when they call or message the clinic." : "Convert this walk-in or phone record into a scheduled clinic appointment."} Existing unpaid or expired bookings are redirected to the appointment desk.</span></div>
      <nav className="pr-record-tabs" aria-label="Patient record sections">
        <button type="button" className={recordTab === "personal" ? "active" : ""} onClick={() => setRecordTab("personal")}><i className="fa-solid fa-user" /> Personal</button>
        <button type="button" className={recordTab === "contact" ? "active" : ""} onClick={() => setRecordTab("contact")}><i className="fa-solid fa-address-book" /> Contact &amp; Emergency</button>
        <button type="button" className={recordTab === "medical" ? "active" : ""} onClick={() => setRecordTab("medical")}><i className="fa-solid fa-notes-medical" /> Medical Record</button>
      </nav>
      {error && <p className="bk-form-error" role="alert">{error}</p>}{notice && <p className="pr-success" role="status">{notice}</p>}
      {recordTab === "personal" && <section className="pr-form-section"><header><i className="fa-solid fa-address-card" /><div><h3>Personal information</h3><p>Core identity information used in booking and the medical chart.</p></div></header><div className="pr-form-grid">
        <label><span>Patient number</span><input value={draft.patientNo} disabled /></label>
        <label><span>Full name *</span><input value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} required /></label>
        <label><span>Birth date</span><input type="date" value={draft.dateOfBirth} onChange={(event) => setDraft({ ...draft, dateOfBirth: event.target.value })} /></label>
        <label><span>Sex</span><select value={draft.sex} onChange={(event) => setDraft({ ...draft, sex: event.target.value })}><option value="">Not recorded</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
        <label><span>Civil status</span><input value={draft.civilStatus} onChange={(event) => setDraft({ ...draft, civilStatus: event.target.value })} /></label>
        <label><span>Blood type</span><input value={draft.bloodType} onChange={(event) => setDraft({ ...draft, bloodType: event.target.value })} placeholder="e.g. O+" /></label>
      </div></section>}
      {recordTab === "contact" && <section className="pr-form-section"><header><i className="fa-solid fa-address-book" /><div><h3>Contact and emergency details</h3><p>Information used for reminders and urgent clinic communication.</p></div></header><div className="pr-form-grid">
        <label><span>Email</span><input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
        <label><span>Mobile number</span><input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
        <label className="wide"><span>Address</span><textarea value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></label>
        <label><span>Emergency contact</span><input value={draft.emergencyContactName} onChange={(event) => setDraft({ ...draft, emergencyContactName: event.target.value })} /></label>
        <label><span>Emergency contact number</span><input value={draft.emergencyContactPhone} onChange={(event) => setDraft({ ...draft, emergencyContactPhone: event.target.value })} /></label>
      </div></section>}
      {recordTab === "medical" && <section className="pr-form-section"><header><i className="fa-solid fa-notes-medical" /><div><h3>Medical record</h3><p>Persistent clinical background used during consultations and treatment planning.</p></div></header><div className="pr-form-grid">
        <label className="wide"><span>Allergies</span><textarea value={draft.allergies} onChange={(event) => setDraft({ ...draft, allergies: event.target.value })} placeholder="Write none if there are no known allergies." /></label>
        <label className="wide"><span>Medical history</span><textarea value={draft.medicalHistory} onChange={(event) => setDraft({ ...draft, medicalHistory: event.target.value })} /></label>
        <label className="wide"><span>Current medications</span><textarea value={draft.currentMedications} onChange={(event) => setDraft({ ...draft, currentMedications: event.target.value })} /></label>
        <label className="wide"><span>Internal clinic notes</span><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
        <div className="pr-medical-summary wide"><div><span>Total appointments</span><strong>{draft.totalAppointments}</strong></div><div><span>Completed visits</span><strong>{draft.completedVisits}</strong></div><div><span>Last completed visit</span><strong>{draft.lastVisit ? new Date(`${draft.lastVisit}T00:00:00`).toLocaleDateString("en-PH", { dateStyle: "long" }) : "No completed visit"}</strong></div></div>
        <div className="pr-procedure-history wide"><h4>Procedure history</h4>{draft.procedures.length ? draft.procedures.map((procedure) => <div key={procedure.id}><span><i className="fa-solid fa-syringe" /><strong>{procedure.service}</strong></span><em>{procedure.status}</em><small>{procedure.completedAt ? new Date(procedure.completedAt).toLocaleDateString("en-PH", { dateStyle: "medium" }) : "In progress"}</small></div>) : <p>No treatment procedures recorded yet.</p>}</div>
      </div></section>}
    </form>
  </div>;

  return <div className="pr-workspace">
    <section className="pr-hero"><div><p className="dk-welcome-label">Patients / EMR</p><h1>Patient Records</h1><span>Signed-up patients and clinic-created records in one secure directory.</span></div><button type="button" className="dk-cta-btn" onClick={() => { setAdding(true); setError(""); }}><i className="fa-solid fa-user-plus" /> Add patient</button></section>
    <section className="pr-stats"><article><i className="fa-solid fa-users" /><div><strong>{patients.length}</strong><span>All patients</span><p>Current directory total</p></div></article><article><i className="fa-solid fa-user-check" /><div><strong>{patients.filter((item) => item.linkedAccount).length}</strong><span>Portal patients</span><p>Signed-up and linked</p></div></article><article><i className="fa-solid fa-clipboard-user" /><div><strong>{patients.filter((item) => !item.linkedAccount).length}</strong><span>Clinic records</span><p>Manual or booking-created</p></div></article></section>
    <section className="pr-directory"><header><div><h2>Patient directory</h2><p>Showing {visible.length} of {patients.length} patient records</p></div><div><label><i className="fa-solid fa-magnifying-glass" /><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search name, number, email, phone..." /></label><select value={source} onChange={(event) => { setSource(event.target.value as typeof source); setPage(1); }}><option value="all">All patients</option><option value="linked">Portal patients</option><option value="manual">Clinic records</option><option value="archived">Archived</option></select><button type="button" onClick={() => {setAdding(true);setAddStep(1)}}><i className="fa-solid fa-user-plus" /> Add patient</button></div></header>
      {error && <p className="bk-form-error" role="alert">{error}</p>}
      {loading ? <div className="pr-loading"><i className="fa-solid fa-spinner fa-spin" /> Loading patient records...</div> : visible.length ? <div className="pr-table-wrap"><table><thead><tr><th>Patient no.</th><th>Patient</th><th>Age / Sex</th><th>Contact</th><th>Record type</th><th>Last visit</th><th>Appointment</th><th /></tr></thead><tbody>{visible.map((patient) => <tr key={patient.id} onClick={() => openRecord(patient)}><td><strong>{patient.patientNo}</strong></td><td><div className="pr-name"><span>{initials(patient.fullName)}</span><div><strong>{patient.fullName}</strong><small>{patient.email || "No email"}</small></div></div></td><td><strong>{age(patient.dateOfBirth) === null ? "—" : `${age(patient.dateOfBirth)} yrs`}</strong><small>{patient.sex ? patient.sex.replaceAll("_", " ") : "Not recorded"}</small></td><td><strong>{patient.phone || "No contact"}</strong><small>{patient.address || "Address not recorded"}</small></td><td><em className={patient.linkedAccount ? "linked" : "manual"}>{patient.linkedAccount ? "Portal" : "Clinic"}</em></td><td>{patient.lastVisit ? new Date(`${patient.lastVisit}T00:00:00`).toLocaleDateString("en-PH", { dateStyle: "medium" }) : "No visit yet"}</td><td><button type="button" className="pr-convert-btn" onClick={(event) => { event.stopPropagation(); void bookNewAppointment(patient); }}><i className="fa-solid fa-calendar-plus" /> {patient.linkedAccount ? "Book new appointment" : "Convert to appointment"}</button></td><td><button type="button" aria-label={`Open ${patient.fullName}`}><i className="fa-solid fa-chevron-right" /></button></td></tr>)}</tbody></table></div> : <div className="pr-loading"><i className="fa-regular fa-folder-open" /> No patient records match your filters.</div>}
      {!loading && filtered.length > 0 && <div className="dk-pagination"><label>Rows per page<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label><span>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}</span><nav aria-label="Patient record pages"><button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => value - 1)} aria-label="Previous page"><i className="fa-solid fa-chevron-left"/></button>{Array.from({length:pageCount},(_,index)=>index+1).filter(number=>number===1||number===pageCount||Math.abs(number-currentPage)<=1).map((number,index,array)=><span key={number}>{index>0&&number-array[index-1]>1&&<em>…</em>}<button type="button" className={number===currentPage?"active":""} onClick={()=>setPage(number)}>{number}</button></span>)}<button type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => value + 1)} aria-label="Next page"><i className="fa-solid fa-chevron-right"/></button></nav></div>}
    </section>

    {adding && <div className="pa-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="add-patient-title"><form className="pr-add-card" onSubmit={addPatient}><header><div><small>Clinic record · Step {addStep} of 3</small><h2 id="add-patient-title">Add a manual patient</h2></div><button type="button" onClick={()=>setAdding(false)} aria-label="Close"><i className="fa-solid fa-xmark"/></button></header><nav className="pr-add-steps">{["Personal","Contact & Emergency","Medical Record"].map((label,index)=><button type="button" key={label} className={addStep===index+1?"active":addStep>index+1?"done":""} onClick={()=>setAddStep(index+1)}><b>{addStep>index+1?<i className="fa-solid fa-check"/>:index+1}</b><span>{label}</span></button>)}</nav><div className="pr-form-grid">
      {addStep===1&&<><label className="wide"><span>Full name *</span><input value={newPatient.fullName} onChange={e=>setNewPatient({...newPatient,fullName:e.target.value})} required/></label><label><span>Birth date</span><input type="date" value={newPatient.dateOfBirth} onChange={e=>setNewPatient({...newPatient,dateOfBirth:e.target.value})}/></label><label><span>Sex</span><select value={newPatient.sex} onChange={e=>setNewPatient({...newPatient,sex:e.target.value})}><option value="">Not recorded</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option></select></label><label><span>Civil status</span><input value={newPatient.civilStatus} onChange={e=>setNewPatient({...newPatient,civilStatus:e.target.value})}/></label><label><span>Blood type</span><input value={newPatient.bloodType} onChange={e=>setNewPatient({...newPatient,bloodType:e.target.value})}/></label></>}
      {addStep===2&&<><label><span>Email</span><input type="email" value={newPatient.email} onChange={e=>setNewPatient({...newPatient,email:e.target.value})}/></label><label><span>Mobile number</span><input value={newPatient.phone} onChange={e=>setNewPatient({...newPatient,phone:e.target.value})}/></label><label className="wide"><span>Address</span><textarea value={newPatient.address} onChange={e=>setNewPatient({...newPatient,address:e.target.value})}/></label><label><span>Emergency contact</span><input value={newPatient.emergencyContactName} onChange={e=>setNewPatient({...newPatient,emergencyContactName:e.target.value})}/></label><label><span>Emergency number</span><input value={newPatient.emergencyContactPhone} onChange={e=>setNewPatient({...newPatient,emergencyContactPhone:e.target.value})}/></label></>}
      {addStep===3&&<><label className="wide"><span>Allergies</span><textarea value={newPatient.allergies} onChange={e=>setNewPatient({...newPatient,allergies:e.target.value})}/></label><label className="wide"><span>Medical history</span><textarea value={newPatient.medicalHistory} onChange={e=>setNewPatient({...newPatient,medicalHistory:e.target.value})}/></label><label className="wide"><span>Current medications</span><textarea value={newPatient.currentMedications} onChange={e=>setNewPatient({...newPatient,currentMedications:e.target.value})}/></label><label className="wide"><span>Internal notes</span><textarea value={newPatient.notes} onChange={e=>setNewPatient({...newPatient,notes:e.target.value})}/></label></>}
    </div>{error&&<p className="bk-form-error">{error}</p>}<footer><button type="button" className="dk-btn dk-btn-outline" onClick={()=>addStep===1?setAdding(false):setAddStep(value=>value-1)}>{addStep===1?"Cancel":"Back"}</button>{addStep<3?<button type="button" className="dk-btn dk-btn-pink" disabled={addStep===1&&!newPatient.fullName.trim()} onClick={()=>setAddStep(value=>value+1)}>Continue</button>:<button type="submit" className="dk-btn dk-btn-pink" disabled={saving||!newPatient.fullName.trim()}>{saving?"Adding…":"Add patient"}</button>}</footer></form></div>}
  </div>;
}
