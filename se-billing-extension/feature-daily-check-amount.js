/**
 * feature-daily-check-amount.js
 * ─────────────────────────────────────────────────────────────
 * UI helper: เพิ่ม checkbox ในแถว "5. ค่าคัดประจำวัน" (tab Insurance Info)
 *
 *  ── ค่าเริ่มต้น (SETP + บริษัท 1 = ที่ไม่ใช่ SEMS): 3 กล่อง ──
 *     ☐ ถูก (100)   ☐ ผิด (50)   ☐ รอผล (50)
 *     - ถูก ↔ ผิด "ตัดกัน": ติ๊กถูก → disable ผิด ; ติ๊กผิด → disable ถูก
 *     - รอผล ติ๊กร่วมกับ ถูก/ผิด ได้
 *  ── SEMS: กล่องเดียว ──
 *     ☐ ถูก (100)
 *
 *  ผลลัพธ์เมื่อติ๊ก (ทั้งสองโหมด):
 *     DAILY_NUM  = จำนวนกล่องที่ติ๊ก (1 หรือ 2)
 *     SUR_DAILY  = 50 เสมอ (ถ้ามีติ๊กอย่างน้อย 1)
 *     INS_DAILY  = ผลรวมราคาของกล่องที่ติ๊ก (ถูก 100 + ผิด 50 + รอผล 50)
 *   ตัวอย่าง: ถูก=100 · ผิด=50 · รอผล=50 · ถูก+รอผล=150 (num2) · ผิด+รอผล=100 (num2)
 *
 *  - ยังไม่เคยติ๊ก (เคลมเพิ่งเปิด) → ไม่แตะช่องเดิม (recompute ยิงเฉพาะตอน checkbox เปลี่ยน)
 *  - เอาติ๊กออกจนหมด → ล้าง DAILY_NUM / SUR_DAILY / INS_DAILY เป็นค่าว่าง
 *  - DAILY_NUM แก้เองได้ และ "ไม่มีผล" กับ INS_DAILY (ไม่ recompute ตาม DAILY_NUM)
 *  - ใช้ทุกเคลม (โหมดต่างกันตาม prefix เลขเซอร์เวย์เท่านั้น)
 *
 * โครงสร้างแถว (ยืนยันจากหน้าจริง):
 *   parent = panel auto-gen id → anchor จาก tab1_DAILY_NUM.ownerCt
 *   item เดิมจัดด้วย position:absolute; left:Xpx (layout รายงาน hbox แต่ไม่ยึด config x)
 *   ── หลัง insert ต้องเซ็ต el.style.left/top เอง
 *   columns: จำนวน(x215) "ข้อ"(x250) เสนอ/SUR_DAILY(x510) อนุมัติ/INS_DAILY(x630)
 *   ── ช่องว่าง x≈290–500 ใช้วาง checkbox group
 *
 * ใช้ ExtJS 6.2.0 API: Ext.getCmp / container.add / cmp.setValue / cmp.setDisabled
 * รันใน MAIN world (inject พร้อม content.js / feature อื่น)
 */
(function () {
  "use strict";

  // ── ค่าคงที่ (แก้ได้ตามต้องการ) ──────────────────────────
  const NUM_CMP_ID       = "tab1_DAILY_NUM";           // numberfield จำนวน "ข้อ" (= จำนวนกล่องที่ติ๊ก, แก้เองได้)
  const SUR_CMP_ID       = "tab1_SUR_DAILY";           // textfield คอลัมน์ "เสนอ/เซอร์เวย์"
  const INS_CMP_ID       = "tab1_INS_DAILY";           // textfield คอลัมน์ "อนุมัติ/ประกัน"
  const GROUP_ID         = "tab1_daily_check_group";   // checkboxgroup ที่จะสร้าง

  const CHK_RIGHT_ID     = "tab1_daily_chk_right";     // ☐ ถูก
  const CHK_WRONG_ID     = "tab1_daily_chk_wrong";     // ☐ ผิด
  const CHK_WAIT_ID      = "tab1_daily_chk_wait";      // ☐ รอผล
  const RIGHT_LABEL      = "ถูก";
  const WRONG_LABEL      = "ผิด";
  const WAIT_LABEL       = "รอผล";

  const PRICE_RIGHT      = 100;                         // INS_DAILY ต่อกล่อง "ถูก"
  const PRICE_WRONG      = 50;                          // INS_DAILY ต่อกล่อง "ผิด"
  const PRICE_WAIT       = 50;                          // INS_DAILY ต่อกล่อง "รอผล"
  const SUR_FIXED        = 50;                          // SUR_DAILY (คงที่ ถ้ามีติ๊กอย่างน้อย 1)

  const POS_LEFT         = 290;                         // px — ตำแหน่ง group ในแถว
  const POS_TOP          = 3;
  const CHK_WIDTH        = 62;                          // width ต่อ checkbox
  const HIGHLIGHT_COLOR  = "#fff59d";
  const HIGHLIGHT_MS     = 1500;
  const POLL_INTERVAL_MS = 500;

  const TAG = "[DailyCheck]";
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);

  // ── helpers ───────────────────────────────────────────────
  function money(n) {
    return (Math.round(n * 100) / 100).toFixed(2);
  }

  /** อ่าน prefix เลขเซอร์เวย์ → "SETP" | "SEMS" | null (อ่าน DOM ตรง ไม่พึ่ง content.js) */
  function surveyPrefix() {
    const el = document.getElementById("tab1_survey_no-inputEl");
    const v = String(el && el.value ? el.value : "").trim().toUpperCase();
    if (v.indexOf("SETP") === 0) return "SETP";
    if (v.indexOf("SEMS") === 0) return "SEMS";
    return null;
  }

  /** โหมด DOM = ไม่มี ExtJS ให้พึ่ง (เว็บใหม่ React+MUI) */
  function domMode() {
    return typeof Ext === "undefined" || typeof Ext.getCmp !== "function";
  }

  /** id ของช่อง host → logical key ของ resolver */
  const KEY_OF = {
    [NUM_CMP_ID]: "dailyNumCmpId",
    [SUR_CMP_ID]: "surDailyCmpId",
    [INS_CMP_ID]: "insDailyCmpId",
  };

  /** checkbox ติ๊กอยู่ไหม — ไม่มี (โหมด SEMS ไม่มีกล่อง "ผิด") → false */
  function chkChecked(id) {
    if (domMode()) {
      const el = document.getElementById(id);
      return !!(el && el.checked);
    }
    const c = Ext.getCmp(id);
    return !!(c && typeof c.getValue === "function" && c.getValue() === true);
  }

  /** set disabled ให้ checkbox — no-op ถ้าไม่มี */
  function setChkDisabled(id, disabled) {
    if (domMode()) {
      const el = document.getElementById(id);
      if (el && el.disabled !== !!disabled) {
        el.disabled = !!disabled;
        const wrap = el.closest("label");
        if (wrap) wrap.style.opacity = disabled ? "0.45" : "";
      }
      return;
    }
    const c = Ext.getCmp(id);
    if (c && typeof c.setDisabled === "function" && !!c.disabled !== !!disabled) {
      c.setDisabled(!!disabled);
    }
  }

  /** flash พื้นหลังช่องที่เพิ่งเซ็ต (เลียนแบบ content.js) */
  function flash(cmpId) {
    const c = Ext.getCmp(cmpId);
    const el = c && c.inputEl && c.inputEl.dom;
    if (!el) return;
    const prevBg = el.style.backgroundColor;
    const prevTr = el.style.transition;
    el.style.transition = "background-color 0.6s ease";
    el.style.backgroundColor = HIGHLIGHT_COLOR;
    setTimeout(() => {
      el.style.backgroundColor = prevBg || "";
      setTimeout(() => { el.style.transition = prevTr || ""; }, 700);
    }, HIGHLIGHT_MS);
  }

  /** เซ็ตค่า field ผ่าน Ext (trigger การคำนวณยอดรวมของ host) */
  function setField(cmpId, value) {
    const R = window.SEResolve, key = KEY_OF[cmpId];
    if (domMode() || (R && key && !Ext.getCmp(cmpId))) {
      if (!R || !key) return false;
      if (String(R.read(key)) === String(value)) return false;
      // เว็บใหม่เป็น controlled input — resolver เขียนผ่าน native setter ให้
      return R.write(key, value);
    }
    const c = Ext.getCmp(cmpId);
    if (!c || typeof c.setValue !== "function") return false;
    if (String(c.getValue()) === String(value)) return false;   // ไม่แตะถ้าเท่าเดิม (กัน flash รัว)
    c.setValue(value);
    flash(cmpId);
    return true;
  }

  /** ล้าง field เป็นค่าว่าง — skip ถ้าว่างอยู่แล้ว (กัน flash รัว) */
  function clearField(cmpId) {
    const R = window.SEResolve, key = KEY_OF[cmpId];
    if (domMode()) {
      if (!R || !key) return false;
      const cur = String(R.read(key) || "").trim();
      // เว็บใหม่ช่องว่างแสดงเป็น "0" — ถือว่าว่างแล้ว ไม่ต้องเขียนซ้ำ
      if (cur === "" || Number(cur) === 0) return false;
      return R.write(key, "0");
    }
    const c = Ext.getCmp(cmpId);
    if (!c || typeof c.setValue !== "function") return false;
    const v = c.getValue();
    if (v === null || v === undefined || String(v).trim() === "") return false; // ว่างอยู่แล้ว
    c.setValue("");
    flash(cmpId);
    return true;
  }

  /** config ของ checkbox 1 กล่อง */
  function mkChk(id, label) {
    return {
      id: id,
      xtype: "checkbox",
      boxLabel: label,
      hideLabel: true,
      width: CHK_WIDTH,
    };
  }

  /** config ของ checkboxgroup ตาม prefix (SEMS = กล่องเดียว "ถูก") */
  function buildGroupConfig(prefix) {
    const items = (prefix === "SEMS")
      ? [ mkChk(CHK_RIGHT_ID, RIGHT_LABEL) ]
      : [ mkChk(CHK_RIGHT_ID, RIGHT_LABEL), mkChk(CHK_WRONG_ID, WRONG_LABEL), mkChk(CHK_WAIT_ID, WAIT_LABEL) ];
    return {
      id: GROUP_ID,
      xtype: "checkboxgroup",
      hideLabel: true,
      columns: items.length,   // เรียงแนวนอนแถวเดียว
      vertical: false,
      width: items.length * CHK_WIDTH + 8,
      items: items,
    };
  }

  /** ดันตำแหน่ง group ไปช่องว่าง (layout ไม่ยึด config x → เซ็ต el เอง) */
  function positionGroup(grp) {
    const el = grp && grp.el && grp.el.dom;
    if (!el) return;
    if (el.style.left !== POS_LEFT + "px") el.style.left = POS_LEFT + "px";
    if (el.style.top !== POS_TOP + "px")   el.style.top  = POS_TOP + "px";
  }

  /**
   * แกนหลัก: อ่านสถานะ checkbox → จัดการ ถูก↔ผิด ตัดกัน + เซ็ต NUM/SUR/INS
   * (เรียกทุกครั้งที่มี checkbox เปลี่ยน — ไม่เรียกใน poll เพื่อไม่ทับค่าที่ user แก้)
   */
  function recompute() {
    const right = chkChecked(CHK_RIGHT_ID);
    const wrong = chkChecked(CHK_WRONG_ID);
    const wait  = chkChecked(CHK_WAIT_ID);

    // ถูก ↔ ผิด ตัดกัน (โหมด default ; SEMS ไม่มี "ผิด" → no-op)
    setChkDisabled(CHK_WRONG_ID, right);
    setChkDisabled(CHK_RIGHT_ID, wrong);

    const count  = (right ? 1 : 0) + (wrong ? 1 : 0) + (wait ? 1 : 0);
    if (count === 0) {
      // เอาติ๊กออกหมด → ล้าง NUM/SUR/INS เป็นค่าว่าง
      // (recompute ยิงเฉพาะตอน checkbox เปลี่ยน — เคลมที่ยังไม่แตะเลยจะไม่โดนล้าง)
      clearField(NUM_CMP_ID);
      clearField(SUR_CMP_ID);
      clearField(INS_CMP_ID);
      log("เอาติ๊กออกหมด → ล้าง NUM/SUR/INS");
      return;
    }

    const insSum = (right ? PRICE_RIGHT : 0) + (wrong ? PRICE_WRONG : 0) + (wait ? PRICE_WAIT : 0);
    // เซ็ต INS ท้ายสุด — เผื่อ host แตะ INS ตอน NUM เปลี่ยน จะได้ทับด้วยค่าเรา
    setField(NUM_CMP_ID, count);
    setField(SUR_CMP_ID, money(SUR_FIXED));
    setField(INS_CMP_ID, money(insSum));
    log(`ติ๊ก [${[right&&"ถูก",wrong&&"ผิด",wait&&"รอผล"].filter(Boolean).join("+")}] → NUM=${count} SUR=${money(SUR_FIXED)} INS=${money(insSum)}`);
  }

  // ── Init: สร้าง checkboxgroup + ผูก handler (idempotent) ──────
  function init(row) {
    const prefix = surveyPrefix();
    let grp = Ext.getCmp(GROUP_ID);

    // สร้างใหม่ถ้า: ยังไม่มี / อยู่ผิด row / prefix เปลี่ยน (ชุดกล่องต่างกัน)
    if (!grp || grp.destroyed || grp.ownerCt !== row || grp.__dcPrefix !== prefix) {
      if (grp && !grp.destroyed) { try { grp.destroy(); } catch (_) {} }
      try {
        grp = row.add(buildGroupConfig(prefix));
      } catch (e) {
        warn("row.add ล้มเหลว:", e);
        return;
      }
      grp.__dcPrefix = prefix;
      log(`checkboxgroup created (${prefix || "default"}) in ${row.id}`);
    }
    positionGroup(grp);

    // ผูก 'change' ของ group (ยิงเมื่อ checkbox ใดๆ เปลี่ยน) — กัน duplicate
    if (grp.__dcHandler) grp.un("change", grp.__dcHandler);
    grp.__dcHandler = recompute;
    grp.on("change", recompute);
  }

  // ─────────────────────────────────────────────────────────
  // Bootstrap: poll ตลอดเวลา (เลียนแบบ feature อื่น)
  //   ─ ตาราง/แถวถูก destroy/recreate ตอนสลับแท็บ/เปลี่ยนเคลม → re-init
  //   ─ re-assert ตำแหน่งเผื่อ host re-run layout ดัน group หลุด
  // ─────────────────────────────────────────────────────────
  function tryFindRow() {
    if (typeof Ext === "undefined" || typeof Ext.getCmp !== "function") return null;
    const anchor = Ext.getCmp(NUM_CMP_ID) || Ext.getCmp(SUR_CMP_ID);
    return anchor ? anchor.ownerCt : null;
  }

  // ─────────────────────────────────────────────────────────
  // โหมด DOM (เว็บใหม่ React+MUI)
  //   แถว "5.ค่าคัดประจำวัน" มีอยู่แล้ว มี cell "จำนวน" ที่เขียนว่า "ข้อ"
  //   → แทรก checkbox ต่อท้ายใน cell นั้น
  //   ตรรกะคิดเงินใช้ recompute() ตัวเดียวกับเว็บเก่า ไม่แยกโค้ด
  // ─────────────────────────────────────────────────────────
  const DOM_WRAP_ID = "tab1_daily_check_group_dom";

  function domInit() {
    const I = window.SEInject;
    if (!I) return;

    const prefix = surveyPrefix();
    const existing = document.getElementById(DOM_WRAP_ID);

    // prefix เปลี่ยน (SETP↔SEMS) → ชุดกล่องต่างกัน ต้องสร้างใหม่
    if (existing && existing.dataset.prefix === String(prefix)) return;
    if (existing) existing.remove();

    const cell = I.tableCell("ค่าคัดประจำวัน", "amount");
    if (!cell) return;

    const wrap = document.createElement("span");
    wrap.id = DOM_WRAP_ID;
    wrap.dataset.prefix = String(prefix);
    wrap.style.cssText = "display:inline-flex;align-items:center;gap:2px;margin-left:6px";
    cell.appendChild(wrap);

    // SEMS = กล่องเดียว "ถูก" ; อื่นๆ = ถูก/ผิด/รอผล
    const boxes = (prefix === "SEMS")
      ? [[CHK_RIGHT_ID, RIGHT_LABEL]]
      : [[CHK_RIGHT_ID, RIGHT_LABEL], [CHK_WRONG_ID, WRONG_LABEL], [CHK_WAIT_ID, WAIT_LABEL]];

    boxes.forEach(([id, label]) => {
      I.checkbox({ id, label, into: wrap, onChange: recompute });
    });
    log(`สร้าง checkbox (${prefix || "default"}) ในแถวค่าคัดประจำวัน (โหมด DOM)`);
  }

  let lastRow = null;
  let lastErr = "";

  function pollOnce() {
    // เว็บใหม่ไม่มี ExtJS → เส้นทาง DOM
    if (domMode()) {
      try { domInit(); } catch (e) {
        const msg = String(e && e.message || e);
        if (msg !== lastErr) { lastErr = msg; warn("โหมด DOM ล้มเหลว:", e); }
      }
      return;
    }

    const row = tryFindRow();
    if (!row) return;

    const grp = Ext.getCmp(GROUP_ID);
    if (row === lastRow && grp && !grp.destroyed && grp.__dcHandler && grp.__dcPrefix === surveyPrefix()) {
      positionGroup(grp);   // re-assert ตำแหน่งเผื่อ layout ดันหลุด
      return;
    }
    lastRow = row;
    try { init(row); } catch (e) {
      const msg = String(e && e.message || e);
      if (msg !== lastErr) { lastErr = msg; warn("init ล้มเหลว:", e); }
    }
  }

  pollOnce();
  setInterval(pollOnce, POLL_INTERVAL_MS);

  return TAG + " script loaded (continuous polling every " + POLL_INTERVAL_MS + "ms)";
})();
