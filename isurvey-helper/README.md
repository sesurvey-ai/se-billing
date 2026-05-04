# I Survey Auto-Fill Helper

Chrome Extension (Manifest V3) สำหรับเติม "ค่าบริการ" อัตโนมัติบนหน้าฟอร์ม
ของระบบ I Survey (`https://cloud.isurvey.mobi/main.php`) ตาม
**จังหวัด / อำเภอ / ตำบล** ที่ผู้ใช้เลือก พร้อม **จับข้อมูลที่กรอก** ส่งไปเก็บที่ backend server

ตั้งแต่ **v2.0.0** ข้อมูล rate + capture log ย้ายไปอยู่ใน **backend server**
(โฟลเดอร์ [`../server/`](../server/)) — เพื่อ:

- จัดการเรตจาก **เครื่องเดียว** สำหรับหลาย client ใน LAN เดียวกัน
- เก็บประวัติการกรอกฟอร์ม (capture log) ลง SQLite database
- มีหน้าเว็บ Viewer / Admin / Captures พร้อมใช้

โค้ด extension ยังคงฉีดเข้า **MAIN world** ของหน้าเว็บเหมือนเดิม จึงเรียก
`Ext.getCmp().setValue()` ของ Ext JS ได้โดยตรง

---

## ข้อกำหนดก่อนติดตั้ง

ต้องมี **backend server** รันอยู่ก่อน — ดูคู่มือใน [`../server/README.md`](../server/README.md)
สรุปย่อ:

```bash
cd ../server
npm install
node server.js     # ฟัง http://localhost:3200
```

---

## วิธีติดตั้ง extension (Load unpacked)

1. เปิด Chrome → ไปที่ `chrome://extensions`
2. เปิดสวิตช์ **Developer mode** (มุมขวาบน)
3. กด **Load unpacked** → เลือกโฟลเดอร์ `isurvey-helper/` นี้
4. ตั้งค่า server URL:
   - คลิก **Details** ของ extension → คลิก **Extension options**
   - กรอก Server URL (default `http://localhost:3200`) → "บันทึก" → "ทดสอบเชื่อมต่อ"
5. เปิด/รีเฟรชหน้า `https://cloud.isurvey.mobi/main.php`
6. ลองเลือกจังหวัด → ช่อง "ค่าบริการ" จะถูกเติมและไฮไลต์เหลืองสั้น ๆ

> หากแก้ไขไฟล์ในโฟลเดอร์นี้ ต้องกดปุ่ม **reload** ที่ extension card
> ใน `chrome://extensions` แล้วรีเฟรชหน้าเว็บอีกครั้ง

---

## หน้าเว็บจัดการข้อมูล (อยู่ที่ server)

| URL | หน้าที่ |
|-----|--------|
| `http://<server>:3200/`         | Viewer — อ่านอย่างเดียว สรุปข้อมูลทุก section |
| `http://<server>:3200/admin`    | Admin CRUD — เพิ่ม/แก้/ลบ ทุกตาราง + Import/Export/Reset |
| `http://<server>:3200/captures` | Captures — ข้อมูลที่ extension จับจากฟอร์ม (timestamp + state ทั้งหมด) |

**สิ่งที่จัดการที่หน้า /admin:**
- **ตารางหลายช่อง (Multi-field)** — เพิ่ม/แก้/ลบรายอำเภอ + 5 ค่า (SUR_INVEST, INS_INVEST_12/_34, INS_TRANS, INS_PHOTO_12)
- **จังหวัด (Simple)** / **อำเภอ override** / **ตำบล override**
- **Whitelist จังหวัด** — ติ๊กเปิด/ปิดต่อจังหวัด
- **Modifier defaults** — outOfArea / outOfHours
- **Import/Export JSON** + **Reset to defaults**

**Live update:** บันทึกที่ /admin → server เก็บลง SQLite → extension's `loader.js` poll ทุก 30s
ดึงข้อมูลใหม่ → broadcast ให้ `content.js` ใน MAIN world (เปลี่ยนได้ภายใน 30s โดยไม่ต้องรีเฟรชหน้า cloud.isurvey.mobi)

**Capture log:** เมื่อ user กรอกฟอร์ม content.js debounce 1.5s แล้วส่ง snapshot ไป
ISOLATED → background.js → POST `/api/captures` — ดูได้ที่หน้า /captures

---

## หลักการคำนวณค่าบริการ

Extension มี **2 modes** ตามอำเภอที่ผู้ใช้เลือก:

| Mode | ใช้เมื่อ | ฟิลด์ที่กรอก |
|------|----------|---------------|
| **Simple** | `amphurId` ไม่อยู่ใน `AMPHUR_FEE_TABLE` | `tab1_SUR_INVEST` (ค่าบริการเดียว) |
| **Multi-field** | `amphurId` อยู่ใน `AMPHUR_FEE_TABLE` | `tab1_SUR_INVEST` + `tab1_INS_INVEST` + `tab1_INS_TRANS` + `tab1_INS_PHOTO` |

### Simple mode (กทม., จังหวัดทั่วไป)

```
SUR_INVEST = base (จาก *_FEE_MAP)
           + outOfArea modifier   (ถ้า checkbox "นอกพื้นที่" ติ๊ก)
           + outOfHours modifier  (ถ้า radio "นอก" ถูกเลือก)
```

**Base fee precedence (เฉพาะเจาะจงสุดชนะ):**
```
tumbonID (ตำบล)  >  amphurID (อำเภอ)  >  provinceID (จังหวัด)
```

ตัวอย่างใน [`config.js`](./config.js):
```js
PROVINCE_FEE_MAP = { "10": 700 };           // กทม. มาตรฐาน 700
AMPHUR_FEE_MAP   = { "1003": 900 };         // เขตหนองจอก override 900
TUMBON_FEE_MAP   = { "100303": 1100 };      // ตำบลในหนองจอก override 1100
```

### Multi-field mode (ระยอง — รองรับการบิลแบบหลายช่อง)

ใช้เมื่อต้องเติมหลายฟิลด์พร้อมกันโดยอาศัย **ประเภทเคลม (MtypeID)** + **สถานะพนักงาน (SE/non-SE)**

**Input signals เพิ่มเติม:**

| ฟิลด์ฟอร์ม | อ่านจาก | ใช้งาน |
|-----------|---------|--------|
| `tab1_claim_MtypeID` (combobox) | Ext.getValue() → "1"/"2"/"3"/"4" | `1`=เคลมสด `2`=เคลมแห้ง `3`=ติดตาม `4`=เจรจาสินไหม |
| `tab1_surveyor_name` (text) | Ext.getValue() (fallback DOM) | ขึ้นต้น `se` (case insensitive) → SE; อื่น → non-SE |

**กฎการเติมฟิลด์ (เฉพาะอำเภอที่อยู่ใน `AMPHUR_FEE_TABLE`):**

| ฟิลด์ | ค่าที่ใช้ | เงื่อนไข | บวก modifier? |
|------|---------|----------|---------------|
| `tab1_SUR_INVEST` | `tbl.SUR_INVEST` | SE (surveyor name ขึ้นต้น `se`) — ค่าเดียวต่ออำเภอ ทุก MtypeID | ✓ outOfArea + outOfHours |
| `tab1_INS_INVEST` | `tbl.INS_INVEST_12` | MtypeID ∈ {1,2} | — |
| `tab1_INS_INVEST` | `tbl.INS_INVEST_34` | MtypeID ∈ {3,4} | — |
| `tab1_INS_TRANS`  | `tbl.INS_TRANS` | ทุก MtypeID | — |
| `tab1_INS_PHOTO`  | `tbl.INS_PHOTO_12` | MtypeID ∈ {1,2} | — |
| `tab1_INS_PHOTO`  | *(clear → "")* | MtypeID ∈ {3,4} (auto-clear ค่าเก่า) | — |

> non-SE: `SUR_INVEST` ไม่ถูกแตะ (เก็บไว้ใน config สำหรับการเติมในอนาคต) ส่วน `INS_*` ยังเติมตาม MtypeID ปกติ

**ตารางตัวอย่าง [`AMPHUR_FEE_TABLE`](./config.js):**
```js
// SUR_INVEST = column "พนักงาน" (ต่างกันต่ออำเภอ), INS_INVEST = column "บริษัท" (500/400 ทุกอำเภอ)
// === ระยอง ===
"2101": { SUR_INVEST: 400, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 350, INS_PHOTO_12: 50 }, // เมืองระยอง
"2104": { SUR_INVEST: 800, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 800, INS_PHOTO_12: 50 }, // วังจันทร์
"2107": { SUR_INVEST: 900, INS_INVEST_12: 500, INS_INVEST_34: 400, INS_TRANS: 950, INS_PHOTO_12: 50 }, // เขาชะเมา
// === นครศรีธรรมราช (rate INS แตกต่าง — ไม่ใช่ 500/400) ===
"8001": { SUR_INVEST: 400, INS_INVEST_12: 800, INS_INVEST_34: 650, INS_TRANS: 350, INS_PHOTO_12: 50 }, // เมืองนครศรีธรรมราช
"8015": { SUR_INVEST: 1100, INS_INVEST_12: 1650, INS_INVEST_34: 1500, INS_TRANS: 1200, INS_PHOTO_12: 50 }, // ขนอม
```

**Provinces ที่รองรับใน multi-field mode (17 จังหวัด, 245 อำเภอ):**
ระยอง (21), พระนครศรีอยุธยา (14), สระบุรี (19), จันทบุรี (22), ฉะเชิงเทรา (24), นครราชสีมา (30), อุบลราชธานี (34), ขอนแก่น (40), เชียงใหม่ (50), สุโขทัย (64), พิษณุโลก (65), พิจิตร (66), กาญจนบุรี (71), สุพรรณบุรี (72), นครศรีธรรมราช (80), ภูเก็ต (83), สงขลา (90)

### Modifier (เปิด/ปิด/ปรับจำนวนเงินได้ใน config.js → `modifierFees`)

| Modifier | Trigger | Default | หมายเหตุ |
|----------|---------|---------|----------|
| `outOfArea` | checkbox "นอกพื้นที่" (`tab1_chk_co_area`) ถูกติ๊ก | +50 | ถ้า user กรอกยอดเอง ใน numberfield ที่โผล่ขึ้นข้างหลัง checkbox จะใช้ค่านั้นแทน default |
| `outOfHours` | radio "นอก" ใน group `tab1_grd-in_out` ถูกเลือก | +100 | ถ้า user กรอกยอดเอง ใน numberfield ที่โผล่ขึ้นต่อท้าย radiogroup จะใช้ค่านั้นแทน default |
| `deduct` | numberfield "หักเงิน" (`tab1_deduct_amount`) มีค่า > 0 | — | inject เป็น **แถวที่ 7** ในตารางรายการค่าใช้จ่าย; **หัก** ออกจาก SUR_INVEST (ทำงานทั้ง simple และ multi-field mode) |

ตั้ง `modifierFees.outOfArea = 0` หรือ `outOfHours = 0` เพื่อปิด default amount (numberfield ยังโผล่ขึ้นให้กรอกเองได้)

**Numberfield "ยอดเงิน (บาท)" สำหรับ outOfArea:**
- โผล่อัตโนมัติเมื่อติ๊ก checkbox (จัดการโดย [feature-out-of-area-amount.js](./feature-out-of-area-amount.js))
- หาย + คืน width checkbox เป็น 400 เมื่อปลด
- ค่าใน field จะถูก feed กลับเข้า fee คำนวณทันที (ทั้ง `change` และ `input` event)

**Numberfield "ยอดเงิน (บาท)" สำหรับ outOfHours:**
- โผล่อัตโนมัติเมื่อเลือก radio "นอก" (จัดการโดย [feature-out-of-hours-amount.js](./feature-out-of-hours-amount.js))
- หายเมื่อเลือก radio "ใน"
- ค่าใน field จะถูก feed กลับเข้า fee คำนวณทันที (ทั้ง `change` และ `input` event)

**Numberfield "หักเงิน (บาท)" — แถวที่ 7:**
- inject เป็นแถวใหม่ในตารางรายการค่าใช้จ่ายอัตโนมัติ (จัดการโดย [feature-deduct-amount.js](./feature-deduct-amount.js))
- anchor หา table panel: `Ext.getCmp("tab1_SUR_INVEST").ownerCt.ownerCt`
- หา row 6 (ค่าเรียกร้อง) ใน `table.items` ด้วย textContent → `table.insert(idx+1, {...})` แทรกต่อท้ายแถว 6 (ไม่ใช่ append ท้าย table — มี totals/หมายเหตุ ต่อท้ายอีก)
- ทุก poll 500ms verify ตำแหน่ง — ถ้าผิด (เช่น row ค้างจาก version เก่า) จะ destroy + re-insert ที่ idx ถูก
- ว่าง = ไม่หัก, มีค่า > 0 = หักออกจาก SUR_INVEST (negative modifier)
- ค่าใน field feed กลับเข้า SUR_INVEST ทันที (ทั้ง `change` และ `input` event)
- ทำงานทั้ง simple mode (กทม., ฯลฯ) และ multi-field mode (ระยอง — เฉพาะ SE)

### Whitelist จังหวัด (ทดสอบทีละจังหวัด)

`ISURVEY_HELPER_CONFIG.enabledProvinces` ใน config.js:
- `[]` → ทำงานทุกจังหวัด
- `["10"]` → เฉพาะกรุงเทพฯ
- `["10", "21"]` → กทม. + ระยอง (default ตอนนี้)
- `["10", "11"]` → กทม. + สมุทรปราการ

ถ้าผู้ใช้เลือกจังหวัดที่ไม่อยู่ใน whitelist → extension จะไม่แตะค่าบริการเลย

### ตัวอย่างผลลัพธ์

**Simple mode — กทม. (base 700):**

| สภาพฟอร์ม | SUR_INVEST |
|-----------|------------|
| ใน + ในพื้นที่ | 700 |
| นอก + ในพื้นที่ (ไม่กรอกยอด) | 800 (+100 default) |
| นอก + ในพื้นที่ (กรอก 150) | 850 (+150 custom) |
| ใน + นอกพื้นที่ (ไม่กรอกยอด) | 750 (+50 default) |
| ใน + นอกพื้นที่ (กรอก 80) | 780 (+80 custom) |
| นอก + นอกพื้นที่ (กรอก outOfArea=80, outOfHours=150) | 930 (+80 +150) |

**Multi-field mode — ระยอง / เมืองระยอง (`amphurID 2101`):**

ผลทดสอบจริงที่ได้ (`SUR_INVEST = 400` ทุก MtypeID เพราะมาจาก column "พนักงาน" ของเมืองระยอง):

| สภาพฟอร์ม | SUR_INVEST | INS_INVEST | INS_TRANS | INS_PHOTO |
|-----------|------------|------------|-----------|-----------|
| SE + เคลมสด (1) | 400 | 500 | 350 | 50 |
| SE + เคลมแห้ง (2) | 400 | 500 | 350 | 50 |
| SE + เคลมแห้ง (2) + นอกเวลา | 400 (+100) | 500 | 350 | 50 |
| SE + ติดตาม (3) | 400 | 400 | 350 | *(clear)* |
| SE + เจรจา (4) | 400 | 400 | 350 | *(clear)* |
| SE + เจรจา (4) + นอกพื้นที่ (กรอก 80) | 480 (+80) | 400 | 350 | *(clear)* |
| สลับ MtypeID 1 → 3 | 400 (เท่าเดิม) | 500 → 400 | 350 (เท่าเดิม) | 50 → *(clear)* |
| non-SE + เคลมสด (1) | (ไม่แตะ) | 500 | 350 | 50 |

> หมายเหตุ: อำเภออื่นในระยอง `SUR_INVEST` จะต่างกันตาม column "พนักงาน" ของอำเภอนั้น เช่น วังจันทร์ = 800, เขาชะเมา = 900 — ส่วน `INS_INVEST` (500/400) ใช้ค่าเดียวกันทุกอำเภอ

---

## วิธีเพิ่ม / แก้ไข mapping

**แนะนำ: ใช้หน้า /admin บน server** — ไม่ต้องแก้โค้ด ไม่ต้อง git ไม่ต้อง reload extension

**ทางเลือก: แก้ seed defaults** — ถ้าจะตั้งค่าเริ่มต้นสำหรับ DB ใหม่ที่ยังว่าง
หรือสำหรับการ Reset to defaults ให้แก้ [`../server/seed/default-data.json`](../server/seed/default-data.json)
- มีผลก็ต่อเมื่อ DB ว่าง (first run) **หรือ** กด "Reset to defaults" ที่หน้า /admin
- ปกติแล้วใช้หน้า /admin แก้ไขในรันไทม์ดีกว่า — defaults จะใช้แค่กรณี seed/restore

```jsonc
{
  "PROVINCE_FEE_MAP": { "10": 700, "11": 800, "12": 800 },
  "AMPHUR_FEE_MAP": {},
  "TUMBON_FEE_MAP": {},
  "AMPHUR_FEE_TABLE": {
    "2101": { "SUR_INVEST": 400, "INS_INVEST_12": 500, "INS_INVEST_34": 400, "INS_TRANS": 350, "INS_PHOTO_12": 50 }
  },
  "modifierFees": { "outOfArea": 50, "outOfHours": 100 },
  "enabledProvinces": ["10", "21", ...]
}
```

**Schema ของ AMPHUR_FEE_TABLE:**
- `SUR_INVEST` — SE only — ค่าเดียวต่ออำเภอ ทุก MtypeID + บวก modifier
- `INS_INVEST_12` / `INS_INVEST_34` — ทุก surveyor — แยกตาม MtypeID 1-2 / 3-4
- `INS_TRANS` — ทุก MtypeID
- `INS_PHOTO_12` — 1-2 only; 3-4 auto-clear

ฟิลด์ที่ไม่อยากให้กรอก ปล่อยไม่ใส่ใน object — extension จะข้ามฟิลด์นั้น

### หา ID ได้อย่างไร?

**วิธีที่ 1 — ดูจาก DevTools (เร็วถ้ามีหน้าเปิดอยู่):**
1. เปิดหน้าฟอร์ม เลือกจังหวัด/อำเภอ/ตำบลที่ต้องการ
2. กด `F12` → แท็บ **Elements** → ค้น (`Ctrl+F`):
   - `tab1_survey_provinceID` → ดู value ของ hidden input
   - `tab1_survey_amphurID`
   - `tab1_survey_tumbonID`
3. ค่า `value` คือ ID ที่ต้องใส่เป็น key (ใส่ในเครื่องหมายคำพูดเสมอ)

**Field IDs ที่ extension ใช้** (ทั้งหมดอยู่ใน [`config-bridge.js`](./config-bridge.js) → `STATIC_CONFIG.selectors`):

| หน้าที่ | Field / Component ID |
|--------|---------------------|
| province / amphur / tumbon | `tab1_survey_provinceID` / `_amphurID` / `_tumbonID` (hidden inputs) |
| ประเภทเคลม (combobox) | `tab1_claim_MtypeID` — ค่า 1/2/3/4 |
| ชื่อผู้สำรวจ (text readonly) | `tab1_surveyor_name` — ขึ้นต้น `se` = SE |
| ค่าบริการเสนอ | `tab1_SUR_INVEST` |
| ค่าบริการอนุมัติ | `tab1_INS_INVEST` |
| ค่าเดินทาง/พาหนะ (อนุมัติ) | `tab1_INS_TRANS` |
| ค่ารูปถ่าย (อนุมัติ) | `tab1_INS_PHOTO` |
| checkbox "นอกพื้นที่" | `tab1_chk_co_area` |
| radiogroup "ใน/นอกเวลา" | `tab1_grd-in_out` (radio name `tab1_rd-in_out`) |
| **หักเงิน** (inject แถว 7) | `tab1_deduct_amount` (numberfield) |

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
├── manifest.json                        ← MV3 + host_permissions + background SW + options_ui + content_scripts
├── background.js                        ← Service worker: HTTP I/O ไปหา server
├── options.html / options.js            ← Settings page (Server URL field) — เปิดจาก chrome://extensions Details
├── config-bridge.js                     ← MAIN: receive config จาก loader → set window.X
├── content.js                           ← MAIN: Logic หลัก + capture trigger (observer + setValue + debounced capture)
├── loader.js                            ← ISOLATED: ref data + ขอ config จาก SW (poll 30s) + forward capture
├── feature-out-of-area-amount.js        ← MAIN: numberfield "ยอดเงิน" คู่ checkbox "นอกพื้นที่"
├── feature-out-of-hours-amount.js       ← MAIN: numberfield "ยอดเงิน" ต่อท้าย radio "นอก" (นอกเวลา)
├── feature-deduct-amount.js             ← MAIN: แถวที่ 7 "หักเงิน" — inject เข้าตารางค่าใช้จ่าย
├── data/
│   ├── provinces.json                   ← 77 จังหวัด (reference, สำหรับ name lookup)
│   ├── amphurs.json                     ← อำเภอทั้งประเทศ (reference)
│   └── tumbons.json                     ← ตำบลทั้งประเทศ (reference)
├── icon-16.png / icon-48.png / icon-128.png
└── README.md
```

### หน้าที่ของแต่ละไฟล์

| ไฟล์ | World | หน้าที่ |
|------|-------|--------|
| `manifest.json` | — | ประกาศ extension, match URL, inject scripts, options_ui = options.html, host_permissions เพื่อให้ service worker fetch ไป backend ได้ |
| `background.js` | service worker | HTTP I/O ทุกอย่างไปยัง backend (fetch config, send capture, ping) — รับ chrome.runtime messages |
| `options.html` / `options.js` | extension page | ตั้งค่า Server URL (default `http://localhost:3200`) + ปุ่มทดสอบเชื่อมต่อ |
| `loader.js` | ISOLATED | (1) fetch reference JSON → MAIN, (2) ขอ config จาก background → broadcast MAIN ทุก 30s, (3) forward capture-data จาก MAIN → background |
| `config-bridge.js` | MAIN | receive config payload จาก loader → set `window.PROVINCE_FEE_MAP` / `window.AMPHUR_FEE_TABLE` / ฯลฯ + dispatch `isurvey-config-ready` / `isurvey-config-updated` |
| `content.js` | MAIN | อ่าน hidden inputs / modifier inputs, lookup fee, set ผ่าน `Ext.getCmp().setValue()` — **อ่าน window.X สดทุก sync** + debounced capture (1.5s) → postMessage ISOLATED |
| `feature-out-of-area-amount.js` | MAIN | สร้าง/ลบ numberfield "ยอดเงิน (บาท)" ตามสถานะ checkbox "นอกพื้นที่" (poll ทุก 500ms) |
| `feature-out-of-hours-amount.js` | MAIN | สร้าง/ลบ numberfield "ยอดเงิน (บาท)" ตามสถานะ radio "นอก" ใน group ใน/นอกเวลา (poll ทุก 500ms) |
| `feature-deduct-amount.js` | MAIN | inject แถวที่ 7 "หักเงิน" + numberfield ลงใน table panel ที่ครอบ `tab1_SUR_INVEST` (poll ทุก 500ms; ค่าหัก = negative modifier ของ SUR_INVEST) |
| `data/*.json` | — | ข้อมูล reference จาก API I Survey ใช้ทั้ง runtime (name lookup ใน capture) — server มี copy แยกของตัวเอง |

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
  radio "ใน/นอก", numberfield "ยอดเงิน", **combobox `tab1_claim_MtypeID`**,
  และ **input `tab1_surveyor_name`**
- มี `setInterval` 500ms เป็น safety-net (re-attach observer ถ้า DOM ถูก
  re-render และ re-sync ค่าเผื่อ Ext set `.value` โดยไม่แตะ attribute) —
  สำคัญสำหรับ `surveyor_name` (readonly input — ไม่ trigger DOM event เอง)
- `syncFeeFromLocation()` เป็น dispatcher เลือก mode:
  - ถ้า `amphurId` อยู่ใน `AMPHUR_FEE_TABLE` → **Multi-field mode**
  - ถ้าไม่อยู่ → **Simple mode**

**Simple mode flow:**
1. lookup base fee ตาม precedence (tumbon > amphur > province)
2. รวม modifier ที่ active (outOfArea + outOfHours)
3. ถ้า `tab1_SUR_INVEST` ไม่ตรง → `Ext.getCmp(...).setValue(total)` + flash + log

**Multi-field mode flow** (`syncMultiFields`):
1. อ่าน MtypeID จาก `Ext.getCmp("tab1_claim_MtypeID").getValue()` (fallback: map text label → ID)
2. เช็ค SE จาก `tab1_surveyor_name` ขึ้นต้น `se` (case insensitive)
3. ลำดับเติม (skip ถ้า field config ไม่มีค่า):
   - `SUR_INVEST` ← `tbl.SUR_INVEST` + modifiers (เฉพาะ SE)
   - `INS_INVEST` ← `tbl.INS_INVEST_12` หรือ `_34` ตาม MtypeID
   - `INS_TRANS`  ← `tbl.INS_TRANS` (ทุก MtypeID)
   - `INS_PHOTO`  ← `tbl.INS_PHOTO_12` (1-2) หรือ `""` (3-4 → auto-clear)
4. แต่ละ field flash + log breakdown แยก เช่น
   `[ISurveyHelper] Set INS_INVEST [amphur 2101, MtypeID 1=เคลมสด] = 500 [ext]`

ถ้าไม่เจอ base fee ใน mapping เลย → extension ไม่ทำอะไร ปล่อยให้ผู้ใช้กรอกเอง

### UI numberfield "ยอดเงิน (บาท)" — outOfArea (`feature-out-of-area-amount.js` MAIN)
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

### UI numberfield "ยอดเงิน (บาท)" — outOfHours (`feature-out-of-hours-amount.js` MAIN)
- Poll ทุก 500ms ตลอดเวลา (เหตุผลเดียวกับ outOfArea)
- เมื่อเจอ `Ext.getCmp("tab1_grd-in_out")` (radiogroup) → ผูก `change` handler
- เมื่อ value ของ radiogroup = `{tab1_rd-in_out: "นอก"}`:
  → `parent.insert(idx+1, {xtype:"numberfield", id:"tab1_rd_out_amount", ...})`
  → ไม่ย่อ width radiogroup (label "ใน/นอกเวลางาน:" + 2 radios กิน width จริง — numberfield จะวางต่อท้ายใน items list ของ parent)
- เมื่อ value = `{tab1_rd-in_out: "ใน"}`:
  → `field.destroy()`
- ค่าใน numberfield ส่งกลับไปให้ content.js ใช้แทน default 100 ผ่าน listener เดียวกัน

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
| **2.2.0** | **Capture trigger + UI overhaul**: (1) **Capture trigger เปลี่ยนเป็นปุ่ม "ยืนยันการตรวจสอบ"** (#tab1_save) — เลิก debounced-on-change (1.5s), ใช้ delegated click listener (capture phase) → 1 การกด = 1 capture, มี dedup กันส่งซ้ำ → DB สะอาด, record ตรงกับงานยืนยันจริง. (2) **หน้า /captures restructure**: ลบ "รวม" ออก, เพิ่ม "รวมบริษัท" (ค่าบริการ+ค่าพาหนะ+รูป) + "รวมพนักงาน" (พนักงาน+นอกพื้นที่+นอกเวลา−หัก), column "พนักงาน" แสดงค่า base (derive ย้อนจาก sur_invest), reorder ตาม ค่าบริการ→ค่าพาหนะ→รูป→รวมบริษัท→พนักงาน→...→รวมพนักงาน. (3) **Header แปลไทย**: Surveyor→พนักงานสำรวจ, SUR→พนักงาน, INS→ค่าบริการ, TRANS→ค่าพาหนะ, PHOTO→รูป (ทั้งหน้า /captures และ /admin/captures + เรทราคา /, /admin). (4) **Excel export match หน้า /captures**: ลบ Mode + SE column แยก, รวมช่อง "นอกพื้นที่/ยอด" เป็นช่องเดียว, เพิ่ม "รวมบริษัท" + "รวมพนักงาน". (5) UI: panel เต็มจอ (ลบ max-width 1400px), ค่าใน table /captures อยู่กลาง |
| **2.1.0** | **Capture metadata + UX**: เพิ่ม checkbox "ส่งช้า" / "เอกสารไม่ครบ" ในแถว 7 (หักเงิน) — บังคับเลือกเหตุผลเมื่อ deduct > 0 (warning label สีแดงในฟอร์ม + extension skip POST + server reject 400). เพิ่ม `inspector_name` (อ่านจาก header `#main-tab_header-title-textEl` + ตัดคำนำหน้าไทย: นาย/นาง/นางสาว/ด.ช./ด.ญ./เด็กชาย/เด็กหญิง). เปลี่ยน surveyor_name ให้อ่านจาก DOM input ตรง (`tab1_surveyor_name-inputEl`). หน้า server แยก viewer (public, ไม่มีเมนูเข้า admin) ↔ admin (URL-only, มีลบ/Clear all); เพิ่ม Excel export (.xlsx) ผ่าน `GET /api/captures.xlsx`; column รวม = SUR+INS+TRANS+PHOTO (sur_invest หักเงินไว้ก่อนแล้ว); UI: + เขียว / − แดง, label ภาษาไทย (เรทราคา / รายละเอียด), centered cells, full-width panels |
| **2.0.0** | **Backend server**: ย้าย config + admin UI ออกจาก extension ไปยัง standalone Node.js server ที่โฟลเดอร์ [`../server/`](../server/) (Express + SQLite). หน้า /admin /viewer /captures เปิดจาก browser ตรงไปยัง server. Extension เปลี่ยน options_ui เป็นเพียง [options.html](./options.html) (Server URL field), เพิ่ม [background.js](./background.js) service worker สำหรับ HTTP I/O, แก้ [loader.js](./loader.js) ให้ขอ config จาก server (poll 30s) แทน chrome.storage, เพิ่ม capture trigger ใน [content.js](./content.js) (debounce 1.5s) → POST `/api/captures`. ลบ `admin.html` / `admin.js` / `admin.css` / `default-data.json` ออกจาก extension (default-data ย้ายไป [`../server/seed/default-data.json`](../server/seed/default-data.json)) |
| **1.7.0** | **Admin page**: เพิ่ม UI ให้ user จัดการข้อมูล (เพิ่ม/แก้/ลบ) ผ่าน `chrome://extensions` → Extension options. ย้าย data จาก `config.js` ไป `chrome.storage.local` (seed จาก default-data.json). เพิ่ม `admin.html` / `admin.js` / `admin.css` / `config-bridge.js`; `loader.js` รับหน้าที่ seed + read storage + ฟัง `chrome.storage.onChanged` → re-broadcast (live update โดยไม่ต้อง refresh page); `content.js` อ่าน maps สดทุก sync. `config.js` ถูกลบ. Import/Export JSON + Reset to defaults |
| **1.6.1** | เพิ่ม นครราชสีมา (30, 32 อำเภอ) + ขอนแก่น (40, 26 อำเภอ) ใน `AMPHUR_FEE_TABLE` รวมเป็น 245 อำเภอ 17 จังหวัด multi-field. `enabledProvinces` 20 จังหวัด |
| **1.6.0** | ขยาย `AMPHUR_FEE_TABLE` เพิ่ม 14 จังหวัด (179 อำเภอ) จาก Google Sheet ของผู้ใช้: พระนครศรีอยุธยา, สระบุรี, จันทบุรี, ฉะเชิงเทรา, อุบลราชธานี, เชียงใหม่, สุโขทัย, พิษณุโลก, พิจิตร, กาญจนบุรี, สุพรรณบุรี, นครศรีธรรมราช (rate INS แตกต่าง), ภูเก็ต, สงขลา; รวมเป็น 187 อำเภอ 15 จังหวัด multi-field. เพิ่ม `enabledProvinces` ทั้งหมดเป็น 18 จังหวัด (รวม 10/11/12 ที่เป็น simple mode) |
| **1.5.0** | เพิ่มแถวที่ 7 "หักเงิน" (`tab1_deduct_amount`) — inject ต่อท้ายแถวที่ 6 (ค่าเรียกร้อง) ในตารางค่าใช้จ่ายผ่าน `table.insert(idx+1, ...)` + position-check ทุก poll; ค่า > 0 = หักออกจาก SUR_INVEST (negative modifier); ทำงานทั้ง simple + multi-field mode; เพิ่ม [`feature-deduct-amount.js`](./feature-deduct-amount.js) |
| **1.4.2** | Fix: `SUR_INVEST` ใน `AMPHUR_FEE_TABLE` กลับเป็นค่าเดียวต่ออำเภอ (ตาม column "พนักงาน" ในชีต) — รอบ 1.4.1 แยก 1-2/3-4 ผิด |
| **1.4.1** | Schema: แยก `SUR_INVEST` ใน `AMPHUR_FEE_TABLE` เป็น `SUR_INVEST_12` / `SUR_INVEST_34`; เพิ่ม **auto-clear** `INS_PHOTO` เมื่อ MtypeID เปลี่ยนเป็น 3-4 *(SUR แยก revert ใน 1.4.2)* |
| **1.4.0** | Multi-field mode: เพิ่ม `AMPHUR_FEE_TABLE` รองรับการเติม `INS_INVEST` / `INS_TRANS` / `INS_PHOTO` แยกตาม MtypeID + SE/non-SE; เปิดใช้งานระยอง (provinceID 21, 8 อำเภอ); ผูก listener กับ `tab1_claim_MtypeID` + `tab1_surveyor_name` |
| **1.3.0** | เพิ่ม `feature-out-of-hours-amount.js` — numberfield "ยอดเงิน (บาท)" สำหรับ outOfHours (โผล่เมื่อเลือก radio "นอก") เหมือน outOfArea; ค่าใน field override default `+100` |
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
