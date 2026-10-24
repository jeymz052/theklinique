const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(relative, mocks = {}) {
  const filename = path.resolve(relative), mod = new Module(filename, module);
  mod.filename = filename; mod.paths = module.paths;
  mod.require = name => name in mocks ? mocks[name] : name.startsWith('@/') ? load(name.slice(2) + '.ts', mocks) : require(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
  return mod.exports;
}
const zoom = load('lib/zoom.ts');
const variables = ['ZOOM_MEETING_SDK_CLIENT_ID', 'ZOOM_MEETING_SDK_CLIENT_SECRET', 'ZOOM_ACCOUNT_ID', 'ZOOM_SERVER_TO_SERVER_CLIENT_ID', 'ZOOM_SERVER_TO_SERVER_CLIENT_SECRET'];
let original;
before(() => { original = variables.map(name => process.env[name]); variables.forEach((name, i) => { process.env[name] = `synthetic-zoom-${i}`; }); });
after(() => { variables.forEach((name, i) => { if (original[i] === undefined) delete process.env[name]; else process.env[name] = original[i]; }); });

test('Zoom JWTs are signed server-side, meeting/role scoped, with the required expiry', () => {
  const now = Date.parse('2026-10-23T02:00:00Z');
  for (const role of [0, 1]) {
    const [header, payload, signature] = zoom.zoomSignature('12345678901', role, now).split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), { alg: 'HS256', typ: 'JWT' });
    assert.equal(signature, createHmac('sha256', process.env.ZOOM_MEETING_SDK_CLIENT_SECRET).update(`${header}.${payload}`).digest('base64url'));
    assert.equal(claims.mn, '12345678901'); assert.equal(claims.role, role);
    assert.equal(claims.appKey, process.env.ZOOM_MEETING_SDK_CLIENT_ID);
    assert.equal(claims.exp - Math.floor(now / 1000), 1800); assert.equal(claims.exp, claims.tokenExp);
    assert.equal(claims.iat, Math.floor(now / 1000) - 30);
  }
});

test('Zoom REST uses account OAuth, validates meeting ownership/settings, and sanitizes upstream errors', async t => {
  const priorFetch = global.fetch; t.after(() => { global.fetch = priorFetch; });
  const calls = [];
  let meeting = { id: 12345678901, host_id: 'clinic-host', password: 'synthetic-passcode', settings: { waiting_room: true, approval_type: 2 } };
  let fail = false;
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    if (fail) return Response.json({ message: 'secret provider response' }, { status: 401 });
    return Response.json(url.includes('oauth/token') ? { access_token: 'account-token' } : url.includes('/users/') ? { token: 'host-zak' } : meeting);
  };
  assert.equal(await zoom.zoomAccountToken(), 'account-token');
  assert.match(calls[0].init.headers.Authorization, /^Basic /);
  assert.equal(calls[0].init.body.get('grant_type'), 'account_credentials');
  assert.equal((await zoom.zoomMeeting('account-token', '12345678901')).hostId, 'clinic-host');
  assert.equal(await zoom.zoomHostToken('account-token', 'clinic-host'), 'host-zak');
  assert.match(calls.at(-1).url, /users\/clinic-host\/token\?type=zak$/);
  await assert.rejects(zoom.zoomMeeting('account-token', '../other'), /valid Zoom meeting ID/);
  meeting.settings.waiting_room = false;
  await assert.rejects(zoom.zoomMeeting('account-token', '12345678901'), /waiting room/);
  meeting.settings.waiting_room = true; meeting.settings.meeting_authentication = true;
  await assert.rejects(zoom.zoomMeeting('account-token', '12345678901'), /sign-in and registration/);
  meeting.settings.meeting_authentication = false; meeting.settings.approval_type = 0;
  await assert.rejects(zoom.zoomMeeting('account-token', '12345678901'), /sign-in and registration/);
  meeting.id = 98765432101;
  await assert.rejects(zoom.zoomMeeting('account-token', '12345678901'), /unexpected meeting/);
  fail = true;
  await assert.rejects(zoom.zoomAccountToken(), error => !error.message.includes('secret provider response'));
});

const id = '00000000-0000-4000-8000-000000000001';
function fixture() {
  const pht = new Date(Date.now() + 8 * 3600000).toISOString();
  const state = {
    auth: { user: { id: 'patient-user' }, role: 'patient', isDoctor: false },
    visit: { id, client_id: 'client', consultation_mode: 'online', status: 'confirmed', appointment_date: pht.slice(0, 10), appointment_time: pht.slice(11, 16) },
    patient: { auth_user_id: 'patient-user', full_name: 'Patient Name' },
    settings: { video_mode: 'zoom', zoom_meeting_number: '12345678901' }, calls: [],
  };
  const db = { from(table) {
    const query = { select() { return query; }, eq() { return query; }, single() { return query; }, maybeSingle() { return query; }, then(resolve) { return Promise.resolve({ data: ({ appointments: state.visit, clients: state.patient, consultation_settings: state.settings, clinic_settings: { doctor_name: 'Dr. Kharyl' } })[table], error: null }).then(resolve); } };
    return query;
  } };
  const api = { ...zoom,
    zoomAccountToken: async () => { state.calls.push('account'); return 'account-token'; },
    zoomMeeting: async (token, number) => { state.calls.push(['meeting', token, number]); return { number, hostId: 'clinic-host', password: 'passcode' }; },
    zoomHostToken: async (token, hostId) => { state.calls.push(['host', token, hostId]); return 'host-zak'; },
  };
  const route = load('app/api/zoom/join/route.ts', { '@/lib/clinicalServer': { clinicalDatabase: () => db, clinicalUser: async () => state.auth }, '@/lib/zoom': api });
  const join = body => route.POST(new Request('http://localhost/api/zoom/join', { method: 'POST', body: JSON.stringify(body || { appointmentId: id, role: 1, meetingNumber: '99999999999', userName: 'Forged name' }) }));
  return { state, join, api, db };
}

test('Zoom join denies anonymous users, staff, unowned visits, closed statuses, and out-of-window patients before contacting Zoom', async () => {
  const { state, join } = fixture();
  const auth = state.auth;
  state.auth = null; assert.equal((await join()).status, 401);
  state.auth = { ...auth, role: 'secretary' }; assert.equal((await join()).status, 403);
  state.auth = auth;
  assert.equal((await join({ appointmentId: 'invalid' })).status, 400);
  state.patient.auth_user_id = 'someone-else'; assert.equal((await join()).status, 404);
  state.patient.auth_user_id = auth.user.id;
  for (const status of ['pending', 'cancelled', 'completed', 'no_show']) { state.visit.status = status; assert.equal((await join()).status, 409); }
  state.visit.status = 'confirmed'; state.visit.consultation_mode = 'clinic'; assert.equal((await join()).status, 409);
  state.visit.consultation_mode = 'online'; state.visit.appointment_date = '2027-06-01'; assert.equal((await join()).status, 403);
  assert.deepEqual(state.calls, []);
});

test('patient join ignores forged host fields, derives identity, returns no host or account token, and disables caching', async () => {
  const { state, join } = fixture();
  const response = await join(), data = await response.json();
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(JSON.parse(Buffer.from(data.signature.split('.')[1], 'base64url')).role, 0);
  assert.equal(data.meetingNumber, state.settings.zoom_meeting_number); assert.equal(data.userName, state.patient.full_name);
  assert.equal(data.zak, undefined); assert.equal(data.access_token, undefined);
  assert.equal(state.calls.filter(call => Array.isArray(call) && call[0] === 'host').length, 0);
  assert.deepEqual(Object.keys(data).sort(), ['meetingNumber', 'password', 'signature', 'userName']);
});

test('doctor starts configured meetings with a fresh host ZAK from the authoritative meeting owner', async () => {
  const { state, join } = fixture();
  state.auth = { user: { id: 'doctor' }, role: 'doctor', isDoctor: true }; state.visit.appointment_date = '2027-06-01';
  const response = await join(), data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.zak, 'host-zak'); assert.equal(data.userName, 'Dr. Kharyl');
  assert.equal(JSON.parse(Buffer.from(data.signature.split('.')[1], 'base64url')).role, 1);
  assert.deepEqual(state.calls.at(-1), ['host', 'account-token', 'clinic-host']);
});

test('missing Zoom setup fails without exposing provider details to patients; preflight is doctor-only', async () => {
  const { state, join, api, db } = fixture();
  api.zoomAccountToken = async () => { throw new zoom.ZoomError('Server credential setup needed', 503); };
  let response = await join(); assert.equal(response.status, 503); assert.doesNotMatch((await response.json()).error, /credential/);
  state.auth.isDoctor = true;
  response = await join(); assert.equal((await response.json()).error, 'Server credential setup needed');
  state.settings.zoom_meeting_number = '';
  api.zoomAccountToken = async () => 'account-token';
  api.zoomMeeting = zoom.zoomMeeting;
  assert.equal((await join()).status, 409);
  const check = load('app/api/zoom/check/route.ts', { '@/lib/clinicalServer': { clinicalDatabase: () => db, clinicalUser: async () => ({ isDoctor: false }) }, '@/lib/zoom': api });
  assert.equal((await check.POST(new Request('http://localhost/api/zoom/check', { method: 'POST' }))).status, 403);
});

test('isolated Zoom room contains no tokens and cannot be framed by another origin', async () => {
  const route = load('app/api/zoom/room/route.ts');
  const response = route.GET(), html = await response.text();
  assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(response.headers.get('content-security-policy'), "frame-ancestors 'self'");
  assert.match(html, /\/zoom-room.js/); assert.doesNotMatch(html, /signature|access_token|zak|patient-user/);
});

test('settings ignore legacy link inputs, persist Zoom only, and omit room links from responses', async () => {
  const rules = load('lib/consultation.ts');
  let row = { ...rules.defaultConsultationSettings, video_mode: 'link', meeting_url: 'https://meet.google.com/abc-defg-hij' };
  const writes = [];
  const db = { from(table) {
    const query = { select() { return query; }, eq() { return query; }, single() { return query; },
      update(value) { writes.push(value); row = { ...row, ...value }; return query; },
      then(resolve) { return Promise.resolve({ data: table === 'consultation_settings' ? row : { clinic_name: 'The Klinique' }, error: null }).then(resolve); } };
    return query;
  } };
  const route = load('app/api/consultation-settings/route.ts', { '@/lib/clinicalServer': { clinicalDatabase: () => db, clinicalUser: async () => ({ isDoctor: true, user: { id } }) } });
  let data = await (await route.GET(new Request('http://localhost/api/consultation-settings'))).json();
  assert.equal(data.settings.meeting_url, undefined); assert.equal(data.settings.video_mode, undefined);
  const save = zoom_meeting_number => route.PUT(new Request('http://localhost/api/consultation-settings', { method: 'PUT', body: JSON.stringify({ ...row, zoom_meeting_number, video_mode: 'link', meeting_url: 'https://meet.google.com/abc-defg-hij' }) }));
  assert.equal((await save('https://zoom.us/j/3828919108')).status, 400);
  const response = await save('382 891 9108'); data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(writes[0].video_mode, 'zoom'); assert.equal(writes[0].meeting_url, '');
  assert.equal(writes[0].zoom_meeting_number, '3828919108');
  assert.equal(data.settings.meeting_url, undefined); assert.equal(data.settings.video_mode, undefined);
});

test('patient online visits offer embedded Zoom only, preserve join restrictions, and never expose old room links', async () => {
  const pht = new Date(Date.now() + 8 * 3600000).toISOString();
  const visits = ['confirmed', 'pending', 'completed', 'cancelled'].map(status => ({ id: status, appointment_date: pht.slice(0, 10), appointment_time: pht.slice(11, 16), status }));
  const filters = [];
  const db = { from(table) {
    const query = { select() { return query; }, order() { return query; }, eq() { return query; }, single() { return query; },
      in(key, values) { filters.push([key, values]); return query; },
      then(resolve) { return Promise.resolve({ data: table === 'clients' ? [{ id: 'own-client' }] : table === 'appointments' ? visits : { zoom_meeting_number: '3828919108', video_mode: 'link', meeting_url: 'https://meet.google.com/abc-defg-hij' }, error: null }).then(resolve); } };
    return query;
  } };
  const route = load('app/api/online-consultations/route.ts', { '@/lib/clinicalServer': { clinicalDatabase: () => db, clinicalUser: async () => ({ isDoctor: false, role: 'patient', user: { id } }) } });
  const response = await route.GET(new Request('http://localhost/api/online-consultations'));
  const data = await response.json();
  assert.equal(response.status, 200); assert.deepEqual(filters, [['client_id', ['own-client']]]);
  assert.deepEqual(data.visits.map(visit => visit.joinAvailable), [true, false, false, false]);
  for (const visit of data.visits) { assert.equal(visit.provider, 'Zoom'); assert.equal(visit.meetingUrl, undefined); assert.equal(visit.meeting_url, undefined); }
  assert.doesNotMatch(JSON.stringify(data), /meet\.google\.com|https:\/\//);
});
