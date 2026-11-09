/* api.js — คุยกับ Google Sheet ผ่าน Apps Script + โหมดทดลองในเครื่อง */
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
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function post(action, payload) {
    var s = settings();
    payload = payload || {};
    if (!s.url) return Promise.resolve(LocalStore.handlePost(action, payload));
    return fetch(s.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(Object.assign({ key: s.key, action: action }, payload))
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  return {
    ping: function () { return get('ping', {}); },
    listBills: function (inc) { return get('listBills', inc ? { includeInactive: '1' } : {}); },
    getLedger: function (month) { return get('getLedger', { month: month }); },
    dashboard: function (n) { return get('dashboard', { months: n || 12 }); },
    upsertBill: function (bill) { return post('upsertBill', { bill: bill }); },
    deleteBill: function (id) { return post('deleteBill', { id: id }); },
    restoreBill: function (id) { return post('restoreBill', { id: id }); },
    ensureMonth: function (month, sourceMonth) { return post('ensureMonth', { month: month, sourceMonth: sourceMonth || '' }); },
    copyPrevMonth: function (month) { return post('copyPrevMonth', { month: month }); },
    addBillToMonth: function (month, name, amount) { return post('addBillToMonth', { month: month, name: name, amount: amount }); },
    deleteLedgerRow: function (month, bill_id) { return post('deleteLedgerRow', { month: month, bill_id: bill_id }); },
    upsertLedger: function (row) { return post('upsertLedger', { row: row }); },
    markPaid: function (month, bill_id, paid_amount) { return post('markPaid', { month: month, bill_id: bill_id, paid_amount: paid_amount }); },
    unmark: function (month, bill_id) { return post('unmark', { month: month, bill_id: bill_id }); }
  };
})();

/* โหมดทดลอง: mirror logic ฝั่ง Sheet (ลอกเดือนแบบ ก. + ประวัติแยกเดือน) */
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
    var sep = [3100, 315.65, 640.93, 1870, 600, 65, 1020, 800, 1000];
    var ledger = [];
    bills.forEach(function (b, i) {
      ledger.push({ month: '2026-09', bill_id: b.id, bill_name: b.name, amount: sep[i], due_date: calcDueDate('2026-09', b.due_day), paid: true, paid_at: '2026-09-05' });
    });
    localStorage.setItem(KB, JSON.stringify(bills));
    localStorage.setItem(KL, JSON.stringify(ledger));
  }
  function bills() { seed(); try { return JSON.parse(localStorage.getItem(KB)) || []; } catch (e) { return []; } }
  function ledger() { seed(); try { return JSON.parse(localStorage.getItem(KL)) || []; } catch (e) { return []; } }
  function saveB(b) { localStorage.setItem(KB, JSON.stringify(b)); }
  function saveL(l) { localStorage.setItem(KL, JSON.stringify(l)); }
  function nextId(B) {
    var max = 0;
    B.forEach(function (x) { var m = /^b(\d+)$/.exec(x.id || ''); if (m) max = Math.max(max, +m[1]); });
    var n = max + 1;
    return 'b' + (n < 10 ? '0' + n : String(n));
  }
  function prevMonthOf(target) {
    var best = '';
    ledger().forEach(function (r) {
      if (r.month < target && r.month > best) best = r.month;
    });
    return best;
  }
  function doEnsureMonth(target, sourceMonth) {
    var B = bills(), L = ledger();
    var has = {};
    L.forEach(function (r) { if (r.month === target) has[r.bill_id] = 1; });
    var src = sourceMonth || prevMonthOf(target);
    var added = 0;
    if (src) {
      var byId = {};
      B.forEach(function (b) { byId[b.id] = b; });
      L.filter(function (r) { return r.month === src; }).forEach(function (r) {
        if (has[r.bill_id]) return;
        var b = byId[r.bill_id];
        var dueDay = b ? b.due_day : parseInt(String(r.due_date || '').slice(8, 10), 10) || 1;
        L.push({ month: target, bill_id: r.bill_id, bill_name: r.bill_name, amount: +r.amount || 0, due_date: calcDueDate(target, dueDay), paid: false, paid_at: '' });
        has[r.bill_id] = 1; added++;
      });
      B.filter(function (x) { return x.active; }).forEach(function (x) {
        if (has[x.id]) return;
        L.push({ month: target, bill_id: x.id, bill_name: x.name, amount: 0, due_date: calcDueDate(target, x.due_day), paid: false, paid_at: '' });
        added++;
      });
    } else {
      B.filter(function (x) { return x.active; }).forEach(function (x) {
        if (has[x.id]) return;
        L.push({ month: target, bill_id: x.id, bill_name: x.name, amount: 0, due_date: calcDueDate(target, x.due_day), paid: false, paid_at: '' });
        added++;
      });
    }
    saveL(L);
    return { added: added, sourceMonth: src };
  }

  return {
    reset: function () { localStorage.removeItem(KB); localStorage.removeItem(KL); seed(); },
    handleGet: function (action, p) {
      if (action === 'ping') return { ok: true, time: new Date().toISOString() };
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
      return { ok: false, error: 'unknown action' };
    },
    handlePost: function (action, p) {
      var B = bills(), L = ledger();
      if (action === 'upsertBill') {
        var b = p.bill || {};
        if (!b.name || !String(b.name).trim()) return { ok: false, error: 'name required' };
        b.due_day = Math.min(31, Math.max(1, +b.due_day || 1));
        if (!b.id) {
          b.id = nextId(B);
          B.push({ id: b.id, name: String(b.name).trim(), due_day: b.due_day, category: b.category || 'อื่นๆ', note: b.note || '', color: b.color || 'gray', active: true });
        } else {
          var found = false;
          B = B.map(function (x) {
            if (x.id === b.id) { found = true; return Object.assign({}, x, { name: String(b.name).trim(), due_day: b.due_day, category: b.category !== undefined ? b.category : x.category, note: b.note !== undefined ? b.note : x.note, color: b.color !== undefined ? b.color : x.color }); }
            return x;
          });
          if (!found) return { ok: false, error: 'bill not found' };
        }
        saveB(B); return { ok: true, bill: b };
      }
      if (action === 'deleteBill' || action === 'restoreBill') {
        B = B.map(function (x) { return x.id === p.id ? Object.assign({}, x, { active: action === 'restoreBill' }) : x; });
        saveB(B); return { ok: true };
      }
      if (action === 'ensureMonth') {
        var r = doEnsureMonth(p.month, p.sourceMonth || '');
        return { ok: true, month: p.month, added: r.added, sourceMonth: r.sourceMonth };
      }
      if (action === 'copyPrevMonth') {
        var src = prevMonthOf(p.month);
        if (!src) {
          var r2 = doEnsureMonth(p.month, '');
          return { ok: true, month: p.month, result: { sourceMonth: '', added: r2.added } };
        }
        var r3 = doEnsureMonth(p.month, src);
        return { ok: true, month: p.month, result: { sourceMonth: src, added: r3.added } };
      }
      if (action === 'addBillToMonth') {
        if (!p.name || !String(p.name).trim()) return { ok: false, error: 'name required' };
        var id = nextId(B);
        var nb = { id: id, name: String(p.name).trim(), due_day: 1, category: 'อื่นๆ', note: '', color: 'gray', active: true };
        B.push(nb); saveB(B);
        L.push({ month: p.month, bill_id: id, bill_name: nb.name, amount: parseAmount(p.amount), due_date: calcDueDate(p.month, 1), paid: false, paid_at: '' });
        saveL(L);
        return { ok: true, result: { bill_id: id, bill_name: nb.name, amount: parseAmount(p.amount) } };
      }
      if (action === 'deleteLedgerRow') {
        var n0 = L.length;
        L = L.filter(function (r) { return !(r.month === p.month && r.bill_id === p.bill_id); });
        if (L.length === n0) return { ok: false, error: 'row not found' };
        saveL(L); return { ok: true };
      }
      if (action === 'markPaid' || action === 'unmark') {
        var changed = false;
        L = L.map(function (r) {
          if (r.month === p.month && r.bill_id === p.bill_id) {
            changed = true;
            if (action === 'unmark' || p.paid_amount === null || p.paid_amount === undefined || p.paid_amount === '') { r.paid = false; r.paid_at = ''; }
            else { if (+p.paid_amount > 0) r.amount = +p.paid_amount; r.paid = true; r.paid_at = new Date().toISOString().slice(0, 10); }
          }
          return r;
        });
        if (!changed) return { ok: false, error: 'row not found' };
        saveL(L); return { ok: true };
      }
      if (action === 'upsertLedger') {
        var row = p.row || {};
        if (!row.month || !row.bill_id) return { ok: false, error: 'month + bill_id required' };
        var done = false;
        L = L.map(function (r) {
          if (r.month === row.month && r.bill_id === row.bill_id) {
            done = true;
            var nr = Object.assign({}, r, row);
            if (row.amount !== undefined) nr.amount = parseAmount(row.amount);
            return nr;
          }
          return r;
        });
        if (!done) L.push(Object.assign({ bill_name: row.bill_id, amount: 0, paid: false, paid_at: '' }, row));
        saveL(L); return { ok: true, row: row };
      }
      return { ok: false, error: 'unknown action' };
    }
  };
})();
