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
  const ANCHOR_CMP_ID    = "tab1_SUR_INVEST";    // anchor หา table panel
  const ROW6_LABEL_TEXT  = "ค่าเรียกร้อง";       // หา row 6 ด้วย text นี้ (insert ต่อท้ายมัน)
  const ROW_ID           = "tab1_deduct_row";    // panel id ของแถว 7
  const FIELD_ID         = "tab1_deduct_amount"; // numberfield id
  const ROW_HEIGHT       = 35;
  const ROW_WIDTH        = 730;
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
        { xtype: "label", text: "บาท",    x: 300, y: 6, width: 30  },
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

  function pollOnce() {
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
