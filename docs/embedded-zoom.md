# Embedded Zoom consultations

Both portals support the Zoom Meeting SDK. Doctors start a call as host and keep the call open while switching between Patient record and Charting. Patients join inside their portal as participants. The surrounding controls use the clinic's pink and white design; Zoom supplies its own meeting controls. Both desktop and mobile use Zoom client view inside an isolated iframe. Zoom fills the entire iframe, including its stage and toolbar, instead of placing a separate component panel inside it. Minimize keeps the call connected. Leaving the consultation workspace or signing out releases the call.

The desktop window opens centered. Drag its title bar to move it, or focus the move handle and use arrow keys (Shift moves farther). The minimized bar can also be moved. Maximize requests browser fullscreen and falls back to filling the browser window when fullscreen is unavailable. Restore or Escape returns to the saved floating position; minimize leaves fullscreen and keeps the same call connected. Zoom handles stage and toolbar resizing within the iframe as it expands or returns to the floating window; there is no fixed component canvas size or component positioning offset. Phone layouts support maximize, minimize, restore, and orientation changes.

The desktop call also resizes from all four edges and corners, like a browser window. Use the visible bottom-right grip, or focus it and press arrow keys (Shift resizes farther). Resize stays within the viewport and keeps a useful minimum size. Short windows use a compact header and hide the help footer to leave room for Zoom's controls. Maximize/restore and minimize/restore preserve the chosen size without reconnecting. Phone layouts continue to fill the screen with minimize and restore controls.

The patient's Online consultation page shows its own heading, appointment date and time in Philippine time, and the exact time joining opens. Confirmed future appointments display a disabled Join button until the server allows access. Opening this page resets its scroll position; its heading and appointment cards adapt to phones and tablets.

## Activate

1. Apply `supabase/migrations/20261026_add_embedded_zoom.sql` after the October 24 and 25 clinical migrations. Also apply `20261027_use_embedded_zoom_only.sql` to clear legacy room links and enforce embedded Zoom.
2. In the clinic's [Zoom App Marketplace](https://marketplace.zoom.us/), create a General App and enable **Embed / Meeting SDK**. Obtain its Client ID and Client Secret. Configure the app's permitted web domains for the deployed portal (and localhost for development, where applicable). The SDK app and the meeting host must belong to the same Zoom account. External accounts need Zoom's additional authorization/review; this integration targets the clinic's own account.
3. Create and activate a **Server-to-Server OAuth app** in that same account. Add the granular scopes **`meeting:read:meeting:admin`** and **`user:read:token:admin`**, for getting the configured meeting and the host's ZAK respectively. A Zoom account administrator must authorize these scopes. Record Account ID, Client ID, and Client Secret.
4. Add these five **server-only** variables to `.env.local` and the deployment environment. Restart locally or redeploy after changes. Never prefix these variables with `NEXT_PUBLIC_`, put them in browser settings, or share the secrets in chat.

   ```dotenv
   ZOOM_MEETING_SDK_CLIENT_ID=
   ZOOM_MEETING_SDK_CLIENT_SECRET=
   ZOOM_ACCOUNT_ID=
   ZOOM_SERVER_TO_SERVER_CLIENT_ID=
   ZOOM_SERVER_TO_SERVER_CLIENT_SECRET=
   ```

5. In Zoom, prepare a reusable clinic meeting (personal room or recurring room with no fixed time), owned by the clinic host. **Enable Waiting Room** and keep **Require authentication to join** and **Registration** off. A passcode is supported and retrieved from Zoom on the server; the doctor need not enter it in this app.
6. Doctor portal → Settings → Online consultation: enter the meeting's numeric ID once. Save, then choose **Check saved Zoom room**. This checks API authorization, waiting-room settings, and doctor hosting without starting a meeting. Missing server variables are shown only to the doctor.
7. Open a confirmed online consultation and choose **Start Zoom consultation**. On a separate device/browser, the booked patient chooses **Join Zoom in portal**. Permit camera and microphone access, join computer audio, and admit the patient from Zoom's waiting room. Test both desktop and mobile with the real clinic account before accepting live calls.

Use HTTPS in production; localhost can be used for development. The host's Zoom plan, meeting-duration limits, account policies, and browser support still apply. Consultations use embedded Zoom only. There are no meeting-link fields or external join buttons. If a browser/device prevents joining, the patient should contact the clinic.

## Access and implementation

- `/api/zoom/join` requires the existing authenticated portal session. It reads the appointment, client ownership, consultation mode, and confirmed status on the server. Patients can join only their own appointments from 15 minutes before the scheduled start until one hour after it, in Philippine time. Doctors may start confirmed future visits for preparation/testing. Secretaries cannot mint join credentials.
- Clients send only an appointment ID. Meeting number, passcode, display name, and host/participant role come from the server. The account OAuth token is never returned. Only doctors receive the host ZAK. Meeting SDK signatures are scoped to the configured meeting and role with Zoom's minimum 30-minute lifetime. Responses are private and uncached.
- The static iframe document contains no user information. SDK join parameters travel through `postMessage` with strict same-origin, source-window, channel, and random nonce checks. No session token or Zoom secret is placed in a URL, browser storage, or a log. Removing the iframe releases its media. The outer panel remains mounted during record/chart tab changes.
- The SDK is pinned to **6.10.0** and loaded from Zoom's official CDN only when joining. Its React runtime and global styles are isolated from Next.js and the clinical UI. No global COOP/COEP policies were introduced. SDK upgrades must be tested before changing the pinned version.
- This uses a reusable room, as requested. Admit only the scheduled patient, remove them at the end, and end the room using Zoom controls before the next visit. Completing a chart does not itself end a call.

## Validation

Validation passed: 36 unit/API/database checks, clinical browser workflows, scoped lint, TypeScript, and the production build. Checks also reject legacy meeting-link settings and confirm that patient responses never expose room links. Browser workflows mock the Zoom SDK boundary and cover persistent charting, minimizing/leaving, mobile client view, setup errors, and frame message validation. Responsive checks cover dragging and keyboard movement, native fullscreen and restore, fullscreen fallback, mobile orientation, visible Zoom controls, preserved call connections, and patient page layouts at desktop, tablet, and phone widths. Separate Chrome smoke checks loaded the real pinned CDN SDK and initialized full-page client view at desktop and phone widths without errors or joining a meeting. A real audio/video call still requires the clinic's configured Zoom apps and two devices.

Startup regression: SDK event listeners must be registered after initialization finishes. Both desktop and mobile initialize before registering listeners, then join. Run `node --single-threaded scripts/check-zoom-startup.cjs` after a build to exercise the real CDN SDK through the app's iframe bridge at desktop and phone widths. This intercepts the join method and never starts a real meeting or uses clinic credentials.

References: [Meeting SDK for web](https://developers.zoom.us/docs/meeting-sdk/web/), [full-page client view](https://developers.zoom.us/docs/meeting-sdk/web/client-view/), [SDK credentials](https://developers.zoom.us/docs/meeting-sdk/get-credentials/), [SDK authorization](https://developers.zoom.us/docs/meeting-sdk/auth/), [Server-to-Server OAuth](https://developers.zoom.us/docs/internal-apps/s2s-oauth/), [User token API](https://developers.zoom.us/docs/api/users/).
