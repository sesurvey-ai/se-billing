#!/usr/bin/env node
/**
 * pack-extension.mjs — สร้าง zip ของ se-billing-extension/ พร้อม upload ไป Chrome Web Store
 *
 * Usage:
 *   node scripts/pack-extension.mjs
 *
 * Output: dist/se-billing-extension-v<version>.zip
 *
 * รวม: manifest.json, *.js, *.html, *.css, icon-*.png, data/*.json
 * ตัด: *.md, .git*, .DS_Store, ไฟล์ system อื่นๆ
 */
import { readFileSync, readdirSync, statSync, mkdirSync, createWriteStream, existsSync, rmSync } from "node:fs";
import { join, relative, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "se-billing-extension");
const DIST = join(ROOT, "dist");

if (!existsSync(SRC)) {
  console.error(`❌ ไม่พบโฟลเดอร์ ${SRC}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(SRC, "manifest.json"), "utf8"));
const VERSION = manifest.version;
const NAME = "se-billing-extension";
const ZIP_NAME = `${NAME}-v${VERSION}.zip`;
const ZIP_PATH = join(DIST, ZIP_NAME);

mkdirSync(DIST, { recursive: true });
if (existsSync(ZIP_PATH)) rmSync(ZIP_PATH);

// ── ไฟล์ที่ "ห้าม" รวมเข้า zip ──
const EXCLUDE_PATTERNS = [
  /^\.git/,
  /\.md$/i,
  /^\.DS_Store$/,
  /^Thumbs\.db$/,
  /^\.vscode$/,
  /^node_modules$/,
];

function shouldExclude(name) {
  return EXCLUDE_PATTERNS.some(re => re.test(name));
}

// Walk + collect files
function walk(dir, base = "") {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (shouldExclude(name)) continue;
    const full = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full, rel));
    else out.push({ full, rel });
  }
  return out;
}

const files = walk(SRC);
console.log(`📦 Packing ${files.length} files from se-billing-extension/`);
files.forEach(f => console.log(`   ${f.rel}`));

// ── Validate manifest พื้นฐาน ──
const requiredFields = ["manifest_version", "name", "version", "description", "icons", "host_permissions"];
const missing = requiredFields.filter(k => !manifest[k]);
if (missing.length) {
  console.error(`❌ manifest.json missing required fields: ${missing.join(", ")}`);
  process.exit(1);
}

const wildHost = (manifest.host_permissions || []).some(h => /\*\/\*/.test(h));
if (wildHost) {
  console.warn(`⚠️  host_permissions มี wildcard — Chrome Web Store อาจ reject`);
}

if (manifest.manifest_version !== 3) {
  console.error(`❌ ต้องใช้ manifest_version: 3 (ได้ ${manifest.manifest_version})`);
  process.exit(1);
}

console.log(`\n✓ manifest.json valid (v${VERSION}, MV${manifest.manifest_version})`);
console.log(`  name: ${manifest.name}`);
console.log(`  host_permissions: ${(manifest.host_permissions || []).join(", ")}`);

// ── Pack ด้วย powershell Compress-Archive ──
// (ไม่ใช้ npm dep เลย — Windows มี built-in)
const tempStaging = join(DIST, `_staging-${VERSION}`);
if (existsSync(tempStaging)) rmSync(tempStaging, { recursive: true, force: true });
mkdirSync(tempStaging, { recursive: true });

import { copyFileSync } from "node:fs";
for (const f of files) {
  const dest = join(tempStaging, f.rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(f.full, dest);
}

console.log(`\n📁 Staged at ${tempStaging}`);

// Compress (Windows PowerShell)
const isWin = process.platform === "win32";
let result;
if (isWin) {
  result = spawnSync("powershell", [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${tempStaging}\\*' -DestinationPath '${ZIP_PATH}' -Force`,
  ], { stdio: "inherit" });
} else {
  result = spawnSync("zip", ["-r", ZIP_PATH, "."], { cwd: tempStaging, stdio: "inherit" });
}

if (result.status !== 0) {
  console.error(`❌ Pack failed (exit ${result.status})`);
  process.exit(1);
}

// Cleanup staging
rmSync(tempStaging, { recursive: true, force: true });

const sizeKb = (statSync(ZIP_PATH).size / 1024).toFixed(1);
console.log(`\n✅ ${ZIP_PATH} (${sizeKb} KB)`);
console.log(`\n📤 Upload ไปที่ https://chrome.google.com/webstore/devconsole/`);
