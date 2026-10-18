// Loads backend/Code.gs in a vm sandbox with mocked Google services.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function colLetterFormatKey(c) { return c; }

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) {
        const v = (this.sheet.rows[this.r - 1 + i] || [])[this.c - 1 + j];
        row.push(v === undefined ? "" : v);
      }
      out.push(row);
    }
    return out;
  }
  setValues(vals) {
    for (let i = 0; i < vals.length; i++) {
      const rr = this.r - 1 + i;
      while (this.sheet.rows.length <= rr) this.sheet.rows.push([]);
      for (let j = 0; j < vals[i].length; j++) {
        let v = vals[i][j];
        const col = this.c - 1 + j;
        const isText = this.sheet.formats[col] === "@";
        if (isText && v !== "" && v != null) v = String(v);
        // real Sheets turns ISO dates typed into non-text cells into Date objects
        else if (!isText && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && rr > 0) v = new Date(v + "T00:00:00Z");
        this.sheet.rows[rr][col] = v;
        this.sheet.cellWrites++;
      }
    }
    return this;
  }
  setFontWeight() { return this; }
  setNumberFormat(f) { for (let j = 0; j < this.nc; j++) this.sheet.formats[this.c - 1 + j] = f; return this; }
}

class Sheet {
  constructor(name) { this.name = name; this.rows = []; this.formats = {}; this.frozen = 0; this.cellWrites = 0; }
  getLastRow() { let n = 0; this.rows.forEach((r, i) => { if (r.some((v) => v !== "" && v != null)) n = i + 1; }); return n; }
  getLastColumn() { let n = 0; this.rows.forEach((r) => r.forEach((v, j) => { if (v !== "" && v != null && j + 1 > n) n = j + 1; })); return n; }
  getMaxRows() { return 1000; }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  setFrozenRows(n) { this.frozen = n; }
  setName(n) { this.name = n; return this; }
  deleteRow(n) { this.rows.splice(n - 1, 1); }
  deleteRows(n, count) { this.rows.splice(n - 1, count); }
}
class Spreadsheet {
  constructor(title, id) { this.title = title; this.id = id; this.sheets = [new Sheet("Sheet1")]; }
  getId() { return this.id; }
  getUrl() { return "https://docs.google.com/spreadsheets/d/" + this.id; }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  getSheets() { return this.sheets; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  deleteSheet(s) { this.sheets = this.sheets.filter((x) => x !== s); }
}

function createGas(opts = {}) {
  const store = { sheets: {}, props: { ...(opts.props || {}) }, cache: {}, created: 0 };
  const net = { handler: null, calls: [] };
  const sandbox = {
    UrlFetchApp: { fetch(url, o) { net.calls.push({ url, o }); if (!net.handler) throw new Error("no network"); const b = net.handler(url, JSON.parse(o.payload)); return { getContentText: () => JSON.stringify(b) }; } },
    console, Date, Math, JSON, Object, Array, String, Number, Error, RegExp, parseInt, isNaN,
    Logger: { log: (m) => (store.log = (store.log || []).concat(m)) },
    SpreadsheetApp: {
      create(title) { store.created++; const s = new Spreadsheet(title, "sheet_" + store.created); store.sheets[s.id] = s; return s; },
      openById(id) { if (!store.sheets[id]) throw new Error("no sheet"); return store.sheets[id]; }
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (k in store.props ? store.props[k] : null),
      setProperty: (k, v) => { store.props[k] = String(v); },
      setProperties: (o) => Object.assign(store.props, o)
    }) },
    CacheService: { getScriptCache: () => ({
      get: (k) => (k in store.cache ? store.cache[k] : null),
      put: (k, v) => { store.cache[k] = v; }
    }) },
    LockService: { getScriptLock: () => ({
      locked: false,
      waitLock() { if (store.lockHeld) throw new Error("lock timeout"); store.lockHeld = true; },
      releaseLock() { store.lockHeld = false; }
    }) },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (t) => ({ text: t, setMimeType() { return this; }, getContent() { return t; } })
    },
    Utilities: {
      getUuid: () => require("crypto").randomUUID(),
      formatDate: (d, tz, f) => d.toISOString().slice(0, 10),
      DigestAlgorithm: { SHA_256: "sha256" },
      // Apps Script returns signed bytes
      computeDigest: (alg, text) => Array.from(require("crypto").createHash(alg).update(String(text), "utf8").digest()).map((b) => (b > 127 ? b - 256 : b))
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "backend", "Code.gs"), "utf8"), sandbox, { filename: "Code.gs" });
  return {
    store, sandbox, net,
    call(method, url, body, pin) {
      const out = sandbox.doPost({ postData: { contents: JSON.stringify({ pin, method, url, body }) } });
      return JSON.parse(out.getContent());
    },
    callRaw(text) { return JSON.parse(sandbox.doPost({ postData: { contents: text } }).getContent()); },
    sheet(name) { const id = store.props.SHEET_ID; return store.sheets[id] && store.sheets[id].getSheetByName(name); },
    spreadsheet() { return store.sheets[store.props.SHEET_ID]; }
  };
}

module.exports = { createGas };
