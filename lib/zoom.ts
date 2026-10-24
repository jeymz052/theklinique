import { createHmac } from "node:crypto";

// Import only from server routes. No credential uses NEXT_PUBLIC_.
const credentialNames = ["ZOOM_MEETING_SDK_CLIENT_ID", "ZOOM_MEETING_SDK_CLIENT_SECRET", "ZOOM_ACCOUNT_ID", "ZOOM_SERVER_TO_SERVER_CLIENT_ID", "ZOOM_SERVER_TO_SERVER_CLIENT_SECRET"] as const;
export function zoomConfiguration() {
  const missing = credentialNames.filter(name => !process.env[name]?.trim());
  return { configured: missing.length === 0, missing };
}

export class ZoomError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

export function zoomSignature(meetingNumber: string, role: 0 | 1, now = Date.now()) {
  const appKey = process.env.ZOOM_MEETING_SDK_CLIENT_ID;
  const secret = process.env.ZOOM_MEETING_SDK_CLIENT_SECRET;
  if (!appKey || !secret) throw new ZoomError("Embedded Zoom has not been configured by the clinic.", 503);
  const iat = Math.floor(now / 1000) - 30;
  // Keep the expiry at least 30 minutes ahead even with the backdated iat.
  const exp = Math.floor(now / 1000) + 1800;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ appKey, mn: meetingNumber, role, iat, exp, tokenExp: exp })}`;
  return `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
}

async function zoomFetch(url: string, init: RequestInit) {
  try { return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(12_000) }); }
  catch { throw new ZoomError("Zoom could not be reached. Please try again."); }
}

export async function zoomAccountToken() {
  if (!zoomConfiguration().configured) throw new ZoomError("Embedded Zoom has not been configured by the clinic.", 503);
  const response = await zoomFetch("https://zoom.us/oauth/token", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.ZOOM_SERVER_TO_SERVER_CLIENT_ID}:${process.env.ZOOM_SERVER_TO_SERVER_CLIENT_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "account_credentials", account_id: process.env.ZOOM_ACCOUNT_ID! }),
  });
  if (!response.ok) throw new ZoomError("Zoom account authorization failed. Check the server credentials and app activation.");
  const result = await response.json();
  if (typeof result.access_token !== "string" || !result.access_token) throw new ZoomError("Zoom did not return an account access token.");
  return result.access_token as string;
}

export async function zoomMeeting(accessToken: string, number: string) {
  if (!/^\d{9,11}$/.test(number)) throw new ZoomError("Save a valid Zoom meeting ID in consultation settings.", 409);
  const response = await zoomFetch(`https://api.zoom.us/v2/meetings/${number}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new ZoomError("The clinic's Zoom account cannot read this meeting. Check its meeting ID, owner, and API scopes.");
  const meeting = await response.json();
  if (String(meeting.id) !== number || typeof meeting.host_id !== "string" || !meeting.host_id) throw new ZoomError("Zoom returned an unexpected meeting.");
  if (meeting.settings?.waiting_room !== true) throw new ZoomError("Enable the waiting room for this Zoom meeting before accepting online consultations.", 409);
  if (meeting.settings?.meeting_authentication || meeting.settings?.approval_type === 0 || meeting.settings?.approval_type === 1) throw new ZoomError("Turn off required Zoom sign-in and registration for the clinic room so patients can join from their portal.", 409);
  return { number, hostId: meeting.host_id as string, password: typeof meeting.password === "string" ? meeting.password : "", topic: String(meeting.topic || "Online consultation").slice(0, 200) };
}

export async function zoomHostToken(accessToken: string, hostId: string) {
  const response = await zoomFetch(`https://api.zoom.us/v2/users/${encodeURIComponent(hostId)}/token?type=zak`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new ZoomError("Zoom could not authorize the doctor as host. Check the user token API scope.");
  const result = await response.json();
  if (typeof result.token !== "string" || !result.token) throw new ZoomError("Zoom did not return a host token.");
  return result.token as string;
}
