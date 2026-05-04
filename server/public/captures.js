// captures.js — list / filter / paginate captured records
//   Admin mode (URL = /admin/captures): show delete buttons + clear all + hide public nav
//   Public mode (URL = /captures): read-only, no delete UI
"use strict";

const ADMIN_MODE = window.location.pathname.startsWith("/admin");
const PAGE_SIZE = 100;
const state = { offset: 0, total: 0, rows: [], provinceId: null, search: "" };

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
      const hay = [r.province_name, r.amphur_name, r.tumbon_name, r.surveyor_name, r.province_id, r.amphur_id, r.tumbon_id]
        .filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(search)) continue;
    }
    shown++;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="timestamp">${fmtTs(r.ts)}</td>
      <td>${r.province_name || r.province_id || ""}</td>
      <td>${r.amphur_name   || r.amphur_id   || ""}</td>
      <td>${r.tumbon_name   || r.tumbon_id   || ""}</td>
      <td>${fmtMtype(r.mtype_id)}</td>
      <td>${r.surveyor_name || ""}${r.is_se ? " <small>(SE)</small>" : ""}</td>
      <td>${r.inspector_name || ""}</td>
      <td class="numeric">${r.sur_invest ?? ""}</td>
      <td class="numeric">${r.ins_invest ?? ""}</td>
      <td class="numeric">${r.ins_trans ?? ""}</td>
      <td class="numeric">${r.ins_photo ?? ""}</td>
      <td>${r.out_of_area  ? `<span class="amount-pos">+${r.out_of_area_amt  ?? 0}</span>` : ""}</td>
      <td>${r.out_of_hours ? `<span class="amount-pos">+${r.out_of_hours_amt ?? 0}</span>` : ""}</td>
      <td class="numeric">${r.deduct_amt ? `<span class="amount-neg">-${r.deduct_amt}</span>` : ""}</td>
      <td>${r.late_submit ? "✓" : ""}</td>
      <td>${r.incomplete_docs ? "✓" : ""}</td>
      <td class="numeric"><strong>${
        // sur_invest ที่บันทึกแล้ว = base + outOfArea + outOfHours − deduct
        // (extension หักไว้ก่อน setValue) — ดังนั้นรวม 4 ช่องนี้ = ยอดสุทธิหลังหักเงิน
        (Number(r.sur_invest) || 0) + (Number(r.ins_invest) || 0) +
        (Number(r.ins_trans)  || 0) + (Number(r.ins_photo)  || 0)
      }</strong></td>
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
  // ADMIN_MODE: แสดง nav-admin (Rates / Captures) + ซ่อน nav-public
  // PUBLIC:    แสดง nav-public (Viewer / Captures) + ซ่อน admin-only elements
  const navPub = document.getElementById("nav-public");
  const navAdm = document.getElementById("nav-admin");
  if (ADMIN_MODE) {
    document.title = "I Survey Helper — รายละเอียด (Admin)";
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

  $("btn-export").addEventListener("click", () => {
    window.location.href = api.captures.xlsxUrl({ provinceId: state.provinceId || undefined });
  });

  if (ADMIN_MODE) {
    $("btn-clear").addEventListener("click", async () => {
      if (!confirm("ลบ captures ทั้งหมด?")) return;
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
