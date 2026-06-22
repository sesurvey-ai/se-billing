/**
 * popup.js — Per-user province preference UI
 *
 * คลิก extension icon → popup เด้ง → user ติ๊กเลือกจังหวัดที่ใช้งานประจำ
 * บันทึกใน chrome.storage.local key "userProvincePreferences" (string[])
 *
 * loader.js ฟัง chrome.storage.onChanged → re-broadcast config →
 * content.js apply filter ที่ Ext combobox tab1_survey_provinceID
 *
 * Empty array [] = ไม่กรอง = แสดงครบ 77 จังหวัด
 */
(function () {
  "use strict";

  const STORAGE_KEY = "userProvincePreferences";

  const $ = (sel) => document.querySelector(sel);
  const list   = $("#list");
  const search = $("#search");
  const count  = $("#count");
  const total  = $("#total");
  const status = $("#status");

  let provinces = [];     // [{ provinceID, provincename }, ...]
  let selected  = new Set();

  async function loadProvinces() {
    const url = chrome.runtime.getURL("data/provinces.json");
    const res = await fetch(url);
    const json = await res.json();
    provinces = (json.data || []).slice().sort((a, b) =>
      String(a.provincename).localeCompare(String(b.provincename), "th")
    );
    total.textContent = provinces.length;
  }

  async function loadSelected() {
    const obj = await chrome.storage.local.get(STORAGE_KEY);
    const arr = obj[STORAGE_KEY] || [];
    selected = new Set(arr.map(String));
  }

  async function saveSelected() {
    const arr = Array.from(selected).sort();
    await chrome.storage.local.set({ [STORAGE_KEY]: arr });
    flashStatus(arr.length === 0
      ? "บันทึก: ไม่กรอง (แสดงครบ 77 จังหวัด)"
      : `บันทึก: เลือก ${arr.length} จังหวัด`);
  }

  function flashStatus(msg) {
    status.textContent = msg;
    status.classList.remove("error");
    clearTimeout(flashStatus._t);
    flashStatus._t = setTimeout(() => {
      status.textContent = "เปลี่ยนแปลงมีผลทันที — เลือก 0 = แสดงทั้ง 77 จังหวัด";
    }, 1800);
  }

  function render() {
    list.innerHTML = "";
    for (const p of provinces) {
      const id = String(p.provinceID);
      const label = document.createElement("label");
      label.dataset.search = (p.provincename + " " + id).toLowerCase();
      label.innerHTML =
        `<input type="checkbox" data-id="${id}" ${selected.has(id) ? "checked" : ""} />` +
        `<span class="pid">${id}</span>` +
        `<span class="pname">${p.provincename}</span>`;
      list.appendChild(label);
    }
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener("change", onToggle);
    });
    updateCount();
  }

  function updateCount() { count.textContent = selected.size; }

  async function onToggle(ev) {
    const id = ev.target.dataset.id;
    if (ev.target.checked) selected.add(id);
    else selected.delete(id);
    updateCount();
    await saveSelected();
  }

  function applySearch() {
    const q = (search.value || "").trim().toLowerCase();
    list.querySelectorAll("label").forEach(el => {
      const match = !q || el.dataset.search.includes(q);
      el.classList.toggle("hidden", !match);
    });
  }

  async function selectAll() {
    selected = new Set(provinces.map(p => String(p.provinceID)));
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = true; });
    updateCount();
    await saveSelected();
  }

  async function clearAll() {
    selected.clear();
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
    updateCount();
    await saveSelected();
  }

  async function init() {
    try {
      await Promise.all([loadProvinces(), loadSelected()]);
      render();
    } catch (e) {
      status.textContent = "Error: " + (e.message || e);
      status.classList.add("error");
      return;
    }
    search.addEventListener("input", applySearch);
    $("#select-all").addEventListener("click", selectAll);
    $("#clear-all").addEventListener("click", clearAll);
  }

  document.addEventListener("DOMContentLoaded", init);
})();

/**
 * Dashboard tab — แสดง "งานค้าง" ต่อหัวหน้า (extenBoard)
 * อ่าน snapshot จาก background ("dashboard-data" → GET /api/dashboard) +
 * ชื่อหัวหน้าที่ dashboard-badge.js เก็บไว้ใน chrome.storage ("supervisor")
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const HDR = { prov: "เลือกจังหวัดที่ใช้งานประจำ", dash: "งานค้าง" };
  let dashLoaded = false;
  function switchTab(name) {
    document.querySelectorAll(".tabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".tabpane").forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
    $("hdr-title").textContent = HDR[name] || "";
    $("hdr-counter").style.display = name === "prov" ? "" : "none";
    if (name === "dash" && !dashLoaded) { dashLoaded = true; loadDashboard(); }
  }
  document.querySelectorAll(".tabs .tab").forEach((t) =>
    t.addEventListener("click", () => switchTab(t.dataset.tab)));

  // ── Helpers ───────────────────────────────────────────────────────────────
  function norm(s) {
    return String(s || "")
      .replace(/^\s*Hi,\s*/, "")
      .replace(/^(นางสาว|นาง|นาย|น\.ส\.|คุณ)\s*/, "")
      .replace(/\s+/g, "");
  }
  const ADMIN_NORM = norm("นพดล สมบูรณ์กุล");
  function esc(s) { const d = document.createElement("div"); d.textContent = (s == null ? "" : String(s)); return d.innerHTML; }
  function fmtWhen(iso) { if (!iso) return "-"; try { return new Date(iso).toLocaleString("th-TH"); } catch (e) { return iso; } }
  function sendBg(type) {
    return new Promise((res) => {
      try {
        chrome.runtime.sendMessage({ type }, (r) => {
          if (chrome.runtime.lastError) res({ ok: false, error: chrome.runtime.lastError.message });
          else res(r || { ok: false, error: "no response" });
        });
      } catch (e) { res({ ok: false, error: String(e) }); }
    });
  }
  const getStore = (keys) => new Promise((r) => chrome.storage.local.get(keys, r));
  const setStore = (obj) => new Promise((r) => chrome.storage.local.set(obj, r));

  // ── Sorting (คลิกหัวคอลัมน์เพื่อเรียง — เหมือนแผงบนหน้าเว็บ) ─────────────────
  let dashSort = { key: "aging", dir: "desc" };   // เริ่มต้น: อายุมาก->น้อย
  function numOrStr(s) { const t = String(s == null ? "" : s).trim(); return (t !== "" && /^\d+$/.test(t)) ? Number(t) : t; }
  const THAI_MONTHS = { "ม.ค.": 1, "ก.พ.": 2, "มี.ค.": 3, "เม.ย.": 4, "พ.ค.": 5, "มิ.ย.": 6, "ก.ค.": 7, "ส.ค.": 8, "ก.ย.": 9, "ต.ค.": 10, "พ.ย.": 11, "ธ.ค.": 12 };
  function thaiDateVal(s) {   // "15/ต.ค./2567 09:49" (พ.ศ.) -> YYYYMMDDHHmm (ค.ศ.) สำหรับเทียบลำดับ
    const m = String(s == null ? "" : s).trim().match(/^(\d{1,2})\/([^/]+)\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (!m) return 0;
    const mon = THAI_MONTHS[m[2].trim()] || 0;
    return ((((+m[3] - 543) * 100 + mon) * 100 + (+m[1])) * 10000) + (+(m[4] || 0)) * 100 + (+(m[5] || 0));
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function statusCardsHtml(s) {
    return Object.entries(s.isurvey_by_status || {})
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<div class="scard clk" data-view="status:${esc(k)}"><div class="snum">${v}</div><div class="slbl">${esc(k)}</div></div>`)
      .join("") || '<span class="muted">—</span>';
  }
  function drawTable(s, view) {
    document.querySelectorAll("#dash-content .clk").forEach((el) => el.classList.toggle("active", el.dataset.view === view));
    let items = [], col2 = "สถานะ", title = "งานค้าง isurvey", isDate = false;
    if (view === "isurvey") {
      items = s.isurvey_items || [];
    } else if (view.indexOf("status:") === 0) {
      const st = view.slice(7); title = st;
      items = (s.isurvey_items || []).filter((it) => it.status === st);
    } else if (view === "emcs_continuous" || view === "emcs_edit") {
      col2 = "วันที่"; isDate = true; title = view === "emcs_edit" ? "งานแก้ไข emcs" : "งานต่อเนื่อง emcs";
      items = s[view + "_items"] || [];
    }
    const rows = items.map((it) => ({ c: it.claim_no, l: isDate ? (it.date || "") : it.status, a: it.aging_days }));

    // เรียงตามคอลัมน์ที่เลือก: claim=เลข, col2=ข้อความ/วันที่(ตาม view), aging=เลข
    const sv = {
      claim: (r) => numOrStr(r.c),
      col2:  (r) => isDate ? thaiDateVal(r.l) : String(r.l || ""),
      aging: (r) => { const n = Number(r.a); return Number.isFinite(n) ? n : 0; },
    };
    const f = sv[dashSort.key] || sv.aging;
    rows.sort((x, y) => {
      const a = f(x), b = f(y);
      let r = (typeof a === "number" && typeof b === "number") ? (a - b) : String(a).localeCompare(String(b), "th");
      if (r === 0) { const ca = numOrStr(x.c), cb = numOrStr(y.c); r = (typeof ca === "number" && typeof cb === "number") ? (ca - cb) : String(ca).localeCompare(String(cb)); }
      return dashSort.dir === "asc" ? r : -r;
    });

    const tbox = $("dash-tablebox");
    if (!rows.length) {
      const hint = view.indexOf("emcs") === 0 ? " (รัน scraper ใหม่เพื่อเก็บรายเคลม emcs)" : "";
      tbox.innerHTML = `<div class="section"><div class="h">${esc(title)}</div><div class="muted" style="padding:8px 2px">— ไม่มีรายการ${hint} —</div></div>`;
      return;
    }
    const shown = rows.slice(0, 40);
    const trs = shown.map((r) => `<tr><td>${esc(r.c)}</td><td>${esc(r.l)}</td><td class="r">${r.a == null ? "-" : esc(r.a) + " วัน"}</td></tr>`).join("");
    const more = rows.length > 40 ? `<div class="muted" style="padding:6px 2px;font-size:11px">…และอีก ${rows.length - 40} รายการ</div>` : "";
    const arrow = (k) => dashSort.key === k ? (dashSort.dir === "asc" ? " ▲" : " ▼") : "";
    tbox.innerHTML = `<div class="section"><div class="h">${esc(title)} (${rows.length})</div>
      <table class="tbl"><thead><tr>
        <th data-sortkey="claim" style="cursor:pointer;user-select:none;white-space:nowrap">เลขเคลม${arrow("claim")}</th>
        <th data-sortkey="col2" style="cursor:pointer;user-select:none;white-space:nowrap">${esc(col2)}${arrow("col2")}</th>
        <th data-sortkey="aging" class="r" style="cursor:pointer;user-select:none;white-space:nowrap">อายุ${arrow("aging")}</th>
      </tr></thead><tbody>${trs}</tbody></table>${more}</div>`;
    tbox.querySelectorAll("th[data-sortkey]").forEach((th) => {
      th.onclick = () => {
        const k = th.getAttribute("data-sortkey");
        if (dashSort.key === k) dashSort.dir = dashSort.dir === "asc" ? "desc" : "asc";
        else dashSort = { key: k, dir: k === "aging" ? "desc" : "asc" };
        drawTable(s, view);
      };
    });
  }
  function drawSupervisor(data, name) {
    const s = (data.supervisors || []).find((x) => x.name === name);
    const c = $("dash-body");
    if (!s) { c.innerHTML = '<div class="empty muted">ไม่พบข้อมูลของหัวหน้าคนนี้</div>'; return; }
    c.innerHTML = `
      <div class="cards">
        <div class="card big clk" data-view="isurvey"><div class="num">${s.isurvey_backlog || 0}</div><div class="lbl">งานค้าง isurvey</div></div>
        <div class="card clk" data-view="emcs_continuous"><div class="num">${s.emcs_continuous || 0}</div><div class="lbl">งานต่อเนื่อง emcs</div></div>
        <div class="card clk" data-view="emcs_edit"><div class="num">${s.emcs_edit || 0}</div><div class="lbl">งานแก้ไข emcs</div></div>
      </div>
      <div class="section"><div class="h">แยกตามสถานะ (isurvey) — กดเพื่อกรอง</div><div class="sgrid">${statusCardsHtml(s)}</div></div>
      <div id="dash-tablebox"></div>`;
    c.querySelectorAll(".clk").forEach((el) => { el.onclick = () => drawTable(s, el.dataset.view); });
    drawTable(s, "isurvey");
  }
  function render(data, selected, showAll, lockedLabel) {
    const sups = data.supervisors || [];
    const supbar = $("dash-supbar");
    if (showAll) {
      const opts = sups.map((s) => `<option value="${esc(s.name)}"${s.name === selected ? " selected" : ""}>${esc(s.name)}</option>`).join("");
      supbar.innerHTML = `<select id="dash-supSel">${opts}</select>`;
      $("dash-supSel").onchange = async (e) => { await setStore({ override: e.target.value }); drawSupervisor(data, e.target.value); };
    } else {
      supbar.innerHTML = `<div class="locked">${esc(lockedLabel || selected || "—")}</div>`;
    }
    $("dash-content").innerHTML = '<div id="dash-body"></div>';
    drawSupervisor(data, selected);
    const t = data.totals || {};
    $("dash-meta").innerHTML = `อัปเดต: ${esc(fmtWhen(data.generated_at))}` +
      (showAll ? `<br>รวมทั้งบริษัท — ค้าง ${t.isurvey_backlog || 0} · ต่อเนื่อง ${t.emcs_continuous || 0} · แก้ไข ${t.emcs_edit || 0}` : "");
  }
  function errMsg(raw) {
    const e = String(raw || "");
    if (/404/.test(e)) return "ยังไม่มีข้อมูลบนเซิร์ฟเวอร์ — scraper ยังไม่ได้อัป";
    if (/401/.test(e)) return "API token ไม่ถูกต้อง/ยังไม่ได้ตั้ง (ดูที่ Options ของ extension)";
    return "ดึงข้อมูลไม่ได้: " + e;
  }
  async function loadDashboard() {
    $("dash-content").innerHTML = '<div class="hint">กำลังโหลด…</div>';
    $("dash-meta").textContent = "";
    const r = await sendBg("dashboard-data");
    if (!r.ok) {
      $("dash-content").innerHTML = `<div class="err">${esc(errMsg(r.error))}</div>`;
      $("dash-supbar").innerHTML = "";
      return;
    }
    const data = r.data || {};
    const sups = data.supervisors || [];
    const st = await getStore(["supervisor", "override"]);
    const detNorm = st.supervisor && st.supervisor.norm;
    const detDisplay = (st.supervisor && st.supervisor.display) || "";
    const isAdmin = detNorm === ADMIN_NORM;
    const showAll = isAdmin || !detNorm;   // admin (นพดล) หรือยังตรวจชื่อไม่ได้ -> เลือกได้ทุกคน; ไม่งั้นล็อกของตัวเอง
    if (showAll) {
      const selected = (st.override && sups.some((s) => s.name === st.override)) ? st.override : (sups[0] && sups[0].name);
      render(data, selected, true, null);
    } else {
      const m = sups.find((s) => norm(s.name) === detNorm);
      render(data, m ? m.name : null, false, detDisplay);
    }
  }

  const refreshBtn = $("dash-refresh");
  if (refreshBtn) refreshBtn.addEventListener("click", loadDashboard);

  // เปิด popup มาที่แท็บ "งานค้าง" เป็นค่าเริ่มต้น (โหลดข้อมูลทันที)
  switchTab("dash");
})();
