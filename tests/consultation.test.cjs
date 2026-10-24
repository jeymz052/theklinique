const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function load(relative, mocks = {}) {
  const filename = path.resolve(relative);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  mod.require = name => name in mocks ? mocks[name] : name.startsWith('@/') ? load(name.slice(2) + '.ts', mocks) : require(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
  return mod.exports;
}
const rules = load('lib/consultation.ts');
const medicine = { id: 'one', genericName: 'Medicine entered by doctor', brand: '', strengthForm: '10 mg tablet', dose: '1 tablet', frequency: 'once a day', duration: '5 days', quantity: '5', instructions: '', indication: '' };
const prescription = { medicines: [medicine], notes: 'Doctor instructions', followUpDate: '', releaseToPatient: true };

test('online fee is the full PHP 600 fee; clinic and follow-up retain their payment treatment', () => {
  assert.deepEqual(rules.bookingPayment('online'), { amount: 600, kind: 'online_consultation_fee', credited_to_visit: false, full_fee: true });
  assert.equal(rules.bookingPayment('online', true).amount, 600);
  assert.equal(rules.bookingPayment('clinic').credited_to_visit, true);
  assert.equal(rules.bookingPayment('clinic', true).kind, 'consultation_follow_up_fee');
});
test('consultation settings expose only embedded Zoom configuration and prescription fields', () => {
  const settings = rules.consultationSettingsFromRow({ zoom_meeting_number: '12345678901', video_mode: 'link', meeting_url: 'https://meet.google.com/abc-defg-hij', internal_secret: 'private' });
  assert.equal(settings.zoom_meeting_number, '12345678901');
  assert.equal(settings.video_mode, undefined); assert.equal(settings.meeting_url, undefined); assert.equal(settings.internal_secret, undefined);
  assert.deepEqual(Object.keys(settings), Object.keys(rules.defaultConsultationSettings));
});
test('patient joining is limited to confirmed visits and the correct Philippine time window', () => {
  const start = Date.parse('2026-10-25T10:00:00+08:00');
  assert.equal(rules.canJoinOnlineVisit('2026-10-25', '10:00:00', 'confirmed', start - 15 * 60_000), true);
  assert.equal(rules.canJoinOnlineVisit('2026-10-25', '10:00', 'confirmed', start - 15 * 60_000 - 1), false);
  assert.equal(rules.canJoinOnlineVisit('2026-10-25', '10:00', 'confirmed', start + 60 * 60_000), false);
  for (const status of ['pending', 'completed', 'cancelled', 'no_show']) assert.equal(rules.canJoinOnlineVisit('2026-10-25', '10:00', status, start), false);
});
test('prescriptions reject incomplete medication details, invalid dates and excessive medicine counts', () => {
  assert.equal(rules.validatePrescription(prescription).medicines.length, 1);
  assert.throws(() => rules.validatePrescription({ ...prescription, medicines: [{ ...medicine, dose: '' }] }), /required details/);
  assert.throws(() => rules.validatePrescription({ ...prescription, followUpDate: '2026-02-30' }), /valid follow-up/);
  assert.throws(() => rules.validatePrescription({ ...prescription, medicines: Array(31).fill(medicine) }), /30 medicines/);
});

function database(resultFor) {
  const calls = [];
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.operation = 'read'; calls.push(this); }
    select() { return this; } order() { return this; } limit() { return this; }
    eq(key, value) { this.filters.push(['eq', key, value]); return this; }
    in(key, value) { this.filters.push(['in', key, value]); return this; }
    update(value) { this.operation = 'update'; this.value = value; return this; }
    insert(value) { this.operation = 'insert'; this.value = value; return this; }
    upsert(value) { this.operation = 'upsert'; this.value = value; return this; }
    single() { return this; } maybeSingle() { return this; }
    then(resolve, reject) { return Promise.resolve(resultFor(this)).then(resolve, reject); }
  }
  return { calls, from: table => new Query(table), rpc: (name, value) => { const query = new Query(name); query.value = value; return query; } };
}
const request = (url, body) => new Request(`http://localhost${url}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});

test('dated progress notes validate calendar dates, descriptions, and follow-up ordering', () => {
  const progress = load('lib/patientProgress.ts');
  const valid = { visitDate: '2026-10-23', description: ' Cheek procedure performed ', followUpDate: '2026-11-06', followUpNotes: 'Review the improvement' };
  assert.equal(progress.validateProgressNote(valid).description, 'Cheek procedure performed');
  assert.throws(() => progress.validateProgressNote({ ...valid, visitDate: '2026-02-30' }), /valid procedure/);
  assert.throws(() => progress.validateProgressNote({ ...valid, followUpDate: '2026-10-22' }), /on or after/);
  assert.throws(() => progress.validateProgressNote({ ...valid, description: ' ' }), /Describe/);
});

test('treatment step navigation requires prior stages and validates requested follow-ups', () => {
  const treatment = load('lib/treatment.ts');
  let form = treatment.emptyTreatmentForm();
  assert.match(treatment.validateTreatmentStep(form, null, 5), /acknowledgment/);
  form = { ...form, consentGiven: true, consentSignatureName: 'Patient', procedureDate: '2026-10-23' };
  assert.match(treatment.validateTreatmentStep(form, null, 4), /required procedure/);
  form.procedureDetails = { treatment_area: 'Cheeks' };
  assert.match(treatment.validateTreatmentStep(form, null, 5), /post-care/);
  form.postcareGiven = true;
  assert.equal(treatment.validateTreatmentStep(form, null, 5, true), null);
  assert.match(treatment.validateTreatmentStep({ ...form, followUpRequired: true, followUpDate: '2026-10-22' }, null, 5), /on or after/);
  const protocol = { allowed_anesthesia: ['local'], anesthesia_requirement: 'required' };
  assert.equal(treatment.validateTreatmentStep(form, protocol, 2), null);
  assert.match(treatment.validateTreatmentStep(form, protocol, 3), /anesthesia/);
});

test('patient progress API requires doctor access and validates patient ownership before writes', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const db = database(query => ({ data: query.table === 'clients' ? { id } : null, error: null }));
  const server = { clinicalDatabase: () => db, clinicalUser: async () => null };
  const route = load('app/api/patient-progress/route.ts', { '@/lib/clinicalServer': server });
  assert.equal((await route.GET(request(`/api/patient-progress?clientId=${id}`))).status, 401);
  for (const role of ['secretary', 'patient']) {
    server.clinicalUser = async () => ({ user: { id }, isDoctor: false, role });
    assert.equal((await route.GET(request(`/api/patient-progress?clientId=${id}`))).status, 403);
    assert.equal((await route.POST(request('/api/patient-progress', { clientId: id }))).status, 403);
  }
  server.clinicalUser = async () => ({ user: { id }, isDoctor: true });
  assert.equal((await route.POST(request('/api/patient-progress', { clientId: id, appointmentId: id, visitDate: '2026-10-23', description: 'Notes' }))).status, 409);
  assert.equal(db.calls.filter(query => query.operation !== 'read').length, 0);
});

test('clinical uploads decode real images, store private WebP, and remove the upload after a failed database write', async () => {
  const sharp = require('sharp'), id = '00000000-0000-4000-8000-000000000001';
  let failure = false;
  const db = database(query => ({ data: query.table === 'clients' ? { id } : query.table === 'appointments' ? { id, services: { service_categories: { slug: 'facials' } } } : query.operation === 'upsert' ? { id: 'photo' } : null, error: query.operation === 'upsert' && failure ? { message: 'Simulated write failure' } : null }));
  const storage = [];
  db.storage = { from: bucket => ({ upload: async (path, bytes, options) => { storage.push({ operation: 'upload', bucket, path, bytes, options }); return { error: null }; }, remove: async paths => { storage.push({ operation: 'remove', paths }); return { error: null }; } }) };
  const route = load('app/api/patient-progress/route.ts', { '@/lib/clinicalServer': { clinicalDatabase: () => db, clinicalUser: async () => ({ user: { id }, isDoctor: true }) } });
  const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#efc0d1' } }).png().toBuffer();
  function upload(fileBytes) { const form = new FormData(); for (const [key, value] of Object.entries({ clientId: id, appointmentId: id, kind: 'before', takenOn: '2026-10-23', area: 'Cheeks', description: 'Before treatment' })) form.set(key, value); form.set('file', new File([fileBytes], 'photo.png', { type: 'image/png' })); return new Request('http://localhost/api/patient-progress', { method: 'POST', body: form }); }
  assert.equal((await route.POST(upload(Buffer.from('not an image')))).status, 400);
  assert.equal(storage.length, 0);
  assert.equal((await route.POST(upload(bytes))).status, 201);
  assert.equal(storage[0].bucket, 'patient-clinical-media');
  assert.equal((await sharp(storage[0].bytes).metadata()).format, 'webp');
  failure = true;
  const log = console.error; console.error = () => {};
  try { assert.equal((await route.POST(upload(bytes))).status, 500); } finally { console.error = log; }
  assert.equal(storage.at(-1).operation, 'remove');
  assert.deepEqual(storage.at(-1).paths, [storage.at(-2).path]);
});

test('consultations fetch only profile photos and cannot attach treatment comparison photos', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const db = database(query => ({ data: query.table === 'clients' ? { id } : query.table === 'appointments' && query.filters.some(filter => filter[1] === 'id') ? { id, services: { service_categories: { slug: 'consultations' } } } : [], error: null }));
  const route = load('app/api/patient-progress/route.ts', { '@/lib/clinicalServer': { clinicalDatabase: () => db, clinicalUser: async () => ({ user: { id }, isDoctor: true }) } });
  assert.equal((await route.GET(request(`/api/patient-progress?clientId=${id}&photos=profile`))).status, 200);
  assert.ok(db.calls.find(query => query.table === 'patient_photos').filters.some(filter => filter[1] === 'kind' && filter[2] === 'profile'));
  const form = new FormData();
  for (const [key, value] of Object.entries({ clientId: id, appointmentId: id, kind: 'before', takenOn: '2026-10-23' })) form.set(key, value);
  form.set('file', new File(['invalid'], 'photo.png', { type: 'image/png' }));
  const response = await route.POST(new Request('http://localhost/api/patient-progress', { method: 'POST', body: form }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /only be added from a treatment/);
  assert.equal(db.calls.filter(query => query.operation !== 'read').length, 0);
});

test('treatment API rejects step skipping and uses an atomic save with server-owned consent', async () => {
  const treatment = load('lib/treatment.ts');
  const db = database(query => ({ data: query.table === 'appointments' ? { id: 'visit', client_id: 'patient', service_id: 'service', status: 'confirmed', services: { service_categories: { slug: 'facials' } } } : query.table === 'treatment_protocols' ? { consent_version: '2.0', consent_text: 'Actual clinic consent' } : { id: 'case' }, error: null }));
  const route = load('app/api/treatments/route.ts', { '@/lib/clinicalServer': { clinicalDatabase: () => db, clinicalUser: async () => ({ user: { id: 'doctor' }, isDoctor: true }) } });
  const form = { ...treatment.emptyTreatmentForm(), appointmentId: 'visit', currentStep: 5, status: 'completed', consentTextSnapshot: 'Forged' };
  assert.equal((await route.PATCH(request('/api/treatments', form))).status, 400);
  const valid = { ...form, consentGiven: true, consentSignatureName: 'Patient', procedureDetails: { treatment_area: 'Cheeks' }, procedureDate: '2026-10-23', postcareGiven: true, followUpRequired: true, followUpDate: '2026-11-06' };
  assert.equal((await route.PATCH(request('/api/treatments', valid))).status, 200);
  const saved = db.calls.find(query => query.table === 'save_treatment_chart').value;
  assert.equal(saved.p_record.consent_text_snapshot, 'Actual clinic consent');
  assert.equal(saved.p_record.follow_up_date, '2026-11-06');
  assert.equal(saved.p_complete, true);
  assert.equal(db.calls.filter(query => query.operation === 'update').length, 0);
});

test('medical documents require sign-in, reject secretaries, and scope patients by account and release flag', async () => {
  const db = database(query => ({ data: query.table === 'clients' ? [{ id: 'own-client' }] : [], error: null }));
  const server = { clinicalDatabase: () => db, clinicalUser: async () => null };
  const route = load('app/api/medical-documents/route.ts', { '@/lib/clinicalServer': server });
  assert.equal((await route.GET(request('/api/medical-documents'))).status, 401);
  server.clinicalUser = async () => ({ user: { id: 'secretary' }, isDoctor: false, role: 'secretary' });
  assert.equal((await route.GET(request('/api/medical-documents'))).status, 403);
  assert.equal((await route.POST(request('/api/medical-documents', { appointmentId: 'other' }))).status, 403);
  server.clinicalUser = async () => ({ user: { id: 'patient' }, isDoctor: false, role: 'patient' });
  assert.equal((await route.GET(request('/api/medical-documents?id=another-patients-document'))).status, 200);
  const query = db.calls.find(query => query.table === 'medical_documents');
  assert.ok(query.filters.some(filter => filter[1] === 'released_to_patient' && filter[2] === true));
  assert.deepEqual(query.filters.find(filter => filter[1] === 'client_id')[2], ['own-client']);
  assert.ok(db.calls.find(query => query.table === 'clients').filters.some(filter => filter[1] === 'auth_user_id' && filter[2] === 'patient'));
});
test('issuing uses the saved chart, registered patient and doctor signature rather than browser-supplied identities', async () => {
  const db = database(query => {
    const results = {
      appointments: { id: 'visit', client_id: 'client', consultation_mode: 'online', status: 'confirmed', clients: { full_name: 'Actual Patient', patient_no: 'P001', date_of_birth: '2000-01-01', sex: 'Female', address: 'Patient address' } },
      consultation_charts: { clinical_assessment: 'Recorded assessment', prescription_draft: prescription },
      consultation_settings: { signature_data_url: 'data:image/png;base64,c2ln', prc_number: 'LICENSE', specialty: 'Doctor', accent_color: '#c0385f' },
      clinic_settings: { clinic_name: 'The Klinique', doctor_name: 'Registered Doctor', city: 'Clinic City', contact_phone: '123', contact_email: 'clinic@example.test' },
      medical_documents: null,
      issue_consultation_prescription: { id: 'issued' },
    };
    return { data: results[query.table], error: null };
  });
  const route = load('app/api/medical-documents/route.ts', { '@/lib/clinicalServer': { clinicalDatabase: () => db, clinicalUser: async () => ({ user: { id: 'doctor-id' }, isDoctor: true }) } });
  const response = await route.POST(request('/api/medical-documents', { appointmentId: 'visit', content: { patient: { name: 'Forged' } }, signature: 'Forged' }));
  assert.equal(response.status, 201);
  const content = db.calls.find(query => query.table === 'issue_consultation_prescription').value.p_content;
  assert.equal(content.patient.name, 'Actual Patient');
  assert.equal(content.prescriber.name, 'Registered Doctor');
  assert.equal(content.prescriber.signatureDataUrl, 'data:image/png;base64,c2ln');
  assert.deepEqual(content.prescription, prescription);
});
test('PayMongo checkout charges 60000 centavos, QR Ph only, and retains full-fee metadata', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-test-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-test-key';
  process.env.PAYMONGO_SECRET_KEY = 'sk_test_fake';
  const db = database(query => ({ data: query.table === 'appointments' ? { id: 'visit', reference_no: 'TK-TEST', consultation_mode: 'online', visit_kind: 'standard', clients: { email: 'patient@example.test', full_name: 'Patient', phone: '123' } } : query.operation === 'update' ? [{ id: 'payment' }] : { id: 'payment', status: 'awaiting_payment', metadata: {} }, error: null }));
  db.auth = { getUser: async () => ({ data: { user: { id: 'patient', email: 'patient@example.test' } } }) };
  const route = load('app/api/payments/reservation/route.ts', { '@supabase/supabase-js': { createClient: () => db } });
  let checkout;
  const previousFetch = global.fetch;
  global.fetch = async (_url, options) => { checkout = JSON.parse(options.body); return Response.json({ data: { id: 'cs_test', attributes: { checkout_url: 'https://checkout.paymongo.com/test' } } }); };
  try {
    const response = await route.POST(new Request('http://localhost/api/payments/reservation', { method: 'POST', headers: { authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ appointmentId: 'visit', amount: 1 }) }));
    assert.equal(response.status, 200);
    assert.equal(checkout.data.attributes.line_items[0].amount, 60000);
    assert.deepEqual(checkout.data.attributes.payment_method_types, ['qrph']);
    const payment = db.calls.find(query => query.table === 'payments' && query.operation === 'update');
    assert.equal(payment.value.metadata.kind, 'online_consultation_fee');
    assert.equal(payment.value.metadata.credited_to_visit, false);
    assert.ok(db.calls.find(query => query.table === 'appointments').filters.some(filter => filter[1] === 'clients.email' && filter[2] === 'patient@example.test'));
  } finally { global.fetch = previousFetch; }
});
