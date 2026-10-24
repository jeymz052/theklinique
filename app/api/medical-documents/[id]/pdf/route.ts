import { NextRequest, NextResponse } from "next/server";
import { documentAccess, pdfCookieName } from "@/lib/medicalDocumentsServer";
import { createPrescriptionPdf, prescriptionPdfFilename } from "@/lib/prescriptionPdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const access = await documentAccess(request, id, request.cookies.get(pdfCookieName)?.value);
    if (!access) return NextResponse.json({ error: "Return to Medical Documents and download the PDF again." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
    if (access.document.document_type !== "prescription") return NextResponse.json({ error: "PDF export is available for prescriptions." }, { status: 400 });
    const bytes = await createPrescriptionPdf(access.document), filename = prescriptionPdfFilename(access.document);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`, "Content-Length": String(bytes.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "Unable to generate the prescription PDF. Please try again." }, { status: 500 });
  }
}
