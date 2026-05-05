/**
 * db.js — SQLite (node:sqlite) wrapper + schema + seed
 *
 * Schema (single source of truth):
 *   province_rates(province_id PK, sur_invest)
 *   amphur_overrides(amphur_id PK, sur_invest)               -- simple-mode override
 *   tumbon_overrides(tumbon_id PK, sur_invest)               -- simple-mode override
 *   amphur_table(amphur_id PK, sur_invest, ins_invest_12, ins_invest_34, ins_trans, ins_photo_12)
 *   enabled_provinces(province_id PK)
 *   settings(key PK, value)                                  -- modifierFees etc. (JSON-string value)
 *   captures(id, ts, ...)                                    -- audit log of form fills
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "data", "isurvey-helper.db");
const DEFAULT_DATA_PATH = join(__dirname, "seed", "default-data.json");

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS province_rates (
    province_id TEXT PRIMARY KEY,
    sur_invest  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS amphur_overrides (
    amphur_id  TEXT PRIMARY KEY,
    sur_invest INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tumbon_overrides (
    tumbon_id  TEXT PRIMARY KEY,
    sur_invest INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS amphur_table (
    amphur_id     TEXT PRIMARY KEY,
    sur_invest    INTEGER,
    ins_invest_12 INTEGER,
    ins_invest_34 INTEGER,
    ins_trans     INTEGER,
    ins_photo_12  INTEGER
  );
  CREATE TABLE IF NOT EXISTS enabled_provinces (
    province_id TEXT PRIMARY KEY
  );
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS captures (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ts              TEXT NOT NULL,
    province_id     TEXT,
    province_name   TEXT,
    amphur_id       TEXT,
    amphur_name     TEXT,
    tumbon_id       TEXT,
    tumbon_name     TEXT,
    mtype_id        TEXT,
    surveyor_name   TEXT,
    is_se           INTEGER,
    inspector_name  TEXT,
    sur_invest      INTEGER,
    ins_invest      INTEGER,
    ins_trans       INTEGER,
    ins_photo       INTEGER,
    out_of_area     INTEGER,
    out_of_area_amt INTEGER,
    out_of_hours    INTEGER,
    out_of_hours_amt INTEGER,
    deduct_amt      INTEGER,
    late_submit     INTEGER DEFAULT 0,
    incomplete_docs INTEGER DEFAULT 0,
    mode            TEXT,
    raw             TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_captures_ts ON captures(ts DESC);
  CREATE INDEX IF NOT EXISTS idx_captures_province ON captures(province_id);
`);

// ── Migration: เพิ่ม column ใหม่ใน DB ที่มีอยู่แล้ว (SQLite ไม่มี ADD COLUMN IF NOT EXISTS) ──
function ensureColumn(table, column, ddl) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`); }
  catch (e) { /* duplicate column → ignore */ }
}
ensureColumn("captures", "late_submit",     "INTEGER DEFAULT 0");
ensureColumn("captures", "incomplete_docs", "INTEGER DEFAULT 0");
ensureColumn("captures", "inspector_name",  "TEXT");

/** ── Settings helpers (JSON values) ────────────────────────────────────────── */
function setSetting(key, value) {
  db.prepare("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, JSON.stringify(value));
}
function getSetting(key, fallback = null) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

/** ── Seed: เติมจาก default-data.json ครั้งแรกที่ DB ยังว่าง ─────────────── */
function isEmpty() {
  const c1 = db.prepare("SELECT COUNT(*) AS n FROM province_rates").get().n;
  const c2 = db.prepare("SELECT COUNT(*) AS n FROM amphur_table").get().n;
  return c1 === 0 && c2 === 0;
}

export function seedFromDefaults() {
  if (!isEmpty()) return { seeded: false, reason: "db not empty" };
  if (!existsSync(DEFAULT_DATA_PATH)) {
    return { seeded: false, reason: `default-data.json not found at ${DEFAULT_DATA_PATH}` };
  }
  const defaults = JSON.parse(readFileSync(DEFAULT_DATA_PATH, "utf8"));
  return seedFrom(defaults);
}

/** ทำงานใน BEGIN/COMMIT (rollback ถ้า error) — node:sqlite ไม่มี .transaction() */
function tx(fn) {
  db.exec("BEGIN");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch {}
    throw e;
  }
}

export function seedFrom(payload) {
  tx(() => {
    db.exec(`
      DELETE FROM province_rates;
      DELETE FROM amphur_overrides;
      DELETE FROM tumbon_overrides;
      DELETE FROM amphur_table;
      DELETE FROM enabled_provinces;
      DELETE FROM settings WHERE key IN ('modifierFees');
    `);

    const insP = db.prepare("INSERT INTO province_rates(province_id, sur_invest) VALUES (?, ?)");
    for (const [id, fee] of Object.entries(payload.PROVINCE_FEE_MAP || {})) insP.run(String(id), Number(fee));

    const insA = db.prepare("INSERT INTO amphur_overrides(amphur_id, sur_invest) VALUES (?, ?)");
    for (const [id, fee] of Object.entries(payload.AMPHUR_FEE_MAP || {})) insA.run(String(id), Number(fee));

    const insT = db.prepare("INSERT INTO tumbon_overrides(tumbon_id, sur_invest) VALUES (?, ?)");
    for (const [id, fee] of Object.entries(payload.TUMBON_FEE_MAP || {})) insT.run(String(id), Number(fee));

    const insTbl = db.prepare(`
      INSERT INTO amphur_table(amphur_id, sur_invest, ins_invest_12, ins_invest_34, ins_trans, ins_photo_12)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const [id, row] of Object.entries(payload.AMPHUR_FEE_TABLE || {})) {
      insTbl.run(
        String(id),
        row.SUR_INVEST ?? null,
        row.INS_INVEST_12 ?? null,
        row.INS_INVEST_34 ?? null,
        row.INS_TRANS ?? null,
        row.INS_PHOTO_12 ?? null
      );
    }

    const insE = db.prepare("INSERT INTO enabled_provinces(province_id) VALUES (?)");
    for (const id of payload.enabledProvinces || []) insE.run(String(id));

    setSetting("modifierFees", payload.modifierFees || { outOfArea: 0, outOfHours: 0 });
  });
  return { seeded: true };
}

/** ── Read whole config — ใช้ทั้ง extension fetch + admin/viewer ─────────── */
export function readConfig() {
  const PROVINCE_FEE_MAP = {};
  for (const r of db.prepare("SELECT province_id, sur_invest FROM province_rates").all()) {
    PROVINCE_FEE_MAP[r.province_id] = r.sur_invest;
  }
  const AMPHUR_FEE_MAP = {};
  for (const r of db.prepare("SELECT amphur_id, sur_invest FROM amphur_overrides").all()) {
    AMPHUR_FEE_MAP[r.amphur_id] = r.sur_invest;
  }
  const TUMBON_FEE_MAP = {};
  for (const r of db.prepare("SELECT tumbon_id, sur_invest FROM tumbon_overrides").all()) {
    TUMBON_FEE_MAP[r.tumbon_id] = r.sur_invest;
  }
  const AMPHUR_FEE_TABLE = {};
  for (const r of db.prepare(`
    SELECT amphur_id, sur_invest, ins_invest_12, ins_invest_34, ins_trans, ins_photo_12
    FROM amphur_table
  `).all()) {
    const row = {};
    if (r.sur_invest    !== null) row.SUR_INVEST    = r.sur_invest;
    if (r.ins_invest_12 !== null) row.INS_INVEST_12 = r.ins_invest_12;
    if (r.ins_invest_34 !== null) row.INS_INVEST_34 = r.ins_invest_34;
    if (r.ins_trans     !== null) row.INS_TRANS     = r.ins_trans;
    if (r.ins_photo_12  !== null) row.INS_PHOTO_12  = r.ins_photo_12;
    AMPHUR_FEE_TABLE[r.amphur_id] = row;
  }
  const enabledProvinces = db.prepare("SELECT province_id FROM enabled_provinces").all().map(r => r.province_id);
  const modifierFees = getSetting("modifierFees", { outOfArea: 0, outOfHours: 0 });
  return {
    PROVINCE_FEE_MAP, AMPHUR_FEE_MAP, TUMBON_FEE_MAP, AMPHUR_FEE_TABLE,
    enabledProvinces, modifierFees,
  };
}

/** ── Province / Amphur / Tumbon CRUD ─────────────────────────────────────── */
export const ProvinceRate = {
  list: () => db.prepare("SELECT province_id, sur_invest FROM province_rates ORDER BY province_id").all(),
  upsert: (id, fee) => db.prepare(
    "INSERT INTO province_rates(province_id, sur_invest) VALUES (?, ?) ON CONFLICT(province_id) DO UPDATE SET sur_invest = excluded.sur_invest"
  ).run(String(id), Number(fee)),
  remove: (id) => db.prepare("DELETE FROM province_rates WHERE province_id = ?").run(String(id)),
};

export const AmphurOverride = {
  list: () => db.prepare("SELECT amphur_id, sur_invest FROM amphur_overrides ORDER BY amphur_id").all(),
  upsert: (id, fee) => db.prepare(
    "INSERT INTO amphur_overrides(amphur_id, sur_invest) VALUES (?, ?) ON CONFLICT(amphur_id) DO UPDATE SET sur_invest = excluded.sur_invest"
  ).run(String(id), Number(fee)),
  remove: (id) => db.prepare("DELETE FROM amphur_overrides WHERE amphur_id = ?").run(String(id)),
};

export const TumbonOverride = {
  list: () => db.prepare("SELECT tumbon_id, sur_invest FROM tumbon_overrides ORDER BY tumbon_id").all(),
  upsert: (id, fee) => db.prepare(
    "INSERT INTO tumbon_overrides(tumbon_id, sur_invest) VALUES (?, ?) ON CONFLICT(tumbon_id) DO UPDATE SET sur_invest = excluded.sur_invest"
  ).run(String(id), Number(fee)),
  remove: (id) => db.prepare("DELETE FROM tumbon_overrides WHERE tumbon_id = ?").run(String(id)),
};

export const AmphurTable = {
  list: () => db.prepare(`
    SELECT amphur_id, sur_invest, ins_invest_12, ins_invest_34, ins_trans, ins_photo_12
    FROM amphur_table ORDER BY amphur_id
  `).all(),
  upsert: (id, fields) => db.prepare(`
    INSERT INTO amphur_table(amphur_id, sur_invest, ins_invest_12, ins_invest_34, ins_trans, ins_photo_12)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(amphur_id) DO UPDATE SET
      sur_invest    = excluded.sur_invest,
      ins_invest_12 = excluded.ins_invest_12,
      ins_invest_34 = excluded.ins_invest_34,
      ins_trans     = excluded.ins_trans,
      ins_photo_12  = excluded.ins_photo_12
  `).run(
    String(id),
    fields.SUR_INVEST ?? null,
    fields.INS_INVEST_12 ?? null,
    fields.INS_INVEST_34 ?? null,
    fields.INS_TRANS ?? null,
    fields.INS_PHOTO_12 ?? null
  ),
  remove: (id) => db.prepare("DELETE FROM amphur_table WHERE amphur_id = ?").run(String(id)),
};

export const EnabledProvinces = {
  list: () => db.prepare("SELECT province_id FROM enabled_provinces ORDER BY province_id").all().map(r => r.province_id),
  set: (ids) => {
    tx(() => {
      db.exec("DELETE FROM enabled_provinces");
      const ins = db.prepare("INSERT INTO enabled_provinces(province_id) VALUES (?)");
      for (const id of ids || []) ins.run(String(id));
    });
  },
};

export const Modifiers = {
  get: () => getSetting("modifierFees", { outOfArea: 0, outOfHours: 0 }),
  set: (obj) => setSetting("modifierFees", obj),
};

/** ── Captures ───────────────────────────────────────────────────────────── */
export const Captures = {
  insert: (rec) => db.prepare(`
    INSERT INTO captures(
      ts, province_id, province_name, amphur_id, amphur_name, tumbon_id, tumbon_name,
      mtype_id, surveyor_name, is_se, inspector_name,
      sur_invest, ins_invest, ins_trans, ins_photo,
      out_of_area, out_of_area_amt, out_of_hours, out_of_hours_amt, deduct_amt,
      late_submit, incomplete_docs,
      mode, raw
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    rec.ts || new Date().toISOString(),
    rec.province_id ?? null, rec.province_name ?? null,
    rec.amphur_id ?? null, rec.amphur_name ?? null,
    rec.tumbon_id ?? null, rec.tumbon_name ?? null,
    rec.mtype_id ?? null, rec.surveyor_name ?? null, rec.is_se ? 1 : 0, rec.inspector_name ?? null,
    rec.sur_invest ?? null, rec.ins_invest ?? null, rec.ins_trans ?? null, rec.ins_photo ?? null,
    rec.out_of_area ? 1 : 0, rec.out_of_area_amt ?? null,
    rec.out_of_hours ? 1 : 0, rec.out_of_hours_amt ?? null,
    rec.deduct_amt ?? null,
    rec.late_submit ? 1 : 0, rec.incomplete_docs ? 1 : 0,
    rec.mode ?? null,
    rec.raw ? JSON.stringify(rec.raw) : null
  ),
  list: ({ limit = 200, offset = 0, provinceId } = {}) => {
    const where = provinceId ? "WHERE province_id = ?" : "";
    const args = provinceId ? [provinceId, limit, offset] : [limit, offset];
    return db.prepare(`SELECT * FROM captures ${where} ORDER BY ts DESC LIMIT ? OFFSET ?`).all(...args);
  },
  count: ({ provinceId } = {}) => {
    if (provinceId) return db.prepare("SELECT COUNT(*) AS n FROM captures WHERE province_id = ?").get(provinceId).n;
    return db.prepare("SELECT COUNT(*) AS n FROM captures").get().n;
  },
  removeAll: () => db.prepare("DELETE FROM captures").run(),
  remove: (id) => db.prepare("DELETE FROM captures WHERE id = ?").run(Number(id)),
};
