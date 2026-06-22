# การดึงข้อมูล Enquiry Report (วันที่จ่ายงาน) — cloud.isurvey.mobi

เอกสารนี้สรุปวิธีดึงข้อมูลรายงาน **Enquiry Report** โดยกรองตาม **วันที่จ่ายงาน** จากระบบ
I Survey System (SE Survey & Consultant) เพื่อใช้เป็นแหล่งข้อมูลของ extension `extenBoard`

> หมายเหตุ: ข้อมูลเป็นข้อมูลเคลม/ลูกค้าจริง (ชื่อ, ทะเบียนรถ, เลขกรมธรรม์) — เป็น PII ต้องดูแลความปลอดภัย ไม่เผยแพร่/ไม่ส่งออกนอกระบบโดยไม่จำเป็น

---

## 1. ข้อมูลระบบ

| รายการ | ค่า |
|---|---|
| เว็บ | `https://cloud.isurvey.mobi/main.php` |
| Framework | ExtJS 6.2.0 |
| การยืนยันตัวตน | **Session cookie** (ต้อง login อยู่) |
| รูปแบบข้อมูล | JSON ผ่าน AJAX |

---

## 2. Endpoint

ทุกรายงานใช้ endpoint เดียวกัน เปลี่ยนเฉพาะพารามิเตอร์ `report_type`

```
GET https://cloud.isurvey.mobi/web/php/report/get_data_report.php
```

### พารามิเตอร์ (query string)

| param | ค่าสำหรับงานนี้ | ความหมาย |
|---|---|---|
| `report_type` | `enquiry` | ชนิดรายงาน |
| `con_date` | `2` | **2 = วันที่จ่ายงาน** (1=รับแจ้ง, 3=ปิดงาน, 4=ตรวจสอบ) |
| `date_from` | `DD/MM/YYYY` | วันที่เริ่ม เช่น `18/06/2026` |
| `date_to` | `DD/MM/YYYY` | วันที่สิ้นสุด |
| `empcode` | `` (ว่าง) | กรองตามพนักงาน |
| `branch_id` | `` (ว่าง) | กรองตามสาขา |
| `appv_status` | `` (ว่าง) | กรองตามสถานะอนุมัติ |
| `closeby` | `` (ว่าง) | กรองตามผู้ปิดงาน |
| `inscompany` | `` (ว่าง) | กรองตามบริษัทประกัน |

### รูปแบบผลลัพธ์

```json
{
  "total": 312,
  "arr_data": [ { /* 1 แถว = 49 ฟิลด์ */ }, ... ]
}
```
- ข้อมูลอยู่ใน key **`arr_data`** (root property)
- จำนวนรวมอยู่ใน key **`total`**

---

## 3. ฟิลด์ในแต่ละแถว (49 ฟิลด์)

**อ้างอิง / เลขที่**
`claim_no` (เลขเคลม) · `notify_no` (เลขรับแจ้ง) · `preNotifyNo` · `survey_no` (เลขเซอร์เวย์) · `policy_no` (เลขกรมธรรม์) · `policy_Type` (ประเภทกรมธรรม์) · `plate_no` (ทะเบียนรถ)

**พนักงาน / การมอบหมาย**
`empcode` (รหัส+ชื่อพนักงานสำรวจ) · `emp_phone` · `assign_reason` (เหตุผลมอบหมาย) · `dispatch_name` (ผู้จ่ายงาน) · `notified_name` (ผู้รับแจ้ง) · `checkByName` (ผู้ตรวจ) · `branch` (สาขา) · `useOSS` · `COArea` · `service_type` · `extraReq` · `wrkTime` (ใน/นอกเวลา)

**เวลา / SLA** (รูปแบบ `YYYY-MM-DD HH:mm`)
`notified_dt` (รับแจ้ง) · `dispatch_dt` (**จ่ายงาน — ฟิลด์ที่ con_date=2 ใช้กรอง**) · `confirm_dt` (ยืนยันรับงาน) · `arrive_dt` (ถึงที่เกิดเหตุ) · `cmp_arrive` · `finish_dt` (เสร็จงาน) · `sendReport_dt` (ส่งรายงาน) · `checker_dt` (ตรวจ) · `travel_time` (เวลาเดินทาง)

**สถานที่**
`acc_place` (สถานที่เกิดเหตุ) · `acc_zone` (โซน) · `acc_province` / `acc_amphur` (จังหวัด/อำเภอที่เกิดเหตุ) · `survey_province` / `survey_amphur` (จังหวัด/อำเภอที่สำรวจ) · `police_station` (สน.)

**รายละเอียดเหตุ / สถานะ**
`acc_detail` (ลักษณะเหตุ) · `acc_verdict_desc` (ผลวินิจฉัย/ฝ่ายผิด) · `claim_Type` (ประเภทเคลม) · `tp_insure` (ประกันคู่กรณี) · `stt_desc` (**สถานะงาน** — ข้อความ) · `EMCSstatus` / `EMCSby` / `EMCSdate`

**ตัวเลข / อื่น ๆ**
`veh` (จำนวนรถ) · `inj` (ผู้บาดเจ็บ) · `ast` (ทรัพย์สิน) · `ctotal` · `recover_dmg_pymt` · `remark` (หมายเหตุ)

> ความหมายบางฟิลด์เป็นการอนุมาน — ยืนยันกับข้อมูลจริงอีกครั้งก่อนใช้คำนวณ

---

## 4. วิธีดึงข้อมูล

### 4.1 ทดสอบเร็ว ๆ (วาง JS ใน DevTools Console ขณะ login อยู่)

```js
const qs = new URLSearchParams({
  report_type: 'enquiry',
  con_date:    '2',            // วันที่จ่ายงาน
  date_from:   '18/06/2026',
  date_to:     '18/06/2026',
  empcode: '', branch_id: '', appv_status: '', closeby: '', inscompany: ''
});
const res = await fetch(
  'https://cloud.isurvey.mobi/web/php/report/get_data_report.php?' + qs,
  { credentials: 'include' }          // แนบ cookie อัตโนมัติ
);
const { total, arr_data } = await res.json();
console.log(total, arr_data.length, arr_data[0]);
```

### 4.2 ในตัว extension (Manifest V3)

**manifest.json** — ขอสิทธิ์เฉพาะโดเมนนี้ (แคบ ผ่านรีวิวง่าย):
```json
{
  "manifest_version": 3,
  "name": "extenBoard",
  "version": "0.1.0",
  "host_permissions": ["https://cloud.isurvey.mobi/*"],
  "background": { "service_worker": "background.js" },
  "action": { "default_title": "extenBoard" }
}
```

**ฟังก์ชันดึงข้อมูล** (ใช้ได้ทั้งใน background / popup / side panel):
```js
async function fetchEnquiry(dateFrom, dateTo, filters = {}) {
  const qs = new URLSearchParams({
    report_type: 'enquiry',
    con_date:    '2',                 // วันที่จ่ายงาน
    date_from:   dateFrom,            // 'DD/MM/YYYY'
    date_to:     dateTo,
    empcode:     filters.empcode     || '',
    branch_id:   filters.branch_id   || '',
    appv_status: filters.appv_status || '',
    closeby:     filters.closeby     || '',
    inscompany:  filters.inscompany  || ''
  });
  const url = 'https://cloud.isurvey.mobi/web/php/report/get_data_report.php?' + qs;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const json = await res.json();
  return json.arr_data || [];         // -> array (json.total = จำนวนรวม)
}
```

---

## 5. ข้อควรระวัง (เจอจากการทดสอบจริง)

1. **ฟอร์แมตวันที่จาก API = `YYYY-MM-DD HH:mm`** (เช่น `2026-06-19 02:50`) ต่างจากที่ตารางบนหน้าจอแสดง (`19/06/26`) — ต้อง parse ฟอร์แมตดิบนี้
2. **`empcode` รวมรหัส+ชื่อ** (เช่น `SE151ศราวุธ เสนีย์ชัย`) ไม่ใช่รหัสล้วน — ถ้าจะ group ตามรหัสต้องแยก prefix
3. **อย่าดึงผ่านการเปิดตาราง ExtJS แล้วอ่าน DOM** — ข้อมูลเยอะทำให้หน้าค้าง (renderer freeze) ให้ `fetch` endpoint ตรง ๆ เอา JSON ดีกว่า (เร็ว ~1.2 วิ, ~2 MB ต่อวัน, ไม่ค้าง)
4. ต้อง **login ค้างไว้** ใน Chrome profile เดียวกัน — extension อาศัย session cookie
5. ระวัง **rate limit** อย่าดึงถี่เกิน

---

## 6. หมายเหตุการเทียบกับ Claim Report

เงื่อนไขเดียวกัน (วันจ่ายงาน, 18/06/2026): **Enquiry กับ Claim ดึงงานชุดเดียวกัน** (312 แถว เคลมเดียวกัน สถานะเหมือนกัน) ต่างแค่คอลัมน์
- **Enquiry** = มุมปฏิบัติการ (เวลา/SLA/พนักงาน/จ่ายงาน) ← ใช้ตัวนี้
- **Claim** (`report_type=claim`) = มุมการเงิน/คู่กรณี (`D_TOTAL_COST`, `tp_*`, วันปิด/อนุมัติ)
- ถ้าต้องการข้อมูลทั้งสองมุม สามารถ join ด้วย `claim_no` ได้ (ตรงกัน 100%)
