/* Isolated Zoom Meeting SDK runtime; loaded only after a portal join action. */
(() => {
  "use strict";
  const VERSION = "6.10.0";
  const parameters = new URLSearchParams(location.search);
  const nonce = parameters.get("nonce");
  const origin = location.origin;
  const message = document.getElementById("room-message");
  let started = false, leaving = false;
  let phase = "loading";
  const send = (type, extra = {}) => parent.postMessage({ channel: "klinique-zoom", nonce, type, ...extra }, origin);
  if (parent === window || !nonce || !/^[a-z0-9-]{16,80}$/i.test(nonce)) {
    message.textContent = "Open your online consultation from the patient or doctor portal.";
    return;
  }
  if (parameters.get("ended") === "1") { send("ended"); return; }
  function script(src) {
    return new Promise((resolve, reject) => {
      const element = document.createElement("script");
      element.src = src; element.onload = resolve; element.onerror = reject;
      document.head.appendChild(element);
    });
  }
  async function load() {
    for (const name of ["react", "react-dom", "redux", "redux-thunk", "react-redux", "lodash"]) {
      await script(`https://source.zoom.us/${VERSION}/lib/vendor/${name}.min.js`);
    }
    await script(`https://source.zoom.us/zoom-meeting-${VERSION}.min.js`);
  }
  function showError(error) {
    if (leaving) return;
    // SDK errors may contain credentials; never stringify or log the SDK object.
    const rawCode = error && (error.errorCode || error.error);
    const code = /^(?:\d{1,8}|[A-Z_]{3,48})$/.test(String(rawCode)) ? String(rawCode) : "";
    const explanation = phase === "loading" ? "Zoom could not load. Check your connection and allow Zoom resources in your browser."
      : phase === "initializing" ? "Zoom could not initialize in this browser. Refresh the page and try again."
      : "Zoom could not join the consultation. Leave the call and try joining again. If the issue continues, contact the clinic.";
    const detail = `${explanation}${code ? ` (Zoom error ${code})` : ""}`;
    message.hidden = false;
    message.textContent = detail;
    send("error", { phase, code });
  }
  async function join(data) {
    send("joining");
    try {
      await load();
      if (leaving) return;
      phase = "initializing";
      const leaveUrl = new URL(location.href); leaveUrl.searchParams.set("ended", "1");
      // Client view fills this isolated document. Zoom owns its responsive
      // stage and toolbar instead of positioning a second floating panel.
      const sdk = window.ZoomMtg;
      sdk.preLoadWasm(); sdk.prepareWebSDK();
      sdk.init({ leaveUrl: leaveUrl.href, patchJsMedia: false, success: () => {
        if (leaving) return;
        sdk.inMeetingServiceListener("onMeetingStatus", event => {
          if (event.meetingStatus === 2) send("connected");
          if (event.meetingStatus === 3) send("ended");
        });
        phase = "joining";
        message.hidden = true;
        const { password, ...rest } = data;
        sdk.join({ ...rest, passWord: password, success: () => { if (leaving) leave(); else send("connected"); }, error: showError });
      }, error: showError });
    } catch (error) { showError(error); }
  }
  async function leave() {
    leaving = true;
    try {
      if (window.ZoomMtg) { window.ZoomMtg.leaveMeeting({ success: () => send("ended"), error: () => send("ended") }); return; }
    } catch { /* Removing the frame also releases camera and microphone. */ }
    send("ended");
  }
  window.addEventListener("message", event => {
    if (event.origin !== origin || event.source !== parent || event.data?.channel !== "klinique-zoom" || event.data.nonce !== nonce) return;
    if (event.data.type === "leave") { void leave(); return; }
    if (event.data.type !== "join" || started || leaving) return;
    const data = event.data.credentials;
    if (!data || typeof data.signature !== "string" || !/^\d{9,11}$/.test(data.meetingNumber) || typeof data.userName !== "string" || typeof data.password !== "string") return;
    started = true; clearInterval(ready); void join(data);
  });
  // Repeated readiness avoids races with the authenticated parent request.
  const ready = setInterval(() => { if (!started && !leaving) send("ready"); }, 400);
  send("ready");
})();
