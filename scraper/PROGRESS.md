# extenBoard — บันทึกความคืบหน้า (อัปเดต 2026-06-22)

## 🎯 เป้าหมาย
Chrome **extension popup** แสดง **dashboard "งานค้าง"** แยกตาม **หัวหน้า (supervisor)** เพื่อให้เจ้าของงานเห็นงานที่ค้างในระบบ — รวมข้อมูลจาก 2 ระบบ (isurvey + emcs)

## 🎉 ทดสอบครบวงจร LOCAL ผ่านแล้ว (2026-06-21)
scraper → `last_payload.json` → FastAPI (localhost:8000) → extension popup แสดงข้อมูลจริงครบ (ศุภชัย 41 ฯลฯ). เหลือแค่ย้ายขึ้น VPS จริง + ตั้ง schedule.

## 🔗 รวมเข้าโปรเจกต์ se-billing แล้ว (2026-06-22) — ทิศทางปัจจุบัน
แทนที่จะตั้ง VPS ใหม่ ย้ายไปใช้โครงสร้างของ **se-billing** (`C:\Users\i9\Desktop\se-billing`) ที่มี VPS + auth + Docker พร้อมอยู่แล้ว:
- **Server (Node/Express บน `https://billing.sesurvey.cloud`)** — เพิ่ม `POST/GET /api/dashboard` (เก็บ snapshot ใน setting `dashboard_latest`), ใช้ Bearer `API_TOKEN` เดิม
- **Extension "SE-Billing" (v2.8.0)** — เพิ่ม `dashboard-badge.js` (badge + แผงเลขเคลม คลิกหัวคอลัมน์เรียงได้) + แท็บ **"งานค้าง"** ใน popup (เป็นแท็บเริ่มต้น) ; background เพิ่ม handler `dashboard-data`
- **Scraper (อยู่ที่เดิมใน extenBoard)** — `config.json` → `vps.upload_url = https://billing.sesurvey.cloud/api/dashboard` (token ใส่ค่าจริงตอน deploy) ; Task Scheduler 06:00 เหมือนเดิม
- **`server/` (FastAPI) ของ extenBoard — เลิกใช้** (เก็บไว้เป็น backup)
- ✅ ทดสอบ local ผ่าน (Node server `localhost:3200` + extension: badge / popup แท็บงานค้าง / เรียงคอลัมน์)
- ⏳ เหลือ: redeploy server บน Dokploy + ใส่ token จริงใน scraper + เปลี่ยน Options ของ extension เป็น production URL

> รายละเอียดฝั่ง se-billing: `../se-billing/README.md`, `../se-billing/server/README.md`

---

## 📦 วิธีนำไปใช้งาน (Setup & Run)

### ต้องมีก่อน
**Python 3.10+** และ **Google Chrome** บนเครื่องที่จะรัน scraper/server

### A. ติดตั้ง (ครั้งแรก / เครื่องใหม่หลังก๊อปจาก USB)
```bat
:: scraper
cd scraper
python -m pip install -r requirements.txt
python -m playwright install chromium
:: server
cd ..\server
python -m pip install -r requirements.txt
```
**ไฟล์ที่ต้องเอาไปด้วยตอนย้ายเครื่อง (อย่าลบ):**
- `scraper/config.json` — รหัสผ่าน isurvey/emcs (ถ้าไม่มีต้องสร้างจาก `config.example.json`)
- `scraper/claim_index.sqlite` — index 2 ปี (มีแล้วจะ **ไม่ต้อง backfill ใหม่**)
- `mapping_supervisor_staff_.json` — แมปหัวหน้า→ลูกทีม (โค้ดต้องใช้)
> `scraper/.venv` ใช้ข้ามเครื่องไม่ได้ (ผูก path เดิม) — ข้าม/สร้างใหม่

### B. รัน scraper (ฝั่ง admin)
```bat
cd scraper
python pull_data.py --backfill     :: ครั้งเดียว: สร้าง index 2 ปี (ข้ามได้ถ้ามี claim_index.sqlite แล้ว)
python pull_data.py --daily        :: รายวัน: ดึง isurvey+emcs → รวมต่อหัวหน้า → upload ขึ้น VPS
```
ตัวเลือก debug: `--show` (เห็นเบราว์เซอร์), `--emcs-only` (ข้าม isurvey ดึงแค่ emcs)
> ⚠️ ปิดแท็บ isurvey/emcs อื่นในเบราว์เซอร์ก่อนรัน (ทั้งคู่จำกัด **1 session/บัญชี**)

### C. ตั้งเวลาอัตโนมัติ (Task Scheduler ~06:00)
สร้าง `scraper/run_daily.bat`:
```bat
@echo off
cd /d "%~dp0"
python pull_data.py --daily >> run.log 2>&1
```
Task Scheduler → Create Task → Trigger: Daily 06:00 → Action: เรียก `run_daily.bat`
ติ๊ก **"Run task as soon as possible after a scheduled start is missed"**

### D. รัน server (VPS)
- **ทดสอบ local:** `cd server && EXTENBOARD_UPLOAD_TOKEN=up EXTENBOARD_READ_TOKEN=rd python -m uvicorn main:app --host 127.0.0.1 --port 8000`
- **Production:** ก๊อป `server/` ขึ้น VPS → ตั้ง token จริง → รันหลัง **nginx + HTTPS + systemd** (ดู `server/README`)

### E. ติดตั้ง extension (ฝั่งผู้ใช้)
1. แก้ `extension/config.js` → `VPS_URL` + `READ_TOKEN` (ให้ตรงกับ `EXTENBOARD_READ_TOKEN` ของ server)
2. แก้ `extension/manifest.json` → `host_permissions` ใส่ host ของ VPS
3. Chrome → `chrome://extensions` → เปิด Developer mode → **Load unpacked** → เลือกโฟลเดอร์ `extension/`
4. กดไอคอน extension → popup

### การใช้งาน popup
- **admin** (header isurvey = "นพดล สมบูรณ์กุล") → dropdown เลือกดูได้ทุกหัวหน้า
- **หัวหน้าทั่วไป** → ล็อกแสดงเฉพาะตัวเอง (ซ่อนยอดรวมบริษัท)
- **กดการ์ด** (งานค้าง isurvey / การ์ดสถานะ / emcs ต่อเนื่อง / แก้ไข) → ตารางด้านล่างกรองตาม
- ปุ่ม ↻ = ดึงข้อมูลล่าสุดจาก VPS

### Troubleshooting
| อาการ | แก้ |
|---|---|
| login ไม่ผ่าน / ค้างฟอร์ม | รัน `--show` ดูว่าติดตรงไหน + เช็ค user/pass ใน config |
| emcs ได้ 0 rows | ปิด session emcs อื่น + ต้องเป็นบัญชีฝั่ง SE (เห็น รายงานแก้ไข/งานต่อเนื่อง) |
| `ECONNRESET` | มี retry แล้ว — รันใหม่ได้ (ถ้าบ่อย ลด `isurvey_chunk_days` ใน config) |
| popup error/ว่าง | server รันอยู่ไหม + `READ_TOKEN` ใน config.js ตรงกับ server ไหม |
| popup ขึ้น "โหมดตัวอย่าง" | ยังไม่ได้ตั้ง `VPS_URL` ใน config.js |

## 📌 สถานะ
- ✅ ออกแบบสถาปัตยกรรม + ตรวจสอบ (verify) logic ครบทุกจุดบนข้อมูลจริง
- ✅ setup ตัดสินใจแล้ว: **VPS = Python FastAPI · Backfill = 2 ปี · Login = Playwright + creds จาก config**
- ✅ **เขียน Python scraper เสร็จ** (`scraper/`) — **logic ผ่านเทสต์ 27/27** (`test_logic.py`)
- ✅ **ทดสอบ pipeline จริงผ่าน browser session (MCP)** สำเร็จ: ดึง enquiry จริง 14 วัน (4,482 แถว) → งานค้าง 1,012 → นับต่อหัวหน้าได้ (ยอดสถานะลงตัว). fetch+aggregate ถูกต้องบนข้อมูลจริง
- ⚠️ พบ: 85 งานค้างมีรหัสผู้สำรวจ **ไม่อยู่ใน mapping** (mapping อาจไม่ครบ) + 68 เอาท์ซอร์ส (จับด้วยชื่อ)
- ✅ **เขียน VPS API (FastAPI)** เสร็จ (`server/`) — `/upload` + `/data` (Bearer token) เก็บ JSON, syntax ผ่าน
- ✅ **เขียน Extension popup (MV3)** เสร็จ (`extension/`) — content script อ่านชื่อหัวหน้า + popup ดึง VPS มาแสดง (มีโหมด DEMO), manifest valid
- ✅ **Scraper รันครบวงจรจริงสำเร็จ** (2026-06-21): login isurvey+emcs ผ่าน, ดึง+navigate+aggregate ครบ → `last_payload.json` (isurvey_backlog 916, emcs_edit 63, emcs_continuous 65; unmatched isurvey 116 / emcs 30). แก้ระหว่างทาง: retry ECONNRESET, context.request, emcs ต้อง re-open frmMainPage พก P params, `--emcs-only` debug flag
- ✅ **Extension popup interactive**: admin/locked mode, การ์ดสถานะ (จำนวนบน/ชื่อล่าง), **กดการ์ดเพื่อกรองตาราง** (isurvey / สถานะ / emcs) — scraper เก็บ item lists ครบ (`isurvey_items`, `emcs_*_items`)
- ✅ **On-page badge คลิกได้** (content.js): กด pill (งานค้าง isurvey / แก้ไข / ต่อเนื่อง emcs) บนแถบหัว isurvey → เปิด **แผงลอยตารางเลขเคลม** (เลขเคลม/สถานะหรือวันที่/อายุ) บนหน้าเว็บเลย ไม่ต้องเปิด popup · ปิดด้วย × / คลิกนอกแผง / กด pill เดิมซ้ำ · admin (นพดล) = รวมทุกหัวหน้า
- ✅ **ทดสอบครบวงจร LOCAL ผ่าน** (scraper → FastAPI → popup เห็นข้อมูลจริง)
- ⏳ เหลือ (งาน ops): deploy server ขึ้น VPS จริง + ตั้ง Task Scheduler + เติม mapping พนักงานใหม่ (ดู `mapping_unmatched_TODO.md`) — รายละเอียดใน **"วิธีนำไปใช้งาน"** ด้านบน

---

## 🏗️ สถาปัตยกรรม
```
[เครื่อง Admin] Python script + Task Scheduler 06:00
   ├─ Backfill ครั้งเดียว: isurvey ย้อนไกล → index {เลขเคลม → ผู้ปิดงาน(หัวหน้า), ผู้สำรวจ, สถานะ}
   └─ รายวัน: isurvey (ย้อน 1 เดือน) + emcs (counts/เลขเคลม ≤2 ปี)
              → aggregate ต่อหัวหน้า → upload → [VPS]
[VPS] เก็บ + serve:  POST /upload (token) , GET /data
[Extension popup] อ่านชื่อหัวหน้าจากหน้า isurvey → ดึงตัวเลขของหัวหน้านั้นจาก VPS → แสดง dashboard
```
> หมายเหตุ: เป็น snapshot รายวัน (ณ 06:00) ไม่ใช่ realtime — ตามแผนผู้ใช้

---

## 🔌 แหล่งข้อมูล 2 ระบบ

### 1) isurvey — `cloud.isurvey.mobi` (ระบบของบริษัท SE; "isurvey" เป็นแค่ผู้พัฒนา)
- ExtJS, auth = session cookie, ดึงง่ายเป็น JSON. **รายละเอียดเต็ม: `enquiry-report-fetch.md`**
- Endpoint: `GET https://cloud.isurvey.mobi/web/php/report/get_data_report.php`
  params: `report_type=enquiry` · `con_date=2` (วันจ่ายงาน) · `date_from`/`date_to` (DD/MM/YYYY) · ตัวกรองอื่นเว้นว่าง
  → `{ total, arr_data:[...] }` ; fetch แบบ same-origin `credentials:'include'`

### 2) emcs — `eclaim3.blueventuregroup.co.th` (ระบบเคลมฝั่งประกัน BlueVenture / Co-EMCS)
- ASP.NET WebForms. **รายละเอียด: memory `esurvey-claim-extraction`**
- จำนวน INBOX (รายงานแก้ไข / งานต่อเนื่อง) อยู่บนหน้าแรก `frmMainPage` (อ่านง่าย)
- เลขเคลมทั้งลิสต์: วน `POST ajaxSurvey.aspx/changePage {intPage, searchType:"command_inbox"}` ทุกหน้า (ต้องกดหมวดก่อนเพื่อ set session) → parse HTML, เลขเคลม = เซลล์ index 4
- รายละเอียด 1 งาน: `openJob` คืน **URL ของหน้า `frmSurvey.aspx`** (ไม่ใช่ตัวข้อมูล) → ต้องเปิดหน้าเต็ม + อาจล็อกงาน → **อย่าใช้ bulk**

### ความสัมพันธ์ (สำคัญ)
- **isurvey = ขั้น 1** (งานสำรวจจริง, ผู้ใช้ปิด/จบงานที่นี่) ; **emcs = ขั้น 2** (พนักงานคีย์ข้อมูลเอาจาก isurvey มากรอก emcs ตามหลัง)
- **ทุกเคลมใน emcs มาจาก isurvey 100%** → เลขเคลม emcs หาใน isurvey เจอแน่ → ใช้ดึงรายละเอียด/ผู้ปิดงานได้

---

## 🧮 Logic dashboard (สรุปฉบับสุดท้าย)

Dashboard แยกราย **หัวหน้า** : extension อ่านชื่อจาก DOM `#main-tab_header-title-textEl` → normalize → จับคู่ key ใน `mapping_supervisor_staff_.json`

**ส่วนที่ 1 — งานค้าง isurvey**
- งานค้าง = สถานะ (`stt_desc`) **≠ "จบงาน" และ ≠ "ยกเลิกเคลม"**
- งานค้างไม่มีผู้ปิดงาน → ระบุเจ้าของด้วย **ผู้สำรวจ `empcode`** → จับ mapping ด้วย **รหัส SE/SEC** → หัวหน้า
- เอาท์ซอร์ส (หจก/บริษัท ไม่มีรหัส) ที่อยู่ใต้หลายหัวหน้า → นับงานค้างให้ทุกหัวหน้า ; พอปิดงาน → หายจากทุกคน + ไปเพิ่ม "จบงาน" ที่ผู้ปิดงาน

**ส่วนที่ 2 — งานค้าง emcs**
- อ่าน "งานต่อเนื่อง" + "งานแก้ไข" → เลขเคลม (กรอง ≤ 2 ปี)
- เลขเคลม → lookup ใน index isurvey → **ผู้ปิดงาน `checkByName` = ชื่อหัวหน้าโดยตรง** → หัวหน้านั้น

**Aging:** ระยะห่างวัน `dispatch_dt` → `checker_dt` (งานค้าง: จ่ายงาน→วันนี้ ; จบงาน: จ่ายงาน→ปิดงาน)

---

## ✅ ผล VERIFY (2026-06-20, login เป็นหัวหน้า "ศุภชัย", ข้อมูลจริง 18/06/2026 = 312 แถว)

**Map คอลัมน์ → field (Enquiry report):**
| ความหมาย | คอลัมน์ | field |
|---|---|---|
| ผู้ออกตรวจสอบ | พนักงานตรวจสอบ | `empcode` (รหัส+ชื่อ เช่น "SE445 นายวีระพงษ์ แก้วเขียว") |
| ผู้ปิดงาน | ผู้ตรวจสอบงาน | `checkByName` (= **ชื่อหัวหน้า**) |
| วันจ่ายงาน | วันที่/เวลาจ่ายงาน | `dispatch_dt` |
| วันปิดงาน | วันที่/เวลาตรวจสอบ | `checker_dt` |
| สถานะ | สถานะงาน | `stt_desc` |
(วันที่รูปแบบ `YYYY-MM-DD HH:mm`)

- ✅ **เฉพาะ "จบงาน" เท่านั้นที่มี `checkByName`+`checker_dt`** (98/98) — สถานะอื่นว่างหมด
- ✅ งานค้างวันนั้น = 204 (รอตรวจ 153 + เสร็จงาน 44 + แจ้งพนักงาน 4 + ถึงที่ตรวจสอบ 3) ; จบงาน 97, ยกเลิก 11
- ✅ **`checkByName` = ชื่อหัวหน้าโดยตรง** (ภูริ ภัทรภิรัก, นันทภัค กุมมาน้อย, ศุภชัย, วรภพ, จตุรนต์, ภูรี) = key ใน mapping → emcs ไม่ต้องไล่ผ่าน staff
- ✅ **report ไม่กรองตาม login** — ศุภชัย เห็นครบ 312 แถว/121 ผู้สำรวจ → ต้องกรองที่ extension ด้วย mapping
- ✅ `#main-tab_header-title-textEl` = `"Hi, นาย ศุภชัย เศรษฐชัยชาญ"`

**กฎการ match:**
- ผู้สำรวจ `empcode` → mapping ด้วย **รหัสนำหน้า** `^SEC?\d+` (สะอาด)
- ชื่อหัวหน้า (จาก header & `checkByName`) → mapping key ด้วย **ชื่อ normalize**: ตัด "Hi, ", ตัดคำนำหน้า (นาย/นางสาว/น.ส.), ลบช่องว่าง แล้วค่อยเทียบ (เพราะสะกดเว้นวรรค/คำนำหน้าไม่ตรงกัน)

---

## 📁 ไฟล์ในโปรเจกต์
- `PROGRESS.md` — ไฟล์นี้ (สรุปความคืบหน้า)
- `enquiry-report-fetch.md` — คู่มือดึง isurvey enquiry + โค้ดตัวอย่าง
- `mapping_supervisor_staff_.json` — แมป หัวหน้า → ลูกทีม (7 หัวหน้า)
- `claims_report-edit.csv` / `.txt` — เลขเคลม "งานแก้ไข" emcs (122) [+ วันที่ใน .csv]
- `claims_continuous.csv` / `.txt` — เลขเคลม "งานต่อเนื่อง" emcs (309) [+ วันที่ใน .csv]
- `scraper/` — **Python scraper**: `pull_data.py` (`--backfill`/`--daily`/`--show`), `config.json` (creds, local), `test_logic.py`, `README.md`
- `server/` — **VPS API (FastAPI)**: `main.py` (`/upload`,`/data`), `requirements.txt`, `README.md`
- `extension/` — **Chrome extension (MV3)**: `manifest.json`, `config.js` (ใส่ VPS_URL+READ_TOKEN), `content.js`, `popup.{html,css,js}`, `README.md`
- `mapping_unmatched_TODO.md` — รายชื่อพนักงานใหม่/บริษัท ที่ยังไม่อยู่ใน mapping (116 งาน: 10 รหัส + 4 บริษัท + 6 ว่าง) รอผู้ใช้ระบุหัวหน้าแล้วเติม mapping

---

## ⏭️ ขั้นต่อไป (โค้ดครบ 3 ส่วนแล้ว — เหลือ deploy + verify)
1. ✅ **Python scraper** — เขียน+เทสต์ logic แล้ว · **TODO:** ปิด session isurvey อื่น → `python pull_data.py --backfill --show` (verify login) → `--daily`
2. ✅ **VPS API (FastAPI)** — เขียนแล้ว · **TODO:** deploy บน VPS, ตั้ง `EXTENBOARD_UPLOAD_TOKEN`/`READ_TOKEN`, หลัง nginx+HTTPS (ดู server/README)
3. ✅ **Extension popup** — เขียนแล้ว · **TODO:** ใส่ `VPS_URL`+`READ_TOKEN` ใน `extension/config.js` + host จริงใน manifest → Load unpacked
4. ⏳ เติม mapping ผู้สำรวจที่ขาด (85 รหัส) — ขอ list ได้

### Build note
- ใน Chrome MCP `javascript_tool`: อย่าใช้ `(async()=>{})()` (Promise จะกลายเป็น `{}`) — ใช้ **top-level await**

## 🚀 Production checklist (ย้ายจาก local ขึ้นจริง)
1. **Deploy server** ขึ้น VPS: ก๊อป `server/` → `pip install -r requirements.txt` → ตั้ง env `EXTENBOARD_UPLOAD_TOKEN` + `EXTENBOARD_READ_TOKEN` (สุ่มยาว) → รันหลัง **nginx + HTTPS + systemd** (ดู `server/README`)
2. **Scraper → VPS**: `scraper/config.json` → `vps.upload_url = https://<vps>/upload`, `vps.token = <UPLOAD_TOKEN>`
3. **Extension → VPS**: `extension/config.js` → `VPS_URL = https://<vps>`, `READ_TOKEN = <READ_TOKEN>`; `manifest.json` host_permissions → `https://<vps>/*` → reload extension
4. **ตั้ง Task Scheduler** รัน `pull_data.py --daily` ทุกวัน ~06:00 (ดู `scraper/README`)
5. **เติม mapping** ตาม `mapping_unmatched_TODO.md` (พนักงานใหม่ 10 + บริษัท 4)

### Local test (ทำซ้ำได้)
- server: `cd server && EXTENBOARD_UPLOAD_TOKEN=up EXTENBOARD_READ_TOKEN=rd python -m uvicorn main:app --host 127.0.0.1 --port 8000`
- upload: `curl -X POST http://127.0.0.1:8000/upload -H "Authorization: Bearer up" -H "Content-Type: application/json" --data-binary @scraper/last_payload.json`
- extension config.js ชี้ `http://localhost:8000` token `rd` (ตอนนี้ตั้งไว้แล้ว)
