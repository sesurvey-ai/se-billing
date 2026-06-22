# extenBoard — scraper (Python)

ดึง "งานค้าง" จาก isurvey + emcs → รวมเป็นจำนวนต่อหัวหน้า → อัปขึ้น VPS
รันบนเครื่อง admin (ของคุณ) ผ่าน Task Scheduler ~06:00 ทุกวัน

> อัปขึ้น VPS เฉพาะ **ตัวเลขสรุป** ไม่มีข้อมูลลูกค้า (PII) · รหัสผ่านอยู่ใน config บนเครื่องเท่านั้น

## 1) ติดตั้ง (ครั้งเดียว)
```bat
cd scraper
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
copy config.example.json config.json
```
แก้ `config.json` ใส่ user/pass ของ isurvey, emcs และ `vps.upload_url` + `vps.token`

> `config.json` มีรหัสผ่าน — อย่า commit/แชร์ (ใส่ใน .gitignore ถ้าใช้ git)

## 2) Backfill ครั้งแรก (สร้าง index เลขเคลม→ผู้ปิดงาน ย้อน 2 ปี)
ครั้งแรกแนะนำใส่ `--show` เพื่อดูว่า login ผ่านจริง (เห็นเบราว์เซอร์):
```bat
python pull_data.py --backfill --show
```
ได้ไฟล์ `claim_index.sqlite` (ใช้ map เลขเคลม emcs → หัวหน้า) · รันนานหน่อย (ดึงทีละเดือน)

## 3) รันรายวัน (ทดสอบด้วยมือก่อน)
```bat
python pull_data.py --daily --show
```
จะ: ดึง isurvey 30 วัน + emcs (แก้ไข/ต่อเนื่อง) → รวมต่อหัวหน้า → POST ขึ้น VPS
ถ้า upload ล้มเหลว จะเซฟ `last_payload.json` ไว้ให้ดูโครงสร้างผลลัพธ์

## 4) ตั้ง Task Scheduler (รันอัตโนมัติ 06:00)
สร้าง `run_daily.bat`:
```bat
@echo off
cd /d "%~dp0"
call .venv\Scripts\activate
python pull_data.py --daily >> run.log 2>&1
```
Task Scheduler → Create Task → Trigger: Daily 06:00 → Action: เรียก `run_daily.bat`
แนะนำติ๊ก **"Run task as soon as possible after a scheduled start is missed"** กันเครื่องปิด

## ⚠️ ส่วนที่ต้อง verify ตอนรันครั้งแรก
- **ฟอร์ม login**: โค้ดใช้ selector แบบยืดหยุ่น (ช่อง password + ช่อง user + ปุ่ม Login/LOGIN)
  ถ้า login ไม่ผ่าน ให้รันด้วย `--show` ดูว่าติดตรงไหน แล้วบอกผมจะปรับ selector ให้ตรงเว็บ
- isurvey เคยมีอาการหน้าค้างตอนโหลดหนัก — สคริปต์ดึงผ่าน API ตรง (ไม่ render) จึงไม่เจอปัญหานี้

## โครงสร้างผลลัพธ์ที่อัปขึ้น VPS
```json
{
  "generated_at": "2026-06-20T06:00:05+07:00",
  "date": "2026-06-20",
  "supervisors": [
    { "name": "นาย ศุภชัย เศรษฐชัยชาญ",
      "isurvey_backlog": 38,
      "isurvey_by_status": { "รอตรวจข้อมูล": 20, "เสร็จงาน": 15, "แจ้งพนักงาน": 3 },
      "emcs_continuous": 12, "emcs_edit": 7,
      "isurvey_items": [ { "claim_no": "...", "surveyor": "SE445 ...", "status": "รอตรวจข้อมูล", "dispatch_dt": "2026-06-18 16:17", "aging_days": 2 } ] }
  ],
  "unmatched": { "isurvey_backlog": 0, "emcs": 3 },
  "totals": { "isurvey_backlog": 204, "emcs_continuous": 130, "emcs_edit": 60 }
}
```
> extension จะอ่านชื่อหัวหน้าจากหน้า isurvey (`#main-tab_header-title-textEl`) แล้วหยิบ object ของหัวหน้านั้นมาแสดง
