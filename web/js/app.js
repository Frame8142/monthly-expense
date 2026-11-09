/* =========================================================
   5. app.js — ควบคุมการทำงานหลักของแอป
   ========================================================= */
(function () {
  var state = {
    month: currentMonth(),
    bills: [],
    ledger: [],
    history: [],
    cacheLedger: {},
    unlockedPast: {}
  };

  function $(id) { return document.getElementById(id); }
  function isPast(m) { return String(m) < currentMonth(); }
  function isLocked() { return isPast(state.month) && !state.unlockedPast[state.month]; }

  var toastTimer = null;
  function toast(msg, isErr) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.toggle('err', !!isErr);
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function showErr(msg) {
    var box = $('errBox');
    if (!msg) { box.classList.add('hidden'); box.textContent = ''; return; }
    box.textContent = msg; box.classList.remove('hidden');
  }
  function openModal(id) { $(id).classList.remove('hidden'); }
  function closeModal(id) { $(id).classList.add('hidden'); }

  var pendingConfirmFn = null;
  function askConfirm(title, desc, onConfirm) {
    $('confirmActionTitle').textContent = title || 'ยืนยันการทำรายการ';
    $('confirmActionDesc').textContent = desc || '';
    pendingConfirmFn = onConfirm;
    openModal('confirmActionModal');
  }

  function setConn(mode) {
    var light = $('connLight'), text = $('connText');
    light.className = 'conn-light' + (mode === 'ok' ? ' ok' : mode === 'err' ? ' err' : '');
    text.textContent = mode === 'ok' ? 'ต่อ Sheet แล้ว' : mode === 'err' ? 'ต่อไม่ได้' : 'โหมดทดลอง';
  }

  /* ---------- โหลด ---------- */
  function load() {
    $('loading').classList.remove('hidden');
    showErr('');

    Promise.all([Api.listBills(true), Api.getLedger(state.month), Api.dashboard(24)])
      .then(function (res) {
        $('loading').classList.add('hidden');
        var demoActive = Api.isUsingFallback();
        $('demoBadge').classList.toggle('hidden', !demoActive);
        setConn(demoActive ? 'demo' : 'ok');

        if (!res[0].ok) return showErr('โหลดรายการหลักไม่ได้: ' + (res[0].error || ''));
        if (!res[1].ok) return showErr('โหลดเดือนนี้ไม่ได้: ' + (res[1].error || ''));
        state.bills = res[0].bills || [];
        state.ledger = res[1].rows || [];
        state.history = (res[2].ok && res[2].dashboard) ? res[2].dashboard : [];
        state.cacheLedger[state.month] = state.ledger;
        render();
      })
      .catch(function (e) {
        $('loading').classList.add('hidden');
        setConn('err');
        showErr('เชื่อมต่อไม่ได้: ' + e.message + ' — ตรวจ URL ใน ⚙️ ตั้งค่า (หรือเว้นว่างเพื่อใช้โหมดทดลอง)');
      });
  }

  function render() {
    $('monthLabel').textContent = monthLabel(state.month) + ' (' + monthShort(state.month) + ')';
    var t = Dashboard.totals(state.ledger);
    var badge = $('monthBadge');
    if (state.month === currentMonth()) {
      $('monthSub').textContent = t.count + ' รายการ · เดือนปัจจุบัน แก้ได้เลย';
      badge.textContent = 'เดือนนี้'; badge.className = 'badge badge-ok';
    } else if (isPast(state.month)) {
      $('monthSub').textContent = t.count + ' รายการ · ประวัติแยกเก็บ (ติ๊กไว้ไม่หาย)';
      badge.textContent = 'เดือนก่อน'; badge.className = 'badge badge-old';
    } else {
      $('monthSub').textContent = t.count + ' รายการ · เดือนล่วงหน้า (วางแผนได้)';
      badge.textContent = 'ล่วงหน้า'; badge.className = 'badge badge-warn';
    }

    var locked = isLocked();
    $('pastBanner').classList.toggle('hidden', !isPast(state.month));
    if (isPast(state.month)) {
      $('pastName').textContent = monthLabel(state.month);
      $('unlockPastBtn').textContent = locked ? '🔓 ปลดล็อกแก้ไขเดือนนี้' : '🔒 ล็อกกลับ (กันมือลั่น)';
      $('lockNote').textContent = locked ? 'ล็อกกันมือลั่น — กดปลดล็อกก่อนแก้' : 'ปลดล็อกแล้ว — แก้ได้ ระวังด้วย';
    }

    Dashboard.renderSummary(state.ledger);
    Dashboard.renderTable(state.ledger, {
      locked: locked,
      onToggle: onTogglePaid,
      onAmount: onEditAmount,
      onRename: openRename,
      onDelete: onDeleteRow
    });
    renderWowDashboard();

    BillsUI.renderTemplate(state.bills, {
      onEdit: onEditTemplate,
      onDelete: function (id) {
        var b = state.bills.find(function (x) { return x.id === id; });
        var label = b ? b.name : id;
        askConfirm(
          'ซ่อนจากรายการหลัก?',
          'ซ่อน “' + label + '” จากรายการหลัก?\n(เดือนเก่าไม่หาย แต่เดือนหน้าจะไม่ลอกไป)',
          function () { Api.deleteBill(id).then(afterOk('ซ่อนแล้ว ✓')); }
        );
      },
      onRestore: function (id) { Api.restoreBill(id).then(afterOk('คืนมาแล้ว ✓')); }
    });

    Dashboard.renderHistory(state.history, state.month, {
      onExpand: function (m) {
        if (state.cacheLedger[m]) return Promise.resolve(state.cacheLedger[m]);
        return Api.getLedger(m).then(function (res) {
          var rows = res.ok ? res.rows : [];
          state.cacheLedger[m] = rows;
          return rows;
        }).catch(function () { return []; });
      },
      onJump: function (m) { state.month = m; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
  }

  function afterOk(msg) {
    return function (res) {
      if (!res || !res.ok) { toast('บันทึกไม่ได้: ' + ((res && res.error) || 'network'), true); return; }
      toast(msg);
      load();
    };
  }

  /* ---------- ติ๊กจ่าย / แก้ยอด ---------- */
  function onTogglePaid(billId, checked) {
    if (isLocked()) return toast('เดือนก่อนถูกล็อกอยู่ กดปลดล็อกก่อน', true);
    var row = state.ledger.find(function (r) { return r.bill_id === billId; });
    if (row) { row.paid = checked; if (checked) row.paid_at = new Date().toISOString().slice(0, 10); else row.paid_at = ''; }
    Dashboard.renderSummary(state.ledger);
    Dashboard.renderTable(state.ledger, { locked: false, onToggle: onTogglePaid, onAmount: onEditAmount, onRename: openRename, onDelete: onDeleteRow });
    renderWowDashboard();
    var p = checked ? Api.markPaid(state.month, billId, row ? row.amount : 0) : Api.unmark(state.month, billId);
    p.then(function (res) {
      if (!res.ok) { showErr('บันทึกไม่ได้: ' + res.error); load(); return; }
      toast(checked ? 'จ่ายแล้ว ✓' : 'เอาติ๊กออกแล้ว');
      state.cacheLedger[state.month] = state.ledger;
      refreshHistory();
    }).catch(function (e) { showErr('บันทึกไม่ได้: ' + e.message); load(); });
  }

  function onEditAmount(billId, amount) {
    if (isLocked()) return;
    var row = state.ledger.find(function (r) { return r.bill_id === billId; });
    if (row) row.amount = amount;
    Dashboard.renderSummary(state.ledger);
    renderWowDashboard();
    Api.upsertLedger({ month: state.month, bill_id: billId, amount: amount }).then(function (res) {
      if (!res.ok) { toast('แก้ยอดไม่ได้: ' + res.error, true); load(); return; }
      state.cacheLedger[state.month] = state.ledger;
      refreshHistory(true);
    }).catch(function () {});
  }

  function refreshHistory(silent) {
    Api.dashboard(24).then(function (res) {
      if (!res.ok) return;
      state.history = res.dashboard || [];
      Dashboard.renderHistory(state.history, state.month, {
        onExpand: function (m) { return Promise.resolve(state.cacheLedger[m] || Api.getLedger(m).then(function (r) { state.cacheLedger[m] = r.ok ? r.rows : []; return state.cacheLedger[m]; })); },
        onJump: function (m) { state.month = m; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      });
      renderWowDashboard();
    }).catch(function () { if (!silent) toast('โหลดประวัติไม่ได้', true); });
  }

  /* ---------- WOW Hydro Dashboard & Charts ---------- */
  var trendChartInst = null;
  var catChartInst = null;
  var topBarChartInst = null;
  var trendChartMode = 'bar'; // 'bar' | 'line'

  var CAT_PALETTE = {
    'บ้าน': { color: '#1E78FF', bg: 'rgba(30, 120, 255, 0.14)', icon: '🏠' },
    'เน็ต': { color: '#06B6D4', bg: 'rgba(6, 182, 212, 0.14)', icon: '🌐' },
    'Subscription': { color: '#F43F5E', bg: 'rgba(244, 63, 94, 0.14)', icon: '🎬' },
    'ช้อปปิ้ง': { color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.14)', icon: '🛍️' },
    'บัตร': { color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.14)', icon: '💳' },
    'อื่นๆ': { color: '#10B981', bg: 'rgba(16, 185, 129, 0.14)', icon: '💧' }
  };

  function inferCategory(row, billMap) {
    var b = billMap[row.bill_id];
    if (b && b.category && b.category !== 'อื่นๆ') return b.category;
    var name = String(row.bill_name || '').toLowerCase();
    if (name.indexOf('น้ำ') !== -1 || name.indexOf('ไฟ') !== -1 || name.indexOf('บ้าน') !== -1 || name.indexOf('หอ') !== -1 || name.indexOf('ส่วนกลาง') !== -1) return 'บ้าน';
    if (name.indexOf('เน็ต') !== -1 || name.indexOf('wifi') !== -1 || name.indexOf('เนต') !== -1) return 'เน็ต';
    if (name.indexOf('youtube') !== -1 || name.indexOf('netflix') !== -1 || name.indexOf('spotify') !== -1) return 'Subscription';
    if (name.indexOf('shopee') !== -1 || name.indexOf('lazada') !== -1) return 'ช้อปปิ้ง';
    if (name.indexOf('บัตร') !== -1 || name.indexOf('card') !== -1) return 'บัตร';
    return (b && b.category) ? b.category : 'อื่นๆ';
  }

  function renderWowDashboard() {
    var rows = state.ledger || [];
    var t = Dashboard.totals(rows);
    var pct = t.total > 0 ? Math.round((t.paid / t.total) * 100) : (t.count > 0 && t.paidCount === t.count ? 100 : 0);

    if ($('dashActiveMonthText')) {
      $('dashActiveMonthText').textContent = monthLabel(state.month) + ' (' + monthShort(state.month) + ')';
    }

    // 1. Liquid Wave Orb
    if ($('liquidWaveFill')) $('liquidWaveFill').style.height = pct + '%';
    if ($('liquidOrbContent')) {
      $('liquidOrbContent').classList.toggle('high-fill', pct >= 55);
    }
    if ($('orbPctText')) $('orbPctText').textContent = pct + '%';
    if ($('orbSubText')) $('orbSubText').textContent = 'จ่ายแล้ว ' + t.paidCount + '/' + t.count + ' บิล';
    if ($('orbStatusChip')) {
      $('orbStatusChip').textContent = pct === 100 && t.count > 0 ? 'ครบ 100% ✅' : 'คืบหน้า ' + pct + '%';
      $('orbStatusChip').className = 'badge ' + (pct === 100 && t.count > 0 ? 'badge-ok' : 'badge-todo');
    }
    if ($('orbPaidAmt')) $('orbPaidAmt').textContent = fmt(t.paid) + ' ฿';
    if ($('orbUnpaidAmt')) $('orbUnpaidAmt').textContent = fmt(t.unpaid) + ' ฿';

    // 2. Smart Insights (4 Mini Cards)
    var sortedByAmt = rows.slice().sort(function (a, b) { return (+b.amount || 0) - (+a.amount || 0); });
    var maxBill = sortedByAmt[0];
    if (maxBill && (+maxBill.amount || 0) > 0) {
      var maxShare = t.total > 0 ? Math.round(((+maxBill.amount || 0) / t.total) * 100) : 0;
      $('insMaxBillName').textContent = maxBill.bill_name;
      $('insMaxBillAmt').textContent = fmt(maxBill.amount) + ' บาท';
      $('insMaxBillPct').textContent = maxShare + '% ของรวม';
    } else {
      $('insMaxBillName').textContent = 'ยังไม่มีรายการ';
      $('insMaxBillAmt').textContent = '0 บาท';
      $('insMaxBillPct').textContent = '0% ของรวม';
    }

    var avgAmt = t.count > 0 ? t.total / t.count : 0;
    $('insAvgAmt').textContent = fmt(avgAmt) + ' บาท';
    $('insBillCountBadge').textContent = t.count + ' บิล';
    $('insAvgSub').textContent = 'จ่ายแล้ว ' + t.paidCount + ' · ค้าง ' + (t.count - t.paidCount) + ' รายการ';

    // MoM Comparison from state.history
    var prevM = '';
    var prevTotal = null;
    (state.history || []).forEach(function (h) {
      if (h.month < state.month && h.month > prevM) {
        prevM = h.month;
        prevTotal = +h.total || 0;
      }
    });
    if (prevM && prevTotal !== null && prevTotal > 0) {
      var diff = t.total - prevTotal;
      var diffPct = Math.round((Math.abs(diff) / prevTotal) * 100);
      if (Math.abs(diff) < 0.01) {
        $('insMomDiff').textContent = 'เท่าเดือนก่อน';
        $('insMomDiff').className = 'text-lg font-extrabold text-slate-900 tabular-nums';
        $('insMomBadge').textContent = monthShort(prevM);
        $('insMomBadge').className = 'text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700';
      } else if (diff > 0) {
        $('insMomDiff').textContent = '+' + fmt(diff) + ' ฿';
        $('insMomDiff').className = 'text-lg font-extrabold text-rose-500 tabular-nums';
        $('insMomBadge').textContent = '▲ +' + diffPct + '%';
        $('insMomBadge').className = 'text-[11px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-600';
      } else {
        $('insMomDiff').textContent = '-' + fmt(Math.abs(diff)) + ' ฿';
        $('insMomDiff').className = 'text-lg font-extrabold text-emerald-600 tabular-nums';
        $('insMomBadge').textContent = '▼ -' + diffPct + '%';
        $('insMomBadge').className = 'text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700';
      }
      $('insMomSub').textContent = 'เทียบกับ ' + monthShort(prevM) + ' (' + fmt(prevTotal) + ' ฿)';
    } else {
      $('insMomDiff').textContent = fmt(t.total) + ' ฿';
      $('insMomDiff').className = 'text-lg font-extrabold text-slate-900 tabular-nums';
      $('insMomBadge').textContent = 'เดือนตั้งต้น';
      $('insMomBadge').className = 'text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700';
      $('insMomSub').textContent = 'ยังไม่มีข้อมูลเดือนก่อนหน้าให้เปรียบเทียบ';
    }

    // Hydro Flow Status
    if (t.count === 0) {
      $('insHydroStatus').textContent = 'ยังไม่มีบิลในเดือนนี้';
      $('insHydroSub').textContent = 'กดลอกเดือนที่แล้วมาเพื่อเริ่มวางแผน';
      $('insHydroBadge').textContent = 'ว่าง';
      $('insHydroBadge').className = 'text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600';
    } else if (pct === 100) {
      $('insHydroStatus').textContent = 'เคลียร์ครบทุกบิลแล้ว! 🎉';
      $('insHydroSub').textContent = 'ระดับน้ำเต็ม 100% สภาพคล่องยอดเยี่ยม';
      $('insHydroBadge').textContent = '100% เต็มถัง';
      $('insHydroBadge').className = 'text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700';
    } else if (pct >= 50) {
      $('insHydroStatus').textContent = 'ผ่านครึ่งทางแล้ว 🌊';
      $('insHydroSub').textContent = 'เหลืออีก ' + (t.count - t.paidCount) + ' บิล (' + fmt(t.unpaid) + ' ฿)';
      $('insHydroBadge').textContent = 'กำลังไหลลื่น';
      $('insHydroBadge').className = 'text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700';
    } else {
      $('insHydroStatus').textContent = 'รอชำระอีก ' + (t.count - t.paidCount) + ' บิล 💧';
      $('insHydroSub').textContent = 'ยอดค้างชำระรวม ' + fmt(t.unpaid) + ' บาท';
      $('insHydroBadge').textContent = 'เริ่มต้นเดือน';
      $('insHydroBadge').className = 'text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700';
    }

    // 3. Category Breakdown Data
    var billMap = {};
    (state.bills || []).forEach(function (b) { billMap[b.id] = b; });
    var catTotals = {};
    rows.forEach(function (r) {
      var cat = inferCategory(r, billMap);
      if (!catTotals[cat]) catTotals[cat] = { name: cat, total: 0, paid: 0, count: 0 };
      var amt = +r.amount || 0;
      catTotals[cat].total += amt;
      catTotals[cat].count += 1;
      if (r.paid) catTotals[cat].paid += amt;
    });
    var catList = Object.keys(catTotals).map(function (k) { return catTotals[k]; }).sort(function (a, b) {
      return b.total - a.total;
    });

    if ($('catTotalBadge')) $('catTotalBadge').textContent = catList.length + ' หมวดหมู่';
    if ($('categoryBreakdownList')) {
      if (!catList.length) {
        $('categoryBreakdownList').innerHTML = '<div class="text-xs text-slate-400 py-6 text-center">ยังไม่มีข้อมูลหมวดหมู่ในเดือนนี้</div>';
      } else {
        $('categoryBreakdownList').innerHTML = catList.map(function (c) {
          var meta = CAT_PALETTE[c.name] || CAT_PALETTE['อื่นๆ'];
          var share = t.total > 0 ? Math.round((c.total / t.total) * 100) : 0;
          return '<div class="cat-stat-row">' +
            '<div class="flex items-center gap-2 min-w-0">' +
              '<span class="cat-dot" style="background:' + meta.color + '"></span>' +
              '<div class="min-w-0">' +
                '<div class="text-xs font-extrabold text-slate-800 truncate">' + esc(meta.icon + ' ' + c.name) + ' <span class="text-[11px] font-semibold text-slate-400">(' + c.count + ')</span></div>' +
                '<div class="text-[11px] text-slate-400">สัดส่วน ' + share + '% ของเดือน</div>' +
              '</div>' +
            '</div>' +
            '<div class="text-right shrink-0">' +
              '<div class="text-xs font-extrabold text-slate-900 tabular-nums">' + esc(fmt(c.total)) + ' ฿</div>' +
            '</div>' +
          '</div>';
        }).join('');
      }
    }

    // 4. Smart Due-Date Timeline
    renderDueTimeline(rows, billMap);

    // 5. Render Chart.js Visuals (if Chart.js is loaded)
    if (typeof Chart !== 'undefined') {
      renderTrendChart(t);
      renderCategoryChart(catList);
      renderTopBillsChart(sortedByAmt.slice(0, 6));
    }
  }

  function renderDueTimeline(rows, billMap) {
    var box = $('dueTimelineTrack');
    if (!box) return;
    if (!rows || !rows.length) {
      box.innerHTML = '<div class="text-xs text-slate-400 py-4 text-center col-span-full">เดือนนี้ยังไม่มีรายการบิลสำหรับสร้างไทม์ไลน์</div>';
      return;
    }
    var groups = {};
    rows.forEach(function (r) {
      var dayNum = 1;
      if (r.due_date && String(r.due_date).length >= 10) {
        dayNum = parseInt(String(r.due_date).slice(8, 10), 10) || 1;
      } else if (billMap[r.bill_id] && billMap[r.bill_id].due_day) {
        dayNum = parseInt(billMap[r.bill_id].due_day, 10) || 1;
      }
      if (!groups[dayNum]) groups[dayNum] = [];
      groups[dayNum].push(r);
    });
    var days = Object.keys(groups).map(function (d) { return parseInt(d, 10); }).sort(function (a, b) { return a - b; });
    var locked = isLocked();

    box.innerHTML = days.map(function (day) {
      var items = groups[day];
      var dayTotal = 0;
      var allPaid = true;
      items.forEach(function (it) {
        dayTotal += (+it.amount || 0);
        if (!it.paid) allPaid = false;
      });
      return '<div class="timeline-node ' + (allPaid ? 'all-paid' : 'has-unpaid') + '">' +
        '<div class="flex items-center justify-between gap-1 mb-2 pb-1.5 border-b border-sky-100">' +
          '<span class="text-xs font-extrabold text-sky-800 bg-sky-100/80 px-2.5 py-0.5 rounded-full">📅 วันที่ ' + day + '</span>' +
          '<span class="text-xs font-extrabold tabular-nums ' + (allPaid ? 'text-emerald-600' : 'text-slate-700') + '">' + esc(fmt(dayTotal)) + ' ฿</span>' +
        '</div>' +
        '<div class="space-y-1.5">' +
          items.map(function (it) {
            return '<button type="button" data-tl-toggle="' + esc(it.bill_id) + '" data-tl-paid="' + (it.paid ? '1' : '0') + '" ' + (locked ? 'disabled' : '') + ' class="w-full text-left flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg text-xs transition ' +
              (it.paid ? 'bg-emerald-50/90 text-emerald-800 hover:bg-emerald-100' : 'bg-white hover:bg-sky-50 text-slate-800 border border-sky-100') + '">' +
              '<span class="truncate font-semibold">' + (it.paid ? '✅ ' : '⬜ ') + esc(it.bill_name) + '</span>' +
              '<span class="tabular-nums font-bold shrink-0">' + esc(fmt(it.amount)) + '</span>' +
            '</button>';
          }).join('') +
        '</div>' +
      '</div>';
    }).join('');

    box.querySelectorAll('[data-tl-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var bId = btn.getAttribute('data-tl-toggle');
        var curPaid = btn.getAttribute('data-tl-paid') === '1';
        onTogglePaid(bId, !curPaid);
      });
    });
  }

  function renderTrendChart(curTotals) {
    var canvas = $('monthlyTrendChart');
    if (!canvas) return;

    // Combine state.history with current state.month live totals
    var map = {};
    (state.history || []).forEach(function (h) {
      map[h.month] = {
        month: h.month,
        total: +h.total || 0,
        paid: +h.paid || 0,
        unpaid: Math.max(0, (+h.total || 0) - (+h.paid || 0))
      };
    });
    map[state.month] = {
      month: state.month,
      total: curTotals.total,
      paid: curTotals.paid,
      unpaid: curTotals.unpaid
    };

    var months = Object.keys(map).sort().slice(-8);
    var labels = months.map(function (m) {
      return monthShort(m) + (m === state.month ? ' ★' : '');
    });
    var paidData = months.map(function (m) { return map[m].paid; });
    var unpaidData = months.map(function (m) { return map[m].unpaid; });
    var totalData = months.map(function (m) { return map[m].total; });

    if (trendChartInst) {
      trendChartInst.destroy();
      trendChartInst = null;
    }

    var isLine = trendChartMode === 'line';
    trendChartInst = new Chart(canvas.getContext('2d'), {
      type: isLine ? 'line' : 'bar',
      data: isLine ? {
        labels: labels,
        datasets: [
          {
            label: 'ยอดรวมทั้งเดือน (บาท)',
            data: totalData,
            borderColor: '#1E78FF',
            backgroundColor: 'rgba(28, 200, 248, 0.22)',
            borderWidth: 3,
            fill: true,
            tension: 0.38,
            pointRadius: 5,
            pointBackgroundColor: '#FFFFFF',
            pointBorderColor: '#1E78FF',
            pointBorderWidth: 2.5
          },
          {
            label: 'จ่ายแล้ว (บาท)',
            data: paidData,
            borderColor: '#10B981',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.38,
            pointRadius: 4,
            pointBackgroundColor: '#10B981'
          }
        ]
      } : {
        labels: labels,
        datasets: [
          {
            label: 'จ่ายแล้ว (บาท)',
            data: paidData,
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderColor: '#10B981',
            borderWidth: 1,
            borderRadius: 8,
            stack: 'stack0'
          },
          {
            label: 'ยังค้างชำระ (บาท)',
            data: unpaidData,
            backgroundColor: 'rgba(244, 63, 94, 0.82)',
            borderColor: '#F43F5E',
            borderWidth: 1,
            borderRadius: 8,
            stack: 'stack0'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              usePointStyle: true,
              boxWidth: 8,
              font: { family: "'Plus Jakarta Sans', 'Prompt', sans-serif", size: 12, weight: '600' }
            }
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ' ' + ctx.dataset.label + ': ' + fmt(ctx.parsed.y) + ' บาท';
              }
            }
          }
        },
        scales: {
          x: {
            stacked: !isLine,
            grid: { display: false },
            ticks: { font: { family: "'Plus Jakarta Sans', 'Prompt', sans-serif", weight: '700' } }
          },
          y: {
            stacked: !isLine,
            beginAtZero: true,
            grid: { color: 'rgba(196, 226, 255, 0.45)' },
            ticks: {
              callback: function (v) { return fmtInt(v); },
              font: { family: "'Plus Jakarta Sans', 'Prompt', sans-serif" }
            }
          }
        }
      }
    });
  }

  function renderCategoryChart(catList) {
    var canvas = $('categoryDoughnutChart');
    if (!canvas) return;
    if (catChartInst) {
      catChartInst.destroy();
      catChartInst = null;
    }
    var hasData = catList && catList.length > 0 && catList.some(function (c) { return c.total > 0; });
    var labels = hasData ? catList.map(function (c) { return c.name; }) : ['ไม่มีข้อมูล'];
    var data = hasData ? catList.map(function (c) { return c.total; }) : [1];
    var colors = hasData ? catList.map(function (c) {
      return (CAT_PALETTE[c.name] || CAT_PALETTE['อื่นๆ']).color;
    }) : ['#E2E8F0'];

    catChartInst = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors,
          borderColor: '#FFFFFF',
          borderWidth: 3,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '66%',
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: hasData,
            callbacks: {
              label: function (ctx) {
                return ' ' + ctx.label + ': ' + fmt(ctx.parsed) + ' บาท';
              }
            }
          }
        }
      }
    });
  }

  function renderTopBillsChart(topRows) {
    var canvas = $('topBillsBarChart');
    if (!canvas) return;
    if (topBarChartInst) {
      topBarChartInst.destroy();
      topBarChartInst = null;
    }
    var labels = topRows.map(function (r) {
      return (r.paid ? '✅ ' : '⏳ ') + r.bill_name;
    });
    var values = topRows.map(function (r) { return +r.amount || 0; });
    var bgColors = topRows.map(function (r) {
      return r.paid ? 'rgba(16, 185, 129, 0.85)' : 'rgba(30, 120, 255, 0.85)';
    });

    topBarChartInst = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'จำนวนเงิน (บาท)',
          data: values,
          backgroundColor: bgColors,
          borderRadius: 8,
          barThickness: 18
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ' ยอดบิล: ' + fmt(ctx.parsed.x) + ' บาท';
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: 'rgba(196, 226, 255, 0.45)' },
            ticks: {
              callback: function (v) { return fmtInt(v); },
              font: { family: "'Plus Jakarta Sans', 'Prompt', sans-serif", size: 11 }
            }
          },
          y: {
            grid: { display: false },
            ticks: {
              font: { family: "'Plus Jakarta Sans', 'Prompt', sans-serif", size: 12, weight: '700' }
            }
          }
        }
      }
    });
  }

  /* ---------- ลอกเดือนที่แล้ว (แบบ ก.) ---------- */
  function prevMonthName() {
    var best = '';
    state.history.forEach(function (d) { if (d.month < state.month && d.month > best) best = d.month; });
    return best;
  }
  function openCopy() {
    var src = prevMonthName();
    var cur = state.ledger.length;
    if (!src) {
      $('copyDesc').innerHTML = 'ยังไม่มีเดือนก่อนหน้า ระบบจะตั้งบิลเดือน <b>' + esc(monthLabel(state.month)) + '</b> จากรายการหลัก (แม่แบบ)' +
        (cur > 0 ? '<br>• แถวที่มีอยู่แล้ว (' + cur + ' รายการ) จะไม่ถูกทับ' : '');
      openModal('copyModal');
      return;
    }
    var srcRows = state.cacheLedger[src];
    function showModalWithCount(count, total) {
      $('copyDesc').innerHTML = 'จะลอก <b>' + esc(monthLabel(src)) + '</b> มา <b>' + esc(monthLabel(state.month)) + '</b><br>' +
        '• ' + count + ' รายการ พร้อมยอดเดิมรวม ' + fmt(total) + ' บาท<br>' +
        '• ติ๊กจ่าย reset ใหม่หมด (ต้องติ๊กเอง)<br>' +
        (cur > 0 ? '• แถวที่มีอยู่แล้ว (' + cur + ' รายการ) จะไม่ถูกทับ<br>' : '');
      openModal('copyModal');
    }
    if (srcRows) {
      var tt = Dashboard.totals(srcRows);
      showModalWithCount(srcRows.length, tt.total);
    } else {
      Api.getLedger(src).then(function (res) {
        var rows = res.ok ? res.rows : [];
        state.cacheLedger[src] = rows;
        var tt2 = Dashboard.totals(rows);
        showModalWithCount(rows.length, tt2.total);
      });
    }
  }
  function doCopy() {
    closeModal('copyModal');
    Api.copyPrevMonth(state.month).then(function (res) {
      if (!res.ok) return toast('ลอกไม่ได้: ' + res.error, true);
      var r = res.result || {};
      toast(r.sourceMonth ? 'ลอก ' + monthShort(r.sourceMonth) + ' มา +' + (r.added || 0) + ' รายการ ✓' : 'ตั้งจากรายการหลัก +' + (res.added || r.added || 0) + ' ✓');
      load();
    }).catch(function (e) { toast('ลอกไม่ได้: ' + e.message, true); });
  }

  /* ---------- เพิ่ม / แก้ชื่อ / ลบแถว ---------- */
  var renameTarget = null;
  function openRename(billId) {
    var row = state.ledger.find(function (r) { return r.bill_id === billId; });
    if (!row) return;
    renameTarget = row;
    $('renameOld').textContent = row.bill_name;
    $('renameName').value = row.bill_name;
    $('renameApplyAll').checked = true;
    openModal('renameModal');
    setTimeout(function () { $('renameName').focus(); $('renameName').select(); }, 50);
  }

  function onDeleteRow(billId) {
    var row = state.ledger.find(function (r) { return r.bill_id === billId; });
    var name = row ? row.bill_name : billId;
    askConfirm(
      'ลบรายการออกจากเดือนนี้?',
      'ลบ “' + name + '” ออกจาก ' + monthLabel(state.month) + ' เท่านั้น?\n\n• เดือนก่อนไม่หาย\n• รายการหลักยังอยู่ (เดือนหน้าลอกได้เหมือนเดิม)',
      function () {
        Api.deleteLedgerRow(state.month, billId).then(function (res) {
          if (!res.ok) return toast('ลบไม่ได้: ' + res.error, true);
          toast('ลบออกจากเดือนนี้แล้ว ✓');
          load();
        });
      }
    );
  }

  var templateEditTargetId = null;
  function onEditTemplate(id) {
    var b = state.bills.find(function (x) { return x.id === id; });
    if (!b) return;
    templateEditTargetId = b.id;
    $('templateEditName').value = b.name;
    openModal('templateEditModal');
    setTimeout(function () { $('templateEditName').focus(); $('templateEditName').select(); }, 50);
  }

  /* ---------- init ---------- */
  function init() {
    $('prevMonth').addEventListener('click', function () { state.month = shiftMonth(state.month, -1); load(); });
    $('nextMonth').addEventListener('click', function () { state.month = shiftMonth(state.month, 1); load(); });
    $('todayBtn').addEventListener('click', function () { state.month = currentMonth(); load(); });

    // View Switcher Tabs (All / Dashboard / Table)
    document.querySelectorAll('[data-view-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = btn.getAttribute('data-view-mode');
        document.querySelectorAll('[data-view-mode]').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        var dashSec = $('wowDashboardSection');
        var workSec = $('mainWorkspaceGrid');
        if (mode === 'dashboard') {
          dashSec.classList.remove('hidden');
          workSec.classList.add('hidden');
        } else if (mode === 'table') {
          dashSec.classList.add('hidden');
          workSec.classList.remove('hidden');
        } else {
          dashSec.classList.remove('hidden');
          workSec.classList.remove('hidden');
        }
        renderWowDashboard();
      });
    });

    // Trend Chart Mode Toggle (Bar vs Wave Line)
    if ($('trendModeBar') && $('trendModeLine')) {
      $('trendModeBar').addEventListener('click', function () {
        trendChartMode = 'bar';
        $('trendModeBar').className = 'px-2.5 py-1 text-xs font-bold rounded-lg bg-white text-sky-700 shadow-sm transition';
        $('trendModeLine').className = 'px-2.5 py-1 text-xs font-bold rounded-lg text-slate-600 hover:text-sky-700 transition';
        renderWowDashboard();
      });
      $('trendModeLine').addEventListener('click', function () {
        trendChartMode = 'line';
        $('trendModeLine').className = 'px-2.5 py-1 text-xs font-bold rounded-lg bg-white text-sky-700 shadow-sm transition';
        $('trendModeBar').className = 'px-2.5 py-1 text-xs font-bold rounded-lg text-slate-600 hover:text-sky-700 transition';
        renderWowDashboard();
      });
    }

    $('copyPrevBtn').addEventListener('click', openCopy);
    $('emptyCopyBtn').addEventListener('click', openCopy);
    $('copyConfirmBtn').addEventListener('click', doCopy);

    $('confirmActionOkBtn').addEventListener('click', function () {
      var fn = pendingConfirmFn;
      pendingConfirmFn = null;
      closeModal('confirmActionModal');
      if (fn) fn();
    });

    $('unlockPastBtn').addEventListener('click', function () {
      if (isLocked()) { state.unlockedPast[state.month] = true; toast('ปลดล็อกแล้ว แก้ได้เลย 🔓'); }
      else { delete state.unlockedPast[state.month]; toast('ล็อกกลับแล้ว 🔒'); }
      render();
    });

    $('addBillBtn').addEventListener('click', function () {
      if (isLocked()) return toast('เดือนก่อนถูกล็อกอยู่ กดปลดล็อกก่อน', true);
      $('addMonthLabel').textContent = monthLabel(state.month);
      $('addName').value = ''; $('addAmount').value = '0';
      openModal('addModal');
      setTimeout(function () { $('addName').focus(); }, 50);
    });
    $('addConfirmBtn').addEventListener('click', function () {
      var name = $('addName').value.trim();
      var amount = parseAmount($('addAmount').value);
      if (!name) return toast('ใส่ชื่อก่อน', true);
      Api.addBillToMonth(state.month, name, amount).then(function (res) {
        if (!res.ok) return toast('เพิ่มไม่ได้: ' + res.error, true);
        closeModal('addModal');
        toast('เพิ่มแล้ว ✓ (จำในรายการหลักให้ด้วย)');
        load();
      });
    });

    $('renameConfirmBtn').addEventListener('click', function () {
      if (!renameTarget) return;
      var name = $('renameName').value.trim();
      if (!name) return toast('ชื่อว่างไม่ได้', true);
      var applyAll = $('renameApplyAll').checked;
      Api.upsertLedger({ month: state.month, bill_id: renameTarget.bill_id, bill_name: name }).then(function (res) {
        if (!res.ok) return toast('แก้ไม่ได้: ' + res.error, true);
        if (applyAll) {
          Api.upsertBill({ id: renameTarget.bill_id, name: name }).then(function () {
            closeModal('renameModal'); toast('แก้ชื่อแล้ว ✓'); load();
          });
        } else { closeModal('renameModal'); toast('แก้ชื่อเฉพาะเดือนนี้แล้ว ✓'); load(); }
      });
    });

    $('templateEditConfirmBtn').addEventListener('click', function () {
      if (!templateEditTargetId) return;
      var name = $('templateEditName').value.trim();
      if (!name) return toast('ชื่อว่างไม่ได้', true);
      var id = templateEditTargetId;
      templateEditTargetId = null;
      closeModal('templateEditModal');
      Api.upsertBill({ id: id, name: name }).then(afterOk('แก้ชื่อแล้ว ✓'));
    });

    function quickAddTemplate() {
      var name = $('tName').value.trim();
      if (!name) return toast('ใส่ชื่อก่อน', true);
      Api.upsertBill({ name: name }).then(function (res) {
        if (!res.ok) return toast('เพิ่มไม่ได้: ' + res.error, true);
        $('tName').value = '';
        toast('เพิ่มในรายการหลักแล้ว ✓ (เดือนหน้าจะลอกไป)');
        load();
      });
    }
    $('tAddBtn').addEventListener('click', quickAddTemplate);
    $('tName').addEventListener('keydown', function (e) { if (e.key === 'Enter') quickAddTemplate(); });

    document.querySelectorAll('[data-close]').forEach(function (btn) {
      btn.addEventListener('click', function () { closeModal(btn.getAttribute('data-close')); });
    });
    document.querySelectorAll('.modal').forEach(function (m) {
      m.addEventListener('click', function (e) { if (e.target === m) m.classList.add('hidden'); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') document.querySelectorAll('.modal').forEach(function (m) { m.classList.add('hidden'); });
      if (e.key === 'Enter' && !$('addModal').classList.contains('hidden')) $('addConfirmBtn').click();
    });

    $('settingsBtn').addEventListener('click', function () {
      var s = getSettings();
      $('sUrl').value = s.url; $('sKey').value = s.key;
      $('connResult').classList.add('hidden');
      openModal('settingsModal');
    });
    $('saveSettingsBtn').addEventListener('click', function () {
      saveSettings($('sUrl').value, $('sKey').value);
      Api.clearFallback();
      closeModal('settingsModal');
      toast('บันทึกแล้ว ✓');
      load();
    });
    $('testConnBtn').addEventListener('click', function () {
      saveSettings($('sUrl').value, $('sKey').value);
      Api.clearFallback();
      var box = $('connResult');
      box.classList.remove('hidden');
      box.className = 'text-sm rounded-xl px-3.5 py-2.5 mb-3 bg-slate-100 text-slate-700';
      box.textContent = 'กำลังทดสอบ...';
      Api.ping().then(function (res) {
        if (res && res.ok) { box.className = 'text-sm rounded-xl px-3.5 py-2.5 mb-3 bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold'; box.textContent = 'ต่อได้ ✓ ' + (res.time || ''); setConn('ok'); }
        else { box.className = 'text-sm rounded-xl px-3.5 py-2.5 mb-3 bg-rose-50 border border-rose-200 text-rose-700 font-semibold'; box.textContent = 'ต่อไม่ได้: ' + ((res && res.error) || 'unknown'); setConn('err'); }
      }).catch(function (e) {
        box.className = 'text-sm rounded-xl px-3.5 py-2.5 mb-3 bg-rose-50 border border-rose-200 text-rose-700 font-semibold';
        box.textContent = 'ต่อไม่ได้: ' + e.message; setConn('err');
      });
    });
    $('resetDemoBtn').addEventListener('click', function () {
      closeModal('settingsModal');
      askConfirm(
        'รีเซ็ตข้อมูลทดลอง?',
        'รีเซ็ตข้อมูลทดลองในเครื่องนี้กลับเป็นค่าเริ่มต้นใหม่ทั้งหมด?',
        function () {
          LocalStore.reset();
          state.month = currentMonth();
          toast('รีเซ็ตแล้ว ✓');
          load();
        }
      );
    });

    load();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
