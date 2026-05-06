// scripts/add-bkk-region.mjs — apply 4-province batch (กทม/สมุทรปราการ/นนทบุรี/ปทุมธานี)
// แก้ default-data.json โดยรักษา format เดิม (one entry per line) + apply ผ่าน API ไป running DB
// usage: node scripts/add-bkk-region.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_URL = process.env.SERVER_URL || "http://localhost:3200";
const SEED_PATH = join(__dirname, "..", "server", "seed", "default-data.json");
const AMPHURS_REF = join(__dirname, "..", "server", "seed", "amphurs.json");

// Province → rate spec (from Google Sheet)
const SPEC = {
  "10": { SUR_INVEST: 300, INS_INVEST_12: 700, INS_INVEST_34: 700 },                                    // กทม (no TRANS/PHOTO)
  "11": { SUR_INVEST: 300, INS_INVEST_12: 300, INS_INVEST_34: 200, INS_TRANS: 500, INS_PHOTO_12: 50 },  // สมุทรปราการ
  "12": { SUR_INVEST: 300, INS_INVEST_12: 300, INS_INVEST_34: 200, INS_TRANS: 500, INS_PHOTO_12: 50 },  // นนทบุรี
  "13": { SUR_INVEST: 300, INS_INVEST_12: 300, INS_INVEST_34: 200, INS_TRANS: 500, INS_PHOTO_12: 50 },  // ปทุมธานี
};

// ── Group amphur IDs by province (prefix) ────────────────────────────────
const amphursAll = JSON.parse(readFileSync(AMPHURS_REF, "utf8")).data || [];
const byProvince = {};
for (const a of amphursAll) {
  const p = String(a.amphurID).substring(0, 2);
  if (SPEC[p]) (byProvince[p] = byProvince[p] || []).push(String(a.amphurID));
}
for (const p of Object.keys(byProvince)) byProvince[p].sort();

// ── Build new lines ──────────────────────────────────────────────────────
function lineFor(id, rate) {
  const parts = [];
  if (rate.SUR_INVEST    !== undefined) parts.push(`"SUR_INVEST": ${rate.SUR_INVEST}`);
  if (rate.INS_INVEST_12 !== undefined) parts.push(`"INS_INVEST_12": ${rate.INS_INVEST_12}`);
  if (rate.INS_INVEST_34 !== undefined) parts.push(`"INS_INVEST_34": ${rate.INS_INVEST_34}`);
  if (rate.INS_TRANS     !== undefined) parts.push(`"INS_TRANS": ${rate.INS_TRANS}`);
  if (rate.INS_PHOTO_12  !== undefined) parts.push(`"INS_PHOTO_12": ${rate.INS_PHOTO_12}`);
  return `    "${id}": { ${parts.join(", ")} }`;
}

const provinceOrder = ["10", "11", "12", "13"];
const newEntries = [];
for (const pid of provinceOrder) {
  const amps = byProvince[pid] || [];
  for (const aid of amps) newEntries.push(lineFor(aid, SPEC[pid]));
}
console.log(`Built ${newEntries.length} new entries`);

// ── Edit file textually — preserve original line endings (CRLF or LF) ────
let content = readFileSync(SEED_PATH, "utf8");
const NL = content.includes("\r\n") ? "\r\n" : "\n";

// Locate the line of last AMPHUR_FEE_TABLE entry (immediately before `  },\n  "modifierFees"`)
const closeMarker = `  },${NL}  "modifierFees"`;
const cutoff = content.lastIndexOf(closeMarker);
if (cutoff < 0) throw new Error("Cannot find AMPHUR_FEE_TABLE close marker");

let head = content.slice(0, cutoff);
const tail = content.slice(cutoff);

// Append comma to existing last entry, then add new entries (last one no comma)
const lastEntryRe = new RegExp(`(.*})(\\s*?)(${NL.replace(/\\/g, "\\\\")})$`);
const m = head.match(lastEntryRe);
if (!m) throw new Error("Cannot locate end of head — last entry pattern fail");
head = head.replace(lastEntryRe, m[1] + "," + NL + newEntries.join("," + NL) + NL);

let updated = head + tail;
// Add "13" to enabledProvinces
updated = updated.replace(/(    "10", "11", "12",)/, '$1 "13",');

writeFileSync(SEED_PATH, updated, "utf8");
console.log(`[seed] default-data.json updated: +${newEntries.length} amphur entries; province "13" added`);

// ── Apply to running DB via API ──────────────────────────────────────────
async function put(path, body) {
  const r = await fetch(SERVER_URL + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PUT ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

let dbAdded = 0;
for (const pid of provinceOrder) {
  const amps = byProvince[pid] || [];
  for (const aid of amps) {
    await put(`/api/amphur-table/${aid}`, SPEC[pid]);
    dbAdded++;
  }
}
console.log(`[db] amphur-table: ${dbAdded} entries upserted`);

const cur = await (await fetch(SERVER_URL + "/api/enabled-provinces")).json();
const merged = Array.from(new Set([...cur, "10", "11", "12", "13"])).sort();
await put("/api/enabled-provinces", { ids: merged });
console.log(`[db] enabled-provinces: ${merged.length}`);
console.log("Done.");
