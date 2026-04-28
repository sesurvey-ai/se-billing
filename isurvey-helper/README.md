# I Survey Auto-Fill Helper

Chrome Extension (Manifest V3) สำหรับเติม "ค่าบริการ" อัตโนมัติบนหน้าฟอร์ม
ของระบบ I Survey (`https://cloud.isurvey.mobi/main.php`) ตาม
**จังหวัด / อำเภอ / ตำบล** ที่ผู้ใช้เลือก

โค้ดถูกฉีดเข้า **MAIN world** ของหน้าเว็บ จึงเรียก `Ext.getCmp().setValue()`
ของ Ext JS ได้โดยตรง ทำให้ระบบคำนวณยอดรวมต่อให้ถูกต้อง

---

## วิธีติดตั้ง (Load unpacked)

1. เปิด Chrome → ไปที่ `chrome://extensions`
2. เปิดสวิตช์ **Developer mode** (มุมขวาบน)
3. กด **Load unpacked** → เลือกโฟลเดอร์ `isurvey-helper/` นี้
4. เปิด/รีเฟรชหน้า `https://cloud.isurvey.mobi/main.php`
5. ลองเลือกจังหวัด → ช่อง "ค่าบริการ" จะถูกเติมและไฮไลต์เหลืองสั้น ๆ

> หากแก้ไขไฟล์ในโฟลเดอร์นี้ ต้องกดปุ่ม **reload** ที่ extension card
> ใน `chrome://extensions` แล้วรีเฟรชหน้าเว็บอีกครั้ง

---

## หลักการคำนวณค่าบริการ

```
final = base (จาก *_FEE_MAP)
      + outOfArea modifier   (ถ้า checkbox "นอกพื้นที่" ติ๊ก)
      + outOfHours modifier  (ถ้า radio "นอก" ถูกเลือก)
```

### Base fee — precedence (เฉพาะเจาะจงสุดชนะ)

```
tumbonID (ตำบล)  >  amphurID (อำเภอ)  >  provinceID (จังหวัด)
```

ตัวอย่างใน [`config.js`](./config.js):
```js
PROVINCE_FEE_MAP = { "10": 700 };           // กทม. มาตรฐาน 700
AMPHUR_FEE_MAP   = { "1003": 900 };         // เขตหนองจอก override 900
TUMBON_FEE_MAP   = { "100303": 1100 };      // ตำบลในหนองจอก override 1100
```

### Modifier (เปิด/ปิด/ปรับจำนวนเงินได้ใน config.js → `modifierFees`)

| Modifier | Trigger | Default | หมายเหตุ |
|----------|---------|---------|----------|
| `outOfArea` | checkbox "นอกพื้นที่" (`tab1_chk_co_area`) ถูกติ๊ก | +50 | ถ้า user กรอกยอดเอง ใน numberfield ที่โผล่ขึ้นข้างหลัง checkbox จะใช้ค่านั้นแทน default |
| `outOfHours` | radio "นอก" ใน group `tab1_grd-in_out` ถูกเลือก | +100 | ค่าคงที่ตาม config |

ตั้ง `modifierFees.outOfArea = 0` หรือ `outOfHours = 0` เพื่อปิด

**Numberfield "ยอดเงิน (บาท)" สำหรับ outOfArea:**
- โผล่อัตโนมัติเมื่อติ๊ก checkbox (จัดการโดย [feature-out-of-area-amount.js](./feature-out-of-area-amount.js))
- หาย + คืน width checkbox เป็น 400 เมื่อปลด
- ค่าใน field จะถูก feed กลับเข้า fee คำนวณทันที (ทั้ง `change` และ `input` event)

### Whitelist จังหวัด (ทดสอบทีละจังหวัด)

`ISURVEY_HELPER_CONFIG.enabledProvinces` ใน config.js:
- `[]` → ทำงานทุกจังหวัด
- `["10"]` → เฉพาะกรุงเทพฯ (default ตอนนี้)
- `["10", "11"]` → กทม. + สมุทรปราการ

ถ้าผู้ใช้เลือกจังหวัดที่ไม่อยู่ใน whitelist → extension จะไม่แตะค่าบริการเลย

### ตัวอย่างผลลัพธ์ (กทม., base 700)

| สภาพฟอร์ม | ค่าบริการที่ได้ |
|-----------|---------------|
| ใน + ในพื้นที่ | 700 |
| นอก + ในพื้นที่ | 800 (+100) |
| ใน + นอกพื้นที่ (ไม่กรอกยอด) | 750 (+50 default) |
| ใน + นอกพื้นที่ (กรอก 80) | 780 (+80 custom) |
| นอก + นอกพื้นที่ (กรอก 120) | 920 (+120 +100) |

---

## วิธีเพิ่ม / แก้ไข mapping

แก้ไฟล์เดียว: [`config.js`](./config.js)

```js
window.PROVINCE_FEE_MAP = {
  "10": 700,   // กรุงเทพมหานคร
  "11": 800,   // สมุทรปราการ
  "12": 800,   // นนทบุรี
  // เพิ่มจังหวัดใหม่ที่นี่
};

window.AMPHUR_FEE_MAP = {
  // amphurID 4 หลัก  (= provinceID + ลำดับอำเภอ)
  // "5018": 1200,  // อมก๋อย (เชียงใหม่) — พื้นที่ทุรกันดาร
};

window.TUMBON_FEE_MAP = {
  // tumbonID 6 หลัก  (= provinceID + amphurSeq + tumbonSeq)
  // "501803": 1500, // ตำบล X อ.อมก๋อย — เคสพิเศษ
};
```

### หา ID ได้อย่างไร?

**วิธีที่ 1 — ดูจาก DevTools (เร็วถ้ามีหน้าเปิดอยู่):**
1. เปิดหน้าฟอร์ม เลือกจังหวัด/อำเภอ/ตำบลที่ต้องการ
2. กด `F12` → แท็บ **Elements** → ค้น (`Ctrl+F`):
   - `tab1_survey_provinceID` → ดู value ของ hidden input
   - `tab1_survey_amphurID`
   - `tab1_survey_tumbonID`
3. ค่า `value` คือ ID ที่ต้องใส่เป็น key (ใส่ในเครื่องหมายคำพูดเสมอ)

**วิธีที่ 2 — เปิดไฟล์ reference (ค้นจากชื่อ):**
- [`data/provinces.json`](./data/provinces.json) — 77 จังหวัด
- [`data/amphurs.json`](./data/amphurs.json) — อำเภอครบทั้งประเทศ
- [`data/tumbons.json`](./data/tumbons.json) — ตำบลครบทั้งประเทศ

ค้นจากชื่อ → จดเลข ID

### Format ของ ID

| ระดับ | จำนวนหลัก | โครงสร้าง | ตัวอย่าง |
|-------|-----------|-----------|----------|
| province | 2 | — | `10` = กรุงเทพฯ |
| amphur | 4 | provinceID + ลำดับ 2 หลัก | `1003` = เขตหนองจอก (อยู่ในจังหวัด 10) |
| tumbon | 6 | provinceID + amphurSeq + tumbonSeq | `100303` = ตำบลในอำเภอ 1003 |

---

## โครงสร้างไฟล์

```
isurvey-helper/
├── manifest.json                        ← MV3 + content_scripts + web_accessible_resources
├── config.js                            ← *_FEE_MAP + ตัวเลือกอื่น ๆ (แก้ที่นี่ที่เดียว)
├── content.js                           ← Logic หลัก (MAIN world): observer + setValue
├── loader.js                            ← Bridge (ISOLATED world): fetch JSON → postMessage → MAIN
├── feature-out-of-area-amount.js        ← UI: numberfield "ยอดเงิน" คู่กับ checkbox "นอกพื้นที่"
├── data/
│   ├── provinces.json                   ← 77 จังหวัด (reference)
│   ├── amphurs.json                     ← อำเภอทั้งประเทศ (reference)
│   └── tumbons.json                     ← ตำบลทั้งประเทศ (reference)
├── icon-16.png / icon-48.png / icon-128.png
└── README.md
```

### หน้าที่ของแต่ละไฟล์

| ไฟล์ | World | หน้าที่ |
|------|-------|--------|
| `manifest.json` | — | ประกาศ extension, match URL, inject scripts, expose `data/*.json` |
| `loader.js` | ISOLATED | fetch JSON อ้างอิง → ส่งให้ MAIN ผ่าน `window.postMessage` (ใช้ postMessage แทน inline script เพราะหน้าเว็บมี CSP เข้ม) |
| `config.js` | MAIN | กำหนด `*_FEE_MAP` และ `ISURVEY_HELPER_CONFIG` |
| `content.js` | MAIN | อ่าน hidden inputs / modifier inputs, lookup fee, set ผ่าน `Ext.getCmp().setValue()` |
| `feature-out-of-area-amount.js` | MAIN | สร้าง/ลบ numberfield "ยอดเงิน (บาท)" ตามสถานะ checkbox "นอกพื้นที่" (poll ทุก 500ms) |
| `data/*.json` | — | ข้อมูล reference จาก API I Survey ใช้ทั้ง runtime (log) และ developer (เปิดอ่าน) |

---

## การทำงาน (สรุป)

### Reference data bridge (ISOLATED ↔ MAIN)
1. **`loader.js` (ISOLATED)** รันที่ `document_start`
   → `fetch(chrome.runtime.getURL("data/*.json"))` พร้อมกัน 3 ไฟล์
   → ส่ง payload ให้ MAIN ผ่าน `window.postMessage({type:"ref-data-response", payload})`
2. **`content.js` (MAIN)** ผูก `message` listener ที่หัว IIFE ตั้งแต่ก่อน init
   → ส่ง `ref-data-request` ทันที + retry ทุก 500ms (สูงสุด 20 ครั้ง)
   เผื่อ loader ยังโหลดไม่เสร็จ
   → เมื่อรับ payload → set `window.__ISURVEY_REF__` + dispatch `isurvey-ref-ready`

> **ทำไมต้อง postMessage?** หน้า cloud.isurvey.mobi มี CSP เข้ม
> (`script-src 'self' ...`) ห้าม inline script — แม้แต่จาก content script
> การ `appendChild(<script>textContent=...</script>)` จะถูก block

### Auto-fill ค่าบริการ (`content.js` MAIN, document_idle)
- ผูก `MutationObserver` กับ hidden inputs ของ province / amphur / tumbon
- ผูก delegated `change` + `input` listener สำหรับ checkbox "นอกพื้นที่",
  radio "ใน/นอก", และ numberfield "ยอดเงิน"
- มี `setInterval` 500ms เป็น safety-net (re-attach observer ถ้า DOM ถูก
  re-render และ re-sync ค่าเผื่อ Ext set `.value` โดยไม่แตะ attribute)
- ทุกครั้งที่ trigger:
  1. lookup base fee ตาม precedence (tumbon > amphur > province)
  2. รวม modifier ที่ active (outOfArea + outOfHours)
  3. ถ้า `tab1_SUR_INVEST` ไม่ตรง → `Ext.getCmp(...).setValue(total)`
  4. ไฮไลต์ช่องสีเหลือง 1.5 วิ
  5. log breakdown:
     `[ISurveyHelper] Set ค่าบริการ = 850 (base 700 [province: 10 - กรุงเทพฯ] +50 นอกพื้นที่ +100 นอกเวลา) [ext]`

ถ้าไม่เจอ base fee ใน mapping เลย → extension ไม่ทำอะไร ปล่อยให้ผู้ใช้กรอกเอง

### UI numberfield "ยอดเงิน (บาท)" (`feature-out-of-area-amount.js` MAIN)
- Poll ทุก 500ms ตลอดเวลา (เพราะ Ext lazy-render form ตอน user เปิด tab)
- เมื่อเจอ `Ext.getCmp("tab1_chk_co_area")` (instance ใหม่หรือ instance ที่ยังไม่ได้ผูก)
  → ผูก `change` handler
- เมื่อ checkbox = `true`:
  → `parent.insert(idx+1, {xtype:"numberfield", id:"tab1_chk_co_area_amount", ...})`
  → ย่อ width checkbox จาก 400 → 110
- เมื่อ checkbox = `false`:
  → `field.destroy()` + คืน width = 400
- ค่าใน numberfield ส่งกลับไปให้ content.js ใช้แทน default 50
  ผ่าน listener `input`/`change` ที่ delegated อยู่บน document

> **หมายเหตุ:** ชื่อ field ของ amphur/tumbon (`tab1_survey_amphurID` /
> `tab1_survey_tumbonID`) เป็นการอนุมานจาก pattern ของ provinceID
> และยืนยันแล้วว่าใช้ได้กับฟอร์มจริง (`tumbonID` ไม่มีในฟอร์มนี้
> — โค้ด `TUMBON_FEE_MAP` รองรับไว้สำหรับฟอร์มอื่น/อนาคต)
> ถ้าระบบจริงใช้ชื่ออื่น แก้ที่ `ISURVEY_HELPER_CONFIG.selectors` ใน
> `config.js` ได้เลย

---

## การขยายฟีเจอร์ในอนาคต

โครงสร้างแยก logic เป็นฟังก์ชันย่อย ๆ ที่ reuse ได้:

- `setFieldValue(cmpId, domEl, value)` — ใช้ได้กับทุกฟิลด์ Ext JS
- `flashHighlight(el)` — ไฮไลต์ช่องไหนก็ได้
- `isSameNumeric(a, b)` — เทียบค่าตัวเลขแบบ tolerant ต่อ format
- `lookupName(level, id)` — ดึงชื่อจาก reference data (สำหรับ log/UI)
- `lookupFee(p, a, t)` — แก้เป็น mapping แบบซับซ้อนเพิ่มได้
- `getActiveModifiers()` — เพิ่ม modifier ใหม่ตามเงื่อนไขฟอร์ม

ตัวอย่างฟีเจอร์ที่เพิ่มได้:

- คิดค่าบริการตามประเภทเคลม (key ใหม่ใน mapping)
- Modifier ตามจำนวนรูป/ระยะทาง (อ่านจาก field ในฟอร์ม)
- Validate กับยอดสูงสุดที่ระบบยอมรับ
- UI helper อื่น ๆ คล้าย `feature-out-of-area-amount.js`

เพิ่มฟังก์ชัน `syncXxx()` ใหม่ แล้วเรียกจาก `init()` และใน loop ของ
`startPolling()` ได้เลย — หรือสร้างไฟล์ `feature-*.js` แยก แล้ว register
ใน `manifest.json` → `content_scripts.js[]`

---

## Changelog

| Version | การเปลี่ยนแปลง |
|---------|--------------|
| **1.2.1** | Bridge ISOLATED→MAIN ด้วย `postMessage` แทน inline `<script>` injection (CSP fix); `feature-out-of-area-amount.js` poll ตลอดเวลาแทนยอมแพ้หลัง 20 วิ |
| **1.2.0** | เพิ่ม modifier `outOfArea` (+50) / `outOfHours` (+100) + `enabledProvinces` whitelist; เพิ่ม `feature-out-of-area-amount.js` (numberfield คู่กับ checkbox); ค่าใน numberfield override default modifier |
| **1.1.0** | เพิ่ม mapping ระดับ amphur / tumbon (precedence) + reference data 3 ไฟล์ |
| **1.0.0** | Auto-fill ค่าบริการตามจังหวัด |

---

## หมายเหตุ

- ไม่มี dependency ภายนอก
- ไม่ส่งข้อมูลออกไปไหน — ทำงานในเครื่องผู้ใช้เท่านั้น
- ทดสอบกับ Chrome เวอร์ชันล่าสุด
  (รองรับ `world: "MAIN"` ตั้งแต่ Chrome 111+,
   `web_accessible_resources` matches/resources format ตั้งแต่ MV3)
