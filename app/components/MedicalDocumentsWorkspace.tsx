"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { clinicalApi } from "@/lib/clinicalApi";
import type { MedicalDocument } from "@/lib/consultation";
import PrescriptionDocument from "./PrescriptionDocument";
import MedicalDocumentActions from "./MedicalDocumentActions";

const categories = [{ key: "all", name: "All documents" }, { key: "prescription", name: "Prescriptions" }, { key: "certificate", name: "Certificates" }, { key: "lab_request", name: "Lab requests" }, { key: "referral", name: "Referrals" }, { key: "consent", name: "Consents" }, { key: "aftercare", name: "Aftercare" }];

export default function MedicalDocumentsWorkspace({ doctor = false }: { doctor?: boolean }) {
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [patientId, setPatientId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [sort, setSort] = useState("newest");
  useEffect(() => {
    let active = true;
    const refresh = () => { void clinicalApi("/api/medical-documents").then(result => { if (active) { setDocuments(result.documents); setError(""); } }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); }); };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("medical-documents-refresh", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); window.removeEventListener("medical-documents-refresh", refresh); };
  }, []);
  const patients = useMemo(() => Array.from(new Map(documents.map(item => [item.client_id, { id: item.client_id, name: item.content.patient.name }])).values()).sort((a, b) => a.name.localeCompare(b.name)), [documents]);
  const visible = documents.filter(item => (category === "all" || item.document_type === category) && (!patientId || item.client_id === patientId) && [item.reference_no, item.title, item.content.patient.name].some(value => value.toLowerCase().includes(query.toLowerCase()))).sort((a, b) => sort === "oldest" ? a.issued_at.localeCompare(b.issued_at) : sort === "name" ? a.content.patient.name.localeCompare(b.content.patient.name) : b.issued_at.localeCompare(a.issued_at));
  const selected = visible.find(item => item.id === selectedId) || visible[0];
  return <div className="medical-documents-workspace"><section className="pr-hero"><div><p className="dk-welcome-label">{doctor ? "Clinical workspace" : "Patient portal"} / Documents</p><h1>{doctor ? "Clinic medical documents" : "Your medical documents"}</h1><span>{doctor ? "Browse issued documents across patient records and open the original prescription." : "Prescriptions and clinical documents released by your doctor, in one place."}</span></div><b className="clinical-pill">{documents.length} records</b></section>
    <nav className="clinical-filters" aria-label="Document type">{categories.map(item => <button type="button" key={item.key} className={category === item.key ? "active" : ""} onClick={() => { setCategory(item.key); setSelectedId(""); }}>{item.name}</button>)}</nav>
    {error && <p className="bk-form-error" role="alert">{error}</p>}
    {loading ? <div className="pr-loading">Loading medical documents…</div> : <div className="medical-documents-layout"><aside className="medical-documents-list"><header><h2>{doctor ? "Patient documents" : "Document library"}</h2><p>{visible.length} matching records</p><input aria-label="Search medical documents" value={query} onChange={e => setQuery(e.target.value)} placeholder={doctor ? "Search patient or document…" : "Search documents…"} />{doctor && <select aria-label="Filter by patient" value={patientId} onChange={e => setPatientId(e.target.value)}><option value="">All patients</option>{patients.map(patient => <option key={patient.id} value={patient.id}>{patient.name}</option>)}</select>}<select aria-label="Sort documents" value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Patient A–Z</option></select></header><div>{visible.map(item => <button type="button" key={item.id} className={selected?.id === item.id ? "active" : ""} onClick={() => setSelectedId(item.id)}><small>{item.reference_no}</small><strong>{item.title}</strong><span>{item.content.patient.name}</span><em>{new Date(item.issued_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" })}</em><b>{item.released_to_patient ? "Released to patient" : "Clinic copy"}</b></button>)}{!visible.length && <div className="clinical-empty"><i aria-hidden="true" className="fa-regular fa-folder-open" /><h3>{documents.length ? "No matching documents" : "No documents yet"}</h3><p>{doctor ? "Issued prescriptions appear here when you confirm them in the consultation workspace." : "Documents will appear here when your doctor releases them to your portal."}</p></div>}</div></aside><main className="medical-document-viewer">{selected ? <><header><div><p className="dk-welcome-label">{selected.document_type.replaceAll("_", " ")}</p><h2>{selected.reference_no}</h2><span>{selected.content.patient.name}</span></div><Link className="dk-btn dk-btn-outline" href={`/dashboard/medical-document?id=${selected.id}`} target="_blank">Open <i aria-hidden="true" className="fa-solid fa-arrow-up-right-from-square" /></Link><MedicalDocumentActions key={selected.id} document={selected} doctor={doctor} /></header><PrescriptionDocument content={selected.content} reference={selected.reference_no} issuedAt={selected.issued_at} /></> : <div className="clinical-empty"><i aria-hidden="true" className="fa-solid fa-file-medical" /><h3>Your document preview</h3><p>Select a document to view its original contents.</p></div>}</main></div>}
  </div>;
}
