/**
 * config.js
 * ─────────────────────────────────────────────────────────────
 * ตาราง mapping  ID ของพื้นที่ → ค่าบริการ (บาท)
 *
 * Lookup precedence (เฉพาะเจาะจงสุดชนะ):
 *      tumbonID  >  amphurID  >  provinceID
 *
 * ตัวอย่าง: ถ้าตั้ง provinceID "10" = 700 และ amphurID "1003" = 900
 * เมื่อผู้ใช้เลือก กรุงเทพฯ + เขตหนองจอก → จะใส่ค่าบริการ = 900
 * (ตำบลที่ไม่มี override ใน amphur 1003 ก็จะได้ 900 ตามอำเภอ)
 *
 * วิธีหา ID:
 *   - เปิด DevTools → Elements → ค้นหา hidden input ในฟอร์ม
 *     province : <input type="hidden" name="tab1_survey_provinceID" value="???">
 *     amphur   : <input type="hidden" name="tab1_survey_amphurID"   value="???">
 *     tumbon   : <input type="hidden" name="tab1_survey_tumbonID"   value="???">
 *   - หรือเปิดไฟล์อ้างอิง: data/provinces.json, data/amphurs.json, data/tumbons.json
 *
 * Format ของ ID:
 *   provinceID = 2 หลัก                เช่น  "10" = กรุงเทพฯ
 *   amphurID   = 4 หลัก = province2 + seq2   เช่น  "1003" = เขตหนองจอก (province 10)
 *   tumbonID   = 6 หลัก = province2 + amphurSeq2 + tumbonSeq2
 *                                          เช่น  "100101" = พระบรมมหาราชวัง (อ.1001)
 *
 * key ของทุก map ต้องเป็น "string" เสมอ (เพราะค่าจาก hidden input เป็น string)
 */

window.PROVINCE_FEE_MAP = {
  // provinceID : ค่าบริการ (number)
  "10": 700,   // กรุงเทพมหานคร
  "11": 800,   // สมุทรปราการ
  "12": 800,   // นนทบุรี
  // เพิ่มจังหวัดอื่น ๆ ที่นี่
};

window.AMPHUR_FEE_MAP = {
  // amphurID : ค่าบริการ (number) — override ค่าระดับจังหวัด
  // ตัวอย่าง:
  // "1003": 900,  // เขตหนองจอก (กทม.) — พื้นที่ไกล คิดเพิ่ม
  // "5018": 1200, // อมก๋อย (เชียงใหม่) — พื้นที่ทุรกันดาร
};

window.TUMBON_FEE_MAP = {
  // tumbonID : ค่าบริการ (number) — override ค่าระดับอำเภอ
  // ตัวอย่าง:
  // "501803": 1500, // ตำบล X อ.อมก๋อย — เคสพิเศษ
};

/**
 * ตารางค่าบริการแบบหลายฟิลด์ — ใช้สำหรับจังหวัดที่ต้องเติมหลายช่องตาม
 * MtypeID (ประเภทเคลม) และสถานะพนักงาน (SE/non-SE)
 *
 * Precedence: ถ้า amphurID อยู่ใน TABLE นี้ → ใช้ TABLE (override *_FEE_MAP)
 *
 * Schema (ค่าใส่ได้บางตัวก็ได้ ตัวที่ไม่ใส่ = ไม่กรอก/ไม่ clear ฟิลด์นั้น):
 *   SUR_INVEST_12 : SUR_INVEST เมื่อ MtypeID 1, 2 (เฉพาะพนักงาน SE) + บวก modifier
 *   SUR_INVEST_34 : SUR_INVEST เมื่อ MtypeID 3, 4 (เฉพาะพนักงาน SE) + บวก modifier
 *   INS_INVEST_12 : INS_INVEST เมื่อ MtypeID 1, 2 (เคลมสด/แห้ง) — ทุก surveyor
 *   INS_INVEST_34 : INS_INVEST เมื่อ MtypeID 3, 4 (ติดตาม/เจรจา)  — ทุก surveyor
 *   INS_TRANS     : INS_TRANS  ทุก MtypeID
 *   INS_PHOTO_12  : INS_PHOTO  เฉพาะ MtypeID 1, 2 — เมื่อ MtypeID 3, 4 จะ auto-clear
 *
 * MtypeID  1=เคลมสด, 2=เคลมแห้ง, 3=ติดตาม, 4=เจรจาสินไหม
 *
 * ค่าตัวเลขจาก Google Sheet (ตารางตัวอย่าง field-mapping ของระยอง):
 *   SUR_INVEST_12 = INS_INVEST_12 = column "บริษัท (1 2)"
 *   SUR_INVEST_34 = INS_INVEST_34 = column "บริษัท (3 4)"
 *   INS_TRANS     = column "ค่าพาหนะ"
 *   INS_PHOTO_12  = column "ค่ารูป"
 */
window.AMPHUR_FEE_TABLE = {
  // === จังหวัดระยอง (provinceID 21) — บริษัท 1-2 = 500, บริษัท 3-4 = 400 ทุกอำเภอ ===
  "2101": { SUR_INVEST_12: 500, SUR_INVEST_34: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 350, INS_PHOTO_12: 50 }, // เมืองระยอง
  "2102": { SUR_INVEST_12: 500, SUR_INVEST_34: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 550, INS_PHOTO_12: 50 }, // บ้านฉาง
  "2103": { SUR_INVEST_12: 500, SUR_INVEST_34: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 600, INS_PHOTO_12: 50 }, // แกลง
  "2104": { SUR_INVEST_12: 500, SUR_INVEST_34: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 800, INS_PHOTO_12: 50 }, // วังจันทร์
  "2105": { SUR_INVEST_12: 500, SUR_INVEST_34: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 350, INS_PHOTO_12: 50 }, // บ้านค่าย
  "2106": { SUR_INVEST_12: 500, SUR_INVEST_34: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 600, INS_PHOTO_12: 50 }, // ปลวกแดง
  "2107": { SUR_INVEST_12: 500, SUR_INVEST_34: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 950, INS_PHOTO_12: 50 }, // เขาชะเมา
  "2108": { SUR_INVEST_12: 500, SUR_INVEST_34: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 550, INS_PHOTO_12: 50 }, // นิคมพัฒนา
};

/**
 * ตั้งค่าเสริมสำหรับการทำงานของ helper
 * แก้ไขได้ตามต้องการ
 */
window.ISURVEY_HELPER_CONFIG = {
  // คาบเวลา polling (ms) เผื่อกรณี MutationObserver ไม่ทำงาน
  pollIntervalMs: 500,

  // สีไฮไลต์ช่องเป้าหมายเมื่อมีการเขียนค่าใหม่
  highlightColor: "#fff59d",

  // ระยะเวลาแสดง highlight (ms) ก่อน fade
  highlightDurationMs: 1500,

  // เปิด/ปิดข้อความ debug ใน console
  debug: true,

  /**
   * จำกัดให้ auto-fill ทำงานเฉพาะบาง provinceID เท่านั้น (เผื่อทดสอบทีละจังหวัด)
   *   []         = ใช้ทุกจังหวัด (ปิด whitelist)
   *   ["10"]     = เฉพาะ กทม.
   *   ["10","11"] = กทม. + สมุทรปราการ
   * เมื่อจังหวัดที่เลือกไม่อยู่ใน list → extension จะไม่แตะ tab1_SUR_INVEST เลย
   */
  enabledProvinces: ["10", "21"],

  /**
   * ค่าบวกเพิ่มเมื่อเงื่อนไขในฟอร์มเป็นจริง (apply ทับฐาน fee จาก *_FEE_MAP)
   * รวมทุกข้อที่ active เข้าด้วยกัน เช่น
   *   base 700 + outOfArea 50 + outOfHours 100 = 850
   * ตั้งเป็น 0 เพื่อปิด modifier ใด ๆ
   */
  modifierFees: {
    outOfArea:  50,   // checkbox "นอกพื้นที่" (tab1_chk_co_area)
    outOfHours: 100,  // radio "นอก" ใน group tab1_grd-in_out
  },

  // Selectors / Component IDs ของฟอร์ม
  // ถ้าระบบเปลี่ยนชื่อ field ให้แก้ที่นี่ได้เลย ไม่ต้องแก้ content.js
  selectors: {
    provinceHidden:    'input[type="hidden"][name="tab1_survey_provinceID"]',
    amphurHidden:      'input[type="hidden"][name="tab1_survey_amphurID"]',
    tumbonHidden:      'input[type="hidden"][name="tab1_survey_tumbonID"]',
    feeInput:          'input#tab1_SUR_INVEST-inputEl',
    feeCmpId:          'tab1_SUR_INVEST',
    outOfAreaCmpId:    'tab1_chk_co_area',           // checkbox "นอกพื้นที่"
    inOutGroupCmpId:   'tab1_grd-in_out',            // radiogroup ใน/นอก
    outOfAreaInput:    'input#tab1_chk_co_area-inputEl',
    inOutRadioName:    'tab1_rd-in_out',             // input[name=...] ของ radio ใน/นอก
    outValueLabel:     'นอก',                         // inputValue ของ radio "นอก"
    outOfHoursAmountCmpId:    'tab1_rd_out_amount',  // numberfield ที่ user กรอกยอดเอง (นอกเวลา)
    outOfHoursAmountInputId:  'tab1_rd_out_amount-inputEl',

    // === Multi-field rules (สำหรับ AMPHUR_FEE_TABLE) ===
    mtypeIdCmpId:        'tab1_claim_MtypeID',          // combobox ประเภทเคลม
    mtypeIdInput:        'input#tab1_claim_MtypeID-inputEl',
    mtypeIdInputId:      'tab1_claim_MtypeID-inputEl',
    surveyorNameCmpId:   'tab1_surveyor_name',          // ชื่อผู้สำรวจ
    surveyorNameInput:   'input#tab1_surveyor_name-inputEl',
    surveyorNameInputId: 'tab1_surveyor_name-inputEl',
    insInvestCmpId:      'tab1_INS_INVEST',             // จำนวนเงินอนุมัติ
    insInvestInput:      'input#tab1_INS_INVEST-inputEl',
    insTransCmpId:       'tab1_INS_TRANS',              // ค่าเดินทาง/พาหนะ (อนุมัติ)
    insTransInput:       'input#tab1_INS_TRANS-inputEl',
    insPhotoCmpId:       'tab1_INS_PHOTO',              // ค่ารูปถ่าย (อนุมัติ)
    insPhotoInput:       'input#tab1_INS_PHOTO-inputEl',
  },
};
