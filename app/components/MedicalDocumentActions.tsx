"use client";

import { useRef, useState } from "react";
import { clinicalApi } from "@/lib/clinicalApi";
import type { MedicalDocument } from "@/lib/consultation";

export default function MedicalDocumentActions({ document, doctor = false }: { document: MedicalDocument; doctor?: boolean }) {
  const [busy, setBusy] = useState<"download" | "email" | "">("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const emailRequest = useRef("");
  if (document.document_type !== "prescription") return null;

  async function download() {
    setBusy("download"); setError(""); setMessage(""); setPdfUrl("");
    try {
      const result = await clinicalApi(`/api/medical-documents/${document.id}/download`, { method: "POST" });
      // Native same-origin downloads work without popups or public medical files.
      const link = window.document.createElement("a");
      link.href = result.url; link.download = result.filename;
      window.document.body.appendChild(link); link.click(); link.remove();
      setPdfUrl(result.url);
      setMessage("PDF ready. On iPhone, you can save it to Files from the PDF viewer's Share menu.");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to download the PDF."); }
    finally { setBusy(""); }
  }

  async function email() {
    setBusy("email"); setError(""); setMessage("");
    emailRequest.current ||= crypto.randomUUID();
    try {
      const result = await clinicalApi(`/api/medical-documents/${document.id}/email`, { method: "POST", body: JSON.stringify({ requestId: emailRequest.current }) });
      emailRequest.current = "";
      setMessage(`Prescription PDF email queued for ${result.email}.`);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to email the PDF."); }
    finally { setBusy(""); }
  }

  return <div className="medical-document-actions"><div>
    {doctor && document.released_to_patient && <button type="button" className="dk-btn dk-btn-outline" disabled={!!busy} onClick={email}><i aria-hidden="true" className="fa-solid fa-envelope" />{busy === "email" ? "Sending PDF…" : "Email to patient"}</button>}
    <button type="button" className="dk-btn dk-btn-pink" disabled={!!busy} onClick={download}><i aria-hidden="true" className="fa-solid fa-download" />{busy === "download" ? "Preparing PDF…" : "Download PDF"}</button>
  </div>{error && <p className="bk-form-error" role="alert">{error}</p>}{message && <p role="status">{message} {pdfUrl && <a href={pdfUrl} target="_blank" rel="noopener">Open PDF</a>}</p>}</div>;
}
