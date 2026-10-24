const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
function load(relative) {
  const filename = path.resolve(relative), mod = new Module(filename, module); mod.filename = filename; mod.paths = module.paths;
  mod.require = name => name.startsWith('@/') ? load(name.slice(2) + '.ts') : require(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
  return mod.exports;
}
const notifications = load('lib/bookingNotifications.ts');
const rules = load('lib/bookingNotice.ts');
const base = { id: 'visit', status: 'confirmed', reference_no: 'TK-TEST', appointment_date: '2027-01-04', appointment_time: '10:00', consultation_mode: 'clinic', visit_kind: 'standard', clients: { full_name: 'Test Patient', email: 'patient@example.test', phone: '09123456789' }, services: { name: 'Consultation with Dr. Kharyl', slug: 'consult-dr-kharyl', service_categories: { slug: 'consultations' } } };
const cases = [
  { label: 'Online consultation', details: { ...base, consultation_mode: 'online', services: { name: 'Online Consultation with Dr. Kharyl', slug: 'online-consultation', service_categories: { slug: 'consultations' } } }, names: ['Online Consultation with Dr. Kharyl'] },
  { label: 'Clinic consultation', details: base, names: ['Consultation with Dr. Kharyl'] },
  { label: 'Procedure', details: { ...base, services: { name: 'HIFU cheeks', slug: 'hifu-cheeks', service_categories: { slug: 'hifu' } }, appointment_services: [{ services: { name: 'Chin fillers' } }] }, names: ['HIFU cheeks', 'Chin fillers'] },
  { label: 'Package booking', details: { ...base, services: { name: 'Glow Plans (Packages)', slug: 'glow-plans-package-booking', is_package: true, service_categories: { slug: 'package-bookings' } } }, packages: ['Radiance package'], names: ['Radiance package'] },
  { label: 'Procedure & package booking', details: { ...base, services: { name: 'Facial treatment', slug: 'facial', service_categories: { slug: 'facials' } }, products: { name: 'Glow package' } }, names: ['Facial treatment', 'Glow package'] },
  { label: 'Online follow-up consultation', details: { ...base, consultation_mode: 'online', visit_kind: 'consultation_follow_up' }, names: ['Consultation with Dr. Kharyl'] },
];
function database(details, packageNames = []) {
  const calls = [], deliveries = new Set();
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.operation = 'read'; calls.push(this); }
    select() { return this; } single() { return this; } maybeSingle() { return this; }
    eq(key, value) { this.filters.push([key, value]); return this; }
    in(key, value) { this.filters.push([key, value]); return this; }
    insert(value) { this.operation = 'insert'; this.value = value; return this; }
    update(value) { this.operation = 'update'; this.value = value; return this; }
    upsert(value) { this.operation = 'upsert'; this.value = value; return this; }
    then(resolve, reject) {
      let data = { id: 'delivery' }, error = null;
      if (this.table === 'appointments') data = details;
      if (this.table === 'orders') data = packageNames.length ? [{ order_items: packageNames.map(name => ({ products: { name } })) }] : [];
      if (this.table === 'profiles') data = this.filters.some(([key]) => key === 'email') ? [{ id: 'patient', email: 'patient@example.test', role: 'patient' }] : [{ id: 'doctor', email: 'doctor@example.test', role: 'doctor' }, { id: 'secretary', email: 'secretary@example.test', role: 'secretary' }];
      if (this.table === 'notification_deliveries' && this.operation === 'insert') {
        const key = JSON.stringify(this.value); if (deliveries.has(key)) error = { code: '23505' }; else deliveries.add(key);
      }
      if (this.table === 'notification_deliveries' && this.operation === 'read') data = { id: 'delivery', status: 'sent' };
      return Promise.resolve({ data, error }).then(resolve, reject);
    }
  }
  return { calls, from: table => new Query(table) };
}
async function capture(action) {
  const previousFetch = global.fetch, env = Object.fromEntries(['RESEND_API_KEY', 'RESEND_FROM', 'SEMAPHORE_API_KEY'].map(key => [key, process.env[key]])), sent = [];
  process.env.RESEND_API_KEY = 'fake-test-key'; process.env.RESEND_FROM = 'clinic@example.test'; process.env.SEMAPHORE_API_KEY = 'fake-test-key';
  global.fetch = async (url, options) => { sent.push({ channel: url.includes('resend.com') ? 'email' : 'sms', value: url.includes('resend.com') ? JSON.parse(options.body) : Object.fromEntries(options.body) }); return url.includes('resend.com') ? Response.json({ id: 'email-id' }) : Response.json([{ message_id: 'sms-id', status: 'queued' }]); };
  try { await action(sent); } finally { global.fetch = previousFetch; for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}

test('booking types and selected service/package names appear in app, email and SMS confirmations and reminders', async () => {
  await capture(async sent => {
    for (const item of cases) {
      const start = sent.length, db = database(item.details, item.packages);
      assert.equal(rules.describeBooking({ ...item.details, packageNames: item.packages }).label, item.label);
      await notifications.notifyReservationPaid(db, 'visit');
      await notifications.notifyReminder(db, 'visit');
      const notices = db.calls.filter(call => call.table === 'app_notifications');
      assert.equal(notices.length, 4);
      for (const notice of notices) { assert.ok(notice.value.title.startsWith(item.label)); for (const name of item.names) assert.ok(notice.value.body.includes(name)); }
      const deliveries = sent.slice(start);
      for (const delivery of deliveries) {
        if (delivery.channel === 'email') { assert.ok(delivery.value.subject.startsWith(item.label)); for (const name of item.names) assert.ok(delivery.value.html.includes(name)); }
        else { assert.ok(delivery.value.message.includes(item.label)); for (const name of item.names) assert.ok(delivery.value.message.includes(name)); }
      }
      assert.equal(deliveries.filter(item => item.channel === 'sms').length, 2);
      await notifications.notifyReservationPaid(db, 'visit');
      assert.equal(sent.length, start + deliveries.length, 'repeated webhooks must not resend email/SMS');
    }
  });
});

test('booking, status and reschedule notices stay specific and confirmed staff bookings do not claim payment', async () => {
  await capture(async sent => {
    const db = database(cases[0].details);
    await notifications.notifyBookingCreated(db, 'visit', { confirmed: true });
    for (const status of ['confirmed', 'completed', 'cancelled', 'no_show']) await notifications.notifyAppointmentStatusChanged(db, 'visit', status);
    await notifications.notifyRescheduleRequested(db, 'visit', 'change', '2027-01-05', '11:00');
    for (const decision of ['approved', 'rejected']) await notifications.notifyRescheduleDecision(db, 'visit', decision, decision);
    for (const notice of db.calls.filter(call => call.table === 'app_notifications')) assert.ok(notice.value.title.startsWith('Online consultation'));
    for (const email of sent.filter(item => item.channel === 'email')) assert.ok(email.value.subject.startsWith('Online consultation'));
    const sms = sent.filter(item => item.channel === 'sms');
    assert.equal(sms.length, 1, 'staff and manual confirmation must share one confirmation SMS');
    assert.ok(sms.every(item => item.value.message.includes('Online consultation') && !item.value.message.includes('received')));
  });
});

test('Semaphore sends exactly one confirmation and one 24-hour reminder across confirmation paths', async () => {
  await capture(async sent => {
    const db = database(cases[0].details);
    await notifications.notifyBookingCreated(db, 'visit');
    assert.equal(sent.filter(item => item.channel === 'sms').length, 0, 'pending bookings do not text');
    await notifications.notifyBookingCreated(db, 'visit', { confirmed: true });
    await notifications.notifyReservationPaid(db, 'visit');
    await notifications.notifyAppointmentStatusChanged(db, 'visit', 'confirmed');
    await notifications.notifyTimedReminder(db, 'visit', '24h', Date.parse('2027-01-03T10:00:00+08:00'));
    await notifications.notifyTimedReminder(db, 'visit', '24h', Date.parse('2027-01-03T10:01:00+08:00'));
    const messages = sent.filter(item => item.channel === 'sms').map(item => item.value.message);
    assert.deepEqual(messages, [
      'The Klinique: Online consultation: Online Consultation with Dr. Kharyl. TK-TEST is confirmed on January 4, 2027 at 10:00 AM PHT. Join Zoom in your patient portal 15 minutes before your appointment.',
      'The Klinique reminder: Online consultation: Online Consultation with Dr. Kharyl. TK-TEST is tomorrow, January 4, 2027 at 10:00 AM PHT. Join Zoom in your patient portal 15 minutes before your appointment.',
    ]);
  });
});
