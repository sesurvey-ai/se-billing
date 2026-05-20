/**
 * content.js  —  I Survey Auto-Fill Helper
 * ─────────────────────────────────────────────────────────────
 * รันใน MAIN world เพื่อให้เข้าถึง global `Ext` ของหน้าเว็บได้
 *
 * Lookup precedence (เฉพาะเจาะจงสุดชนะ):
 *      tumbonID  >  amphurID  >  provinceID
 *
 * สูตรค่าบริการสุดท้าย:
 *      base (จาก *_FEE_MAP)
 *    + outOfArea modifier (ถ้า checkbox "นอกพื้นที่" ติ๊ก)
 *    + outOfHours modifier (ถ้า radio "นอก" ถูกเลือก)
 *
 * โครงสร้างเป็นฟังก์ชันย่อย ๆ เพื่อให้ขยายฟีเจอร์อื่นได้ง่าย
 */
(function () {
  "use strict";

  // ── Guard: ป้องกันการรันซ้ำเมื่อ script ถูก inject สองครั้ง ──
  if (window.__iSurveyHelperLoaded) return;
  window.__iSurveyHelperLoaded = true;

  // ── Live readers — อ่าน window.X ทุกครั้ง เพื่อรับ live update จาก admin ──
  // Maps + dynamic fields (modifierFees, enabledProvinces) มาจาก chrome.storage
  // ผ่าน config-bridge.js → set window.X. Static fields (selectors, debug, ฯลฯ)
  // อยู่ใน window.ISURVEY_HELPER_CONFIG ตลอดเพราะ config-bridge.js seed ก่อน content.js
  const getProvinceMap     = () => window.PROVINCE_FEE_MAP    || {};
  const getAmphurMap       = () => window.AMPHUR_FEE_MAP      || {};
  const getTumbonMap       = () => window.TUMBON_FEE_MAP      || {};
  const getAmphurTable     = () => window.AMPHUR_FEE_TABLE    || {};
  const getTumbonOverride  = () => window.TUMBON_FEE_OVERRIDE || {};
  const getSurveyorTeams   = () => window.SURVEYOR_TEAMS      || {};
  const getCFG = () => Object.assign(
    {
      pollIntervalMs: 500,
      highlightColor: "#fff59d",
      highlightDurationMs: 1500,
      debug: true,
      enabledProvinces: [],
      modifierFees: { outOfArea: 0, outOfHours: 0 },
      selectors: {},
    },
    window.ISURVEY_HELPER_CONFIG || {}
  );

  // ── Static config snapshot สำหรับการ init/poll (modifier/whitelist อ่านสด) ──
  const CFG = getCFG();

  const SEL = Object.assign(
    {
      provinceHidden:   'input[type="hidden"][name="tab1_survey_provinceID"]',
      amphurHidden:     'input[type="hidden"][name="tab1_survey_amphurID"]',
      tumbonHidden:     'input[type="hidden"][name="tab1_survey_tumbonID"]',
      provinceCmpId:    'tab1_survey_provinceID',  // combobox component (พิมพ์ค้นหา)
      amphurCmpId:      'tab1_survey_amphurID',
      tumbonCmpId:      'tab1_survey_tumbonID',
      feeInput:         'input#tab1_SUR_INVEST-inputEl',
      feeCmpId:         'tab1_SUR_INVEST',
      outOfAreaCmpId:      'tab1_chk_co_area',
      outOfAreaAmountCmpId:'tab1_chk_co_area_amount',          // numberfield ที่ user กรอกยอดเอง (นอกพื้นที่)
      outOfAreaAmountInputId: 'tab1_chk_co_area_amount-inputEl',
      inOutGroupCmpId:     'tab1_grd-in_out',
      outOfAreaInput:      'input#tab1_chk_co_area-inputEl',
      outOfAreaInputId:    'tab1_chk_co_area-inputEl',
      inOutRadioName:      'tab1_rd-in_out',
      outValueLabel:       'นอก',
      outOfHoursAmountCmpId:    'tab1_rd_out_amount',           // numberfield ที่ user กรอกยอดเอง (นอกเวลา)
      outOfHoursAmountInputId:  'tab1_rd_out_amount-inputEl',
      mtypeIdCmpId:        'tab1_claim_MtypeID',
      mtypeIdInput:        'input#tab1_claim_MtypeID-inputEl',
      mtypeIdInputId:      'tab1_claim_MtypeID-inputEl',
      surveyorNameCmpId:   'tab1_surveyor_name',
      surveyorNameInput:   'input#tab1_surveyor_name-inputEl',
      surveyorNameInputId: 'tab1_surveyor_name-inputEl',
      ossCompanyInputId:   'tab1_OSS_company-inputEl',   // surveyor นอกบริษัท — ใส่ชื่อบริษัทแทนชื่อ surveyor
      insInvestCmpId:      'tab1_INS_INVEST',
      insInvestInput:      'input#tab1_INS_INVEST-inputEl',
      insTransCmpId:       'tab1_INS_TRANS',
      insTransInput:       'input#tab1_INS_TRANS-inputEl',
      insPhotoCmpId:       'tab1_INS_PHOTO',
      insPhotoInput:       'input#tab1_INS_PHOTO-inputEl',
      deductAmountCmpId:   'tab1_deduct_amount',           // numberfield ที่ user กรอกยอด "หักเงิน"
      deductAmountInputId: 'tab1_deduct_amount-inputEl',
      lateSubmitCmpId:     'tab1_deduct_late_submit',      // checkbox "ส่งช้า"
      lateSubmitInputId:   'tab1_deduct_late_submit-inputEl',
      incompleteDocsCmpId: 'tab1_deduct_incomplete_docs',  // checkbox "เอกสารไม่ครบ"
      incompleteDocsInputId:'tab1_deduct_incomplete_docs-inputEl',
      deductWarningCmpId:  'tab1_deduct_warning',          // label เตือน deduct ไม่ระบุเหตุผล
      recvClaimCmpId:      'tab1_RECV_CLAIM',              // numberfield "ค่าเรียกร้อง" (input)
      recvClaimInput:      'input#tab1_RECV_CLAIM-inputEl',
      recvClaimInputId:    'tab1_RECV_CLAIM-inputEl',
      surClaimCmpId:       'tab1_SUR_CLAIM',               // textfield 5% ของ RECV_CLAIM
      surClaimInput:       'input#tab1_SUR_CLAIM-inputEl',
      insClaimCmpId:       'tab1_INS_CLAIM',               // textfield 10% ของ RECV_CLAIM
      insClaimInput:       'input#tab1_INS_CLAIM-inputEl',
      serviceTypeCmpId:    'tab1_service_type',            // combo "ประเภทบริการ" — บริการ/ต่อเนื่อง/หน้าร้าน/พื้นที่เดียวกัน
      serviceTypeInput:    'input#tab1_service_type-inputEl',
      serviceTypeInputId:  'tab1_service_type-inputEl',
      subAreaCmpId:        'tab1_chk_sub_area',            // checkbox sub-area (inject ได้ — feature-sub-area-checkbox.js)
      subAreaInputId:      'tab1_chk_sub_area-inputEl',
    },
    CFG.selectors || {}
  );

  const TAG = "[ISurveyHelper]";
  const log  = (...a) => CFG.debug && console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);

  // ─────────────────────────────────────────────────────────
  // Reference data bridge (postMessage ↔ loader.js ใน ISOLATED)
  // ─────────────────────────────────────────────────────────
  // หน้าเว็บมี CSP เข้ม ห้าม inline <script> เลยใช้ postMessage แทน
  (function setupRefBridge() {
    let received = false;
    const ORIGIN = window.location.origin;

    window.addEventListener("message", (ev) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.__isurveyHelper !== true) return;
      if (d.type === "ref-data-response" && !received && d.payload) {
        received = true;
        window.__ISURVEY_REF__ = d.payload;
        window.dispatchEvent(new CustomEvent("isurvey-ref-ready"));
      }
    });

    function request() {
      window.postMessage(
        { __isurveyHelper: true, type: "ref-data-request" },
        ORIGIN
      );
    }

    // ขอทันที + retry สั้น ๆ เผื่อ loader ยัง fetch ไม่เสร็จ
    request();
    let attempts = 0;
    const timer = setInterval(() => {
      if (received || attempts++ > 20) {
        clearInterval(timer);
        return;
      }
      request();
    }, 500);
  })();

  // ─────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────

  function isSameNumeric(a, b) {
    if (a === null || a === undefined || a === "") return false;
    if (b === null || b === undefined || b === "") return false;
    const na = parseFloat(String(a).replace(/,/g, ""));
    const nb = parseFloat(String(b).replace(/,/g, ""));
    if (isNaN(na) || isNaN(nb)) return false;
    return Math.abs(na - nb) < 0.0001;
  }

  function flashHighlight(el) {
    if (!el) return;
    const prevBg = el.style.backgroundColor;
    const prevTransition = el.style.transition;
    el.style.transition = "background-color 0.6s ease";
    el.style.backgroundColor = CFG.highlightColor;
    setTimeout(() => {
      el.style.backgroundColor = prevBg || "";
      setTimeout(() => {
        el.style.transition = prevTransition || "";
      }, 700);
    }, CFG.highlightDurationMs);
  }

  function getExtCmp(id) {
    try {
      return (typeof Ext !== "undefined" && Ext.getCmp) ? Ext.getCmp(id) : null;
    } catch (e) {
      warn("Ext.getCmp error for", id, e);
      return null;
    }
  }

  function setFieldValue(cmpId, domEl, value) {
    const cmp = getExtCmp(cmpId);
    if (cmp && typeof cmp.setValue === "function") {
      cmp.setValue(value);
      return "ext";
    }
    if (domEl) {
      domEl.value = value;
      domEl.dispatchEvent(new Event("input", { bubbles: true }));
      domEl.dispatchEvent(new Event("change", { bubbles: true }));
      return "dom";
    }
    return null;
  }

  function readHiddenValue(selector) {
    const el = document.querySelector(selector);
    return el ? (el.value || "") : "";
  }

  /**
   * อ่าน MtypeID ปัจจุบัน → "1"/"2"/"3"/"4" หรือ "" ถ้าว่าง
   *   1 = เคลมสด, 2 = เคลมแห้ง, 3 = ติดตาม, 4 = เจรจาสินไหม
   * พยายาม Ext.getValue() ก่อน (คืน underlying ID); fallback อ่าน text แล้ว map
   */
  const MTYPE_LABEL_TO_ID = {
    "เคลมสด":      "1",
    "เคลมแห้ง":    "2",
    "ติดตาม":      "3",
    "เจรจาสินไหม": "4",
  };
  function readMtypeId() {
    const cmp = getExtCmp(SEL.mtypeIdCmpId);
    if (cmp && typeof cmp.getValue === "function") {
      const v = cmp.getValue();
      if (v !== null && v !== undefined && v !== "") {
        // Ext combobox store ใช้ valueField "clMTID" ที่เก็บเป็น "01"-"04" (2-digit)
        // normalize → "1"-"4" เพื่อเทียบกับ mt12/mt34 ใน syncMultiFields
        return String(v).replace(/^0+(?=\d)/, "");
      }
    }
    const el = document.querySelector(SEL.mtypeIdInput);
    const txt = el ? (el.value || "").trim() : "";
    return MTYPE_LABEL_TO_ID[txt] || "";
  }

  /**
   * อ่านค่า "ประเภทบริการ" (tab1_service_type) — combo มี 4 option:
   * บริการ / ต่อเนื่อง / หน้าร้าน / พื้นที่เดียวกัน
   * (valueField + displayField = "item" → getValue() คืน label ตรงๆ)
   */
  function readServiceType() {
    const cmp = getExtCmp(SEL.serviceTypeCmpId);
    if (cmp && typeof cmp.getValue === "function") {
      const v = cmp.getValue();
      if (v) return String(v).trim();
    }
    const el = document.querySelector(SEL.serviceTypeInput);
    return el ? (el.value || "").trim() : "";
  }

  /**
   * อ่านชื่อ "เจ้าหน้าที่ตรวจงาน" จาก header (user ที่ login)
   * จาก <div id="main-tab_header-title-textEl">…Hi, นายนพดล สมบูรณ์กุล</div>
   * → ตัด "Hi, " + ตัดคำนำหน้าไทย (นาย/นาง/นางสาว/ด.ช./ด.ญ./เด็กชาย/เด็กหญิง)
   * คืน "นพดล สมบูรณ์กุล" หรือ null ถ้าไม่เจอ element
   *
   * Note: เรียงคำนำหน้ายาว→สั้น เพราะ JS regex alternation match ตัวแรกที่เจอ
   * (นางสาว ก่อน นาง — ไม่งั้น "นางสาวสมศรี" จะถูกตัดเหลือ "สาวสมศรี")
   */
  const TITLE_PREFIX_RE = /^(นางสาว|นาง|นาย|ด\.ช\.|ด\.ญ\.|เด็กชาย|เด็กหญิง)\s*/;
  function readInspectorName() {
    const el = document.getElementById("main-tab_header-title-textEl");
    if (!el) return null;
    let text = (el.textContent || "").trim();
    if (!text) return null;
    text = text.replace(/^Hi\s*,?\s*/i, "").trim(); // ตัด "Hi, " (มี/ไม่มี comma + spaces)
    text = text.replace(TITLE_PREFIX_RE, "").trim();
    return text || null;
  }

  /**
   * อ่านชื่อ surveyor จาก DOM input โดยตรง (`tab1_surveyor_name-inputEl`) —
   * ไม่ใช้ Ext.getValue() เพราะอาจคืนค่าภายใน (ID/code) ไม่ใช่ชื่อที่แสดง
   */
  function readSurveyorName() {
    const el = document.getElementById(SEL.surveyorNameInputId);
    return (el && el.value ? String(el.value) : "").trim();
  }

  /**
   * พนักงาน SE? — ตรวจชื่อ surveyor ขึ้นต้นด้วย "se" (case insensitive)
   *
   * ครอบคลุม OSS (surveyor นอกบริษัท): host populate `tab1_OSS_company-inputEl`
   * เมื่อเปิดเคลมที่ผู้ทำงานจริงเป็น OSS — `tab1_surveyor_name-inputEl` อาจ sticky
   * ค่า SE prefix จาก SE ผู้มอบหมายงานไว้ ทำให้ regex check อ่านเป็น SE ผิด
   * ดังนั้น: `tab1_OSS_company` มีค่าใดๆ = OSS (non-SE) เสมอ — เช็คก่อน regex
   */
  function isSurveyorSE() {
    const ossEl = document.getElementById(SEL.ossCompanyInputId);
    if (ossEl && ossEl.value && ossEl.value.trim()) return false;
    return /^se/i.test(readSurveyorName());
  }

  /**
   * อ่านรหัส SECxxx จาก surveyor name (e.g. "SEC148ฐนกร สดใส" → "SEC148")
   * รองรับช่องว่างหรือไม่มีก็ได้ระหว่างรหัสกับชื่อ — match prefix "SEC" + ตัวเลข
   */
  function readSurveyorSecCode() {
    const m = /^(SEC\d+)/i.exec(readSurveyorName());
    return m ? m[1].toUpperCase() : null;
  }

  /** lookup ทีมของ surveyor ปัจจุบันจาก SURVEYOR_TEAMS — null ถ้าไม่มี code/ไม่ match */
  function readSurveyorTeam() {
    const code = readSurveyorSecCode();
    if (!code) return null;
    const teams = getSurveyorTeams();
    return teams[code] || null;
  }

  /** sub-area checkbox state (inject โดย feature-sub-area-checkbox.js) */
  function isSubAreaChecked() {
    const cmp = getExtCmp(SEL.subAreaCmpId);
    if (cmp && typeof cmp.getValue === "function") return cmp.getValue() === true;
    const el = document.getElementById(SEL.subAreaInputId);
    return !!(el && el.checked);
  }

  /**
   * หา TUMBON_FEE_OVERRIDE entry ที่ parentAmphur ตรงกับ amphurId นี้
   * คืน { tumbonId, entry } หรือ null
   */
  function findSubAreaForAmphur(amphurId) {
    if (!amphurId) return null;
    const map = getTumbonOverride();
    for (const [tid, entry] of Object.entries(map)) {
      if (String(entry.parentAmphur) === String(amphurId)) {
        return { tumbonId: tid, entry };
      }
    }
    return null;
  }

  function lookupName(level, id) {
    const ref = window.__ISURVEY_REF__;
    if (!ref || !id) return "";
    const dict =
      level === "tumbon"   ? ref.byTumbonId :
      level === "amphur"   ? ref.byAmphurId :
      level === "province" ? ref.byProvinceId :
      null;
    return (dict && dict[String(id)]) || "";
  }

  // ─────────────────────────────────────────────────────────
  // Lookup base fee (province/amphur/tumbon)
  // ─────────────────────────────────────────────────────────

  function lookupFee(provinceId, amphurId, tumbonId) {
    const TUMBON_MAP   = getTumbonMap();
    const AMPHUR_MAP   = getAmphurMap();
    const PROVINCE_MAP = getProvinceMap();
    if (tumbonId && Object.prototype.hasOwnProperty.call(TUMBON_MAP, tumbonId)) {
      return { fee: TUMBON_MAP[tumbonId], level: "tumbon", id: tumbonId };
    }
    if (amphurId && Object.prototype.hasOwnProperty.call(AMPHUR_MAP, amphurId)) {
      return { fee: AMPHUR_MAP[amphurId], level: "amphur", id: amphurId };
    }
    if (provinceId && Object.prototype.hasOwnProperty.call(PROVINCE_MAP, provinceId)) {
      return { fee: PROVINCE_MAP[provinceId], level: "province", id: provinceId };
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────
  // Modifier checkers (เพิ่ม modifier ใหม่ตรงนี้ได้)
  // คืน array ของ {key, label, amount} เฉพาะตัวที่ active
  // ─────────────────────────────────────────────────────────

  function isOutOfAreaChecked() {
    const cmp = getExtCmp(SEL.outOfAreaCmpId);
    if (cmp && typeof cmp.getValue === "function") {
      return cmp.getValue() === true;
    }
    // fallback DOM
    const cb = document.querySelector(SEL.outOfAreaInput);
    return !!(cb && cb.checked);
  }

  /**
   * อ่านยอดเงินที่ user กรอกใน numberfield "นอกพื้นที่"
   * คืน { amount, source } โดย source = "custom" ถ้าได้จาก field, "default" ถ้า fallback
   * - field ไม่มีอยู่ / ว่าง → ใช้ default จาก config (50)
   * - field มีค่าตัวเลขถูกต้อง (รวม 0) → ใช้ค่านั้น
   */
  function getOutOfAreaAmount() {
    const defaultAmt = (getCFG().modifierFees || {}).outOfArea || 0;
    const cmp = getExtCmp(SEL.outOfAreaAmountCmpId);
    if (cmp && typeof cmp.getValue === "function") {
      const v = cmp.getValue();
      if (v !== null && v !== undefined && v !== "" && !isNaN(v)) {
        return { amount: Number(v), source: "custom" };
      }
    }
    return { amount: defaultAmt, source: "default" };
  }

  /**
   * อ่านยอดเงินที่ user กรอกใน numberfield "นอกเวลา"
   * คืน { amount, source } โดย source = "custom" ถ้าได้จาก field, "default" ถ้า fallback
   */
  function getOutOfHoursAmount() {
    const defaultAmt = (getCFG().modifierFees || {}).outOfHours || 0;
    const cmp = getExtCmp(SEL.outOfHoursAmountCmpId);
    if (cmp && typeof cmp.getValue === "function") {
      const v = cmp.getValue();
      if (v !== null && v !== undefined && v !== "" && !isNaN(v)) {
        return { amount: Number(v), source: "custom" };
      }
    }
    return { amount: defaultAmt, source: "default" };
  }

  /**
   * อ่านยอด "หักเงิน" ที่ user กรอกในแถว 7 (inject โดย feature-deduct-amount.js)
   * คืน amount > 0 เมื่อ user กรอก, 0 เมื่อว่าง/ไม่มี field
   * (ไม่มี toggle — field value = 0 หมายความว่า "ไม่หัก")
   */
  function getDeductAmount() {
    const cmp = getExtCmp(SEL.deductAmountCmpId);
    if (cmp && typeof cmp.getValue === "function") {
      const v = cmp.getValue();
      if (v !== null && v !== undefined && v !== "" && !isNaN(v)) {
        const n = Number(v);
        if (n > 0) return n;
      }
    }
    return 0;
  }

  function readDeductFlag(cmpId, fallbackInputId) {
    const cmp = getExtCmp(cmpId);
    if (cmp && typeof cmp.getValue === "function") return cmp.getValue() === true;
    const el = document.getElementById(fallbackInputId);
    return !!(el && el.checked);
  }
  const isLateSubmit     = () => readDeductFlag(SEL.lateSubmitCmpId,     SEL.lateSubmitInputId);
  const isIncompleteDocs = () => readDeductFlag(SEL.incompleteDocsCmpId, SEL.incompleteDocsInputId);

  /**
   * Validate deduct: ถ้ากรอกยอด > 0 ต้องติ๊กอย่างน้อย 1 ใน 2 (ส่งช้า / เอกสารไม่ครบ)
   * คืน { valid, deduct, late, docs }
   */
  function checkDeductValid() {
    const deduct = getDeductAmount();
    const late   = isLateSubmit();
    const docs   = isIncompleteDocs();
    const valid  = deduct === 0 || late || docs;
    return { valid, deduct, late, docs };
  }

  /** อัพเดท visibility ของ warning label ให้ตรงกับสถานะ */
  function updateDeductWarning() {
    const { valid, deduct } = checkDeductValid();
    const cmp = getExtCmp(SEL.deductWarningCmpId);
    if (!cmp || typeof cmp.setVisible !== "function") return;
    cmp.setVisible(deduct > 0 && !valid);
  }

  function isOutOfHoursSelected() {
    // Ext path: radiogroup.getValue() = { tab1_rd-in_out: "ใน" | "นอก" }
    const grp = getExtCmp(SEL.inOutGroupCmpId);
    if (grp && typeof grp.getValue === "function") {
      const v = grp.getValue();
      if (v && v[SEL.inOutRadioName] === SEL.outValueLabel) return true;
      if (v && v[SEL.inOutRadioName] !== undefined) return false;
    }
    // fallback DOM: หา radio ที่ checked แล้วเทียบ label
    const checked = document.querySelector(
      `input[type="radio"][name="${SEL.inOutRadioName}"]:checked`
    );
    if (!checked) return false;
    const labelEl = checked.closest(".x-form-type-radio")?.querySelector(".x-form-cb-label");
    return labelEl ? labelEl.textContent.trim() === SEL.outValueLabel : false;
  }

  function getActiveModifiers() {
    const list = [];
    if (isOutOfAreaChecked()) {
      // ค่ามาจาก numberfield ก่อน → fallback default จาก config
      const { amount, source } = getOutOfAreaAmount();
      if (amount !== 0 || source === "custom") {
        // amount 0 ที่ user กรอกเอง = ตั้งใจให้ +0 ก็ใส่ใน list เพื่อ log ให้ครบ
        list.push({
          key: "outOfArea",
          label: source === "custom" ? "นอกพื้นที่ (custom)" : "นอกพื้นที่",
          amount: amount,
        });
      }
    }
    if (isOutOfHoursSelected()) {
      const { amount, source } = getOutOfHoursAmount();
      if (amount !== 0 || source === "custom") {
        list.push({
          key: "outOfHours",
          label: source === "custom" ? "นอกเวลา (custom)" : "นอกเวลา",
          amount: amount,
        });
      }
    }
    // หักเงิน: ไม่มี toggle — value > 0 ก็หัก (negative modifier)
    const deduct = getDeductAmount();
    if (deduct > 0) {
      list.push({ key: "deduct", label: "หักเงิน", amount: -deduct });
    }
    return list;
  }

  // ─────────────────────────────────────────────────────────
  // Sync: คำนวณ fee สุดท้าย แล้ว setValue ถ้าต่างจากของเดิม
  // ─────────────────────────────────────────────────────────

  function isProvinceEnabled(provinceId) {
    const allow = getCFG().enabledProvinces || [];
    if (!allow.length) return true;          // [] = อนุญาตทุกจังหวัด
    return allow.includes(String(provinceId));
  }

  /**
   * จังหวัดนี้อยู่ใน fee config ใดๆ หรือไม่?
   * ตรวจ 4 maps: PROVINCE_FEE_MAP โดยตรง + amphur/tumbon ที่ขึ้นต้นด้วย provinceId
   * (amphur 4 หลัก = provinceID + 2 หลัก, tumbon 6 หลัก = provinceID + 4 หลัก)
   *
   * Note: คืน true ถ้า config ยังไม่ load (4 maps ว่างหมด) — กัน flicker ตอน boot
   * ก่อน loader.js fetch /api/config สำเร็จ (ไม่งั้น clear ทุกฟิลด์ค้าง)
   */
  function isProvinceInDatabase(provinceId) {
    if (!provinceId) return false;
    const pid = String(provinceId);
    const pm = getProvinceMap(), am = getAmphurMap(), at = getAmphurTable(), tm = getTumbonMap();
    if (Object.keys(pm).length === 0 && Object.keys(am).length === 0 &&
        Object.keys(at).length === 0 && Object.keys(tm).length === 0) {
      return true; // config ยังไม่ load → assume in-DB (skip clear)
    }
    if (Object.prototype.hasOwnProperty.call(pm, pid)) return true;
    const hasPrefix = (map) => Object.keys(map).some((k) => k.startsWith(pid));
    return hasPrefix(am) || hasPrefix(at) || hasPrefix(tm);
  }

  /**
   * เคลียร์ค่าบริการ/ค่าเดินทาง/ค่ารูป (เสนอ + อนุมัติ) — ใช้ตอนจังหวัดนอก DB / surveyor ไม่อยู่ทีม
   *
   * Sticky-clear (ต่อ namespace): ถ้า `key` เหมือนรอบ poll ก่อนของ namespace นั้น → skip ทั้งหมด
   * ปล่อยให้ user พิมพ์ค่าเองได้ (เดิม poll 500ms เคลียร์ทับทุกครั้ง พิมพ์ไม่ได้)
   * แยก 2 namespace เพราะ 2 เงื่อนไข (out-of-DB / team-mismatch) ต้อง reset แยก ไม่งั้นการ
   * reset เคสหนึ่งจะทำลาย sticky behavior ของอีกเคสตอนเปลี่ยนสถานะระหว่าง branch
   */
  const _lastClearKey = { outOfDb: null, teamMismatch: null };
  function resetClearKey(namespace) { _lastClearKey[namespace] = null; }
  function clearAllFeeFields(reason, namespace, key) {
    if (key != null && _lastClearKey[namespace] === key) return;
    _lastClearKey[namespace] = key ?? null;
    // non-SE (รวม OSS): SUR_INVEST = user-controlled → ไม่ clear (เพื่อไม่ทับค่าที่พิมพ์)
    if (isSurveyorSE()) {
      setOneField(SEL.feeCmpId,     SEL.feeInput,       "", `SUR_INVEST [${reason} → clear]`);
    }
    setOneField(SEL.insInvestCmpId, SEL.insInvestInput, "", `INS_INVEST [${reason} → clear]`);
    setOneField(SEL.insTransCmpId,  SEL.insTransInput,  "", `INS_TRANS [${reason} → clear]`);
    setOneField(SEL.insPhotoCmpId,  SEL.insPhotoInput,  "", `INS_PHOTO [${reason} → clear]`);
  }

  /**
   * ตั้งค่าฟิลด์ตัวเดียว (มี skip-if-same + flash + log) — utility สำหรับ multi-field mode
   * ส่ง value = "" หรือ null → clear ฟิลด์ (ใช้ตอน MtypeID เปลี่ยนแล้วฟิลด์เดิมไม่ valid อีกแล้ว)
   */
  function setOneField(cmpId, sel, value, label) {
    const el = document.querySelector(sel);
    if (!el) return false;

    const isClear = (value === "" || value === null || value === undefined);
    if (isClear) {
      // ถ้าฟิลด์ว่างอยู่แล้ว → ไม่ต้องแตะ (กัน flash ทุกรอบ poll)
      if (!el.value || String(el.value).trim() === "") return false;
    } else {
      if (isSameNumeric(el.value, value)) return false;
    }

    const mode = setFieldValue(cmpId, el, isClear ? "" : value);
    if (!mode) {
      warn("ไม่พบ component/element สำหรับ", cmpId);
      return false;
    }
    flashHighlight(el);
    log(`Set ${label} = ${isClear ? "(cleared)" : value} [${mode}]`);
    return true;
  }

  /**
   * Multi-field mode: ใช้กับอำเภอที่อยู่ใน AMPHUR_FEE_TABLE
   * เติมหลายช่อง (SUR_INVEST / INS_INVEST / INS_TRANS / INS_PHOTO) ตาม MtypeID + SE/non-SE
   *
   * รองรับ 4 รูปแบบ entry:
   *   (a) flat SUR_INVEST                       — ระยอง ฯลฯ — ค่าเดียวต่ออำเภอ
   *   (b) SUR_INVEST_BY_TEAM (ไม่มี flat)       — ชลบุรี — เรทแยกตามทีม (Q1 policy: ทีมไม่ match → clear)
   *   (c) sub-area override                     — ชลบุรี ตำบลพิเศษ (บ่อวิน/พลูตาหลวง) ผ่าน checkbox
   *   (d) flat + BY_TEAM override (กาญจนบุรี)   — มีทั้ง SUR_INVEST flat + SUR_INVEST_BY_TEAM/INS_TRANS_BY_TEAM
   *       → ทีม match ใช้ override, ไม่ match ใช้ flat (fallback)
   *
   * Q1 policy ยังอยู่: ถ้า entry มี BY_TEAM แต่ "ไม่มี" SUR_INVEST flat + ทีมไม่ match → clear ทั้ง 4 ฟิลด์
   */
  function syncMultiFields(amphurId, tbl) {
    const mtype = readMtypeId();
    const isSE  = isSurveyorSE();
    const mt12  = (mtype === "1" || mtype === "2");
    const mt34  = (mtype === "3" || mtype === "4");

    // ── Sub-area override: ถ้า amphur นี้มี tumbon override + checkbox ติ๊ก → swap entry ──
    let effective = tbl;
    let label = `amphur ${amphurId}`;
    const sub = findSubAreaForAmphur(amphurId);
    if (sub && isSubAreaChecked()) {
      effective = sub.entry;
      label = `tumbon ${sub.tumbonId} (${sub.entry.label})`;
    }

    // surveyor team (ใช้ทั้ง SUR และ INS_TRANS override)
    const surveyorTeam = readSurveyorTeam();
    const hasSurFlat = (effective.SUR_INVEST !== undefined && effective.SUR_INVEST !== null);
    const hasSurByTeam = !!effective.SUR_INVEST_BY_TEAM;

    // ── SUR_INVEST resolve ──
    let surBase = null;
    let surLabel = "";
    if (isSE) {
      // 1) ลอง team override ก่อน
      if (hasSurByTeam && surveyorTeam && effective.SUR_INVEST_BY_TEAM[surveyorTeam] !== undefined) {
        surBase = effective.SUR_INVEST_BY_TEAM[surveyorTeam];
        surLabel = `team=${surveyorTeam}`;
      }
      // 2) fallback: flat SUR_INVEST (กาญจนบุรี เคส d — surveyor นอกทีมยังได้เรทกลาง)
      else if (hasSurFlat) {
        surBase = effective.SUR_INVEST;
        surLabel = hasSurByTeam
          ? `flat fallback (team ${surveyorTeam || "ไม่ระบุ"} ไม่ match)`
          : "";
      }
    }

    // ── Q1 policy: SE surveyor + entry pure team-based (ไม่มี flat) + ทีมไม่ match → clear ทั้ง 4 ฟิลด์ ──
    // non-SE (ชื่อไม่ขึ้น "SE/SEC") = ผู้สำรวจนอกระบบบริษัท → ปล่อยให้กรอกเอง ไม่ clear
    // ใช้ sticky-clear (clearAllFeeFields with key) — clear ครั้งเดียวตอน enter เงื่อนไข
    // poll รอบถัดไปที่ยังเข้าเงื่อนไขเดิม → skip ปล่อยให้ user พิมพ์ค่าเองได้
    if (isSE && hasSurByTeam && !hasSurFlat && surBase === null) {
      clearAllFeeFields(
        `${label}, surveyor ไม่อยู่ทีม`,
        "teamMismatch",
        `${amphurId}:${surveyorTeam || ""}`
      );
      return;
    }
    // ออกจาก Q1 path (set surBase ได้) — reset namespace ให้ครั้งถัดไปที่กลับเข้า Q1 จะ clear ค่าค้าง
    resetClearKey("teamMismatch");

    // ── SUR_INVEST: เฉพาะ SE + มี base — บวก modifier ──
    if (surBase !== null) {
      const mods = getActiveModifiers();
      const total = mods.reduce((sum, m) => sum + m.amount, surBase);
      const modLabel = mods.length
        ? " " + mods.map(m => `${m.amount >= 0 ? "+" : ""}${m.amount} ${m.label}`).join(" ")
        : "";
      setOneField(SEL.feeCmpId, SEL.feeInput, total,
        `SUR_INVEST [${label}${surLabel ? ", " + surLabel : ""}] (base ${surBase}${modLabel})`);
    }

    // INS_INVEST: เลือกตาม MtypeID (1-2 vs 3-4)
    if (mt12 && effective.INS_INVEST_12 !== undefined) {
      setOneField(SEL.insInvestCmpId, SEL.insInvestInput, effective.INS_INVEST_12,
        `INS_INVEST [${label}, MtypeID ${mtype}=เคลม${mtype === "1" ? "สด" : "แห้ง"}]`);
    } else if (mt34 && effective.INS_INVEST_34 !== undefined) {
      setOneField(SEL.insInvestCmpId, SEL.insInvestInput, effective.INS_INVEST_34,
        `INS_INVEST [${label}, MtypeID ${mtype}=${mtype === "3" ? "ติดตาม" : "เจรจาสินไหม"}]`);
    }

    // INS_TRANS resolve — รองรับ team override เช่นเดียวกับ SUR
    //   ถ้ามี INS_TRANS_BY_TEAM + team match → ใช้ override
    //   else ถ้ามี INS_TRANS flat → ใช้ flat
    //   else → clear
    let transValue = null;
    let transLabel = label;
    const hasTransByTeam = !!effective.INS_TRANS_BY_TEAM;
    if (hasTransByTeam && surveyorTeam && effective.INS_TRANS_BY_TEAM[surveyorTeam] !== undefined) {
      transValue = effective.INS_TRANS_BY_TEAM[surveyorTeam];
      transLabel = `${label}, team=${surveyorTeam}`;
    } else if (effective.INS_TRANS !== undefined) {
      transValue = effective.INS_TRANS;
      if (hasTransByTeam) transLabel = `${label}, flat fallback`;
    }
    if (transValue !== null) {
      setOneField(SEL.insTransCmpId, SEL.insTransInput, transValue, `INS_TRANS [${transLabel}]`);
    } else {
      setOneField(SEL.insTransCmpId, SEL.insTransInput, "", `INS_TRANS [${label} → ไม่ระบุ, clear]`);
    }

    // INS_PHOTO: เฉพาะ MtypeID 1-2 + entry มี INS_PHOTO_12; กรณีอื่น → clear
    if (mt12 && effective.INS_PHOTO_12 !== undefined) {
      setOneField(SEL.insPhotoCmpId, SEL.insPhotoInput, effective.INS_PHOTO_12,
        `INS_PHOTO [${label}, MtypeID ${mtype}]`);
    } else {
      const reason = mt34 ? `MtypeID ${mtype}` : `${label} ไม่ระบุ`;
      setOneField(SEL.insPhotoCmpId, SEL.insPhotoInput, "",
        `INS_PHOTO [${reason} → clear]`);
    }
  }

  /**
   * Simple mode: SUR_INVEST อย่างเดียว (เดิม) — กทม., สมุทรปราการ ฯลฯ
   *
   * non-SE (รวม OSS): ปล่อยให้ user กรอก SUR_INVEST เอง — ไม่เติม
   * (INS_* fields ไม่อยู่ใน Simple mode อยู่แล้ว)
   */
  function syncSurInvestSimple(provinceId, amphurId, tumbonId) {
    if (!isSurveyorSE()) return;

    const feeEl = document.querySelector(SEL.feeInput);
    if (!feeEl) return;

    const base = lookupFee(provinceId, amphurId, tumbonId);
    if (!base) return; // ไม่มีในตาราง

    const mods = getActiveModifiers();
    const total = mods.reduce((sum, m) => sum + m.amount, base.fee);

    if (isSameNumeric(feeEl.value, total)) return;

    const mode = setFieldValue(SEL.feeCmpId, feeEl, total);
    if (!mode) {
      warn("ไม่พบ component/element สำหรับ", SEL.feeCmpId);
      return;
    }

    flashHighlight(feeEl);
    const name = lookupName(base.level, base.id);
    const baseLabel = `${base.level}: ${base.id}${name ? " - " + name : ""}`;
    const modLabel = mods.length
      ? " " + mods.map(m => `+${m.amount} ${m.label}`).join(" ")
      : "";
    log(
      `Set ค่าบริการ = ${total} (base ${base.fee} [${baseLabel}]${modLabel}) [${mode}]`
    );
  }

  /**
   * RECV_CLAIM (ค่าเรียกร้อง) > 0 → คำนวณ % ตามชื่อ surveyor:
   *   SE     : SUR_CLAIM = RECV * 5%,  INS_CLAIM = RECV * 10%
   *   non-SE : SUR_CLAIM = RECV * 10%, INS_CLAIM = RECV * 10%
   * ถ้า ≤ 0 หรือว่าง → clear ทั้งสอง
   * ทำงานทุก mode (ไม่ขึ้นกับ AMPHUR_FEE_TABLE หรือ enabledProvinces)
   */
  function syncClaimPercentages() {
    const recvCmp = getExtCmp(SEL.recvClaimCmpId);
    let raw = null;
    if (recvCmp && typeof recvCmp.getValue === "function") {
      raw = recvCmp.getValue();
    } else {
      const el = document.getElementById(SEL.recvClaimInputId);
      if (!el) return;
      raw = el.value;
    }
    const num = parseFloat(String(raw == null ? "" : raw).replace(/,/g, ""));
    const isEmpty = !Number.isFinite(num) || num <= 0;

    if (isEmpty) {
      setOneField(SEL.surClaimCmpId, SEL.surClaimInput, "", "SUR_CLAIM (RECV ว่าง/0 → clear)");
      setOneField(SEL.insClaimCmpId, SEL.insClaimInput, "", "INS_CLAIM (RECV ว่าง/0 → clear)");
      return;
    }

    const isSE   = isSurveyorSE();
    const surPct = isSE ? 0.05 : 0.10;
    const surVal = Math.round(num * surPct * 100) / 100;
    const insVal = Math.round(num * 0.10  * 100) / 100;
    const tag    = isSE ? "SE" : "non-SE";
    setOneField(SEL.surClaimCmpId, SEL.surClaimInput, surVal,
      `SUR_CLAIM (${surPct * 100}% ของ ${num}, ${tag})`);
    setOneField(SEL.insClaimCmpId, SEL.insClaimInput, insVal,
      `INS_CLAIM (10% ของ ${num}, ${tag})`);
  }

  /**
   * "ต่อเนื่อง" override — fixed rate ที่กำหนดไว้ก่อนคำนวณ multi-field/simple
   *
   * Rules:
   *   service_type = "ต่อเนื่อง" + MtypeID 2 (เคลมแห้ง) ทุกจังหวัด:
   *     SUR=50, INS_INVEST=100, INS_PHOTO=50
   *   service_type = "ต่อเนื่อง" + MtypeID 1 (เคลมสด) + จังหวัด BMR (10/11/12/13):
   *     SUR=100, INS_INVEST=300, INS_PHOTO=50
   *   service_type = "ต่อเนื่อง" + MtypeID 1 (เคลมสด) + จังหวัดอื่น:
   *     SUR=100, INS_INVEST=500, INS_PHOTO=50
   *   อื่นๆ → ไม่ override (caller fallthrough ไป syncMultiFields/Simple ปกติ)
   *
   * INS_TRANS: clear ทุก rule (ต่อเนื่อง = ไม่มีค่าเดินทาง)
   * Modifiers (outOfArea/outOfHours/deduct): ไม่ apply ใน ต่อเนื่อง mode
   *
   * @returns {boolean} true ถ้า override ถูก apply (caller skip normal logic)
   */
  const BMR_PROVINCE_IDS = new Set(["10", "11", "12", "13"]);
  function applyContinuousOverride(provinceId) {
    if (readServiceType() !== "ต่อเนื่อง") return false;
    const mtype = readMtypeId();

    let rule = null;
    if (mtype === "2") {
      rule = { sur: 50,  ins: 100, photo: 50, label: "MtypeID 2 เคลมแห้ง" };
    } else if (mtype === "1") {
      if (BMR_PROVINCE_IDS.has(String(provinceId))) {
        rule = { sur: 100, ins: 300, photo: 50, label: "MtypeID 1 เคลมสด BMR" };
      } else {
        rule = { sur: 100, ins: 500, photo: 50, label: "MtypeID 1 เคลมสด non-BMR" };
      }
    }
    if (!rule) return false; // MtypeID 3/4 — ไม่มี rule → fallthrough

    const tag = `ต่อเนื่อง [${rule.label}]`;
    // non-SE (รวม OSS): ปล่อยให้ user กรอก SUR_INVEST เอง — เติมเฉพาะ INS_*
    if (isSurveyorSE()) {
      setOneField(SEL.feeCmpId,     SEL.feeInput,       rule.sur,   `SUR_INVEST ${tag}`);
    }
    setOneField(SEL.insInvestCmpId, SEL.insInvestInput, rule.ins,   `INS_INVEST ${tag}`);
    setOneField(SEL.insPhotoCmpId,  SEL.insPhotoInput,  rule.photo, `INS_PHOTO ${tag}`);
    setOneField(SEL.insTransCmpId,  SEL.insTransInput,  "",         `INS_TRANS ${tag} → clear`);
    return true;
  }

  /**
   * Entry point: เลือก mode ตามว่า amphurId อยู่ใน AMPHUR_FEE_TABLE หรือไม่
   *   - อยู่ → multi-field (ระยอง)
   *   - ไม่อยู่ → simple SUR_INVEST (กทม. ฯลฯ)
   * "ต่อเนื่อง" override ทำงานก่อน — ถ้า apply แล้วจะ short-circuit
   */
  function syncFeeFromLocation() {
    const provinceId = readHiddenValue(SEL.provinceHidden);
    const amphurId   = readHiddenValue(SEL.amphurHidden);
    const tumbonId   = readHiddenValue(SEL.tumbonHidden);

    // ค่าเรียกร้อง % — ทำเสมอ ไม่ขึ้นกับ whitelist
    syncClaimPercentages();

    // จังหวัดถูกเลือกแล้วแต่ไม่อยู่ใน fee config ใดๆ → เคลียร์ 4 ฟิลด์ครั้งเดียว (sticky)
    // (เช็คก่อน whitelist เพื่อให้เคลียร์ค่าค้างได้แม้จังหวัดไม่อยู่ใน enabledProvinces
    //  เช่น หนองคาย — ไม่อยู่ทั้งใน PROVINCE_FEE_MAP และ enabledProvinces)
    // ตรวจแค่ provinceId อย่างเดียว — ไม่ต้องรอเลือกอำเภอ
    // Sticky-clear key = provinceId → clear ครั้งเดียวตอนเลือกจังหวัดนี้ครั้งแรก
    // หลังจากนั้น user พิมพ์ค่าเองในช่อง SUR_INVEST ได้ (poll ไม่ทับ)
    if (provinceId && !isProvinceInDatabase(provinceId)) {
      clearAllFeeFields(`province ${provinceId} นอกฐานข้อมูล`, "outOfDb", provinceId);
      updateDeductWarning();
      return;
    }

    if (!isProvinceEnabled(provinceId)) return; // นอก whitelist → ไม่แตะ fee field

    // ออกจาก out-of-DB branch (จังหวัดอยู่ใน DB) → reset namespace ให้ครั้งถัดไปที่กลับสู่
    // out-of-DB (เช่น user สลับ ระยอง ↔ หนองคาย) เคลียร์ค่าระยองที่ extension เซ็ตค้างไว้ได้
    resetClearKey("outOfDb");

    // "ต่อเนื่อง" override — ถ้า matched → set 4 fields fixed + return
    if (applyContinuousOverride(provinceId)) {
      updateDeductWarning();
      return;
    }

    const tbl = getAmphurTable()[amphurId];
    if (tbl) {
      syncMultiFields(amphurId, tbl);
    } else {
      syncSurInvestSimple(provinceId, amphurId, tumbonId);
    }

    // อัพเดท warning label (ตอบสนองทันที)
    updateDeductWarning();

    // Note: capture จะส่งตอนกดปุ่ม "ยืนยันการตรวจสอบ" (#tab1_save) เท่านั้น
    // — ไม่ใช่ตอนเปลี่ยนค่าในฟอร์ม (เลิก debounce แล้ว)
  }

  // ─────────────────────────────────────────────────────────
  // Capture: snapshot ของฟอร์ม → ส่งไป ISOLATED → background → server
  // Trigger: ผูกกับการกดปุ่ม "ยืนยันการตรวจสอบ" (#tab1_save) เท่านั้น
  //          — 1 click = 1 capture (ถ้าค่าเปลี่ยนจากครั้งก่อน)
  // ─────────────────────────────────────────────────────────

  let lastCaptureSig = "";  // dedup: skip ถ้า payload เหมือนรอบก่อน

  function readExtNumber(cmpId, sel) {
    const cmp = getExtCmp(cmpId);
    if (cmp && typeof cmp.getValue === "function") {
      const v = cmp.getValue();
      if (v !== null && v !== undefined && v !== "") {
        const n = Number(String(v).replace(/,/g, ""));
        if (!isNaN(n)) return n;
      }
    }
    if (sel) {
      const el = document.querySelector(sel);
      if (el && el.value) {
        const n = Number(String(el.value).replace(/,/g, ""));
        if (!isNaN(n)) return n;
      }
    }
    return null;
  }

  function buildCapture() {
    const provinceId = readHiddenValue(SEL.provinceHidden);
    const amphurId   = readHiddenValue(SEL.amphurHidden);
    const tumbonId   = readHiddenValue(SEL.tumbonHidden);
    if (!provinceId && !amphurId) return null; // ยังไม่เลือกอะไร — ไม่ capture
    if (!isProvinceEnabled(provinceId)) return null;

    // กฎ: ถ้ากรอกยอดหัก ต้องระบุเหตุผล (ส่งช้า / เอกสารไม่ครบ) อย่างน้อย 1 ข้อ
    // ไม่งั้น skip capture เพื่อกัน DB เก็บ deduct โดยไม่มีเหตุผล
    const dv = checkDeductValid();
    if (!dv.valid) {
      log(`Capture skipped: หักเงิน ${dv.deduct} บาท แต่ยังไม่ติ๊กเหตุผล`);
      return null;
    }

    const surveyorName = readSurveyorName();

    const outOfArea  = isOutOfAreaChecked();
    const outOfHours = isOutOfHoursSelected();
    const outOfAreaInfo  = outOfArea  ? getOutOfAreaAmount()  : null;
    const outOfHoursInfo = outOfHours ? getOutOfHoursAmount() : null;
    const deduct = getDeductAmount();

    const tbl = getAmphurTable()[amphurId];
    const mode = tbl ? "multi-field" : "simple";

    return {
      ts: new Date().toISOString(),
      province_id: provinceId || null,
      province_name: lookupName("province", provinceId) || null,
      amphur_id: amphurId || null,
      amphur_name: lookupName("amphur", amphurId) || null,
      tumbon_id: tumbonId || null,
      tumbon_name: lookupName("tumbon", tumbonId) || null,
      mtype_id: readMtypeId() || null,
      surveyor_name: surveyorName || null,
      is_se: isSurveyorSE(),
      inspector_name: readInspectorName(),
      sur_invest: readExtNumber(SEL.feeCmpId, SEL.feeInput),
      ins_invest: readExtNumber(SEL.insInvestCmpId, SEL.insInvestInput),
      ins_trans:  readExtNumber(SEL.insTransCmpId, SEL.insTransInput),
      ins_photo:  readExtNumber(SEL.insPhotoCmpId, SEL.insPhotoInput),
      out_of_area: outOfArea,
      out_of_area_amt: outOfAreaInfo ? outOfAreaInfo.amount : null,
      out_of_hours: outOfHours,
      out_of_hours_amt: outOfHoursInfo ? outOfHoursInfo.amount : null,
      deduct_amt: deduct > 0 ? deduct : null,
      late_submit: isLateSubmit(),
      incomplete_docs: isIncompleteDocs(),
      mode,
    };
  }

  function sendCapture(rec) {
    try {
      window.postMessage(
        { __isurveyHelper: true, type: "capture-data", payload: rec },
        window.location.origin
      );
    } catch (e) {
      warn("capture postMessage failed:", e);
    }
  }

  /**
   * captureNow — เก็บ snapshot ปัจจุบันทันที (เรียกตอนกดปุ่ม "ยืนยันการตรวจสอบ")
   *   - validate ผ่าน buildCapture (return null ถ้า deduct ไม่มี flag, ฯลฯ)
   *   - dedup: skip ถ้า payload เหมือนครั้งก่อน
   */
  function captureNow() {
    const rec = buildCapture();
    if (!rec) return; // null = invalid (warning label ในฟอร์มจะแสดงสาเหตุ)
    const { ts, ...rest } = rec;
    const sig = JSON.stringify(rest);
    if (sig === lastCaptureSig) {
      log("Capture skipped: payload เหมือนรอบก่อน");
      return;
    }
    lastCaptureSig = sig;
    sendCapture(rec);
    log("Capture sent (on save):", rec.province_id, rec.amphur_id, "mode=" + rec.mode);
  }

  // ─────────────────────────────────────────────────────────
  // Watchers: location hidden inputs + modifier inputs + polling
  // ─────────────────────────────────────────────────────────

  const observers = new Map();

  function attachObserverFor(selector) {
    const el = document.querySelector(selector);
    if (!el) return false;

    const prev = observers.get(selector);
    if (prev && prev.target !== el) {
      prev.observer.disconnect();
      observers.delete(selector);
    } else if (prev) {
      return true;
    }

    const observer = new MutationObserver(() => syncFeeFromLocation());
    observer.observe(el, { attributes: true, attributeFilter: ["value"] });
    observers.set(selector, { observer, target: el });
    log("MutationObserver attached:", selector);
    return true;
  }

  function attachAllLocationObservers() {
    attachObserverFor(SEL.provinceHidden);
    attachObserverFor(SEL.amphurHidden);
    attachObserverFor(SEL.tumbonHidden);
  }

  /**
   * Listener แบบ delegated สำหรับ checkbox/radio ของ modifier
   * ติดครั้งเดียวที่ document — ไม่ต้องผูกใหม่ตอน DOM เปลี่ยน
   */
  function attachModifierListeners() {
    if (window.__iSurveyHelperModifierListenerAttached) return;
    window.__iSurveyHelperModifierListenerAttached = true;

    // 'change' = checkbox / radio / numberfield (blur) / combobox / text input
    document.addEventListener("change", (ev) => {
      const t = ev.target;
      if (!t) return;
      const matches =
        t.id === SEL.outOfAreaInputId ||
        t.id === SEL.outOfAreaAmountInputId ||
        t.id === SEL.outOfHoursAmountInputId ||
        t.id === SEL.deductAmountInputId ||
        t.id === SEL.lateSubmitInputId ||
        t.id === SEL.incompleteDocsInputId ||
        t.id === SEL.mtypeIdInputId ||
        t.id === SEL.surveyorNameInputId ||
        t.id === SEL.recvClaimInputId ||
        t.id === SEL.serviceTypeInputId ||
        t.id === SEL.subAreaInputId ||
        (t.type === "radio" && t.name === SEL.inOutRadioName);
      if (matches) {
        // sync ทันทีหลัง Ext กระจาย event ภายใน
        setTimeout(syncFeeFromLocation, 0);
      }
    }, true);

    // 'input' = ขณะ user พิมพ์ใน numberfield (live update)
    document.addEventListener("input", (ev) => {
      const t = ev.target;
      if (t && (
        t.id === SEL.outOfAreaAmountInputId ||
        t.id === SEL.outOfHoursAmountInputId ||
        t.id === SEL.deductAmountInputId ||
        t.id === SEL.recvClaimInputId
      )) {
        setTimeout(syncFeeFromLocation, 0);
      }
    }, true);
    log("Modifier change-listener attached (delegated on document)");
  }

  /**
   * ผูก Ext component event 'change' โดยตรง — สำหรับ combobox/checkbox ที่
   * Ext ไม่ fire native DOM 'change' บน inputEl (เช่น tab1_claim_MtypeID)
   * ใช้ flag บนตัว cmp เอง — ถ้า Ext destroy + recreate cmp ใหม่ flag หาย
   * → re-attach อัตโนมัติในรอบ poll ถัดไป
   */
  function attachExtChangeListener(cmpId, label) {
    const cmp = getExtCmp(cmpId);
    if (!cmp || typeof cmp.on !== "function") return false;
    if (cmp.__iSurveyHelperListenerAttached) return true;
    cmp.__iSurveyHelperListenerAttached = true;
    cmp.on("change", () => {
      log(`Ext change → ${label} → sync`);
      syncFeeFromLocation();
    });
    log(`Ext change-listener attached: ${label} (${cmpId})`);
    return true;
  }

  function attachAllExtListeners() {
    attachExtChangeListener(SEL.mtypeIdCmpId, "MtypeID");
    attachExtChangeListener(SEL.surveyorNameCmpId, "Surveyor");
    attachExtChangeListener(SEL.recvClaimCmpId, "RecvClaim");
    attachExtChangeListener(SEL.serviceTypeCmpId, "ServiceType");
  }

  /**
   * เปิด type-ahead บน combobox จังหวัด/อำเภอ/ตำบล —
   * host ตั้ง editable=false, typeAhead=false ทำให้ user พิมพ์ค้นหาไม่ได้
   * ใช้ flag บน cmp กัน double-apply; re-apply อัตโนมัติถ้า Ext recreate
   */
  function enableTypeAhead(cmpId) {
    const cmp = getExtCmp(cmpId);
    if (!cmp) return false;
    if (cmp.__iSurveyHelperTypeAheadEnabled) return true;
    cmp.__iSurveyHelperTypeAheadEnabled = true;
    try {
      if (typeof cmp.setEditable === "function") cmp.setEditable(true);
      else cmp.editable = true;
      cmp.typeAhead = true;
      cmp.queryMode = "local";
      cmp.minChars = 0;
      if (cmp.inputEl && cmp.inputEl.dom) cmp.inputEl.dom.removeAttribute("readonly");
      log(`Type-ahead enabled: ${cmpId}`);
    } catch (e) {
      warn(`Failed to enable type-ahead on ${cmpId}:`, e);
      return false;
    }
    return true;
  }

  function enableAllTypeAhead() {
    enableTypeAhead(SEL.provinceCmpId);
    enableTypeAhead(SEL.amphurCmpId);
    enableTypeAhead(SEL.tumbonCmpId);
  }

  /**
   * กรอง store ของ combobox จังหวัดตาม userProvincePreferences (จาก popup)
   * - prefs ว่าง → ถอด filter (แสดงครบ 77)
   * - prefs มีรายการ → ถอด filter เก่าแล้วใส่ filter ใหม่ (filter id = "__iSurveyHelperUserPref")
   *
   * Re-apply ทุก poll เพราะ host อาจ clear filter ตอน re-render combobox
   */
  let lastFilterSig = null;
  function filterProvinceCombobox() {
    const cmp = getExtCmp(SEL.provinceCmpId);
    if (!cmp || typeof cmp.getStore !== "function") return false;
    const store = cmp.getStore();
    if (!store) return false;

    const prefs = (getCFG().userProvincePreferences) || [];
    const sig = prefs.length ? prefs.slice().sort().join(",") : "";

    try {
      // ถ้า filter ของเรามีอยู่แล้วและ sig ตรง — เช็ค count ดูว่ายังถูก apply อยู่
      const existing = (store.getFilters && store.getFilters().getByKey)
        ? store.getFilters().getByKey("__iSurveyHelperUserPref")
        : null;
      if (existing && lastFilterSig === sig) return true;

      // remove old filter (silent — ไม่ trigger event)
      if (typeof store.removeFilter === "function") {
        store.removeFilter("__iSurveyHelperUserPref", true);
      }

      if (prefs.length === 0) {
        lastFilterSig = "";
        return true;
      }

      const set = new Set(prefs.map(String));
      const valueField = cmp.valueField || "provinceID";
      store.addFilter([{
        id: "__iSurveyHelperUserPref",
        filterFn: (rec) => set.has(String(rec.get(valueField))),
      }]);
      if (sig !== lastFilterSig) {
        log(`Province filter applied: ${prefs.length}/${store.getTotalCount?.() || "?"}`);
      }
      lastFilterSig = sig;
    } catch (e) {
      warn("filterProvinceCombobox error:", e);
      return false;
    }
    return true;
  }

  function startPolling() {
    setInterval(() => {
      attachAllLocationObservers();
      attachAllExtListeners();
      enableAllTypeAhead();
      filterProvinceCombobox();
      syncFeeFromLocation();
    }, CFG.pollIntervalMs);
  }

  /**
   * Listener สำหรับปุ่ม "ยืนยันการตรวจสอบ" (#tab1_save)
   * — ใช้ delegated click ที่ document เผื่อปุ่มถูก re-render
   * — capture phase เพื่ออ่าน state ก่อน Ext จะส่ง form ออกไป
   * — delay 100ms ให้ Ext sync state รอบสุดท้ายก่อนเรา read
   * — ไม่ preventDefault — ปล่อยให้ I Survey save ปกติ
   */
  function attachSaveButtonListener() {
    if (window.__iSurveyHelperSaveListenerAttached) return;
    window.__iSurveyHelperSaveListenerAttached = true;

    document.addEventListener("click", (ev) => {
      const btn = ev.target && ev.target.closest && ev.target.closest("#tab1_save");
      if (!btn) return;
      log("ยืนยันการตรวจสอบ clicked → capture in 100ms");
      setTimeout(captureNow, 100);
    }, true);
    log('Save-button listener attached (#tab1_save)');
  }

  // ─────────────────────────────────────────────────────────
  // Bootstrap
  // ─────────────────────────────────────────────────────────

  function logConfigSnapshot(prefix) {
    const cfg = getCFG();
    const allow = cfg.enabledProvinces || [];
    const mods = cfg.modifierFees || {};
    log(
      `${prefix} mappings: ` +
        `province=${Object.keys(getProvinceMap()).length}, ` +
        `amphur=${Object.keys(getAmphurMap()).length}, ` +
        `tumbon=${Object.keys(getTumbonMap()).length}, ` +
        `amphurTable=${Object.keys(getAmphurTable()).length}, ` +
        `enabledProvinces=${allow.length ? "[" + allow.join(",") + "]" : "ALL"}, ` +
        `modifiers={outOfArea:+${mods.outOfArea || 0}, outOfHours:+${mods.outOfHours || 0}}, ` +
        `poll=${cfg.pollIntervalMs}ms`
    );
  }

  function init() {
    logConfigSnapshot("Loaded.");

    // ฟัง config update จาก admin → log + sync ทันที (ไม่ต้องรอ poll)
    window.addEventListener("isurvey-config-updated", () => {
      logConfigSnapshot("Config updated.");
      lastFilterSig = null; // บังคับ re-apply filter (sig อาจเหมือนเดิมแต่ store filter ถูก clear)
      filterProvinceCombobox();
      syncFeeFromLocation();
    });

    if (window.__ISURVEY_REF__) {
      const c = window.__ISURVEY_REF__.counts;
      log(`Reference data ready: ${c.provinces} จังหวัด, ${c.amphurs} อำเภอ, ${c.tumbons} ตำบล`);
    } else {
      window.addEventListener("isurvey-ref-ready", () => {
        const c = window.__ISURVEY_REF__?.counts;
        if (c) log(`Reference data ready: ${c.provinces} จังหวัด, ${c.amphurs} อำเภอ, ${c.tumbons} ตำบล`);
      }, { once: true });
    }

    attachAllLocationObservers();
    attachAllExtListeners();
    enableAllTypeAhead();
    filterProvinceCombobox();
    attachModifierListeners();
    attachSaveButtonListener();
    syncFeeFromLocation();
    startPolling();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
