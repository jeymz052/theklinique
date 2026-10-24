import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { clinicalDatabase, clinicalUser } from "@/lib/clinicalServer";
import type { MedicalDocument } from "@/lib/consultation";

export const pdfCookieName = "klinique_pdf";
export const pdfPath = (id: string) => `/api/medical-documents/${encodeURIComponent(id)}/pdf`;
export const validDocumentId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

function signature(value: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Document downloads are not configured.");
  return createHmac("sha256", secret).update(`medical-document-download:${value}`).digest("base64url");
}

export function downloadTicket(userId: string, documentId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ userId, documentId, expires: now + 300_000, nonce: randomUUID() })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function readDownloadTicket(value: string, documentId: string, now = Date.now()): string | null {
  try {
    if (value.length > 1500) return null;
    const [payload, signed, extra] = value.split(".");
    if (!payload || !signed || extra) return null;
    const expected = Buffer.from(signature(payload)), actual = Buffer.from(signed);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return decoded.documentId === documentId && typeof decoded.userId === "string" && decoded.expires > now && decoded.expires <= now + 300_000 ? decoded.userId : null;
  } catch { return null; }
}

export async function documentAccess(request: Request, id: string, ticket?: string) {
  if (!validDocumentId(id)) return null;
  const db = clinicalDatabase();
  let auth = await clinicalUser(request);
  if (!auth && ticket) {
    const userId = readDownloadTicket(ticket, id);
    if (!userId) return null;
    const { data, error } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (error) throw error;
    if (data) auth = { user: { id: userId } as NonNullable<typeof auth>["user"], role: data.role, isDoctor: ["doctor", "superadmin"].includes(data.role) };
  }
  if (!auth || (!auth.isDoctor && auth.role !== "patient")) return null;
  const { data, error } = await db.from("medical_documents").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const document = data as MedicalDocument;
  if (!auth.isDoctor) {
    if (!document.released_to_patient) return null;
    const client = await db.from("clients").select("id").eq("id", document.client_id).eq("auth_user_id", auth.user.id).maybeSingle();
    if (client.error) throw client.error;
    if (!client.data) return null;
  }
  return { db, auth, document };
}
