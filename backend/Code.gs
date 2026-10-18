/**
 * Woodland Gantt — Google Apps Script JSON API (same job the old local server did).
 * Deploy as Web app: Execute as Me, Who has access: Anyone.
 * Calls are POST with a text/plain JSON body: {pin, method, url, body}. `url` uses the same paths the app always used (/api/projects/3/phases ...).
 * Data lives in the Google Sheet "Woodland Gantt — data", created on first call.
 * ADMIN_PIN (can change the chart) and TEAM_PIN (view only) live in Script Properties, never in this file.
 * LINK_KEY (copy of Project OS's) lets the app read the in-process project list from Project OS.
 */

var SHEET_TITLE = 'Woodland Gantt — data';
var PROJECT_OS_URL = 'https://script.google.com/macros/s/AKfycbxR4m5jgaS7zMm0f_L6H2Tw3SBrNpQjl_mdrc8g_xr3TfnZsc4lW4CgdLOMOFtshiZS/exec';
var TABLES = {
  projects: { tab: 'Projects', cols: ['id', 'name', 'client', 'site', 'start_date', 'target_handover_date', 'category', 'sequence_logic', 'critical_path', 'site_note', 'project_os_id'] },
  phases: { tab: 'Phases', cols: ['id', 'project_id', 'name', 'category', 'start_date', 'end_date', 'sort_order', 'color', 'assigned_worker', 'material_incharge'] },
  milestones: { tab: 'Milestones', cols: ['id', 'project_id', 'label', 'date'] }
};
var NUM_COLS = { id: 1, project_id: 1, sort_order: 1 };
var PHASE_CATEGORIES = ['Planning', 'MEP', 'Carpentry', 'Finishing', 'Close-out'];
var PROJECT_CATEGORIES = ['interior fit-out', 'construction', 'renovation'];
var CATEGORY_COLORS = { 'Planning': '#5b7c99', 'MEP': '#c28a2e', 'Carpentry': '#8a5a3c', 'Finishing': '#5f8a5b', 'Close-out': '#b0503f' };
var MAX_PHASES = 80, MAX_MILESTONES = 40, CELL_LIMIT = 49000;

/* ---------------- entry points ---------------- */

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, status: 400, error: 'Unreadable request.' }); }
  try {
    var role = authenticate_(req.pin);
    if (role === 'locked') return out_({ ok: false, status: 429, code: 'BAD_PIN', error: 'Too many wrong attempts. Try again in 10 minutes.' });
    if (!role) return out_({ ok: false, status: 401, code: 'BAD_PIN', error: 'Wrong PIN.' });
    var method = String(req.method || 'GET').toUpperCase();
    var url = String(req.url || '');
    if (method !== 'GET' && role !== 'admin') return out_({ ok: false, status: 403, code: 'VIEW_ONLY', error: 'This PIN can only view. Sign in with the admin PIN to make changes.' });
    ss_();
    var res = method === 'GET' ? route_(method, url, req.body, role) : withLock_(function () { return route_(method, url, req.body, role); });
    return out_({ ok: true, status: res.status || 200, role: role, data: res.data === undefined ? null : res.data });
  } catch (err) {
    if (err && err.status) return out_({ ok: false, status: err.status, error: err.message });
    return out_({ ok: false, status: 500, error: 'Server error: ' + (err && err.message ? err.message : err) });
  }
}

function doGet() {
  return out_({ ok: true, name: 'Woodland Gantt API', note: 'Use POST.' });
}

/** Run once from the editor. Creates random ADMIN_PIN and TEAM_PIN only if missing. Read or change them in Project Settings > Script Properties. */
function setPins() {
  var props = PropertiesService.getScriptProperties();
  var made = [];
  ['ADMIN_PIN', 'TEAM_PIN'].forEach(function (k) { if (!props.getProperty(k)) { props.setProperty(k, rndDigits_(6)); made.push(k); } });
  Logger.log('Created: ' + (made.join(', ') || 'nothing (both PINs already set)') + '. Read or change them in Project Settings > Script Properties.');
}

function rndDigits_(n) { var s = ''; for (var i = 0; i < n; i++) s += Math.floor(Math.random() * 10); return s; }
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function fail_(status, msg) { var e = new Error(msg); e.status = status; throw e; }
function bad_(msg) { return fail_(400, msg); }

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { fail_(503, 'The server is busy. Try again.'); }
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------------- auth ---------------- */

function safeEq_(a, b) {
  a = String(a); b = String(b);
  var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** 'admin', 'team', null (wrong) or 'locked'. */
function authenticate_(pin) {
  var props = PropertiesService.getScriptProperties();
  var admin = props.getProperty('ADMIN_PIN'), team = props.getProperty('TEAM_PIN');
  if (!admin || !team) fail_(503, 'The PINs are not set yet. Run setPins() in the Apps Script editor.');
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('pinfails') || 0);
  if (fails >= 30) return 'locked';
  pin = String(pin == null ? '' : pin);
  if (pin && safeEq_(pin, admin)) return 'admin';
  if (pin && safeEq_(pin, team)) return 'team';
  cache.put('pinfails', String(fails + 1), 600);
  return null;
}

/* ---------------- sheet plumbing ---------------- */

function ss_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  return withLock_(function () {
    id = props.getProperty('SHEET_ID');
    if (id) return SpreadsheetApp.openById(id);
    var ss = SpreadsheetApp.create(SHEET_TITLE);
    var first = true;
    Object.keys(TABLES).forEach(function (k) {
      var t = TABLES[k];
      var sh = first ? ss.getSheets()[0].setName(t.tab) : ss.insertSheet(t.tab);
      first = false;
      sh.getRange(1, 1, 1, t.cols.length).setNumberFormat('@');
      sh.getRange(1, 1, 1, t.cols.length).setValues([t.cols]);
      sh.getRange(1, 1, 1, t.cols.length).setFontWeight('bold');
      sh.setFrozenRows(1);
      t.cols.forEach(function (c, i) { if (!NUM_COLS[c]) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@'); });
    });
    props.setProperty('SHEET_ID', ss.getId());
    return ss;
  });
}

function sheet_(key) { return ss_().getSheetByName(TABLES[key].tab); }

function cellOut_(c, v) {
  if (v === null || v === undefined || v === '') return NUM_COLS[c] ? 0 : '';
  if (NUM_COLS[c]) return Number(v);
  return String(v);
}

/** Every row of a table as objects, each with its sheet row number in _row. */
function rows_(key) {
  var t = TABLES[key], sh = sheet_(key);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, t.cols.length).getValues(), out = [];
  for (var i = 0; i < vals.length; i++) {
    var o = { _row: i + 2 };
    for (var j = 0; j < t.cols.length; j++) o[t.cols[j]] = cellOut_(t.cols[j], vals[i][j]);
    if (o.id) out.push(o);
  }
  return out;
}

function pub_(o) { var r = {}; for (var k in o) if (k !== '_row') r[k] = o[k]; return r; }

function put_(key, rowNum, o) {
  var t = TABLES[key], sh = sheet_(key);
  var vals = t.cols.map(function (c) {
    var v = o[c];
    if (v === undefined || v === null) v = NUM_COLS[c] ? 0 : '';
    if (typeof v === 'string' && v.length > CELL_LIMIT) throw bad_('Text is too long for one cell.');
    return v;
  });
  sh.getRange(rowNum, 1, 1, t.cols.length).setValues([vals]);
}

function insert_(key, o) {
  var all = rows_(key), max = 0;
  all.forEach(function (r) { if (r.id > max) max = r.id; });
  o.id = max + 1;
  var sh = sheet_(key);
  put_(key, Math.max(sh.getLastRow(), 1) + 1, o);
  return o.id;
}

/** Adds many rows with one read and one write. */
function insertMany_(key, list) {
  if (!list.length) return;
  var t = TABLES[key], sh = sheet_(key), max = 0;
  rows_(key).forEach(function (r) { if (r.id > max) max = r.id; });
  var vals = list.map(function (o) {
    o.id = ++max;
    return t.cols.map(function (c) { var v = o[c]; return v === undefined || v === null ? (NUM_COLS[c] ? 0 : '') : v; });
  });
  sh.getRange(Math.max(sh.getLastRow(), 1) + 1, 1, vals.length, t.cols.length).setValues(vals);
}

function removeRows_(key, rowNums) {
  var sh = sheet_(key);
  rowNums.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
}

/* ---------------- validation ---------------- */

function isISO_(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
  var t = new Date(Date.UTC(y, m - 1, d));
  return y >= 2000 && y <= 2100 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
function str_(v, field, required) {
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw bad_(field + ' must be text');
  var t = v.trim();
  if (required && !t) throw bad_(field + ' is required');
  return t;
}
function date_(v, field) {
  if (v === undefined) return undefined;
  if (!isISO_(v)) throw bad_(field + ' must be YYYY-MM-DD');
  return v;
}
function oneOf_(v, list, field) {
  if (v === undefined) return undefined;
  if (list.indexOf(v) < 0) throw bad_(field + ' must be one of: ' + list.join(', '));
  return v;
}
function color_(v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v); }
function sameName_(a, b) { return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); }

/* ---------------- router ---------------- */

function route_(method, url, body, role) {
  body = body || {};
  var m;
  if (method === 'GET' && url === '/api/me') return { data: { role: role } };
  if (method === 'GET' && url === '/api/projects') return { data: listProjects_() };
  if (method === 'POST' && url === '/api/projects') return createProject_(body);
  if (method === 'GET' && url === '/api/registry') return { data: { projects: registry_() } };
  if ((m = url.match(/^\/api\/projects\/(\d+)$/))) {
    var pid = +m[1];
    if (method === 'GET') return { data: detail_(pid) };
    if (method === 'PUT') return { data: updateProject_(pid, body) };
    if (method === 'DELETE') return deleteProject_(pid);
  }
  if ((m = url.match(/^\/api\/projects\/(\d+)\/phases$/)) && method === 'POST') return addPhase_(+m[1], body);
  if ((m = url.match(/^\/api\/projects\/(\d+)\/phases-order$/)) && method === 'PUT') return { data: reorder_(+m[1], body) };
  if ((m = url.match(/^\/api\/phases\/(\d+)$/))) {
    if (method === 'PUT') return { data: updatePhase_(+m[1], body) };
    if (method === 'DELETE') { removeRows_('phases', rows_('phases').filter(function (r) { return r.id === +m[1]; }).map(function (r) { return r._row; })); return { status: 204 }; }
  }
  if ((m = url.match(/^\/api\/projects\/(\d+)\/milestones$/)) && method === 'POST') return addMilestone_(+m[1], body);
  if ((m = url.match(/^\/api\/milestones\/(\d+)$/))) {
    if (method === 'PUT') return { data: updateMilestone_(+m[1], body) };
    if (method === 'DELETE') { removeRows_('milestones', rows_('milestones').filter(function (r) { return r.id === +m[1]; }).map(function (r) { return r._row; })); return { status: 204 }; }
  }
  return fail_(404, 'Unknown request.');
}

/* ---------------- projects ---------------- */

function findProject_(id) {
  var hit = rows_('projects').filter(function (r) { return r.id === id; })[0];
  if (!hit) fail_(404, 'Project not found');
  return hit;
}
function phasesOf_(pid) {
  return rows_('phases').filter(function (r) { return r.project_id === pid; }).sort(function (a, b) { return a.sort_order - b.sort_order || a.id - b.id; }).map(pub_);
}
function milestonesOf_(pid) {
  return rows_('milestones').filter(function (r) { return r.project_id === pid; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; }).map(pub_);
}
function detail_(pid) { return { project: pub_(findProject_(pid)), phases: phasesOf_(pid), milestones: milestonesOf_(pid) }; }

function listProjects_() {
  var ph = rows_('phases');
  return rows_('projects').sort(function (a, b) { return a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : b.id - a.id; }).map(function (p) {
    var o = pub_(p);
    o.phases = ph.filter(function (x) { return x.project_id === p.id; }).map(function (x) { return { end_date: x.end_date }; });
    return o;
  });
}

function cleanPhase_(b, sortOrder) {
  var category = oneOf_(b.category, PHASE_CATEGORIES, 'category') || 'Planning';
  var start = date_(b.start_date, 'start_date'), end = date_(b.end_date, 'end_date');
  if (!start || !end || end < start) throw bad_('Valid start and end dates are required');
  return { name: str_(b.name, 'name') || 'New phase', category: category, start_date: start, end_date: end, sort_order: sortOrder, color: color_(b.color) ? b.color : CATEGORY_COLORS[category], assigned_worker: str_(b.assigned_worker, 'assigned_worker') || '', material_incharge: str_(b.material_incharge, 'material_incharge') || '' };
}

function createProject_(b) {
  var p = {
    name: str_(b.name, 'name', true), client: str_(b.client, 'client') || '', site: str_(b.site, 'site') || '',
    start_date: date_(b.start_date, 'start_date'), target_handover_date: date_(b.target_handover_date, 'target_handover_date'),
    category: oneOf_(b.category, PROJECT_CATEGORIES, 'category') || 'interior fit-out',
    sequence_logic: typeof b.sequence_logic === 'string' ? b.sequence_logic : '', critical_path: typeof b.critical_path === 'string' ? b.critical_path : '', site_note: typeof b.site_note === 'string' ? b.site_note : '',
    project_os_id: str_(b.project_os_id, 'project_os_id') || ''
  };
  if (!p.start_date || !p.target_handover_date) throw bad_('Dates are required');
  if (p.target_handover_date < p.start_date) throw bad_('Handover must be on or after start');
  var phases = Array.isArray(b.phases) ? b.phases : [], miles = Array.isArray(b.milestones) ? b.milestones : [];
  if (phases.length > MAX_PHASES || miles.length > MAX_MILESTONES) throw bad_('Too many phases or milestones');
  var cleanP = phases.map(function (x, i) { return cleanPhase_(x || {}, i); });
  var cleanM = miles.map(function (x) { x = x || {}; var d = date_(x.date, 'date'); if (!d) throw bad_('date is required'); return { label: str_(x.label, 'label') || 'Milestone', date: d }; });
  if (p.project_os_id && rows_('projects').some(function (r) { return r.project_os_id === p.project_os_id; })) throw bad_('That Project OS project is already on the chart.');
  var id = insert_('projects', p);
  cleanP.forEach(function (x) { x.project_id = id; });
  cleanM.forEach(function (x) { x.project_id = id; });
  insertMany_('phases', cleanP);
  insertMany_('milestones', cleanM);
  return { status: 201, data: { id: id } };
}

function updateProject_(pid, b) {
  var cur = findProject_(pid);
  var start = date_(b.start_date, 'start_date'), end = date_(b.target_handover_date, 'target_handover_date');
  if ((start || cur.start_date) > (end || cur.target_handover_date)) throw bad_('Handover must be on or after start');
  var set = { name: str_(b.name, 'name', true), client: str_(b.client, 'client'), site: str_(b.site, 'site'), start_date: start, target_handover_date: end, category: oneOf_(b.category, PROJECT_CATEGORIES, 'category'), project_os_id: str_(b.project_os_id, 'project_os_id') };
  ['sequence_logic', 'critical_path', 'site_note'].forEach(function (k) { if (typeof b[k] === 'string') set[k] = b[k]; });
  for (var k in set) if (set[k] !== undefined) cur[k] = set[k];
  put_('projects', cur._row, cur);
  return pub_(cur);
}

function deleteProject_(pid) {
  var cur = findProject_(pid);
  removeRows_('phases', rows_('phases').filter(function (r) { return r.project_id === pid; }).map(function (r) { return r._row; }));
  removeRows_('milestones', rows_('milestones').filter(function (r) { return r.project_id === pid; }).map(function (r) { return r._row; }));
  removeRows_('projects', [cur._row]);
  return { status: 204 };
}

/* ---------------- phases and milestones ---------------- */

function addPhase_(pid, b) {
  findProject_(pid);
  var max = -1;
  rows_('phases').forEach(function (r) { if (r.project_id === pid && r.sort_order > max) max = r.sort_order; });
  var p = cleanPhase_(b, max + 1);
  p.project_id = pid;
  var id = insert_('phases', p);
  return { status: 201, data: pub_(rows_('phases').filter(function (r) { return r.id === id; })[0]) };
}

function reorder_(pid, b) {
  var ids = b.ids;
  if (!Array.isArray(ids) || !ids.every(function (x) { return typeof x === 'number' && x % 1 === 0; })) throw bad_('ids must be an array of phase ids');
  var all = rows_('phases');
  ids.forEach(function (id, i) {
    var hit = all.filter(function (r) { return r.id === id && r.project_id === pid; })[0];
    if (hit) { hit.sort_order = i; put_('phases', hit._row, hit); }
  });
  return phasesOf_(pid);
}

function updatePhase_(id, b) {
  var cur = rows_('phases').filter(function (r) { return r.id === id; })[0];
  if (!cur) fail_(404, 'Phase not found');
  var start = date_(b.start_date, 'start_date') || cur.start_date, end = date_(b.end_date, 'end_date') || cur.end_date;
  if (end < start) throw bad_('End date must be on or after start date');
  if (b.color !== undefined && !color_(b.color)) throw bad_('color must be #rrggbb');
  var set = { name: str_(b.name, 'name', true), category: oneOf_(b.category, PHASE_CATEGORIES, 'category'), color: b.color, assigned_worker: str_(b.assigned_worker, 'assigned_worker'), material_incharge: str_(b.material_incharge, 'material_incharge') };
  for (var k in set) if (set[k] !== undefined) cur[k] = set[k];
  cur.start_date = start; cur.end_date = end;
  put_('phases', cur._row, cur);
  return pub_(cur);
}

function addMilestone_(pid, b) {
  findProject_(pid);
  var d = date_(b.date, 'date');
  if (!d) throw bad_('date is required');
  var id = insert_('milestones', { project_id: pid, label: str_(b.label, 'label') || 'Milestone', date: d });
  return { status: 201, data: pub_(rows_('milestones').filter(function (r) { return r.id === id; })[0]) };
}

function updateMilestone_(id, b) {
  var cur = rows_('milestones').filter(function (r) { return r.id === id; })[0];
  if (!cur) fail_(404, 'Milestone not found');
  var label = str_(b.label, 'label', true), d = date_(b.date, 'date');
  if (label !== undefined) cur.label = label;
  if (d !== undefined) cur.date = d;
  put_('milestones', cur._row, cur);
  return pub_(cur);
}

/* ---------------- link to Project OS ---------------- */

/** In-process projects from Project OS, each marked 'new', 'name-match' (same name here, not linked yet) or 'linked'. */
function registry_() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('LINK_KEY');
  if (!key) fail_(409, 'Not linked yet. Add the Script Property LINK_KEY (copy it from Project OS) and try again.');
  var url = props.getProperty('PROJECT_OS_URL') || PROJECT_OS_URL;
  var body;
  try {
    var resp = UrlFetchApp.fetch(url, { method: 'post', contentType: 'text/plain', payload: JSON.stringify({ action: 'registry', key: key }), muteHttpExceptions: true, followRedirects: true });
    body = JSON.parse(resp.getContentText());
  } catch (e) { fail_(502, 'Could not reach Project OS. Check the internet connection and try again.'); }
  if (!body || !body.ok) fail_(502, 'Project OS said: ' + String((body && body.error) || 'no answer'));
  var mine = rows_('projects');
  return (body.projects || []).filter(function (p) { return p && p.id && p.active; }).map(function (p) {
    var linked = mine.filter(function (r) { return r.project_os_id === p.id; })[0];
    var byName = !linked && mine.filter(function (r) { return !r.project_os_id && sameName_(r.name, p.name); })[0];
    return { id: p.id, name: String(p.name || ''), client: String(p.client || ''), location: String(p.location || ''), lifecycle: String(p.lifecycle || ''), group: String(p.group || ''), startDate: p.startDate || '', targetDate: p.targetDate || '', state: linked ? 'linked' : byName ? 'name-match' : 'new', gantt_id: linked ? linked.id : byName ? byName.id : null };
  });
}
