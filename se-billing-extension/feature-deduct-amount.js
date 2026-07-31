/**
 * feature-deduct-amount.js
 * ─────────────────────────────────────────────────────────────
 * UI helper: เพิ่มแถวที่ 7 "หักเงิน" + numberfield ในตาราง
 * รายการค่าใช้จ่าย (panel ที่ครอบ ค่าบริการ / ค่าเดินทาง / ฯลฯ)
 *
 *   เมื่อ user กรอกยอด → content.js หักออกจาก SUR_INVEST
 *   (ผ่าน getActiveModifiers() ใน content.js)
 *
 * วิธีหา parent panel:
 *   ใช้ tab1_SUR_INVEST (มีอยู่ในแถว 1 ทุกครั้ง) เป็น anchor
 *   ── Ext.getCmp("tab1_SUR_INVEST").ownerCt          = row panel
 *   ── row panel.ownerCt                              = table panel
 *   ── หา row 6 (ค่าเรียกร้อง) ใน items แล้ว insert(idx+1, ...)
 *      เพื่อให้แทรก "หลังแถว 6" — ไม่ใช่ท้าย table (มี totals/หมายเหตุ ต่อท้ายอีก)
 *      fallback: ถ้าไม่เจอ ค่าเรียกร้อง → append ท้าย table
 *
 * Layout ของแถวเดิม = absolute (items วางด้วย x/y/width)
 *   columns:  ลำดับ(left 10), รายละเอียด(left 55),
 *             จำนวน(left 215), จำนวนเงินเสนอ(left 510),
 *             จำนวนเงินอนุมัติ(left 630)
 *
 * รันใน MAIN world (inject พร้อม content.js)
 */
(function () {
  "use strict";

  // ── ค่าคงที่ (แก้ได้ตามต้องการ) ──────────────────────────
  const ANCHOR_CMP_ID    = "tab1_SUR_INVEST";          // anchor หา table panel
  const ROW6_LABEL_TEXT  = "ค่าเรียกร้อง";             // หา row 6 ด้วย text นี้ (insert ต่อท้ายมัน)
  const ROW_ID           = "tab1_deduct_row";          // panel id ของแถว 7
  const FIELD_ID         = "tab1_deduct_amount";       // numberfield id (ยอดหักเงิน)
  const LATE_CHK_ID      = "tab1_deduct_late_submit";  // checkbox "ส่งช้า"
  const DOCS_CHK_ID      = "tab1_deduct_incomplete_docs"; // checkbox "เอกสารไม่ครบ"
  const WARN_LBL_ID      = "tab1_deduct_warning";      // label เตือนเมื่อ deduct>0 แต่ไม่ติ๊ก
  const ROW_HEIGHT       = 35;
  const ROW_WIDTH        = 850;
  const FIELD_WIDTH      = 80;
  const POLL_INTERVAL_MS = 500;

  const TAG = "[Deduct]";
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);

  function buildRowConfig() {
    return {
      id: ROW_ID,
      xtype: "panel",
      layout: "absolute",
      height: ROW_HEIGHT,
      width: ROW_WIDTH,
      border: false,
      items: [
        { xtype: "label", text: "7.",      x: 10,  y: 3, width: 25  },
        { xtype: "label", text: "หักเงิน", x: 55,  y: 3, width: 110 },
        {
          xtype: "numberfield",
          id: FIELD_ID,
          name: FIELD_ID,
          hideLabel: true,
          emptyText: "0",
          minValue: 0,
          allowDecimals: true,
          decimalPrecision: 2,
          hideTrigger: true,
          width: FIELD_WIDTH,
          x: 215, y: 3,
        },
        { xtype: "label", text: "บาท",    x: 300, y: 6, width: 30 },
        {
          xtype: "checkbox",
          id: LATE_CHK_ID,
          name: LATE_CHK_ID,
          boxLabel: "ส่งช้า",
          hideLabel: true,
          x: 350, y: 6, width: 100,
        },
        {
          xtype: "checkbox",
          id: DOCS_CHK_ID,
          name: DOCS_CHK_ID,
          boxLabel: "เอกสารไม่ครบ",
          hideLabel: true,
          x: 460, y: 6, width: 140,
        },
        {
          xtype: "label",
          id: WARN_LBL_ID,
          text: "⚠ ต้องเลือกเหตุผล",
          hidden: true,
          x: 610, y: 6, width: 200,
          style: "color:#dc2626;font-weight:500;",
        },
      ],
    };
  }

  function tryFindTablePanel() {
    if (typeof Ext === "undefined" || typeof Ext.getCmp !== "function") return null;
    const anchor = Ext.getCmp(ANCHOR_CMP_ID);
    if (!anchor) return null;
    const row = anchor.ownerCt;
    const table = row && row.ownerCt;
    return table || null;
  }

  /**
   * หา row 6 (ค่าเรียกร้อง) ใน table.items โดยเทียบ textContent
   * คืน item หรือ null ถ้าไม่เจอ (form variant ที่ไม่มีแถวนี้)
   */
  function findAnchorRow(table) {
    if (!table || !table.items || typeof table.items.each !== "function") return null;
    let found = null;
    table.items.each(function (item) {
      if (!item || !item.el || !item.el.dom) return;
      // ข้าม row ของเราเอง + row ที่ hidden (display:none)
      if (item.id === ROW_ID) return;
      if (item.el.dom.style && item.el.dom.style.display === "none") return;
      const txt = (item.el.dom.textContent || "").trim();
      if (txt.indexOf(ROW6_LABEL_TEXT) !== -1) {
        found = item;
        return false; // break
      }
    });
    return found;
  }

  // ═════════════════════════════════════════════════════════
  // โหมด DOM (เว็บใหม่ React+MUI) — คนละแนวคิดกับเว็บเก่าโดยตั้งใจ
  //
  //   เว็บเก่า: สร้างแถวที่ 7 "หักเงิน" ขึ้นมาเอง ยอดไม่เข้าระบบ isurvey
  //            (เห็นแต่ยอดสุทธิที่ถูกหักไปแล้วในค่าบริการ)
  //   เว็บใหม่: ใช้ช่องเงินจริงของ isurvey แถว "3. ค่าใช้จ่ายอื่นๆ"
  //            → ยอดหักเข้ายอดรวมของ isurvey จริง เห็นในรายงาน
  //
  //   ช่องนี้เป็น "ช่องหักเงิน" ล้วน — กรอกเท่าไหร่ก็ติดลบเสมอ ไม่ขึ้นกับ checkbox
  //   (กันกรอกแล้วกลายเป็นบวก = จ่ายเงินเกิน ซึ่งแก้ยากกว่าจ่ายขาด)
  //   checkbox 2 ตัวเหลือหน้าที่เดียว = บอกเหตุผลว่าหักเพราะอะไร
  //   และ content.js บังคับให้ต้องเลือกเหตุผลก่อนกดบันทึกได้
  //
  //   ผู้ใช้พิมพ์แค่จำนวน ไม่ต้องใส่เครื่องหมายลบ — เราจัดการให้
  //   ใส่เครื่องหมายตอน "ออกจากช่อง (blur)" และตอน "ติ๊ก/ปลดติ๊ก"
  //   ไม่ทำระหว่างพิมพ์ เพราะจะไปแย่งแก้ค่าที่ผู้ใช้กำลังพิมพ์อยู่
  // ═════════════════════════════════════════════════════════
  const OTHER_ROW_LABEL = "ค่าใช้จ่ายอื่นๆ";
  const DOM_WRAP_ID     = "tab1_deduct_reason_dom";

  function otherExpenseInputs() {
    const I = window.SEInject;
    if (!I) return [];
    return ["proposed", "approved"]
      .map((col) => { const c = I.tableCell(OTHER_ROW_LABEL, col); return c && c.querySelector("input"); })
      .filter(Boolean);
  }

  function isDeductChecked() {
    const a = document.getElementById(LATE_CHK_ID);
    const b = document.getElementById(DOCS_CHK_ID);
    return !!((a && a.checked) || (b && b.checked));
  }

  // ── คำเตือน: กรอกยอดแล้วต้องเลือกเหตุผลหักเงิน ────────────────
  //   content.js ใช้ตรรกะเดียวกันบล็อกปุ่มบันทึก (ดู checkOtherExpenseValid)
  //   ตรงนี้ทำหน้าที่บอกผู้ใช้ตั้งแต่ตอนพิมพ์ ไม่ต้องรอกดบันทึกถึงจะรู้
  const WARN_ID = "tab1_other_expense_warning";

  /** มียอดกรอกอยู่ไหม (ไม่สนเครื่องหมาย) */
  function hasOtherExpenseAmount() {
    return otherExpenseInputs().some((el) => {
      const raw = String(el.value || "").replace(/,/g, "").trim();
      if (raw === "") return false;
      const n = Number(raw);
      return isFinite(n) && n !== 0;
    });
  }

  function updateWarning() {
    const el = document.getElementById(WARN_ID);
    if (!el) return;
    const show = hasOtherExpenseAmount() && !isDeductChecked();
    el.style.display = show ? "inline" : "none";
  }

  /** บังคับให้ยอดติดลบเสมอ — ช่องนี้ใช้หักเงินอย่างเดียว ไม่ขึ้นกับ checkbox */
  function applySign() {
    const R = window.SEResolve;
    if (!R) return;
    updateWarning();
    otherExpenseInputs().forEach((el) => {
      const raw = String(el.value || "").replace(/,/g, "").trim();
      if (raw === "") return;
      const n = Number(raw);
      if (!isFinite(n) || n === 0) return;
      const target = -Math.abs(n);
      if (n === target) return;
      R.setNativeValue(el, String(target));
      log(`ปรับเป็นยอดหัก "${OTHER_ROW_LABEL}" → ${target}`);
    });
  }

  function domPollOnce() {
    const I = window.SEInject;
    if (!I) return;
    // สร้างแล้ว — แค่ sync คำเตือนทุกรอบ (React re-render ทำให้ listener ที่ผูกไว้หลุดได้)
    if (document.getElementById(DOM_WRAP_ID)) { updateWarning(); return; }

    // วาง checkbox ไว้ใน cell "รายละเอียด" ต่อท้ายข้อความ ค่าใช้จ่ายอื่นๆ
    const row = I.tableRow(OTHER_ROW_LABEL);
    if (!row) return;
    const descCell = [...row.children].find((c) => (c.textContent || "").includes(OTHER_ROW_LABEL));
    if (!descCell) return;

    const wrap = document.createElement("span");
    wrap.id = DOM_WRAP_ID;
    wrap.style.cssText = "display:inline-flex;align-items:center;gap:2px;margin-left:6px";
    descCell.appendChild(wrap);

    I.checkbox({ id: LATE_CHK_ID, label: "หักเงินส่งช้า",      into: wrap, onChange: applySign });
    I.checkbox({ id: DOCS_CHK_ID, label: "หักเงินเอกสารไม่ครบ", into: wrap, onChange: applySign });

    const warn = document.createElement("span");
    warn.id = WARN_ID;
    warn.textContent = "← เลือกเหตุผลหักเงิน ไม่งั้นบันทึกไม่ได้";
    warn.style.cssText =
      "display:none;margin-left:6px;color:#c62828;font-size:12px;font-weight:600;white-space:nowrap";
    wrap.appendChild(warn);

    // ผู้ใช้พิมพ์เสร็จแล้วออกจากช่อง → ค่อยใส่เครื่องหมาย
    // แต่คำเตือนต้องขึ้นตั้งแต่ตอนพิมพ์ (input) ไม่ใช่รอ blur
    otherExpenseInputs().forEach((el) => {
      el.addEventListener("blur", applySign);
      el.addEventListener("input", updateWarning);
    });
    updateWarning();

    log(`แทรกตัวเลือกหักเงินในแถว "${OTHER_ROW_LABEL}" (โหมด DOM)`);
  }

  function pollOnce() {
    // เว็บใหม่ไม่มี ExtJS → ใช้แนวคิดผูกกับช่องเงินจริงแทนการสร้างแถวใหม่
    if (typeof Ext === "undefined" || typeof Ext.getCmp !== "function") {
      try { domPollOnce(); } catch (e) { warn("โหมด DOM ล้มเหลว:", e); }
      return;
    }

    const table = tryFindTablePanel();
    if (!table) return;

    const anchorRow = findAnchorRow(table);
    const existing  = Ext.getCmp(ROW_ID);

    // ถ้ามี row เก่าอยู่แล้ว — verify ตำแหน่ง ก่อนตัดสินใจ
    if (existing && existing.ownerCt === table && !existing.destroyed) {
      if (anchorRow) {
        const expectedIdx = table.items.indexOf(anchorRow) + 1;
        const actualIdx   = table.items.indexOf(existing);
        if (expectedIdx === actualIdx) return;     // อยู่ที่ถูกต้องแล้ว
        // ตำแหน่งผิด (เช่นค้างจาก version เก่าที่ append ท้าย) → ทำลายก่อน reinsert
        try { existing.destroy(); } catch (_) {}
        log(`row 7 in wrong position (expected idx ${expectedIdx}, got ${actualIdx}) — re-inserting`);
      } else {
        // ไม่เจอ anchor → ปล่อยไว้ที่เดิม (fallback)
        return;
      }
    } else if (existing && !existing.destroyed) {
      // instance ค้างอยู่ใน parent อื่น (table ถูก recreate) → ทำลายก่อน
      try { existing.destroy(); } catch (_) {}
    }

    try {
      if (anchorRow) {
        const idx = table.items.indexOf(anchorRow);
        table.insert(idx + 1, buildRowConfig());
        log(`row 7 inserted after row 6 (idx ${idx + 1}) in ${table.id}`);
      } else {
        // fallback: ไม่เจอ ค่าเรียกร้อง → append ท้าย
        table.add(buildRowConfig());
        log(`row 7 appended to ${table.id} (anchor "${ROW6_LABEL_TEXT}" not found)`);
      }
    } catch (e) {
      warn("failed to add row:", e);
    }
  }

  pollOnce();
  setInterval(pollOnce, POLL_INTERVAL_MS);

  return TAG + " script loaded (continuous polling every " + POLL_INTERVAL_MS + "ms)";
})();
