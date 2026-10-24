"use client";

import { useEffect, useState } from "react";
import { clinicalApi } from "@/lib/clinicalApi";
import type { MedicalDocument } from "@/lib/consultation";
import PrescriptionDocument from "@/app/components/PrescriptionDocument";
import MedicalDocumentActions from "@/app/components/MedicalDocumentActions";

export default function MedicalDocumentPage() {
  const [document, setDocument] = useState<MedicalDocument | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { const id = new URLSearchParams(window.location.search).get("id"); if (!id) { queueMicrotask(() => setError("Select a medical document from your portal.")); return; } let active = true; void clinicalApi(`/api/medical-documents?id=${encodeURIComponent(id)}`).then(result => { if (!active) return; if (!result.documents?.length) throw new Error("This document is unavailable or has not been released to your account."); setDocument(result.documents[0]); }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, []);
  return <main className="standalone-medical-document"><div className="document-print-toolbar"><strong>The Klinique · Medical document</strong><button className="dk-btn dk-btn-pink" disabled={!document} onClick={() => window.print()}><i className="fa-solid fa-print" /> Print</button>{document && <MedicalDocumentActions key={document.id} document={document} />}</div>{error ? <p className="bk-form-error" role="alert">{error}</p> : document ? <PrescriptionDocument content={document.content} reference={document.reference_no} issuedAt={document.issued_at} /> : <p className="pr-loading">Loading your document…</p>}</main>;
}
