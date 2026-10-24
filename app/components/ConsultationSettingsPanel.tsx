/* eslint-disable @next/next/no-img-element -- Private signature data and local document artwork are rendered directly for printing. */
"use client";

import { useEffect, useState } from "react";
import { clinicalApi } from "@/lib/clinicalApi";
import { defaultConsultationSettings, type ConsultationSettings } from "@/lib/consultation";

export default function ConsultationSettingsPanel() {
  const [settings, setSettings] = useState<ConsultationSettings>(defaultConsultationSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [zoom, setZoom] = useState<{ configured: boolean; missing: string[] }>({ configured: false, missing: [] });
  const [checking, setChecking] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { let active = true; void clinicalApi("/api/consultation-settings").then(result => { if (active) { setSettings({ ...defaultConsultationSettings, ...result.settings }); if (result.zoom) setZoom(result.zoom); } }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  function update(key: keyof ConsultationSettings, value: string) { setSettings(current => ({ ...current, [key]: value })); setDirty(true); setMessage(""); }
  async function signature(file?: File) {
    if (!file) return;
    setError("");
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 280_000) { setError("Choose a PNG or JPG signature smaller than 280 KB."); return; }
    const reader = new FileReader();
    reader.onload = () => update("signature_data_url", String(reader.result));
    reader.onerror = () => setError("Unable to read this signature image.");
    reader.readAsDataURL(file);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try { const result = await clinicalApi("/api/consultation-settings", { method: "PUT", body: JSON.stringify(settings) }); setSettings({ ...defaultConsultationSettings, ...result.settings }); setDirty(false); setMessage("Meeting room and prescription settings saved."); }
    catch (error) { setError((error as Error).message); } finally { setSaving(false); }
  }
  async function checkZoom() {
    setChecking(true); setError(""); setMessage("");
    try { const result = await clinicalApi("/api/zoom/check", { method: "POST" }); setMessage(result.message); }
    catch (error) { setError((error as Error).message); } finally { setChecking(false); }
  }
  if (loading) return <div className="pr-loading">Loading consultation settings…</div>;
  return <form className="clinical-settings" onSubmit={save}>
    {error && <p className="bk-form-error" role="alert">{error}</p>}{message && <p className="clinical-success" role="status">{message}</p>}
    <section className="account-card zoom-room-settings"><header><span><i aria-hidden="true" className="fa-solid fa-video" /></span><div><h2>Online consultation room</h2><p>Zoom calls stay inside the patient and doctor portals.</p></div><b className="clinical-pill online">₱600 / visit</b></header>
      <div className="zoom-embedded-notice"><i aria-hidden="true" className="fa-solid fa-video" /><div><strong>Embedded Zoom</strong><p>The doctor starts the call here. Patients join from Online Consultation in their portal.</p></div></div>
      <div className="account-fields one"><label>Zoom meeting ID<input inputMode="numeric" value={settings.zoom_meeting_number} onChange={e => update("zoom_meeting_number", e.target.value)} placeholder="123 4567 8901" maxLength={20} /><small>One-time setup: enter the reusable meeting ID owned by the clinic’s Zoom account. This is the numeric ID shown in the meeting details in Zoom.</small></label></div>
      <p className="clinical-help">Enable the meeting’s waiting room and turn off required Zoom sign-in and registration. The doctor admits the scheduled patient when ready.</p>
      <div className="zoom-setup-status"><h3><i aria-hidden="true" className="fa-solid fa-shield-halved" /> Zoom connection</h3><p>{zoom.configured ? "Server credentials are configured. Save the meeting ID, then check the room and doctor hosting access." : "Server setup is required before calls can connect. Add the clinic’s Meeting SDK and Server-to-Server OAuth credentials to the server environment, then restart or redeploy."}</p>{!zoom.configured && zoom.missing.length > 0 && <details><summary>Missing environment variables</summary><ul>{zoom.missing.map(name => <li key={name}><code>{name}</code></li>)}</ul></details>}<div className="zoom-setup-actions"><button className="dk-btn dk-btn-pink" type="submit" disabled={saving || checking}>{saving ? "Saving…" : "Save room"}</button><button className="dk-btn dk-btn-outline" type="button" disabled={checking || saving || dirty || !zoom.configured || !settings.zoom_meeting_number} onClick={() => void checkZoom()}>{checking ? "Checking Zoom…" : "Check saved Zoom room"}</button></div>{dirty && <small>Save your changes before checking the room.</small>}</div>
      <ol className="zoom-visit-flow"><li><strong>Book & pay</strong><span>The patient books an online consultation and pays ₱600 through QR Ph.</span></li><li><strong>Start & join</strong><span>The doctor starts Zoom in Consultations. The patient’s Join button opens 15 minutes before the confirmed schedule.</span></li><li><strong>Consult & chart</strong><span>Keep the call open while moving between Patient record and Charting.</span></li><li><strong>Finalize</strong><span>Complete assessment, prescription when needed, and finalization. Released prescriptions appear in Medical Documents.</span></li></ol>
      <p className="clinical-help">Online and clinic visits use the same hours, blocked dates, and booking calendar.</p>
    </section>
    <section className="account-card"><header><span><i aria-hidden="true" className="fa-solid fa-file-prescription" /></span><div><h2>Prescription identity & signature</h2><p>Your saved signature and license details appear on issued prescriptions.</p></div></header><div className="account-fields"><label>PRC license number<input value={settings.prc_number} onChange={e => update("prc_number", e.target.value)} maxLength={50} /></label><label>Specialty / credentials<input value={settings.specialty} onChange={e => update("specialty", e.target.value)} maxLength={250} /></label><label className="wide">Signature image<input type="file" accept="image/png,image/jpeg" onChange={e => void signature(e.target.files?.[0])} /><small>PNG with a transparent background or JPG, up to 280 KB.</small></label>{settings.signature_data_url && <div className="signature-preview wide"><img src={settings.signature_data_url} alt="Saved doctor signature" /><button type="button" onClick={() => update("signature_data_url", "")}>Remove signature</button></div>}<label>Prescription heading<input value={settings.prescription_heading} onChange={e => update("prescription_heading", e.target.value)} maxLength={150} /></label><label>Accent color<input type="color" value={settings.accent_color} onChange={e => update("accent_color", e.target.value)} /></label><label className="wide">Custom footer<textarea value={settings.prescription_footer} onChange={e => update("prescription_footer", e.target.value)} maxLength={1500} placeholder="Optional clinic message on your prescriptions" /></label></div><p className="clinical-help">The clinic name, address, doctor name, and contact details come from General settings. Issued prescriptions keep the details and signature used at the time of issue.</p></section>
    <div className="clinical-actions"><button className="dk-btn dk-btn-pink" disabled={saving}>{saving ? "Saving…" : "Save consultation settings"}</button></div>
  </form>;
}
