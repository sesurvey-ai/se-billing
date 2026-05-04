/**
 * server.js — Express HTTP server for I Survey Auto-Fill Helper
 *
 * Endpoints:
 *   GET  /healthz                    → { ok: true }
 *   GET  /api/config                 → ทั้ง config (extension fetch ตอน boot)
 *   POST /api/seed                   → seed จาก default-data.json (idempotent ถ้า db ว่าง)
 *   POST /api/seed?force=1           → ล้าง + seed ใหม่
 *
 *   GET  /api/province-rates         CRUD: GET, PUT (id, sur_invest), DELETE :id
 *   GET  /api/amphur-overrides       CRUD: GET, PUT, DELETE :id
 *   GET  /api/tumbon-overrides       CRUD: GET, PUT, DELETE :id
 *   GET  /api/amphur-table           CRUD: GET, PUT, DELETE :id
 *   GET  /api/enabled-provinces      → string[] / PUT body { ids: [...] }
 *   GET  /api/modifiers              → object   / PUT body { outOfArea, outOfHours }
 *   GET  /api/reference              → ส่ง reference จังหวัด/อำเภอ/ตำบล (จาก isurvey-helper/data/*.json)
 *
 *   POST /api/captures               → extension ส่งข้อมูล form ที่ user กรอก
 *   GET  /api/captures               → list (limit/offset/provinceId query)
 *   DELETE /api/captures/:id         → ลบ 1 รายการ
 *   DELETE /api/captures             → ลบทั้งหมด
 *
 * Static:
 *   /                                → public/index.html (viewer)
 *   /admin                           → public/admin.html
 *   /captures                        → public/captures.html
 */
import express from "express";
import cors from "cors";
import ExcelJS from "exceljs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import {
  seedFromDefaults, seedFrom, readConfig,
  ProvinceRate, AmphurOverride, TumbonOverride, AmphurTable,
  EnabledProvinces, Modifiers, Captures,
} from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REF_DIR = join(__dirname, "seed");
const PORT = Number(process.env.PORT) || 3200;
const HOST = process.env.HOST || "0.0.0.0"; // 0.0.0.0 เพื่อรับจาก LAN ได้

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ── Healthz ────────────────────────────────────────────────────────────────
app.get("/healthz", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── Config (read-all) ──────────────────────────────────────────────────────
app.get("/api/config", (_req, res) => {
  res.json(readConfig());
});

// ── Seed from default-data.json ────────────────────────────────────────────
app.post("/api/seed", (req, res) => {
  const force = req.query.force === "1";
  if (force) {
    const defaultsPath = join(__dirname, "seed", "default-data.json");
    if (!existsSync(defaultsPath)) return res.status(404).json({ error: "default-data.json not found" });
    const defaults = JSON.parse(readFileSync(defaultsPath, "utf8"));
    seedFrom(defaults);
    return res.json({ seeded: true, force: true });
  }
  const r = seedFromDefaults();
  res.json(r);
});

// ── Generic CRUD factory (id+fee tables) ───────────────────────────────────
function singleFeeRoutes(path, repo, idKey) {
  app.get(path, (_req, res) => res.json(repo.list()));
  app.put(`${path}/:id`, (req, res) => {
    const id = String(req.params.id || "").trim();
    const fee = Number(req.body?.sur_invest);
    if (!id || !Number.isFinite(fee)) return res.status(400).json({ error: `id + sur_invest required (got id=${id}, fee=${req.body?.sur_invest})` });
    repo.upsert(id, fee);
    res.json({ ok: true, [idKey]: id, sur_invest: fee });
  });
  app.delete(`${path}/:id`, (req, res) => {
    repo.remove(req.params.id);
    res.json({ ok: true });
  });
}
singleFeeRoutes("/api/province-rates",   ProvinceRate,   "province_id");
singleFeeRoutes("/api/amphur-overrides", AmphurOverride, "amphur_id");
singleFeeRoutes("/api/tumbon-overrides", TumbonOverride, "tumbon_id");

// ── Multi-field amphur table ───────────────────────────────────────────────
app.get("/api/amphur-table", (_req, res) => res.json(AmphurTable.list()));
app.put("/api/amphur-table/:id", (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "id required" });
  const b = req.body || {};
  const norm = (v) => (v === null || v === undefined || v === "") ? null : Number(v);
  AmphurTable.upsert(id, {
    SUR_INVEST:    norm(b.SUR_INVEST),
    INS_INVEST_12: norm(b.INS_INVEST_12),
    INS_INVEST_34: norm(b.INS_INVEST_34),
    INS_TRANS:     norm(b.INS_TRANS),
    INS_PHOTO_12:  norm(b.INS_PHOTO_12),
  });
  res.json({ ok: true, amphur_id: id });
});
app.delete("/api/amphur-table/:id", (req, res) => {
  AmphurTable.remove(req.params.id);
  res.json({ ok: true });
});

// ── enabledProvinces ───────────────────────────────────────────────────────
app.get("/api/enabled-provinces", (_req, res) => res.json(EnabledProvinces.list()));
app.put("/api/enabled-provinces", (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  EnabledProvinces.set(ids);
  res.json({ ok: true, count: ids.length });
});

// ── modifierFees ───────────────────────────────────────────────────────────
app.get("/api/modifiers", (_req, res) => res.json(Modifiers.get()));
app.put("/api/modifiers", (req, res) => {
  const out = {
    outOfArea:  Number(req.body?.outOfArea  || 0),
    outOfHours: Number(req.body?.outOfHours || 0),
  };
  Modifiers.set(out);
  res.json({ ok: true, ...out });
});

// ── Reference data (จังหวัด/อำเภอ/ตำบล) ───────────────────────────────────
let refCache = null;
function loadRef() {
  if (refCache) return refCache;
  const toMap = (file, idKey, nameKey) => {
    const path = join(REF_DIR, file);
    if (!existsSync(path)) return {};
    const json = JSON.parse(readFileSync(path, "utf8"));
    const arr = json.data || [];
    const map = {};
    for (const r of arr) {
      if (r[idKey]) map[String(r[idKey])] = r[nameKey];
    }
    return map;
  };
  // Also expose as arrays for dropdown rendering
  const arr = (file) => {
    const path = join(REF_DIR, file);
    if (!existsSync(path)) return [];
    return JSON.parse(readFileSync(path, "utf8")).data || [];
  };
  refCache = {
    provinces: arr("provinces.json"),
    amphurs:   arr("amphurs.json"),
    tumbons:   arr("tumbons.json"),
    byProvinceId: toMap("provinces.json", "provinceID", "provincename"),
    byAmphurId:   toMap("amphurs.json",   "amphurID",   "amphurname"),
    byTumbonId:   toMap("tumbons.json",   "tumbonID",   "tumbonname"),
  };
  return refCache;
}
app.get("/api/reference", (_req, res) => res.json(loadRef()));

// ── Captures ───────────────────────────────────────────────────────────────
app.post("/api/captures", (req, res) => {
  const ref = loadRef();
  const b = req.body || {};

  // กฎ: ถ้ามี deduct_amt > 0 ต้องระบุเหตุผล (late_submit หรือ incomplete_docs)
  const deduct = Number(b.deduct_amt || 0);
  if (deduct > 0 && !b.late_submit && !b.incomplete_docs) {
    return res.status(400).json({
      error: "deduct_amt > 0 requires at least one of: late_submit, incomplete_docs",
    });
  }

  const r = Captures.insert({
    ts: b.ts,
    province_id:   b.province_id   || null,
    province_name: b.province_name || ref.byProvinceId[String(b.province_id || "")] || null,
    amphur_id:     b.amphur_id     || null,
    amphur_name:   b.amphur_name   || ref.byAmphurId[String(b.amphur_id || "")] || null,
    tumbon_id:     b.tumbon_id     || null,
    tumbon_name:   b.tumbon_name   || ref.byTumbonId[String(b.tumbon_id || "")] || null,
    mtype_id:      b.mtype_id      || null,
    surveyor_name: b.surveyor_name || null,
    is_se:         !!b.is_se,
    inspector_name: b.inspector_name || null,
    sur_invest:    b.sur_invest    ?? null,
    ins_invest:    b.ins_invest    ?? null,
    ins_trans:     b.ins_trans     ?? null,
    ins_photo:     b.ins_photo     ?? null,
    out_of_area:      !!b.out_of_area,
    out_of_area_amt:  b.out_of_area_amt  ?? null,
    out_of_hours:     !!b.out_of_hours,
    out_of_hours_amt: b.out_of_hours_amt ?? null,
    deduct_amt:    b.deduct_amt    ?? null,
    late_submit:     !!b.late_submit,
    incomplete_docs: !!b.incomplete_docs,
    mode:          b.mode          || null,
    raw:           b.raw           || null,
  });
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.get("/api/captures", (req, res) => {
  const limit  = Math.min(Number(req.query.limit) || 200, 1000);
  const offset = Number(req.query.offset) || 0;
  const provinceId = req.query.provinceId ? String(req.query.provinceId) : null;
  res.json({
    rows: Captures.list({ limit, offset, provinceId }),
    total: Captures.count({ provinceId }),
    limit, offset,
  });
});
app.delete("/api/captures/:id", (req, res) => { Captures.remove(req.params.id); res.json({ ok: true }); });
app.delete("/api/captures", (_req, res) => { Captures.removeAll(); res.json({ ok: true }); });

// ── Excel export ──────────────────────────────────────────────────────────
app.get("/api/captures.xlsx", async (req, res) => {
  const provinceId = req.query.provinceId ? String(req.query.provinceId) : null;
  const rows = Captures.list({ limit: 100000, offset: 0, provinceId });

  const wb = new ExcelJS.Workbook();
  wb.creator = "I Survey Helper";
  wb.created = new Date();
  const ws = wb.addWorksheet("รายละเอียด");

  ws.columns = [
    { header: "เวลา",            key: "ts",              width: 22 },
    { header: "จังหวัด",          key: "province_name",   width: 14 },
    { header: "อำเภอ",            key: "amphur_name",     width: 18 },
    { header: "ตำบล",             key: "tumbon_name",     width: 18 },
    { header: "ประเภทเคลม",       key: "mtype_label",     width: 14 },
    { header: "Surveyor",         key: "surveyor_name",   width: 16 },
    { header: "SE",               key: "is_se_label",     width: 6  },
    { header: "เจ้าหน้าที่ตรวจ",   key: "inspector_name",  width: 22 },
    { header: "Mode",             key: "mode",            width: 12 },
    { header: "SUR",              key: "sur_invest",      width: 8  },
    { header: "INS",              key: "ins_invest",      width: 8  },
    { header: "TRANS",            key: "ins_trans",       width: 8  },
    { header: "PHOTO",            key: "ins_photo",       width: 8  },
    { header: "นอกพื้นที่",        key: "out_of_area_lbl", width: 12 },
    { header: "ยอดนอกพื้นที่",     key: "out_of_area_amt", width: 12 },
    { header: "นอกเวลา",          key: "out_of_hours_lbl", width: 12 },
    { header: "ยอดนอกเวลา",       key: "out_of_hours_amt", width: 12 },
    { header: "หัก",              key: "deduct_amt",      width: 8  },
    { header: "ส่งช้า",           key: "late_label",      width: 8  },
    { header: "เอกสารไม่ครบ",     key: "docs_label",      width: 12 },
  ];

  const MTYPE = { "1": "1 เคลมสด", "2": "2 เคลมแห้ง", "3": "3 ติดตาม", "4": "4 เจรจา" };
  for (const r of rows) {
    ws.addRow({
      ts:               r.ts ? new Date(r.ts).toLocaleString("th-TH", { hour12: false }) : "",
      province_name:    r.province_name || r.province_id || "",
      amphur_name:      r.amphur_name   || r.amphur_id   || "",
      tumbon_name:      r.tumbon_name   || r.tumbon_id   || "",
      mtype_label:      MTYPE[r.mtype_id] || r.mtype_id || "",
      surveyor_name:    r.surveyor_name || "",
      is_se_label:      r.is_se ? "SE" : "",
      inspector_name:   r.inspector_name || "",
      mode:             r.mode || "",
      sur_invest:       r.sur_invest ?? "",
      ins_invest:       r.ins_invest ?? "",
      ins_trans:        r.ins_trans  ?? "",
      ins_photo:        r.ins_photo  ?? "",
      out_of_area_lbl:  r.out_of_area ? "ใช่" : "",
      out_of_area_amt:  r.out_of_area_amt ?? "",
      out_of_hours_lbl: r.out_of_hours ? "ใช่" : "",
      out_of_hours_amt: r.out_of_hours_amt ?? "",
      deduct_amt:       r.deduct_amt ?? "",
      late_label:       r.late_submit ? "ใช่" : "",
      docs_label:       r.incomplete_docs ? "ใช่" : "",
    });
  }

  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const fname = `captures-${stamp}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
  await wb.xlsx.write(res);
  res.end();
});

// ── Static (viewer + admin pages) ──────────────────────────────────────────
const PUBLIC_DIR = join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));
app.get("/admin", (_req, res) => res.sendFile(join(PUBLIC_DIR, "admin.html")));
app.get("/admin/captures", (_req, res) => res.sendFile(join(PUBLIC_DIR, "captures.html")));
app.get("/captures", (_req, res) => res.sendFile(join(PUBLIC_DIR, "captures.html")));

// ── Boot ──────────────────────────────────────────────────────────────────
const seedResult = seedFromDefaults();
if (seedResult.seeded) console.log("[isurvey-server] Seeded DB from default-data.json");
else console.log("[isurvey-server] Seed skipped:", seedResult.reason);

app.listen(PORT, HOST, () => {
  console.log(`[isurvey-server] listening on http://${HOST}:${PORT}`);
  console.log(`[isurvey-server] viewer:   http://localhost:${PORT}/`);
  console.log(`[isurvey-server] admin:    http://localhost:${PORT}/admin`);
  console.log(`[isurvey-server] captures: http://localhost:${PORT}/captures`);
});
