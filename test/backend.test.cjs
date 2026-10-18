const test = require("node:test");
const assert = require("node:assert/strict");
const { createGas } = require("./gas-mock.cjs");

const A = "111111", T = "222222";
const mk = () => createGas({ props: { ADMIN_PIN: A, TEAM_PIN: T } });
const phase = (n, s, e, extra) => Object.assign({ name: n, category: "MEP", start_date: s, end_date: e }, extra || {});

test("wrong or missing PIN is refused, repeated misses lock out, unset PINs report setup", () => {
  const g = mk();
  assert.equal(g.call("GET", "/api/me", null, "000000").code, "BAD_PIN");
  assert.equal(g.call("GET", "/api/me", null, "").code, "BAD_PIN");
  assert.equal(g.call("GET", "/api/me", null, A).role, "admin");
  assert.equal(g.call("GET", "/api/me", null, T).role, "team");
  const g2 = createGas({});
  assert.equal(g2.call("GET", "/api/me", null, "1").status, 503);
  const g3 = mk();
  for (let i = 0; i < 30; i++) g3.call("GET", "/api/me", null, "bad");
  assert.equal(g3.call("GET", "/api/me", null, A).code, "BAD_PIN"); // locked even with the right PIN
});

test("setPins creates both random PINs once", () => {
  const g = createGas({});
  g.sandbox.setPins();
  assert.match(g.store.props.ADMIN_PIN, /^\d{6}$/);
  assert.match(g.store.props.TEAM_PIN, /^\d{6}$/);
  const before = g.store.props.ADMIN_PIN;
  g.sandbox.setPins();
  assert.equal(g.store.props.ADMIN_PIN, before);
});

test("team PIN can read but not change anything", () => {
  const g = mk();
  const c = g.call("POST", "/api/projects", { name: "P", start_date: "2026-10-05", target_handover_date: "2026-12-01" }, A);
  assert.equal(c.status, 201);
  assert.equal(g.call("GET", "/api/projects", null, T).data.length, 1);
  for (const [m, u, b] of [["POST", "/api/projects", { name: "x" }], ["PUT", "/api/projects/1", { name: "x" }], ["DELETE", "/api/projects/1", null]]) {
    assert.equal(g.call(m, u, b, T).code, "VIEW_ONLY");
  }
  assert.equal(g.call("GET", "/api/projects/1", null, T).data.project.name, "P");
});

test("sheet is created with three tabs and text-formatted date columns", () => {
  const g = mk();
  g.call("GET", "/api/projects", null, A);
  assert.equal(g.spreadsheet().title, "Woodland Gantt — data");
  assert.deepEqual(g.spreadsheet().getSheets().map((s) => s.name), ["Projects", "Phases", "Milestones"]);
  const p = g.sheet("Projects");
  assert.equal(p.rows[0][4], "start_date");
  assert.equal(p.formats[4], "@");
});

test("create project with phases and milestones; detail and list match the old server's shapes", () => {
  const g = mk();
  const r = g.call("POST", "/api/projects", {
    name: "  Flat 4B ", client: "Asha", site: "Kadri", start_date: "2026-10-05", target_handover_date: "2027-01-05", category: "interior fit-out",
    phases: [phase("Electrical", "2026-10-12", "2026-10-30", { assigned_worker: "Prakash", material_incharge: "Imran" }), phase("Plumbing", "2026-10-12", "2026-10-25")],
    milestones: [{ label: "Handover", date: "2027-01-05" }, { label: "MEP clear", date: "2026-10-30" }]
  }, A);
  assert.equal(r.data.id, 1);
  const d = g.call("GET", "/api/projects/1", null, A).data;
  assert.equal(d.project.name, "Flat 4B");
  assert.equal(d.project.project_os_id, "");
  assert.deepEqual(d.phases.map((p) => [p.id, p.name, p.sort_order, p.color, p.assigned_worker, p.material_incharge]), [[1, "Electrical", 0, "#c28a2e", "Prakash", "Imran"], [2, "Plumbing", 1, "#c28a2e", "", ""]]);
  assert.deepEqual(d.milestones.map((m) => m.label), ["MEP clear", "Handover"]); // by date
  const list = g.call("GET", "/api/projects", null, A).data;
  assert.deepEqual(list[0].phases, [{ end_date: "2026-10-30" }, { end_date: "2026-10-25" }]);
  assert.equal(typeof d.phases[0].start_date, "string");
});

test("validation matches the old server", () => {
  const g = mk();
  const bad = (b) => g.call("POST", "/api/projects", b, A);
  assert.equal(bad({ name: "", start_date: "2026-10-05", target_handover_date: "2026-12-01" }).status, 400);
  assert.equal(bad({ name: "x", start_date: "2026-13-05", target_handover_date: "2026-12-01" }).status, 400);
  assert.equal(bad({ name: "x", start_date: "2026-12-05", target_handover_date: "2026-12-01" }).status, 400);
  assert.equal(bad({ name: "x", category: "castle", start_date: "2026-10-05", target_handover_date: "2026-12-01" }).status, 400);
  assert.equal(g.call("GET", "/api/projects/99", null, A).status, 404);
  g.call("POST", "/api/projects", { name: "P", start_date: "2026-10-05", target_handover_date: "2026-12-01" }, A);
  assert.equal(g.call("POST", "/api/projects/1/phases", { name: "x", start_date: "2026-10-09", end_date: "2026-10-01" }, A).status, 400);
  assert.equal(g.call("PUT", "/api/projects/1", { start_date: "2027-01-01" }, A).status, 400);
});

test("phases: add appends, edit incl. assignment, reorder, delete", () => {
  const g = mk();
  g.call("POST", "/api/projects", { name: "P", start_date: "2026-10-05", target_handover_date: "2026-12-01" }, A);
  const a = g.call("POST", "/api/projects/1/phases", { name: "A", category: "Planning", start_date: "2026-10-06", end_date: "2026-10-10" }, A);
  const b = g.call("POST", "/api/projects/1/phases", { start_date: "2026-10-11", end_date: "2026-10-12" }, A);
  assert.equal(a.status, 201); assert.equal(b.data.name, "New phase"); assert.equal(b.data.sort_order, 1);
  const u = g.call("PUT", "/api/phases/" + a.data.id, { end_date: "2026-10-20", assigned_worker: "Ravi" }, A).data;
  assert.equal(u.end_date, "2026-10-20"); assert.equal(u.assigned_worker, "Ravi"); assert.equal(u.material_incharge, "");
  assert.equal(g.call("PUT", "/api/phases/" + a.data.id, { end_date: "2026-10-01" }, A).status, 400);
  const re = g.call("PUT", "/api/projects/1/phases-order", { ids: [b.data.id, a.data.id] }, A).data;
  assert.deepEqual(re.map((p) => p.id), [b.data.id, a.data.id]);
  assert.equal(g.call("DELETE", "/api/phases/" + b.data.id, null, A).status, 204);
  assert.deepEqual(g.call("GET", "/api/projects/1", null, A).data.phases.map((p) => p.id), [a.data.id]);
});

test("milestones: add, edit, delete", () => {
  const g = mk();
  g.call("POST", "/api/projects", { name: "P", start_date: "2026-10-05", target_handover_date: "2026-12-01" }, A);
  const m = g.call("POST", "/api/projects/1/milestones", { label: "Flag", date: "2026-11-01" }, A).data;
  assert.equal(g.call("PUT", "/api/milestones/" + m.id, { label: "Flag 2", date: "2026-11-02" }, A).data.date, "2026-11-02");
  assert.equal(g.call("DELETE", "/api/milestones/" + m.id, null, A).status, 204);
  assert.equal(g.call("GET", "/api/projects/1", null, A).data.milestones.length, 0);
});

test("deleting a project removes its phases and milestones but not other projects'", () => {
  const g = mk();
  for (const n of ["One", "Two"]) g.call("POST", "/api/projects", { name: n, start_date: "2026-10-05", target_handover_date: "2026-12-01", phases: [phase("X", "2026-10-06", "2026-10-07")], milestones: [{ label: "M", date: "2026-12-01" }] }, A);
  g.call("DELETE", "/api/projects/1", null, A);
  assert.equal(g.call("GET", "/api/projects", null, A).data.length, 1);
  const d = g.call("GET", "/api/projects/2", null, A).data;
  assert.equal(d.phases.length, 1); assert.equal(d.milestones.length, 1);
  assert.equal(g.sheet("Phases").getLastRow(), 2);
  assert.equal(g.call("POST", "/api/projects", { name: "Three", start_date: "2026-10-05", target_handover_date: "2026-12-01" }, A).data.id, 3);
});

test("registry: needs LINK_KEY, marks new / name-match / linked, can link and refuses duplicates", () => {
  const g = mk();
  assert.equal(g.call("GET", "/api/registry", null, A).status, 409);
  g.store.props.LINK_KEY = "K";
  const REG = [
    { id: "WA-001", name: "Site Alpha", client: "C", location: "Kadri", lifecycle: "EXECUTION / SITE", group: "exec", active: true, startDate: "2026-09-01", targetDate: "" },
    { id: "WA-002", name: "flat 4b", client: "", location: "", lifecycle: "CONCEPT DESIGN", group: "design", active: true, startDate: "", targetDate: "" },
    { id: "WA-003", name: "Enquiry", client: "", location: "", lifecycle: "ENQUIRY", group: "enq", active: false }
  ];
  g.net.handler = (url, body) => { assert.equal(body.action, "registry"); assert.equal(body.key, "K"); return { ok: true, projects: REG }; };
  g.call("POST", "/api/projects", { name: "Flat 4B", start_date: "2026-10-05", target_handover_date: "2026-12-01" }, A);
  let r = g.call("GET", "/api/registry", null, T).data.projects;
  assert.deepEqual(r.map((p) => [p.id, p.state, p.gantt_id]), [["WA-001", "new", null], ["WA-002", "name-match", 1]]);
  assert.equal(g.call("PUT", "/api/projects/1", { project_os_id: "WA-002" }, A).data.project_os_id, "WA-002");
  const c = g.call("POST", "/api/projects", { name: "Site Alpha", project_os_id: "WA-001", start_date: "2026-09-01", target_handover_date: "2026-12-18" }, A);
  assert.equal(c.status, 201);
  assert.equal(g.call("POST", "/api/projects", { name: "Again", project_os_id: "WA-001", start_date: "2026-09-01", target_handover_date: "2026-12-18" }, A).status, 400);
  r = g.call("GET", "/api/registry", null, A).data.projects;
  assert.deepEqual(r.map((p) => p.state), ["linked", "linked"]);
  g.net.handler = () => ({ ok: false, error: "Wrong link key." });
  const bad = g.call("GET", "/api/registry", null, A);
  assert.equal(bad.status, 502); assert.match(bad.error, /Wrong link key/);
  g.net.handler = () => { throw new Error("offline"); };
  assert.equal(g.call("GET", "/api/registry", null, A).status, 502);
});

test("garbage request does not crash; unknown route is 404", () => {
  const g = mk();
  assert.equal(g.callRaw("not json").status, 400);
  assert.equal(g.call("GET", "/api/nothing", null, A).status, 404);
});
