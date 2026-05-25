// cancelled.js — เคลมยกเลิก (status='cancel') — แสดงคอลัมน์น้อยกว่า /captures
//   (ไม่มี ค่าบริการ/ค่าพาหนะ/รูป/รวม เพราะงานยกเลิก ไม่มีค่าใช้จ่ายให้บริษัทเก็บ)
"use strict";

const ADMIN_MODE = window.location.pathname.startsWith("/admin");
const PAGE_SIZE = 100;
const state = { offset: 0, total: 0, rows: [], provinceId: null, search: "", status: "cancel" };

const $ = (id) => document.getElementById(id);

function showStatus(msg, isError = false) {
  const el = $("status");
  el.textContent = msg;
  el.className = "status" + (isError ? " error" : "");
  if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 2500);
}

function fmtTs(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString("th-TH", { hour12: false });
}

function fmtMtype(id) {
  return ({ "1":"1·เคลมสด","2":"2·เคลมแห้ง","3":"3·ติดตาม","4":"4·เจรจา" })[id] || (id || "");
}

function render() {
  const tbody = $("tbody");
  const empty = $("empty");
  tbody.innerHTML = "";
  const search = state.search.trim().toLowerCase();
  let shown = 0;
  for (const r of state.rows) {
    if (search) {
      const hay = [r.province_name, r.amphur_name, r.tumbon_name, r.surveyor_name, r.oss_company,
                   r.claim_no, r.survey_no, r.province_id, r.amphur_id, r.tumbon_id]
        .filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(search)) continue;
    }
    shown++;
    // surveyor cell: OSS_company มีค่า → แสดง OSS + tag; ไม่งั้นแสดง SE + tag
    const surveyorCell = r.oss_company
      ? `${r.oss_company} <small>(OSS)</small>`
      : `${r.surveyor_name || ""}${r.is_se ? " <small>(SE)</small>" : ""}`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="timestamp">${fmtTs(r.ts)}</td>
      <td>${r.claim_no  || ""}</td>
      <td>${r.survey_no || ""}</td>
      <td>${r.province_name || r.province_id || ""}</td>
      <td>${r.amphur_name   || r.amphur_id   || ""}</td>
      <td>${r.tumbon_name   || r.tumbon_id   || ""}</td>
      <td>${fmtMtype(r.mtype_id)}</td>
      <td>${surveyorCell}</td>
      <td>${r.inspector_name || ""}</td>
      ${ADMIN_MODE ? `<td class="actions"><button class="btn btn-icon btn-danger" data-id="${r.id}">ลบ</button></td>` : ""}`;
    tbody.appendChild(tr);
  }
  empty.classList.toggle("hidden", shown > 0);
  $("count").textContent = `แสดง ${shown} / ${state.total}`;
  const start = state.offset + 1;
  const end   = state.offset + state.rows.length;
  $("page-info").textContent = state.total ? `${start}–${end} จาก ${state.total}` : "0";
  $("prev").disabled = state.offset <= 0;
  $("next").disabled = end >= state.total;
}

async function load() {
  try {
    const res = await api.captures.list({
      limit: PAGE_SIZE,
      offset: state.offset,
      provinceId: state.provinceId || undefined,
      status: state.status,
    });
    state.rows = res.rows;
    state.total = res.total;
    render();
  } catch (e) { showStatus(e.message, true); }
}

async function setupFilter() {
  try {
    const ref = await api.reference();
    const sel = $("filter-province");
    for (const p of ref.provinces) {
      const opt = document.createElement("option");
      opt.value = p.provinceID;
      opt.textContent = `${p.provinceID} ${p.provincename}`;
      sel.appendChild(opt);
    }
  } catch (e) { showStatus(e.message, true); }
}

function applyMode() {
  const navPub = document.getElementById("nav-public");
  const navAdm = document.getElementById("nav-admin");
  if (ADMIN_MODE) {
    document.title = "SE-Billing — เคลมยกเลิก (Admin)";
    if (navPub) navPub.classList.add("hidden");
    if (navAdm) navAdm.classList.remove("hidden");
    document.body.classList.add("admin-mode");
  } else {
    if (navAdm) navAdm.classList.add("hidden");
    document.querySelectorAll(".admin-only").forEach(el => el.style.display = "none");
    document.body.classList.add("public-mode");
  }
}

async function main() {
  applyMode();
  await setupFilter();
  await load();
  $("search").addEventListener("input", (e) => { state.search = e.target.value; render(); });
  $("filter-province").addEventListener("change", (e) => {
    state.provinceId = e.target.value || null;
    state.offset = 0;
    load();
  });
  $("prev").addEventListener("click", () => {
    state.offset = Math.max(0, state.offset - PAGE_SIZE);
    load();
  });
  $("next").addEventListener("click", () => {
    if (state.offset + PAGE_SIZE < state.total) {
      state.offset += PAGE_SIZE;
      load();
    }
  });
  $("btn-refresh").addEventListener("click", load);
  $("btn-export").addEventListener("click", async () => {
    try { await api.captures.xlsxDownload({ provinceId: state.provinceId || undefined, status: state.status }); }
    catch (e) { showStatus("Export ล้มเหลว: " + (e.message || e), true); }
  });

  if (ADMIN_MODE) {
    $("btn-clear").addEventListener("click", async () => {
      if (!confirm("ลบ captures ทั้งหมด (รวม close + cancel)?")) return;
      try { await api.captures.clear(); state.offset = 0; await load(); showStatus("ล้างแล้ว"); }
      catch (e) { showStatus(e.message, true); }
    });
    $("tbody").addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-id]");
      if (!btn) return;
      if (!confirm("ลบรายการนี้?")) return;
      try { await api.captures.remove(btn.dataset.id); await load(); }
      catch (e) { showStatus(e.message, true); }
    });
  }
}

main();
