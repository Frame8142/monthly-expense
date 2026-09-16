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
from make_pdf import build_pdf

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
    user = os.environ["GMAIL_USER"]
    app_pw = os.environ["GMAIL_APP_PASSWORD"]
    to = os.environ.get("NOTIFY_EMAIL", "frame8142@gmail.com")
    msg = EmailMessage()
    msg["From"] = user
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    with open(pdf_path, "rb") as f:
        msg.add_attachment(f.read(), maintype="application", subtype="pdf",
                           filename=os.path.basename(pdf_path))
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
        s.login(user, app_pw)
        s.send_message(msg)
    print(f"sent to {to}: {subject}")


def main():
    mode = sys.argv[sys.argv.index("--mode") + 1] if "--mode" in sys.argv else "morning"
    url = os.environ["APPS_SCRIPT_URL"]
    key = os.environ.get("API_KEY", "")
    password = os.environ["PDF_PASSWORD"]
    month, today, day = today_month_day()

    res = api_get(url, key, "getLedger", {"month": month})
    if not res.get("ok"):
        raise SystemExit(f"API error: {res}")
    rows = res.get("rows", [])

    if mode == "morning":
        # บิลที่ครบกำหนดวันนี้ (เทียบวันของ due_date)
        targets = [r for r in rows if str(r.get("due_date", ""))[8:10].lstrip("0") == str(day)
                   or str(r.get("due_date", "")) == today]
        subject = f"[เตือนจ่ายบิล {today}] มี {len(targets)} รายการครบกำหนดวันนี้"
        title = f"บิลครบกำหนดวันนี้ {today}"
    else:
        targets = [r for r in rows if not r.get("paid")]
        if not targets:
            print("all paid, skip evening mail")
            return
        subject = f"[ยังค้าง {len(targets)} บิล {today}] อย่าลืมจ่ายก่อนเลยกำหนด"
        title = f"บิลที่ยังค้างจ่าย {today}"

    if not targets and mode == "morning":
        print("no bills due today, skip")
        return

    out = os.path.join(os.path.dirname(__file__), f"bills-{today}-{mode}.pdf")
    build_pdf(targets, title, out, password)
    lines = [f"- {r.get('bill_name')}: {float(r.get('amount') or 0):,.2f} บาท (ครบ {r.get('due_date')})"
             + (" [จ่ายแล้ว]" if r.get("paid") else "") for r in targets]
    body = (f"{title}\n\n" + "\n".join(lines)
            + "\n\nดูยอดฉบับเต็มในไฟล์ PDF แนบ (ใส่รหัสผ่านก่อนเปิด)\n"
            + "เปิดเว็บเพื่อติ๊กจ่าย: ดู README หัวข้อ GitHub Pages")
    send_mail(subject, body, out)


if __name__ == "__main__":
    main()
