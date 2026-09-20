/* dashboard.js — วาดตารางเดือน + การ์ด 2 ยอด + ประวัติ (เว็บคอม) */
var Dashboard = (function () {

  function totals(rows) {
    var total = 0, paid = 0, paidCount = 0;
    (rows || []).forEach(function (r) {
      var a = +r.amount || 0;
      total += a;
      if (r.paid) { paid += a; paidCount++; }
    });
    return { total: total, paid: paid, unpaid: total - paid, count: (rows || []).length, paidCount: paidCount };
  }

  function renderSummary(rows) {
    var t = totals(rows);
    var pct = t.total > 0 ? Math.round(t.paid / t.total * 100) : (t.count > 0 && t.paidCount === t.count ? 100 : 0);
    document.getElementById('sumTotal').textContent = fmt(t.total);
    document.getElementById('sumCount').textContent = t.count + ' รายการ';
    document.getElementById('sumPaid').textContent = fmt(t.paid);
    document.getElementById('sumPaidCount').textContent = t.paidCount + '/' + t.count + ' บิล';
    document.getElementById('sumUnpaid').textContent = fmt(t.unpaid);
    document.getElementById('paidBar').style.width = pct + '%';
    document.getElementById('paidPct').textContent = 'จ่ายแล้ว ' + pct + '%';
    document.getElementById('footTotal').textContent = fmt(t.total);
    document.getElementById('footPaid').textContent = fmt(t.paid);
    document.getElementById('footUnpaid').textContent = 'ค้าง ' + fmt(t.unpaid);
    return t;
  }

  function renderTable(rows, opts) {
    opts = opts || {};
    var locked = !!opts.locked;
    var body = document.getElementById('billBody');
    var empty = document.getElementById('emptyBox');

    if (!rows || !rows.length) {
      body.innerHTML = '';
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
      var sorted = rows.slice().sort(function (a, b) {
        if (!!a.paid !== !!b.paid) return a.paid ? 1 : -1;
        return String(a.bill_name || '').localeCompare(String(b.bill_name || ''), 'th');
      });
      body.innerHTML = sorted.map(function (r, i) {
        var dis = locked ? 'disabled' : '';
        return '<tr class="' + (r.paid ? 'paid' : '') + '">' +
          '<td class="text-center px-3 py-3 text-slate-400">' + (i + 1) + '</td>' +
          '<td class="px-3 py-3">' +
            '<div class="font-bold ' + (r.paid ? 'line-through text-green-800' : '') + '">' + esc(r.bill_name) + '</div>' +
            '<div class="text-xs text-slate-400">' + esc(r.bill_id || '') + (r.paid && r.paid_at ? ' · จ่าย ' + esc(String(r.paid_at).slice(0, 10)) : '') + '</div>' +
          '</td>' +
          '<td class="px-3 py-3 text-right">' +
            '<input type="text" inputmode="decimal" class="amt-input tabular-nums" data-amt="' + esc(r.bill_id) + '" value="' + esc(fmt(r.amount)) + '" ' + dis + ' title="แก้ยอดได้เลย บันทึกอัตโนมัติ">' +
          '</td>' +
          '<td class="px-3 py-3 text-center">' +
            '<input type="checkbox" class="tick" data-tick="' + esc(r.bill_id) + '" ' + (r.paid ? 'checked' : '') + ' ' + dis + ' title="ติ๊กเมื่อจ่ายแล้ว">' +
          '</td>' +
          '<td class="px-3 py-3 text-center whitespace-nowrap">' +
            '<button class="row-btn btn-edit" data-rename="' + esc(r.bill_id) + '" ' + dis + '>✏️</button> ' +
            '<button class="row-btn btn-del" data-delrow="' + esc(r.bill_id) + '" ' + dis + '>ลบ</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    // wire events (ผูกใหม่ทุกครั้งที่วาด กัน handler ซ้ำ)
    body.querySelectorAll('[data-tick]').forEach(function (cb) {
      cb.addEventListener('change', function () { opts.onToggle && opts.onToggle(cb.getAttribute('data-tick'), cb.checked); });
    });
    body.querySelectorAll('[data-amt]').forEach(function (inp) {
      var t = null;
      inp.addEventListener('focus', function () { inp.select(); });
      inp.addEventListener('input', function () {
        if (t) clearTimeout(t);
        t = setTimeout(function () {
          var v = parseAmount(inp.value);
          opts.onAmount && opts.onAmount(inp.getAttribute('data-amt'), v, inp);
        }, 700);
      });
      inp.addEventListener('change', function () {
        if (t) clearTimeout(t);
        var v = parseAmount(inp.value);
        inp.value = fmt(v);
        opts.onAmount && opts.onAmount(inp.getAttribute('data-amt'), v, inp);
      });
    });
    body.querySelectorAll('[data-rename]').forEach(function (btn) {
      btn.addEventListener('click', function () { opts.onRename && opts.onRename(btn.getAttribute('data-rename')); });
    });
    body.querySelectorAll('[data-delrow]').forEach(function (btn) {
      btn.addEventListener('click', function () { opts.onDelete && opts.onDelete(btn.getAttribute('data-delrow')); });
    });
  }

  function renderHistory(items, currentMonthStr, handlers) {
    handlers = handlers || {};
    var box = document.getElementById('historyList');
    if (!items || !items.length) { box.innerHTML = '<div class="text-slate-400">ยังไม่มีประวัติ</div>'; return; }
    var sorted = items.slice().sort(function (a, b) { return String(b.month).localeCompare(String(a.month)); });
    box.innerHTML = sorted.map(function (d) {
      var isCur = d.month === currentMonthStr;
      var pct = d.total > 0 ? Math.round(d.paid / d.total * 100) : 100;
      return '<div class="border rounded-xl overflow-hidden ' + (isCur ? 'border-blue-400 ring-1 ring-blue-200' : '') + '">' +
        '<button class="w-full text-left px-3 py-2 hover:bg-slate-50" data-hist="' + esc(d.month) + '">' +
          '<div class="flex justify-between items-center gap-2">' +
            '<span class="font-bold">' + esc(monthShort(d.month)) + (isCur ? ' <span class="text-[10px] text-blue-600">● ดูอยู่</span>' : '') + '</span>' +
            '<span class="tabular-nums font-bold">' + esc(fmt(d.total)) + '</span>' +
          '</div>' +
          '<div class="h-1.5 bg-slate-200 rounded-full mt-1.5"><div class="h-1.5 bg-green-500 rounded-full" style="width:' + pct + '%"></div></div>' +
          '<div class="text-xs text-slate-500 mt-1">จ่าย ' + esc(fmt(d.paid)) + ' · ค้าง ' + esc(fmt(d.unpaid)) + ' · ' + d.paidCount + '/' + d.count + (d.done ? ' ✓' : '') + '</div>' +
        '</button>' +
        '<div id="hist-' + esc(d.month) + '" class="hidden px-3 pb-2 hist-detail mx-2 mb-2 p-2"></div>' +
      '</div>';
    }).join('');

    box.querySelectorAll('[data-hist]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var m = btn.getAttribute('data-hist');
        var detail = document.getElementById('hist-' + m);
        if (!detail) return;
        if (!detail.classList.contains('hidden')) { detail.classList.add('hidden'); return; }
        detail.classList.remove('hidden');
        detail.innerHTML = '<div class="text-xs text-slate-400">กำลังโหลด...</div>';
        (handlers.onExpand ? handlers.onExpand(m) : Promise.resolve([])).then(function (rows) {
          if (!rows || !rows.length) { detail.innerHTML = '<div class="text-xs text-slate-400">ไม่มีรายการ</div>'; return; }
          detail.innerHTML = rows.map(function (r) {
            return '<div class="hist-row text-xs"><span>' + (r.paid ? '✅ ' : '⬜ ') + esc(r.bill_name) + '</span><span class="tabular-nums font-bold">' + esc(fmt(r.amount)) + '</span></div>';
          }).join('') + '<button class="text-xs text-blue-600 font-bold mt-1" data-jump="' + esc(m) + '">→ เปิดเดือนนี้</button>';
          detail.querySelectorAll('[data-jump]').forEach(function (j) {
            j.addEventListener('click', function (e) { e.stopPropagation(); handlers.onJump && handlers.onJump(j.getAttribute('data-jump')); });
          });
        });
      });
    });
  }

  return { totals: totals, renderSummary: renderSummary, renderTable: renderTable, renderHistory: renderHistory };
})();
