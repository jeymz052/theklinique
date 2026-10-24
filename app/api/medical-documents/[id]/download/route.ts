import { NextResponse } from "next/server";
import { documentAccess, downloadTicket, pdfCookieName, pdfPath } from "@/lib/medicalDocumentsServer";
import { prescriptionPdfFilename } from "@/lib/prescriptionPdf";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const access = await documentAccess(request, id);
    if (!access) return NextResponse.json({ error: "This medical document is unavailable to your account." }, { status: 403 });
    if (access.document.document_type !== "prescription") return NextResponse.json({ error: "PDF export is available for prescriptions." }, { status: 400 });
    const response = NextResponse.json({ url: pdfPath(id), filename: prescriptionPdfFilename(access.document) }, { headers: { "Cache-Control": "private, no-store" } });
    // A native browser download can send this cookie without exposing auth tokens in URLs.
    response.cookies.set(pdfCookieName, downloadTicket(access.auth.user.id, id), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: pdfPath(id), maxAge: 300 });
    return response;
  } catch {
    return NextResponse.json({ error: "Unable to prepare your PDF. Please try again." }, { status: 500 });
  }
}
