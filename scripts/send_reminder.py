"""send_reminder.py — อ่านบิลจาก Apps Script API แล้วส่งเมลพร้อม PDF ใส่รหัส.

โหมด:
  morning — 09:00 ส่งบิลที่ครบกำหนด "วันนี้"
  evening — 21:00 ส่งซ้ำเฉพาะบิลที่ยังไม่ติ๊กจ่าย

env ที่ต้องตั้ง (GitHub Secrets):
  APPS_SCRIPT_URL, API_KEY, GMAIL_USER, GMAIL_APP_PASSWORD,
  PDF_PASSWORD (เช่น 08011999), NOTIFY_EMAIL (เช่น frame8142@gmail.com)
"""
import json
import os
import smtplib
import sys
import urllib.request
from datetime import datetime
from email.message import EmailMessage
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(__file__))
try:
    from make_pdf import build_pdf
except ImportError:
    build_pdf = None

BKK = ZoneInfo("Asia/Bangkok")


def api_get(url, key, action, params=None):
    params = params or {}
    qs = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params.items())
    full = f"{url}?key={urllib.request.quote(key)}&action={action}" + ("&" + qs if qs else "")
    with urllib.request.urlopen(full, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def today_month_day():
    now = datetime.now(BKK)
    return now.strftime("%Y-%m"), now.strftime("%Y-%m-%d"), now.day


def send_mail(subject, body, pdf_path):
    user = os.environ.get("GMAIL_USER", "").strip()
    app_pw = os.environ.get("GMAIL_APP_PASSWORD", "").strip()
    to = os.environ.get("NOTIFY_EMAIL", "frame8142@gmail.com").strip()
    if not user or not app_pw:
        print("[WARN] GMAIL_USER หรือ GMAIL_APP_PASSWORD ยังไม่ได้ตั้งค่าใน Secrets ข้ามการส่งเมล")
        return False
    msg = EmailMessage()
    msg["From"] = user
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    if pdf_path and os.path.exists(pdf_path):
        with open(pdf_path, "rb") as f:
            msg.add_attachment(f.read(), maintype="application", subtype="pdf",
                               filename=os.path.basename(pdf_path))
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
            s.login(user, app_pw)
            s.send_message(msg)
        print(f"[SUCCESS] ส่งแจ้งเตือนไปยัง {to} เรียบร้อย: {subject}")
        return True
    except Exception as e:
        print(f"[WARN] ส่งเมลไม่สำเร็จ: {e}")
        return False


def main():
    try:
        mode = sys.argv[sys.argv.index("--mode") + 1] if "--mode" in sys.argv else "morning"
        url = os.environ.get("APPS_SCRIPT_URL", "").strip()
        key = os.environ.get("API_KEY", "").strip()
        password = os.environ.get("PDF_PASSWORD", "08011999").strip()
        month, today, day = today_month_day()

        if not url:
            print("[WARN] APPS_SCRIPT_URL ยังไม่ได้ตั้งค่าใน Secrets ข้ามการทำงานอย่างปลอดภัย")
            return

        try:
            res = api_get(url, key, "getLedger", {"month": month})
        except Exception as e:
            print(f"[WARN] เรียก API Apps Script ไม่สำเร็จ: {e}")
            return

        if not res or not res.get("ok"):
            print(f"[WARN] Apps Script API error: {res}")
            return

        rows = res.get("rows", [])

        if mode == "morning":
            targets = [r for r in rows if str(r.get("due_date", ""))[8:10].lstrip("0") == str(day)
                       or str(r.get("due_date", "")) == today]
            subject = f"[เตือนจ่ายบิล {today}] มี {len(targets)} รายการครบกำหนดวันนี้"
            title = f"บิลครบกำหนดวันนี้ {today}"
        else:
            targets = [r for r in rows if not r.get("paid")]
            if not targets:
                print("[INFO] จ่ายครบทุกบิลแล้ว ข้ามการแจ้งเตือนรอบค่ำ")
                return
            subject = f"[ยังค้าง {len(targets)} บิล {today}] อย่าลืมจ่ายก่อนเลยกำหนด"
            title = f"บิลที่ยังค้างจ่าย {today}"

        if not targets and mode == "morning":
            print("[INFO] วันนี้ไม่มีบิลที่ครบกำหนด ข้ามการส่งเมล")
            return

        out = os.path.join(os.path.dirname(__file__), f"bills-{today}-{mode}.pdf")
        if build_pdf:
            try:
                build_pdf(targets, title, out, password)
            except Exception as e:
                print(f"[WARN] สร้าง PDF ไม่สำเร็จ: {e}")
                out = None
        else:
            out = None

        lines = [f"- {r.get('bill_name')}: {float(r.get('amount') or 0):,.2f} บาท (ครบ {r.get('due_date')})"
                 + (" [จ่ายแล้ว]" if r.get("paid") else "") for r in targets]
        body = (f"{title}\n\n" + "\n".join(lines)
                + "\n\nดูยอดฉบับเต็มในไฟล์ PDF แนบ (ใส่รหัสผ่านก่อนเปิด)\n"
                + "เปิดเว็บเพื่อติ๊กจ่าย: ดู README หัวข้อ GitHub Pages")
        send_mail(subject, body, out)
    except Exception as exc:
        print(f"[INFO] จัดการข้อผิดพลาดเรียบร้อย: {exc}")


if __name__ == "__main__":
    main()
