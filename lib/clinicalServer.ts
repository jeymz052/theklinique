import { createClient } from "@supabase/supabase-js";

export function clinicalDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server credentials are not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function clinicalUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return null;
  const { data, error } = await createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } }).auth.getUser();
  if (error || !data.user) return null;
  const { data: profile, error: profileError } = await clinicalDatabase().from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (profileError) throw profileError;
  const role = String(profile?.role || data.user.app_metadata?.role || "patient");
  return { user: data.user, role, isDoctor: ["doctor", "superadmin"].includes(role) };
}
