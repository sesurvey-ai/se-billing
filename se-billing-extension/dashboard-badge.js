// dashboard-badge.js — extenBoard "งานค้าง" badge on cloud.isurvey.mobi
// (merged into SE-Billing extension; runs in the ISOLATED world so chrome.* APIs are available)
//
// 1) อ่านชื่อหัวหน้าที่ล็อกอินจาก header (#main-tab_header-title-textEl) เก็บไว้ให้ popup (แท็บงานค้าง) ใช้
// 2) แปะ "ตัวเลขงานค้าง" (งานค้าง isurvey / งานแก้ไข / งานต่อเนื่อง) ไว้ "หน้าชื่อ" บนแถบหัวของหน้า isurvey
//    ตามชื่อหัวหน้าที่ล็อกอิน — ข้อมูลขอจาก service worker (background.js → GET /api/dashboard)
// 3) คลิก pill ตัวเลข -> เปิดแผงลอยแสดง "รายการเลขเคลม" (เหมือนตารางใน popup) บนหน้า isurvey เลย
//
// หมายเหตุดีไซน์ (ผ่านการ review): ป้ายแปะที่ document.body แบบ position:fixed แล้ว "วาง" ให้อยู่
// ซ้ายมือของชื่อด้วย getBoundingClientRect ของ title — ไม่ฝังลงใน ExtJS header (กัน ExtJS re-render
// ลบป้ายทิ้ง/ทับของเดิมฝั่งซ้ายของแถบ) และ memoize ไม่ให้เขียน DOM ซ้ำเมื่อค่าไม่เปลี่ยน
(function () {
  function norm(s) {
    return String(s || "")
      .replace(/^\s*Hi,\s*/, "")
      .replace(/^(นางสาว|นาง|นาย|น\.ส\.|คุณ)\s*/, "")
      .replace(/\s+/g, "");
  }
  const TITLE_ID = "main-tab_header-title-textEl";

  // ── หา element ที่แสดงชื่อผู้ล็อกอิน ──────────────────────
  //   เว็บเก่า (ExtJS): <div id="main-tab_header-title-textEl">Hi, นายนพดล ...</div>
  //   เว็บใหม่ (MUI)  : <span class="MuiChip-label">นายนพดล สมบูรณ์กุล</span>  (ไม่มี id)
  //   ไฟล์นี้รันใน ISOLATED world จึงเรียก SEResolve (MAIN world) ไม่ได้ ต้องหาเอง
  const NAME_RE = /^\s*(Hi,\s*)?(นางสาว|นาง|นาย|น\.ส\.|คุณ)\s*\S/;
  let _titleCache = null;

  // ตัวบอกเวอร์ชัน — อ่านได้จาก console: document.documentElement.dataset.seBadge
  try { document.documentElement.dataset.seBadge = "2.11.0-b5"; } catch (e) {}

  function titleEl() {
    const byId = document.getElementById(TITLE_ID);
    if (byId) { _titleCache = null; return byId; }
    if (_titleCache && _titleCache.isConnected) return _titleCache;
    // เว็บใหม่: หา chip/ข้อความสั้นที่ขึ้นต้นด้วยคำนำหน้าชื่อไทย
    const cands = document.querySelectorAll(".MuiChip-label, header span, nav span, [class*='userName'], [class*='UserName']");
    for (let i = 0; i < cands.length; i++) {
      const t = (cands[i].textContent || "").trim();
      if (t.length <= 40 && NAME_RE.test(t)) { _titleCache = cands[i]; return cands[i]; }
    }
    return null;
  }

  // admins[] + aliases{} มาจาก payload /api/dashboard (config-driven ที่ /admin)
  //   admins  = ชื่อหัวหน้าที่เห็นยอดรวมทั้งบริษัท ; fallback = [นพดล] (คงพฤติกรรมเดิม)
  //   aliases = { ชื่อตอน login : ชื่อใน snapshot } — map ชื่อ login → bucket ที่ถูกต้อง
  const DEFAULT_ADMINS = ["นพดล สมบูรณ์กุล"];
  function adminNormSet(data) {
    const arr = (data && Array.isArray(data.admins)) ? data.admins : DEFAULT_ADMINS;
    return new Set(arr.map(norm));
  }
  function resolveAlias(data, n) {
    const al = (data && data.aliases) || null;
    if (al) for (const k in al) { if (norm(k) === n) return norm(al[k]); }
    return n;
  }

  let lastNorm = null;     // กันเขียน storage ซ้ำ
  let curNorm = null;      // ชื่อ (normalized) ที่กำลังแสดงบน header ตอนนี้
  let cache = null;        // snapshot ล่าสุดจาก VPS
  let lastHtml = null;     // memoize: เขียน innerHTML เฉพาะตอนค่าจริง ๆ เปลี่ยน

  // ---- หาตัวเลขของหัวหน้าคนปัจจุบันจาก snapshot (coerce เป็นจำนวนเสมอ กัน HTML แปลกปลอม) ----
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function pickCounts(data) {
    const sups = (data && data.supervisors) || [];
    const eff = resolveAlias(data, curNorm);   // ชื่อ login → ชื่อ snapshot (ถ้ามี alias)
    const s = sups.find((x) => norm(x.name) === eff);
    if (s) {
      return { backlog: num(s.isurvey_backlog), edit: num(s.emcs_edit), cont: num(s.emcs_continuous), tag: null };
    }
    if (adminNormSet(data).has(curNorm)) {
      const t = (data && data.totals) || {};
      return { backlog: num(t.isurvey_backlog), edit: num(t.emcs_edit), cont: num(t.emcs_continuous), tag: "ทั้งบริษัท" };
    }
    return null; // ชื่อไม่อยู่ใน mapping และไม่ใช่ admin -> ไม่แสดง
  }

  // ---- แผงลอยรายการเลขเคลม (รูปแบบเดียวกับตารางใน popup) เปิดเมื่อกด pill ----
  function esc(s) { const d = document.createElement("div"); d.textContent = (s == null ? "" : String(s)); return d.innerHTML; }
  let panelView = null;   // null = ปิด ; ไม่งั้นเป็น "backlog" | "edit" | "cont"
  let panelSort = { key: "aging", dir: "desc" };   // เริ่มต้น: เรียงตามอายุมาก->น้อย

  // เลขเคลมเป็นตัวเลขล้วน -> เทียบเชิงตัวเลข ; อื่น ๆ เทียบเป็นสตริง
  function numOrStr(s) { const t = String(s == null ? "" : s).trim(); return (t !== "" && /^\d+$/.test(t)) ? Number(t) : t; }
  // วันที่ emcs = "15/ต.ค./2567 09:49" (พ.ศ.) -> ตัวเลขเทียบลำดับ YYYYMMDDHHmm (ค.ศ.)
  const THAI_MONTHS = { "ม.ค.": 1, "ก.พ.": 2, "มี.ค.": 3, "เม.ย.": 4, "พ.ค.": 5, "มิ.ย.": 6, "ก.ค.": 7, "ส.ค.": 8, "ก.ย.": 9, "ต.ค.": 10, "พ.ย.": 11, "ธ.ค.": 12 };
  function thaiDateVal(s) {
    const m = String(s == null ? "" : s).trim().match(/^(\d{1,2})\/([^/]+)\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (!m) return 0;
    const mon = THAI_MONTHS[m[2].trim()] || 0;
    return ((((+m[3] - 543) * 100 + mon) * 100 + (+m[1])) * 10000) + (+(m[4] || 0)) * 100 + (+(m[5] || 0));
  }

  // นิยามคอลัมน์: get=ค่าที่แสดง, sv=ค่าที่ใช้เรียง
  const COL_CLAIM  = { key: "claim",  label: "เลขเคลม", get: (it) => it.claim_no,   sv: (it) => numOrStr(it.claim_no) };
  const COL_STATUS = { key: "status", label: "สถานะ",  get: (it) => it.status,     sv: (it) => String(it.status || "") };
  const COL_DATE   = { key: "date",   label: "วันที่",  get: (it) => it.date,       sv: (it) => thaiDateVal(it.date) };
  const COL_AGING  = { key: "aging",  label: "อายุ", align: "right", aging: true, get: (it) => it.aging_days, sv: (it) => num(it.aging_days) };
  const VIEW_META = {
    backlog: { key: "isurvey_items",        title: "งานค้าง isurvey",  cols: [COL_CLAIM, COL_STATUS, COL_AGING] },
    edit:    { key: "emcs_edit_items",       title: "งานแก้ไข emcs",   cols: [COL_CLAIM, COL_DATE, COL_AGING] },
    cont:    { key: "emcs_continuous_items", title: "งานต่อเนื่อง emcs", cols: [COL_CLAIM, COL_DATE, COL_AGING] },
  };

  function cmpBy(a, b, col, dir) {
    const va = col.sv(a), vb = col.sv(b);
    let r = (typeof va === "number" && typeof vb === "number") ? (va - vb) : String(va).localeCompare(String(vb), "th");
    if (r === 0) {  // tie-break ด้วยเลขเคลม (คงลำดับให้นิ่ง)
      const ca = numOrStr(a.claim_no), cb = numOrStr(b.claim_no);
      r = (typeof ca === "number" && typeof cb === "number") ? (ca - cb) : String(ca).localeCompare(String(cb));
    }
    return dir === "asc" ? r : -r;
  }

  function collectItems(key) {
    const sups = (cache && cache.supervisors) || [];
    const eff = resolveAlias(cache, curNorm);
    const own = sups.find((x) => norm(x.name) === eff);
    const list = own ? [own] : (adminNormSet(cache).has(curNorm) ? sups : []); // admin -> รวมทุกหัวหน้า
    const rows = [];
    list.forEach((s) => (s[key] || []).forEach((it) => rows.push(it)));
    return rows;
  }

  function panelEl() {
    let p = document.getElementById("extenboard-panel");
    if (p) return p;
    p = document.createElement("div");
    p.id = "extenboard-panel";
    p.style.cssText =
      "position:fixed;z-index:2147483001;top:46px;right:12px;width:430px;max-width:92vw;max-height:74vh;" +
      "overflow:auto;background:#0e2233;border:1px solid #2b4d68;border-radius:10px;" +
      "box-shadow:0 12px 34px rgba(0,0,0,.5);font-family:'Segoe UI',Tahoma,sans-serif;color:#e6eef6;display:none;";
    p.addEventListener("click", (e) => {
      // คลิกในแผงไม่ต้องให้ listener "คลิกนอกแผง" ทำงาน (กัน race: re-render ถอด target ออกจาก DOM
      // แล้ว document handler เช็ค closest() ไม่เจอ เลยนึกว่าคลิกนอกแผง -> ปิดแผงผิด)
      e.stopPropagation();
      if (e.target.closest("#extenboard-panel-x")) { panelView = null; renderPanel(); return; }
      const th = e.target.closest("th[data-sortkey]");
      if (th) {
        const k = th.getAttribute("data-sortkey");
        if (panelSort.key === k) panelSort.dir = panelSort.dir === "asc" ? "desc" : "asc";
        else panelSort = { key: k, dir: k === "aging" ? "desc" : "asc" }; // อายุเริ่มจากมาก, อื่น ๆ เริ่มจากน้อย/ก-ฮ
        renderPanel();
      }
    });
    document.body.appendChild(p);
    return p;
  }

  function renderPanel() {
    const p = panelEl();
    if (!panelView || !cache) { p.style.display = "none"; return; }
    const m = VIEW_META[panelView];
    const cols = m.cols;
    // หา column ที่ใช้เรียง (ถ้า key ไม่อยู่ใน view นี้ เช่นสลับจาก สถานะ/วันที่ -> กลับไป default อายุมาก->น้อย)
    let col = cols.find((c) => c.key === panelSort.key);
    if (!col) { panelSort = { key: "aging", dir: "desc" }; col = cols.find((c) => c.key === "aging"); }
    const items = collectItems(m.key).slice().sort((a, b) => cmpBy(a, b, col, panelSort.dir));
    const CAP = 100;
    const td = "padding:5px 10px;border-top:1px solid #1c3a52";
    const trs = items.slice(0, CAP).map((it) =>
      "<tr>" + cols.map((c) => {
        const raw = c.get(it);
        const txt = c.aging ? (raw == null ? "-" : esc(raw) + " วัน") : esc(raw == null ? "" : raw);
        return `<td style="${td}${c.align === "right" ? ";text-align:right;white-space:nowrap" : ""}">${txt}</td>`;
      }).join("") + "</tr>"
    ).join("");
    const more = items.length > CAP ? `<div style="padding:8px 10px;color:#8fa9bf;font-size:11px">…และอีก ${items.length - CAP} รายการ</div>` : "";
    const ths = cols.map((c) => {
      const arrow = c.key === panelSort.key ? (panelSort.dir === "asc" ? " ▲" : " ▼") : "";
      return `<th data-sortkey="${c.key}" title="คลิกเพื่อเรียง" style="padding:6px 10px;cursor:pointer;user-select:none;white-space:nowrap${c.align === "right" ? ";text-align:right" : ""}">${esc(c.label)}${arrow}</th>`;
    }).join("");
    const body = items.length
      ? `<table style="width:100%;border-collapse:collapse;font-size:12px">
           <thead><tr style="color:#9bb4c9;text-align:left">${ths}</tr></thead>
           <tbody>${trs}</tbody></table>${more}`
      : `<div style="padding:16px 10px;color:#8fa9bf">— ไม่มีรายการ —</div>`;
    p.innerHTML =
      `<div style="position:sticky;top:0;background:#103047;display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-bottom:1px solid #2b4d68">
         <div style="font-weight:700;font-size:13px">${esc(m.title)} <span style="color:#9bb4c9;font-weight:400">(${items.length})</span></div>
         <div id="extenboard-panel-x" title="ปิด" style="cursor:pointer;font-size:18px;line-height:1;color:#9bb4c9;padding:0 6px">×</div>
       </div>${body}`;
    p.style.display = "block";
  }

  // ---- สร้าง/หา element ป้าย (อยู่บน document.body, fixed) ----
  function badgeEl() {
    let b = document.getElementById("extenboard-badge");
    if (b) return b;
    b = document.createElement("div");
    b.id = "extenboard-badge";
    b.style.cssText =
      "position:fixed;z-index:2147483000;display:flex;align-items:center;gap:8px;" +
      "pointer-events:none;font-family:'Segoe UI',Tahoma,sans-serif;";
    // แต่ละ pill ตั้ง pointer-events:auto — คลิก pill จะ bubble มาที่ b (delegation นี้อยู่รอด innerHTML re-render)
    b.addEventListener("click", (e) => {
      const pill = e.target.closest("[data-ebview]");
      if (!pill) return;
      const v = pill.getAttribute("data-ebview");
      panelView = (panelView === v) ? null : v;   // กด pill เดิมซ้ำ = ปิดแผง
      renderPanel();
    });
    document.body.appendChild(b);
    lastHtml = null; // เพิ่งสร้างใหม่ -> บังคับวาดรอบหน้า
    return b;
  }

  // หา "ขอบซ้ายของตัวอักษรชื่อจริง"
  // ExtJS ทำ element ชื่อให้กว้างเกือบเต็มแถบ + จัดข้อความชิดขวา (ชื่อจึงไปจบที่ขอบขวาของ content box)
  // วัดขอบ/Range ตรง ๆ จะได้ความกว้างเต็มแถบ (ไม่ใช่ตำแหน่งตัวอักษร) -> ต้องวัดความกว้างข้อความเองด้วย canvas
  // verified สดบนหน้า isurvey จริง (main.php): rr.right = ที่ชื่อไปจบ, ชื่อเริ่ม = rr.right − ความกว้างข้อความ
  let _cv = null;
  function nameLeftX(title) {
    const rg = document.createRange();
    rg.selectNodeContents(title);
    const rr = rg.getBoundingClientRect();
    if (!rr.width && !rr.height) return null;

    // เว็บใหม่ (MUI chip) element กว้างพอดีข้อความอยู่แล้ว → ขอบซ้ายคือตำแหน่งชื่อจริง
    // ใช้ trick วัดด้วย canvas เฉพาะเว็บเก่า ที่ ExtJS ทำ element กว้างเต็มแถบแล้วชิดขวา
    if (title.id !== TITLE_ID) {
      return { left: rr.left, top: rr.top, height: rr.height };
    }

    const cs = getComputedStyle(title);
    if (!_cv) _cv = document.createElement("canvas").getContext("2d");
    _cv.font = cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
    const gw = _cv.measureText(title.textContent.trim()).width;
    return { left: rr.right - gw, top: rr.top, height: rr.height };
  }

  // ---- วางป้ายให้อยู่ "หน้าชื่อ" (ชิดซ้ายของตัวอักษรชื่อจริง) แบบไดนามิก ----
  /**
   * หา "ขอบซ้ายสุด" ของปุ่ม/ไอคอนบนแถบหัวที่อยู่แถวเดียวกับป้าย
   * เว็บใหม่มีปุ่มสลับธีมคั่นอยู่ระหว่างป้ายกับชื่อ ถ้าไม่หลบจะทับกัน
   * คืน Infinity ถ้าไม่เจออะไรกีดขวาง (เว็บเก่าเป็นแบบนั้น)
   */
  function obstacleLeft(badgeRect) {
    const scope = document.querySelector("header, .MuiAppBar-root, .x-toolbar") || document.body;
    let min = Infinity;
    const items = scope.querySelectorAll('button, [role="button"], .MuiIconButton-root, .MuiSwitch-root, a, svg');
    for (const el of items) {
      if (el.closest("#extenboard-badge") || el.closest("#extenboard-panel")) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      // เอาเฉพาะตัวที่อยู่แนวตั้งซ้อนกับป้าย และอยู่ทางขวาของขอบซ้ายป้าย
      const overlapsY = r.bottom > badgeRect.top && r.top < badgeRect.bottom;
      if (!overlapsY) continue;
      if (r.left < badgeRect.left) continue;
      if (r.left < min) min = r.left;
    }
    return min;
  }

  function positionBadge(b) {
    const title = titleEl();
    if (!title) return;
    const n = nameLeftX(title);
    if (!n) return;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    b.style.top = (n.top + n.height / 2) + "px";
    b.style.transform = "translateY(-50%)";
    b.style.left = "auto";
    b.style.right = (vw - n.left + 12) + "px"; // ขอบขวาของป้าย = ขอบซ้ายของชื่อ − 12px

    // หลบปุ่มบนแถบหัว (เว็บใหม่มีปุ่มสลับธีมคั่นอยู่) — ถ้าทับ ให้ขยับไปทางซ้ายอีก
    const r = b.getBoundingClientRect();
    if (!r.width) return;
    const block = obstacleLeft(r);
    if (block !== Infinity && r.right > block - 10) {
      b.style.right = (vw - block + 10) + "px";
    }
  }

  // ─────────────────────────────────────────────────────────
  // ชุดสี — เว็บเก่าแถบหัวสีเข้ม เว็บใหม่สีอ่อน ใช้ชุดเดียวกันไม่ได้
  //   วัดความสว่างของพื้นหลังที่ป้ายไปวางทับจริง แล้วเลือกชุดสีให้ตัดกัน
  // ─────────────────────────────────────────────────────────
  function bgLuminance(x, y) {
    const stack = document.elementsFromPoint(x, y) || [];
    for (const el of stack) {
      if (el.id === "extenboard-badge" || el.closest("#extenboard-badge")) continue;
      const bg = getComputedStyle(el).backgroundColor || "";
      const m = bg.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/);
      if (!m) continue;
      const a = m[4] === undefined ? 1 : parseFloat(m[4]);
      if (a < 0.5) continue;                       // โปร่งใส — ดูตัวถัดไป
      const [r, g, bl] = [+m[1], +m[2], +m[3]];
      return (0.2126 * r + 0.7152 * g + 0.0722 * bl) / 255;
    }
    return 0;                                      // หาไม่เจอ → ถือว่าพื้นเข้ม (พฤติกรรมเดิม)
  }

  let THEME = null;
  function refreshTheme(b) {
    const r = b.getBoundingClientRect();
    const light = bgLuminance(r.left + r.width / 2, r.top + r.height / 2) > 0.5;
    const t = light
      ? { pillBg: "rgba(21,101,192,.08)", label: "#1565c0", neutral: "#1565c0",
          warn: "#b45309", ok: "#15803d", tag: "#1565c0", border: "1px solid rgba(21,101,192,.25)" }
      : { pillBg: "rgba(255,255,255,.13)", label: "#cfe0ef", neutral: "#cfe0ef",
          warn: "#ffd479", ok: "#7fd18f", tag: "#9bb4c9", border: "1px solid transparent" };
    if (!THEME || THEME.label !== t.label) { THEME = t; lastHtml = null; }  // ธีมเปลี่ยน → วาดใหม่
    return THEME;
  }

  function pill(label, n, color, view) {
    const t = THEME || { pillBg: "rgba(255,255,255,.13)", label: "#cfe0ef", border: "1px solid transparent" };
    return (
      '<span data-ebview="' + view + '" title="คลิกเพื่อดูรายการเลขเคลม" ' +
      'style="display:inline-flex;align-items:center;gap:5px;background:' + t.pillBg + ";" +
      "border:" + t.border + ";" +
      'border-radius:11px;padding:2px 9px;line-height:1.5;white-space:nowrap;pointer-events:auto;cursor:pointer;">' +
      '<span style="font-size:11px;color:' + t.label + ';">' + label + "</span>" +
      '<span style="font-size:13px;font-weight:800;color:' + color + ';">' + n + "</span></span>"
    );
  }

  function renderBadge() {
    const title = titleEl();
    if (!title) return; // header ยังไม่พร้อม
    const b = badgeEl();
    positionBadge(b);              // ต้องวางก่อน เพื่อวัดสีพื้นหลังตรงตำแหน่งจริง
    const t = refreshTheme(b);
    let html = "";
    if (cache) {
      const c = pickCounts(cache);
      if (c) {
        html =
          (c.tag ? '<span style="font-size:10px;color:' + t.tag + ';">[' + c.tag + "]</span>" : "") +
          pill("งานค้าง isurvey", c.backlog, c.backlog > 0 ? t.warn : t.ok, "backlog") +
          pill("งานแก้ไข emcs", c.edit, c.edit > 0 ? t.warn : t.neutral, "edit") +
          pill("งานต่อเนื่อง emcs", c.cont, c.cont > 0 ? t.warn : t.neutral, "cont");
      }
    }
    if (html !== lastHtml) { b.innerHTML = html; lastHtml = html; } // เขียนเฉพาะตอนเปลี่ยน
    positionBadge(b);
  }

  // ---- อ่านชื่อจาก header ----
  let _loggedNoTitle = false;
  function capture() {
    const el = titleEl();
    const raw = el ? el.textContent.trim() : "";
    if (!raw) {
      if (!_loggedNoTitle) { _loggedNoTitle = true; console.log("[extenBoard] ยังหาชื่อผู้ล็อกอินบนหัวเว็บไม่เจอ"); }
      return;
    }
    if (_loggedNoTitle) { _loggedNoTitle = false; console.log("[extenBoard] เจอชื่อผู้ล็อกอิน:", raw); }
    const display = raw.replace(/^\s*Hi,\s*/, "").trim();
    const n = norm(raw);
    if (n !== curNorm) { curNorm = n; lastHtml = null; panelView = null; renderPanel(); } // ชื่อเปลี่ยน -> วาดใหม่ + ปิดแผง
    if (n && n !== lastNorm) {
      lastNorm = n;
      // กัน "Extension context invalidated" ตอน reload extension ขณะหน้าเว็บยังเปิดค้าง
      try { chrome.storage.local.set({ supervisor: { display: display, norm: n, ts: Date.now() } }); }
      catch (e) { /* รีเฟรชหน้าเว็บแล้วจะหาย */ }
    }
    renderBadge();
  }

  // ---- ขอข้อมูลจาก service worker ----
  function refreshData() {
    try {
      chrome.runtime.sendMessage({ type: "dashboard-data" }, (resp) => {
        if (chrome.runtime.lastError) return; // SW หลับ/ยังไม่พร้อม — รอบหน้าค่อยลองใหม่
        if (resp && resp.ok) { cache = resp.data; lastHtml = null; renderBadge(); renderPanel(); }
      });
    } catch (e) {}
  }

  // ถ้า extension ถูก reload/อัปเดตระหว่างที่หน้าเว็บยังเปิดอยู่ -> context เดิมใช้ไม่ได้
  // (chrome.* throw "Extension context invalidated") -> หยุด timer ทั้งหมด รอผู้ใช้รีเฟรชหน้า
  function extAlive() { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } }
  let tries = 0, ivPoll, ivCapture, ivData;
  function stopAll() { clearInterval(ivPoll); clearInterval(ivCapture); clearInterval(ivData); }

  // header โผล่หลัง ExtJS init — poll ช่วงแรก แล้วคอยเฝ้าต่อ
  ivPoll = setInterval(() => { if (!extAlive()) return stopAll(); capture(); if (++tries > 40) clearInterval(ivPoll); }, 500); // ~20s
  ivCapture = setInterval(() => { if (!extAlive()) return stopAll(); capture(); }, 5000); // อัปเดตชื่อ + วาง/ฉีดป้ายซ้ำถ้าหาย
  window.addEventListener("resize", renderBadge); // ย้ายตำแหน่งตามขนาดจอ
  document.addEventListener("click", (e) => {     // คลิกนอกแผง/นอกป้าย -> ปิดแผง
    if (!panelView) return;
    if (e.target.closest("#extenboard-panel") || e.target.closest("#extenboard-badge")) return;
    panelView = null; renderPanel();
  });
  refreshData();
  ivData = setInterval(() => { if (!extAlive()) return stopAll(); refreshData(); }, 5 * 60 * 1000); // รีเฟรชตัวเลขทุก 5 นาที
  setTimeout(refreshData, 12000);              // ลองซ้ำเร็ว ๆ เผื่อรอบแรก SW ยังไม่พร้อม (cold start)
})();
