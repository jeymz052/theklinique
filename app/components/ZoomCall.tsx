"use client";

import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { clinicalApi } from "@/lib/clinicalApi";

type Room = { nonce: string };
type Position = { x: number; y: number };
type Size = { width: number; height: number };
type ResizeDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
const resizeHandles: { direction: ResizeDirection; label: string }[] = [
  { direction: "n", label: "top edge" }, { direction: "ne", label: "top right corner" },
  { direction: "e", label: "right edge" }, { direction: "se", label: "bottom right corner" },
  { direction: "s", label: "bottom edge" }, { direction: "sw", label: "bottom left corner" },
  { direction: "w", label: "left edge" }, { direction: "nw", label: "top left corner" },
];
function boundedPosition(point: Position, box: DOMRect): Position {
  return { x: Math.round(Math.max(8, Math.min(point.x, window.innerWidth - box.width - 8))), y: Math.round(Math.max(8, Math.min(point.y, window.innerHeight - box.height - 8))) };
}
export default function ZoomCall({ appointmentId, title, onClose }: { appointmentId: string; title: string; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; startX: number; startY: number; x: number; y: number } | null>(null);
  const resize = useRef<{ id: number; direction: ResizeDirection; startX: number; startY: number; box: DOMRect } | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fullscreenRequest = useRef(0);
  const [room] = useState<Room>(() => ({ nonce: crypto.randomUUID() }));
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 899px)").matches);
  const [position, setPosition] = useState<Position | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState<ResizeDirection | null>(null);
  const [status, setStatus] = useState("Preparing your call…");
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let credentials: unknown, ready = false, sent = false;
    const post = () => {
      if (ready && credentials && !sent && frame.current?.contentWindow) {
        sent = true;
        frame.current.contentWindow.postMessage({ channel: "klinique-zoom", nonce: room.nonce, type: "join", credentials }, window.location.origin);
        credentials = undefined;
      }
    };
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.channel !== "klinique-zoom" || event.data.nonce !== room.nonce) return;
      switch (event.data.type) {
        case "ready": ready = true; post(); break;
        case "joining": setStatus("Connecting to Zoom…"); break;
        case "connected": setStatus("Zoom room open · join audio and enable your camera"); break;
        case "reconnecting": setStatus("Reconnecting to Zoom…"); break;
        case "error": {
          const detail = event.data.phase === "loading" ? "Zoom could not load. Check your connection and allow Zoom resources in your browser."
            : event.data.phase === "initializing" ? "Zoom could not initialize in this browser. Refresh the page and try again."
            : "Zoom could not join the consultation. Leave the call and try joining again. If the issue continues, contact the clinic.";
          const code = /^(?:\d{1,8}|[A-Z_]{3,48})$/.test(String(event.data.code)) ? String(event.data.code) : "";
          setError(`${detail}${code ? ` (Zoom error ${code})` : ""}`); break;
        }
        case "ended": close.current(); break;
      }
    };
    window.addEventListener("message", receive);
    void clinicalApi("/api/zoom/join", { method: "POST", body: JSON.stringify({ appointmentId }), signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) { credentials = result; post(); }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => {
      controller.abort(); credentials = undefined;
      window.removeEventListener("message", receive);
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      // The iframe's pagehide handler and browser teardown release media on
      // unmount. Do not send leave during React's development effect replay.
    };
  }, [appointmentId, room]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 899px)");
    const changed = (event: MediaQueryListEvent) => setNarrow(event.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    const stopInteraction = () => {
      resize.current = null; drag.current = null;
      setResizing(null); setDragging(false);
    };
    window.addEventListener("blur", stopInteraction);
    window.addEventListener("resize", stopInteraction);
    window.addEventListener("pointerup", stopInteraction);
    window.addEventListener("pointercancel", stopInteraction);
    return () => {
      window.removeEventListener("blur", stopInteraction);
      window.removeEventListener("resize", stopInteraction);
      window.removeEventListener("pointerup", stopInteraction);
      window.removeEventListener("pointercancel", stopInteraction);
    };
  }, []);
  useEffect(() => {
    let wasFullscreen = false;
    const changed = () => {
      const isFullscreen = document.fullscreenElement === panel.current;
      if (wasFullscreen && !isFullscreen) setExpanded(false);
      wasFullscreen = isFullscreen;
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) setExpanded(false);
    };
    document.addEventListener("fullscreenchange", changed);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [expanded]);
  useEffect(() => {
    if (expanded || (narrow && !minimized)) return;
    const keepVisible = () => {
      // Fullscreen exits asynchronously. Do not clamp the saved floating
      // position against a panel that still occupies the entire screen.
      if (panel.current?.classList.contains("expanded") || document.fullscreenElement === panel.current) return;
      const box = panel.current?.getBoundingClientRect();
      if (box) setPosition(current => {
        if (!current) return current;
        const next = boundedPosition(current, box);
        return next.x === current.x && next.y === current.y ? current : next;
      });
    };
    const observer = new ResizeObserver(keepVisible);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", keepVisible);
    return () => { observer.disconnect(); window.removeEventListener("resize", keepVisible); };
  }, [expanded, minimized, narrow]);
  function startDrag(event: PointerEvent<HTMLElement>) {
    if (expanded || resize.current || (window.innerWidth <= 899 && !minimized) || event.button !== 0 || (event.target as Element).closest(".zoom-call-controls")) return;
    const box = panel.current?.getBoundingClientRect();
    if (!box) return;
    event.preventDefault();
    handle.current?.focus({ preventScroll: true });
    drag.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: box.left, y: box.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    setPosition({ x: box.left, y: box.top }); setDragging(true);
  }
  function moveDrag(event: PointerEvent<HTMLElement>) {
    const active = drag.current, box = panel.current?.getBoundingClientRect();
    if (active?.id !== event.pointerId || !box) return;
    setPosition(boundedPosition({ x: active.x + event.clientX - active.startX, y: active.y + event.clientY - active.startY }, box));
  }
  function stopDrag(event: PointerEvent<HTMLElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null; setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function moveWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (expanded || (window.innerWidth <= 899 && !minimized) || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const box = panel.current?.getBoundingClientRect();
    if (!box) return;
    event.preventDefault();
    const distance = event.shiftKey ? 64 : 24;
    setPosition(boundedPosition({ x: box.left + (event.key === "ArrowRight" ? distance : event.key === "ArrowLeft" ? -distance : 0), y: box.top + (event.key === "ArrowDown" ? distance : event.key === "ArrowUp" ? -distance : 0) }, box));
  }
  function resizeWindow(box: DOMRect, direction: ResizeDirection, dx: number, dy: number) {
    const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high));
    const minWidth = Math.min(380, box.width), minHeight = Math.min(400, box.height);
    let left = box.left, right = box.right, top = box.top, bottom = box.bottom;
    if (direction.includes("w")) left = clamp(box.left + dx, 8, right - minWidth);
    if (direction.includes("e")) right = clamp(box.right + dx, left + minWidth, window.innerWidth - 8);
    if (direction.includes("n")) top = clamp(box.top + dy, 8, bottom - minHeight);
    if (direction.includes("s")) bottom = clamp(box.bottom + dy, top + minHeight, window.innerHeight - 8);
    setPosition({ x: Math.round(left), y: Math.round(top) });
    setSize({ width: Math.round(right - left), height: Math.round(bottom - top) });
  }
  function startResize(event: PointerEvent<HTMLButtonElement>, direction: ResizeDirection) {
    if (expanded || minimized || narrow || drag.current || event.button !== 0 || !event.isPrimary) return;
    const box = panel.current?.getBoundingClientRect();
    if (!box) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    resize.current = { id: event.pointerId, direction, startX: event.clientX, startY: event.clientY, box };
    setResizing(direction);
  }
  function moveResize(event: PointerEvent<HTMLButtonElement>) {
    const active = resize.current;
    if (active?.id !== event.pointerId) return;
    resizeWindow(active.box, active.direction, event.clientX - active.startX, event.clientY - active.startY);
  }
  function stopResize(event: PointerEvent<HTMLButtonElement>) {
    if (resize.current?.id !== event.pointerId) return;
    resize.current = null; setResizing(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function resizeWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, direction: ResizeDirection) {
    if (expanded || minimized || narrow || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const box = panel.current?.getBoundingClientRect();
    if (!box) return;
    event.preventDefault();
    const distance = event.shiftKey ? 64 : 24;
    resizeWindow(box, direction, event.key === "ArrowRight" ? distance : event.key === "ArrowLeft" ? -distance : 0, event.key === "ArrowDown" ? distance : event.key === "ArrowUp" ? -distance : 0);
  }
  function exitFullscreen() {
    fullscreenRequest.current++;
    if (document.fullscreenElement === panel.current) void document.exitFullscreen().catch(() => {});
  }
  function toggleExpanded() {
    if (expanded) { setExpanded(false); exitFullscreen(); return; }
    setExpanded(true); setMinimized(false);
    // Browsers without element fullscreen still get a viewport-filling call.
    const request = ++fullscreenRequest.current;
    if (panel.current?.requestFullscreen) void panel.current.requestFullscreen({ navigationUI: "hide" }).then(() => {
      if (request !== fullscreenRequest.current) exitFullscreen();
    }).catch(() => {});
  }
  function toggleMinimized() {
    setExpanded(false); setMinimized(value => !value); exitFullscreen();
  }
  function leave() {
    setLeaving(true); setStatus("Leaving call…");
    frame.current?.contentWindow?.postMessage({ channel: "klinique-zoom", nonce: room?.nonce, type: "leave" }, window.location.origin);
    // Always release media even when the SDK/network fails to acknowledge leave.
    leaveTimer.current = setTimeout(() => close.current(), 2500);
  }
  if (typeof document === "undefined") return null;
  return createPortal(<aside ref={panel} className={`zoom-call ${minimized ? "minimized" : ""} ${expanded ? "expanded" : ""} ${dragging ? "dragging" : ""} ${resizing ? "resizing" : ""}`} style={{ ...(position && !expanded && (!narrow || minimized) ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : {}), ...(size && !expanded && !minimized && !narrow ? { width: `min(${size.width}px, calc(100vw - 16px))`, height: `min(${size.height}px, calc(100dvh - 16px))` } : {}), ...(resizing ? { cursor: `${resizing}-resize` } : {}) }} aria-label="Zoom online consultation">
    <header className="zoom-call-header" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}><button ref={handle} type="button" className="zoom-call-drag-handle" aria-label="Move call window" title="Drag to move, or use the arrow keys" disabled={expanded || (narrow && !minimized)} onKeyDown={moveWithKeyboard}><i aria-hidden="true" className="fa-solid fa-grip-vertical" /><span><span><i aria-hidden="true" className="fa-solid fa-video" /> Online consultation</span><strong>{title}</strong><small>Drag to move / Resize from edges</small></span></button><div className="zoom-call-controls"><button type="button" onClick={toggleMinimized} aria-label={minimized ? "Restore call" : "Minimize call"} title={minimized ? "Restore call" : "Minimize call"}><i aria-hidden="true" className={`fa-solid ${minimized ? "fa-window-restore" : "fa-window-minimize"}`} /></button><button type="button" className="zoom-expand" onClick={toggleExpanded} aria-label={expanded ? "Reduce call" : "Expand call"} title={expanded ? "Restore window" : "Full screen"}><i aria-hidden="true" className={`fa-solid ${expanded ? "fa-compress" : "fa-expand"}`} /></button><button type="button" className="zoom-leave" disabled={leaving} onClick={leave}>Leave call</button></div></header>
    <p className="zoom-call-status" role="status">{error || status}</p>
    <div className="zoom-call-frame" hidden={minimized}><iframe ref={frame} src={`/api/zoom/room?nonce=${room.nonce}`} title="Zoom consultation room" allow="camera; microphone; display-capture; autoplay; fullscreen" allowFullScreen referrerPolicy="no-referrer" /></div>
    {!minimized && <p className="zoom-call-help">Allow camera and microphone access. You can minimize this call while viewing your chart.</p>}
    {!expanded && !minimized && !narrow && resizeHandles.map(({ direction, label }) => <button key={direction} type="button" className={`zoom-resize-handle zoom-resize-${direction}`} aria-label={`Resize call from ${label}`} title="Drag to resize, or use arrow keys" tabIndex={direction === "se" ? 0 : -1} onPointerDown={event => startResize(event, direction)} onPointerMove={moveResize} onPointerUp={stopResize} onPointerCancel={stopResize} onLostPointerCapture={stopResize} onKeyDown={event => resizeWithKeyboard(event, direction)} />)}
  </aside>, document.body);
}
