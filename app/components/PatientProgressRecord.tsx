/* eslint-disable @next/next/no-img-element -- Clinical photos use private expiring URLs and are never sent to a public image optimizer. */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { clinicalApi } from "@/lib/clinicalApi";
import { clinicDate, clinicalDateLabel, type PatientPhoto, type PatientPhotoKind, type PatientProgressData } from "@/lib/patientProgress";

async function resizeForUpload(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 20 * 1024 * 1024) throw new Error("Choose a JPG, PNG or WebP image up to 20 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to prepare this photo.");
    context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Unable to prepare this photo.")), "image/jpeg", .9));
    return new File([blob], "clinical-photo.jpg", { type: "image/jpeg" });
  } finally { bitmap.close(); }
}

export default function PatientProgressRecord({ clientId, patientName, appointmentId, visitDate, showTreatmentPhotos }: { clientId: string; patientName: string; appointmentId: string; visitDate: string; showTreatmentPhotos: boolean }) {
  const [data, setData] = useState<PatientProgressData>({ photos: [], entries: [] });
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false), [noteOpen, setNoteOpen] = useState(false);
  const [takenOn, setTakenOn] = useState(clinicDate), [photoKind, setPhotoKind] = useState<PatientPhotoKind>("before"), [area, setArea] = useState(""), [caption, setCaption] = useState("");
  const [files, setFiles] = useState<File[]>([]), [fileKey, setFileKey] = useState(0);
  const [noteDate, setNoteDate] = useState(visitDate), [description, setDescription] = useState(""), [followUpDate, setFollowUpDate] = useState(""), [followUpNotes, setFollowUpNotes] = useState("");
  const [areaFilter, setAreaFilter] = useState(""), [kindFilter, setKindFilter] = useState("all"), [beforeId, setBeforeId] = useState(""), [afterId, setAfterId] = useState("");
  const profileInput = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => { const result = await clinicalApi(`/api/patient-progress?clientId=${encodeURIComponent(clientId)}${showTreatmentPhotos ? "" : "&photos=profile"}`); return result as PatientProgressData; }, [clientId, showTreatmentPhotos]);
  useEffect(() => {
    let active = true;
    const refresh = () => load().then(value => { if (active) { setData(value); setError(""); } }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    void refresh(); window.addEventListener("focus", refresh); const timer = window.setInterval(refresh, 50 * 60_000);
    return () => { active = false; window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, [load]);
  const profile = data.photos.find(photo => photo.kind === "profile");
  const allPhotos = data.photos.filter(photo => photo.kind !== "profile");
  const photos = allPhotos.filter(photo => !areaFilter || photo.area === areaFilter);
  const before = photos.find(photo => photo.id === beforeId) || photos.filter(photo => photo.kind === "before").at(-1) || photos.at(-1);
  const after = photos.find(photo => photo.id === afterId) || photos.find(photo => photo.kind === "after") || photos.find(photo => photo.id !== before?.id);
  const followUps = data.entries.filter(entry => entry.followUpDate || entry.bookedFollowUpDate).sort((a, b) => (b.followUpDate || b.bookedFollowUpDate || "").localeCompare(a.followUpDate || a.bookedFollowUpDate || ""));

  async function upload(selectedFiles: File[], kind: PatientPhotoKind) {
    if (!selectedFiles.length) return;
    if (kind !== "profile" && !showTreatmentPhotos) return;
    if (selectedFiles.length > 8) { setError("Upload up to eight treatment photos at a time."); return; }
    setBusy(true); setError(""); setMessage("");
    let uploaded = 0;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session expired. Please sign in again.");
      for (const file of selectedFiles) {
        const body = new FormData(); body.set("file", await resizeForUpload(file)); body.set("clientId", clientId); body.set("appointmentId", appointmentId); body.set("kind", kind); body.set("takenOn", kind === "profile" ? clinicDate() : takenOn); body.set("area", kind === "profile" ? "" : area); body.set("description", kind === "profile" ? "Patient profile photo" : caption);
        const response = await fetch("/api/patient-progress", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || "Unable to upload this photo."); uploaded++;
      }
      setData(await load()); setFiles([]); setFileKey(value => value + 1); setUploadOpen(false); setCaption("");
      setMessage(kind === "profile" ? "Patient profile photo saved." : `${uploaded} dated treatment photo${uploaded === 1 ? "" : "s"} saved.`);
    } catch (error) {
      setError(`${uploaded ? `${uploaded} photo(s) saved. ` : ""}${(error as Error).message}`);
      if (uploaded) { setFiles(selectedFiles.slice(uploaded)); try { setData(await load()); } catch { /* Keep the upload error visible. */ } }
    } finally { setBusy(false); if (profileInput.current) profileInput.current.value = ""; }
  }
  async function saveNote(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      await clinicalApi("/api/patient-progress", { method: "POST", body: JSON.stringify({ clientId, appointmentId, visitDate: noteDate, description, followUpDate, followUpNotes }) });
      setData(await load()); setDescription(""); setFollowUpDate(""); setFollowUpNotes(""); setNoteOpen(false); setMessage("Procedure / progress note and follow-up date saved.");
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  function photoFigure(photo: PatientPhoto | undefined, label: string) {
    return <figure className="progress-comparison-photo"><span>{label}</span>{photo ? <><a href={photo.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${label.toLowerCase()} photo from ${photo.taken_on}`}><img src={photo.url} alt={`${label}: ${photo.area || "treatment"}, ${photo.taken_on}`} /></a><figcaption><strong>{clinicalDateLabel(photo.taken_on)}</strong><small>{photo.area || "Treatment photo"} · {photo.kind}</small>{photo.description && <p>{photo.description}</p>}</figcaption></> : <div className="progress-photo-placeholder"><i aria-hidden="true" className="fa-regular fa-image" /><p>Add a dated {label.toLowerCase()} photo.</p></div>}</figure>;
  }
  return <section className="patient-progress-record" aria-label="Patient photos and progress">
    <header className="progress-profile-card"><div className="progress-avatar">{profile ? <img src={profile.url} alt={`Profile photo of ${patientName}`} /> : <span>{patientName.split(" ").filter(Boolean).map(word => word[0]).slice(0, 2).join("")}</span>}</div><div><p className="dk-welcome-label">Patient progress record</p><h2>{patientName}</h2><p>{profile ? `Profile photo · ${clinicalDateLabel(profile.taken_on)}` : "Add a patient profile photo"}</p><small>Shared across consultation and treatment visits.</small></div><button type="button" className="dk-btn dk-btn-outline" disabled={busy || loading} onClick={() => profileInput.current?.click()}><i aria-hidden="true" className="fa-solid fa-camera" /> {profile ? "Replace profile photo" : "Upload profile photo"}</button><input ref={profileInput} className="progress-hidden-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Patient profile photo" onChange={event => { if (event.target.files?.[0]) void upload([event.target.files[0]], "profile"); }} /></header>
    {error && <p className="bk-form-error" role="alert">{error}</p>}{message && <p className="clinical-success" role="status">{message}</p>}{busy && <p className="clinical-help" role="status">Saving patient record…</p>}
    {showTreatmentPhotos && <section className="clinical-record-card"><header><div><h3><i aria-hidden="true" className="fa-solid fa-images" /> Before & after improvements</h3><p>Dated clinical photos for comparison and follow-up.</p></div><button type="button" className="dk-btn dk-btn-pink" disabled={busy || loading} onClick={() => setUploadOpen(value => !value)}><i aria-hidden="true" className="fa-solid fa-plus" /> Add treatment photos</button></header>
      {uploadOpen && <form className="progress-entry-form" onSubmit={event => { event.preventDefault(); void upload(files, photoKind); }}><div className="rx-fields"><label>Photo date<input type="date" required value={takenOn} onChange={event => setTakenOn(event.target.value)} /></label><label>Photo type<select value={photoKind} onChange={event => setPhotoKind(event.target.value as PatientPhotoKind)}><option value="before">Before</option><option value="after">After</option><option value="progress">Progress</option></select></label><label className="wide">Treatment / body area<input value={area} onChange={event => setArea(event.target.value)} maxLength={150} placeholder="e.g. Cheeks, jawline, or treatment name" /></label><label className="wide">Photo description<textarea value={caption} onChange={event => setCaption(event.target.value)} maxLength={2000} placeholder="Describe the visible progress or the purpose of these photos." /></label><label className="wide">Treatment photo files<input key={fileKey} type="file" accept="image/jpeg,image/png,image/webp" multiple required onChange={event => setFiles(Array.from(event.target.files || []))} /></label></div><p className="clinical-help">JPG, PNG or WebP. Select up to eight photos; each receives the date, area and description above. Photos are stored in the private clinical record.</p><div className="clinical-actions"><button type="button" className="dk-btn dk-btn-outline" disabled={busy} onClick={() => setUploadOpen(false)}>Cancel</button><button className="dk-btn dk-btn-pink" disabled={busy || !files.length}>Upload treatment photos</button></div></form>}
      {loading ? <p className="clinical-help">Loading patient photos…</p> : <><div className="progress-photo-tools"><label>Compare treatment area<select value={areaFilter} onChange={event => { setAreaFilter(event.target.value); setBeforeId(""); setAfterId(""); }}><option value="">All treatment areas</option>{Array.from(new Set(allPhotos.map(photo => photo.area).filter(Boolean))).map(value => <option key={value} value={value}>{value}</option>)}</select></label><label>Before photo<select value={before?.id || ""} onChange={event => setBeforeId(event.target.value)}><option value="">Choose a photo</option>{photos.map(photo => <option key={photo.id} value={photo.id}>{photo.taken_on} · {photo.kind} · {photo.area || "Treatment"}</option>)}</select></label><label>After photo<select value={after?.id || ""} onChange={event => setAfterId(event.target.value)}><option value="">Choose a photo</option>{photos.map(photo => <option key={photo.id} value={photo.id}>{photo.taken_on} · {photo.kind} · {photo.area || "Treatment"}</option>)}</select></label></div><div className="progress-comparison">{photoFigure(before, "Before")}{photoFigure(after, "After")}</div><div className="clinical-filters" aria-label="Photo gallery filters">{["all", "before", "after", "progress"].map(kind => <button type="button" key={kind} className={kindFilter === kind ? "active" : ""} onClick={() => setKindFilter(kind)}>{kind === "all" ? "All photos" : kind[0].toUpperCase() + kind.slice(1)}</button>)}</div><div className="progress-photo-gallery">{photos.filter(photo => kindFilter === "all" || photo.kind === kindFilter).map(photo => <figure key={photo.id}><a href={photo.url} target="_blank" rel="noopener noreferrer"><img loading="lazy" src={photo.url} alt={`${photo.kind} ${photo.area || "treatment photo"} ${photo.taken_on}`} /></a><figcaption><b>{photo.kind}</b><strong>{clinicalDateLabel(photo.taken_on)}</strong><span>{photo.area}</span>{photo.description && <p>{photo.description}</p>}</figcaption></figure>)}</div>{!photos.length && <p className="clinical-help">No treatment photos yet. Add a before photo and a later progress or after photo to compare improvements.</p>}</>}
    </section>}
    <section className="clinical-record-card"><header><div><h3><i aria-hidden="true" className="fa-solid fa-notes-medical" /> Procedures & progress timeline</h3><p>Record what was done, the visit date, and the requested follow-up consultation.</p></div><button type="button" className="dk-btn dk-btn-outline" disabled={busy || loading} onClick={() => setNoteOpen(value => !value)}><i aria-hidden="true" className="fa-solid fa-pen" /> Add progress note</button></header>
      {noteOpen && <form className="progress-entry-form" onSubmit={saveNote}><div className="rx-fields"><label>Procedure / visit date<input type="date" required value={noteDate} onChange={event => setNoteDate(event.target.value)} /></label><label>Requested follow-up consultation date<input type="date" min={noteDate} value={followUpDate} onChange={event => setFollowUpDate(event.target.value)} /></label><label className="wide">Procedure / progress description<textarea required rows={4} maxLength={10000} value={description} onChange={event => setDescription(event.target.value)} placeholder="Describe the procedures performed that day, areas treated, and observed progress." /></label><label className="wide">Follow-up instructions<textarea maxLength={2000} value={followUpNotes} onChange={event => setFollowUpNotes(event.target.value)} placeholder="What should be reviewed at the follow-up consultation?" /></label></div><div className="clinical-actions"><button type="button" className="dk-btn dk-btn-outline" disabled={busy} onClick={() => setNoteOpen(false)}>Cancel</button><button className="dk-btn dk-btn-pink" disabled={busy || !description.trim()}>Save progress note</button></div></form>}
      {followUps.length > 0 && <section className="progress-follow-ups"><h4>Requested follow-up consultations</h4><p className="clinical-help">Requested dates are recommendations; booked appointments are shown separately.</p>{followUps.map(entry => <article key={entry.id}><i aria-hidden="true" className="fa-regular fa-calendar-check" /><div><strong>{clinicalDateLabel(entry.followUpDate || entry.bookedFollowUpDate || entry.date)}</strong><span>Requested after {clinicalDateLabel(entry.date)} · {entry.title}</span>{entry.followUpNotes && <p>{entry.followUpNotes}</p>}{entry.bookedFollowUpDate && <b>Appointment: {clinicalDateLabel(entry.bookedFollowUpDate)} · {entry.bookedFollowUpStatus}</b>}</div></article>)}</section>}
      <div className="progress-timeline">{data.entries.map(entry => <article key={entry.id}><span className="progress-timeline-dot" /><header><time dateTime={entry.date}>{clinicalDateLabel(entry.date)}</time><b>{entry.source === "note" ? "Progress note" : entry.source}</b></header><h4>{entry.title}</h4><p>{entry.description}</p>{entry.plan && <p><strong>Plan:</strong> {entry.plan}</p>}{entry.followUpDate && <small>Follow-up consultation requested: {clinicalDateLabel(entry.followUpDate)}</small>}</article>)}{!loading && !data.entries.length && <p className="clinical-help">No progress notes yet. Saved consultation charts and procedure notes will also appear here.</p>}</div>
    </section>
  </section>;
}
