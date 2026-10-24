const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
let db;
const patient = randomUUID(), doctor = randomUUID();
before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.role() returns text language sql as 'select current_user::text';
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create function public.uuid_generate_v4() returns uuid language sql as 'select gen_random_uuid()';
    create table public.clients(id uuid primary key);
    create type appointment_status as enum ('pending','confirmed','completed','cancelled','no_show');
    create table public.appointments(id uuid primary key, client_id uuid references clients(id), status appointment_status not null default 'confirmed', completed_at timestamptz, appointment_date date, appointment_time time);
    create unique index slot on appointments(appointment_date,appointment_time) where status in ('pending','confirmed');
    create table public.service_categories(id uuid primary key default gen_random_uuid(),slug text unique);
    insert into service_categories(slug) values('consultations');
    create table public.service_subcategories(category_id uuid,name text,slug text,sort_order int, unique(category_id,name));
    create table public.services(id uuid primary key default gen_random_uuid(),category_id uuid,subcategory text,name text,slug text unique,description text,price numeric,price_note text,duration_mins int,is_active boolean,sort_order int);
    create table public.consultation_charts(id uuid primary key default gen_random_uuid(),appointment_id uuid unique references appointments(id),client_id uuid,doctor_id uuid,clinical_assessment text,subjective_notes text,objective_notes text,treatment_plan text,follow_up_required boolean,follow_up_recommended_date date,follow_up_notes text,follow_up_appointment_id uuid,status text,started_at timestamptz,completed_at timestamptz,updated_at timestamptz);
  `);
  await db.exec('alter table appointments add column service_id uuid references services(id)');
  await db.exec(`
    alter table clients add column full_name text;
    alter table appointments add column reference_no text, add column staff_notes text, add column reservation_fee_waived_at timestamptz,
      add column parent_appointment_id uuid references appointments(id), add column source_consultation_appointment_id uuid references appointments(id);
    create table payments(id uuid primary key default gen_random_uuid(),appointment_id uuid references appointments(id) on delete restrict,status text,paid_at timestamptz);
  `);
  await db.exec(readFileSync('supabase/migrations/20261006_add_treatment_workflows.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261024_add_online_consultations_and_prescriptions.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261025_add_patient_progress_and_treatment_review.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261026_add_embedded_zoom.sql', 'utf8'));
  await db.exec("update consultation_settings set video_mode='link', meeting_url='https://meet.google.com/abc-defg-hij'");
  await db.exec(readFileSync('supabase/migrations/20261027_use_embedded_zoom_only.sql', 'utf8'));
  await db.query('insert into clients values ($1)', [patient]);
  await db.query('insert into auth.users values ($1)', [doctor]);
});

test('Zoom settings migrate safely, reject invalid modes/meeting numbers, and remain private', async () => {
  const settings = (await db.query('select video_mode, zoom_meeting_number, meeting_url from consultation_settings where id=1')).rows[0];
  assert.deepEqual(settings, { video_mode: 'zoom', zoom_meeting_number: '', meeting_url: '' });
  await assert.rejects(db.query("update consultation_settings set video_mode='arbitrary'"), /check constraint/);
  await assert.rejects(db.query("update consultation_settings set video_mode='link'"), /check constraint/);
  await assert.rejects(db.query("update consultation_settings set meeting_url='https://zoom.us/j/12345678901'"), /check constraint/);
  await assert.rejects(db.query("update consultation_settings set zoom_meeting_number='https://other.example'"), /check constraint/);
  await db.exec('set role authenticated');
  try { await assert.rejects(db.query('select * from consultation_settings'), /permission denied/); }
  finally { await db.exec('reset role'); }
});

test('clinical photos stay private and browser roles cannot read patient progress tables', async () => {
  const bucket = (await db.query("select * from storage.buckets where id='patient-clinical-media'")).rows[0];
  assert.equal(bucket.public, false);
  assert.deepEqual(bucket.allowed_mime_types, ['image/webp']);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try { for (const table of ['patient_photos', 'patient_progress_notes']) await assert.rejects(db.query(`select * from ${table}`), /permission denied/); }
    finally { await db.exec('reset role'); }
  }
});

test('patient photos keep one profile and dated progress notes reject earlier follow-ups', async () => {
  await db.query("insert into patient_photos(client_id,kind,taken_on,storage_path) values($1,'profile','2026-10-23','profile.webp')", [patient]);
  await assert.rejects(db.query("insert into patient_photos(client_id,kind,taken_on,storage_path) values($1,'profile','2026-10-24','duplicate.webp')", [patient]), /patient_profile_photo/);
  await assert.rejects(db.query("insert into patient_progress_notes(client_id,visit_date,description,follow_up_date) values($1,'2026-10-23','Procedure done','2026-10-22')", [patient]), /check constraint/);
});

test('treatment finalization saves dates atomically and completed charts are read-only', async () => {
  const service = (await db.query("insert into services(name,slug) values('Test procedure','test-procedure') returning id")).rows[0].id;
  const id = await visit('clinic');
  await db.query('update appointments set service_id=$1 where id=$2', [service, id]);
  const record = { current_step: 5, consent_given: true, consent_signature_name: 'Patient', anesthesia_type: 'none', procedure_details: { treatment_area: 'Cheeks' }, procedure_notes: 'Procedure performed on cheeks', performed_on: '2026-10-23', postcare_given: true, follow_up_required: true, follow_up_date: '2026-11-06', follow_up_notes: 'Review improvement' };
  const saveTreatment = value => db.query('select * from public.save_treatment_chart($1,$2,$3::jsonb,true)', [id, doctor, JSON.stringify(value)]);
  await assert.rejects(saveTreatment({ ...record, postcare_given: false }), /Consent and post-care/);
  assert.equal((await db.query('select status from appointments where id=$1', [id])).rows[0].status, 'confirmed');
  const saved = (await saveTreatment(record)).rows[0];
  assert.equal(saved.status, 'completed'); assert.equal(saved.current_step, 5);
  assert.equal(saved.performed_on.toISOString().slice(0, 10), '2026-10-23');
  assert.equal(saved.follow_up_date.toISOString().slice(0, 10), '2026-11-06');
  assert.equal((await db.query('select status from appointments where id=$1', [id])).rows[0].status, 'completed');
  await assert.rejects(saveTreatment({ ...record, procedure_notes: 'Overwritten' }), /review only/);
});

test('Jordan cleanup SQL deletes only the named unpaid tests and refuses payment history', async () => {
  const jordan = 'd8e71d25-9af1-4d95-899b-df9864c07915';
  await db.query("insert into clients(id,full_name) values($1,'Jordan Taduran')", [jordan]);
  const service = (await db.query("select id from services where slug='online-consultation'")).rows[0].id;
  const old = ['8681390e-31f7-4371-ad2e-7a0b510be370','42825c3a-7a93-4bbf-90fd-f86a5da96a1a'];
  const replacement = '138f8549-2038-4d8f-a9f8-49cb7c814fb3';
  for (const id of [...old, replacement]) {
    await db.query("insert into appointments(id,client_id,service_id,status,consultation_mode,reference_no,staff_notes,reservation_fee_waived_at) values($1,$2,$3,$4,'online',$5,$6,$7)", [id,jordan,service,id === replacement ? 'confirmed' : 'pending',id === replacement ? 'TK-20260021' : id,'[TEST-ONLINE-JORDAN-2027] Temporary test',new Date()]);
    await db.query('insert into payments(appointment_id,status) values($1,$2)', [id,id === old[1] ? 'paid' : id === replacement ? 'waived' : 'awaiting_payment']);
  }
  const cleanup = readFileSync('docs/sql/delete-jordan-old-online-tests.sql','utf8');
  await assert.rejects(db.exec(cleanup), /Stopped/);
  assert.equal((await db.query('select count(*)::int as count from appointments where id=any($1::uuid[])',[old])).rows[0].count,2);
  await db.query("update payments set status='awaiting_payment' where appointment_id=$1",[old[1]]);
  await db.exec(cleanup);
  await db.exec(cleanup); // Safe to rerun in a separate editor execution/session.
  assert.equal((await db.query('select count(*)::int as count from appointments where id=any($1::uuid[])',[old])).rows[0].count,0);
  assert.equal((await db.query('select status from appointments where id=$1',[replacement])).rows[0].status,'confirmed');
  await db.exec(readFileSync('docs/sql/delete-jordan-replacement-after-testing.sql','utf8'));
  assert.equal((await db.query('select count(*)::int as count from appointments where id=$1',[replacement])).rows[0].count,0);
  assert.equal((await db.query('select full_name from clients where id=$1',[jordan])).rows[0].full_name,'Jordan Taduran');
});
after(async () => { if (db) await db.close(); });
async function visit(mode = 'online') { const id = randomUUID(); await db.query('insert into appointments(id,client_id,consultation_mode) values($1,$2,$3)', [id, patient, mode]); return id; }
async function save(id, chart, status = 'in_progress') { return (await db.query('select (public.save_consultation_chart($1,$2,$3::jsonb,$4)).*', [id, doctor, JSON.stringify(chart), status])).rows[0]; }
const chart = { clinical_assessment: 'Assessment entered by the doctor', treatment_plan: 'Plan entered by the doctor', follow_up_required: false, no_prescription_required: false, prescription_draft: { medicines: [{ id: 'one', genericName: 'Medication' }], notes: '', followUpDate: '', releaseToPatient: true } };

test('migration seeds an online consultation at PHP 600', async () => {
  const service = (await db.query("select price,duration_mins from services where slug='online-consultation'")).rows[0];
  assert.equal(Number(service.price), 600); assert.equal(service.duration_mins, 60);
  await assert.rejects(db.query("update services set price=500 where slug='online-consultation'"), /online_consultation_price/);
});
test('clinic and online appointments compete for the same slot', async () => {
  const one = await visit('clinic'), two = await visit();
  await db.query("update appointments set appointment_date='2026-10-25',appointment_time='10:00' where id=$1", [one]);
  await assert.rejects(db.query("update appointments set appointment_date='2026-10-25',appointment_time='10:00' where id=$1", [two]), /unique/);
});
test('finalizing requires an assessment and plan and does not partially complete the appointment', async () => {
  const id = await visit();
  await assert.rejects(save(id, {}, 'completed'), /assessment and treatment plan/);
  await save(id, chart);
  await assert.rejects(save(id, chart, 'completed'), /Issue the prescription/);
  assert.equal((await db.query('select status from appointments where id=$1', [id])).rows[0].status, 'confirmed');
  assert.equal((await db.query('select status from consultation_charts where appointment_id=$1', [id])).rows[0].status, 'in_progress');
});
test('online visits can explicitly finish without a prescription; completed charts cannot return to draft', async () => {
  const id = await visit();
  await save(id, { ...chart, prescription_draft: null, no_prescription_required: true }, 'completed');
  assert.equal((await db.query('select status from appointments where id=$1', [id])).rows[0].status, 'completed');
  await assert.rejects(save(id, chart), /cannot be returned to draft/);
});
test('clinic chart finalization needs no online prescription step', async () => {
  const id = await visit('clinic');
  assert.equal((await save(id, { ...chart, prescription_draft: null }, 'completed')).status, 'completed');
});
test('issued prescriptions are idempotent, preserve snapshots, and cannot be silently edited', async () => {
  const id = await visit();
  await save(id, chart);
  const content = { patient: { name: 'Original Patient' }, prescriber: { signatureDataUrl: 'original-signature' }, prescription: chart.prescription_draft };
  const issue = async value => (await db.query('select (public.issue_consultation_prescription($1,$2,$3,$4::jsonb)).*', [id, doctor, randomUUID(), JSON.stringify(value)])).rows[0];
  await assert.rejects(issue({ ...content, prescription: { ...chart.prescription_draft, notes: 'Unsaved change' } }), /draft changed/);
  const document = await issue(content);
  assert.equal((await issue(content)).id, document.id);
  await assert.rejects(db.query('update medical_documents set content=$1 where id=$2', [JSON.stringify({ ...content, patient: { name: 'Altered' } }), document.id]), /cannot be rewritten/);
  await assert.rejects(save(id, { ...chart, prescription_draft: { ...chart.prescription_draft, notes: 'Changed' } }), /cannot be changed/);
  assert.equal((await save(id, chart, 'completed')).status, 'completed');
  assert.equal((await db.query('select content from medical_documents where id=$1', [document.id])).rows[0].content.prescriber.signatureDataUrl, 'original-signature');
});
test('browser roles cannot directly read signatures, templates, or medical documents', async () => {
  await db.exec('set role anon');
  try { for (const table of ['consultation_settings','medical_documents','prescription_templates']) await assert.rejects(db.query(`select * from ${table}`), /permission denied/); }
  finally { await db.exec('reset role'); }
  await db.exec('set role authenticated');
  try { await assert.rejects(db.query('select * from consultation_settings'), /permission denied/); }
  finally { await db.exec('reset role'); }
});
