/******************************************************
 * monthly-expense — Apps Script API ฝั่ง Google Sheet
 * วิธีใช้:
 * 1. สร้าง Google Sheet 1 ไฟล์ (Private)
 * 2. เปิด Extensions > Apps Script > วางไฟล์นี้ทับ Code.gs
 * 3. รันฟังก์ชัน setup() 1 ครั้ง (สร้าง tabs + headers ให้)
 * 4. Project Settings > Script Properties > เพิ่ม API_KEY = รหัสลับของคุณ
 * 5. Deploy > New deployment > Web app
 *    Execute as: Me / Who has access: Anyone with link
 * 6. เอา Web App URL + API_KEY ไปกรอกในหน้าเว็บ (ปุ่มเฟือง Settings)
 *
 * Tabs ที่ใช้: Bills | Ledger
 * Bills : id | name | due_day | category | note | color | active
 * Ledger: month | bill_id | bill_name | amount | due_date | paid | paid_at
 ******************************************************/

var BILLS_SHEET = 'Bills';
var LEDGER_SHEET = 'Ledger';
var BILLS_HEADERS = ['id', 'name', 'due_day', 'category', 'note', 'color', 'active'];
var LEDGER_HEADERS = ['month', 'bill_id', 'bill_name', 'amount', 'due_date', 'paid', 'paid_at'];

/** รันครั้งเดียว: สร้าง tabs + header + ตัวอย่าง 9 บิล (แก้/ลบได้) */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var bills = ss.getSheetByName(BILLS_SHEET) || ss.insertSheet(BILLS_SHEET);
  var ledger = ss.getSheetByName(LEDGER_SHEET) || ss.insertSheet(LEDGER_SHEET);

  if (bills.getLastRow() === 0) {
    bills.getRange(1, 1, 1, BILLS_HEADERS.length).setValues([BILLS_HEADERS]);
    var sample = [
      ['b01', 'ค่าน้ำบ้าน', 1, 'บ้าน', 'โอนพร้อมเพย์', 'blue', true],
      ['b02', 'ค่าเน็ตบ้าน', 10, 'เน็ต', '', 'green', true],
      ['b03', 'ค่าเน็ตหอ', 10, 'เน็ต', '', 'green', true],
      ['b04', 'ค่าไฟ+หอ', 10, 'บ้าน', 'PEA', 'yellow', true],
      ['b05', 'ค่าน้ำ + ส่วนกลาง', 1, 'บ้าน', '', 'blue', true],
      ['b06', 'Youtube', 15, 'Subscription', 'ตัดบัตร', 'red', true],
      ['b07', 'Shopee', 20, 'ช้อปปิ้ง', '', 'orange', true],
      ['b08', 'ทีออสตรก', 20, 'อื่นๆ', '', 'gray', true],
      ['b09', 'บัตร', 25, 'บัตร', 'ตัดบัญชี', 'purple', true]
    ];
    bills.getRange(2, 1, sample.length, sample[0].length).setValues(sample);
    // dropdown หมวด + checkbox active
    bills.getRange(2, 7, sample.length, 1).insertCheckboxes();
  }
  if (ledger.getLastRow() === 0) {
    ledger.getRange(1, 1, 1, LEDGER_HEADERS.length).setValues([LEDGER_HEADERS]);
    ledger.getRange('F:F').insertCheckboxes();
  }
  // freeze + filter ดูง่าย
  try {
    bills.setFrozenRows(1); ledger.setFrozenRows(1);
  } catch (e) {}
}

/** ตรวจ API key: ถ้ายังไม่ตั้งค่าใน Script Properties จะยอมให้ผ่าน (ช่วง setup) */
function checkKey(key) {
  var saved = PropertiesService.getScriptProperties().getProperty('API_KEY');
  if (!saved) return true;
  return key === saved;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** แปลงค่าช่องวันที่เป็น YYYY-MM-DD (กัน Sheets แปลงข้อความเป็นวันที่อัตโนมัติ) */
function isoDate(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) {
    var y = v.getFullYear(), m = v.getMonth() + 1, d = v.getDate();
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }
  return String(v == null ? '' : v);
}
/** แปลงค่าช่องเดือนเป็น YYYY-MM */
function isoMonth(v) {
  var s = isoDate(v);
  return s.length >= 7 ? s.slice(0, 7) : String(v == null ? '' : v);
}

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (!checkKey(p.key || '')) return jsonOut({ ok: false, error: 'bad key' });
    var action = p.action || '';
    if (action === 'listBills') return jsonOut({ ok: true, bills: getBills(p.includeInactive === '1') });
    if (action === 'getLedger') {
      if (!p.month) return jsonOut({ ok: false, error: 'month required YYYY-MM' });
      return jsonOut({ ok: true, month: p.month, rows: getLedger(p.month) });
    }
    if (action === 'dashboard') {
      return jsonOut({ ok: true, dashboard: getDashboard(parseInt(p.months || '6', 10)) });
    }
    if (action === 'ping') return jsonOut({ ok: true, time: new Date().toISOString() });
    return jsonOut({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

/** รับ POST แบบ text/plain (กัน CORS preflight จาก GitHub Pages) */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var body = {};
    try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) {}
    if (!checkKey(body.key || '')) return jsonOut({ ok: false, error: 'bad key' });
    var action = body.action || '';

    if (action === 'upsertBill') return jsonOut({ ok: true, bill: upsertBill(body.bill || {}) });
    if (action === 'deleteBill') { setBillActive(body.id, false); return jsonOut({ ok: true }); }
    if (action === 'restoreBill') { setBillActive(body.id, true); return jsonOut({ ok: true }); }
    if (action === 'ensureMonth') {
      if (!body.month) return jsonOut({ ok: false, error: 'month required' });
      return jsonOut({ ok: true, month: body.month, added: ensureMonth(body.month) });
    }
    if (action === 'upsertLedger') return jsonOut({ ok: true, row: upsertLedger(body.row || {}) });
    if (action === 'markPaid') return jsonOut({ ok: true, row: markPaid(body.month, body.bill_id, body.paid_amount) });
    if (action === 'unmark') return jsonOut({ ok: true, row: markPaid(body.month, body.bill_id, null) });

    return jsonOut({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/* ---------- อ่าน ---------- */

function getBills(includeInactive) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BILLS_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, BILLS_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!r[0] && !r[1]) continue;
    var active = r[6] === true || String(r[6]).toUpperCase() === 'TRUE';
    if (!includeInactive && !active) continue;
    out.push({
      id: String(r[0]), name: String(r[1]),
      due_day: parseInt(r[2], 10) || 1,
      category: String(r[3] || ''), note: String(r[4] || ''),
      color: String(r[5] || 'gray'), active: active
    });
  }
  return out;
}

function getLedger(month) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LEDGER_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, LEDGER_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if (isoMonth(vals[i][0]) !== String(month)) continue;
    out.push({
      month: String(month), bill_id: String(vals[i][1]),
      bill_name: String(vals[i][2]), amount: Number(vals[i][3]) || 0,
      due_date: isoDate(vals[i][4]),
      paid: vals[i][5] === true || String(vals[i][5]).toUpperCase() === 'TRUE',
      paid_at: isoDate(vals[i][6])
    });
  }
  return out;
}

/** สรุปยอดรายเดือนย้อนหลัง N เดือน (ให้หน้า Dashboard + สคริปต์ส่งเมลใช้) */
function getDashboard(months) {
  months = months || 6;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LEDGER_SHEET);
  var map = {};
  if (sh && sh.getLastRow() >= 2) {
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, LEDGER_HEADERS.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var m = isoMonth(vals[i][0]); if (!m) continue;
      if (!map[m]) map[m] = { month: m, total: 0, paid: 0, count: 0, paidCount: 0 };
      var amt = Number(vals[i][3]) || 0;
      var isPaid = vals[i][5] === true || String(vals[i][5]).toUpperCase() === 'TRUE';
      map[m].total += amt; map[m].count += 1;
      if (isPaid) { map[m].paid += amt; map[m].paidCount += 1; }
    }
  }
  var keys = Object.keys(map).sort().slice(-months);
  return keys.map(function (k) {
    var d = map[k];
    d.unpaid = d.total - d.paid;
    d.done = d.count > 0 && d.paidCount === d.count;
    return d;
  });
}

/* ---------- เขียน ---------- */

function nextBillId() {
  var bills = getBills(true);
  var max = 0;
  bills.forEach(function (b) {
    var m = /^b(\d+)$/.exec(b.id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'b' + ('0' + (max + 1)).slice(-2);
}

function upsertBill(bill) {
  if (!bill.name) throw new Error('name required');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BILLS_SHEET);
  bill.due_day = Math.min(31, Math.max(1, parseInt(bill.due_day, 10) || 1));
  if (!bill.id) {
    bill.id = nextBillId();
    sh.appendRow([bill.id, bill.name, bill.due_day, bill.category || '',
      bill.note || '', bill.color || 'gray', true]);
    return bill;
  }
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, BILLS_HEADERS.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(bill.id)) {
      var row = i + 2;
      sh.getRange(row, 2).setValue(bill.name);
      sh.getRange(row, 3).setValue(bill.due_day);
      if (bill.category !== undefined) sh.getRange(row, 4).setValue(bill.category);
      if (bill.note !== undefined) sh.getRange(row, 5).setValue(bill.note);
      if (bill.color !== undefined) sh.getRange(row, 6).setValue(bill.color);
      return bill;
    }
  }
  throw new Error('bill not found: ' + bill.id);
}

function setBillActive(id, active) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BILLS_SHEET);
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) {
      sh.getRange(i + 2, 7).setValue(active === true);
      return;
    }
  }
  throw new Error('bill not found: ' + id);
}

/** คำนวณวันครบกำหนด: ปัด 31 -> สิ้นเดือนให้อัตโนมัติ */
function calcDueDate(month, dueDay) {
  var parts = String(month).split('-');
  var y = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
  var last = new Date(y, m, 0).getDate();
  var d = Math.min(dueDay || 1, last);
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return y + '-' + pad(m) + '-' + pad(d);
}

/** ขึ้นเดือนใหม่: ลอกชื่อบิลที่ active มาเป็นแถว Ledger (ไม่สร้างซ้ำ) */
function ensureMonth(month) {
  var bills = getBills(false);
  var existing = {};
  getLedger(month).forEach(function (r) { existing[r.bill_id] = true; });
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LEDGER_SHEET);
  var added = 0;
  bills.forEach(function (b) {
    if (existing[b.id]) return;
    sh.appendRow([month, b.id, b.name, 0, calcDueDate(month, b.due_day), false, '']);
    added++;
  });
  return added;
}

function findLedgerRow(month, billId) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LEDGER_SHEET);
  if (sh.getLastRow() < 2) return -1;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (isoMonth(vals[i][0]) === String(month) && String(vals[i][1]) === String(billId)) return i + 2;
  }
  return -1;
}

function upsertLedger(row) {
  if (!row.month || !row.bill_id) throw new Error('month + bill_id required');
  var r = findLedgerRow(row.month, row.bill_id);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LEDGER_SHEET);
  if (r === -1) {
    var bills = getBills(true);
    var b = null;
    for (var i = 0; i < bills.length; i++) if (bills[i].id === row.bill_id) b = bills[i];
    var name = row.bill_name || (b ? b.name : row.bill_id);
    var due = row.due_date || calcDueDate(row.month, b ? b.due_day : 1);
    sh.appendRow([row.month, row.bill_id, name, Number(row.amount) || 0,
      due, row.paid === true, row.paid === true ? new Date() : '']);
    return row;
  }
  if (row.bill_name !== undefined) sh.getRange(r, 3).setValue(row.bill_name);
  if (row.amount !== undefined) sh.getRange(r, 4).setValue(Number(row.amount) || 0);
  if (row.due_date !== undefined) sh.getRange(r, 5).setValue(row.due_date);
  if (row.paid !== undefined) {
    sh.getRange(r, 6).setValue(row.paid === true);
    sh.getRange(r, 7).setValue(row.paid === true ? new Date() : '');
  }
  return row;
}

function markPaid(month, billId, paidAmount) {
  if (!month || !billId) throw new Error('month + bill_id required');
  var r = findLedgerRow(month, billId);
  if (r === -1) { ensureMonth(month); r = findLedgerRow(month, billId); }
  if (r === -1) throw new Error('bill not in month: ' + billId);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LEDGER_SHEET);
  if (paidAmount === null || paidAmount === undefined || paidAmount === '') {
    sh.getRange(r, 6).setValue(false);
    sh.getRange(r, 7).setValue('');
  } else {
    if (Number(paidAmount) > 0) sh.getRange(r, 4).setValue(Number(paidAmount));
    sh.getRange(r, 6).setValue(true);
    sh.getRange(r, 7).setValue(new Date());
  }
  var vals = sh.getRange(r, 1, 1, LEDGER_HEADERS.length).getValues()[0];
  return { month: String(vals[0]), bill_id: String(vals[1]), amount: Number(vals[3]) || 0, paid: vals[5] === true };
}
