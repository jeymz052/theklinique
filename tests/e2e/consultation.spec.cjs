const { test, expect } = require('@playwright/test');
expect.configure({ timeout: 15000 });

const patient = { id: 'patient-record', patientNo: 'TKP-001', fullName: 'Test Patient', email: 'patient@example.test', phone: '09123456789', dateOfBirth: '2000-01-01', sex: 'Female', address: 'Test Address', civilStatus: '', bloodType: '', allergies: 'No known allergies', medicalHistory: 'No recorded conditions', currentMedications: 'None', emergencyContactName: 'Contact', emergencyContactPhone: '123', notes: '', procedures: [] };
const clinic = { clinic_name: 'The Klinique', doctor_name: 'Dr. Test', contact_email: 'clinic@example.test', contact_phone: '123', address: 'Clinic Street', city: 'Clinic City', province: '', postal_code: '', accepts_walk_ins: false };
const settings = { zoom_meeting_number: '12345678901', signature_data_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4fQAAAAASUVORK5CYII=', prc_number: 'TEST-PRC', specialty: 'Medical & Aesthetic Doctor', prescription_heading: 'Electronic Prescription', prescription_footer: 'Clinic instructions', accent_color: '#c0385f' };
const embeddedZoom = { zoomConfigured: true };

async function mockZoomSdk(page, options = {}) {
  await page.route('https://source.zoom.us/**', route => {
    let body = '';
    if (/zoom-meeting-\d/.test(route.request().url())) body = `
      window.__joins = 0; window.__leaves = 0;
      let initialized = false;
      window.ZoomMtg = {
        preLoadWasm: () => {}, prepareWebSDK: () => {},
        inMeetingServiceListener: () => { if (!initialized) throw new Error('Zoom listeners require initialization'); },
        init: options => {
          window.__view = 'client';
          document.getElementById('zmmtg-root').innerHTML = '<section id="mock-zoom-client" style="position:absolute;inset:0;display:flex;flex-direction:column;background:#222;color:white"><header style="height:48px;flex:none;display:flex;align-items:center;padding:0 12px">Zoom SDK test room</header><main id="mock-zoom-stage" style="flex:1;min-height:0;display:grid;place-items:center"><div style="display:grid;place-items:center;width:min(200px,30vw);aspect-ratio:1;background:#3e3439">Video area</div></main><footer id="mock-zoom-toolbar" style="height:64px;flex:none;display:flex;align-items:center;justify-content:space-evenly"><span>Audio</span><span>Camera</span><span>Participants</span></footer></section>';
          initialized = true; options.success();
        },
        join: data => { window.__joins++; window.__join = {...data}; ${options.errorCode ? `data.error({errorCode:${JSON.stringify(options.errorCode)},reason:'private-sdk-token-must-not-be-shown'});` : 'data.success();'} },
        leaveMeeting: options => { window.__leaves++; options.success(); }
      };`;
    return route.fulfill({ contentType: 'application/javascript', body });
  });
}
function content(prescription) { return { patient: { name: patient.fullName, patientNo: patient.patientNo, dateOfBirth: patient.dateOfBirth, sex: patient.sex, address: patient.address }, prescriber: { name: clinic.doctor_name, specialty: settings.specialty, prcNumber: settings.prc_number, signatureDataUrl: settings.signature_data_url }, clinic: { name: clinic.clinic_name, address: clinic.address, phone: clinic.contact_phone, email: clinic.contact_email }, prescription, appearance: { heading: settings.prescription_heading, footer: settings.prescription_footer, accentColor: settings.accent_color } }; }
function appointment(id, mode) { return { id, clientId: patient.id, referenceNo: `TK-${id}`, patient: patient.fullName, email: patient.email, phone: patient.phone, service: mode === 'online' ? 'Online Consultation with Dr. Kharyl' : 'Consultation with Dr. Kharyl', serviceCategory: 'consultations', consultationMode: mode, visitKind: 'standard', parentAppointmentId: null, date: '2026-11-01', time: mode === 'online' ? '10:00' : '11:00', status: 'confirmed', paymentStatus: 'paid', amount: mode === 'online' ? 600 : 500, notes: '' }; }

async function setup(page, role = 'doctor', initialDocuments = [], options = {}) {
  const roomSettings = { ...settings, ...options.settings };
  page.setDefaultTimeout(25000);
  // External font stylesheets must not delay hydration in an offline test run.
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  const user = { id: '00000000-0000-4000-8000-000000000001', email: `${role}@example.test`, email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { role }, user_metadata: { full_name: role === 'doctor' ? 'Dr. Test' : 'Test Patient' } };
  await page.addInitScript(({ key, user }) => { localStorage.setItem(key, JSON.stringify({ access_token: 'test-access-token', refresh_token: 'test-refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user })); }, { key: `sb-${project}-auth-token`, user });
  await page.route('**/*.supabase.co/**', route => route.fulfill({ json: { role, user } }));
  const treatmentVisit = { ...appointment('treatment-visit', 'clinic'), service: 'Clinic procedure', serviceCategory: 'facials', time: '12:00' };
  const appointments = [appointment('online-visit', 'online'), appointment('clinic-visit', 'clinic'), treatmentVisit];
  const treatments = [{ appointmentId: treatmentVisit.id, clientId: patient.id, referenceNo: treatmentVisit.referenceNo, date: treatmentVisit.date, time: treatmentVisit.time, appointmentStatus: treatmentVisit.status, patient: patient.fullName, email: patient.email, phone: patient.phone, service: treatmentVisit.service, case: null, protocol: null }];
  const progress = { photos: [], entries: [] };
  const documents = [...initialDocuments];
  const charts = [...(options.initialCharts || [])];
  const templates = [];
  const calls = [];
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/zoom/room') return route.continue();
    const method = route.request().method();
    const body = method === 'GET' || !route.request().headers()['content-type']?.includes('application/json') ? null : route.request().postDataJSON();
    calls.push({ path: url.pathname, method, body });
    if (/\/api\/medical-documents\/[^/]+\/download$/.test(url.pathname)) return route.fulfill({ json: { url: url.pathname.replace(/download$/, 'pdf'), filename: 'Prescription-RX-TEST.pdf' } });
    if (/\/api\/medical-documents\/[^/]+\/email$/.test(url.pathname)) return route.fulfill({ json: { email: patient.email } });
    if (/\/api\/medical-documents\/[^/]+\/pdf$/.test(url.pathname)) {
      const { PDFDocument } = require('pdf-lib'); const pdf = await PDFDocument.create(); pdf.addPage().drawText('Test prescription PDF');
      return route.fulfill({ headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Prescription-RX-TEST.pdf"' }, body: Buffer.from(await pdf.save()) });
    }
    let json = {};
    switch (url.pathname) {
      case '/api/appointments': json = { appointments }; break;
      case '/api/patients': json = { patients: [patient] }; break;
      case '/api/patient-progress':
        if (method === 'POST') {
          if (body) progress.entries.unshift({ id: `note-${progress.entries.length}`, source: 'note', date: body.visitDate, title: 'Procedure / progress note', description: body.description, followUpDate: body.followUpDate || null, followUpNotes: body.followUpNotes });
          else {
            const form = await new Request('http://localhost', { method: 'POST', headers: { 'content-type': route.request().headers()['content-type'] }, body: route.request().postDataBuffer() }).formData();
            const file = form.get('file');
            if (form.get('kind') === 'profile') progress.photos = progress.photos.filter(photo => photo.kind !== 'profile');
            progress.photos.unshift({ id: `photo-${Date.now()}`, kind: form.get('kind'), taken_on: form.get('takenOn'), area: form.get('area'), description: form.get('description'), url: `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString('base64')}` });
          }
          json = { id: 'saved' };
        } else json = { ...progress, photos: url.searchParams.get('photos') === 'profile' ? progress.photos.filter(photo => photo.kind === 'profile') : progress.photos };
        break;
      case '/api/treatments':
        if (method === 'PATCH') {
          const record = { current_step: body.currentStep, status: body.status, consent_given: body.consentGiven, consent_signature_name: body.consentSignatureName, anesthesia_type: body.anesthesiaType, anesthesia_product: body.anesthesiaProduct, anesthesia_amount: body.anesthesiaAmount, anesthesia_notes: body.anesthesiaNotes, procedure_details: body.procedureDetails, procedure_notes: body.procedureNotes, performed_on: body.procedureDate, postcare_instructions: body.postcareInstructions, postcare_given: body.postcareGiven, follow_up_required: body.followUpRequired, follow_up_date: body.followUpDate, follow_up_notes: body.followUpNotes };
          treatments[0].case = record;
          if (body.status === 'completed') { treatmentVisit.status = 'completed'; treatments[0].appointmentStatus = 'completed'; progress.entries.push({ id: 'treatment-entry', source: 'treatment', date: body.procedureDate, title: treatmentVisit.service, description: body.procedureNotes, followUpDate: body.followUpDate || null, followUpNotes: body.followUpNotes }); }
          json = { case: record };
        } else json = { cases: treatments };
        break;
      case '/api/consultation-settings': json = { settings: roomSettings, clinic, zoom: { configured: options.zoomConfigured !== false, missing: options.zoomConfigured !== false ? [] : ['ZOOM_MEETING_SDK_CLIENT_ID'] } }; break;
      case '/api/zoom/join':
        if (options.zoomError) return route.fulfill({ status: 503, json: { error: options.zoomError } });
        json = { signature: 'synthetic-signature', meetingNumber: '12345678901', password: 'test-passcode', userName: role === 'doctor' ? 'Dr. Test' : 'Test Patient', ...(role === 'doctor' ? { zak: 'synthetic-host-zak' } : {}) }; break;
      case '/api/clinic-settings': json = { settings: clinic, categories: [], serviceSubcategories: [], packageCategories: [], packageSubcategories: [], services: [], products: [] }; break;
      case '/api/consultations':
        if (method === 'PATCH') {
          const chart = { appointment_id: body.appointmentId, clinical_assessment: body.clinicalAssessment, subjective_notes: body.subjectiveNotes, objective_notes: body.objectiveNotes, treatment_plan: body.treatmentPlan, follow_up_required: body.followUpRequired, follow_up_notes: body.followUpNotes, prescription_draft: body.prescriptionDraft, no_prescription_required: body.noPrescriptionRequired, status: body.status };
          const index = charts.findIndex(item => item.appointment_id === chart.appointment_id); if (index >= 0) charts.splice(index, 1, chart); else charts.push(chart);
          if (body.status === 'completed') appointments.find(item => item.id === body.appointmentId).status = 'completed';
          json = { chart };
        } else json = { charts, intakes: [], procedures: [{ id: 'procedure', category_id: 'facials', name: 'Clinic procedure', subcategory: 'Facial', price: 2500, duration_mins: 60 }], procedureCategories: [{ id: 'facials', name: 'Facials', slug: 'facials' }], packages: [{ id: 'package', name: 'Clinic package', category: 'Packages', subcategory: '', price: 3500 }] };
        break;
      case '/api/medical-documents':
        if (method === 'POST') { const chart = charts.find(item => item.appointment_id === body.appointmentId); const document = { id: 'issued-document', reference_no: 'RX-TEST', appointment_id: body.appointmentId, client_id: patient.id, doctor_id: user.id, document_type: 'prescription', title: 'Prescription', content: content(chart.prescription_draft), released_to_patient: true, issued_at: '2026-10-23T02:00:00Z' }; documents.push(document); json = { document }; }
        else json = { documents: url.searchParams.has('id') ? documents.filter(item => item.id === url.searchParams.get('id')) : documents };
        break;
      case '/api/prescription-templates':
        if (method === 'POST') { const template = { id: 'template', name: body.name, prescription: body.prescription }; templates.push(template); json = { template }; } else json = { templates }; break;
      case '/api/online-consultations': json = { visits: [{ id: 'online-visit', reference_no: 'TK-online-visit', appointment_date: options.visitDate || '2026-11-01', appointment_time: '10:00', status: 'confirmed', provider: 'Zoom', meetingConfigured: true, joinAvailable: options.joinAvailable !== false, ...(options.legacyMeetingUrl ? { meetingUrl: options.legacyMeetingUrl } : {}) }] }; break;
      case '/api/booking-catalog': json = { categories: [{ id: 'consultations', name: 'Consultations', slug: 'consultations' }], services: [{ id: 'clinic', category_id: 'consultations', name: 'Clinic consultation', slug: 'consult-dr-kharyl', price: 500 }, { id: 'online', category_id: 'consultations', name: 'Online Consultation', slug: 'online-consultation', price: 600 }], products: [] }; break;
      case '/api/booking-availability': json = { isOpen: true, hours: '9:00 AM - 5:00 PM', slots: [], blocks: [] }; break;
      case '/api/intake-questions': json = { questions: [] }; break;
      case '/api/notifications': json = { notifications: [] }; break;
      case '/api/reschedule-requests': json = { requests: [] }; break;
      case '/api/blocked-dates': json = { blocks: [] }; break;
      case '/api/patient-profile': json = { profile: { full_name: patient.fullName, email: patient.email, phone: patient.phone } }; break;
    }
    await route.fulfill({ json });
  });
  return { calls, documents, charts };
}

test('Zoom call can be dragged, expanded, restored, and resized without reconnecting or clipping controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page, 'doctor', [], embeddedZoom); await mockZoomSdk(page);
  await page.goto('/dashboard/doctor?view=consultations');
  await page.getByRole('button', { name: 'Online', exact: true }).click();
  await page.getByRole('button', { name: 'Start Zoom consultation', exact: true }).click();
  const call = page.locator('.zoom-call'), handle = page.getByRole('button', { name: 'Move call window' });
  const frame = page.frameLocator('iframe[title="Zoom consultation room"]');
  await expect(frame.getByText('Zoom SDK test room')).toBeVisible();
  const room = page.frames().find(frame => frame.url().includes('/api/zoom/room'));
  const initial = await call.boundingBox();
  expect(initial.x + initial.width / 2).toBeCloseTo(720, 0);
  expect(initial.y + initial.height / 2).toBeCloseTo(450, 0);
  async function expectZoomFillsFrame() {
    await expect.poll(async () => {
      const sdk = await frame.locator('#mock-zoom-client').boundingBox();
      const iframe = await page.locator('iframe[title="Zoom consultation room"]').boundingBox();
      return Math.abs(sdk.width - iframe.width) < 1 && Math.abs(sdk.height - iframe.height) < 1 && Math.abs(sdk.x - iframe.x) < 1 && Math.abs(sdk.y - iframe.y) < 1;
    }).toBe(true);
    expect(await room.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  }
  await expectZoomFillsFrame();
  expect(await room.evaluate(() => window.__view)).toBe('client');
  await page.screenshot({ path: 'clinical-test-results/zoom-initial-centered.png', fullPage: false });
  async function dragBy(x, y) {
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + 15, box.y + 15); await page.mouse.down();
    await page.mouse.move(box.x + 15 + x, box.y + 15 + y, { steps: 8 }); await page.mouse.up();
  }
  await dragBy(-780, -100);
  expect((await call.boundingBox()).x).toBeLessThan(220);
  await handle.focus(); const before = await call.boundingBox(); await page.keyboard.press('ArrowRight');
  expect((await call.boundingBox()).x).toBeCloseTo(before.x + 24, 0);
  await page.getByRole('tab', { name: 'Charting', exact: true }).click();
  await page.getByRole('textbox', { name: 'Clinical assessment *', exact: true }).fill('Chart remains usable during the movable call');
  const docked = await call.boundingBox();
  await page.setViewportSize({ width: 1680, height: 768 });
  await page.getByRole('button', { name: 'Expand call' }).click();
  await expect(call).toHaveClass(/expanded/);
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('zoom-call'))).toBe(true);
  await expectZoomFillsFrame();
  await expect.poll(async () => {
    const toolbar = await frame.locator('#mock-zoom-toolbar').boundingBox();
    const iframe = await page.locator('iframe[title="Zoom consultation room"]').boundingBox();
    return toolbar.y + toolbar.height <= iframe.y + iframe.height + 1;
  }).toBe(true);
  const fullscreen = await call.boundingBox();
  const screen = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  expect(fullscreen).toEqual({ x: 0, y: 0, width: screen.width, height: screen.height });
  await page.screenshot({ path: 'clinical-test-results/zoom-expanded-fit.png', fullPage: false });
  await page.getByRole('button', { name: 'Reduce call' }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect.poll(async () => Math.round((await call.boundingBox()).x)).toBe(Math.round(docked.x));
  await page.getByRole('button', { name: 'Expand call' }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await expect(call).not.toHaveClass(/expanded/);
  await page.getByRole('button', { name: 'Expand call' }).click();
  await page.getByRole('button', { name: 'Minimize call' }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await dragBy(1300, 650);
  await page.getByRole('button', { name: 'Restore call' }).click();
  await page.setViewportSize({ width: 1024, height: 640 });
  await expect.poll(async () => { const box = await call.boundingBox(); return box.x >= 0 && box.y >= 0 && box.x + box.width <= 1024 && box.y + box.height <= 640; }).toBe(true);
  expect(await room.evaluate(() => window.__joins)).toBe(1);
  await expectZoomFillsFrame();
  await page.screenshot({ path: 'clinical-test-results/zoom-movable-charting.png', fullPage: false });
  await page.getByRole('button', { name: 'Leave call' }).click(); await expect(call).toHaveCount(0);
});

test('Zoom window resizes from all edges and corners and remembers its size after maximize and minimize', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  const { calls } = await setup(page, 'doctor', [], embeddedZoom); await mockZoomSdk(page);
  await page.goto('/dashboard/doctor?view=consultations');
  await page.getByRole('button', { name: 'Online', exact: true }).click();
  await page.getByRole('button', { name: 'Start Zoom consultation', exact: true }).click();
  const call = page.locator('.zoom-call'), frame = page.frameLocator('iframe[title="Zoom consultation room"]');
  await expect(frame.getByText('Zoom SDK test room')).toBeVisible();
  const room = page.frames().find(frame => frame.url().includes('/api/zoom/room'));
  async function resizeBy(direction, dx, dy) {
    const grip = await page.locator(`.zoom-resize-${direction}`).boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + dx, grip.y + grip.height / 2 + dy, { steps: 6 }); await page.mouse.up();
    await expect(call).not.toHaveClass(/resizing/);
  }
  async function expectInnerFrameFits() {
    await expect.poll(async () => {
      const sdk = await frame.locator('#mock-zoom-client').boundingBox();
      const box = await page.locator('iframe[title="Zoom consultation room"]').boundingBox();
      return Math.abs(sdk.width - box.width) < 1 && Math.abs(sdk.height - box.height) < 1;
    }).toBe(true);
  }
  for (const [direction, dx, dy] of [['e', 80, 0], ['w', -40, 0], ['s', 0, 60], ['n', 0, -40], ['ne', 40, -20], ['nw', -40, -20], ['sw', -40, 20], ['se', 40, 20]]) {
    const before = await call.boundingBox(); await resizeBy(direction, dx, dy); const after = await call.boundingBox();
    expect(after.x).toBeCloseTo(before.x + (direction.includes('w') ? dx : 0), 0);
    expect(after.y).toBeCloseTo(before.y + (direction.includes('n') ? dy : 0), 0);
    expect(after.width).toBeCloseTo(before.width + (direction.includes('w') ? -dx : direction.includes('e') ? dx : 0), 0);
    expect(after.height).toBeCloseTo(before.height + (direction.includes('n') ? -dy : direction.includes('s') ? dy : 0), 0);
    await expectInnerFrameFits();
  }
  await resizeBy('se', -2000, -2000);
  expect((await call.boundingBox()).width).toBe(380);
  expect((await call.boundingBox()).height).toBe(400);
  await page.locator('.zoom-resize-se').focus();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
  const chosen = await call.boundingBox();
  expect(chosen.width).toBe(404); expect(chosen.height).toBe(424);
  await page.getByRole('button', { name: 'Expand call', exact: true }).click();
  await expect(call).toHaveClass(/expanded/); await expectInnerFrameFits();
  await page.getByRole('button', { name: 'Reduce call', exact: true }).click();
  await expect.poll(async () => (await call.boundingBox()).width).toBe(chosen.width);
  await expect.poll(async () => (await call.boundingBox()).height).toBe(chosen.height);
  await page.getByRole('button', { name: 'Minimize call', exact: true }).click();
  await page.getByRole('button', { name: 'Restore call', exact: true }).click();
  await expect.poll(async () => (await call.boundingBox()).width).toBe(chosen.width);
  await expectInnerFrameFits();
  await page.screenshot({ path: 'clinical-test-results/zoom-resized-small.png', fullPage: false });
  await resizeBy('se', 2000, 2000);
  await page.setViewportSize({ width: 1024, height: 640 });
  await expect.poll(async () => { const box = await call.boundingBox(); return box.x >= 0 && box.y >= 0 && box.x + box.width <= 1024 && box.y + box.height <= 640; }).toBe(true);
  await expectInnerFrameFits();
  expect(await room.evaluate(() => window.__joins)).toBe(1);
  expect(calls.filter(call => call.path === '/api/zoom/join')).toHaveLength(1);
  await page.getByRole('button', { name: 'Leave call', exact: true }).click(); await expect(call).toHaveCount(0);
});

test('patient call expands and minimizes on mobile when browser fullscreen is unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { HTMLElement.prototype.requestFullscreen = () => Promise.reject(new Error('Fullscreen unavailable')); });
  await setup(page, 'patient', [], embeddedZoom); await mockZoomSdk(page);
  await page.goto('/dashboard/patient?view=online');
  await page.getByRole('button', { name: 'Join Zoom in portal', exact: true }).click();
  const call = page.locator('.zoom-call');
  const room = page.frames().find(frame => frame.url().includes('/api/zoom/room'));
  await expect(page.frameLocator('iframe[title="Zoom consultation room"]').getByText('Zoom SDK test room')).toBeVisible();
  await expect(page.locator('.zoom-resize-handle')).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand call' }).click();
  await expect(call).toHaveClass(/expanded/);
  expect(await call.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await call.boundingBox()).toEqual({ x: 0, y: 0, width: 844, height: 390 });
  await page.getByRole('button', { name: 'Minimize call' }).click();
  await expect(call).toHaveClass(/minimized/);
  await expect(call).not.toHaveClass(/expanded/);
  expect((await call.boundingBox()).height).toBeLessThan(180);
  await page.getByRole('button', { name: 'Restore call' }).click();
  await page.getByRole('button', { name: 'Expand call' }).click();
  await page.keyboard.press('Escape');
  await expect(call).not.toHaveClass(/expanded/);
  expect(await room.evaluate(() => window.__joins)).toBe(1);
  await page.getByRole('button', { name: 'Leave call' }).click();
  await expect(call).toHaveCount(0);
});

test('patient online page resets scrolling, labels the workspace, and explains future join access on desktop and mobile', async ({ page }) => {
  await setup(page, 'patient', [], { joinAvailable: false, visitDate: '2027-01-04' });
  await page.goto('/dashboard/patient');
  await page.evaluate(() => { window.scrollTo(0, 600); document.querySelector('.dk-body').scrollTop = 600; });
  await page.locator('.dk-nav-item').filter({ hasText: 'Online Consultation' }).click();
  await expect(page.locator('.patient-page-heading')).toContainText('Online consultation');
  await expect(page.getByRole('button', { name: 'Join Zoom in portal', exact: true })).toBeDisabled();
  await expect(page.locator('.online-join-schedule')).toContainText('2027');
  await expect(page.locator('.online-join-schedule')).toContainText('9:45');
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const hero = await page.locator('.online-page-hero').boundingBox(); const header = await page.locator('.patient-topbar').boundingBox();
    expect(hero.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
    expect(hero.height).toBeLessThan(260);
    await expect(page.locator('.patient-page-heading .dk-workspace-title')).toBeVisible();
    await page.screenshot({ path: `clinical-test-results/patient-online-${viewport.width}.png`, fullPage: true });
  }
});

test('doctor uses embedded Zoom while switching records and charting; minimizes and leaves cleanly', async ({ page }) => {
  const { calls } = await setup(page, 'doctor', [], embeddedZoom);
  await mockZoomSdk(page);
  await page.goto('/dashboard/doctor?view=consultations');
  await page.getByRole('button', { name: 'Online', exact: true }).click();
  await page.getByRole('button', { name: 'Start Zoom consultation', exact: true }).click();
  const frame = page.frameLocator('iframe[title="Zoom consultation room"]');
  await expect(frame.getByText('Zoom SDK test room')).toBeVisible();
  await expect(page.locator('.zoom-call-status')).toContainText('Zoom room open');
  const room = page.frames().find(frame => frame.url().includes('/api/zoom/room'));
  expect(await room.evaluate(() => window.__join.zak)).toBe('synthetic-host-zak');
  await page.getByRole('button', { name: 'Minimize call', exact: true }).click();
  await expect(page.locator('.zoom-call')).toHaveClass(/minimized/);
  await page.getByRole('tab', { name: 'Charting', exact: true }).click();
  await page.getByRole('textbox', { name: 'Clinical assessment *', exact: true }).fill('Notes during a Zoom consultation');
  await page.getByRole('tab', { name: 'Patient record', exact: true }).click();
  await page.getByRole('button', { name: 'Clinic', exact: true }).click();
  expect(await room.evaluate(() => window.__joins)).toBe(1);
  await page.getByRole('button', { name: 'Restore call', exact: true }).click();
  await expect(frame.getByText('Zoom SDK test room')).toBeVisible();
  // Correct nonce but the wrong source window must not close or control the call.
  await page.evaluate(() => {
    const iframe = document.querySelector('iframe[title="Zoom consultation room"]');
    const nonce = new URL(iframe.src).searchParams.get('nonce');
    window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: window, data: { channel: 'klinique-zoom', nonce, type: 'ended' } }));
    iframe.contentWindow.postMessage({ channel: 'klinique-zoom', nonce: 'wrong-nonce', type: 'leave' }, location.origin);
  });
  await expect(page.locator('.zoom-call')).toBeVisible();
  expect(await room.evaluate(() => window.__leaves)).toBe(0);
  expect(calls.filter(call => call.path === '/api/zoom/join')).toHaveLength(1);
  expect(calls.find(call => call.path === '/api/zoom/join').body).toEqual({ appointmentId: 'online-visit' });
  await page.screenshot({ path: 'clinical-test-results/embedded-zoom-doctor.png', fullPage: true });
  await page.getByRole('button', { name: 'Leave call', exact: true }).click();
  await expect(page.locator('.zoom-call')).toHaveCount(0);
});

test('patient joins embedded Zoom on mobile using client view, with no host credentials or new tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, 'patient', [], embeddedZoom);
  await mockZoomSdk(page);
  await page.goto('/dashboard/patient?view=online');
  await page.getByRole('button', { name: 'Join Zoom in portal', exact: true }).click();
  const frame = page.frameLocator('iframe[title="Zoom consultation room"]');
  await expect(frame.getByText('Zoom SDK test room')).toBeVisible();
  const room = page.frames().find(frame => frame.url().includes('/api/zoom/room'));
  expect(await room.evaluate(() => window.__view)).toBe('client');
  expect(await room.evaluate(() => window.__join.zak)).toBeUndefined();
  expect(await room.evaluate(() => window.__join.passWord)).toBe('test-passcode');
  expect(page.context().pages()).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.screenshot({ path: 'clinical-test-results/embedded-zoom-patient-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Minimize call', exact: true }).click();
  await page.getByRole('button', { name: 'Restore call', exact: true }).click();
  expect(await room.evaluate(() => window.__joins)).toBe(1);
  await page.getByRole('button', { name: 'Leave call', exact: true }).click();
  await expect(page.locator('.zoom-call')).toHaveCount(0);
});

test('embedded Zoom shows a recoverable setup error and doctor settings identify missing configuration', async ({ page }) => {
  await setup(page, 'patient', [], { ...embeddedZoom, zoomError: 'The clinic is preparing the consultation room.' });
  await page.goto('/dashboard/patient?view=online');
  await page.getByRole('button', { name: 'Join Zoom in portal', exact: true }).click();
  await expect(page.locator('.zoom-call-status')).toContainText('clinic is preparing');
  await page.getByRole('button', { name: 'Leave call', exact: true }).click();
  await expect(page.locator('.zoom-call')).toHaveCount(0);
  await page.unrouteAll({ behavior: 'wait' });
  await setup(page, 'doctor', [], { ...embeddedZoom, zoomConfigured: false });
  await page.goto('/dashboard/doctor?view=settings&tab=online');
  await expect(page.getByLabel('Zoom meeting ID')).toHaveValue('12345678901');
  await expect(page.getByLabel('Video experience')).toHaveCount(0);
  await expect(page.locator('.zoom-setup-status')).toContainText('Server setup is required');
  await expect(page.getByRole('button', { name: 'Check saved Zoom room' })).toBeDisabled();
});

test('Zoom join failures show a safe error code and do not expose SDK error details', async ({ page }) => {
  await setup(page, 'doctor', [], embeddedZoom);
  await mockZoomSdk(page, { errorCode: '3712' });
  await page.goto('/dashboard/doctor?view=consultations');
  await page.getByRole('button', { name: 'Online', exact: true }).click();
  await page.getByRole('button', { name: 'Start Zoom consultation', exact: true }).click();
  await expect(page.locator('.zoom-call-status')).toContainText('Zoom error 3712');
  await expect(page.locator('.zoom-call-status')).toContainText('could not join');
  await expect(page.locator('.zoom-call-status')).not.toContainText('private-sdk-token');
  const frame = page.frameLocator('iframe[title="Zoom consultation room"]');
  await expect(frame.locator('#room-message')).toContainText('Zoom error 3712');
  await expect(frame.locator('#room-message')).not.toContainText('private-sdk-token');
  await page.getByRole('button', { name: 'Leave call', exact: true }).click();
  await expect(page.locator('.zoom-call')).toHaveCount(0);
});

test('doctor charts an online visit, builds and issues a prescription, then finalizes', async ({ page }) => {
  const { calls } = await setup(page, 'doctor', [], { initialCharts: [{ appointment_id: 'online-visit', status: 'ready', prescription_draft: { medicines: [], notes: '', followUpDate: '', releaseToPatient: false } }] });
  await page.goto('/dashboard/doctor?view=consultations');
  await page.getByRole('button', { name: 'Online', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start Zoom consultation' })).toBeEnabled();
  await expect(page.locator('.consultation-meeting-card a[target=_blank]')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Charting' }).click();
  await page.getByRole('textbox', { name: 'Clinical assessment *', exact: true }).fill('Assessment entered by the doctor');
  await page.getByLabel('Treatment plan *', { exact: true }).fill('Care plan entered by the doctor');
  await page.getByRole('button', { name: 'Next: Prescription' }).click();
  await page.getByRole('button', { name: 'Add first medicine' }).click();
  await expect(page.getByRole('button', { name: 'Next: Finalize' })).toBeDisabled();
  await page.getByLabel('Generic name *').fill('Test medicine');
  await page.getByLabel('Strength and form *').fill('10 mg tablet');
  await page.getByLabel('Dose *', { exact: true }).fill('1 tablet');
  await page.getByLabel('Frequency *', { exact: true }).fill('once a day');
  await page.getByLabel('Duration *', { exact: true }).fill('5 days');
  await page.getByRole('button', { name: 'Auto-calculate' }).click();
  await expect(page.getByLabel('Quantity *', { exact: false })).toHaveValue('5');
  await page.getByRole('button', { name: 'Save medicine', exact: true }).click();
  await page.getByRole('button', { name: 'Review prescription', exact: true }).click();
  await expect(page.locator('.rx-paper')).toContainText('TEST-PRC');
  await page.getByRole('button', { name: 'Confirm & issue prescription' }).click();
  await expect(page.getByText('Released to patient portal', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next: Finalize' }).click();
  await expect(page.locator('.consultation-final-summary')).toContainText('RX-TEST');
  await page.getByRole('radio', { name: 'Completed', exact: true }).check();
  await page.getByRole('button', { name: 'Save & finalize chart' }).click();
  await expect(page.getByText('This consultation is finalized.', { exact: false })).toBeVisible();
  expect(calls.filter(call => call.path === '/api/medical-documents' && call.method === 'POST')).toHaveLength(1);
  expect(calls.filter(call => call.path === '/api/consultations' && call.method === 'PATCH').every(call => call.body.status !== 'completed' || call.body.prescriptionDraft.releaseToPatient)).toBe(true);
  expect(calls.find(call => call.path === '/api/consultations' && call.body?.status === 'completed').body.appointmentId).toBe('online-visit');
  await page.screenshot({ path: 'clinical-test-results/doctor-online-consultation.png', fullPage: true });
  await page.locator('#nav-documents').click();
  await expect(page.locator('.medical-document-viewer')).toContainText('RX-TEST');
  await expect(page.getByRole('button', { name: 'Email to patient', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeEnabled();
});

test('clinic charting has two steps and preserves unsaved notes across visit filters', async ({ page }) => {
  await setup(page);
  await page.goto('/dashboard/doctor?view=consultations');
  await page.getByRole('button', { name: 'Clinic', exact: true }).click();
  await page.getByRole('tab', { name: 'Charting' }).click();
  await expect(page.locator('.consultation-stepper button')).toHaveCount(2);
  await page.getByRole('textbox', { name: 'Clinical assessment *', exact: true }).fill('Unsaved clinic assessment');
  await page.getByRole('button', { name: 'Online', exact: true }).click();
  await page.getByRole('button', { name: 'Clinic', exact: true }).click();
  await page.getByRole('tab', { name: 'Charting' }).click();
  await expect(page.getByRole('textbox', { name: 'Clinical assessment *', exact: true })).toHaveValue('Unsaved clinic assessment');
});

test('online booking is a consultation option priced at PHP 600', async ({ page }) => {
  await setup(page, 'patient');
  await page.goto('/booking');
  await page.locator('.bk-booking-mode button').filter({ hasText: 'Consultation' }).click();
  await page.locator('.online-mode-options button').filter({ hasText: 'Online consultation' }).click();
  await expect(page.locator('.online-mode-options button.selected')).toContainText('₱600');
  await expect(page.locator('.bk-selected-service-summary')).toContainText('PHP 600');
  await expect(page.locator('.bk-consult-only')).toContainText('full ₱600 fee');
});

test('patient portal joins the configured room and renders released prescription on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const document = { id: 'released', reference_no: 'RX-RELEASED', client_id: patient.id, appointment_id: 'online-visit', document_type: 'prescription', title: 'Prescription', released_to_patient: true, issued_at: '2026-10-23T02:00:00Z', content: content({ medicines: [{ id: 'medicine', genericName: 'Test medicine', brand: '', strengthForm: '10 mg tablet', dose: '1 tablet', frequency: 'once a day', duration: '5 days', quantity: '5', instructions: '', indication: '' }], notes: '', followUpDate: '', releaseToPatient: true }) };
  await setup(page, 'patient', [document], { legacyMeetingUrl: 'https://meet.google.com/abc-defg-hij' });
  await page.goto('/dashboard/patient?view=online');
  await expect(page.getByRole('button', { name: 'Join Zoom in portal' })).toBeEnabled();
  await expect(page.locator('.patient-online-workspace a[target=_blank]')).toHaveCount(0);
  await expect(page.locator('.patient-online-workspace')).not.toContainText('Google Meet');
  await page.getByRole('button', { name: 'Medical documents', exact: true }).click();
  await expect(page.locator('.rx-paper')).toContainText('Test medicine');
  await expect(page.locator('.rx-paper')).toContainText('TEST-PRC');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  await page.screenshot({ path: 'clinical-test-results/patient-prescription-mobile.png', fullPage: true });
  await page.goto('/dashboard/medical-document?id=released');
  await expect(page.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
  await expect(page.locator('.rx-paper')).toContainText('RX-RELEASED');
});

test('medical document API routes return JSON access errors instead of HTML not-found pages', async ({ request }) => {
  const id = '00000000-0000-4000-8000-000000000000';
  for (const action of ['download', 'email']) {
    const response = await request.post(`/api/medical-documents/${id}/${action}`, { data: {} });
    expect(response.status()).toBe(403);
    expect(response.headers()['content-type']).toContain('application/json');
    expect((await response.json()).error).toBeTruthy();
  }
  const pdf = await request.get(`/api/medical-documents/${id}/pdf`);
  expect(pdf.status()).toBe(403);
  expect(pdf.headers()['content-type']).toContain('application/json');
});

test('medical document actions explain HTML errors and allow an email retry', async ({ page }) => {
  const document = { id: 'released', reference_no: 'RX-TEST', client_id: patient.id, appointment_id: 'online-visit', document_type: 'prescription', title: 'Prescription', released_to_patient: true, issued_at: '2026-10-23T02:00:00Z', content: content({ medicines: [], notes: '', followUpDate: '', releaseToPatient: true }) };
  await setup(page, 'doctor', [document]);
  let failed = true;
  await page.route(/\/api\/medical-documents\/[^/]+\/(download|email)$/, route => failed ? route.fulfill({ status: 404, contentType: 'text/html', body: '<!DOCTYPE html><html>Not found</html>' }) : route.fulfill({ json: { email: patient.email } }));
  await page.goto('/dashboard/doctor?view=documents');
  for (const name of ['Email to patient', 'Download PDF']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.medical-document-actions [role=alert]')).toContainText('Refresh the page');
    await expect(page.getByRole('button', { name, exact: true })).toBeEnabled();
  }
  failed = false;
  await page.getByRole('button', { name: 'Email to patient', exact: true }).click();
  await expect(page.locator('.medical-document-actions [role=status]')).toContainText('email queued');
});

test('prescription PDF downloads work on desktop and mobile; doctor email uses a server-selected recipient', async ({ page }) => {
  // Serve the download over real HTTP. Chromium cancels downloads fulfilled by
  // request interception (Playwright #28253), so do not mock the binary response.
  const { PDFDocument } = require('pdf-lib'); const pdf = await PDFDocument.create(); pdf.addPage().drawText('Test prescription PDF');
  const fixtureBytes = Buffer.from(await pdf.save());
  const server = require('node:http').createServer((_, response) => { response.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Prescription-RX-TEST.pdf"', 'Content-Length': fixtureBytes.length }); response.end(fixtureBytes); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
  const document = { id: 'released', reference_no: 'RX-TEST', client_id: patient.id, appointment_id: 'online-visit', document_type: 'prescription', title: 'Prescription', released_to_patient: true, issued_at: '2026-10-23T02:00:00Z', content: content({ medicines: [{ id: 'medicine', genericName: 'Test medicine', brand: '', strengthForm: '10 mg tablet', dose: '1 tablet', frequency: 'once a day', duration: '5 days', quantity: '5', instructions: '', indication: '' }], notes: '', followUpDate: '', releaseToPatient: true }) };
  const { calls } = await setup(page, 'doctor', [document]);
  await page.route('**/api/medical-documents/*/download', route => route.fulfill({ json: { url: `http://127.0.0.1:${server.address().port}/prescription.pdf`, filename: 'Prescription-RX-TEST.pdf' } }));
  await page.goto('/dashboard/doctor?view=documents');
  await page.getByRole('button', { name: 'Email to patient', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Prescription PDF email queued for patient@example.test');
  const email = calls.find(call => call.path.endsWith('/email'));
  expect(Object.keys(email.body)).toEqual(['requestId']);
  expect(email.body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  const fs = require('node:fs/promises');
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 360, height: 780 }]) {
    await page.setViewportSize(viewport);
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('Prescription-RX-TEST.pdf');
    const bytes = await fs.readFile(await download.path());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.screenshot({ path: 'clinical-test-results/prescription-pdf-controls-mobile.png', fullPage: true });
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('prescription-ready notification opens the patient document view from the bell', async ({ page }) => {
  const document = { id: 'released', reference_no: 'RX-TEST', client_id: patient.id, appointment_id: 'online-visit', document_type: 'prescription', title: 'Prescription', released_to_patient: true, issued_at: '2026-10-23T02:00:00Z', content: content({ medicines: [], notes: '', followUpDate: '', releaseToPatient: true }) };
  await setup(page, 'patient', [document]);
  await page.route('**/api/notifications', route => route.fulfill({ json: { notifications: [{ id: 'notice', event: 'prescription_ready:released', title: 'Your prescription is ready', body: 'Open Medical Documents to download your PDF.', href: '/dashboard/patient?view=documents', read_at: null, created_at: '2026-10-23T02:00:00Z' }] } }));
  await page.goto('/dashboard/patient');
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await page.getByRole('button', { name: /Your prescription is ready/ }).click();
  await expect(page.getByRole('heading', { name: 'Your medical documents' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Email to patient' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeVisible();
});

test('portal prescription and exported PDF HTML have matching typography and layout', async ({ page, context }) => {
  const document = { id: 'released', reference_no: 'RX-LAYOUT', client_id: patient.id, appointment_id: 'online-visit', document_type: 'prescription', title: 'Prescription', released_to_patient: true, issued_at: '2026-10-23T02:00:00Z', content: content({ medicines: [{ id: 'medicine', genericName: 'Test medicine', brand: 'Recorded brand', strengthForm: '10 mg tablet', dose: '1 tablet', frequency: 'once daily', duration: '5 days', quantity: '5', instructions: 'Recorded instructions', indication: 'Recorded indication' }], notes: 'Recorded notes', followUpDate: '2026-11-01', releaseToPatient: true }) };
  await setup(page, 'patient', [document]);
  await page.goto('/dashboard/medical-document?id=released');
  await expect(page.locator('.rx-paper')).toContainText('RX-LAYOUT');
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images, image => image.decode())); });
  const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
  function load(relative) {
    const filename = path.resolve(relative), mod = new Module(filename, module); mod.filename = filename; mod.paths = module.paths;
    mod.require = name => name.startsWith('@/') ? load(name.slice(2) + '.ts') : require(name);
    mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
    return mod.exports;
  }
  const exported = await context.newPage();
  try {
    await exported.setContent(await load('lib/prescriptionHtmlPdf.ts').prescriptionPdfHtml(document));
    await exported.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images, image => image.decode())); });
    const geometry = () => {
      const paper = document.querySelector('.rx-paper'), origin = paper.getBoundingClientRect();
      return ['.rx-letterhead', '.rx-prescriber', '.rx-patient', '.rx-symbol', '.rx-medicines', '.rx-notes', '.rx-signature', '.rx-footer'].map(selector => {
        const element = paper.querySelector(selector), rect = element.getBoundingClientRect(), style = getComputedStyle(element);
        return { selector, text: element.textContent.replace(/\s+/g, ' ').trim(), x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height, font: style.fontFamily, size: style.fontSize, lineHeight: style.lineHeight, color: style.color };
      });
    };
    expect(await exported.evaluate(geometry)).toEqual(await page.evaluate(geometry));
    await exported.locator('.rx-paper').screenshot({ path: 'clinical-test-results/prescription-shared-layout.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.rx-signature')).toContainText('TEST-PRC');
  } finally { await exported.close(); }
});

test('settings deep-link opens the saved meeting and signature configuration', async ({ page }) => {
  await setup(page, 'doctor', [], { settings: { video_mode: 'link', meeting_url: 'https://meet.google.com/abc-defg-hij' } });
  await page.goto('/dashboard/doctor?view=settings&tab=online');
  await expect(page.getByLabel('Zoom meeting ID')).toHaveValue(settings.zoom_meeting_number);
  await expect(page.locator('.zoom-room-settings input[type=url], .zoom-room-settings select, .zoom-room-settings a')).toHaveCount(0);
  await expect(page.locator('.zoom-room-settings')).not.toContainText('Google Meet');
  await expect(page.locator('.zoom-visit-flow li')).toHaveCount(4);
  await expect(page.getByLabel('PRC license number')).toHaveValue('TEST-PRC');
  await expect(page.getByAltText('Saved doctor signature')).toBeVisible();
  await page.screenshot({ path: 'clinical-test-results/zoom-only-settings.png', fullPage: true });
});

test('treatment has patient records and a validated five-step pink charting flow with dated follow-up', async ({ page }) => {
  const { calls } = await setup(page);
  await page.goto('/dashboard/doctor?view=treatments');
  await expect(page.getByRole('tab', { name: 'Patient record' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Add treatment photos', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Charting' }).click();
  await expect(page.locator('.treatment-stepper button')).toHaveCount(5);
  await expect(page.locator('.treatment-stepper button.active')).toHaveCSS('background-color', 'rgb(177, 78, 112)');
  await page.locator('.treatment-stepper button').filter({ hasText: 'Finalize' }).click();
  await expect(page.locator('.treatment-workspace [role=alert]')).toContainText('acknowledgment');
  await expect(page.getByLabel('Patient signature / acknowledgment name')).toBeVisible();
  await page.getByLabel('Patient signature / acknowledgment name').fill('Test Patient');
  await page.getByRole('checkbox', { name: 'The patient reviewed and accepted this consent in the presence of clinic staff.' }).check();
  await page.getByRole('button', { name: 'Next: Anesthesia' }).click();
  await page.getByRole('button', { name: 'Next: Procedure' }).click();
  await page.getByLabel('Procedure date', { exact: true }).fill('2026-11-01');
  await page.getByLabel('Treatment area *').fill('Cheeks');
  await page.getByLabel('Procedure description / notes').fill('Procedure performed on both cheeks; progress documented.');
  await page.getByRole('tab', { name: 'Patient record' }).click();
  await page.getByRole('tab', { name: 'Charting' }).click();
  await expect(page.getByLabel('Procedure description / notes')).toHaveValue('Procedure performed on both cheeks; progress documented.');
  await page.getByRole('button', { name: 'Next: Post-care' }).click();
  await page.getByLabel('Instructions provided').fill('Aftercare instructions provided by the doctor.');
  await page.getByRole('checkbox', { name: 'Post-care instructions were explained and given to the patient.' }).check();
  await page.getByRole('checkbox', { name: 'Request a follow-up consultation', exact: true }).check();
  await page.getByLabel('Requested follow-up consultation date', { exact: true }).fill('2026-11-15');
  await page.getByLabel('Follow-up instructions', { exact: true }).fill('Review the cheek improvement.');
  await page.getByRole('button', { name: 'Next: Finalize' }).click();
  await expect(page.locator('.consultation-final-summary')).toContainText('Procedure performed on both cheeks');
  await expect(page.locator('.consultation-final-summary')).toContainText('Nov 15, 2026');
  await page.getByRole('button', { name: 'Finalize treatment', exact: true }).click();
  await expect(page.getByText('This treatment is finalized.', { exact: false })).toBeVisible();
  const save = calls.filter(call => call.path === '/api/treatments' && call.method === 'PATCH').at(-1).body;
  expect(save.status).toBe('completed'); expect(save.currentStep).toBe(5); expect(save.followUpDate).toBe('2026-11-15');
  await page.getByRole('tab', { name: 'Patient record' }).click();
  await expect(page.locator('.progress-timeline')).toContainText('Procedure performed on both cheeks');
  await expect(page.locator('.progress-follow-ups')).toContainText('Nov 15, 2026');
  await page.screenshot({ path: 'clinical-test-results/treatment-patient-record.png', fullPage: true });
});

test('consultation has only profile photos while treatment keeps dated before/after comparison and notes', async ({ page }) => {
  await setup(page);
  await page.goto('/dashboard/doctor?view=consultations');
  await expect(page.getByRole('button', { name: 'Upload profile photo', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Add treatment photos', exact: true })).toHaveCount(0);
  await expect(page.locator('.progress-comparison')).toHaveCount(0);
  const photoBytes = Buffer.from(await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 20; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#efc0d1'; ctx.fillRect(0, 0, 20, 20); return canvas.toDataURL('image/png').split(',')[1]; }), 'base64');
  const photo = { name: 'sample-photo.png', mimeType: 'image/png', buffer: photoBytes };
  await page.getByLabel('Patient profile photo', { exact: true }).setInputFiles(photo);
  await expect(page.getByAltText(`Profile photo of ${patient.fullName}`)).toBeVisible();
  await page.locator('#nav-treatments').click();
  await expect(page.getByAltText(`Profile photo of ${patient.fullName}`)).toBeVisible();
  for (const [kind, date, caption] of [['before', '2026-11-01', 'Cheeks before treatment'], ['after', '2026-11-15', 'Cheek improvement at review']]) {
    await page.getByRole('button', { name: 'Add treatment photos', exact: true }).click();
    await page.getByLabel('Photo date', { exact: true }).fill(date);
    await page.getByRole('combobox', { name: 'Photo type', exact: true }).selectOption(kind);
    await page.getByLabel('Treatment / body area').fill('Cheeks');
    await page.getByLabel('Photo description').fill(caption);
    await page.getByLabel('Treatment photo files').setInputFiles(photo);
    await page.getByRole('button', { name: 'Upload treatment photos', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Upload treatment photos', exact: true })).toHaveCount(0);
  }
  await expect(page.locator('.progress-comparison')).toContainText('Cheeks before treatment');
  await expect(page.locator('.progress-comparison')).toContainText('Cheek improvement at review');
  await expect(page.locator('.progress-comparison')).toContainText('Nov 1, 2026');
  await expect(page.locator('.progress-comparison')).toContainText('Nov 15, 2026');
  await page.getByRole('button', { name: 'Add progress note', exact: true }).click();
  await page.getByLabel('Procedure / visit date', { exact: true }).fill('2026-11-15');
  await page.getByLabel('Procedure / progress description').fill('Reviewed improvement after cheek procedure.');
  await page.getByLabel('Requested follow-up consultation date', { exact: true }).fill('2026-11-29');
  await page.getByLabel('Follow-up instructions', { exact: true }).fill('Review again with Dr. Kharyl.');
  await page.getByRole('button', { name: 'Save progress note', exact: true }).click();
  await expect(page.locator('.progress-timeline')).toContainText('Reviewed improvement after cheek procedure.');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  await page.screenshot({ path: 'clinical-test-results/treatment-before-after-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#nav-consultations').click();
  await expect(page.getByAltText(`Profile photo of ${patient.fullName}`)).toBeVisible();
  await expect(page.locator('.progress-comparison')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add treatment photos', exact: true })).toHaveCount(0);
});

test('clinic finalize retains procedure and package selection with pink active steps', async ({ page }) => {
  const { calls } = await setup(page);
  await page.goto('/dashboard/doctor?view=consultations');
  await page.getByRole('button', { name: 'Clinic', exact: true }).click();
  await page.getByRole('tab', { name: 'Charting' }).click();
  await page.getByRole('textbox', { name: 'Clinical assessment *', exact: true }).fill('Clinic assessment');
  await page.getByLabel('Treatment plan *', { exact: true }).fill('Proceed with selected treatment');
  await page.getByRole('button', { name: 'Next: Finalize' }).click();
  await page.getByRole('button', { name: 'Procedure or package after consultation', exact: false }).click();
  await page.locator('.cw-procedure-grid button').filter({ hasText: 'Clinic procedure' }).click();
  await page.getByRole('button', { name: 'Packages', exact: true }).click();
  await page.locator('.cw-procedure-grid button').filter({ hasText: 'Clinic package' }).click();
  await expect(page.locator('.cw-procedure-selection')).toContainText('1 procedure');
  await expect(page.locator('.cw-procedure-selection')).toContainText('1 package');
  await expect(page.locator('.consultation-stepper button.active')).toHaveCSS('background-color', 'rgb(177, 78, 112)');
  await page.screenshot({ path: 'clinical-test-results/clinic-procedure-selection.png', fullPage: true });
  await page.getByRole('button', { name: 'Finalize & start', exact: true }).click();
  await expect.poll(() => calls.find(call => call.path === '/api/consultations' && call.body?.status === 'completed')).toBeDefined();
  const save = calls.find(call => call.path === '/api/consultations' && call.body?.status === 'completed');
  expect(save.body.procedureServiceIds).toEqual(['procedure']);
  expect(save.body.packageProductIds).toEqual(['package']);
});


test('Finalize saves Ready, In Progress, and Completed and displays completed status for review', async ({ page }) => {
  const { calls } = await setup(page);
  await page.goto('/dashboard/doctor?view=consultations');
  await page.getByRole('button', { name: 'Clinic', exact: true }).click();
  await page.getByRole('tab', { name: 'Charting' }).click();
  await page.getByRole('textbox', { name: 'Clinical assessment *', exact: true }).fill('Recorded assessment');
  await page.getByLabel('Treatment plan *', { exact: true }).fill('Recorded plan');
  await page.getByRole('button', { name: 'Next: Finalize' }).click();
  await expect(page.getByRole('radio', { name: 'In Progress', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'Ready', exact: true }).check();
  await page.getByRole('button', { name: 'Save chart', exact: true }).click();
  await expect(page.locator('.consultation-status-card')).toContainText('Saved: ready');
  expect(calls.filter(call => call.path === '/api/consultations' && call.method === 'PATCH').at(-1).body.status).toBe('ready');
  await page.getByRole('radio', { name: 'In Progress', exact: true }).check();
  await page.getByRole('button', { name: 'Save chart', exact: true }).click();
  await expect(page.locator('.consultation-status-card')).toContainText('Saved: in progress');
  await page.getByRole('radio', { name: 'Completed', exact: true }).check();
  await page.getByRole('button', { name: 'Save & finalize chart' }).click();
  await expect(page.getByRole('radio', { name: 'Completed', exact: true })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Ready', exact: true })).toBeDisabled();
  await expect(page.locator('.consultation-status-card')).toContainText('Saved: completed');
  expect(calls.filter(call => call.path === '/api/consultations' && call.method === 'PATCH').at(-1).body.status).toBe('completed');
  const treatmentPicker = page.getByRole('button', { name: 'Procedure or package after consultation', exact: false });
  await expect(treatmentPicker).toBeVisible();
  await expect(treatmentPicker).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.cw-procedure-grid button').filter({ hasText: 'Clinic procedure' }).click();
  await page.getByRole('button', { name: 'Packages', exact: true }).click();
  await page.locator('.cw-procedure-grid button').filter({ hasText: 'Clinic package' }).click();
  await page.getByRole('button', { name: 'Start procedure / package', exact: true }).click();
  await expect.poll(() => calls.filter(call => call.path === '/api/consultations' && call.method === 'PATCH').at(-1)?.body.procedureServiceIds).toEqual(['procedure']);
  await expect(page.getByRole('radio', { name: 'Completed', exact: true })).toBeChecked();
  const handoff = calls.filter(call => call.path === '/api/consultations' && call.method === 'PATCH').at(-1).body;
  expect(handoff.status).toBe('completed');
  expect(handoff.procedureServiceIds).toEqual(['procedure']);
  expect(handoff.packageProductIds).toEqual(['package']);
  await page.screenshot({ path: 'clinical-test-results/finalize-consultation-status.png', fullPage: true });
});
