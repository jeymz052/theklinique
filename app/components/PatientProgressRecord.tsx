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

function unique<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }

/** Generate object-URL previews for a list of files and return them. Caller must revoke URLs when done. */
function makePreviewUrls(files: File[]): string[] {
  return files.map(f => URL.createObjectURL(f));
}

type ReplaceTarget = { photo: PatientPhoto; slotKind: PatientPhotoKind };

export default function PatientProgressRecord({ clientId, patientName, appointmentId, visitDate, showTreatmentPhotos }: { clientId: string; patientName: string; appointmentId: string; visitDate: string; showTreatmentPhotos: boolean }) {
  const [data, setData] = useState<PatientProgressData>({ photos: [], entries: [] });
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false), [noteOpen, setNoteOpen] = useState(false);
  const [takenOn, setTakenOn] = useState(clinicDate), [photoKind, setPhotoKind] = useState<PatientPhotoKind>("before"), [area, setArea] = useState(""), [caption, setCaption] = useState("");
  const [files, setFiles] = useState<File[]>([]), [fileKey, setFileKey] = useState(0);
  const [previews, setPreviews] = useState<string[]>([]);
  const [noteDate, setNoteDate] = useState(visitDate), [description, setDescription] = useState(""), [followUpDate, setFollowUpDate] = useState(""), [followUpNotes, setFollowUpNotes] = useState("");

  // Filter state
  const [treatmentFilter, setTreatmentFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState("");

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Replace mode: which photo to replace
  const [replaceTarget, setReplaceTarget] = useState<ReplaceTarget | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const profileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const result = await clinicalApi(`/api/patient-progress?clientId=${encodeURIComponent(clientId)}${showTreatmentPhotos ? "" : "&photos=profile"}`);
    return result as PatientProgressData;
  }, [clientId, showTreatmentPhotos]);

  useEffect(() => {
    let active = true;
    const refresh = () => load().then(value => { if (active) { setData(value); setError(""); } }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    void refresh(); window.addEventListener("focus", refresh); const timer = window.setInterval(refresh, 50 * 60_000);
    return () => { active = false; window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, [load]);

  // Revoke preview URLs when they change to avoid memory leaks
  useEffect(() => {
    return () => { previews.forEach(url => URL.revokeObjectURL(url)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previews]);

  const profile = data.photos.find(photo => photo.kind === "profile");
  const allPhotos = data.photos.filter(photo => photo.kind !== "profile");
  const allAreas = unique(allPhotos.map(p => p.area).filter(Boolean));
  const allDates = unique(allPhotos.map(p => p.taken_on).filter(Boolean)).sort().reverse();

  const filteredPhotos = allPhotos.filter(photo => {
    const matchTreatment = !treatmentFilter || photo.area === treatmentFilter;
    const matchDate = !dateFilter || photo.taken_on === dateFilter;
    const matchKind = kindFilter === "all" || photo.kind === kindFilter;
    return matchTreatment && matchDate && matchKind;
  });

  const comparisonPool = allPhotos.filter(photo => {
    const matchTreatment = !treatmentFilter || photo.area === treatmentFilter;
    const matchDate = !dateFilter || photo.taken_on === dateFilter;
    return matchTreatment && matchDate;
  });
  const beforePhoto = comparisonPool.find(p => p.id === beforeId) || comparisonPool.filter(p => p.kind === "before").at(-1) || comparisonPool.at(-1);
  const afterPhoto = comparisonPool.find(p => p.id === afterId) || comparisonPool.find(p => p.kind === "after" && p.id !== beforePhoto?.id) || comparisonPool.find(p => p.id !== beforePhoto?.id);

  const followUps = data.entries.filter(entry => entry.followUpDate || entry.bookedFollowUpDate).sort((a, b) => (b.followUpDate || b.bookedFollowUpDate || "").localeCompare(a.followUpDate || a.bookedFollowUpDate || ""));

  function pickFiles(selectedFiles: File[]) {
    setFiles(selectedFiles);
    previews.forEach(url => URL.revokeObjectURL(url));
    setPreviews(makePreviewUrls(selectedFiles));
  }

  function clearUploadForm() {
    setFiles([]); setPreviews([]); setFileKey(v => v + 1); setCaption(""); setUploadOpen(false); setReplaceTarget(null);
  }

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
        const body = new FormData();
        body.set("file", await resizeForUpload(file));
        body.set("clientId", clientId);
        body.set("appointmentId", appointmentId);
        body.set("kind", kind);
        body.set("takenOn", kind === "profile" ? clinicDate() : takenOn);
        body.set("area", kind === "profile" ? "" : area);
        body.set("description", kind === "profile" ? "Patient profile photo" : caption);
        const response = await fetch("/api/patient-progress", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || "Unable to upload this photo."); uploaded++;
      }
      setData(await load());
      clearUploadForm();
      setMessage(kind === "profile" ? "Patient profile photo saved." : `${uploaded} dated treatment photo${uploaded === 1 ? "" : "s"} saved.`);
    } catch (err) {
      setError(`${uploaded ? `${uploaded} photo(s) saved. ` : ""}${(err as Error).message}`);
      if (uploaded) { setFiles(selectedFiles.slice(uploaded)); try { setData(await load()); } catch { /* Keep the upload error visible. */ } }
    } finally { setBusy(false); if (profileInput.current) profileInput.current.value = ""; if (replaceInput.current) replaceInput.current.value = ""; }
  }

  async function replacePhoto(file: File, target: ReplaceTarget) {
    setBusy(true); setError(""); setMessage("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session expired. Please sign in again.");
      // Upload the new photo using the SLOT kind (before/after), not the old photo's kind
      const body = new FormData();
      body.set("file", await resizeForUpload(file));
      body.set("clientId", clientId);
      body.set("appointmentId", target.photo.appointment_id || appointmentId);
      body.set("kind", target.slotKind);
      body.set("takenOn", target.photo.taken_on);
      body.set("area", target.photo.area);
      body.set("description", target.photo.description);
      const uploadRes = await fetch("/api/patient-progress", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body });
      const uploadResult = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadResult.error || "Unable to replace this photo.");
      // Delete the old photo now that the replacement is saved
      const deleteRes = await fetch("/api/patient-progress", { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ photoId: target.photo.id, clientId }) });
      if (!deleteRes.ok) { const d = await deleteRes.json(); console.warn("Old photo not removed:", d.error); }
      setData(await load()); setReplaceTarget(null);
      setMessage("Photo replaced successfully.");
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); if (replaceInput.current) replaceInput.current.value = ""; }
  }

  async function deletePhoto(photoId: string) {
    setBusy(true); setError(""); setMessage(""); setConfirmDeleteId(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session expired. Please sign in again.");
      const response = await fetch("/api/patient-progress", { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ photoId, clientId }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Unable to delete this photo.");
      setData(await load()); setMessage("Photo removed from the patient record.");
      if (beforeId === photoId) setBeforeId("");
      if (afterId === photoId) setAfterId("");
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  async function saveNote(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      await clinicalApi("/api/patient-progress", { method: "POST", body: JSON.stringify({ clientId, appointmentId, visitDate: noteDate, description, followUpDate, followUpNotes }) });
      setData(await load()); setDescription(""); setFollowUpDate(""); setFollowUpNotes(""); setNoteOpen(false); setMessage("Procedure / progress note and follow-up date saved.");
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  function photoCard(photo: PatientPhoto | undefined, label: string) {
    const kindColor = label === "Before" ? "var(--ppr-before)" : "var(--ppr-after)";
    return (
      <figure className="ppr-compare-card">
        <div className="ppr-compare-card__label" style={{ "--label-color": kindColor } as React.CSSProperties}>
          <span>{label}</span>
          {photo && <time>{clinicalDateLabel(photo.taken_on)}</time>}
        </div>
        {photo ? (
          <>
            <a href={photo.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${label.toLowerCase()} photo`} className="ppr-compare-card__img-wrap">
              <img src={photo.url} alt={`${label}: ${photo.area || "treatment"}, ${photo.taken_on}`} />
            </a>
            <figcaption className="ppr-compare-card__meta">
              {photo.area && <span className="ppr-compare-card__area"><i aria-hidden="true" className="fa-solid fa-tag" /> {photo.area}</span>}
              <span className="ppr-compare-card__kind">{photo.kind}</span>
              {photo.description && <p className="ppr-compare-card__caption">{photo.description}</p>}
              <div className="ppr-compare-card__actions">
                <button type="button" className="ppr-photo-action ppr-photo-action--replace" disabled={busy} title="Replace this photo" onClick={() => { setReplaceTarget({ photo, slotKind: label.toLowerCase() as PatientPhotoKind }); replaceInput.current?.click(); }}>
                  <i aria-hidden="true" className="fa-solid fa-arrow-rotate-right" /> Replace
                </button>
                <button type="button" className="ppr-photo-action ppr-photo-action--delete" disabled={busy} title="Remove this photo" onClick={() => setConfirmDeleteId(photo.id)}>
                  <i aria-hidden="true" className="fa-solid fa-trash" /> Remove
                </button>
              </div>
            </figcaption>
          </>
        ) : (
          <div className="ppr-photo-empty">
            <i aria-hidden="true" className="fa-regular fa-image" />
            <p>Add a dated {label.toLowerCase()} photo.</p>
          </div>
        )}
      </figure>
    );
  }

  return (
    <section className="patient-progress-record" aria-label="Patient photos and progress">
      {/* Hidden inputs */}
      <input ref={profileInput} className="progress-hidden-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Patient profile photo" onChange={event => { if (event.target.files?.[0]) void upload([event.target.files[0]], "profile"); }} />
      <input ref={replaceInput} className="progress-hidden-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Replace treatment photo" onChange={event => { if (event.target.files?.[0] && replaceTarget) void replacePhoto(event.target.files[0], replaceTarget); }} />

      {/* ── Delete confirmation dialog ─────────────────────── */}
      {confirmDeleteId && (
        <div className="ppr-confirm-overlay" role="dialog" aria-modal="true" aria-label="Confirm photo removal">
          <div className="ppr-confirm-dialog">
            <i aria-hidden="true" className="fa-solid fa-triangle-exclamation ppr-confirm-icon" />
            <h4>Remove this photo?</h4>
            <p>This clinical photo will be permanently deleted from the patient record and cannot be recovered.</p>
            <div className="ppr-confirm-actions">
              <button type="button" className="dk-btn dk-btn-outline" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
              <button type="button" className="dk-btn ppr-btn-danger" disabled={busy} onClick={() => void deletePhoto(confirmDeleteId)}>
                <i aria-hidden="true" className="fa-solid fa-trash" /> {busy ? "Removing…" : "Remove photo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Profile card ─────────────────────────────────── */}
      <header className="progress-profile-card">
        <div className="progress-avatar">
          {profile ? <img src={profile.url} alt={`Profile photo of ${patientName}`} /> : <span>{patientName.split(" ").filter(Boolean).map(word => word[0]).slice(0, 2).join("")}</span>}
        </div>
        <div>
          <p className="dk-welcome-label">Patient progress record</p>
          <h2>{patientName}</h2>
          <p>{profile ? `Profile photo · ${clinicalDateLabel(profile.taken_on)}` : "Add a patient profile photo"}</p>
          <small>Shared across consultation and treatment visits.</small>
        </div>
        <button type="button" className="dk-btn dk-btn-outline" disabled={busy || loading} onClick={() => profileInput.current?.click()}>
          <i aria-hidden="true" className="fa-solid fa-camera" /> {profile ? "Replace profile photo" : "Upload profile photo"}
        </button>
      </header>

      {error && <p className="bk-form-error" role="alert">{error}</p>}
      {message && <p className="clinical-success" role="status">{message}</p>}
      {busy && <p className="clinical-help" role="status">Saving patient record…</p>}

      {/* ── Before & After ───────────────────────────────── */}
      {showTreatmentPhotos && (
        <section className="clinical-record-card ppr-ba-section">
          <header className="ppr-ba-header">
            <div>
              <h3><i aria-hidden="true" className="fa-solid fa-images" /> Before &amp; after improvements</h3>
              <p>Dated clinical photos — filter by treatment or date to compare progress.</p>
            </div>
            <button type="button" className="dk-btn dk-btn-pink" disabled={busy || loading} onClick={() => { setUploadOpen(v => !v); setReplaceTarget(null); }}>
              <i aria-hidden="true" className="fa-solid fa-plus" /> Add treatment photos
            </button>
          </header>

          {/* ── Upload form ──────────────────────────────── */}
          {uploadOpen && (
            <form className="ppr-upload-form" onSubmit={event => { event.preventDefault(); void upload(files, photoKind); }}>
              <div className="ppr-upload-form__title">
                <i aria-hidden="true" className="fa-solid fa-cloud-arrow-up" />
                <h4>Upload treatment photos</h4>
              </div>

              <div className="ppr-upload-form__grid">
                <label className="ppr-upload-field">
                  <span><i aria-hidden="true" className="fa-regular fa-calendar" /> Photo date</span>
                  <input type="date" required value={takenOn} onChange={event => setTakenOn(event.target.value)} />
                </label>
                <label className="ppr-upload-field">
                  <span><i aria-hidden="true" className="fa-solid fa-layer-group" /> Photo type</span>
                  <select value={photoKind} onChange={event => setPhotoKind(event.target.value as PatientPhotoKind)}>
                    <option value="before">Before</option>
                    <option value="after">After</option>
                    <option value="progress">Progress</option>
                  </select>
                </label>

                <label className="ppr-upload-field ppr-upload-field--wide">
                  <span><i aria-hidden="true" className="fa-solid fa-tag" /> Treatment / body area</span>
                  {allAreas.length > 0 ? (
                    <div className="ppr-upload-field__combo">
                      <select value={area} onChange={e => setArea(e.target.value)}>
                        <option value="">— Type or choose —</option>
                        {allAreas.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                      <input value={area} onChange={e => setArea(e.target.value)} maxLength={150} placeholder="or type a new area…" />
                    </div>
                  ) : (
                    <input value={area} onChange={e => setArea(e.target.value)} maxLength={150} placeholder="e.g. Cheeks, jawline, or treatment name" />
                  )}
                </label>

                <label className="ppr-upload-field ppr-upload-field--wide">
                  <span><i aria-hidden="true" className="fa-regular fa-pen-to-square" /> Photo description</span>
                  <textarea value={caption} onChange={event => setCaption(event.target.value)} maxLength={2000} rows={2} placeholder="Describe the visible progress or the purpose of these photos." />
                </label>

                {/* File picker + previews */}
                <div className="ppr-upload-field ppr-upload-field--wide ppr-upload-file-label">
                  <span className="ppr-upload-field-span"><i aria-hidden="true" className="fa-solid fa-images" /> Treatment photo files <small>(JPG / PNG / WebP · up to 8 · 20 MB each)</small></span>
                  <input key={fileKey} type="file" accept="image/jpeg,image/png,image/webp" multiple required onChange={event => pickFiles(Array.from(event.target.files || []))} />
                  {files.length > 0 && <span className="ppr-upload-file-count"><i aria-hidden="true" className="fa-solid fa-check" /> {files.length} file{files.length !== 1 ? "s" : ""} selected</span>}
                </div>

                {/* Preview grid */}
                {previews.length > 0 && (
                  <div className="ppr-upload-field ppr-upload-field--wide">
                    <span className="ppr-upload-field-span"><i aria-hidden="true" className="fa-solid fa-eye" /> Preview</span>
                    <div className="ppr-preview-grid">
                      {previews.map((url, i) => (
                        <div key={url} className="ppr-preview-item">
                          <img src={url} alt={`Preview ${i + 1}`} />
                          <button
                            type="button"
                            className="ppr-preview-remove"
                            aria-label={`Remove photo ${i + 1} from selection`}
                            onClick={() => {
                              const next = files.filter((_, j) => j !== i);
                              pickFiles(next);
                              if (!next.length) setFileKey(v => v + 1);
                            }}
                          >
                            <i aria-hidden="true" className="fa-solid fa-xmark" />
                          </button>
                          <span className="ppr-preview-name">{files[i].name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="ppr-upload-form__actions">
                <button type="button" className="dk-btn dk-btn-outline" disabled={busy} onClick={clearUploadForm}>Cancel</button>
                <button className="dk-btn dk-btn-pink" disabled={busy || !files.length}>
                  <i aria-hidden="true" className="fa-solid fa-cloud-arrow-up" /> {busy ? "Uploading…" : `Upload ${files.length || ""} photo${files.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            </form>
          )}

          {loading ? <p className="clinical-help">Loading patient photos…</p> : (
            <>
              {/* ── Filter bar ──────────────────────────────── */}
              <div className="ppr-filter-bar">
                <label className="ppr-filter-label">
                  <i aria-hidden="true" className="fa-solid fa-tag" /> Treatment
                  <select value={treatmentFilter} onChange={e => { setTreatmentFilter(e.target.value); setBeforeId(""); setAfterId(""); }}>
                    <option value="">All treatments</option>
                    {allAreas.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
                <label className="ppr-filter-label">
                  <i aria-hidden="true" className="fa-regular fa-calendar" /> Date
                  <select value={dateFilter} onChange={e => { setDateFilter(e.target.value); setBeforeId(""); setAfterId(""); }}>
                    <option value="">All dates</option>
                    {allDates.map(d => <option key={d} value={d}>{clinicalDateLabel(d)}</option>)}
                  </select>
                </label>
                <label className="ppr-filter-label">
                  <i aria-hidden="true" className="fa-solid fa-layer-group" /> Type
                  <select value={kindFilter} onChange={e => setKindFilter(e.target.value)}>
                    <option value="all">All types</option>
                    <option value="before">Before</option>
                    <option value="after">After</option>
                    <option value="progress">Progress</option>
                  </select>
                </label>
                {(treatmentFilter || dateFilter || kindFilter !== "all") && (
                  <button type="button" className="ppr-filter-clear" onClick={() => { setTreatmentFilter(""); setDateFilter(""); setKindFilter("all"); setBeforeId(""); setAfterId(""); }}>
                    <i aria-hidden="true" className="fa-solid fa-xmark" /> Clear filters
                  </button>
                )}
              </div>

              {/* ── Comparison panel ─────────────────────────── */}
              <div className="ppr-compare-panel">
                <div className="ppr-compare-selectors">
                  <label className="ppr-compare-sel-label">
                    <span className="ppr-before-dot" /> Before photo
                    <select value={beforePhoto?.id || ""} onChange={e => setBeforeId(e.target.value)}>
                      <option value="">Choose a before photo</option>
                      {comparisonPool.map(p => <option key={p.id} value={p.id}>{clinicalDateLabel(p.taken_on)} · {p.kind} · {p.area || "Treatment"}</option>)}
                    </select>
                  </label>
                  <label className="ppr-compare-sel-label">
                    <span className="ppr-after-dot" /> After photo
                    <select value={afterPhoto?.id || ""} onChange={e => setAfterId(e.target.value)}>
                      <option value="">Choose an after photo</option>
                      {comparisonPool.map(p => <option key={p.id} value={p.id}>{clinicalDateLabel(p.taken_on)} · {p.kind} · {p.area || "Treatment"}</option>)}
                    </select>
                  </label>
                </div>
                <div className="ppr-compare-grid">
                  {photoCard(beforePhoto, "Before")}
                  {photoCard(afterPhoto, "After")}
                </div>
              </div>

              {/* ── Photo gallery ───────────────────────────── */}
              {filteredPhotos.length > 0 ? (
                <div className="ppr-gallery">
                  <p className="ppr-gallery-heading">
                    <i aria-hidden="true" className="fa-solid fa-grip" />
                    {filteredPhotos.length} photo{filteredPhotos.length !== 1 ? "s" : ""}
                    {treatmentFilter && ` · ${treatmentFilter}`}
                    {dateFilter && ` · ${clinicalDateLabel(dateFilter)}`}
                    {kindFilter !== "all" && ` · ${kindFilter}`}
                  </p>
                  <div className="progress-photo-gallery ppr-gallery-grid">
                    {filteredPhotos.map(photo => (
                      <figure key={photo.id} className="ppr-gallery-figure">
                        <a href={photo.url} target="_blank" rel="noopener noreferrer">
                          <img loading="lazy" src={photo.url} alt={`${photo.kind} ${photo.area || "treatment photo"} ${photo.taken_on}`} />
                        </a>
                        <figcaption>
                          <b>{photo.kind}</b>
                          <strong>{clinicalDateLabel(photo.taken_on)}</strong>
                          {photo.area && <span>{photo.area}</span>}
                          {photo.description && <p>{photo.description}</p>}
                        </figcaption>
                        {/* Hover action overlay */}
                        <div className="ppr-gallery-overlay">
                          <button type="button" className="ppr-gallery-action ppr-gallery-action--replace" disabled={busy} title="Replace" onClick={() => { setReplaceTarget({ photo, slotKind: photo.kind }); replaceInput.current?.click(); }}>
                            <i aria-hidden="true" className="fa-solid fa-arrow-rotate-right" />
                          </button>
                          <button type="button" className="ppr-gallery-action ppr-gallery-action--delete" disabled={busy} title="Remove" onClick={() => setConfirmDeleteId(photo.id)}>
                            <i aria-hidden="true" className="fa-solid fa-trash" />
                          </button>
                        </div>
                      </figure>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="clinical-help ppr-empty-gallery">
                  {allPhotos.length === 0
                    ? "No treatment photos yet. Add a before photo and a later progress or after photo to compare improvements."
                    : "No photos match the current filters. Try adjusting the treatment, date, or type filter above."}
                </p>
              )}
            </>
          )}
        </section>
      )}

      {/* ── Progress notes & timeline ─────────────────────── */}
      <section className="clinical-record-card">
        <header>
          <div>
            <h3><i aria-hidden="true" className="fa-solid fa-notes-medical" /> Procedures &amp; progress timeline</h3>
            <p>Record what was done, the visit date, and the requested follow-up consultation.</p>
          </div>
          <button type="button" className="dk-btn dk-btn-outline" disabled={busy || loading} onClick={() => setNoteOpen(value => !value)}>
            <i aria-hidden="true" className="fa-solid fa-pen" /> Add progress note
          </button>
        </header>
        {noteOpen && (
          <form className="progress-entry-form" onSubmit={saveNote}>
            <div className="rx-fields">
              <label>Procedure / visit date<input type="date" required value={noteDate} onChange={event => setNoteDate(event.target.value)} /></label>
              <label>Requested follow-up consultation date<input type="date" min={noteDate} value={followUpDate} onChange={event => setFollowUpDate(event.target.value)} /></label>
              <label className="wide">Procedure / progress description<textarea required rows={4} maxLength={10000} value={description} onChange={event => setDescription(event.target.value)} placeholder="Describe the procedures performed that day, areas treated, and observed progress." /></label>
              <label className="wide">Follow-up instructions<textarea maxLength={2000} value={followUpNotes} onChange={event => setFollowUpNotes(event.target.value)} placeholder="What should be reviewed at the follow-up consultation?" /></label>
            </div>
            <div className="clinical-actions">
              <button type="button" className="dk-btn dk-btn-outline" disabled={busy} onClick={() => setNoteOpen(false)}>Cancel</button>
              <button className="dk-btn dk-btn-pink" disabled={busy || !description.trim()}>Save progress note</button>
            </div>
          </form>
        )}
        {followUps.length > 0 && (
          <section className="progress-follow-ups">
            <h4>Requested follow-up consultations</h4>
            <p className="clinical-help">Requested dates are recommendations; booked appointments are shown separately.</p>
            {followUps.map(entry => (
              <article key={entry.id}>
                <i aria-hidden="true" className="fa-regular fa-calendar-check" />
                <div>
                  <strong>{clinicalDateLabel(entry.followUpDate || entry.bookedFollowUpDate || entry.date)}</strong>
                  <span>Requested after {clinicalDateLabel(entry.date)} · {entry.title}</span>
                  {entry.followUpNotes && <p>{entry.followUpNotes}</p>}
                  {entry.bookedFollowUpDate && <b>Appointment: {clinicalDateLabel(entry.bookedFollowUpDate)} · {entry.bookedFollowUpStatus}</b>}
                </div>
              </article>
            ))}
          </section>
        )}
        <div className="progress-timeline">
          {data.entries.map(entry => (
            <article key={entry.id}>
              <span className="progress-timeline-dot" />
              <header>
                <time dateTime={entry.date}>{clinicalDateLabel(entry.date)}</time>
                <b>{entry.source === "note" ? "Progress note" : entry.source}</b>
              </header>
              <h4>{entry.title}</h4>
              <p>{entry.description}</p>
              {entry.plan && <p><strong>Plan:</strong> {entry.plan}</p>}
              {entry.followUpDate && <small>Follow-up consultation requested: {clinicalDateLabel(entry.followUpDate)}</small>}
            </article>
          ))}
          {!loading && !data.entries.length && <p className="clinical-help">No progress notes yet. Saved consultation charts and procedure notes will also appear here.</p>}
        </div>
      </section>
    </section>
  );
}
