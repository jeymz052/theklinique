import { supabase } from "@/lib/supabase";

export type AppNotification = { id: string; title: string; body: string; href: string; read_at: string | null; created_at: string };

async function headers(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export async function fetchNotifications() {
  const response = await fetch("/api/notifications", { headers: await headers() });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to load notifications.");
  return result.notifications as AppNotification[];
}

export async function markNotificationRead(id?: string) {
  await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json", ...(await headers()) }, body: JSON.stringify(id ? { id } : { all: true }) });
}
