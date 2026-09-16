# เตือนค่าใช้จ่ายรายเดือน (Google Sheet + GitHub Pages + เมล PDF ใส่รหัส)

ใช้คนเดียว: เว็บมี PIN `8142` / PDF รหัส `08011999` / เมลเตือน `frame8142@gmail.com` วันละ 2 รอบ (09:00 + 21:00 เวลาไทย)

## โครงโฟลเดอร์
```
monthly-expense/
  sheet/Code.gs                 <- วางใน Apps Script ของชีท
  web/                          <- ขึ้น GitHub Pages (ไฟล์เว็บ)
    index.html
    css/style.css
    js/config.js api.js lock.js dashboard.js bills.js app.js
  scripts/                      <- สร้าง PDF + ส่งเมล
    make_pdf.py  send_reminder.py  requirements.txt  .env.example
  .github/workflows/reminder.yml <- cron เตือน 9 โมง / 3 ทุ่ม
```

## 1) ทำ Google Sheet (5 นาที)
1. สร้าง Sheet ใหม่ (Private) > Extensions > Apps Script > ลบของเดิม > วางเนื้อหา `sheet/Code.gs` > Save
2. เลือกฟังก์ชัน `setup` > Run 1 ครั้ง (มันจะสร้าง tabs `Bills` + `Ledger` + ชื่อตัวอย่าง 9 รายการให้ แก้/ลบได้)
3. ตั้งรหัส API: Project Settings (⚙️) > Script Properties > Add `API_KEY` = รหัสลับของคุณเอง
4. Deploy > New deployment > Web app > Execute as: **Me** / Who has access: **Anyone with link** > Copy URL

## 2) รันเว็บในเครื่อง / ขึ้น GitHub
- ลองเลย: ดับเบิลคลิก `web/index.html` (โหมดทดลอง มีข้อมูล ก.ย./ต.ค. จากรูปให้แล้ว ใส่ PIN `8142`)
- ขึ้น GitHub Pages:
  1. สร้าง repo ใหม่ > อัปโฟลเดอร์ `web/` ทั้งก้อน (หรือทั้ง `monthly-expense/`)
  2. Settings > Pages > Deploy from branch > `main` + `/web` (หรือ `/root` ถ้าแยก repo) > เปิดลิงก์
  3. เปิดเว็บ > กด ⚙️ > กรอก Web App URL + API_KEY > บันทึก (เก็บในเครื่องคุณเท่านั้น)

วิธีใช้เว็บ:
- แท็บ **เดือนนี้**: ติ๊กว่าเดือนนี้จ่ายแล้ว (checkbox) + แก้ยอดจริงได้เลย, สีแดง=เลยกำหนด / เหลือง=เหลือ ≤3 วัน / เขียว=จ่ายแล้ว
- ปุ่ม **ตั้งบิลเดือนนี้จากรายชื่อ**: ดึงชื่อที่ใช้งานอยู่มาสร้างแถวของเดือนนั้น (default ครบกำหนดวันที่ 1)
- แท็บ **จัดการบิล**: เพิ่มชื่อล่วงหน้าได้ / ลบ = ซ่อน (ประวัติเก่าไม่หาย) / คืนชีพได้
- แท็บ **ประวัติ**: สรุปยอดรวมรายเดือนว่าเดือนไหนจ่ายกี่บาท

## 3) เปิดระบบเมลเตือน PDF ใส่รหัส
1. Gmail: เปิด 2-Step Verification > สร้าง **App password** (Google Account > Security > App passwords)
2. ใน GitHub repo > Settings > Secrets > Actions > เพิ่ม 6 ตัว:
   `APPS_SCRIPT_URL` / `API_KEY` / `GMAIL_USER` (= frame8142@gmail.com) /
   `GMAIL_APP_PASSWORD` / `PDF_PASSWORD` (= 08011999) / `NOTIFY_EMAIL` (= frame8142@gmail.com)
3. Actions จะรันเอง: `0 2 * * *` (9 โมงไทย) ส่งบิลครบกำหนดวันนี้ / `0 14 * * *` (3 ทุ่มไทย) ส่งซ้ำเฉพาะที่ยังไม่ติ๊กจ่าย
   - ทดสอบเอง: Actions > bill-reminder > Run workflow > เลือก morning/evening
4. ฟอนต์ไทยใน PDF (แนะนำ): วาง `THSarabunNew.ttf` ไว้ที่ `scripts/fonts/` ไม่งั้นภาษาไทยใน PDF อาจเพี้ยน

## หมายเหตุด้านความปลอดภัย
- อย่า commit `.env` / App password / PDF password ลง git (มี `.gitignore` กันไว้แล้ว)
- PIN เว็บเก็บแบบ hash ใน `js/lock.js` ไม่ได้เก็บเลขตรงๆ
- ในชีท/PDF เก็บแค่ชื่อบิล+ยอด อย่าใส่เลขบัตร/เลขบัญชี
