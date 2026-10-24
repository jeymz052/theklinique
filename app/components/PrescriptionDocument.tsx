"use client";

import type { CSSProperties } from "react";
import type { PrescriptionContent } from "@/lib/consultation";
import { prescriptionAccent, prescriptionBodyMarkup, prescriptionClassName } from "@/lib/prescriptionDocument";

export default function PrescriptionDocument({ content, reference, issuedAt, preview = false }: { content: PrescriptionContent; reference: string; issuedAt?: string; preview?: boolean }) {
  // The PDF renderer uses this same escaped markup and prescription-document.css.
  return <article className={prescriptionClassName(preview)} style={{ "--rx-accent": prescriptionAccent(content.appearance.accentColor) } as CSSProperties} dangerouslySetInnerHTML={{ __html: prescriptionBodyMarkup({ content, reference, issuedAt, preview }) }} />;
}
