/* dashboard.js — วาดสรุปยอด + ลิสต์บิลเดือนนี้ (ติ๊กจ่ายเอง) */
var Dashboard = (function () {
  var COLOR = { blue: '#3b82f6', green: '#22c55e', yellow: '#eab308', red: '#ef4444', orange: '#f97316', purple: '#a855f7', gray: '#94a3b8' };

  function statusOf(row) {
    if (row.paid) return 'paid';
    var left = daysLeft(row.due_date);
    if (left < 0) return 'overdue';
    if (left <= CONFIG.SOON_DAYS) return 'soon';
    return 'todo';
  }
  function badge(st, left) {
    if (st === 'paid') return '<span class="badge badge-ok">จ่ายแล้ว ✓</span>';
    if (st === 'overdue') return '<span class="badge badge-overdue">เลยกำหนด ' + Math.abs(left) + ' วัน</span>';
    if (st === 'soon') return '<span class="badge badge-soon">เหลือ ' + left + ' วัน</span>';
    return '<span class="badge badge-todo">เหลือ ' + left + ' วัน</span>';
  }

  function renderSummary(rows) {
    var total = 0, paid = 0;
    rows.forEach(function (r) { total += +r.amount || 0; if (r.paid) paid += +r.amount || 0; });
    document.getElementById('sumTotal').textContent = fmt(total);
    document.getElementById('sumPaid').textContent = fmt(paid);
    document.getElementById('sumUnpaid').textContent = fmt(total - paid);
  }

  function renderList(rows, billsById, onToggle, onEditAmount) {
    var box = document.getElementById('billList');
    if (!rows.length) {
      box.innerHTML = '<div class="bg-white rounded-xl p-6 text-center text-slate-500 text-sm shadow">เดือนนี้ยังไม่มีรายการ<br>กด “ตั้งบิลเดือนนี้จากรายชื่อ” เพื่อดึงชื่อที่สร้างไว้มาก่อน</div>';
      return;
    }
    var order = { overdue: 0, soon: 1, todo: 2, paid: 3 };
    var decorated = rows.map(function (r) {
      var b = billsById[r.bill_id] || {};
      return { r: r, b: b, st: statusOf(r), left: daysLeft(r.due_date) };
    }).sort(function (a, b) {
      return (order[a.st] - order[b.st]) || String(a.r.due_date).localeCompare(String(b.r.due_date));
    });

    box.innerHTML = decorated.map(function (d) {
      var r = d.r;
      var c = COLOR[d.b.color] || COLOR.gray;
      var dim = d.st === 'paid' ? 'opacity-70' : '';
      return '<div class="bill-card bg-white rounded-xl p-3 shadow flex items-center gap-3 ' + dim + '">' +
        '<input type="checkbox" class="tick" data-id="' + r.bill_id + '" ' + (r.paid ? 'checked' : '') + ' title="ติ๊กว่าเดือนนี้จ่ายแล้ว">' +
        '<span class="dot" style="background:' + c + '"></span>' +
        '<div class="flex-1 min-w-0">' +
          '<div class="font-bold truncate">' + esc(r.bill_name) + '</div>' +
          '<div class="text-xs text-slate-500">ครบ ' + fmtDateThai(r.due_date) + ' · ' + badge(d.st, d.left) + '</div>' +
          '<div class="flex items-center gap-1 mt-1">' +
            '<input type="number" min="0" step="0.01" value="' + (+r.amount || 0) + '" data-amt="' + r.bill_id + '"' +
            ' class="w-28 border rounded-lg px-2 py-1 text-sm" title="ยอดจริงเดือนนี้">' +
            '<span class="text-xs text-slate-500">บาท</span>' +
          '</div>' +
        '</div>' +
        '<div class="text-right font-bold">' + fmt(r.amount) + '</div>' +
      '</div>';
    }).join('');

    box.querySelectorAll('.tick').forEach(function (cb) {
      cb.addEventListener('change', function () { onToggle(cb.getAttribute('data-id'), cb.checked); });
    });
    box.querySelectorAll('[data-amt]').forEach(function (inp) {
      inp.addEventListener('change', function () { onEditAmount(inp.getAttribute('data-amt'), parseFloat(inp.value) || 0); });
    });
  }

  function renderHistory(items) {
    var box = document.getElementById('historyList');
    if (!items || !items.length) { box.innerHTML = '<div class="text-slate-500">ยังไม่มีข้อมูล</div>'; return; }
    var sorted = items.slice().sort().reverse();
    box.innerHTML = sorted.map(function (d) {
      var pct = d.total > 0 ? Math.round(d.paid / d.total * 100) : 100;
      return '<div class="border rounded-xl p-3">' +
        '<div class="flex justify-between font-bold"><span>' + monthLabel(d.month) + '</span><span>' + fmt(d.total) + ' บาท</span></div>' +
        '<div class="h-2 bg-slate-200 rounded-full mt-2"><div class="h-2 bg-green-500 rounded-full" style="width:' + pct + '%"></div></div>' +
        '<div class="text-xs text-slate-500 mt-1">จ่ายแล้ว ' + fmt(d.paid) + ' · ค้าง ' + fmt(d.unpaid) + ' · ' + d.paidCount + '/' + d.count + ' บิล' + (d.done ? ' ✓ ครบ' : '') + '</div>' +
      '</div>';
    }).join('');
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  return { renderSummary: renderSummary, renderList: renderList, renderHistory: renderHistory, statusOf: statusOf };
})();
