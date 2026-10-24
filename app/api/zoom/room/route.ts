// An isolated SDK document keeps Zoom's React runtime and global styles out of
// the patient record/charting page. No appointment data or credentials in HTML.
export function GET() {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Online consultation — Zoom</title><style>
html,body{margin:0;width:100%;height:100%;min-width:0;overflow:hidden;background:#222;font-family:Arial,sans-serif}#zmmtg-root{position:absolute;inset:0;width:100%;height:100%;min-width:0}#room-message{position:absolute;inset:0;z-index:2147483647;box-sizing:border-box;padding:20px;color:#784558;line-height:1.5;background:#fff8fb;overflow:auto}#room-message[hidden]{display:none}
</style><script defer src="/zoom-room.js?v=client-layout-2"></script></head><body><div id="room-message" role="status">Preparing your consultation room…</div><div id="zmmtg-root"></div><div id="aria-notify-area"></div></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Frame-Options": "SAMEORIGIN", "Content-Security-Policy": "frame-ancestors 'self'", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
}
