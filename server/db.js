/**
 * db.js — SQLite (node:sqlite) wrapper + schema + seed
 *
 * Schema (single source of truth):
 *   province_rates(province_id PK, sur_invest)
 *   amphur_overrides(amphur_id PK, sur_invest)               -- simple-mode override
 *   tumbon_overrides(tumbon_id PK, sur_invest)               -- simple-mode override
 *   amphur_table(amphur_id PK, sur_invest, ins_invest_12, ins_invest_34, ins_trans, ins_photo_12,
 *                sur_invest_by_team)                         -- JSON: { "team": rate } (Chonburi-style)
 *   tumbon_fee_override(tumbon_id PK, label, parent_amphur,
 *                       ins_invest_12, ins_invest_34, ins_trans, ins_photo_12,
 *                       sur_invest_by_team)                  -- JSON: sub-area override (บ่อวิน/พลูตาหลวง)
 *   surveyor_teams(sec_code PK, team)                        -- map "SEC148" → "บางละมุง"
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
    amphur_id          TEXT PRIMARY KEY,
    sur_invest         INTEGER,
    ins_invest_12      INTEGER,
    ins_invest_34      INTEGER,
    ins_trans          INTEGER,
    ins_photo_12       INTEGER,
    sur_invest_by_team TEXT,      -- JSON: { team: rate } | NULL = ใช้ sur_invest flat แทน
    ins_trans_by_team  TEXT       -- JSON: { team: rate } | NULL = ใช้ ins_trans flat แทน
  );
  CREATE TABLE IF NOT EXISTS tumbon_fee_override (
    tumbon_id          TEXT PRIMARY KEY,
    label              TEXT NOT NULL,
    parent_amphur      TEXT NOT NULL,
    ins_invest_12      INTEGER,
    ins_invest_34      INTEGER,
    ins_trans          INTEGER,
    ins_photo_12       INTEGER,
    sur_invest_by_team TEXT,
    ins_trans_by_team  TEXT
  );
  CREATE TABLE IF NOT EXISTS surveyor_teams (
    sec_code TEXT PRIMARY KEY,
    team     TEXT NOT NULL
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
    dispatch_date   TEXT,
    province_id     TEXT,
    province_name   TEXT,
    amphur_id       TEXT,
    amphur_name     TEXT,
    tumbon_id       TEXT,
    tumbon_name     TEXT,
    mtype_id        TEXT,
    claim_no        TEXT,
    survey_no       TEXT,
    case_status     TEXT,
    surveyor_name   TEXT,
    oss_company     TEXT,
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
// v2.7.9: เก็บเลขเคลม + เลขเซอร์เวย์ + ชื่อบริษัท OSS (ถ้า OSS รับงาน)
ensureColumn("captures", "claim_no",        "TEXT");
ensureColumn("captures", "survey_no",       "TEXT");
ensureColumn("captures", "oss_company",     "TEXT");
// v2.7.11: เก็บสถานะ supervisor_summary radio ("close" / "cancel" / null)
//   → แยกหน้าแสดง /captures (close + legacy null) vs /cancelled (cancel)
ensureColumn("captures", "case_status",     "TEXT");
try { db.exec("CREATE INDEX IF NOT EXISTS idx_captures_status ON captures(case_status);"); } catch {}
// v2.7.20: เก็บ "วันจ่ายงาน" (จ่ายงานเวลา จาก tab Summary) — date + time เป็น string เดียว
ensureColumn("captures", "dispatch_date",   "TEXT");
// v2.8: Chonburi team-based rates
ensureColumn("amphur_table", "sur_invest_by_team", "TEXT");
// v2.9: Kanchanaburi per-team INS_TRANS override (+ flat fallback)
ensureColumn("amphur_table",        "ins_trans_by_team",  "TEXT");
ensureColumn("tumbon_fee_override", "ins_trans_by_team",  "TEXT");

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

function jsonOrNull(obj) {
  return obj && Object.keys(obj).length > 0 ? JSON.stringify(obj) : null;
}
function parseJsonObj(s) {
  if (!s) return null;
  try { const o = JSON.parse(s); return (o && typeof o === "object") ? o : null; }
  catch { return null; }
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
      DELETE FROM tumbon_fee_override;
      DELETE FROM surveyor_teams;
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
      INSERT INTO amphur_table(amphur_id, sur_invest, ins_invest_12, ins_invest_34, ins_trans, ins_photo_12, sur_invest_by_team, ins_trans_by_team)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const [id, row] of Object.entries(payload.AMPHUR_FEE_TABLE || {})) {
      insTbl.run(
        String(id),
        row.SUR_INVEST ?? null,
        row.INS_INVEST_12 ?? null,
        row.INS_INVEST_34 ?? null,
        row.INS_TRANS ?? null,
        row.INS_PHOTO_12 ?? null,
        jsonOrNull(row.SUR_INVEST_BY_TEAM),
        jsonOrNull(row.INS_TRANS_BY_TEAM)
      );
    }

    const insTo = db.prepare(`
      INSERT INTO tumbon_fee_override(tumbon_id, label, parent_amphur, ins_invest_12, ins_invest_34, ins_trans, ins_photo_12, sur_invest_by_team, ins_trans_by_team)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const [id, row] of Object.entries(payload.TUMBON_FEE_OVERRIDE || {})) {
      insTo.run(
        String(id),
        String(row.label || ""),
        String(row.parentAmphur || ""),
        row.INS_INVEST_12 ?? null,
        row.INS_INVEST_34 ?? null,
        row.INS_TRANS ?? null,
        row.INS_PHOTO_12 ?? null,
        jsonOrNull(row.SUR_INVEST_BY_TEAM),
        jsonOrNull(row.INS_TRANS_BY_TEAM)
      );
    }

    const insSt = db.prepare("INSERT INTO surveyor_teams(sec_code, team) VALUES (?, ?)");
    for (const [code, team] of Object.entries(payload.SURVEYOR_TEAMS || {})) {
      insSt.run(String(code), String(team));
    }

    const insE = db.prepare("INSERT INTO enabled_provinces(province_id) VALUES (?)");
    for (const id of payload.enabledProvinces || []) insE.run(String(id));

    setSetting("modifierFees", payload.modifierFees || { outOfArea: 0, outOfHours: 0 });
    // requiredFields/saveButtonIds: เซ็ตเฉพาะเมื่อ payload มี — ไม่งั้นคงค่าเดิม
    // (เป็น operational config ของ extension ไม่ใช่ข้อมูลเรท)
    if (Array.isArray(payload.requiredFields)) setSetting("requiredFields", payload.requiredFields);
    if (Array.isArray(payload.saveButtonIds))  setSetting("saveButtonIds",  payload.saveButtonIds);
    if (Array.isArray(payload.requiredFieldsMtypes)) setSetting("requiredFieldsMtypes", payload.requiredFieldsMtypes);
  });
  return { seeded: true };
}

/** ── Required fields (extension บล็อกปุ่มบันทึกถ้าฟิลด์เหล่านี้ว่าง) ─────────
 * id = DOM input id บนหน้า isurvey (ลงท้าย -inputEl); label = ข้อความแจ้งเตือน
 * default ครอบคลุม 19 ฟิลด์ที่ emcs บังคับกรอก (ใช้เมื่อยังไม่เคยตั้งค่าใน DB)
 */
const DEFAULT_REQUIRED_FIELDS = [
  { id: "tab1_policy_no-inputEl",        label: "กรมธรรม์เลขที่" },
  { id: "tab2_acc_date-inputEl",         label: "วันที่เกิดเหตุ" },
  { id: "tab2_acc_time-inputEl",         label: "เวลาที่เกิดเหตุ" },
  { id: "tab2_acc_place-inputEl",        label: "สถานที่เกิดเหตุ" },
  { id: "tab2_acc_provinceID-inputEl",   label: "จังหวัด (ที่เกิดเหตุ)" },
  { id: "tab2_acc_amphurID-inputEl",     label: "เขต/อำเภอ (ที่เกิดเหตุ)" },
  { id: "tab2_acc_type_desc-inputEl",    label: "สาเหตุการเกิดเหตุ" },
  { id: "tab2_acc_verdictID-inputEl",    label: "ผลคดี" },
  { id: "tab3_plate_no-inputEl",         label: "ทะเบียน" },
  { id: "tab3_vehTID-inputEl",           label: "ประเภทรถ" },
  { id: "tab3_policy_TypeID-inputEl",    label: "ประเภท (กรมธรรม์)" },
  { id: "tab3_plate_provinceID-inputEl", label: "จังหวัด (ทะเบียนรถ)" },
  { id: "tab3_drv_name-inputEl",         label: "ชื่อผู้ขับขี่" },
  { id: "tab3_relation-inputEl",         label: "ความสัมพันธ์กับเจ้าของรถ" },
  { id: "tab3_age-inputEl",              label: "อายุ" },
  { id: "tab3_birthdate-inputEl",        label: "วัน/เดือน/ปี เกิด" },
  { id: "tab3_drv_phone-inputEl",        label: "เบอร์โทร" },
  { id: "tab3_IDcard_no-inputEl",        label: "บัตรประชาชน" },
  { id: "tab3_lic_no-inputEl",           label: "เลขที่ใบขับขี่" },
];
const DEFAULT_SAVE_BUTTON_IDS = ["tab1_save"];
// MtypeID ที่ต้องตรวจ 19 ฟิลด์ — "1"=เคลมสด, "2"=เคลมแห้ง (3=ติดตาม/4=เจรจา ไม่ตรวจ)
// ว่าง = ไม่กรองตาม MtypeID (ตรวจทุกประเภท)
const DEFAULT_REQUIRED_MTYPES = ["1", "2"];

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
    SELECT amphur_id, sur_invest, ins_invest_12, ins_invest_34, ins_trans, ins_photo_12, sur_invest_by_team, ins_trans_by_team
    FROM amphur_table
  `).all()) {
    const row = {};
    if (r.sur_invest    !== null) row.SUR_INVEST    = r.sur_invest;
    if (r.ins_invest_12 !== null) row.INS_INVEST_12 = r.ins_invest_12;
    if (r.ins_invest_34 !== null) row.INS_INVEST_34 = r.ins_invest_34;
    if (r.ins_trans     !== null) row.INS_TRANS     = r.ins_trans;
    if (r.ins_photo_12  !== null) row.INS_PHOTO_12  = r.ins_photo_12;
    const surByTeam   = parseJsonObj(r.sur_invest_by_team);
    if (surByTeam)   row.SUR_INVEST_BY_TEAM = surByTeam;
    const transByTeam = parseJsonObj(r.ins_trans_by_team);
    if (transByTeam) row.INS_TRANS_BY_TEAM  = transByTeam;
    AMPHUR_FEE_TABLE[r.amphur_id] = row;
  }
  const TUMBON_FEE_OVERRIDE = {};
  for (const r of db.prepare(`
    SELECT tumbon_id, label, parent_amphur, ins_invest_12, ins_invest_34, ins_trans, ins_photo_12, sur_invest_by_team, ins_trans_by_team
    FROM tumbon_fee_override
  `).all()) {
    const row = { label: r.label, parentAmphur: r.parent_amphur };
    if (r.ins_invest_12 !== null) row.INS_INVEST_12 = r.ins_invest_12;
    if (r.ins_invest_34 !== null) row.INS_INVEST_34 = r.ins_invest_34;
    if (r.ins_trans     !== null) row.INS_TRANS     = r.ins_trans;
    if (r.ins_photo_12  !== null) row.INS_PHOTO_12  = r.ins_photo_12;
    const surByTeam   = parseJsonObj(r.sur_invest_by_team);
    if (surByTeam)   row.SUR_INVEST_BY_TEAM = surByTeam;
    const transByTeam = parseJsonObj(r.ins_trans_by_team);
    if (transByTeam) row.INS_TRANS_BY_TEAM  = transByTeam;
    TUMBON_FEE_OVERRIDE[r.tumbon_id] = row;
  }
  const SURVEYOR_TEAMS = {};
  for (const r of db.prepare("SELECT sec_code, team FROM surveyor_teams").all()) {
    SURVEYOR_TEAMS[r.sec_code] = r.team;
  }
  const enabledProvinces = db.prepare("SELECT province_id FROM enabled_provinces").all().map(r => r.province_id);
  const modifierFees = getSetting("modifierFees", { outOfArea: 0, outOfHours: 0 });
  const requiredFields = getSetting("requiredFields", DEFAULT_REQUIRED_FIELDS);
  const saveButtonIds  = getSetting("saveButtonIds",  DEFAULT_SAVE_BUTTON_IDS);
  const requiredFieldsMtypes = getSetting("requiredFieldsMtypes", DEFAULT_REQUIRED_MTYPES);
  return {
    PROVINCE_FEE_MAP, AMPHUR_FEE_MAP, TUMBON_FEE_MAP, AMPHUR_FEE_TABLE,
    TUMBON_FEE_OVERRIDE, SURVEYOR_TEAMS,
    enabledProvinces, modifierFees,
    requiredFields, saveButtonIds, requiredFieldsMtypes,
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
    SELECT amphur_id, sur_invest, ins_invest_12, ins_invest_34, ins_trans, ins_photo_12, sur_invest_by_team, ins_trans_by_team
    FROM amphur_table ORDER BY amphur_id
  `).all().map(r => ({
    ...r,
    sur_invest_by_team: parseJsonObj(r.sur_invest_by_team),
    ins_trans_by_team:  parseJsonObj(r.ins_trans_by_team),
  })),
  upsert: (id, fields) => db.prepare(`
    INSERT INTO amphur_table(amphur_id, sur_invest, ins_invest_12, ins_invest_34, ins_trans, ins_photo_12, sur_invest_by_team, ins_trans_by_team)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(amphur_id) DO UPDATE SET
      sur_invest         = excluded.sur_invest,
      ins_invest_12      = excluded.ins_invest_12,
      ins_invest_34      = excluded.ins_invest_34,
      ins_trans          = excluded.ins_trans,
      ins_photo_12       = excluded.ins_photo_12,
      sur_invest_by_team = excluded.sur_invest_by_team,
      ins_trans_by_team  = excluded.ins_trans_by_team
  `).run(
    String(id),
    fields.SUR_INVEST ?? null,
    fields.INS_INVEST_12 ?? null,
    fields.INS_INVEST_34 ?? null,
    fields.INS_TRANS ?? null,
    fields.INS_PHOTO_12 ?? null,
    jsonOrNull(fields.SUR_INVEST_BY_TEAM),
    jsonOrNull(fields.INS_TRANS_BY_TEAM)
  ),
  remove: (id) => db.prepare("DELETE FROM amphur_table WHERE amphur_id = ?").run(String(id)),
};

export const TumbonOverrideTable = {
  list: () => db.prepare(`
    SELECT tumbon_id, label, parent_amphur, ins_invest_12, ins_invest_34, ins_trans, ins_photo_12, sur_invest_by_team, ins_trans_by_team
    FROM tumbon_fee_override ORDER BY tumbon_id
  `).all().map(r => ({
    ...r,
    sur_invest_by_team: parseJsonObj(r.sur_invest_by_team),
    ins_trans_by_team:  parseJsonObj(r.ins_trans_by_team),
  })),
  upsert: (id, fields) => db.prepare(`
    INSERT INTO tumbon_fee_override(tumbon_id, label, parent_amphur, ins_invest_12, ins_invest_34, ins_trans, ins_photo_12, sur_invest_by_team, ins_trans_by_team)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tumbon_id) DO UPDATE SET
      label              = excluded.label,
      parent_amphur      = excluded.parent_amphur,
      ins_invest_12      = excluded.ins_invest_12,
      ins_invest_34      = excluded.ins_invest_34,
      ins_trans          = excluded.ins_trans,
      ins_photo_12       = excluded.ins_photo_12,
      sur_invest_by_team = excluded.sur_invest_by_team,
      ins_trans_by_team  = excluded.ins_trans_by_team
  `).run(
    String(id),
    String(fields.label || ""),
    String(fields.parentAmphur || ""),
    fields.INS_INVEST_12 ?? null,
    fields.INS_INVEST_34 ?? null,
    fields.INS_TRANS ?? null,
    fields.INS_PHOTO_12 ?? null,
    jsonOrNull(fields.SUR_INVEST_BY_TEAM),
    jsonOrNull(fields.INS_TRANS_BY_TEAM)
  ),
  remove: (id) => db.prepare("DELETE FROM tumbon_fee_override WHERE tumbon_id = ?").run(String(id)),
};

export const SurveyorTeams = {
  list: () => db.prepare("SELECT sec_code, team FROM surveyor_teams ORDER BY sec_code").all(),
  upsert: (code, team) => db.prepare(
    "INSERT INTO surveyor_teams(sec_code, team) VALUES (?, ?) ON CONFLICT(sec_code) DO UPDATE SET team = excluded.team"
  ).run(String(code), String(team)),
  remove: (code) => db.prepare("DELETE FROM surveyor_teams WHERE sec_code = ?").run(String(code)),
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

export const RequiredFields = {
  get: () => ({
    fields:        getSetting("requiredFields", DEFAULT_REQUIRED_FIELDS),
    saveButtonIds: getSetting("saveButtonIds",  DEFAULT_SAVE_BUTTON_IDS),
    mtypes:        getSetting("requiredFieldsMtypes", DEFAULT_REQUIRED_MTYPES),
  }),
  // set เฉพาะ key ที่ส่งมา (fields / saveButtonIds / mtypes) — อีกตัวคงเดิม
  set: ({ fields, saveButtonIds, mtypes } = {}) => {
    if (Array.isArray(fields)) {
      const clean = fields
        .map(f => ({ id: String(f?.id || "").trim(), label: String(f?.label || "").trim() }))
        .filter(f => f.id);
      setSetting("requiredFields", clean);
    }
    if (Array.isArray(saveButtonIds)) {
      const ids = saveButtonIds.map(s => String(s || "").trim()).filter(Boolean);
      setSetting("saveButtonIds", ids.length ? ids : DEFAULT_SAVE_BUTTON_IDS);
    }
    if (Array.isArray(mtypes)) {
      // normalize → "1".."4" (ตัด leading zero), เก็บเฉพาะตัวที่ไม่ว่าง
      const ms = mtypes.map(s => String(s || "").trim().replace(/^0+(?=\d)/, "")).filter(Boolean);
      setSetting("requiredFieldsMtypes", ms);
    }
  },
};

/** ── Dashboard snapshot (extenBoard: per-supervisor backlog counts) ────────── */
// เก็บ snapshot ล่าสุดที่ scraper อัปมา (JSON ก้อนเดียวใน settings) — มีแต่ตัวเลขสรุป ไม่มี PII
export const Dashboard = {
  get: () => getSetting("dashboard_latest", null),
  set: (payload) => setSetting("dashboard_latest", payload),
};

/** ── Dashboard config (admins + name aliases) — แก้ผ่าน /admin ไม่ต้องแก้โค้ด ext ──
 * admins:  ชื่อหัวหน้า (ตามที่ขึ้นใน header isurvey) ที่ให้เห็นยอดรวมทั้งบริษัท
 * aliases: { "ชื่อตอน login" : "ชื่อใน snapshot" } — ใช้ตอนชื่อ login ≠ ชื่อใน mapping
 *          (เปลี่ยนชื่อ / สะกดต่าง) badge+popup จะ map ชื่อ login → bucket ที่ถูกต้อง
 * default admins = [นพดล] เพื่อคงพฤติกรรมเดิมแม้ยังไม่เคยตั้งค่า
 */
const DEFAULT_DASHBOARD_ADMINS = ["นพดล สมบูรณ์กุล"];
export const DashboardConfig = {
  get: () => ({
    admins:  getSetting("dashboard_admins",  DEFAULT_DASHBOARD_ADMINS),
    aliases: getSetting("dashboard_aliases", {}),
  }),
  // set เฉพาะ key ที่ส่งมา (admins / aliases) — อีกตัวคงเดิม
  set: ({ admins, aliases } = {}) => {
    if (Array.isArray(admins)) {
      const clean = admins.map(s => String(s || "").trim()).filter(Boolean);
      setSetting("dashboard_admins", clean);
    }
    if (aliases && typeof aliases === "object" && !Array.isArray(aliases)) {
      const clean = {};
      for (const [k, v] of Object.entries(aliases)) {
        const kk = String(k || "").trim();
        const vv = String(v || "").trim();
        if (kk && vv) clean[kk] = vv;
      }
      setSetting("dashboard_aliases", clean);
    }
  },
};

/** ── Captures ───────────────────────────────────────────────────────────── */
export const Captures = {
  insert: (rec) => db.prepare(`
    INSERT INTO captures(
      ts, dispatch_date, province_id, province_name, amphur_id, amphur_name, tumbon_id, tumbon_name,
      mtype_id, claim_no, survey_no, case_status, surveyor_name, oss_company, is_se, inspector_name,
      sur_invest, ins_invest, ins_trans, ins_photo,
      out_of_area, out_of_area_amt, out_of_hours, out_of_hours_amt, deduct_amt,
      late_submit, incomplete_docs,
      mode, raw
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    rec.ts || new Date().toISOString(),
    rec.dispatch_date ?? null,
    rec.province_id ?? null, rec.province_name ?? null,
    rec.amphur_id ?? null, rec.amphur_name ?? null,
    rec.tumbon_id ?? null, rec.tumbon_name ?? null,
    rec.mtype_id ?? null,
    rec.claim_no ?? null, rec.survey_no ?? null, rec.case_status ?? null,
    rec.surveyor_name ?? null, rec.oss_company ?? null,
    rec.is_se ? 1 : 0, rec.inspector_name ?? null,
    rec.sur_invest ?? null, rec.ins_invest ?? null, rec.ins_trans ?? null, rec.ins_photo ?? null,
    rec.out_of_area ? 1 : 0, rec.out_of_area_amt ?? null,
    rec.out_of_hours ? 1 : 0, rec.out_of_hours_amt ?? null,
    rec.deduct_amt ?? null,
    rec.late_submit ? 1 : 0, rec.incomplete_docs ? 1 : 0,
    rec.mode ?? null,
    rec.raw ? JSON.stringify(rec.raw) : null
  ),
  // status filter: "close" → case_status='close' OR NULL (legacy), "cancel" → case_status='cancel', null = ทั้งหมด
  list: ({ limit = 200, offset = 0, provinceId, status } = {}) => {
    const conds = [];
    const args = [];
    if (provinceId) { conds.push("province_id = ?"); args.push(provinceId); }
    if (status === "close")       { conds.push("(case_status = 'close' OR case_status IS NULL)"); }
    else if (status === "cancel") { conds.push("case_status = 'cancel'"); }
    const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
    return db.prepare(`SELECT * FROM captures ${where} ORDER BY ts DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
  },
  count: ({ provinceId, status } = {}) => {
    const conds = [];
    const args = [];
    if (provinceId) { conds.push("province_id = ?"); args.push(provinceId); }
    if (status === "close")       { conds.push("(case_status = 'close' OR case_status IS NULL)"); }
    else if (status === "cancel") { conds.push("case_status = 'cancel'"); }
    const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
    return db.prepare(`SELECT COUNT(*) AS n FROM captures ${where}`).get(...args).n;
  },
  removeAll: () => db.prepare("DELETE FROM captures").run(),
  remove: (id) => db.prepare("DELETE FROM captures WHERE id = ?").run(Number(id)),
};
