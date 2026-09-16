/* api.js — คุยกับ Google Sheet ผ่าน Apps Script
   ถ้ายังไม่ตั้ง URL จะใช้โหมดทดลอง (localStorage) ให้ลองกดได้ทันที */
var Api = (function () {
  function settings() { return getSettings(); }

  function get(action, params) {
    var s = settings();
    params = params || {};
    if (!s.url) return Promise.resolve(LocalStore.handleGet(action, params));
    var q = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    var url = s.url + '?key=' + encodeURIComponent(s.key) + '&action=' + action + (q ? '&' + q : '');
    return fetch(url).then(function (r) { return r.json(); });
  }
  // ใช้ text/plain กัน CORS preflight จาก GitHub Pages
  function post(action, payload) {
    var s = settings();
    payload = payload || {};
    if (!s.url) return Promise.resolve(LocalStore.handlePost(action, payload));
    return fetch(s.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(Object.assign({ key: s.key, action: action }, payload))
    }).then(function (r) { return r.json(); });
  }

  return {
    listBills: function (inc) { return get('listBills', inc ? { includeInactive: '1' } : {}); },
    getLedger: function (month) { return get('getLedger', { month: month }); },
    dashboard: function (n) { return get('dashboard', { months: n || 12 }); },
    upsertBill: function (bill) { return post('upsertBill', { bill: bill }); },
    deleteBill: function (id) { return post('deleteBill', { id: id }); },
    restoreBill: function (id) { return post('restoreBill', { id: id }); },
    ensureMonth: function (month) { return post('ensureMonth', { month: month }); },
    upsertLedger: function (row) { return post('upsertLedger', { row: row }); },
    markPaid: function (month, bill_id, paid_amount) { return post('markPaid', { month: month, bill_id: bill_id, paid_amount: paid_amount }); },
    unmark: function (month, bill_id) { return post('unmark', { month: month, bill_id: bill_id }); }
  };
})();

/* โหมดทดลอง: เก็บในเครื่อง + ข้อมูลตัวอย่างจากชีทเดิม (ก.ย./ต.ค.) */
var LocalStore = (function () {
  var KB = 'me_demo_bills', KL = 'me_demo_ledger';
  function seed() {
    if (localStorage.getItem(KB)) return;
    var bills = [
      { id: 'b01', name: 'ค่าน้ำบ้าน', due_day: 1, category: 'บ้าน', note: '', color: 'blue', active: true },
      { id: 'b02', name: 'ค่าเน็ตบ้าน', due_day: 10, category: 'เน็ต', note: '', color: 'green', active: true },
      { id: 'b03', name: 'ค่าเน็ตหอ', due_day: 10, category: 'เน็ต', note: '', color: 'green', active: true },
      { id: 'b04', name: 'ค่าไฟ+หอ', due_day: 10, category: 'บ้าน', note: '', color: 'yellow', active: true },
      { id: 'b05', name: 'ค่าน้ำ + ส่วนกลาง', due_day: 1, category: 'บ้าน', note: '', color: 'blue', active: true },
      { id: 'b06', name: 'Youtube', due_day: 15, category: 'Subscription', note: '', color: 'red', active: true },
      { id: 'b07', name: 'Shopee', due_day: 20, category: 'ช้อปปิ้ง', note: '', color: 'orange', active: true },
      { id: 'b08', name: 'ทีออสตรก', due_day: 20, category: 'อื่นๆ', note: '', color: 'gray', active: true },
      { id: 'b09', name: 'บัตร', due_day: 25, category: 'บัตร', note: '', color: 'purple', active: true }
    ];
    // ยอดตัวอย่างจากรูป: ก.ย. รวม 9411.58 (จ่ายครบ) / ต.ค. รวม 8049.58 (ยังไม่จ่าย)
    var sep = [3100, 315.65, 640.93, 1870, 600, 65, 1020, 800, 1000];
    var oct = [2000, 315.65, 640.93, 1700, 600, 65, 700, 0, 2028];
    var ledger = [];
    bills.forEach(function (b, i) {
      ledger.push({ month: '2026-09', bill_id: b.id, bill_name: b.name, amount: sep[i], due_date: calcDueDate('2026-09', b.due_day), paid: sep[i] > 0, paid_at: sep[i] > 0 ? '2026-09-05' : '' });
      ledger.push({ month: '2026-10', bill_id: b.id, bill_name: b.name, amount: oct[i], due_date: calcDueDate('2026-10', b.due_day), paid: false, paid_at: '' });
    });
    localStorage.setItem(KB, JSON.stringify(bills));
    localStorage.setItem(KL, JSON.stringify(ledger));
  }
  function bills() { seed(); return JSON.parse(localStorage.getItem(KB)); }
  function ledger() { seed(); return JSON.parse(localStorage.getItem(KL)); }
  function saveB(b) { localStorage.setItem(KB, JSON.stringify(b)); }
  function saveL(l) { localStorage.setItem(KL, JSON.stringify(l)); }

  return {
    handleGet: function (action, p) {
      if (action === 'listBills') {
        var all = bills();
        return { ok: true, bills: p.includeInactive ? all : all.filter(function (b) { return b.active; }) };
      }
      if (action === 'getLedger') {
        return { ok: true, month: p.month, rows: ledger().filter(function (r) { return r.month === p.month; }) };
      }
      if (action === 'dashboard') {
        var map = {};
        ledger().forEach(function (r) {
          if (!map[r.month]) map[r.month] = { month: r.month, total: 0, paid: 0, count: 0, paidCount: 0 };
          map[r.month].total += +r.amount || 0; map[r.month].count++;
          if (r.paid) { map[r.month].paid += +r.amount || 0; map[r.month].paidCount++; }
        });
        var keys = Object.keys(map).sort().slice(-(parseInt(p.months, 10) || 12));
        return { ok: true, dashboard: keys.map(function (k) {
          var d = map[k]; d.unpaid = d.total - d.paid; d.done = d.count > 0 && d.paidCount === d.count; return d;
        }) };
      }
      return { ok: false, error: 'unknown' };
    },
    handlePost: function (action, p) {
      var B = bills(), L = ledger();
      if (action === 'upsertBill') {
        var b = p.bill || {};
        if (!b.name) return { ok: false, error: 'name required' };
        b.due_day = Math.min(31, Math.max(1, +b.due_day || 1));
        if (!b.id) {
          var max = 0;
          B.forEach(function (x) { var m = /^b(\d+)$/.exec(x.id); if (m) max = Math.max(max, +m[1]); });
          b.id = 'b' + String(max + 1).padStart(2, '0');
          b.active = true;
          B.push({ id: b.id, name: b.name, due_day: b.due_day, category: b.category || '', note: b.note || '', color: b.color || 'gray', active: true });
        } else {
          B = B.map(function (x) { return x.id === b.id ? Object.assign(x, b) : x; });
        }
        saveB(B); return { ok: true, bill: b };
      }
      if (action === 'deleteBill' || action === 'restoreBill') {
        B = B.map(function (x) { return x.id === p.id ? Object.assign(x, { active: action === 'restoreBill' }) : x; });
        saveB(B); return { ok: true };
      }
      if (action === 'ensureMonth') {
        var has = {}; L.forEach(function (r) { if (r.month === p.month) has[r.bill_id] = 1; });
        var added = 0;
        B.filter(function (x) { return x.active; }).forEach(function (x) {
          if (!has[x.id]) { L.push({ month: p.month, bill_id: x.id, bill_name: x.name, amount: 0, due_date: calcDueDate(p.month, x.due_day), paid: false, paid_at: '' }); added++; }
        });
        saveL(L); return { ok: true, added: added };
      }
      if (action === 'markPaid' || action === 'unmark') {
        L = L.map(function (r) {
          if (r.month === p.month && r.bill_id === p.bill_id) {
            if (action === 'unmark' || p.paid_amount === null || p.paid_amount === '') { r.paid = false; r.paid_at = ''; }
            else { if (+p.paid_amount > 0) r.amount = +p.paid_amount; r.paid = true; r.paid_at = new Date().toISOString().slice(0, 10); }
          }
          return r;
        });
        saveL(L); return { ok: true };
      }
      if (action === 'upsertLedger') {
        var row = p.row || {}, found = false;
        L = L.map(function (r) {
          if (r.month === row.month && r.bill_id === row.bill_id) { found = true; return Object.assign(r, row); }
          return r;
        });
        if (!found) L.push(row);
        saveL(L); return { ok: true, row: row };
      }
      return { ok: false, error: 'unknown' };
    }
  };
})();
