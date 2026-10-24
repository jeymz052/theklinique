const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const { PDFDocument } = require('pdf-lib');
function load(relative, mocks = {}) {
  const filename = path.resolve(relative), mod = new Module(filename, module); mod.filename = filename; mod.paths = module.paths;
  mod.require = name => name in mocks ? mocks[name] : name.startsWith('@/') ? load(name.slice(2) + '.ts', mocks) : require(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
  return mod.exports;
}
const id = '00000000-0000-4000-8000-000000000010';
const medicine = { id: 'm', genericName: 'Test medicine', brand: 'Recorded brand', strengthForm: '10 mg tablet', dose: '1 tablet', frequency: 'once daily', duration: '5 days', quantity: '5', instructions: 'Recorded instructions', indication: 'Recorded indication' };
const document = { id, reference_no: 'RX-TEST', appointment_id: 'visit', client_id: 'client', doctor_id: 'doctor', document_type: 'prescription', released_to_patient: true, issued_at: '2026-10-23T02:00:00Z', content: {
  patient: { name: 'Ni\u00f1a Mu\u00f1oz', patientNo: 'TKP-TEST', dateOfBirth: '2000-10-24', sex: 'Female', address: 'Test address' },
  prescriber: { name: 'Dr. Test', specialty: 'Test specialty', prcNumber: 'TEST-PRC', signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4fQAAAAASUVORK5CYII=' },
  clinic: { name: 'The Klinique', address: 'Test clinic', phone: '123', email: 'clinic@example.test' },
  prescription: { medicines: [medicine], notes: 'Notes with \u00b5g and \u00f1', followUpDate: '2026-11-01', releaseToPatient: true },
  appearance: { heading: 'Electronic Prescription', footer: 'Clinic instructions', accentColor: '#c0385f' },
} };

test('clinical requests explain HTML and malformed responses without exposing server pages', async () => {
  const { clinicalApi } = load('lib/clinicalApi.ts', { '@/lib/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'test-access-token' } } }) } } } });
  const original = global.fetch;
  try {
    for (const status of [404, 502, 200]) {
      global.fetch = async () => new Response('<!DOCTYPE html><html>private server error details</html>', { status, headers: { 'Content-Type': 'text/html' } });
      await assert.rejects(clinicalApi('/api/medical-documents/test/email', { method: 'POST' }), error => {
        assert.ok(!error.message.includes('Unexpected token'));
        assert.ok(!error.message.includes('private server error'));
        return /Refresh the page|Please try again/.test(error.message);
      });
    }
    global.fetch = async () => new Response('{incomplete', { headers: { 'Content-Type': 'application/json' } });
    await assert.rejects(clinicalApi('/api/test'), /incomplete response/);
    global.fetch = async () => Response.json({ error: 'Doctor access is required.' }, { status: 403 });
    await assert.rejects(clinicalApi('/api/test'), /Doctor access is required/);
    global.fetch = async (_, options) => { assert.equal(options.headers.Accept, 'application/json'); assert.equal(options.headers.Authorization, 'Bearer test-access-token'); return Response.json({ email: 'patient@example.test' }); };
    assert.deepEqual(await clinicalApi('/api/test'), { email: 'patient@example.test' });
  } finally { global.fetch = original; }
});
function database(resultFor) {
  const calls = [];
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.operation = 'read'; calls.push(this); }
    select() { return this; } single() { return this; } maybeSingle() { return this; } order() { return this; } limit() { return this; }
    eq(k, v) { this.filters.push([k, v]); return this; } in(k, v) { return this.eq(k, v); } gte(k, v) { return this.eq(k, v); } lte(k, v) { return this.eq(k, v); }
    insert(value) { this.operation = 'insert'; this.value = value; return this; } update(value) { this.operation = 'update'; this.value = value; return this; } upsert(value) { this.operation = 'upsert'; this.value = value; return this; }
    then(resolve, reject) { return Promise.resolve(resultFor(this)).then(resolve, reject); }
  }
  return { calls, from: table => new Query(table) };
}

test('reminders honor Philippine time, five-minute catch-up, status and online-only joining', () => {
  const { dueReminders, reminderEvent } = load('lib/appointmentReminders.ts');
  const visit = { appointment_date: '2027-01-04', appointment_time: '10:00:00.000', status: 'confirmed', consultation_mode: 'online' };
  const at = text => Date.parse(`2027-01-${text}+08:00`);
  assert.deepEqual(dueReminders(visit, at('03T10:00:00')), ['24h']);
  assert.deepEqual(dueReminders(visit, at('04T08:59:59')), []);
  assert.deepEqual(dueReminders(visit, at('04T09:00:00')), ['1h']);
  assert.deepEqual(dueReminders(visit, at('04T09:04:59')), ['1h']);
  assert.deepEqual(dueReminders(visit, at('04T09:05:00')), []);
  assert.deepEqual(dueReminders(visit, at('04T09:45:00')), ['online15m']);
  assert.deepEqual(dueReminders({ ...visit, consultation_mode: 'clinic' }, at('04T09:45:00')), []);
  for (const status of ['pending', 'cancelled', 'completed', 'no_show']) assert.deepEqual(dueReminders({ ...visit, status }, at('04T09:00:00')), []);
  assert.notEqual(reminderEvent(visit, '1h'), reminderEvent({ ...visit, appointment_date: '2027-01-05' }, '1h'));
});

test('prescription markup escapes clinical text, rejects remote artwork and uses Philippine dates', () => {
  const { prescriptionBodyMarkup, prescriptionAccent } = load('lib/prescriptionDocument.ts');
  const content = structuredClone(document.content);
  content.patient.name = '<img src="https://external.test" onerror="alert(1)">';
  content.prescriber.signatureDataUrl = 'https://external.test/signature.png';
  content.prescription.notes = '<script>private notes</script> & follow-up';
  const html = prescriptionBodyMarkup({ content, reference: 'RX-<test>', issuedAt: '2026-10-23T17:00:00Z', logoSrc: 'https://external.test/logo.png' });
  assert.ok(html.includes('&lt;img src=&quot;https://external.test&quot;'));
  assert.ok(html.includes('&lt;script&gt;private notes&lt;/script&gt; &amp; follow-up'));
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('src="https://external.test'));
  assert.ok(html.includes('RX-&lt;test&gt;'));
  assert.ok(html.includes('Age: 26 years')); assert.ok(html.includes('October 24, 2026'));
  assert.equal(prescriptionAccent('red; background:url(https://external.test)'), '#c0385f');
});

test('PDF output embeds Unicode fonts, snapshots and every page of a long prescription', async () => {
  const { createPrescriptionPdf, prescriptionPdfFilename } = load('lib/prescriptionPdf.ts');
  const original = JSON.stringify(document);
  const bytes = await createPrescriptionPdf(document);
  assert.ok(Buffer.from(bytes).subarray(0, 5).equals(Buffer.from('%PDF-')));
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getTitle(), 'Electronic Prescription RX-TEST');
  assert.equal(pdf.getAuthor(), 'Dr. Test'); assert.equal(pdf.getPageCount(), 1);
  assert.equal(JSON.stringify(document), original);
  assert.deepEqual(await createPrescriptionPdf(document), bytes, 'PDF attachment is stable for provider idempotent retries');
  const long = structuredClone(document);
  long.content.prescription.medicines = Array.from({ length: 30 }, (_, index) => ({ ...medicine, id: String(index), instructions: 'Long instructions for pagination. '.repeat(12) }));
  long.content.prescription.notes = 'Long notes and follow-up instructions. '.repeat(150);
  const longPdf = await PDFDocument.load(await createPrescriptionPdf(long));
  assert.ok(longPdf.getPageCount() > 5);
  const coldRenderer = load('lib/prescriptionHtmlPdf.ts');
  assert.deepEqual(await coldRenderer.createPrescriptionPdf(document), bytes, 'PDF attachment is stable across server instances for provider retries');
  assert.equal(prescriptionPdfFilename(document), 'Prescription-RX-TEST.pdf');
  fs.mkdirSync('clinical-test-results', { recursive: true });
  fs.writeFileSync('clinical-test-results/prescription-sample.pdf', bytes);
});

test('native download tickets expire, resist tampering and remain scoped to one document', () => {
  const before = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key-for-ticket-tests';
  try {
    const { downloadTicket, readDownloadTicket } = load('lib/medicalDocumentsServer.ts');
    const now = 1_800_000_000_000, ticket = downloadTicket('patient', id, now);
    assert.equal(readDownloadTicket(ticket, id, now), 'patient');
    assert.equal(readDownloadTicket(ticket, id, now + 300_000), null);
    assert.equal(readDownloadTicket(ticket, 'other-document', now), null);
    assert.equal(readDownloadTicket(`${ticket}x`, id, now), null);
    assert.equal(readDownloadTicket(`x${ticket}`, id, now), null);
  } finally { if (before === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = before; }
});

test('download access rechecks release and client ownership; secretaries cannot download', async () => {
  for (const role of ['patient', 'secretary', 'doctor']) for (const owned of [false, true]) for (const released of [false, true]) {
    const db = database(q => ({ data: q.table === 'medical_documents' ? { ...document, released_to_patient: released } : q.table === 'clients' ? (owned ? { id: 'client' } : null) : null, error: null }));
    const { documentAccess } = load('lib/medicalDocumentsServer.ts', { '@/lib/clinicalServer': { clinicalDatabase: () => db, clinicalUser: async () => ({ user: { id: 'patient' }, role, isDoctor: role === 'doctor' }) } });
    const access = await documentAccess(new Request('http://localhost'), id);
    assert.equal(!!access, role === 'doctor' || (role === 'patient' && owned && released));
    if (role === 'patient' && released) assert.ok(db.calls.find(q => q.table === 'clients').filters.some(([key, value]) => key === 'auth_user_id' && value === 'patient'));
  }
});

test('doctor email uses the registered email and generated PDF; rejects patients and clinic-only copies', async () => {
  for (const doctor of [false, true]) for (const released of [false, true]) {
    const deliveries = [];
    const db = database(() => ({ data: { email: 'registered@example.test' }, error: null }));
    const route = load('app/api/medical-documents/[id]/email/route.ts', {
      '@/lib/medicalDocumentsServer': { documentAccess: async () => ({ db, auth: { isDoctor: doctor }, document: { ...document, released_to_patient: released } }) },
      '@/lib/prescriptionPdf': { createPrescriptionPdf: async () => Buffer.from('%PDF-test-bytes'), prescriptionPdfFilename: () => 'Prescription-RX-TEST.pdf' },
      '@/lib/notificationDelivery': { deliverEmail: async (_, input) => { deliveries.push(input); } },
    });
    const response = await route.POST(new Request('http://localhost/api/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: '00000000-0000-4000-8000-000000000099', to: 'attacker@example.test', content: 'forged' }) }), { params: Promise.resolve({ id }) });
    assert.equal(response.status, !doctor ? 403 : !released ? 409 : 200);
    if (doctor && released) { assert.equal(deliveries[0].to, 'registered@example.test'); assert.equal(Buffer.from(deliveries[0].attachments[0].content, 'base64').toString(), '%PDF-test-bytes'); }
    else assert.equal(deliveries.length, 0);
  }
});

test('download preparation sets a private document-scoped cookie and the PDF response is an attachment', async () => {
  const { NextRequest } = require('next/server');
  const mocks = { '@/lib/medicalDocumentsServer': {
    documentAccess: async (_, incomingId, ticket) => { assert.equal(incomingId, id); if (ticket) assert.equal(ticket, 'signed-test-ticket'); return { auth: { user: { id: 'patient' } }, document }; },
    downloadTicket: () => 'signed-test-ticket', pdfCookieName: 'klinique_pdf', pdfPath: value => `/api/medical-documents/${value}/pdf`,
  }, '@/lib/prescriptionPdf': { prescriptionPdfFilename: () => 'Prescription-RX-TEST.pdf', createPrescriptionPdf: async () => Buffer.from('%PDF-test-file') } };
  const context = { params: Promise.resolve({ id }) };
  const prepare = load('app/api/medical-documents/[id]/download/route.ts', mocks);
  const prepared = await prepare.POST(new Request('http://localhost'), context);
  assert.equal(prepared.status, 200);
  const cookie = prepared.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=strict/i); assert.ok(cookie.includes(`/api/medical-documents/${id}/pdf`));
  assert.match(cookie, /Max-Age=300/i);
  const json = await prepared.json(); assert.equal(json.url.includes('token='), false);
  const route = load('app/api/medical-documents/[id]/pdf/route.ts', mocks);
  const response = await route.GET(new NextRequest(`http://localhost${json.url}`, { headers: { Cookie: 'klinique_pdf=signed-test-ticket' } }), context);
  assert.equal(response.headers.get('Content-Type'), 'application/pdf'); assert.match(response.headers.get('Content-Disposition'), /^attachment;/);
  assert.match(response.headers.get('Cache-Control'), /private, no-store/);
  assert.equal(Buffer.from(await response.arrayBuffer()).toString(), '%PDF-test-file');
});

test('one-hour, joining and prescription alerts notify in-app and email without sending SMS', async () => {
  const notices = [], emails = [], sms = [];
  const details = { id: 'visit', reference_no: 'TK-TEST', status: 'confirmed', appointment_date: '2027-01-04', appointment_time: '10:00', consultation_mode: 'online', visit_kind: 'standard', clients: { full_name: 'Patient', email: 'patient@example.test', phone: '09123456789', auth_user_id: 'patient' }, services: { name: 'Online Consultation', slug: 'online-consultation' } };
  const db = database(q => {
    if (q.table === 'app_notifications') notices.push(q.value);
    return { data: q.table === 'appointments' ? details : q.table === 'orders' ? [] : q.table === 'profiles' ? (q.filters.some(([key]) => key === 'id') ? { id: 'patient', role: 'patient' } : [{ id: 'doctor', email: 'doctor@example.test', role: 'doctor' }]) : { id: 'delivery' }, error: null };
  });
  const previous = global.fetch, previousSms = process.env.SEMAPHORE_API_KEY, previousMail = process.env.RESEND_API_KEY, previousFrom = process.env.RESEND_FROM;
  process.env.SEMAPHORE_API_KEY = 'test'; process.env.RESEND_API_KEY = 'test'; process.env.RESEND_FROM = 'clinic@example.test';
  global.fetch = async (_, options) => { sms.push(options.body.get('message')); return Response.json([{ message_id: 'sms', status: 'queued' }]); };
  try {
    const notifications = load('lib/bookingNotifications.ts', { '@/lib/notificationDelivery': { deliverEmail: async (_, value) => emails.push(value), reserveDelivery: async () => 'delivery', finishDelivery: async () => undefined } });
    await notifications.notifyTimedReminder(db, 'visit', '1h', Date.parse('2027-01-04T09:00:00+08:00'));
    await notifications.notifyTimedReminder(db, 'visit', 'online15m', Date.parse('2027-01-04T09:45:00+08:00'));
    assert.equal(notices.length, 4); assert.equal(emails.length, 4); assert.equal(sms.length, 0);
    assert.ok(notices.filter(n => n.recipient_id === 'doctor').every(n => n.href.includes('view=consultations')));
    assert.ok(notices.filter(n => n.recipient_id === 'patient').every(n => n.href.includes('view=online')));
    await notifications.notifyPrescriptionReady(db, document);
    assert.equal(notices.at(-1).href, '/dashboard/patient?view=documents');
    assert.equal(sms.length, 0, 'released prescriptions must not send a text');
    assert.ok(!emails.at(-1).html.includes('Test medicine'));
    const count = notices.length;
    await notifications.notifyPrescriptionReady(db, { ...document, released_to_patient: false });
    assert.equal(notices.length, count);
  } finally {
    global.fetch = previous;
    for (const [key, value] of [['SEMAPHORE_API_KEY', previousSms], ['RESEND_API_KEY', previousMail], ['RESEND_FROM', previousFrom]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('email retries reuse provider idempotency; a sent event is never sent twice', async () => {
  let row = null;
  const db = database(q => {
    if (q.operation === 'insert') {
      if (row) return { data: null, error: { code: '23505' } };
      row = { ...q.value, id: 'delivery-one', status: 'processing', created_at: new Date().toISOString() };
    } else if (q.operation === 'update') Object.assign(row, q.value);
    return { data: row, error: null };
  });
  const previousFetch = global.fetch, previousKey = process.env.RESEND_API_KEY, previousFrom = process.env.RESEND_FROM;
  process.env.RESEND_API_KEY = 'fake'; process.env.RESEND_FROM = 'clinic@example.test';
  const sends = []; let reject = true;
  global.fetch = async (_, options) => { sends.push(options); return reject ? Response.json({ message: 'Temporary failure' }, { status: 503 }) : Response.json({ id: 'accepted' }); };
  try {
    const { deliverEmail } = load('lib/notificationDelivery.ts');
    const input = { appointmentId: 'visit', event: 'prescription_ready:test', to: 'patient@example.test', subject: 'Prescription ready', html: '<p>Portal</p>' };
    await assert.rejects(deliverEmail(db, input), /Temporary failure/); assert.equal(row.status, 'failed');
    reject = false; await deliverEmail(db, input); assert.equal(row.status, 'sent');
    await deliverEmail(db, input); assert.equal(sends.length, 2);
    assert.equal(sends[0].headers['Idempotency-Key'], sends[1].headers['Idempotency-Key']);
    row.status = 'processing'; row.created_at = new Date().toISOString();
    await assert.rejects(deliverEmail(db, input), /still processing/);
    assert.equal(sends.length, 2);
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of [['RESEND_API_KEY', previousKey], ['RESEND_FROM', previousFrom]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('scheduled endpoint requires the cron secret and dispatches only due confirmed appointments', async () => {
  const previousSecret = process.env.CRON_SECRET, previousNow = Date.now;
  process.env.CRON_SECRET = 'test-secret'; Date.now = () => Date.parse('2027-01-04T09:00:00+08:00');
  const dispatched = [];
  const db = database(q => ({ data: q.table === 'appointments' ? [
    { id: 'due', appointment_date: '2027-01-04', appointment_time: '10:00', status: 'confirmed', consultation_mode: 'online' },
    { id: 'cancelled', appointment_date: '2027-01-04', appointment_time: '10:00', status: 'cancelled', consultation_mode: 'online' },
    { id: 'later', appointment_date: '2027-01-04', appointment_time: '11:00', status: 'confirmed', consultation_mode: 'clinic' },
  ] : [], error: null }));
  try {
    const route = load('app/api/notifications/reminders/route.ts', { '@/lib/clinicalServer': { clinicalDatabase: () => db }, '@/lib/bookingNotifications': { notifyTimedReminder: async (_, id, kind) => dispatched.push({ id, kind }), notifyPrescriptionReady: async () => undefined } });
    assert.equal((await route.GET(new Request('http://localhost/api/notifications/reminders'))).status, 401);
    assert.equal(db.calls.length, 0);
    const response = await route.GET(new Request('http://localhost/api/notifications/reminders', { headers: { Authorization: 'Bearer test-secret' } }));
    assert.equal(response.status, 200); assert.deepEqual(dispatched, [{ id: 'due', kind: '1h' }]);
    assert.ok(response.headers.get('Cache-Control').includes('no-store'));
  } finally { Date.now = previousNow; if (previousSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previousSecret; }
});
