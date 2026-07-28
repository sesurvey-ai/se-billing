/**
 * probe-isurvey.js  —  ตัวสำรวจโครงสร้างหน้า isurvey
 * ─────────────────────────────────────────────────────────────
 * ใช้ทำอะไร: เก็บ "แผนที่" ของหน้าเว็บ (framework, id ของฟิลด์, โครงสร้างแถว)
 *            เพื่อเอาไปทำ selector registry ให้ extension ทำงานได้ทั้งเว็บเก่า/ใหม่
 *
 * วิธีใช้ (ทำ 2 รอบ: เว็บเก่า 1 รอบ, เว็บใหม่ 1 รอบ)
 *   1. เปิดหน้าเคลม isurvey ให้เห็นแท็บที่มีช่อง "ค่าบริการ / ค่าเดินทาง / ค่าเรียกร้อง"
 *      (ต้องเปิดแท็บนั้นค้างไว้ — ExtJS ทำลาย component ของแท็บที่ไม่ได้เปิด)
 *   2. กด F12 → แท็บ Console
 *   3. ถ้า Console ขึ้นข้อความให้พิมพ์ "allow pasting" ให้พิมพ์แล้ว Enter ก่อน
 *   4. วางไฟล์นี้ทั้งไฟล์ → Enter
 *   5. ผลลัพธ์จะถูกคัดลอกเข้า clipboard อัตโนมัติ → เอาไปวางส่งกลับมา
 *      (ถ้าคัดลอกไม่สำเร็จ ให้พิมพ์  copy(__SE_PROBE__)  แล้ว Enter)
 *
 * ความเป็นส่วนตัว: ไม่เก็บ "ค่า" ในช่องกรอกใดๆ (ไม่มีเลขเคลม ชื่อลูกค้า ยอดเงิน)
 *                  เก็บแค่ id / ชนิดช่อง / ข้อความ label / ตำแหน่ง เท่านั้น
 */
(function () {
  "use strict";

  var SCHEMA_VERSION = 1;
  var MAX_COMPONENTS = 1500;
  var MAX_DOM_IDS    = 2000;

  // ─────────────────────────────────────────────────────────
  // logical key ที่ extension ต้องใช้ → เบาะแสสำหรับตามหาบนหน้าใหม่
  //   token = ชิ้นส่วน id เดิมที่น่าจะยังเหลืออยู่
  //   label = ข้อความไทยที่อยู่ข้างช่องนั้น
  //   name  = ค่า attribute name (ทนต่อการเปลี่ยน id มากที่สุด)
  // ─────────────────────────────────────────────────────────
  var KEY_SPECS = [
    // ── ที่ตั้ง (hidden + combobox) ──
    { key: "provinceHidden",      legacy: "tab1_survey_provinceID",     tokens: ["survey_provinceID", "provinceID"], labels: ["จังหวัด"],                 kind: "hidden" },
    { key: "amphurHidden",        legacy: "tab1_survey_amphurID",       tokens: ["survey_amphurID", "amphurID"],     labels: ["อำเภอ"],                   kind: "hidden" },
    { key: "tumbonHidden",        legacy: "tab1_survey_tumbonID",       tokens: ["survey_tumbonID", "tumbonID"],     labels: ["ตำบล"],                    kind: "hidden" },
    { key: "provinceCmpId",       legacy: "tab1_survey_provinceID",     tokens: ["survey_provinceID"],               labels: ["จังหวัดที่ตรวจสอบ", "จังหวัด"], kind: "combo" },
    { key: "amphurCmpId",         legacy: "tab1_survey_amphurID",       tokens: ["survey_amphurID"],                 labels: ["อำเภอที่ตรวจสอบ", "อำเภอ"],  kind: "combo" },
    { key: "tumbonCmpId",         legacy: "tab1_survey_tumbonID",       tokens: ["survey_tumbonID"],                 labels: ["ตำบลที่ตรวจสอบ", "ตำบล"],   kind: "combo" },

    // ── ตารางค่าใช้จ่าย ──
    //  ช่องเงินในตารางนี้ "ใช้ label ร่วมกันทั้งแถว" — แยกกันได้ด้วยคอลัมน์เท่านั้น
    //  จึงต้องระบุ row (ข้อความหัวแถว) + col (จำนวน / เสนอ / อนุมัติ)
    { key: "feeCmpId",            legacy: "tab1_SUR_INVEST",            tokens: ["SUR_INVEST"],                      labels: ["ค่าบริการ"],               kind: "field", anchor: true, row: "ค่าบริการ",      col: "proposed" },
    { key: "insInvestCmpId",      legacy: "tab1_INS_INVEST",            tokens: ["INS_INVEST"],                      labels: ["ค่าบริการ"],               kind: "field",               row: "ค่าบริการ",      col: "approved" },
    { key: "insTransCmpId",       legacy: "tab1_INS_TRANS",             tokens: ["INS_TRANS"],                       labels: ["ค่าเดินทาง", "ค่าพาหนะ"],   kind: "field",               row: "ค่าเดินทาง",     col: "approved" },
    { key: "insPhotoCmpId",       legacy: "tab1_INS_PHOTO",             tokens: ["INS_PHOTO"],                       labels: ["ค่ารูปถ่าย", "ค่าภาพถ่าย"], kind: "field",               row: "ค่ารูปถ่าย",     col: "approved" },
    { key: "recvClaimCmpId",      legacy: "tab1_RECV_CLAIM",            tokens: ["RECV_CLAIM"],                      labels: ["ค่าเรียกร้อง"],            kind: "field", anchor: true, row: "ค่าเรียกร้อง",   col: "amount" },
    { key: "surClaimCmpId",       legacy: "tab1_SUR_CLAIM",             tokens: ["SUR_CLAIM"],                       labels: ["ค่าเรียกร้อง"],            kind: "field",               row: "ค่าเรียกร้อง",   col: "proposed" },
    { key: "insClaimCmpId",       legacy: "tab1_INS_CLAIM",             tokens: ["INS_CLAIM"],                       labels: ["ค่าเรียกร้อง"],            kind: "field",               row: "ค่าเรียกร้อง",   col: "approved" },
    { key: "dailyNumCmpId",       legacy: "tab1_DAILY_NUM",             tokens: ["DAILY_NUM"],                       labels: ["ค่าคัดประจำวัน"],          kind: "field", anchor: true, row: "ค่าคัดประจำวัน", col: "amount" },
    { key: "surDailyCmpId",       legacy: "tab1_SUR_DAILY",             tokens: ["SUR_DAILY"],                       labels: ["ค่าคัดประจำวัน"],          kind: "field",               row: "ค่าคัดประจำวัน", col: "proposed" },
    { key: "insDailyCmpId",       legacy: "tab1_INS_DAILY",             tokens: ["INS_DAILY"],                       labels: ["ค่าคัดประจำวัน"],          kind: "field",               row: "ค่าคัดประจำวัน", col: "approved" },

    // ── checkbox / radio ที่ extension เกาะ ──
    { key: "outOfAreaCmpId",      legacy: "tab1_chk_co_area",           tokens: ["chk_co_area", "co_area"],          labels: ["นอกพื้นที่"],              kind: "checkbox", anchor: true },
    { key: "inOutGroupCmpId",     legacy: "tab1_grd-in_out",            tokens: ["grd-in_out", "in_out"],            labels: ["ใน/นอกเวลางาน", "นอกเวลา"], kind: "radiogroup", anchor: true },
    { key: "inOutRadioName",      legacy: "tab1_rd-in_out",             tokens: ["rd-in_out"],                       labels: ["นอก", "ใน"],               kind: "radioname" },
    { key: "closeCaseInputId",    legacy: "close_case",                 tokens: ["close_case"],                      labels: ["ปิดการตรวจสอบ"],           kind: "radio" },
    { key: "cancelCaseInputId",   legacy: "cancel_case",                tokens: ["cancel_case"],                     labels: ["ยกเลิกเคลม"],              kind: "radio" },

    // ── ข้อมูลเคลม / ผู้สำรวจ ──
    { key: "mtypeIdCmpId",        legacy: "tab1_claim_MtypeID",         tokens: ["claim_MtypeID", "MtypeID"],        labels: ["ประเภทเคลม", "ประเภทงาน"],  kind: "combo" },
    { key: "serviceTypeCmpId",    legacy: "tab1_service_type",          tokens: ["service_type"],                    labels: ["ประเภทบริการ"],            kind: "combo" },
    { key: "surveyorNameCmpId",   legacy: "tab1_surveyor_name",         tokens: ["surveyor_name"],                   labels: ["ชื่อผู้ปฏิบัติงาน", "ผู้สำรวจ", "เจ้าหน้าที่"], kind: "field" },
    { key: "surveyorCodeInputId", legacy: "(เว็บเก่ารวมอยู่ในชื่อผู้สำรวจ)", tokens: ["surveyor_code"],                labels: ["รหัส"],                    kind: "field" },
    { key: "ossCompanyInputId",   legacy: "tab1_OSS_company",           tokens: ["OSS_company"],                     labels: ["บริษัท"],                  kind: "field" },
    { key: "claimNoInputId",      legacy: "tab1_claim_no",              tokens: ["claim_no"],                        labels: ["เลขที่เคลม", "เลขเคลม"],    kind: "field" },
    { key: "surveyNoInputId",     legacy: "tab1_survey_no",             tokens: ["survey_no"],                       labels: ["เลขที่เซอร์เวย์", "เลขเซอร์เวย์", "เลขที่เซอเวย์", "เลขเซอเวย์"], kind: "field" },
    { key: "notifyNoInputId",     legacy: "(ไม่มีในเว็บเก่า)",           tokens: ["notify_no"],                       labels: ["เลขที่รับแจ้ง", "เลขรับแจ้ง"],  kind: "field" },
    { key: "policyNoInputId",     legacy: "tab1_policy_no",             tokens: ["policy_no"],                       labels: ["เลขที่กรมธรรม์", "กรมธรรม์"],   kind: "field" },
    { key: "dispatchTypeCmpId",   legacy: "(ไม่มีในเว็บเก่า)",           tokens: ["dispatch_type"],                   labels: ["ประเภทการจ่ายงาน"],           kind: "combo" },
    { key: "dispatchDateInputId", legacy: "tab1_dispatch_date",         tokens: ["dispatch_date"],                   labels: ["จ่ายงานเวลา", "วันจ่ายงาน"], kind: "field" },
    { key: "dispatchTimeInputId", legacy: "tab1_dispatch_time",         tokens: ["dispatch_time"],                   labels: ["เวลาจ่ายงาน"],             kind: "field" },

    // ── โครงหน้า ──
    { key: "headerTitleId",       legacy: "main-tab_header-title-textEl", tokens: ["header-title"],                  labels: [],                          kind: "text",   textRe: "^\\s*Hi\\s*," },
    { key: "saveButtonId",        legacy: "tab1_save",                  tokens: ["tab1_save", "_save"],              labels: ["ยืนยันการตรวจสอบ", "บันทึก"], kind: "button" },
    { key: "tab1CmpId",           legacy: "tab-1_clone",                tokens: ["tab-1_clone", "tab-1"],            labels: ["Summary", "สรุป"],          kind: "tab" },
    { key: "tab2CmpId",           legacy: "tab-2_clone",                tokens: ["tab-2_clone", "tab-2"],            labels: ["Accident Info", "อุบัติเหตุ"], kind: "tab" },
    { key: "tab3CmpId",           legacy: "tab-3_clone",                tokens: ["tab-3_clone", "tab-3"],            labels: ["Insurance Info", "ประกัน"],  kind: "tab" },
  ];

  // id ที่ extension สร้างเอง — ไม่ต้องตามหา (กันสับสนตอนอ่านผล)
  var OWN_IDS = [
    "tab1_chk_co_area_amount", "tab1_rd_out_amount", "tab1_deduct_row", "tab1_deduct_amount",
    "tab1_deduct_late_submit", "tab1_deduct_incomplete_docs", "tab1_deduct_warning",
    "tab1_chk_sub_area", "tab1_daily_check_group", "tab1_daily_chk_right",
    "tab1_daily_chk_wrong", "tab1_daily_chk_wait",
  ];

  var ROW_LABELS = ["ค่าบริการ", "ค่าเดินทาง", "ค่ารูปถ่าย", "ค่าคัดประจำวัน", "ค่าเรียกร้อง"];

  // ข้อความทั้งหมดที่ใช้เป็นเบาะแส — ใช้คัดว่า element ไหนควรเก็บเข้า dump
  var ALL_LABELS = (function () {
    var s = [];
    KEY_SPECS.forEach(function (k) { (k.labels || []).forEach(function (l) { if (s.indexOf(l) < 0) s.push(l); }); });
    return s;
  })();

  // ── helpers ──────────────────────────────────────────────
  function hasExt() {
    return typeof window.Ext !== "undefined" && !!window.Ext.getCmp;
  }
  function safe(fn, dflt) {
    try { var v = fn(); return v === undefined ? dflt : v; } catch (e) { return dflt; }
  }
  function txt(el) {
    return safe(function () { return (el.textContent || "").replace(/\s+/g, " ").trim(); }, "");
  }
  /** ไม่เก็บค่าจริง — เก็บแค่ว่ามีค่าไหม/ยาวเท่าไร */
  function redact(v) {
    if (v === null || v === undefined || v === "") return { has: false, len: 0 };
    return { has: true, len: String(v).length };
  }

  // ── 1. framework ─────────────────────────────────────────
  function detectFramework() {
    var out = { kind: "dom", version: null, evidence: [] };
    if (hasExt()) {
      out.kind = "extjs";
      out.version = safe(function () { return Ext.getVersion().version; }, "unknown");
      out.evidence.push("Ext.getCmp");
      if (safe(function () { return !!Ext.ComponentQuery; }, false)) out.evidence.push("Ext.ComponentQuery");
      if (safe(function () { return !!Ext.ComponentManager; }, false)) out.evidence.push("Ext.ComponentManager");
    }
    if (window.React || document.querySelector("[data-reactroot],#root>[class]")) out.evidence.push("react?");
    if (window.Vue || document.querySelector("[data-v-app],#app[data-v]")) out.evidence.push("vue?");
    if (window.angular || document.querySelector("[ng-version]")) out.evidence.push("angular?");
    if (window.jQuery) out.evidence.push("jquery " + safe(function () { return jQuery.fn.jquery; }, "?"));
    out.extClasses = document.querySelectorAll(".x-form-item, .x-panel, .x-field").length;
    return out;
  }

  // ── 2. ExtJS component dump ──────────────────────────────
  function dumpComponents() {
    if (!hasExt() || !safe(function () { return !!Ext.ComponentManager.getAll; }, false)) return null;
    var all = safe(function () { return Ext.ComponentManager.getAll(); }, []) || [];
    var out = [], truncated = false;
    for (var i = 0; i < all.length; i++) {
      var c = all[i];
      var id = safe(function () { return c.id; }, "") || "";
      var fl = safe(function () { return c.fieldLabel; }, "") || "";
      var bl = safe(function () { return c.boxLabel; }, "") || "";
      var nm = safe(function () { return c.name; }, "") || "";
      // เก็บเฉพาะตัวที่มีเบาะแส — ไม่งั้นได้ component ภายในของ Ext เป็นพัน
      if (!/tab|save|clone|header|survey|claim|INS_|SUR_|RECV|DAILY|chk_|rd_|grd/i.test(id) && !fl && !bl && !nm) continue;
      if (out.length >= MAX_COMPONENTS) { truncated = true; break; }
      out.push({
        id: id,
        xtype: safe(function () { return c.xtype || (c.getXType && c.getXType()); }, "") || "",
        name: nm,
        fieldLabel: fl,
        boxLabel: bl,
        inputValue: safe(function () { return c.inputValue == null ? "" : String(c.inputValue); }, ""),
        ownerCtId: safe(function () { return c.ownerCt && c.ownerCt.id; }, null),
        layout: safe(function () { return c.layout && c.layout.type; }, null),
        x: safe(function () { return c.x; }, null),
        y: safe(function () { return c.y; }, null),
        width: safe(function () { return c.getWidth && c.getWidth(); }, null),
        hidden: safe(function () { return !!c.hidden; }, null),
        rendered: safe(function () { return !!c.rendered; }, null),
        value: redact(safe(function () { return c.getValue && c.getValue(); }, null)),
      });
    }
    return { count: all.length, kept: out.length, truncated: truncated, items: out };
  }

  // ── 3. DOM dump — ทั้ง [id] และ element ที่มีแค่ name ────
  //     (radio ของ isurvey มี name แต่ไม่มี id — ถ้าดูแค่ [id] จะมองไม่เห็น)
  function dumpDomIds() {
    var els = document.querySelectorAll("[id], input[name], select[name], textarea[name]");
    var out = [], seen = new Set(), truncated = false;
    for (var i = 0; i < els.length; i++) {
      if (out.length >= MAX_DOM_IDS) { truncated = true; break; }
      var el = els[i];
      if (seen.has(el)) continue;
      seen.add(el);
      var id = el.id || "";
      var nm = el.getAttribute("name") || "";
      var tag = el.tagName.toLowerCase();
      var isField = tag === "input" || tag === "select" || tag === "textarea";
      var interesting = /tab|save|clone|header|survey|claim|INS_|SUR_|RECV|DAILY|chk_|rd_|grd|case/i.test(id + " " + nm);

      // ปุ่ม/แท็บ/หัวข้อ อ้างด้วย "ข้อความของตัวเอง" ไม่ใช่ id — เก็บข้อความไว้ด้วย
      // (จำกัดเฉพาะ element เล็กๆ ไม่งั้นต้องไล่ textContent ของ div ก้อนใหญ่)
      var own = "";
      if (!isField && el.children.length <= 3) {
        var t0 = txt(el);
        if (t0 && t0.length <= 60) own = t0;
      }
      var textClue = own && (ALL_LABELS.some(function (l) { return own.indexOf(l) !== -1; }) || /^\s*Hi\s*,/.test(own));
      var clickable = tag === "button" || tag === "a" || el.getAttribute("role") === "button" ||
                      /btn|tab|nav/i.test(String(el.className || ""));

      if (!interesting && !isField && !textClue && !(clickable && own)) continue;
      out.push({
        id: id,
        tag: tag,
        text: own,
        type: el.getAttribute("type") || "",
        name: nm,
        inputValue: (el.getAttribute("type") === "radio" || el.getAttribute("type") === "checkbox")
          ? (el.getAttribute("value") || "") : "",   // radio ใช้ค่านี้แยก "ใน"/"นอก" — ไม่ใช่ข้อมูลเคลม
        readonly: el.hasAttribute("readonly"),
        cls: (el.className && String(el.className).slice(0, 120)) || "",
        // แอปสมัยใหม่มักไม่มี id ที่คงที่ — พวกนี้ทนกว่า
        testid: el.getAttribute("data-testid") || el.getAttribute("data-test") || "",
        aria: (el.getAttribute("aria-label") || "").slice(0, 40),
        ph: (el.getAttribute("placeholder") || "").slice(0, 40),
        label: nearestLabel(el),
        value: redact(el.value),
      });
    }
    return { total: els.length, kept: out.length, truncated: truncated, items: out };
  }

  /** หา label ที่อยู่ใกล้ element นี้ (ใช้เดา logical key ตอนไม่มี id ให้จับ) */
  function nearestLabel(el) {
    var lbl = safe(function () {
      var byFor = el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (byFor) return txt(byFor);
      var wrap = el.closest(".x-form-item, .x-field, tr, li, [class*='row'], [class*='field'], [class*='form']");
      if (!wrap) return "";
      var l = wrap.querySelector("label, .x-form-item-label, .x-form-cb-label, th, legend");
      if (l) return txt(l);
      // ไม่มี <label> — เว็บใหม่อาจใช้ <span> ธรรมดาเป็นคำอธิบายแถว
      // ไล่ sibling ก่อนหน้าที่มีข้อความสั้นๆ (เช่น <span class="desc">ค่าบริการ</span>)
      var p = el.previousElementSibling;
      while (p) {
        var t = txt(p);
        if (t && t.length <= 40 && !/^\d+\.?$/.test(t)) return t;   // ข้ามเลขลำดับ "1."
        p = p.previousElementSibling;
      }
      // ยังไม่เจอ — ใช้ข้อความสั้นตัวแรกใน wrapper
      var kids = wrap.children;
      for (var i = 0; i < kids.length; i++) {
        if (kids[i] === el || kids[i].contains(el)) break;
        var kt = txt(kids[i]);
        if (kt && kt.length <= 40 && !/^\d+\.?$/.test(kt)) return kt;
      }
      return "";
    }, "");
    return (lbl || "").slice(0, 60);
  }

  // ── 4. เดา logical key ───────────────────────────────────

  /**
   * จับคู่ช่องเงินในตารางค่าใช้จ่ายด้วย "แถว × คอลัมน์"
   * ช่องพวกนี้ใช้ label ร่วมกันทั้งแถว จึงหาด้วย label เฉยๆ ไม่ได้
   * กติกา: เรียง input ในแถวจากซ้าย→ขวา แล้วแมปตามจำนวนที่เจอ
   *   3 ช่อง = [จำนวน, เสนอ, อนุมัติ]  ·  2 ช่อง = [เสนอ, อนุมัติ]  ·  1 ช่อง = [อนุมัติ]
   * (ตรงกับตารางจริงทั้งหน้าเก่า: ค่าบริการ 2 ช่อง, ค่าเดินทาง 1 ช่อง, ค่าเรียกร้อง 3 ช่อง)
   */
  /**
   * id ที่ framework สร้างให้อัตโนมัติ — เปลี่ยนทุกครั้งที่ render ใหม่
   * ใช้เป็น selector ไม่ได้เด็ดขาด (React useId ":r2e:", MUI "mui-12", Radix, ExtJS auto)
   */
  function isVolatileId(id) {
    var s = String(id || "");
    return /^:r[0-9a-z]+:$/i.test(s)          // React useId
        || /^«.*»$/.test(s)                    // React (บาง build)
        || /^mui-\d+$/.test(s)                 // MUI
        || /^radix-/i.test(s)                  // Radix UI
        || /^headlessui-/i.test(s)             // Headless UI
        || /^(ext|panel|label|button|container|fieldset|toolbar|tab)-\d+$/i.test(s); // ExtJS auto-id
  }

  /** ตีความหัวคอลัมน์ไทย → ชื่อ semantic */
  function headerToCol(text) {
    var t = String(text || "");
    if (t.indexOf("อนุมัติ") !== -1) return "approved";
    if (t.indexOf("เสนอ") !== -1) return "proposed";
    if (t.indexOf("จำนวนเงิน") !== -1) return null;      // กำกวม — ต้องมีคำว่า เสนอ/อนุมัติ ด้วย
    if (t.indexOf("จำนวน") !== -1) return "amount";
    return null;
  }

  function buildRowColumnMap(rows) {
    var byLabel = {};
    (rows || []).forEach(function (r) {
      if (r.source !== "dom" || !r.found || !r.container) return;
      var kids = r.container.children || [];

      // ── กรณี A: แถวเป็นตารางจริง (<tr><td>) — input ซ่อนใน cell ──
      var cells = kids.filter(function (c) { return c.tag === "td" || c.tag === "th"; });
      var map = {}, mode = "", count = 0;

      if (cells.length) {
        mode = "cells";
        // ใช้หัวตารางบอกความหมายคอลัมน์ ถ้าไม่มีค่อยเดาจากตำแหน่งท้ายแถว
        var hdr = r.headerCells || null;
        cells.forEach(function (c, i) {
          var col = hdr && hdr[i] ? headerToCol(hdr[i]) : null;
          if (!col) {
            // ไม่มีหัวตาราง — คอลัมน์สองอันสุดท้ายคือ เสนอ/อนุมัติ อันก่อนหน้าคือ จำนวน
            if (i === cells.length - 1) col = "approved";
            else if (i === cells.length - 2) col = "proposed";
            else if (i === cells.length - 3) col = "amount";
          }
          if (!col) return;
          var f = (c.inputs || [])[0];
          if (f) { map[col] = f; count++; }
          else if (!map[col]) map[col] = { empty: true, cellText: c.text, cellIndex: i };
        });
      } else {
        // ── กรณี B: แถวเป็น container ธรรมดา — input เป็นลูกตรง ──
        mode = "flat";
        var inputs = kids.filter(function (c) {
          return c.tag === "input" || c.tag === "select" || c.tag === "textarea";
        }).slice().sort(function (a, b) { return (a.left || 0) - (b.left || 0); });
        var names = inputs.length >= 3 ? ["amount", "proposed", "approved"]
                  : inputs.length === 2 ? ["proposed", "approved"]
                  : inputs.length === 1 ? ["approved"] : [];
        names.forEach(function (n, i) { map[n] = inputs[i]; });
        count = inputs.length;
      }

      byLabel[r.label] = { map: map, count: count, mode: mode, header: r.headerCells || null };
    });
    return byLabel;
  }

  var COL_TH = { amount: "จำนวน", proposed: "เสนอ/เซอร์เวย์", approved: "อนุมัติ/ประกัน" };

  /** logical key ที่ extension "แค่อ่าน" → หาจากข้อความบนหน้าได้ ไม่ต้องเป็นช่องกรอก */
  var READ_ONLY_PATTERN = {
    surveyNoInputId: "surveyNo",
    surveyorNameCmpId: "secCode",
    claimNoInputId: "claimNo",
    dispatchDateInputId: "date",
    dispatchTimeInputId: "time",
  };

  function guessAll(components, domIds, rows, textValues) {
    var comps = (components && components.items) || [];
    var doms  = (domIds && domIds.items) || [];
    var rowCols = buildRowColumnMap(rows);
    var tv = textValues || { patterns: {}, labeled: [] };
    var result = {};

    KEY_SPECS.forEach(function (spec) {
      var cands = [];

      function push(kind, value, score, why) {
        if (!value) return;
        // id ที่ framework สร้างเอง (React useId ":r2e:", MUI "mui-12", Radix) เปลี่ยนทุก render
        // → ห้ามเสนอเป็น selector ตัดคะแนนแรงและติดธงไว้ให้คนอ่านเห็น
        var volatile_ = (kind === "domId") && isVolatileId(value);
        if (volatile_) { score = Math.min(score, 0.2); why = why + " ⚠ id เปลี่ยนทุก render ใช้ไม่ได้"; }
        var dup = cands.filter(function (c) { return c.kind === kind && c.value === value; })[0];
        if (dup) { if (score > dup.score) { dup.score = score; dup.why = why; } return; }
        cands.push({ kind: kind, value: value, score: score, why: why, volatile: volatile_ || undefined });
      }

      // (ก) id เดิมยังอยู่ไหม — คะแนนเต็ม
      comps.forEach(function (c) {
        if (c.id === spec.legacy) push("cmpId", c.id, 1.0, "id เดิมตรงเป๊ะ");
      });
      doms.forEach(function (d) {
        if (d.id === spec.legacy || d.id === spec.legacy + "-inputEl") push("domId", d.id, 1.0, "id เดิมตรงเป๊ะ");
        if (d.name === spec.legacy) push("name", d.name, 1.0, "name เดิมตรงเป๊ะ");
      });

      // (ข) token ยังอยู่ใน id/name
      //     ต้องอยู่ตรงขอบคำ (ต้นสตริง หรือหลัง _ - .) ไม่งั้น 'rd-in_out'
      //     จะไปแมตช์กลางคำของ 'grd-in_out' ซึ่งเป็นคนละ element
      (spec.tokens || []).forEach(function (tok) {
        var esc = tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        var atBoundary = new RegExp("(^|[_\\-.\\s])" + esc, "i");
        var anywhere   = new RegExp(esc, "i");
        function tokScore(hay, base) {
          if (atBoundary.test(hay)) return base;
          if (anywhere.test(hay)) return base - 0.35;   // แมตช์กลางคำ — น่าสงสัย
          return 0;
        }
        comps.forEach(function (c) {
          var s = c.id ? tokScore(c.id, 0.8) : 0;
          if (s) push("cmpId", c.id, s, "id มี token '" + tok + "'" + (s < 0.8 ? " (กลางคำ)" : ""));
        });
        doms.forEach(function (d) {
          var si = d.id ? tokScore(d.id, 0.75) : 0;
          if (si) push("domId", d.id, si, "id มี token '" + tok + "'" + (si < 0.75 ? " (กลางคำ)" : ""));
          var sn = d.name ? tokScore(d.name, 0.78) : 0;
          if (sn) push("name", d.name, sn, "name มี token '" + tok + "'" + (sn < 0.78 ? " (กลางคำ)" : ""));
        });
      });

      // (ข2) data-testid / aria-label / placeholder — ทนกว่า id ในแอป React
      (spec.tokens || []).concat(spec.labels || []).forEach(function (clue) {
        doms.forEach(function (d) {
          if (d.testid && d.testid.toLowerCase().indexOf(String(clue).toLowerCase()) !== -1) {
            push("testid", d.testid, 0.9, "data-testid มี '" + clue + "'");
          }
          if (d.aria && d.aria.indexOf(clue) !== -1) push("aria", d.aria, 0.7, "aria-label '" + clue + "'");
          if (d.ph && d.ph.indexOf(clue) !== -1) push("placeholder", d.ph, 0.6, "placeholder '" + clue + "'");
        });
      });

      // (ค) label ไทยตรงกัน
      (spec.labels || []).forEach(function (lb) {
        comps.forEach(function (c) {
          var hay = (c.fieldLabel || "") + " " + (c.boxLabel || "");
          if (hay.indexOf(lb) !== -1) push("cmpId", c.id, 0.6, "label '" + lb + "'");
        });
        doms.forEach(function (d) {
          if (d.label && d.label.indexOf(lb) !== -1) push("domId", d.id, 0.55, "label ใกล้ '" + lb + "'");
        });
      });

      // (ง) ปุ่ม / แท็บ / หัวข้อ — อ้างด้วยข้อความของตัวเอง
      //     ต้อง "ตรงเป๊ะ" เท่านั้น ไม่งั้น 'ประกัน' ไปแมตช์ 'บริษัทประกัน'
      if (spec.kind === "button" || spec.kind === "tab" || spec.kind === "text") {
        doms.forEach(function (d) {
          if (!d.text) return;
          (spec.labels || []).forEach(function (lb) {
            if (d.text !== lb) return;
            if (d.testid) push("testid", d.testid, 0.9, "ปุ่ม/แท็บ ข้อความ '" + lb + "' · data-testid");
            if (d.aria)   push("aria",   d.aria,   0.7, "ปุ่ม/แท็บ ข้อความ '" + lb + "' · aria-label");
            push("domId", d.id, 0.75, "ข้อความตรงเป๊ะ '" + lb + "'");
            push("structural", "text=" + lb, 0.6, "อ้างด้วยข้อความบนปุ่ม/แท็บ");
          });
          if (spec.textRe && new RegExp(spec.textRe).test(d.text)) {
            push("domId", d.id, 0.7, "ข้อความตรงรูปแบบ /" + spec.textRe + "/");
          }
        });
      }

      // (จ) ช่องเงินในตาราง — แถว × คอลัมน์
      //     เรียงตามความทนทาน: data-testid > name > aria-label > id (ถ้าไม่ volatile)
      if (spec.row && spec.col) {
        var rc = rowCols[spec.row];
        var hit = rc && rc.map[spec.col];
        var where = "แถว '" + spec.row + "' คอลัมน์ " + (COL_TH[spec.col] || spec.col) +
                    (rc && rc.header ? " (อ่านจากหัวตาราง)" : " (เดาจากตำแหน่งท้ายแถว)");
        if (hit && hit.empty) {
          push("structural", spec.row + " | " + spec.col, 0.4,
            where + " — ช่องนี้ไม่มี input (อาจแสดงเป็นข้อความอย่างเดียว/ยังไม่ render)");
        } else if (hit) {
          if (hit.testid)   push("testid", hit.testid, 0.9,  where + " · data-testid");
          if (hit.name)     push("name",   hit.name,   0.85, where + " · name");
          if (hit.aria)     push("aria",   hit.aria,   0.7,  where + " · aria-label");
          if (hit.ph)       push("placeholder", hit.ph, 0.6, where + " · placeholder");
          if (hit.id)       push("domId",  hit.id,     0.65, where);
          push("structural", spec.row + " | " + spec.col, 0.55, where + " — อ้างด้วยโครงสร้าง");
        }
      }

      // (ฉ) radio ใน/นอกเวลางาน — จับจากค่า value ของ radio เอง ("ใน"/"นอก")
      //     ทนที่สุด เพราะค่านี้ผูกกับ business logic ไม่ใช่ชื่อ element
      if (spec.kind === "radioname" || spec.kind === "radiogroup") {
        doms.forEach(function (d) {
          if (d.type !== "radio" || !d.name) return;
          if (d.inputValue === "นอก" || d.inputValue === "ใน") {
            push("name", d.name, 0.85, "radio มี value '" + d.inputValue + "'");
          }
        });
      }

      // (ช) ค่าที่แสดงเป็นข้อความอย่างเดียว (ไม่ใช่ช่องกรอก)
      //     extension แค่อ่านค่าพวกนี้ → อ่านจากข้อความก็พอ
      var pat = READ_ONLY_PATTERN[spec.key];
      if (pat && (tv.patterns[pat] || []).length) {
        var h = tv.patterns[pat][0];
        push("text", h.path, 0.6,
          "เจอเป็นข้อความ '" + h.match + "'" + (h.nearLabel ? " ใกล้ '" + h.nearLabel + "'" : "") +
          " — อ่านได้ แต่เขียนไม่ได้");
      }
      (tv.labeled || []).forEach(function (L) {
        (spec.labels || []).forEach(function (lb) {
          if (L.label !== lb) return;
          if (L.valueIsInput && L.valueId && !isVolatileId(L.valueId)) {
            push("domId", L.valueId, 0.7, "ค่าถัดจาก label '" + lb + "'");
          } else if (!L.valueIsInput) {
            push("text", L.valuePath, 0.6, "ข้อความถัดจาก label '" + lb + "' = '" + L.value + "'");
          }
        });
      });

      // key บางชนิดรับได้แค่บางรูปแบบ — radio group อ้างด้วย name เท่านั้น,
      // hidden location input ก็ควรใช้ name (ทนต่อการเปลี่ยน id ที่สุด)
      if (spec.kind === "radioname") {
        cands = cands.filter(function (c) { return c.kind === "name"; });
      } else if (spec.kind === "radiogroup") {
        // มี component จริง (ExtJS) ให้ใช้ก่อน ; ไม่มีก็ยอมรับ name เป็นตัวแทนกลุ่ม
        cands.forEach(function (c) { if (c.kind === "name") c.score -= 0.1; });
      } else if (spec.kind === "hidden") {
        cands.forEach(function (c) { if (c.kind === "name") c.score += 0.1; });
      }

      cands.forEach(function (c) { c.score = Math.round(Math.min(c.score, 1) * 100) / 100; });
      cands.sort(function (a, b) { return b.score - a.score; });
      var top = cands.slice(0, 8);
      result[spec.key] = {
        legacy: spec.legacy,
        kind: spec.kind,
        found: top.length > 0,
        exact: top.length > 0 && top[0].score >= 1.0,
        best: top[0] || null,
        candidates: top,
      };
    });

    return result;
  }

  // ── 5. โครงสร้างแถว (ใช้วางฟิลด์ที่ extension แทรกเอง) ────
  function dumpRows() {
    var rows = [];

    function describeEl(el, rootRect) {
      var r = safe(function () { return el.getBoundingClientRect(); }, null);
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || "",
        cls: (el.className && String(el.className).slice(0, 80)) || "",
        text: txt(el).slice(0, 40),
        left: r && rootRect ? Math.round(r.left - rootRect.left) : null,
        top: r && rootRect ? Math.round(r.top - rootRect.top) : null,
        w: r ? Math.round(r.width) : null,
        h: r ? Math.round(r.height) : null,
        pos: safe(function () { return getComputedStyle(el).position; }, null),
        styleLeft: (el.style && el.style.left) || "",
        // ช่องกรอกที่อยู่ "ข้างใน" element นี้ — จำเป็นกับตาราง <table> ที่ input
        // ซ่อนอยู่ใน <td> ไม่ใช่ลูกตรงของ <tr> (เช่น MUI Table)
        inputs: fieldsInside(el),
      };
    }

    /** เก็บช่องกรอกทุกตัวที่อยู่ภายใน element (รวมลูกหลาน) */
    function fieldsInside(el) {
      return safe(function () {
        var out = [];
        var q = el.querySelectorAll("input, select, textarea, [contenteditable='true']");
        for (var i = 0; i < q.length && i < 8; i++) {
          var f = q[i];
          out.push({
            tag: f.tagName.toLowerCase(),
            id: f.id || "",
            type: f.getAttribute("type") || "",
            name: f.getAttribute("name") || "",
            testid: f.getAttribute("data-testid") || "",
            aria: (f.getAttribute("aria-label") || "").slice(0, 40),
            ph: (f.getAttribute("placeholder") || "").slice(0, 40),
            readonly: f.hasAttribute("readonly"),
            disabled: f.disabled === true,
            inputValue: (f.getAttribute("type") === "radio" || f.getAttribute("type") === "checkbox")
              ? (f.getAttribute("value") || "") : "",
            value: redact(f.value),
          });
        }
        return out;
      }, []);
    }

    function describeContainer(el, why) {
      if (!el) return null;
      var rect = safe(function () { return el.getBoundingClientRect(); }, null);
      var cs = safe(function () { return getComputedStyle(el); }, null);
      var kids = [];
      for (var i = 0; i < el.children.length && i < 24; i++) kids.push(describeEl(el.children[i], rect));
      return {
        why: why,
        id: el.id || "",
        tag: el.tagName.toLowerCase(),
        cls: (el.className && String(el.className).slice(0, 120)) || "",
        display: cs ? cs.display : null,
        flexDirection: cs ? cs.flexDirection : null,
        position: cs ? cs.position : null,
        w: rect ? Math.round(rect.width) : null,
        h: rect ? Math.round(rect.height) : null,
        childCount: el.children.length,
        children: kids,
      };
    }

    // 5a. จาก ExtJS: เดินขึ้นจาก component ที่เป็น anchor
    if (hasExt()) {
      KEY_SPECS.filter(function (s) { return s.anchor; }).forEach(function (spec) {
        var c = safe(function () { return Ext.getCmp(spec.legacy); }, null);
        if (!c) return;
        var row = safe(function () { return c.ownerCt; }, null);
        var table = safe(function () { return row && row.ownerCt; }, null);
        rows.push({
          source: "ext",
          anchorKey: spec.key,
          anchorId: spec.legacy,
          row: row ? {
            id: row.id, xtype: safe(function () { return row.xtype; }, ""),
            layout: safe(function () { return row.layout && row.layout.type; }, null),
            w: safe(function () { return row.getWidth(); }, null),
            h: safe(function () { return row.getHeight(); }, null),
            children: safe(function () {
              return row.items.getRange().slice(0, 24).map(function (k) {
                return {
                  id: k.id, xtype: safe(function () { return k.xtype; }, ""),
                  x: safe(function () { return k.x; }, null),
                  y: safe(function () { return k.y; }, null),
                  w: safe(function () { return k.getWidth && k.getWidth(); }, null),
                  styleLeft: safe(function () { return k.el && k.el.dom && k.el.dom.style.left; }, ""),
                  text: safe(function () { return k.text || k.html || k.fieldLabel || k.boxLabel || ""; }, "").slice(0, 40),
                };
              });
            }, []),
          } : null,
          table: table ? {
            id: table.id, xtype: safe(function () { return table.xtype; }, ""),
            layout: safe(function () { return table.layout && table.layout.type; }, null),
            w: safe(function () { return table.getWidth(); }, null),
            rowCount: safe(function () { return table.items.getCount(); }, null),
            rowTexts: safe(function () {
              return table.items.getRange().slice(0, 20).map(function (r) {
                return { id: r.id, text: safe(function () { return txt(r.el.dom); }, "").slice(0, 60) };
              });
            }, []),
          } : null,
        });
      });
    }

    /**
     * หา "แถวหัวตาราง" ของตารางที่แถวนี้อยู่ → คืนข้อความของแต่ละคอลัมน์
     * หัวตารางคือตัวบอกความหมายคอลัมน์ที่แม่นที่สุด
     * (ทั้งเว็บเก่าและใหม่มีหัวว่า ลำดับ / รายละเอียด / จำนวน / จำนวนเงินเสนอ / จำนวนเงินอนุมัติ)
     */
    function findHeaderCells(rowEl) {
      return safe(function () {
        if (!rowEl) return null;
        var scope = rowEl.closest("table") || rowEl.parentElement;
        if (!scope) return null;
        var cand = scope.querySelectorAll("thead tr, tr, [class*='row'], [class*='Row']");
        for (var i = 0; i < cand.length && i < 60; i++) {
          var t = (cand[i].textContent || "").replace(/\s+/g, " ");
          if (t.indexOf("อนุมัติ") !== -1 && (t.indexOf("เสนอ") !== -1 || t.indexOf("ลำดับ") !== -1)) {
            var cells = cand[i].children;
            var out = [];
            for (var j = 0; j < cells.length && j < 12; j++) out.push(txt(cells[j]).slice(0, 30));
            if (out.length) return out;
          }
        }
        return null;
      }, null);
    }

    // 5b. จาก DOM: หาแถวด้วยข้อความไทย (ใช้ได้แม้ไม่ใช่ ExtJS)
    //     เดินเฉพาะ text node — ถูกกว่าไล่ textContent ของทุก div มาก
    //     และได้ element ที่ "ลึกที่สุด" ที่มีข้อความนั้นจริงๆ ไม่ใช่ ancestor ก้อนใหญ่
    var labelHits = {};
    safe(function () {
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      var node, guard = 0;
      while ((node = walker.nextNode()) && guard++ < 40000) {
        var t = (node.nodeValue || "").replace(/\s+/g, " ").trim();
        if (!t || t.length > 60) continue;
        for (var j = 0; j < ROW_LABELS.length; j++) {
          var lb = ROW_LABELS[j];
          if (!labelHits[lb] && t.indexOf(lb) !== -1) labelHits[lb] = node.parentElement;
        }
      }
    }, null);

    ROW_LABELS.forEach(function (lb) {
      var hit = labelHits[lb] || null;
      if (!hit) { rows.push({ source: "dom", label: lb, found: false }); return; }
      var container = hit.closest("tr, [class*='row'], .x-panel, .x-container") || hit.parentElement;
      rows.push({
        source: "dom",
        label: lb,
        found: true,
        labelEl: { tag: hit.tagName.toLowerCase(), id: hit.id || "", cls: String(hit.className || "").slice(0, 80) },
        headerCells: findHeaderCells(container),
        container: describeContainer(container, "แถวที่มีข้อความ '" + lb + "'"),
        parent: describeContainer(container && container.parentElement, "ตารางที่ครอบแถวนั้น"),
      });
    });

    return rows;
  }

  // ─────────────────────────────────────────────────────────
  // 5.5 ค่าที่แสดงเป็น "ข้อความ" ไม่ใช่ช่องกรอก
  //   เว็บ React มักแสดงข้อมูลอ่านอย่างเดียวเป็น <Typography> ไม่มี id
  //   extension แค่อ่านค่าพวกนี้ (เลขเซอร์เวย์ / ชื่อผู้สำรวจ / ประเภทบริการ)
  //   จึงต้องรู้ว่ามันอยู่ตรงไหนของหน้า ถึงจะอ่านได้
  // ─────────────────────────────────────────────────────────
  var TEXT_PATTERNS = [
    // เว็บเก่า: SETP68001234 / SEMS68001234
    // เว็บใหม่: SEABI-112260700428  → ต้องยอมให้มีขีดคั่นและตัวอักษรกลางยาวขึ้น
    { key: "surveyNo",  re: /\bSE[A-Z]{0,6}[-_ ]?\d{6,}\b/i,          desc: "เลขเซอร์เวย์ (ใช้แยกบริษัท)" },
    { key: "secCode",   re: /\bSEC\d+\b/i,                            desc: "รหัสผู้สำรวจ (ใช้หาทีม)" },
    { key: "claimNo",   re: /\b[A-Z]{1,3}[-/]?\d{6,}\b/,              desc: "เลขเคลม" },
    { key: "date",      re: /\b\d{1,2}\/\d{1,2}\/\d{4}\b/,            desc: "วันที่ (เช่น วันจ่ายงาน)" },
    { key: "time",      re: /\b\d{1,2}:\d{2}\b/,                      desc: "เวลา" },
    { key: "money",     re: /\b\d{1,3}(,\d{3})*\.\d{2}\b/,            desc: "จำนวนเงิน" },
  ];

  // ข้อความ label ที่อยากรู้ว่า "ค่าอยู่ตรงไหน"
  var READ_LABELS = [
    // สะกดได้หลายแบบ — เว็บใหม่ใช้ "เลขเซอเวย์" (ไม่มี ร์) ก็มี
    "เลขที่เซอร์เวย์", "เลขเซอร์เวย์", "เลขที่เซอเวย์", "เลขเซอเวย์", "เซอร์เวย์", "เซอเวย์",
    "เลขที่รับแจ้ง", "เลขรับแจ้ง", "เลขงาน", "เลขที่กรมธรรม์", "กรมธรรม์",
    "เลขเคลมประกัน", "เลขที่เคลม", "เลขเคลม",
    "ผู้สำรวจ", "ชื่อผู้ปฏิบัติงาน", "เจ้าหน้าที่", "รหัส",
    "ประเภทบริการ", "ประเภทเคลม", "ประเภทงาน", "ประเภทการจ่ายงาน",
    "วันจ่ายงาน", "จ่ายงานเวลา", "เวลาจ่ายงาน",
    "บริษัทประกัน", "บริษัท", "ศูนย์", "ทีม", "สถานะ",
  ];

  /** เส้นทางสั้นๆ ของ element (ไว้ให้คนอ่านรู้ว่าอยู่ตรงไหน) */
  function elPath(el) {
    return safe(function () {
      var parts = [], cur = el, depth = 0;
      while (cur && cur.tagName && depth++ < 4) {
        var t = cur.tagName.toLowerCase();
        var c = String(cur.className || "").split(/\s+/)
          .filter(function (x) { return x && !/^css-/.test(x); })[0];
        parts.unshift(t + (cur.id ? "#" + cur.id : "") + (c ? "." + c : ""));
        cur = cur.parentElement;
      }
      return parts.join(" > ");
    }, "");
  }

  function dumpTextValues() {
    var patterns = {}, labeled = [], seenLabel = {};
    TEXT_PATTERNS.forEach(function (p) { patterns[p.key] = []; });

    safe(function () {
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      var node, guard = 0;
      while ((node = walker.nextNode()) && guard++ < 40000) {
        var t = (node.nodeValue || "").replace(/\s+/g, " ").trim();
        if (!t || t.length > 120) continue;
        var el = node.parentElement;
        if (!el) continue;

        // (ก) ข้อความที่ match รูปแบบที่รู้จัก
        TEXT_PATTERNS.forEach(function (p) {
          if (patterns[p.key].length >= 6) return;
          var m = p.re.exec(t);
          if (!m) return;
          patterns[p.key].push({
            match: m[0],
            fullText: t.slice(0, 60),
            tag: el.tagName.toLowerCase(),
            id: el.id || "",
            cls: String(el.className || "").slice(0, 60),
            path: elPath(el),
            nearLabel: nearestTextLabel(el),
          });
        });

        // (ข) ข้อความที่เป็น label → หาค่าที่อยู่ถัดไป
        READ_LABELS.forEach(function (lb) {
          if (seenLabel[lb]) return;
          var clean = t.replace(/[:：]\s*$/, "").trim();
          if (clean !== lb && clean !== lb + " " && t.indexOf(lb) !== 0) return;
          var val = valueNextTo(el, t, lb);
          if (!val) return;
          seenLabel[lb] = true;
          labeled.push({
            label: lb,
            value: val.text.slice(0, 60),
            valueTag: val.tag,
            valueId: val.id,
            valueIsInput: val.isInput,
            labelPath: elPath(el),
            valuePath: val.path,
          });
        });
      }
    }, null);

    return { patterns: patterns, labeled: labeled };
  }

  /** หา label ที่อยู่ก่อนหน้า element นี้ (แบบข้อความ ไม่ต้องเป็น <label>) */
  function nearestTextLabel(el) {
    return safe(function () {
      var p = el.previousElementSibling;
      while (p) {
        var t = txt(p);
        if (t && t.length <= 40) return t;
        p = p.previousElementSibling;
      }
      var par = el.parentElement;
      if (par) {
        var pt = txt(par);
        if (pt && pt.length <= 60) return pt;
      }
      return "";
    }, "").slice(0, 40);
  }

  /** หา "ค่า" ที่คู่กับ label — ลอง sibling ถัดไป แล้วค่อยดูข้อความในกล่องเดียวกัน */
  function valueNextTo(labelEl, labelText, lb) {
    return safe(function () {
      // 1. ถ้าข้อความเดียวกันมีทั้ง label และค่า เช่น "เลขที่เซอร์เวย์: SETP68001"
      var inline = labelText.replace(lb, "").replace(/^[:：\s]+/, "").trim();
      if (inline) {
        return { text: inline, tag: labelEl.tagName.toLowerCase(), id: labelEl.id || "",
                 isInput: false, path: elPath(labelEl) };
      }
      // 2. sibling ถัดไปที่มีข้อความ หรือเป็น input
      var n = labelEl.nextElementSibling;
      var hops = 0;
      while (n && hops++ < 3) {
        var f = n.matches && n.matches("input,select,textarea") ? n : n.querySelector && n.querySelector("input,select,textarea");
        if (f) {
          return { text: "(ช่องกรอก)", tag: f.tagName.toLowerCase(), id: f.id || "",
                   isInput: true, path: elPath(f) };
        }
        var t = txt(n);
        if (t) return { text: t, tag: n.tagName.toLowerCase(), id: n.id || "",
                        isInput: false, path: elPath(n) };
        n = n.nextElementSibling;
      }
      return null;
    }, null);
  }

  // ── 6. iframe / โครงหน้า ─────────────────────────────────
  function dumpFrames() {
    var out = { count: window.frames.length, sameOrigin: [], note: "" };
    for (var i = 0; i < window.frames.length && i < 10; i++) {
      var info = safe(function () {
        var d = window.frames[i].document;
        return {
          index: i,
          url: d.location.href.slice(0, 200),
          inputCount: d.querySelectorAll("input").length,
          hasTabIds: d.querySelectorAll("[id^='tab1_'],[id*='SUR_INVEST']").length,
        };
      }, null);
      if (info) out.sameOrigin.push(info);
    }
    if (window.frames.length > 0 && out.sameOrigin.length === 0) {
      out.note = "มี iframe แต่อ่านไม่ได้ (cross-origin) — ถ้าฟอร์มอยู่ใน iframe ต้องแก้ manifest all_frames";
    }
    if (out.sameOrigin.some(function (f) { return f.hasTabIds > 0; })) {
      out.note = "⚠ ฟอร์มอยู่ใน iframe — extension ปัจจุบันตั้ง all_frames:false จะไม่ทำงาน";
    }
    return out;
  }

  // ── 7. สถานะ extension ปัจจุบันบนหน้านี้ ──────────────────
  function dumpExtensionState() {
    return {
      loaded: !!window.__iSurveyHelperLoaded,
      hasConfig: !!window.ISURVEY_HELPER_CONFIG,
      configKeys: window.ISURVEY_HELPER_CONFIG ? Object.keys(window.ISURVEY_HELPER_CONFIG) : [],
      feeMapSizes: {
        province: window.PROVINCE_FEE_MAP ? Object.keys(window.PROVINCE_FEE_MAP).length : null,
        amphurTable: window.AMPHUR_FEE_TABLE ? Object.keys(window.AMPHUR_FEE_TABLE).length : null,
      },
      ownIdsPresent: OWN_IDS.filter(function (id) {
        return !!document.getElementById(id) || (hasExt() && !!safe(function () { return Ext.getCmp(id); }, null));
      }),
    };
  }

  // ── ประกอบรายงาน ────────────────────────────────────────
  var framework = detectFramework();
  var components = dumpComponents();
  var domIds = dumpDomIds();
  var rows = dumpRows();          // ต้องมาก่อน guessAll — ใช้หาช่องเงินด้วยแถว×คอลัมน์
  var textValues = dumpTextValues();   // ต้องมาก่อน guessAll เช่นกัน

  var report = {
    schemaVersion: SCHEMA_VERSION,
    probedAt: new Date().toISOString(),
    url: { origin: location.origin, pathname: location.pathname, hash: location.hash.slice(0, 80) },
    userAgent: navigator.userAgent,
    framework: framework,
    frames: dumpFrames(),
    extension: dumpExtensionState(),
    guesses: guessAll(components, domIds, rows, textValues),
    textValues: textValues,
    rows: rows,
    components: components,
    domIds: domIds,
  };

  // สรุปให้อ่านง่ายใน console
  var summary = Object.keys(report.guesses).map(function (k) {
    var g = report.guesses[k];
    return {
      key: k,
      "id เดิม": g.legacy,
      "เจอ": g.exact ? "ตรงเป๊ะ" : (g.found ? "เดาได้" : "ไม่เจอ"),
      "ค่าที่เดา": g.best ? g.best.value : "",
      "คะแนน": g.best ? g.best.score : 0,
      "เพราะ": g.best ? g.best.why : "",
    };
  });

  var missing = summary.filter(function (s) { return s["เจอ"] === "ไม่เจอ"; }).length;
  var exact = summary.filter(function (s) { return s["เจอ"] === "ตรงเป๊ะ"; }).length;

  console.log("%c[SE-Billing probe] framework = " + framework.kind + " " + (framework.version || ""),
    "font-weight:bold;font-size:14px");
  console.log("[SE-Billing probe] URL:", location.origin + location.pathname);
  console.table(summary);
  console.log("[SE-Billing probe] ตรงเป๊ะ " + exact + " / เดาได้ " + (summary.length - exact - missing) +
    " / ไม่เจอ " + missing + " (จากทั้งหมด " + summary.length + ")");
  // สรุปค่าที่เจอเป็น "ข้อความ" (ไม่ใช่ช่องกรอก)
  var pk = Object.keys(report.textValues.patterns).filter(function (k) {
    return report.textValues.patterns[k].length;
  });
  if (pk.length) {
    console.log("[SE-Billing probe] เจอข้อความตามรูปแบบ:",
      pk.map(function (k) { return k + "=" + report.textValues.patterns[k][0].match; }).join(", "));
  }
  if (report.textValues.labeled.length) {
    console.log("[SE-Billing probe] คู่ label→ค่า ที่อ่านได้:");
    console.table(report.textValues.labeled.map(function (L) {
      return { label: L.label, "ค่า": L.value, "เป็นช่องกรอก": L.valueIsInput ? "ใช่" : "ไม่", "ตำแหน่ง": L.valuePath };
    }));
  }

  if (missing > 0) {
    console.warn("[SE-Billing probe] ไม่เจอ:", summary.filter(function (s) { return s["เจอ"] === "ไม่เจอ"; })
      .map(function (s) { return s.key; }).join(", "),
      "— ถ้าเป็นฟิลด์ที่อยู่แท็บอื่น ให้เปิดแท็บนั้นแล้วรันซ้ำ");
  }

  // ── ผลลัพธ์ 2 ระดับ ─────────────────────────────────────
  //   essentials = พอสำหรับสร้าง selector registry (เล็ก วางในแชทได้)
  //   full       = ดัมป์ทั้งหมด (ใหญ่ ใช้ตอนต้องขุดเพิ่ม)
  var essentials = {
    schemaVersion: report.schemaVersion,
    probedAt: report.probedAt,
    url: report.url,
    framework: report.framework,
    frames: report.frames,
    extension: report.extension,
    counts: {
      components: components ? components.count : 0,
      componentsKept: components ? components.kept : 0,
      domTotal: domIds.total,
      domKept: domIds.kept,
    },
    guesses: Object.keys(report.guesses).reduce(function (acc, k) {
      var g = report.guesses[k];
      acc[k] = { legacy: g.legacy, exact: g.exact, best: g.best, candidates: g.candidates.slice(0, 3) };
      return acc;
    }, {}),
    textValues: report.textValues,
    rows: report.rows,
  };

  var json = JSON.stringify(essentials);
  window.__SE_PROBE__ = json;
  window.__SE_PROBE_FULL__ = JSON.stringify(report);
  window.__SE_PROBE_OBJ__ = report;

  var copied = false;
  try { if (typeof copy === "function") { copy(json); copied = true; } } catch (e) {}
  if (!copied && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(json).then(function () {
      console.log("%c✅ คัดลอกผลลง clipboard แล้ว — วางส่งกลับได้เลย", "color:green;font-weight:bold");
    }, function () {
      console.warn("คัดลอกอัตโนมัติไม่สำเร็จ — พิมพ์  copy(__SE_PROBE__)  แล้ว Enter");
    });
  } else if (copied) {
    console.log("%c✅ คัดลอกผลลง clipboard แล้ว — วางส่งกลับได้เลย", "color:green;font-weight:bold");
  } else {
    console.warn("คัดลอกอัตโนมัติไม่สำเร็จ — พิมพ์  copy(__SE_PROBE__)  แล้ว Enter");
  }
  console.log("[SE-Billing probe] ขนาดผลที่คัดลอก: " + Math.round(json.length / 1024) + " KB" +
    " | ดัมป์เต็ม " + Math.round(window.__SE_PROBE_FULL__.length / 1024) + " KB อยู่ที่  copy(__SE_PROBE_FULL__)");

  return "probe เสร็จ — " + exact + "/" + summary.length + " ฟิลด์ id เดิมยังใช้ได้";
})();
