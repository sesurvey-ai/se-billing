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
 *   SUR_INVEST    : SUR_INVEST (เฉพาะพนักงาน SE) — ค่าเดียวต่ออำเภอ ทุก MtypeID
 *                   + บวก modifier "นอกพื้นที่"/"นอกเวลา"
 *   INS_INVEST_12 : INS_INVEST เมื่อ MtypeID 1, 2 (เคลมสด/แห้ง) — ทุก surveyor
 *   INS_INVEST_34 : INS_INVEST เมื่อ MtypeID 3, 4 (ติดตาม/เจรจา)  — ทุก surveyor
 *   INS_TRANS     : INS_TRANS  ทุก MtypeID
 *   INS_PHOTO_12  : INS_PHOTO  เฉพาะ MtypeID 1, 2 — เมื่อ MtypeID 3, 4 จะ auto-clear
 *
 * MtypeID  1=เคลมสด, 2=เคลมแห้ง, 3=ติดตาม, 4=เจรจาสินไหม
 *
 * ค่าตัวเลขจาก Google Sheet ของระยอง:
 *   SUR_INVEST    = column "พนักงาน" (ค่าเดียวต่ออำเภอ ไม่แยก MtypeID)
 *   INS_INVEST_12 = column "บริษัท (1 2)"
 *   INS_INVEST_34 = column "บริษัท (3 4)"
 *   INS_TRANS     = column "ค่าพาหนะ"
 *   INS_PHOTO_12  = column "ค่ารูป"
 */
window.AMPHUR_FEE_TABLE = {
  // === จังหวัดระยอง (provinceID 21) — บริษัท 1-2 = 500, บริษัท 3-4 = 400 ทุกอำเภอ ===
  "2101": { SUR_INVEST: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 350, INS_PHOTO_12: 50 }, // เมืองระยอง
  "2102": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 550, INS_PHOTO_12: 50 }, // บ้านฉาง
  "2103": { SUR_INVEST: 600, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 600, INS_PHOTO_12: 50 }, // แกลง
  "2104": { SUR_INVEST: 800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 800, INS_PHOTO_12: 50 }, // วังจันทร์
  "2105": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 350, INS_PHOTO_12: 50 }, // บ้านค่าย
  "2106": { SUR_INVEST: 600, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 600, INS_PHOTO_12: 50 }, // ปลวกแดง
  "2107": { SUR_INVEST: 900, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 950, INS_PHOTO_12: 50 }, // เขาชะเมา
  "2108": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 550, INS_PHOTO_12: 50 }, // นิคมพัฒนา

  // === พระนครศรีอยุธยา (provinceID 14) — บริษัท 500/400 ทุกอำเภอ ===
  "1401": { SUR_INVEST: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 300, INS_PHOTO_12: 50 }, // พระนครศรีอยุธยา
  "1414": { SUR_INVEST: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 350, INS_PHOTO_12: 50 }, // อุทัย
  "1405": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 450, INS_PHOTO_12: 50 }, // บางบาล
  "1407": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 450, INS_PHOTO_12: 50 }, // บางปะหัน
  "1406": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 450, INS_PHOTO_12: 50 }, // บางปะอิน
  "1411": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 450, INS_PHOTO_12: 50 }, // วังน้อย
  "1403": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 450, INS_PHOTO_12: 50 }, // นครหลวง
  "1412": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 450, INS_PHOTO_12: 50 }, // เสนา
  "1415": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 450, INS_PHOTO_12: 50 }, // มหาราช
  "1408": { SUR_INVEST: 550, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 500, INS_PHOTO_12: 50 }, // ผักไห่
  "1409": { SUR_INVEST: 550, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 500, INS_PHOTO_12: 50 }, // ภาชี
  "1413": { SUR_INVEST: 550, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 500, INS_PHOTO_12: 50 }, // บางซ้าย
  "1404": { SUR_INVEST: 600, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 600, INS_PHOTO_12: 50 }, // บางไทร
  "1416": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 700, INS_PHOTO_12: 50 }, // บ้านแพรก
  "1402": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 800, INS_PHOTO_12: 50 }, // ท่าเรือ
  "1410": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 800, INS_PHOTO_12: 50 }, // ลาดบัวหลวง

  // === สระบุรี (provinceID 19) ===
  "1901": { SUR_INVEST: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 350, INS_PHOTO_12: 50 }, // เมืองสระบุรี
  "1910": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 400, INS_PHOTO_12: 50 }, // เสาไห้
  "1913": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 400, INS_PHOTO_12: 50 }, // เฉลิมพระเกียรติ
  "1905": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 400, INS_PHOTO_12: 50 }, // หนองแซง
  "1902": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 500, INS_PHOTO_12: 50 }, // แก่งคอย
  "1903": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 500, INS_PHOTO_12: 50 }, // หนองแค
  "1904": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 500, INS_PHOTO_12: 50 }, // วิหารแดง
  "1906": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 500, INS_PHOTO_12: 50 }, // บ้านหมอ
  "1909": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 500, INS_PHOTO_12: 50 }, // พระพุทธบาท
  "1907": { SUR_INVEST: 550, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 550, INS_PHOTO_12: 50 }, // ดอนพุด
  "1908": { SUR_INVEST: 550, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 600, INS_PHOTO_12: 50 }, // หนองโดน
  "1912": { SUR_INVEST: 800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 850, INS_PHOTO_12: 50 }, // วังม่วง
  "1911": { SUR_INVEST: 850, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 900, INS_PHOTO_12: 50 }, // มวกเหล็ก

  // === จันทบุรี (provinceID 22) ===
  "2201": { SUR_INVEST: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 300, INS_PHOTO_12: 50 }, // เมืองจันทบุรี
  "2205": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 400, INS_PHOTO_12: 50 }, // มะขาม (ใน sheet เขียน "อ.ขาม")
  "2206": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 400, INS_PHOTO_12: 50 }, // แหลมสิงห์
  "2203": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 400, INS_PHOTO_12: 50 }, // ท่าใหม่
  "2202": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 400, INS_PHOTO_12: 50 }, // ขลุง
  "2209": { SUR_INVEST: 550, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 550, INS_PHOTO_12: 50 }, // นายายอาม
  "2210": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 700, INS_PHOTO_12: 50 }, // เขาคิชฌกูฏ
  "2204": { SUR_INVEST: 900, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 900, INS_PHOTO_12: 50 }, // โป่งน้ำร้อน
  "2208": { SUR_INVEST: 1000, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1000, INS_PHOTO_12: 50 }, // แก่งหางแมว
  "2207": { SUR_INVEST: 1000, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1000, INS_PHOTO_12: 50 }, // สอยดาว

  // === นครราชสีมา (provinceID 30) ===
  "3001": { SUR_INVEST: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 300, INS_PHOTO_12: 50 }, // เมืองนครราชสีมา
  "3032": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 350, INS_PHOTO_12: 50 }, // เฉลิมพระเกียรติ
  "3018": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 400, INS_PHOTO_12: 50 }, // สูงเนิน
  "3009": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 400, INS_PHOTO_12: 50 }, // โนนไทย
  "3014": { SUR_INVEST: 550, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 450, INS_PHOTO_12: 50 }, // ปักธงชัย
  "3019": { SUR_INVEST: 600, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 450, INS_PHOTO_12: 50 }, // ขามทะเลสอ
  "3007": { SUR_INVEST: 550, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 450, INS_PHOTO_12: 50 }, // โชคชัย
  "3010": { SUR_INVEST: 550, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 450, INS_PHOTO_12: 50 }, // โนนสูง
  "3028": { SUR_INVEST: 600, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 550, INS_PHOTO_12: 50 }, // พระทองคำ
  "3022": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 900, INS_PHOTO_12: 50 }, // หนองบุญมาก
  "3015": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 650, INS_PHOTO_12: 50 }, // พิมาย
  "3011": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 650, INS_PHOTO_12: 50 }, // ขามสะแกแสง
  "3008": { SUR_INVEST: 750, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 700, INS_PHOTO_12: 50 }, // ด่านขุนทด
  "3006": { SUR_INVEST: 750, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 700, INS_PHOTO_12: 50 }, // จักราช
  "3020": { SUR_INVEST: 750, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 700, INS_PHOTO_12: 50 }, // สีคิ้ว
  "3016": { SUR_INVEST: 800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 750, INS_PHOTO_12: 50 }, // ห้วยแถลง
  "3025": { SUR_INVEST: 800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 800, INS_PHOTO_12: 50 }, // วังน้ำเขียว
  "3002": { SUR_INVEST: 800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 800, INS_PHOTO_12: 50 }, // ครบุรี
  "3024": { SUR_INVEST: 850, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 700, INS_PHOTO_12: 50 }, // โนนแดง
  "3005": { SUR_INVEST: 800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 850, INS_PHOTO_12: 50 }, // บ้านเหลื่อม
  "3004": { SUR_INVEST: 800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 850, INS_PHOTO_12: 50 }, // คง
  "3021": { SUR_INVEST: 850, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 900, INS_PHOTO_12: 50 }, // ปากช่อง
  "3031": { SUR_INVEST: 800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 900, INS_PHOTO_12: 50 }, // สีดา
  "3023": { SUR_INVEST: 850, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 950, INS_PHOTO_12: 50 }, // แก้งสนามนาง
  "3012": { SUR_INVEST: 850, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1000, INS_PHOTO_12: 50 }, // บัวใหญ่
  "3026": { SUR_INVEST: 950, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1000, INS_PHOTO_12: 50 }, // เทพารักษ์
  "3017": { SUR_INVEST: 850, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 850, INS_PHOTO_12: 50 }, // ชุมพวง
  "3003": { SUR_INVEST: 1000, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1100, INS_PHOTO_12: 50 }, // เสิงสาง
  "3013": { SUR_INVEST: 900, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1100, INS_PHOTO_12: 50 }, // ประทาย
  "3027": { SUR_INVEST: 1200, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1250, INS_PHOTO_12: 50 }, // เมืองยาง
  "3029": { SUR_INVEST: 1300, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1300, INS_PHOTO_12: 50 }, // ลำทะเมนชัย
  "3030": { SUR_INVEST: 1000, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1400, INS_PHOTO_12: 50 }, // บัวลาย

  // === ขอนแก่น (provinceID 40) ===
  "4001": { SUR_INVEST: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 300, INS_PHOTO_12: 50 }, // เมืองขอนแก่น
  "4003": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 350, INS_PHOTO_12: 50 }, // พระยืน
  "4002": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 350, INS_PHOTO_12: 50 }, // บ้านฝาง
  "4024": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 450, INS_PHOTO_12: 50 }, // บ้านแฮด
  "4007": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 450, INS_PHOTO_12: 50 }, // น้ำพอง
  "4021": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 500, INS_PHOTO_12: 50 }, // ซำสูง
  "4004": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 500, INS_PHOTO_12: 50 }, // หนองเรือ
  "4017": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 600, INS_PHOTO_12: 50 }, // มัญจาคีรี
  "4008": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 600, INS_PHOTO_12: 50 }, // อุบลรัตน์
  "4009": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 600, INS_PHOTO_12: 50 }, // กระนวน
  "4016": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 700, INS_PHOTO_12: 50 }, // ภูเวียง
  "4023": { SUR_INVEST: 800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 900, INS_PHOTO_12: 50 }, // หนองนาคำ
  "4005": { SUR_INVEST: 800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 900, INS_PHOTO_12: 50 }, // ชุมแพ
  "4019": { SUR_INVEST: 800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 900, INS_PHOTO_12: 50 }, // เขาสวนกวาง
  "4006": { SUR_INVEST: 900, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1200, INS_PHOTO_12: 50 }, // สีชมพู
  "4020": { SUR_INVEST: 900, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1200, INS_PHOTO_12: 50 }, // ภูผาม่าน
  "4029": { SUR_INVEST: 800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 900, INS_PHOTO_12: 50 }, // เวียงเก่า
  "4010": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 600, INS_PHOTO_12: 50 }, // บ้านไผ่
  "4025": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 700, INS_PHOTO_12: 50 }, // โนนศิลา
  "4018": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 700, INS_PHOTO_12: 50 }, // ชนบท
  "4013": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 800, INS_PHOTO_12: 50 }, // แวงใหญ่
  "4012": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 900, INS_PHOTO_12: 50 }, // พล
  "4015": { SUR_INVEST: 850, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 800, INS_PHOTO_12: 50 }, // หนองสองห้อง
  "4014": { SUR_INVEST: 850, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1050, INS_PHOTO_12: 50 }, // แวงน้อย
  "4022": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1000, INS_PHOTO_12: 50 }, // โคกโพธิ์ไชย
  "4011": { SUR_INVEST: 800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 900, INS_PHOTO_12: 50 }, // เปือยน้อย

  // === ฉะเชิงเทรา (provinceID 24) ===
  "2401": { SUR_INVEST: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 300, INS_PHOTO_12: 50 }, // เมืองฉะเชิงเทรา
  "2403": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 350, INS_PHOTO_12: 50 }, // บางน้ำเปรี้ยว
  "2409": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 500, INS_PHOTO_12: 50 }, // แปลงยาว
  "2411": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 350, INS_PHOTO_12: 50 }, // คลองเขื่อน
  "2402": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 350, INS_PHOTO_12: 50 }, // บางคล้า
  "2404": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 350, INS_PHOTO_12: 50 }, // บางปะกง
  "2405": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 300, INS_PHOTO_12: 50 }, // บ้านโพธิ์
  "2406": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 500, INS_PHOTO_12: 50 }, // พนมสารคาม
  "2407": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 500, INS_PHOTO_12: 50 }, // ราชสาส์น
  "2408": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 750, INS_PHOTO_12: 50 }, // สนามชัยเขต
  "2410": { SUR_INVEST: 1300, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1250, INS_PHOTO_12: 50 }, // ท่าตะเกียบ

  // === อุบลราชธานี (provinceID 34) ===
  "3401": { SUR_INVEST: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 350, INS_PHOTO_12: 50 }, // เมืองอุบลราชธานี
  "3415": { SUR_INVEST: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 400, INS_PHOTO_12: 50 }, // วารินชำราบ
  "3431": { SUR_INVEST: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 450, INS_PHOTO_12: 50 }, // เหล่าเสือโก้ก
  "3432": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 500, INS_PHOTO_12: 50 }, // สว่างวีระวงศ์
  "3422": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 550, INS_PHOTO_12: 50 }, // สำโรง
  "3424": { SUR_INVEST: 550, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 600, INS_PHOTO_12: 50 }, // ดอนมดแดง
  "3420": { SUR_INVEST: 650, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 700, INS_PHOTO_12: 50 }, // ตาลสุม
  "3404": { SUR_INVEST: 650, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 700, INS_PHOTO_12: 50 }, // เขื่องใน
  "3414": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 750, INS_PHOTO_12: 50 }, // ม่วงสามสิบ
  "3429": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 750, INS_PHOTO_12: 50 }, // นาเยีย
  "3407": { SUR_INVEST: 800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 850, INS_PHOTO_12: 50 }, // เดชอุดม
  "3419": { SUR_INVEST: 800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 850, INS_PHOTO_12: 50 }, // พิบูลมังสาหาร
  "3411": { SUR_INVEST: 850, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 900, INS_PHOTO_12: 50 }, // ตระการพืชผล
  "3402": { SUR_INVEST: 1150, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1200, INS_PHOTO_12: 50 }, // ศรีเมืองใหม่
  "3425": { SUR_INVEST: 1150, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1200, INS_PHOTO_12: 50 }, // สิรินธร
  "3426": { SUR_INVEST: 1150, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1200, INS_PHOTO_12: 50 }, // ทุ่งศรีอุดม
  "3412": { SUR_INVEST: 1150, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1250, INS_PHOTO_12: 50 }, // กุดข้าวปุ้น
  "3403": { SUR_INVEST: 1250, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1300, INS_PHOTO_12: 50 }, // โขงเจียม
  "3430": { SUR_INVEST: 1350, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1450, INS_PHOTO_12: 50 }, // นาตาล
  "3433": { SUR_INVEST: 1400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1500, INS_PHOTO_12: 50 }, // น้ำขุ่น
  "3421": { SUR_INVEST: 1400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1500, INS_PHOTO_12: 50 }, // โพธิ์ไทร
  "3410": { SUR_INVEST: 1400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1550, INS_PHOTO_12: 50 }, // บุณฑริก
  "3405": { SUR_INVEST: 1500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1600, INS_PHOTO_12: 50 }, // เขมราฐ
  "3408": { SUR_INVEST: 1600, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1750, INS_PHOTO_12: 50 }, // นาจะหลวย
  "3409": { SUR_INVEST: 1700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1850, INS_PHOTO_12: 50 }, // น้ำยืน

  // === เชียงใหม่ (provinceID 50) ===
  "5001": { SUR_INVEST: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 300, INS_PHOTO_12: 50 }, // เมืองเชียงใหม่
  "5019": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 300, INS_PHOTO_12: 50 }, // สารภี
  "5015": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 300, INS_PHOTO_12: 50 }, // หางดง
  "5013": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 300, INS_PHOTO_12: 50 }, // สันกำแพง
  "5012": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 400, INS_PHOTO_12: 50 }, // สันป่าตอง
  "5014": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 400, INS_PHOTO_12: 50 }, // สันทราย
  "5007": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 400, INS_PHOTO_12: 50 }, // แม่ริม
  "5005": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 600, INS_PHOTO_12: 50 }, // ดอยสะเก็ด
  "5022": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 700, INS_PHOTO_12: 50 }, // แม่วาง
  "5024": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 700, INS_PHOTO_12: 50 }, // ดอยหล่อ
  "5023": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 700, INS_PHOTO_12: 50 }, // แม่ออน
  "5006": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1000, INS_PHOTO_12: 50 }, // แม่แตง
  "5008": { SUR_INVEST: 800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1050, INS_PHOTO_12: 50 }, // สะเมิง
  "5011": { SUR_INVEST: 1100, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1500, INS_PHOTO_12: 50 }, // พร้าว
  "5002": { SUR_INVEST: 800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1200, INS_PHOTO_12: 50 }, // จอมทอง
  "5016": { SUR_INVEST: 1300, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1700, INS_PHOTO_12: 50 }, // ฮอด
  "5017": { SUR_INVEST: 1400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1700, INS_PHOTO_12: 50 }, // ดอยเต่า
  "5003": { SUR_INVEST: 1600, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 2100, INS_PHOTO_12: 50 }, // แม่แจ่ม
  "5004": { SUR_INVEST: 1000, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1500, INS_PHOTO_12: 50 }, // เชียงดาว
  "5021": { SUR_INVEST: 1600, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1800, INS_PHOTO_12: 50 }, // ไชยปราการ
  "5020": { SUR_INVEST: 1900, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1900, INS_PHOTO_12: 50 }, // เวียงแหง
  "5025": { SUR_INVEST: 1700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1900, INS_PHOTO_12: 50 }, // กัลยาณิวัฒนา
  "5009": { SUR_INVEST: 1700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1900, INS_PHOTO_12: 50 }, // ฝาง
  "5010": { SUR_INVEST: 1900, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 2200, INS_PHOTO_12: 50 }, // แม่อาย
  "5018": { SUR_INVEST: 1800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 2800, INS_PHOTO_12: 50 }, // อมก๋อย

  // === สุโขทัย (provinceID 64) ===
  "6404": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 700, INS_PHOTO_12: 50 }, // กงไกรลาศ

  // === พิษณุโลก (provinceID 65) ===
  "6501": { SUR_INVEST: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 350, INS_PHOTO_12: 50 }, // เมืองพิษณุโลก
  "6504": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 400, INS_PHOTO_12: 50 }, // บางระกำ
  "6508": { SUR_INVEST: 550, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 500, INS_PHOTO_12: 50 }, // วังทอง
  "6506": { SUR_INVEST: 550, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 550, INS_PHOTO_12: 50 }, // พรหมพิราม
  "6507": { SUR_INVEST: 550, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 550, INS_PHOTO_12: 50 }, // วัดโบสถ์
  "6505": { SUR_INVEST: 600, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 600, INS_PHOTO_12: 50 }, // บางกระทุ่ม
  "6509": { SUR_INVEST: 900, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 950, INS_PHOTO_12: 50 }, // เนินมะปราง
  "6502": { SUR_INVEST: 1400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1400, INS_PHOTO_12: 50 }, // นครไทย
  "6503": { SUR_INVEST: 1500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1500, INS_PHOTO_12: 50 }, // ชาติตระการ

  // === พิจิตร (provinceID 66) ===
  "6609": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 500, INS_PHOTO_12: 50 }, // สากเหล็ก
  "6612": { SUR_INVEST: 550, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 500, INS_PHOTO_12: 50 }, // วชิรบารมี
  "6601": { SUR_INVEST: 650, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 500, INS_PHOTO_12: 50 }, // เมืองพิจิตร
  "6607": { SUR_INVEST: 650, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 500, INS_PHOTO_12: 50 }, // สามง่าม

  // === กาญจนบุรี (provinceID 71) ===
  "7101": { SUR_INVEST: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 350, INS_PHOTO_12: 50 }, // เมืองกาญจนบุรี
  "7106": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 400, INS_PHOTO_12: 50 }, // ท่าม่วง
  "7109": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 450, INS_PHOTO_12: 50 }, // พนมทวน
  "7105": { SUR_INVEST: 600, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 500, INS_PHOTO_12: 50 }, // ท่ามะกา
  "7111": { SUR_INVEST: 550, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 550, INS_PHOTO_12: 50 }, // ด่านมะขามเตี้ย
  "7103": { SUR_INVEST: 600, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 600, INS_PHOTO_12: 50 }, // บ่อพลอย
  "7113": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 750, INS_PHOTO_12: 50 }, // ห้วยกระเจา
  "7102": { SUR_INVEST: 800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 850, INS_PHOTO_12: 50 }, // ไทรโยค
  "7112": { SUR_INVEST: 1050, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1100, INS_PHOTO_12: 50 }, // หนองปรือ
  "7110": { SUR_INVEST: 1150, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1200, INS_PHOTO_12: 50 }, // เลาขวัญ
  "7104": { SUR_INVEST: 1550, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1650, INS_PHOTO_12: 50 }, // ศรีสวัสดิ์
  "7107": { SUR_INVEST: 2000, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 2050, INS_PHOTO_12: 50 }, // ทองผาภูมิ
  "7108": { SUR_INVEST: 3000, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 3100, INS_PHOTO_12: 50 }, // สังขละบุรี

  // === สุพรรณบุรี (provinceID 72) ===
  "7201": { SUR_INVEST: 800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 350, INS_PHOTO_12: 50 }, // เมืองสุพรรณบุรี
  "7204": { SUR_INVEST: 850, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 400, INS_PHOTO_12: 50 }, // บางปลาม้า
  "7205": { SUR_INVEST: 850, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 400, INS_PHOTO_12: 50 }, // ศรีประจันต์
  "7206": { SUR_INVEST: 1000, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 550, INS_PHOTO_12: 50 }, // ดอนเจดีย์
  "7208": { SUR_INVEST: 1000, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 550, INS_PHOTO_12: 50 }, // สามชุก
  "7209": { SUR_INVEST: 1050, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 600, INS_PHOTO_12: 50 }, // อู่ทอง
  "7207": { SUR_INVEST: 1050, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 600, INS_PHOTO_12: 50 }, // สองพี่น้อง
  "7202": { SUR_INVEST: 1250, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 800, INS_PHOTO_12: 50 }, // เดิมบางนางบวช
  "7210": { SUR_INVEST: 1450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1000, INS_PHOTO_12: 50 }, // หนองหญ้าไซ
  "7203": { SUR_INVEST: 1650, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1200, INS_PHOTO_12: 50 }, // ด่านช้าง

  // === นครศรีธรรมราช (provinceID 80) — บริษัท rate ต่างจากที่อื่น (ไม่ใช่ 500/400) ===
  "8001": { SUR_INVEST: 400, INS_INVEST_12: 800, INS_INVEST_34: 650, INS_TRANS: 350, INS_PHOTO_12: 50 }, // เมืองนครศรีธรรมราช
  "8002": { SUR_INVEST: 450, INS_INVEST_12: 850, INS_INVEST_34: 700, INS_TRANS: 400, INS_PHOTO_12: 50 }, // พรหมคีรี
  "8003": { SUR_INVEST: 450, INS_INVEST_12: 850, INS_INVEST_34: 700, INS_TRANS: 400, INS_PHOTO_12: 50 }, // ลานสกา
  "8020": { SUR_INVEST: 450, INS_INVEST_12: 900, INS_INVEST_34: 750, INS_TRANS: 450, INS_PHOTO_12: 50 }, // พระพรหม
  "8008": { SUR_INVEST: 500, INS_INVEST_12: 950, INS_INVEST_34: 800, INS_TRANS: 500, INS_PHOTO_12: 50 }, // ท่าศาลา
  "8023": { SUR_INVEST: 500, INS_INVEST_12: 950, INS_INVEST_34: 800, INS_TRANS: 500, INS_PHOTO_12: 50 }, // เฉลิมพระเกียรติ
  "8013": { SUR_INVEST: 600, INS_INVEST_12: 1050, INS_INVEST_34: 900, INS_TRANS: 600, INS_PHOTO_12: 50 }, // ร่อนพิบูลย์
  "8012": { SUR_INVEST: 600, INS_INVEST_12: 1050, INS_INVEST_34: 900, INS_TRANS: 600, INS_PHOTO_12: 50 }, // ปากพนัง
  "8021": { SUR_INVEST: 600, INS_INVEST_12: 1050, INS_INVEST_34: 900, INS_TRANS: 600, INS_PHOTO_12: 50 }, // นบพิตำ
  "8006": { SUR_INVEST: 700, INS_INVEST_12: 1250, INS_INVEST_34: 1100, INS_TRANS: 800, INS_PHOTO_12: 50 }, // เชียรใหญ่
  "8022": { SUR_INVEST: 700, INS_INVEST_12: 1250, INS_INVEST_34: 1100, INS_TRANS: 800, INS_PHOTO_12: 50 }, // ช้างกลาง
  "8010": { SUR_INVEST: 700, INS_INVEST_12: 1250, INS_INVEST_34: 1100, INS_TRANS: 800, INS_PHOTO_12: 50 }, // นาบอน
  "8019": { SUR_INVEST: 700, INS_INVEST_12: 1250, INS_INVEST_34: 1100, INS_TRANS: 800, INS_PHOTO_12: 50 }, // จุฬาภรณ์
  "8016": { SUR_INVEST: 700, INS_INVEST_12: 1250, INS_INVEST_34: 1100, INS_TRANS: 800, INS_PHOTO_12: 50 }, // หัวไทร
  "8009": { SUR_INVEST: 700, INS_INVEST_12: 1250, INS_INVEST_34: 1100, INS_TRANS: 800, INS_PHOTO_12: 50 }, // ทุ่งสง
  "8004": { SUR_INVEST: 700, INS_INVEST_12: 1250, INS_INVEST_34: 1100, INS_TRANS: 800, INS_PHOTO_12: 50 }, // ฉวาง
  "8007": { SUR_INVEST: 700, INS_INVEST_12: 1250, INS_INVEST_34: 1100, INS_TRANS: 800, INS_PHOTO_12: 50 }, // ชะอวด
  "8014": { SUR_INVEST: 800, INS_INVEST_12: 1350, INS_INVEST_34: 1200, INS_TRANS: 900, INS_PHOTO_12: 50 }, // สิชล
  "8011": { SUR_INVEST: 800, INS_INVEST_12: 1350, INS_INVEST_34: 1200, INS_TRANS: 900, INS_PHOTO_12: 50 }, // ทุ่งใหญ่
  "8018": { SUR_INVEST: 900, INS_INVEST_12: 1450, INS_INVEST_34: 1300, INS_TRANS: 1000, INS_PHOTO_12: 50 }, // ถ้ำพรรณรา
  "8005": { SUR_INVEST: 900, INS_INVEST_12: 1450, INS_INVEST_34: 1300, INS_TRANS: 1000, INS_PHOTO_12: 50 }, // พิปูน
  "8017": { SUR_INVEST: 900, INS_INVEST_12: 1450, INS_INVEST_34: 1300, INS_TRANS: 1000, INS_PHOTO_12: 50 }, // บางขัน
  "8015": { SUR_INVEST: 1100, INS_INVEST_12: 1650, INS_INVEST_34: 1500, INS_TRANS: 1200, INS_PHOTO_12: 50 }, // ขนอม

  // === ภูเก็ต (provinceID 83) ===
  "8301": { SUR_INVEST: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 450, INS_PHOTO_12: 50 }, // เมืองภูเก็ต
  "8302": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 550, INS_PHOTO_12: 50 }, // กะทู้
  "8303": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 650, INS_PHOTO_12: 50 }, // ถลาง

  // === สงขลา (provinceID 90) ===
  "9011": { SUR_INVEST: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 350, INS_PHOTO_12: 50 }, // หาดใหญ่
  "9012": { SUR_INVEST: 450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 400, INS_PHOTO_12: 50 }, // นาหม่อม
  "9014": { SUR_INVEST: 500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 450, INS_PHOTO_12: 50 }, // บางกล่ำ
  "9016": { SUR_INVEST: 600, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 550, INS_PHOTO_12: 50 }, // คลองหอยโข่ง
  "9001": { SUR_INVEST: 600, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 700, INS_PHOTO_12: 50 }, // เมืองสงขลา
  "9013": { SUR_INVEST: 550, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 550, INS_PHOTO_12: 50 }, // ควนเนียง
  "9009": { SUR_INVEST: 650, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 650, INS_PHOTO_12: 50 }, // รัตภูมิ
  "9015": { SUR_INVEST: 650, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 700, INS_PHOTO_12: 50 }, // สิงหนคร
  "9010": { SUR_INVEST: 800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 850, INS_PHOTO_12: 50 }, // สะเดา
  "9003": { SUR_INVEST: 700, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 750, INS_PHOTO_12: 50 }, // จะนะ
  "9002": { SUR_INVEST: 1000, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1100, INS_PHOTO_12: 50 }, // สทิงพระ
  "9004": { SUR_INVEST: 900, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 950, INS_PHOTO_12: 50 }, // นาทวี
  "9008": { SUR_INVEST: 1200, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1400, INS_PHOTO_12: 50 }, // กระแสสินธุ์
  "9007": { SUR_INVEST: 1500, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1600, INS_PHOTO_12: 50 }, // ระโนด
  "9005": { SUR_INVEST: 1450, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1500, INS_PHOTO_12: 50 }, // เทพา
  "9006": { SUR_INVEST: 1600, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 1700, INS_PHOTO_12: 50 }, // สะบ้าย้อย

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
   *
   * Provinces ที่ enabled ตอนนี้ (3 simple + 17 multi-field):
   *   10 กรุงเทพฯ (simple mode), 11 สมุทรปราการ (simple), 12 นนทบุรี (simple)
   *   14 พระนครศรีอยุธยา, 19 สระบุรี, 21 ระยอง, 22 จันทบุรี, 24 ฉะเชิงเทรา
   *   30 นครราชสีมา, 34 อุบลราชธานี, 40 ขอนแก่น
   *   50 เชียงใหม่, 64 สุโขทัย, 65 พิษณุโลก, 66 พิจิตร
   *   71 กาญจนบุรี, 72 สุพรรณบุรี, 80 นครศรีธรรมราช, 83 ภูเก็ต, 90 สงขลา
   */
  enabledProvinces: [
    "10", "11", "12",
    "14", "19", "21", "22", "24",
    "30", "34", "40",
    "50", "64", "65", "66",
    "71", "72", "80", "83", "90",
  ],

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

    // === Deduct (แถวที่ 7 "หักเงิน" — inject โดย feature-deduct-amount.js) ===
    deductAmountCmpId:   'tab1_deduct_amount',
    deductAmountInputId: 'tab1_deduct_amount-inputEl',
  },
};
