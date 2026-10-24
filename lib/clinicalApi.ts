import { supabase } from "@/lib/supabase";

export async function clinicalApi(path: string, options?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Your session expired. Please sign in again.");
  const response = await fetch(path, { ...options, cache: "no-store", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}`, ...options?.headers } });
  if (!response.headers.get("content-type")?.toLowerCase().includes("json")) {
    if (response.status === 401) throw new Error("Your session expired. Please sign in again.");
    if (response.status === 404) throw new Error("This action is unavailable. Refresh the page and try again.");
    throw new Error("The server could not complete this action. Please try again.");
  }
  let result;
  try { result = await response.json(); }
  catch { throw new Error("The server returned an incomplete response. Please try again."); }
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("The server returned an unexpected response. Please try again.");
  if (!response.ok) throw new Error(result.error || "Unable to complete this request.");
  return result;
}
