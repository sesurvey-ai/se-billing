/**
 * resolver.js — ตัวหาฟิลด์บนหน้า isurvey (รองรับทั้งเว็บเก่าและเว็บใหม่)
 * ─────────────────────────────────────────────────────────────
 * ปัญหาที่แก้:
 *   เว็บเก่า = ExtJS 6.2 · id คงที่ (tab1_SUR_INVEST) · เขียนค่าผ่าน Ext.getCmp().setValue()
 *   เว็บใหม่ = React + MUI · id ส่วนใหญ่ผันผวน (:r3a:) · ต้องเขียนผ่าน native setter + dispatch
 *
 * แนวคิด: แต่ละ "logical key" มีรายการวิธีหาเรียงตามความน่าเชื่อถือ
 *   ค่าจาก server → id เว็บเก่า → id เว็บใหม่ → หาเชิงโครงสร้าง (label / แถว×คอลัมน์ / radio value)
 * ตัวไหนเจอก่อนใช้ตัวนั้น → หน้าไหนก็ทำงานได้โดยไม่ต้องรู้ว่าเป็นเว็บไหน
 *
 * ─── ข้อเท็จจริงที่พิสูจน์บนหน้าจริงแล้ว (2026-07-28) ───
 *   · เว็บใหม่: el.value = x  →  React ไม่รับรู้ ยอดรวมไม่ขยับ
 *     ต้อง native setter + dispatch('input')  →  ยอดรวมคำนวณตามทันที
 *   · radio ทั้งหน้าเว็บใหม่ใช้ name="radio-buttons-group" เหมือนกัน 17 ตัว
 *     → ห้ามหาด้วย name อย่างเดียว ต้องเจาะจงด้วย label ของ FormControl
 *   · ตารางค่าสำรวจเว็บใหม่: ทุกแถวมี 5 cell — [2]=จำนวน [3]=เสนอ [4]=อนุมัติ
 *   · React ไม่วาดตารางใหม่เอง (0 mutation ใน 5 วิ) → element ที่แทรกอยู่รอด
 *
 * รันใน MAIN world · โหลดหลัง config-bridge.js ก่อน content.js
 */
(function () {
  "use strict";

  if (window.SEResolve) return;   // กันโหลดซ้ำ

  var TAG = "[SEResolve]";
  var VERSION = "2.11.0-r15";   // เช็กว่า reload extension แล้วจริงไหม: SEResolve.version
  function CFG() { return window.ISURVEY_HELPER_CONFIG || {}; }
  function dbg() {
    if (!CFG().debug) return;
    console.log.apply(console, [TAG].concat([].slice.call(arguments)));
  }
  function safe(fn, dflt) {
    try { var v = fn(); return v === undefined ? dflt : v; } catch (e) { return dflt; }
  }
  function txt(el) {
    return safe(function () { return (el.textContent || "").replace(/\s+/g, " ").trim(); }, "");
  }
  function esc(s) {
    return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&");
  }

  /** id ที่ framework สร้างเอง — เปลี่ยนทุก render ใช้เป็น selector ไม่ได้ */
  function isVolatileId(id) {
    var s = String(id || "");
    return /^:r[0-9a-z]+:$/i.test(s)
        || /^mui-\d+$/.test(s)
        || /^(radix|headlessui)-/i.test(s)
        || /^(ext|panel|label|button|container|fieldset|toolbar|tab)-\d+$/i.test(s);
  }

  // ═════════════════════════════════════════════════════════
  // REGISTRY — logical key → วิธีหาบนแต่ละเว็บ
  //   cmpIds   : ExtJS component id (เว็บเก่า)
  //   domIds   : id ของ element จริง (เว็บเก่าใช้ -inputEl, เว็บใหม่ใช้ข้อความไทย)
  //   css      : CSS selector ตรงๆ
  //   names    : ค่า attribute name
  //   ph       : placeholder (เว็บใหม่ MUI ใส่ placeholder = ชื่อฟิลด์)
  //   labels   : ข้อความ label — หา input ที่ผูกกับ label นี้
  //   row/col  : ช่องเงินในตาราง — หัวแถว × คอลัมน์
  //   radio    : { groupLabel, value } — radio ที่อยู่ในกลุ่มที่มี label นี้
  //   chkLabel : checkbox ที่มีข้อความนี้กำกับ
  //   shape    : รูปแบบ string ที่ SEL.<key> ต้องคืน (ให้ content.js เดิมใช้ได้)
  //   mutating : true = ฟีเจอร์ไปแก้ตัว host เอง ต้องมั่นใจ ห้ามเดา
  // ═════════════════════════════════════════════════════════
  var REGISTRY = {};
  function K(key, def) { def.key = key; REGISTRY[key] = def; }

  // ── ที่ตั้ง ──────────────────────────────────────────────
  K("provinceHidden", {
    shape: "css", kind: "hidden",
    css: ['input[type="hidden"][name="tab1_survey_provinceID"]'],
    names: ["tab1_survey_provinceID"],
    ph: ["จังหวัดที่ตรวจสอบ"], labels: ["จังหวัดที่ตรวจสอบ"],
  });
  K("amphurHidden", {
    shape: "css", kind: "hidden",
    css: ['input[type="hidden"][name="tab1_survey_amphurID"]'],
    names: ["tab1_survey_amphurID"],
    ph: ["เขต/อำเภอที่ตรวจสอบ"], labels: ["อำเภอที่ตรวจสอบ", "เขต/อำเภอที่ตรวจสอบ"],
  });
  K("tumbonHidden", {
    shape: "css", kind: "hidden",
    css: ['input[type="hidden"][name="tab1_survey_tumbonID"]'],
    names: ["tab1_survey_tumbonID"],
    labels: ["ตำบลที่ตรวจสอบ"],
    optional: true,          // เว็บใหม่ไม่มีตำบล — ไม่เจอถือว่าปกติ
  });
  K("provinceCmpId", {
    shape: "cmpId", kind: "combo",
    cmpIds: ["tab1_survey_provinceID"],
    ph: ["จังหวัดที่ตรวจสอบ"], labels: ["จังหวัดที่ตรวจสอบ"],
  });
  K("amphurCmpId", {
    shape: "cmpId", kind: "combo",
    cmpIds: ["tab1_survey_amphurID"],
    ph: ["เขต/อำเภอที่ตรวจสอบ"], labels: ["อำเภอที่ตรวจสอบ", "เขต/อำเภอที่ตรวจสอบ"],
  });
  K("tumbonCmpId", {
    shape: "cmpId", kind: "combo",
    cmpIds: ["tab1_survey_tumbonID"], labels: ["ตำบลที่ตรวจสอบ"], optional: true,
  });

  // ── ตารางค่าใช้จ่าย ─────────────────────────────────────
  //   เว็บเก่ามี id คงที่ · เว็บใหม่ต้องใช้ แถว×คอลัมน์ อย่างเดียว
  function money(key, cmpId, row, col, opts) {
    K(key, Object.assign({
      shape: "cmpId", kind: "field",
      cmpIds: [cmpId], domIds: [cmpId + "-inputEl"], css: ["input#" + cmpId + "-inputEl"],
      row: row, col: col,
    }, opts || {}));
  }
  money("feeCmpId",       "tab1_SUR_INVEST", "ค่าบริการ",      "proposed");
  money("insInvestCmpId", "tab1_INS_INVEST", "ค่าบริการ",      "approved");
  money("insTransCmpId",  "tab1_INS_TRANS",  "ค่าเดินทาง",     "approved");
  money("insPhotoCmpId",  "tab1_INS_PHOTO",  "ค่ารูปถ่าย",     "approved");
  money("recvClaimCmpId", "tab1_RECV_CLAIM", "ค่าเรียกร้อง",   "amount");
  money("surClaimCmpId",  "tab1_SUR_CLAIM",  "ค่าเรียกร้อง",   "proposed");
  money("insClaimCmpId",  "tab1_INS_CLAIM",  "ค่าเรียกร้อง",   "approved");
  // ค่าใช้จ่ายอื่นๆ — เว็บใหม่ใช้ช่องนี้เป็นตัวรับยอดหักเงิน (ติดลบ)
  //   ยังไม่รู้ id ฝั่งเว็บเก่า จึงหาด้วยแถว×คอลัมน์อย่างเดียว
  K("otherExpenseCmpId", {
    shape: "cmpId", kind: "field",
    row: "ค่าใช้จ่ายอื่นๆ", col: "proposed", optional: true,
  });
  money("dailyNumCmpId",  "tab1_DAILY_NUM",  "ค่าคัดประจำวัน", "amount",   { mutating: true });
  money("surDailyCmpId",  "tab1_SUR_DAILY",  "ค่าคัดประจำวัน", "proposed", { mutating: true });
  money("insDailyCmpId",  "tab1_INS_DAILY",  "ค่าคัดประจำวัน", "approved", { mutating: true });

  // ── ข้อมูลเคลม / ผู้สำรวจ ───────────────────────────────
  K("claimNoInputId", {
    shape: "domId", kind: "field",
    cmpIds: ["tab1_claim_no"], domIds: ["tab1_claim_no-inputEl", "เลขเคลมประกัน"],
    labels: ["เลขเคลมประกัน", "เลขที่เคลม"],
  });
  K("surveyNoInputId", {
    shape: "domId", kind: "field",
    cmpIds: ["tab1_survey_no"],
    // เว็บใหม่สะกด "เลขเซอเวย์" (ไม่มี ร์) — ตามหน้าเว็บจริง
    domIds: ["tab1_survey_no-inputEl", "เลขเซอเวย์", "เลขเซอร์เวย์"],
    labels: ["เลขเซอเวย์", "เลขเซอร์เวย์", "เลขที่เซอร์เวย์"],
  });
  K("surveyorNameCmpId", {
    shape: "domId", kind: "field",
    cmpIds: ["tab1_surveyor_name"],
    domIds: ["tab1_surveyor_name-inputEl", "ชื่อผู้ปฏิบัติงาน"],
    labels: ["ชื่อผู้ปฏิบัติงาน", "ผู้สำรวจ"],
  });
  K("surveyorCodeInputId", {
    shape: "domId", kind: "field",
    domIds: ["รหัส"], labels: ["รหัส"],
    optional: true,   // เว็บเก่ารหัสรวมอยู่ในชื่อผู้สำรวจ (SEC148 ...)
  });
  K("ossCompanyInputId", {
    shape: "domId", kind: "field",
    cmpIds: ["tab1_OSS_company"], domIds: ["tab1_OSS_company-inputEl"],
    labels: ["ชื่อบริษัท outsource"],
    optional: true,   // ระวัง: "บริษัทประกัน" ของเว็บใหม่คนละความหมาย ห้ามจับคู่
  });
  K("mtypeIdCmpId", {
    shape: "cmpId", kind: "combo",
    cmpIds: ["tab1_claim_MtypeID"], css: ["input#tab1_claim_MtypeID-inputEl"],
    ph: ["ประเภทเคลม"], labels: ["ประเภทเคลม"],
  });
  K("serviceTypeCmpId", {
    shape: "cmpId", kind: "combo",
    cmpIds: ["tab1_service_type"], css: ["input#tab1_service_type-inputEl"],
    labels: ["ประเภทบริการ"],
    optional: true,   // เว็บใหม่ยังไม่มีฟิลด์นี้
  });
  K("dispatchDateInputId", {
    shape: "domId", kind: "field",
    domIds: ["tab1_dispatch_date-inputEl"], labels: ["จ่ายงานวันที่", "วันจ่ายงาน"],
  });
  K("dispatchTimeInputId", {
    shape: "domId", kind: "field",
    domIds: ["tab1_dispatch_time-inputEl", "จ่ายงานเวลา"], labels: ["จ่ายงานเวลา"],
  });

  // ── ตัวปรับยอด (checkbox / radio) ───────────────────────
  K("outOfAreaCmpId", {
    shape: "cmpId", kind: "checkbox", mutating: true,
    cmpIds: ["tab1_chk_co_area"], domIds: ["tab1_chk_co_area-inputEl"],
    chkLabel: ["นอกพื้นที่"],
  });
  K("inOutGroupCmpId", {
    shape: "cmpId", kind: "radiogroup",
    cmpIds: ["tab1_grd-in_out"],
    radioGroupLabel: ["ในเวลางาน", "ใน/นอกเวลางาน"],
  });
  K("subAreaCmpId", {
    shape: "cmpId", kind: "checkbox",
    cmpIds: ["tab1_chk_sub_area"],
    // เว็บเก่า Ext ต่อท้าย "-inputEl"; เว็บใหม่เราสร้าง <input> เอง id เปล่าๆ
    // ต้องมีทั้งสองแบบ ไม่งั้น isSubAreaChecked() บนเว็บใหม่คืน false ตลอด
    domIds: ["tab1_chk_sub_area-inputEl", "tab1_chk_sub_area"],
    optional: true,   // extension สร้างเอง
  });
  K("closeCaseInputId", {
    shape: "domId", kind: "radio",
    cmpIds: ["close_case"], domIds: ["close_case-inputEl"],
    chkLabel: ["ปิดการตรวจสอบ"], optional: true,
  });
  K("cancelCaseInputId", {
    shape: "domId", kind: "radio",
    cmpIds: ["cancel_case"], domIds: ["cancel_case-inputEl"],
    chkLabel: ["ยกเลิกเคลม"], optional: true,
  });

  // ── โครงหน้า ────────────────────────────────────────────
  K("headerTitleId", {
    shape: "domId", kind: "text",
    domIds: ["main-tab_header-title-textEl"],
    textRe: "^\\s*(Hi|Supervisor)\\s*,?\\s*\\S",
  });
  K("saveButtonId", {
    shape: "domId", kind: "button",
    cmpIds: ["tab1_save"], domIds: ["tab1_save"],
    // ต้องตรงเป๊ะ — คำว่า "บันทึก" เฉยๆ กว้างเกินไป เสี่ยงไปโดนปุ่มอื่น
    ownText: ["ยืนยันการตรวจสอบ", "บันทึกข้อมูล"],
  });

  // ── ฟิลด์เฉพาะเว็บใหม่ (ยังไม่มีใน content.js — เผื่ออนาคต) ──
  K("notifyNoInputId", { shape: "domId", kind: "field", domIds: ["เลขที่รับแจ้ง"], labels: ["เลขที่รับแจ้ง"], optional: true });
  K("policyNoInputId", { shape: "domId", kind: "field", cmpIds: ["tab1_policy_no"], domIds: ["tab1_policy_no-inputEl", "เลขที่กรมธรรม์"], labels: ["เลขที่กรมธรรม์"], optional: true });
  K("insurerInputId",  { shape: "domId", kind: "field", domIds: ["บริษัทประกัน"], labels: ["บริษัทประกัน"], optional: true });

  // ── ช่องที่ extension สร้างเอง ─────────────────────────────
  //   id เป็นของเรา คงที่ทั้งสองเว็บ — เว็บเก่าเป็น Ext component (id ตรง)
  //   เว็บใหม่เป็น DOM element ธรรมดา (id ตรงเหมือนกัน)
  function own(key, id, kind) {
    K(key, {
      shape: kind === "checkbox" ? "cmpId" : "cmpId", kind: kind || "field",
      cmpIds: [id], domIds: [id + "-inputEl", id], optional: true,
    });
  }
  own("outOfAreaAmountCmpId",   "tab1_chk_co_area_amount");
  own("outOfHoursAmountCmpId",  "tab1_rd_out_amount");
  own("deductAmountCmpId",      "tab1_deduct_amount");
  own("lateSubmitCmpId",        "tab1_deduct_late_submit",      "checkbox");
  own("incompleteDocsCmpId",    "tab1_deduct_incomplete_docs",  "checkbox");
  own("dailyChkRightCmpId",     "tab1_daily_chk_right",         "checkbox");
  own("dailyChkWrongCmpId",     "tab1_daily_chk_wrong",         "checkbox");
  own("dailyChkWaitCmpId",      "tab1_daily_chk_wait",          "checkbox");

  // ค่าคงที่ (ไม่ใช่ selector)
  K("inOutRadioName",  { shape: "literal", literal: "tab1_rd-in_out" });
  K("outValueLabel",   { shape: "literal", literal: "นอก" });

  // ═════════════════════════════════════════════════════════
  // Host adapter — ExtJS หรือ DOM ล้วน
  // ═════════════════════════════════════════════════════════
  function hasExt() {
    return typeof window.Ext !== "undefined" && !!window.Ext.getCmp;
  }
  function getExtCmp(id) {
    if (!hasExt()) return null;
    return safe(function () {
      var c = Ext.getCmp(id);
      return (c && !c.destroyed) ? c : null;
    }, null);
  }

  /** เขียนค่าลง input แบบที่ React/MUI รับรู้ (พิสูจน์บนหน้าจริงแล้ว) */
  var nativeInputSetter = safe(function () {
    return Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  }, null);
  var nativeAreaSetter = safe(function () {
    return Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
  }, null);

  function setNativeValue(el, value) {
    var setter = (el.tagName === "TEXTAREA") ? nativeAreaSetter : nativeInputSetter;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ═════════════════════════════════════════════════════════
  // กลยุทธ์การค้น
  // ═════════════════════════════════════════════════════════

  /** ── ตารางค่าใช้จ่าย: หาแถวจากข้อความ แล้วเลือกคอลัมน์ ── */
  var COL_HEADER = { amount: "จำนวน", proposed: "เสนอ", approved: "อนุมัติ" };

  function findExpenseTable() {
    var tables = document.querySelectorAll("table");
    for (var i = 0; i < tables.length; i++) {
      var t = tables[i].textContent || "";
      if (t.indexOf("อนุมัติ") !== -1 && (t.indexOf("เสนอ") !== -1 || t.indexOf("ลำดับ") !== -1)) return tables[i];
    }
    return null;
  }

  /** map ดัชนีคอลัมน์จากหัวตาราง — คืน { amount: 2, proposed: 3, approved: 4 } */
  function columnIndexMap(table) {
    return safe(function () {
      var head = table.querySelector("thead tr");
      if (!head) {
        var trs = table.querySelectorAll("tr");
        for (var i = 0; i < trs.length && i < 5; i++) {
          var t = trs[i].textContent || "";
          if (t.indexOf("อนุมัติ") !== -1 && t.indexOf("เสนอ") !== -1) { head = trs[i]; break; }
        }
      }
      if (!head) return null;
      var map = {}, cells = head.children;
      for (var j = 0; j < cells.length; j++) {
        var ct = txt(cells[j]);
        if (ct.indexOf("อนุมัติ") !== -1) map.approved = j;
        else if (ct.indexOf("เสนอ") !== -1) map.proposed = j;
        else if (ct.indexOf("จำนวนเงิน") === -1 && ct.indexOf("จำนวน") !== -1) map.amount = j;
      }
      return (map.approved !== undefined) ? map : null;
    }, null);
  }

  function findRowByLabel(table, label) {
    var trs = table.querySelectorAll("tbody tr, tr");
    for (var i = 0; i < trs.length; i++) {
      if ((trs[i].textContent || "").indexOf(label) !== -1) return trs[i];
    }
    return null;
  }

  /** ช่องเงินจาก แถว × คอลัมน์ */
  function byRowColumn(entry) {
    if (!entry.row || !entry.col) return null;
    var table = findExpenseTable();
    if (!table) return null;
    var row = findRowByLabel(table, entry.row);
    if (!row) return null;

    var cells = row.children;
    var map = columnIndexMap(table);
    var idx = map ? map[entry.col] : undefined;

    if (idx !== undefined && cells[idx]) {
      var f = cells[idx].querySelector("input, textarea");
      if (f) return f;
    }
    // ไม่มีหัวตาราง → นับจากท้ายแถว (อนุมัติอยู่ขวาสุดเสมอ)
    var inputs = [];
    for (var i = 0; i < cells.length; i++) {
      var el = cells[i].querySelector ? cells[i].querySelector("input, textarea") : null;
      if (el) inputs.push(el);
    }
    if (!inputs.length) return null;
    if (entry.col === "approved") return inputs[inputs.length - 1];
    if (entry.col === "proposed") return inputs.length >= 2 ? inputs[inputs.length - 2] : null;
    if (entry.col === "amount")   return inputs.length >= 3 ? inputs[inputs.length - 3] : null;
    return null;
  }

  /** input ที่ผูกกับ <label> ที่มีข้อความนี้ */
  function byLabelText(entry) {
    var labels = entry.labels || [];
    for (var i = 0; i < labels.length; i++) {
      var want = labels[i];
      var lbs = document.querySelectorAll("label");
      for (var j = 0; j < lbs.length; j++) {
        var lt = txt(lbs[j]);
        if (lt !== want && lt.replace(/\s*\*$/, "") !== want) continue;
        // 1) label[for=...]
        var fr = lbs[j].getAttribute("for");
        if (fr) {
          var byFor = document.getElementById(fr);
          if (byFor) return byFor;
        }
        // 2) input ที่อยู่ในกล่องเดียวกัน
        var wrap = lbs[j].closest(".MuiFormControl-root, .MuiAutocomplete-root, .x-form-item, div");
        var f = wrap && wrap.querySelector("input, textarea, select");
        if (f) return f;
      }
    }
    return null;
  }

  /** input ที่ placeholder ตรง (MUI ใส่ placeholder = ชื่อฟิลด์) */
  function byPlaceholder(entry) {
    var phs = entry.ph || [];
    for (var i = 0; i < phs.length; i++) {
      var el = document.querySelector('input[placeholder="' + esc(phs[i]) + '"]');
      if (el) return el;
    }
    return null;
  }

  /** checkbox ที่มีข้อความกำกับ (เว็บใหม่ checkbox ไม่มี id) */
  function byCheckboxLabel(entry) {
    var wants = entry.chkLabel || [];
    if (!wants.length) return null;
    var boxes = document.querySelectorAll('input[type="checkbox"], input[type="radio"]');
    for (var i = 0; i < boxes.length; i++) {
      var wrap = boxes[i].closest("label, .MuiFormControlLabel-root, .x-form-type-checkbox, .x-form-type-radio");
      var t = wrap ? txt(wrap) : "";
      for (var j = 0; j < wants.length; j++) {
        if (t === wants[j] || t.indexOf(wants[j]) !== -1) return boxes[i];
      }
    }
    return null;
  }

  /**
   * radio ในกลุ่มที่มี label ตรง
   * จำเป็นมากบนเว็บใหม่ — radio 17 ตัวใช้ name เดียวกันหมด
   */
  function radioGroupEls(entry) {
    var wants = entry.radioGroupLabel || [];
    for (var i = 0; i < wants.length; i++) {
      var fcs = document.querySelectorAll(".MuiFormControl-root, .x-form-item, fieldset");
      for (var j = 0; j < fcs.length; j++) {
        if ((fcs[j].textContent || "").indexOf(wants[i]) === -1) continue;
        var rs = fcs[j].querySelectorAll('input[type="radio"]');
        if (rs.length >= 2 && rs.length <= 6) return [].slice.call(rs);
      }
    }
    // เว็บเก่า: หาโดยตรงจาก name
    var byName = document.querySelectorAll('input[type="radio"][name="tab1_rd-in_out"]');
    return byName.length ? [].slice.call(byName) : null;
  }

  /** ปุ่ม/แท็บ จากข้อความบนตัวมันเอง */
  function byOwnText(entry) {
    var wants = entry.ownText || [];
    if (!wants.length) return null;
    var els = document.querySelectorAll('button, a, [role="button"], input[type="submit"]');
    for (var i = 0; i < els.length; i++) {
      var t = txt(els[i]);
      for (var j = 0; j < wants.length; j++) if (t === wants[j]) return els[i];
    }
    return null;
  }

  function byTextRe(entry) {
    if (!entry.textRe) return null;
    var re = new RegExp(entry.textRe);
    var all = document.querySelectorAll("div,span,p,h1,h2,h3,td");
    for (var i = 0; i < all.length; i++) {
      if (all[i].children.length > 2) continue;
      if (re.test(txt(all[i]))) return all[i];
    }
    return null;
  }

  // ═════════════════════════════════════════════════════════
  // ตัวหาหลัก + cache
  // ═════════════════════════════════════════════════════════
  var _cache = new Map();
  var _epoch = 0;
  var MISS_TTL_MS = 1000;
  var _listeners = [];

  function bumpEpoch(reason) {
    _epoch++;
    _cache.clear();
    dbg("cache ล้าง (" + reason + ") epoch=" + _epoch);
    _listeners.forEach(function (fn) { safe(fn, null); });
  }

  function alive(el) {
    if (!el) return false;
    if (el.isExtCmp) return !el.cmp.destroyed;
    return !!(el.isConnected);
  }

  /** ค่า override จาก server: CFG().selectors[key] = string | {cmpIds:[],domIds:[],...} */
  function merged(key) {
    var base = REGISTRY[key];
    if (!base) return null;
    var ov = (CFG().selectors || {})[key];
    if (!ov) return base;
    if (typeof ov === "string") {
      // string เดียว — เดาชนิดจาก shape ของ key
      var add = {};
      var f = (base.shape === "css") ? "css" : (base.shape === "cmpId") ? "cmpIds" : "domIds";
      add[f] = [ov].concat(base[f] || []);
      return Object.assign({}, base, add);
    }
    var out = Object.assign({}, base);
    ["cmpIds", "domIds", "css", "names", "ph", "labels", "chkLabel", "ownText"].forEach(function (f) {
      if (Array.isArray(ov[f])) out[f] = ov[f].concat(base[f] || []);
    });
    if (ov.row) out.row = ov.row;
    if (ov.col) out.col = ov.col;
    return out;
  }

  var STRATEGIES = [
    ["extId", function (e) {
      var ids = e.cmpIds || [];
      for (var i = 0; i < ids.length; i++) {
        var c = getExtCmp(ids[i]);
        if (c) return { isExtCmp: true, cmp: c, el: safe(function () { return c.inputEl && c.inputEl.dom; }, null) };
      }
      return null;
    }],
    ["domId", function (e) {
      var ids = e.domIds || [];
      for (var i = 0; i < ids.length; i++) {
        if (isVolatileId(ids[i])) continue;
        var el = document.getElementById(ids[i]);
        if (el) return el;
      }
      return null;
    }],
    ["css", function (e) {
      var cs = e.css || [];
      for (var i = 0; i < cs.length; i++) {
        var el = safe(function () { return document.querySelector(cs[i]); }, null);
        if (el) return el;
      }
      return null;
    }],
    ["name", function (e) {
      var ns = e.names || [];
      for (var i = 0; i < ns.length; i++) {
        var el = document.querySelector('[name="' + esc(ns[i]) + '"]');
        if (el) return el;
      }
      return null;
    }],
    // radio group — เจาะจงด้วย label ของกลุ่ม (เว็บใหม่ทุกกลุ่มใช้ name ซ้ำกัน)
    // คืน radio ที่ถูกเลือกอยู่ ถ้ายังไม่เลือกคืนตัวแรก เพื่อให้ el()/read() ใช้งานได้
    ["radioGroup", function (e) {
      if (!e.radioGroupLabel) return null;
      var rs = radioGroupEls(e);
      if (!rs || !rs.length) return null;
      for (var i = 0; i < rs.length; i++) if (domChecked(rs[i])) return rs[i];
      return rs[0];
    }],
    ["placeholder", byPlaceholder],
    ["rowColumn", byRowColumn],
    ["labelText", byLabelText],
    ["checkboxLabel", byCheckboxLabel],
    ["ownText", byOwnText],
    ["textRe", byTextRe],
  ];

  function resolve(key) {
    var cached = _cache.get(key);
    if (cached && cached.epoch === _epoch) {
      if (cached.hit && alive(cached.hit)) return cached.hit;
      if (!cached.hit && (Date.now() - cached.at) < MISS_TTL_MS) return null;
      _cache.delete(key);
    }

    var entry = merged(key);
    if (!entry) return null;
    if (entry.shape === "literal") return null;

    var hit = null, via = null;
    for (var i = 0; i < STRATEGIES.length; i++) {
      var r = safe(function () { return STRATEGIES[i][1](entry); }, null);
      if (r) { hit = r; via = STRATEGIES[i][0]; break; }
    }

    _cache.set(key, { epoch: _epoch, hit: hit, via: via, at: Date.now() });
    if (hit && CFG().debug) dbg("resolve " + key + " ← " + via);
    return hit;
  }

  function elOf(key) {
    var h = resolve(key);
    if (!h) return null;
    return h.isExtCmp ? h.el : h;
  }
  function cmpOf(key) {
    var h = resolve(key);
    return (h && h.isExtCmp) ? h.cmp : null;
  }

  // ═════════════════════════════════════════════════════════
  // อ่าน / เขียน
  // ═════════════════════════════════════════════════════════
  function read(key) {
    var h = resolve(key);
    if (!h) return "";
    if (h.isExtCmp) {
      var v = safe(function () { return h.cmp.getValue(); }, null);
      if (v !== null && v !== undefined && v !== "") return String(v);
      return h.el ? String(h.el.value || "") : "";
    }
    if (h.tagName === "INPUT" || h.tagName === "TEXTAREA" || h.tagName === "SELECT") {
      return String(h.value || "");
    }
    return txt(h);   // element ที่เป็นข้อความอย่างเดียว
  }

  function write(key, value) {
    var h = resolve(key);
    if (!h) return false;
    var v = (value === null || value === undefined) ? "" : value;
    if (h.isExtCmp && typeof h.cmp.setValue === "function") {
      safe(function () { h.cmp.setValue(v); }, null);
      return true;
    }
    var el = h.isExtCmp ? h.el : h;
    if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return false;
    if (String(el.value) === String(v)) return false;   // เท่าเดิม ไม่ต้องแตะ
    setNativeValue(el, String(v));
    return true;
  }

  function isChecked(key) {
    var h = resolve(key);
    if (!h) return false;
    if (h.isExtCmp) {
      var v = safe(function () { return h.cmp.getValue(); }, null);
      if (typeof v === "boolean") return v;
    }
    var el = h.isExtCmp ? h.el : h;
    return domChecked(el);
  }

  function setChecked(key, want) {
    var h = resolve(key);
    if (!h) return false;
    if (h.isExtCmp && typeof h.cmp.setValue === "function") {
      safe(function () { h.cmp.setValue(!!want); }, null);
      return true;
    }
    var el = h.isExtCmp ? h.el : h;
    if (!el) return false;
    if (domChecked(el) === !!want) return false;
    el.click();     // React/MUI ต้องผ่าน click ถึงจะอัปเดต state
    return true;
  }

  /**
   * สถานะติ๊กของ input — ใช้แทน el.checked ตรงๆ ทุกที่
   *
   * เว็บใหม่ (MUI) radio ทั้ง 17 ตัวในหน้าใช้ name="radio-buttons-group" ร่วมกันหมด
   * เบราว์เซอร์จึงยอมให้ checked จริงได้แค่ตัวเดียวทั้งหน้า → พอ React set หลายตัว
   * ผลลัพธ์คือ input.checked เป็น false ทั้ง 17 ตัว (ยืนยันบนหน้าจริงแล้ว)
   * สถานะที่แสดงจริงอยู่ที่ class "Mui-checked" ของ span ที่ครอบ input
   *
   * checkbox ไม่โดนปัญหานี้ (name ไม่ซ้ำ) — el.checked ยังเชื่อได้ แต่เช็ค class เผื่อไว้ไม่เสียหาย
   */
  function domChecked(el) {
    if (!el) return false;
    if (el.checked) return true;
    var box = safe(function () {
      return el.closest(".PrivateSwitchBase-root, .MuiRadio-root, .MuiCheckbox-root, .MuiSwitch-root");
    }, null);
    return !!(box && box.classList && box.classList.contains("Mui-checked"));
  }

  /** ค่าที่เลือกอยู่ของ radio group (คืน value เช่น "ใน" / "นอก") */
  function radioValue(groupKey) {
    var entry = merged(groupKey);
    if (!entry) return "";
    // เว็บเก่า: Ext radiogroup
    var cmp = cmpOf(groupKey);
    if (cmp && typeof cmp.getValue === "function") {
      var v = safe(function () { return cmp.getValue(); }, null);
      if (v && typeof v === "object") {
        for (var k in v) if (v[k] !== undefined && v[k] !== null) return String(v[k]);
      }
    }
    var rs = radioGroupEls(entry);
    if (!rs) return "";
    for (var i = 0; i < rs.length; i++) if (domChecked(rs[i])) return String(rs[i].value || "");
    return "";
  }

  function setRadioValue(groupKey, value) {
    var entry = merged(groupKey);
    var rs = entry && radioGroupEls(entry);
    if (!rs) return false;
    for (var i = 0; i < rs.length; i++) {
      if (String(rs[i].value) === String(value)) {
        if (domChecked(rs[i])) return false;
        rs[i].click();
        return true;
      }
    }
    return false;
  }

  // ═════════════════════════════════════════════════════════
  // SEL proxy — ให้โค้ดเดิมใน content.js ใช้ต่อได้โดยไม่ต้องแก้ทุกบรรทัด
  //   คืน "string ชนิดเดิม" เสมอ ถ้า resolve ไม่ได้ก็คืนค่า legacy
  //   (ห้ามคืน undefined — querySelector(undefined) จะ throw)
  // ═════════════════════════════════════════════════════════
  var SEL = new Proxy({}, {
    get: function (_, key) {
      if (typeof key !== "string") return undefined;
      var e = REGISTRY[key];
      if (!e) return undefined;
      if (e.shape === "literal") return e.literal;
      var h = resolve(key);
      if (h) {
        if (e.shape === "cmpId" && h.isExtCmp) return h.cmp.id;
        var el = h.isExtCmp ? h.el : h;
        if (el && el.id && !isVolatileId(el.id)) {
          if (e.shape === "domId") return el.id;
          if (e.shape === "css") return "#" + esc(el.id);
          if (e.shape === "cmpId") return el.id.replace(/-inputEl$/, "");
        }
      }
      // fallback = ค่าเดิมของเว็บเก่า
      if (e.shape === "cmpId") return (e.cmpIds || [])[0];
      if (e.shape === "domId") return (e.domIds || [])[0];
      if (e.shape === "css")   return (e.css || [])[0];
      return undefined;
    },
    has: function (_, k) { return typeof k === "string" && k in REGISTRY; },
    ownKeys: function () { return Reflect.ownKeys(REGISTRY); },
    getOwnPropertyDescriptor: function () { return { enumerable: true, configurable: true }; },
  });

  // ═════════════════════════════════════════════════════════
  // variant + selfTest
  // ═════════════════════════════════════════════════════════
  function variant() {
    if (hasExt()) return { id: "legacy", framework: "extjs" };
    if (findExpenseTable()) return { id: "v2", framework: "dom" };
    return { id: "unknown", framework: hasExt() ? "extjs" : "dom" };
  }

  function selfTest() {
    var rows = [], ok = 0, miss = [];
    Object.keys(REGISTRY).forEach(function (k) {
      var e = REGISTRY[k];
      if (e.shape === "literal") return;
      var h = resolve(k);
      var c = _cache.get(k);
      if (h) ok++; else if (!e.optional) miss.push(k);
      rows.push({
        key: k,
        "เจอ": h ? "✓" : (e.optional ? "– (ไม่บังคับ)" : "✗"),
        "วิธี": (c && c.via) || "",
        "ค่า": h ? String(read(k)).slice(0, 20) : "",
      });
    });
    var v = variant();
    console.log("%c" + TAG + " variant=" + v.id + " (" + v.framework + ")  เจอ " + ok + "/" + rows.length,
      "font-weight:bold");
    console.table(rows);
    if (miss.length) console.warn(TAG, "หาไม่เจอ (ที่จำเป็น):", miss.join(", "));
    return { variant: v, resolved: ok, total: rows.length, missing: miss };
  }

  // ═════════════════════════════════════════════════════════
  // ล้าง cache เมื่อหน้าเปลี่ยน
  // ═════════════════════════════════════════════════════════
  window.addEventListener("isurvey-config-ready", function () { bumpEpoch("config-ready"); });
  window.addEventListener("isurvey-config-updated", function () { bumpEpoch("config-updated"); });
  window.addEventListener("popstate", function () { bumpEpoch("popstate"); });
  window.addEventListener("pageshow", function () { bumpEpoch("pageshow"); });

  // ═════════════════════════════════════════════════════════
  // ชื่อ → รหัส (จังหวัด/อำเภอ/ตำบล)
  //   เว็บเก่าอ่านค่าได้เป็นรหัสอยู่แล้ว · เว็บใหม่ combobox คืน "ชื่อ"
  //   แต่ตรรกะเรตทั้งหมดใช้รหัส จึงต้องแปลงกลับ
  //   ข้อมูลอ้างอิงมาจาก window.__ISURVEY_REF__ (loader.js โหลดจากไฟล์ในตัว extension)
  // ═════════════════════════════════════════════════════════
  var _rev = null;
  function reverseIndex() {
    var ref = window.__ISURVEY_REF__;
    if (!ref) return null;
    if (_rev && _rev.__src === ref) return _rev;
    function invert(dict) {
      var out = {};
      for (var id in (dict || {})) {
        var nm = String(dict[id] || "").trim();
        if (!nm) continue;
        (out[nm] = out[nm] || []).push(String(id));
      }
      return out;
    }
    _rev = {
      __src: ref,
      province: invert(ref.byProvinceId),
      amphur: invert(ref.byAmphurId),
      tumbon: invert(ref.byTumbonId),
    };
    return _rev;
  }

  /** ตัดคำนำหน้าที่หน้าเว็บใส่มาแต่ไม่มีในฐานข้อมูล */
  function stripAreaPrefix(name) {
    return String(name || "")
      .replace(/^(จังหวัด|เขต\/อำเภอ|เขต|อำเภอ|ตำบล|แขวง|จ\.|อ\.|ต\.)\s*/, "")
      .trim();
  }

  function lookupId(level, name, parentId) {
    var raw = String(name || "").trim();
    if (!raw) return "";
    if (/^\d+$/.test(raw)) return raw;          // เป็นรหัสอยู่แล้ว
    var idx = reverseIndex();
    if (!idx) return "";
    var dict = idx[level] || {};
    var ids = dict[raw] || dict[stripAreaPrefix(raw)] || [];
    if (!ids.length) return "";
    if (ids.length === 1) return ids[0];
    if (parentId) {
      var under = ids.filter(function (id) { return id.indexOf(String(parentId)) === 0; });
      if (under.length) return under[0];
    }
    return ids[0];
  }

  var LEVEL_OF = { provinceHidden: "province", amphurHidden: "amphur", tumbonHidden: "tumbon" };

  /** อ่านที่ตั้งแล้วคืนเป็น "รหัส" เสมอ ไม่ว่าหน้าเว็บจะเก็บเป็นรหัสหรือชื่อ */
  function locationId(key) {
    var raw = String(read(key) || "").trim();
    if (!raw) return "";
    if (/^\d+$/.test(raw)) return raw;
    var level = LEVEL_OF[key];
    if (!level) return raw;
    var parent = (level === "province") ? "" : locationId("provinceHidden");
    return lookupId(level, raw, parent);
  }

  // ═════════════════════════════════════════════════════════
  // SEInject — แทรกฟิลด์ของเราเองลงหน้าเว็บ (เฉพาะโหมด DOM)
  //   เว็บเก่ายังใช้ ExtJS container.insert() ในไฟล์ feature เหมือนเดิม
  //   ตัวนี้ใช้เฉพาะเว็บใหม่ที่ไม่มี Ext ให้พึ่ง
  //   หลักการ: element ที่สร้างมี id ของเราเอง → idempotent (มีอยู่แล้วไม่สร้างซ้ำ)
  // ═════════════════════════════════════════════════════════
  var INJ_CLASS = "se-billing-injected";

  function styleLike(src, el) {
    // ลอกหน้าตาจากช่องข้างๆ ให้กลมกลืน (ขนาดตัวอักษร/ขอบ/ความสูง)
    safe(function () {
      var cs = getComputedStyle(src);
      el.style.font = cs.font;
      el.style.height = cs.height;
      el.style.padding = "4px 8px";
      el.style.border = "1px solid rgba(0,0,0,0.23)";
      el.style.borderRadius = "4px";
      el.style.boxSizing = "border-box";
    }, null);
  }

  var SEInject = {
    /** โหมด DOM เท่านั้น — เว็บเก่าให้ feature file จัดการเองด้วย Ext */
    domMode: function () { return !hasExt(); },

    get: function (id) { return document.getElementById(id); },

    remove: function (id) {
      var el = document.getElementById(id);
      var host = el && el.closest("." + INJ_CLASS);
      if (host) host.remove();
      else if (el) el.remove();
      return !!el;
    },

    /**
     * แทรกช่องกรอกตัวเลขต่อท้าย element ที่กำหนด (idempotent)
     * คืน element ของช่อง หรือ null ถ้าแทรกไม่ได้
     */
    numberField: function (opts) {
      var existing = document.getElementById(opts.id);
      if (existing) return existing;
      var after = opts.after;
      if (!after || !after.parentNode) return null;

      var wrap = document.createElement("span");
      wrap.className = INJ_CLASS;
      wrap.style.cssText = "display:inline-flex;align-items:center;gap:4px;margin-left:8px;vertical-align:middle";

      var input = document.createElement("input");
      input.type = "text";
      input.inputMode = "decimal";
      input.id = opts.id;
      input.placeholder = opts.placeholder || "ยอดเงิน (บาท)";
      input.style.width = (opts.width || 110) + "px";
      styleLike(after.tagName === "INPUT" ? after : (after.querySelector("input") || after), input);
      if (opts.title) input.title = opts.title;

      wrap.appendChild(input);
      if (opts.suffix) {
        var s = document.createElement("span");
        s.textContent = opts.suffix;
        s.style.cssText = "font-size:12px;opacity:.7";
        wrap.appendChild(s);
      }

      var anchor = opts.wrapAnchor ? (after.closest(opts.wrapAnchor) || after) : after;
      anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
      if (typeof opts.onInput === "function") input.addEventListener("input", opts.onInput);
      return input;
    },

    /** แทรก checkbox พร้อมข้อความกำกับ (idempotent) */
    checkbox: function (opts) {
      var existing = document.getElementById(opts.id);
      if (existing) return existing;
      var into = opts.into;
      if (!into) return null;

      var label = document.createElement("label");
      label.className = INJ_CLASS;
      label.style.cssText = "display:inline-flex;align-items:center;gap:3px;margin-left:8px;font-size:13px;white-space:nowrap;cursor:pointer";

      var box = document.createElement("input");
      box.type = "checkbox";
      box.id = opts.id;
      box.style.cssText = "margin:0;cursor:pointer";

      var txtEl = document.createElement("span");
      txtEl.textContent = opts.label || "";

      label.appendChild(box);
      label.appendChild(txtEl);
      into.appendChild(label);
      if (typeof opts.onChange === "function") box.addEventListener("change", opts.onChange);
      return box;
    },

    /** cell ในตารางค่าใช้จ่าย: หาแถวจากข้อความ แล้วคืน <td> ตามคอลัมน์ */
    tableCell: function (rowLabel, col) {
      var table = findExpenseTable();
      if (!table) return null;
      var row = findRowByLabel(table, rowLabel);
      if (!row) return null;
      var map = columnIndexMap(table);
      var idx = map ? map[col] : undefined;
      if (idx === undefined) return null;
      return row.children[idx] || null;
    },

    tableRow: function (rowLabel) {
      var table = findExpenseTable();
      if (!table) return null;
      return findRowByLabel(table, rowLabel);
    },

    /** อ่านค่าตัวเลขจากช่องที่เราแทรก — คืน null ถ้าไม่มี/ว่าง/ไม่ใช่ตัวเลข */
    numberValue: function (id) {
      var el = document.getElementById(id);
      if (!el) return null;
      var v = String(el.value || "").replace(/,/g, "").trim();
      if (!v) return null;
      var n = Number(v);
      return isNaN(n) ? null : n;
    },
  };

  // ═════════════════════════════════════════════════════════
  window.SEInject = SEInject;
  window.SEResolve = {
    version: VERSION,
    el: elOf,
    lookupId: lookupId,
    locationId: locationId,
    cmp: cmpOf,
    read: read,
    write: write,
    isChecked: isChecked,
    domChecked: domChecked,   // อ่านสถานะติ๊กของ element ที่มีอยู่แล้ว (ไม่ผ่าน registry)
    setChecked: setChecked,
    radioValue: radioValue,
    setRadioValue: setRadioValue,
    setNativeValue: setNativeValue,
    SEL: SEL,
    REGISTRY: REGISTRY,
    variant: variant,
    selfTest: selfTest,
    invalidate: function (reason) { bumpEpoch(reason || "manual"); },
    onChange: function (fn) {
      _listeners.push(fn);
      return function () { _listeners = _listeners.filter(function (f) { return f !== fn; }); };
    },
    epoch: function () { return _epoch; },
    hasExt: hasExt,
    isVolatileId: isVolatileId,
    findExpenseTable: findExpenseTable,
    columnIndexMap: columnIndexMap,
    findRowByLabel: findRowByLabel,
  };

  dbg("พร้อมใช้งาน " + VERSION + " — variant =", variant().id, "· keys =", Object.keys(REGISTRY).length);
})();
