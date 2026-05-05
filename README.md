# se-billing — I Survey Auto-Fill Helper

ระบบช่วยกรอก "ค่าบริการ" อัตโนมัติบนระบบ I Survey
(`https://cloud.isurvey.mobi/main.php`) — แบ่งเป็น 2 ส่วน:

```
se-billing/
├── isurvey-helper/   ← Chrome Extension (Manifest V3)
│   └── README.md     ← วิธี install + วิธีทำงานของ extension
└── server/           ← Backend (Node.js + Express + SQLite)
    └── README.md     ← วิธี run server + REST API + LAN deploy
```

## ภาพรวม (v2.x)

- **Extension** ฉีดเข้า MAIN world ของ cloud.isurvey.mobi → เติมค่าบริการ
  ตามจังหวัด/อำเภอ/ตำบล/ประเภทเคลม/พนักงาน + จับข้อมูลที่ผู้ใช้กรอก
  ส่งไปเก็บใน server
- **Server** เก็บ rate config (เรทราคา) ใน SQLite + รับ capture log จาก
  extension + มีหน้าเว็บ:
  - `/`              → **เรทราคา** (read-only viewer)
  - `/admin`         → **เรทราคา** CRUD เพิ่ม/แก้/ลบ
  - `/captures`      → **รายละเอียด** ข้อมูลที่จับจากฟอร์ม (public)
  - `/admin/captures`→ **รายละเอียด** + ปุ่มลบรายตัว/Clear all (admin)
  - Export Excel (.xlsx) จากหน้า captures

## เริ่มใช้งานเร็วที่สุด

```bash
# 1. รัน server (default port 3200)
cd server
npm install
node server.js

# 2. ติดตั้ง extension
#    Chrome → chrome://extensions → Developer mode → Load unpacked
#    → เลือกโฟลเดอร์ isurvey-helper/

# 3. ตั้งค่า extension Options → Server URL = http://localhost:3200

# 4. เปิด/รีเฟรช https://cloud.isurvey.mobi/main.php — extension เริ่มทำงาน
```

## ย้ายไปอีกเครื่องใน LAN เดียวกัน

ดูคู่มือใน [`server/README.md`](server/README.md#ย้ายไปเครื่องอื่นใน-lan)

## Stack

- **Extension**: MV3 + service worker + content scripts (MAIN/ISOLATED worlds), ไม่มี
  build step
- **Server**: Node 22 (built-in `node:sqlite`), Express, ExcelJS — ไม่ต้อง compile native
  dependency

## License

Internal use.
