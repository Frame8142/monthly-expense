"""make_pdf.py — สร้าง PDF รายการบิล + ใส่รหัสผ่านก่อนเปิด.

ใช้: reportlab (สร้าง PDF) + pikepdf หรือ PyPDF2 (เข้ารหัส)
รหัสผ่านอ่านจาก env PDF_PASSWORD (ตั้งใน GitHub Secrets)
ฟอนต์ไทย: วาง THSarabunNew.ttf ไว้ที่ scripts/fonts/ ถ้ามี (ไม่งั้น fallback Helvetica)
"""
import os

FONT_PATHS = [
    os.path.join(os.path.dirname(__file__), "fonts", "THSarabunNew.ttf"),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def _register_font():
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        for p in FONT_PATHS:
            if os.path.exists(p):
                pdfmetrics.registerFont(TTFont("Thai", p))
                return "Thai"
    except Exception:
        pass
    return "Helvetica"


def build_pdf(rows, title, out_path, password):
    """rows: list of dict(bill_name, amount, due_date, paid). คืน path ของไฟล์ที่เข้ารหัสแล้ว."""
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors

    font = _register_font()
    styles = getSampleStyleSheet()
    for s in styles.byName.values():
        s.fontName = font

    tmp = out_path + ".tmp.pdf"
    doc = SimpleDocTemplate(tmp, pagesize=A4, topMargin=36, bottomMargin=36)
    els = [Paragraph(title, styles["Title"]), Spacer(1, 12)]
    data = [["รายการ", "ครบกำหนด", "ยอด (บาท)", "สถานะ"]]
    total = 0.0
    for r in rows:
        total += float(r.get("amount") or 0)
        data.append([
            Paragraph(str(r.get("bill_name", "")), styles["Normal"]),
            str(r.get("due_date", "")),
            f"{float(r.get('amount') or 0):,.2f}",
            "จ่ายแล้ว" if r.get("paid") else "ค้างจ่าย",
        ])
    data.append(["", "รวม", f"{total:,.2f}", ""])
    t = Table(data, colWidths=[220, 110, 100, 100])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1d4ed8")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), font),
        ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
    ]))
    els.append(t)
    els += [Spacer(1, 12), Paragraph("เปิดไฟล์ด้วยรหัสผ่านที่ตั้งไว้ (PDF_PASSWORD)", styles["Normal"])]
    doc.build(els)

    # เข้ารหัสด้วยรหัสผ่าน
    try:
        import pikepdf
        pdf = pikepdf.open(tmp)
        pdf.save(out_path, encryption=pikepdf.Encryption(owner=password, user=password, R=4))
        pdf.close()
    except ImportError:
        from PyPDF2 import PdfReader, PdfWriter
        reader, writer = PdfReader(tmp), PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        writer.encrypt(password)
        with open(out_path, "wb") as f:
            writer.write(f)
    try:
        os.remove(tmp)
    except OSError:
        pass
    return out_path


if __name__ == "__main__":
    demo = [
        {"bill_name": "ค่าน้ำบ้าน", "amount": 2000, "due_date": "2026-10-01", "paid": False},
        {"bill_name": "ค่าไฟ+หอ", "amount": 1700, "due_date": "2026-10-10", "paid": False},
    ]
    pw = os.environ.get("PDF_PASSWORD", "08011999")
    build_pdf(demo, "ตัวอย่างบิลเดือน 2026-10", os.path.join(os.path.dirname(__file__), "demo.pdf"), pw)
    print("wrote demo.pdf")
