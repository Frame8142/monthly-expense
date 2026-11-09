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
    if ($('railActiveMonthTitle')) {
      $('railActiveMonthTitle').textContent = monthLabel(state.month);
    }
    if ($('railActiveMonthSub')) {
      $('railActiveMonthSub').textContent = t.unpaid > 0 ? ('ค้างชำระ ' + fmt(t.unpaid) + ' ฿') : (t.count > 0 ? 'ชำระครบทุกบิล ✅' : 'ยังไม่มีรายการบิล');
    }
    if ($('railPaidBadge')) {
      $('railPaidBadge').textContent = 'จ่ายแล้ว ' + pct + '%';
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

    // Payment Progress Status
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
  var LS_PIN_KEY = 'me_hydro_pin';
  var pinBuffer = '';
  var isPinAuthenticated = false;

  function getSavedPin() {
    var p = safeGetLS(LS_PIN_KEY);
    return (p && /^\d{4}$/.test(p)) ? p : '1234';
  }

  function updatePinHintVisibility() {
    var isDefault = getSavedPin() === '1234';
    if ($('pinDefaultHintBox')) {
      $('pinDefaultHintBox').classList.toggle('hidden', !isDefault);
    }
  }

  function renderPinDots(isError) {
    var dots = document.querySelectorAll('#pinDotsRow .pin-dot');
    dots.forEach(function (d, idx) {
      d.classList.toggle('filled', idx < pinBuffer.length && !isError);
      d.classList.toggle('error', !!isError);
    });
  }

  function lockWithPin(msg) {
    isPinAuthenticated = false;
    pinBuffer = '';
    renderPinDots(false);
    if ($('pinErrorMsg')) $('pinErrorMsg').textContent = msg || '';
    updatePinHintVisibility();
    if ($('pinLockOverlay')) $('pinLockOverlay').classList.remove('hidden');
    if ($('pinSessionBadge')) {
      $('pinSessionBadge').textContent = '🔒 รอใส่ PIN';
      $('pinSessionBadge').className = 'text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30';
    }
    if ($('authToggleBtnText')) $('authToggleBtnText').textContent = 'เข้าสู่ระบบ';
  }

  function unlockWithPin() {
    isPinAuthenticated = true;
    pinBuffer = '';
    renderPinDots(false);
    if ($('pinErrorMsg')) $('pinErrorMsg').textContent = '';
    if ($('pinLockOverlay')) $('pinLockOverlay').classList.add('hidden');
    if ($('pinSessionBadge')) {
      $('pinSessionBadge').textContent = '🔓 เข้าสู่ระบบแล้ว';
      $('pinSessionBadge').className = 'text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30';
    }
    if ($('authToggleBtnText')) $('authToggleBtnText').textContent = 'ออกจากระบบ';
    toast('ยืนยันรหัส PIN เข้าสู่ระบบสำเร็จ 🔓');
  }

  function handlePinDigit(digit) {
    if (pinBuffer.length >= 4) return;
    pinBuffer += String(digit);
    if ($('pinErrorMsg')) $('pinErrorMsg').textContent = '';
    renderPinDots(false);

    if (pinBuffer.length === 4) {
      var targetPin = getSavedPin();
      if (pinBuffer === targetPin) {
        setTimeout(function () { unlockWithPin(); }, 120);
      } else {
        renderPinDots(true);
        if ($('pinErrorMsg')) $('pinErrorMsg').textContent = 'รหัส PIN ไม่ถูกต้อง กรุณาลองอีกครั้ง';
        var card = $('pinVaultCard');
        if (card) {
          card.classList.remove('pin-shake');
          void card.offsetWidth;
          card.classList.add('pin-shake');
        }
        setTimeout(function () {
          pinBuffer = '';
          renderPinDots(false);
        }, 480);
      }
    }
  }

  function init() {
    $('prevMonth').addEventListener('click', function () { state.month = shiftMonth(state.month, -1); load(); });
    $('nextMonth').addEventListener('click', function () { state.month = shiftMonth(state.month, 1); load(); });
    $('todayBtn').addEventListener('click', function () { state.month = currentMonth(); load(); });

    if ($('railPrevMonthBtn')) {
      $('railPrevMonthBtn').addEventListener('click', function () { state.month = shiftMonth(state.month, -1); load(); });
    }
    if ($('railNextMonthBtn')) {
      $('railNextMonthBtn').addEventListener('click', function () { state.month = shiftMonth(state.month, 1); load(); });
    }
    if ($('railAddBillBtn')) {
      $('railAddBillBtn').addEventListener('click', function () { $('addBillBtn').click(); });
    }
    if ($('railCopyPrevBtn')) {
      $('railCopyPrevBtn').addEventListener('click', function () { openCopy(); });
    }
    if ($('railJumpHistoryBtn')) {
      $('railJumpHistoryBtn').addEventListener('click', function () {
        var dashSec = $('wowDashboardSection');
        var workSec = $('mainWorkspaceGrid');
        dashSec.classList.remove('hidden');
        workSec.classList.remove('hidden');
        document.querySelectorAll('[data-view-mode]').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-view-mode') === 'all');
        });
        var histEl = $('historyList');
        if (histEl) histEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    // PIN Keypad & Auth Events
    document.querySelectorAll('[data-pin-digit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        handlePinDigit(btn.getAttribute('data-pin-digit'));
      });
    });
    if ($('pinClearBtn')) {
      $('pinClearBtn').addEventListener('click', function () {
        pinBuffer = '';
        if ($('pinErrorMsg')) $('pinErrorMsg').textContent = '';
        renderPinDots(false);
      });
    }
    if ($('pinBackspaceBtn')) {
      $('pinBackspaceBtn').addEventListener('click', function () {
        pinBuffer = pinBuffer.slice(0, -1);
        if ($('pinErrorMsg')) $('pinErrorMsg').textContent = '';
        renderPinDots(false);
      });
    }
    if ($('pinQuickUnlockBtn')) {
      $('pinQuickUnlockBtn').addEventListener('click', function () {
        pinBuffer = '123';
        handlePinDigit('4');
      });
    }
    if ($('logoutPinBtn')) {
      $('logoutPinBtn').addEventListener('click', function () {
        lockWithPin('ออกจากระบบแล้ว กรุณาใส่รหัส PIN เพื่อเข้าใช้งาน');
        toast('ออกจากระบบและล็อกหน้าจอแล้ว 🔒');
      });
    }
    if ($('openPinSetupBtn')) {
      $('openPinSetupBtn').addEventListener('click', function () {
        $('oldPinInput').value = '';
        $('newPinInput').value = '';
        openModal('pinSetupModal');
        setTimeout(function () { $('oldPinInput').focus(); }, 50);
      });
    }
    if ($('savePinSetupBtn')) {
      $('savePinSetupBtn').addEventListener('click', function () {
        var oldP = $('oldPinInput').value.trim();
        var newP = $('newPinInput').value.trim();
        if (oldP !== getSavedPin()) {
          return toast('รหัส PIN ปัจจุบันไม่ถูกต้อง', true);
        }
        if (!/^\d{4}$/.test(newP)) {
          return toast('กรุณาตั้งรหัส PIN ใหม่เป็นตัวเลข 4 หลัก', true);
        }
        safeSetLS(LS_PIN_KEY, newP);
        updatePinHintVisibility();
        closeModal('pinSetupModal');
        toast('เปลี่ยนรหัส PIN เรียบร้อยแล้ว 🔐');
      });
    }

    // Keyboard support for PIN Lock Overlay
    document.addEventListener('keydown', function (e) {
      var overlay = $('pinLockOverlay');
      if (overlay && !overlay.classList.contains('hidden')) {
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          handlePinDigit(e.key);
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          pinBuffer = pinBuffer.slice(0, -1);
          renderPinDots(false);
        } else if (e.key === 'Escape') {
          pinBuffer = '';
          renderPinDots(false);
        }
      }
    });

    // View Switcher Tabs (All / Dashboard / Table) — syncs both top switcher & right rail menu
    document.querySelectorAll('[data-view-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = btn.getAttribute('data-view-mode');
        document.querySelectorAll('[data-view-mode]').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-view-mode') === mode);
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

    // ===== Interactive 360° Color Wheel & 3D Theme Studio Engine =====
    var LS_THEME_KEY = 'me_hydro_color_wheel_v1';
    var themeConfig = {
      hue: 214,
      sat: 95,
      light: 54,
      harmony: 'analogous', // 'analogous' | 'triadic' | 'complementary' | 'split'
      depth3d: 1.0,
      atmosphere: 'light'   // 'light' | 'dark'
    };

    try {
      var savedThemeRaw = safeGetLS(LS_THEME_KEY);
      if (savedThemeRaw) {
        var parsedTheme = JSON.parse(savedThemeRaw);
        if (parsedTheme && typeof parsedTheme.hue === 'number') {
          themeConfig = Object.assign(themeConfig, parsedTheme);
        }
      }
    } catch (e) {}

    function hslToHex(h, s, l) {
      h = ((h % 360) + 360) % 360;
      s = Math.max(0, Math.min(100, s)) / 100;
      l = Math.max(0, Math.min(100, l)) / 100;
      var c = (1 - Math.abs(2 * l - 1)) * s;
      var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      var m = l - c / 2;
      var r = 0, g = 0, b = 0;
      if (0 <= h && h < 60) { r = c; g = x; b = 0; }
      else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
      else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
      else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
      else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
      else { r = c; g = 0; b = x; }
      var toHex = function (v) {
        var hx = Math.round((v + m) * 255).toString(16);
        return hx.length === 1 ? '0' + hx : hx;
      };
      return ('#' + toHex(r) + toHex(g) + toHex(b)).toUpperCase();
    }

    function computeHarmonyHues(baseHue, mode) {
      var h1 = ((Math.round(baseHue) % 360) + 360) % 360;
      var h2 = (h1 - 24 + 360) % 360;
      var h3 = (h1 + 38) % 360;
      if (mode === 'triadic') {
        h2 = (h1 + 120) % 360;
        h3 = (h1 + 240) % 360;
      } else if (mode === 'complementary') {
        h2 = (h1 + 180) % 360;
        h3 = (h1 + 150) % 360;
      } else if (mode === 'split') {
        h2 = (h1 + 150) % 360;
        h3 = (h1 + 210) % 360;
      } else {
        // analogous
        h2 = (h1 - 26 + 360) % 360;
        h3 = (h1 + 32) % 360;
      }
      return { primary: h1, secondary: h2, tertiary: h3 };
    }

    function applyThemeStudio(saveToStorage) {
      var hues = computeHarmonyHues(themeConfig.hue, themeConfig.harmony);
      var priHex = hslToHex(hues.primary, themeConfig.sat, themeConfig.light);
      var secHex = hslToHex(hues.secondary, Math.min(100, themeConfig.sat + 2), Math.min(64, themeConfig.light + 4));
      var terHex = hslToHex(hues.tertiary, Math.max(70, themeConfig.sat - 5), Math.max(46, themeConfig.light - 2));

      var root = document.documentElement;
      root.style.setProperty('--primary-blue', priHex);
      root.style.setProperty('--primary-aqua', secHex);
      root.style.setProperty('--tertiary-accent', terHex);
      root.style.setProperty('--icon-3d-depth', String(themeConfig.depth3d));
      root.style.setProperty('--shadow-float', '0 14px 30px -6px hsla(' + hues.primary + ', ' + themeConfig.sat + '%, ' + themeConfig.light + '%, 0.42)');
      root.style.setProperty('--shadow-card', '0 18px 42px -14px hsla(' + hues.primary + ', 85%, 48%, 0.16), 0 4px 14px -4px rgba(12, 16, 32, 0.06)');

      if (themeConfig.atmosphere === 'dark') {
        document.body.classList.add('theme-midnight');
        root.style.setProperty('--bg-gradient',
          'radial-gradient(circle at 85% 12%, hsla(' + hues.secondary + ', 85%, 45%, 0.22) 0%, transparent 45%), ' +
          'radial-gradient(circle at 12% 88%, hsla(' + hues.primary + ', 85%, 45%, 0.22) 0%, transparent 45%), ' +
          'linear-gradient(160deg, #070B19 0%, #0D172A 50%, #091326 100%)'
        );
      } else {
        document.body.classList.remove('theme-midnight');
        root.style.setProperty('--bg-gradient',
          'linear-gradient(160deg, hsl(' + hues.primary + ', 88%, 93%) 0%, hsl(' + hues.secondary + ', 92%, 97%) 48%, hsl(' + hues.tertiary + ', 85%, 94%) 100%)'
        );
      }

      // Update UI Readouts in Theme Studio Modal & Right Rail Dock
      if ($('wheelAngleLabel')) $('wheelAngleLabel').textContent = 'Hue: ' + hues.primary + '°';
      if ($('railWheelHueBadge')) $('railWheelHueBadge').textContent = hues.primary + '°';
      var gradP = 'radial-gradient(circle at 30% 30%, #FFFFFF, ' + priHex + ' 65%, #09152E)';
      var gradS = 'radial-gradient(circle at 30% 30%, #FFFFFF, ' + secHex + ' 65%, #09152E)';
      var gradT = 'radial-gradient(circle at 30% 30%, #FFFFFF, ' + terHex + ' 65%, #09152E)';
      if ($('spherePrimary')) $('spherePrimary').style.background = gradP;
      if ($('sphereSecondary')) $('sphereSecondary').style.background = gradS;
      if ($('sphereTertiary')) $('sphereTertiary').style.background = gradT;
      if ($('railSphereP')) $('railSphereP').style.background = gradP;
      if ($('railSphereS')) $('railSphereS').style.background = gradS;
      if ($('railSphereT')) $('railSphereT').style.background = gradT;
      if ($('hexPrimaryLabel')) $('hexPrimaryLabel').textContent = priHex;
      if ($('hexSecondaryLabel')) $('hexSecondaryLabel').textContent = secHex;
      if ($('hexTertiaryLabel')) $('hexTertiaryLabel').textContent = terHex;

      if ($('satValLabel')) $('satValLabel').textContent = themeConfig.sat + '%';
      if ($('lightValLabel')) $('lightValLabel').textContent = themeConfig.light + '%';
      if ($('depth3dValLabel')) $('depth3dValLabel').textContent = Number(themeConfig.depth3d).toFixed(1) + 'x';

      if ($('themeSatSlider')) $('themeSatSlider').value = themeConfig.sat;
      if ($('themeLightSlider')) $('themeLightSlider').value = themeConfig.light;
      if ($('themeDepth3dSlider')) $('themeDepth3dSlider').value = themeConfig.depth3d;

      document.querySelectorAll('#harmonyModeGroup [data-harmony]').forEach(function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-harmony') === themeConfig.harmony);
      });

      drawColorWheelOnTarget($('colorWheelCanvas'), hues, priHex, secHex, terHex);
      drawColorWheelOnTarget($('railColorWheelCanvas'), hues, priHex, secHex, terHex);

      if (saveToStorage) {
        safeSetLS(LS_THEME_KEY, JSON.stringify(themeConfig));
      }
    }

    function drawColorWheelOnTarget(canvas, hues, priHex, secHex, terHex) {
      if (!canvas) return;
      var ctx = canvas.getContext('2d');
      var w = canvas.width, h = canvas.height;
      var scale = w / 248;
      var cx = w / 2, cy = h / 2;
      var outerR = 114 * scale;
      var midR = 76 * scale;
      var innerR = 54 * scale;

      ctx.clearRect(0, 0, w, h);

      // 1. Outer 12-segment classic Color Wheel Ring (like the reference image)
      for (var seg = 0; seg < 12; seg++) {
        var startDeg = seg * 30 - 105;
        var endDeg = startDeg + 30;
        var segHue = (seg * 30) % 360;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, (startDeg * Math.PI) / 180, (endDeg * Math.PI) / 180);
        ctx.arc(cx, cy, midR, (endDeg * Math.PI) / 180, (startDeg * Math.PI) / 180, true);
        ctx.closePath();
        ctx.fillStyle = 'hsl(' + segHue + ', ' + themeConfig.sat + '%, ' + themeConfig.light + '%)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
        ctx.lineWidth = 1.2 * scale;
        ctx.stroke();
      }

      // 2. Smooth continuous spectrum ring between midR and innerR
      for (var deg = 0; deg < 360; deg += 2) {
        var rad1 = ((deg - 90) * Math.PI) / 180;
        var rad2 = ((deg - 87.5) * Math.PI) / 180;
        ctx.beginPath();
        ctx.arc(cx, cy, midR - 2 * scale, rad1, rad2);
        ctx.arc(cx, cy, innerR, rad2, rad1, true);
        ctx.closePath();
        ctx.fillStyle = 'hsl(' + deg + ', ' + themeConfig.sat + '%, ' + themeConfig.light + '%)';
        ctx.fill();
      }

      // 3. Dark inner core circle
      ctx.beginPath();
      ctx.arc(cx, cy, innerR - 1 * scale, 0, Math.PI * 2);
      ctx.fillStyle = '#090D1A';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2 * scale;
      ctx.stroke();

      // 4. Inner Geometric Triangle / Harmony Polygon (Primary, Secondary, Tertiary)
      function ptOnRadius(angleDeg, radius) {
        var rad = ((angleDeg - 90) * Math.PI) / 180;
        return {
          x: cx + Math.cos(rad) * radius,
          y: cy + Math.sin(rad) * radius
        };
      }

      var pCore1 = ptOnRadius(hues.primary, innerR - 3 * scale);
      var pCore2 = ptOnRadius(hues.secondary, innerR - 3 * scale);
      var pCore3 = ptOnRadius(hues.tertiary, innerR - 3 * scale);

      var gradTri = ctx.createLinearGradient(pCore1.x, pCore1.y, pCore2.x, pCore2.y);
      gradTri.addColorStop(0, priHex);
      gradTri.addColorStop(0.5, secHex);
      gradTri.addColorStop(1, terHex);

      ctx.beginPath();
      ctx.moveTo(pCore1.x, pCore1.y);
      ctx.lineTo(pCore2.x, pCore2.y);
      ctx.lineTo(pCore3.x, pCore3.y);
      ctx.closePath();
      ctx.fillStyle = gradTri;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2 * scale;
      ctx.stroke();

      // 5. Draw 3D-style handles on the Wheel for Primary, Secondary, Tertiary
      var pWheel1 = ptOnRadius(hues.primary, (outerR + midR) / 2);
      var pWheel2 = ptOnRadius(hues.secondary, (midR + innerR) / 2);
      var pWheel3 = ptOnRadius(hues.tertiary, (midR + innerR) / 2);

      ctx.save();
      ctx.setLineDash([3 * scale, 3 * scale]);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.5 * scale;
      ctx.beginPath();
      ctx.moveTo(pCore1.x, pCore1.y); ctx.lineTo(pWheel1.x, pWheel1.y);
      ctx.moveTo(pCore2.x, pCore2.y); ctx.lineTo(pWheel2.x, pWheel2.y);
      ctx.moveTo(pCore3.x, pCore3.y); ctx.lineTo(pWheel3.x, pWheel3.y);
      ctx.stroke();
      ctx.restore();

      function drawNodeHandle(pt, fillHex, radius, label) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius * scale, 0, Math.PI * 2);
        ctx.fillStyle = fillHex;
        ctx.shadowColor = 'rgba(0,0,0,0.65)';
        ctx.shadowBlur = 8 * scale;
        ctx.shadowOffsetY = 3 * scale;
        ctx.fill();
        ctx.lineWidth = 2.6 * scale;
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.max(8, Math.round(10 * scale)) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, pt.x, pt.y);
        ctx.restore();
      }

      drawNodeHandle(pWheel3, terHex, 9, 'T');
      drawNodeHandle(pWheel2, secHex, 10, 'S');
      drawNodeHandle(pWheel1, priHex, 13, 'P');
    }

    // Wire up interactive dragging on both Color Wheel Canvases (Modal & Right Rail Dock)
    function bindWheelCanvasEvents(canvas) {
      if (!canvas) return;
      var dragging = false;

      function updateHueFromEvent(e) {
        var rect = canvas.getBoundingClientRect();
        var clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
        var clientY = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
        var dx = clientX - (rect.left + rect.width / 2);
        var dy = clientY - (rect.top + rect.height / 2);
        var angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
        themeConfig.hue = ((Math.round(angle) % 360) + 360) % 360;
        applyThemeStudio(true);
        renderWowDashboard();
      }

      canvas.addEventListener('mousedown', function (e) {
        dragging = true;
        updateHueFromEvent(e);
      });
      window.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        updateHueFromEvent(e);
      });
      window.addEventListener('mouseup', function () {
        dragging = false;
      });

      canvas.addEventListener('touchstart', function (e) {
        dragging = true;
        updateHueFromEvent(e);
      }, { passive: true });
      canvas.addEventListener('touchmove', function (e) {
        if (!dragging) return;
        updateHueFromEvent(e);
      }, { passive: true });
      window.addEventListener('touchend', function () {
        dragging = false;
      });
    }
    bindWheelCanvasEvents($('colorWheelCanvas'));
    bindWheelCanvasEvents($('railColorWheelCanvas'));

    if ($('openThemeStudioBtn')) {
      $('openThemeStudioBtn').addEventListener('click', function () {
        applyThemeStudio(false);
        openModal('themeStudioModal');
      });
    }
    if ($('openThemeFromSettingsBtn')) {
      $('openThemeFromSettingsBtn').addEventListener('click', function () {
        closeModal('settingsModal');
        applyThemeStudio(false);
        openModal('themeStudioModal');
      });
    }
    document.querySelectorAll('#harmonyModeGroup [data-harmony]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        themeConfig.harmony = btn.getAttribute('data-harmony');
        applyThemeStudio(true);
        renderWowDashboard();
      });
    });
    if ($('themeSatSlider')) {
      $('themeSatSlider').addEventListener('input', function (e) {
        themeConfig.sat = parseInt(e.target.value, 10) || 95;
        applyThemeStudio(true);
      });
    }
    if ($('themeLightSlider')) {
      $('themeLightSlider').addEventListener('input', function (e) {
        themeConfig.light = parseInt(e.target.value, 10) || 54;
        applyThemeStudio(true);
      });
    }
    if ($('themeDepth3dSlider')) {
      $('themeDepth3dSlider').addEventListener('input', function (e) {
        themeConfig.depth3d = parseFloat(e.target.value) || 1.0;
        applyThemeStudio(true);
      });
    }
    if ($('atmoLightBtn')) {
      $('atmoLightBtn').addEventListener('click', function () {
        themeConfig.atmosphere = 'light';
        applyThemeStudio(true);
      });
    }
    if ($('atmoDarkBtn')) {
      $('atmoDarkBtn').addEventListener('click', function () {
        themeConfig.atmosphere = 'dark';
        applyThemeStudio(true);
      });
    }
    if ($('resetThemeStudioBtn')) {
      $('resetThemeStudioBtn').addEventListener('click', function () {
        themeConfig = { hue: 214, sat: 95, light: 54, harmony: 'analogous', depth3d: 1.0, atmosphere: 'light' };
        applyThemeStudio(true);
        renderWowDashboard();
        toast('คืนค่าธีมเริ่มต้นเรียบร้อยแล้ว 🎨');
      });
    }

    // ===== Collapsible Left Sidebar & Accordion Sub-Menus + Custom 3D Vector Artwork Icons =====
    var leftSidebarEl = $('leftCommandSidebar');
    var expandLeftBtn = $('expandLeftSidebarBtn');
    var collapseLeftBtn = $('collapseLeftSidebarBtn');
    var toggleAllAccBtn = $('toggleAllSubMenusBtn');

    function setSidebarCollapsed(collapsed) {
      if (!leftSidebarEl) return;
      leftSidebarEl.classList.toggle('sidebar-collapsed', !!collapsed);
      if (expandLeftBtn) {
        expandLeftBtn.classList.toggle('hidden-trigger', !collapsed);
      }
      setTimeout(function () {
        renderWowDashboard();
      }, 320);
    }

    if (collapseLeftBtn) {
      collapseLeftBtn.addEventListener('click', function () {
        setSidebarCollapsed(true);
      });
    }
    if (expandLeftBtn) {
      expandLeftBtn.addEventListener('click', function () {
        setSidebarCollapsed(false);
      });
    }

    // Individual Accordion Sub-Menu Toggle (เริ่มต้นหุบไว้ทั้งหมด ไม่ต้องโชว์ทุกอย่างพร้อมกัน)
    document.querySelectorAll('[data-acc-trigger]').forEach(function (trigger) {
      trigger.addEventListener('click', function () {
        var item = trigger.closest('[data-acc-item]');
        if (!item) return;
        var willOpen = !item.classList.contains('open');
        item.classList.toggle('open', willOpen);
        if (willOpen) {
          applyThemeStudio(false);
        }
      });
    });

    if (toggleAllAccBtn) {
      toggleAllAccBtn.addEventListener('click', function () {
        var items = Array.prototype.slice.call(document.querySelectorAll('[data-acc-item]'));
        var anyOpen = items.some(function (it) { return it.classList.contains('open'); });
        items.forEach(function (it) {
          it.classList.toggle('open', !anyOpen);
        });
        if (!anyOpen) {
          applyThemeStudio(false);
        }
      });
    }

    // Custom 3D Vector SVG Icon Generator (สร้างรูปไอคอน 3D Vector ขึ้นมาเองแทนอีโมจิธรรมดา)
    var SVG_3D_LIBRARY = {
      '💧': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="gDrop" cx="32%" cy="28%" r="70%"><stop offset="0%" stop-color="#E0F2FE"/><stop offset="45%" stop-color="#38BDF8"/><stop offset="100%" stop-color="#0284C7"/></radialGradient></defs><path d="M18 3C18 3 7 15.6 7 23.2C7 29.2 11.9 34 18 34C24.1 34 29 29.2 29 23.2C29 15.6 18 3 18 3Z" fill="url(#gDrop)" stroke="#FFFFFF" stroke-width="1.5"/><ellipse cx="14" cy="19" rx="2.5" ry="5" transform="rotate(-20 14 19)" fill="white" fill-opacity="0.65"/></svg>',
      '🌊': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gWave" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#38BDF8"/><stop offset="100%" stop-color="#1D4ED8"/></linearGradient></defs><path d="M4 22C7.5 18 11.5 18 15 22C18.5 26 22.5 26 26 22C28.5 19.2 31 19 33 21V29C33 30.7 31.7 32 30 32H6C4.3 32 3 30.7 3 29V22H4Z" fill="url(#gWave)"/><path d="M5 14C8.5 10 12.5 10 16 14C19.5 18 23.5 18 27 14C29.2 11.5 31.2 11.5 33 13" stroke="#0EA5E9" stroke-width="3.2" stroke-linecap="round"/></svg>',
      '✅': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="gOk" cx="30%" cy="25%" r="75%"><stop offset="0%" stop-color="#6EE7B7"/><stop offset="100%" stop-color="#059669"/></radialGradient></defs><circle cx="18" cy="18" r="14" fill="url(#gOk)" stroke="#FFFFFF" stroke-width="1.5"/><path d="M11.5 18.5L15.8 22.8L24.8 13.5" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      '⏳': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gSand" x1="6" y1="4" x2="30" y2="32" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#FDA4AF"/><stop offset="100%" stop-color="#E11D48"/></linearGradient></defs><path d="M9 5H27M9 31H27M11 5C11 12 18 15 18 18C18 21 11 24 11 31H25C25 24 18 21 18 18C18 15 25 12 25 5H11Z" fill="url(#gSand)" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      '🔥': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="gFire" cx="50%" cy="70%" r="65%"><stop offset="0%" stop-color="#FEF08A"/><stop offset="45%" stop-color="#FB923C"/><stop offset="100%" stop-color="#E11D48"/></radialGradient></defs><path d="M19 3C19 3 28 10.5 28 20.5C28 27.5 23.2 33 17.5 33C11.8 33 7 27.8 7 21.5C7 16.5 10.5 12.5 10.5 12.5C10.5 12.5 11.5 16 14 16C12.5 11 19 3 19 3Z" fill="url(#gFire)" stroke="#FFFFFF" stroke-width="1.2"/></svg>',
      '⚖️': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 5V30M11 30H25M7 11H29" stroke="#6D28D9" stroke-width="2.8" stroke-linecap="round"/><path d="M7 11L3.5 20H10.5L7 11ZM29 11L25.5 20H32.5L29 11Z" fill="#A78BFA" stroke="#5B21B6" stroke-width="1.8" stroke-linejoin="round"/><circle cx="18" cy="8" r="3" fill="#C4B5FD"/></svg>',
      '📈': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 26L13.5 17.5L19.5 22.5L31 10" stroke="#059669" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M23 10H31V18" stroke="#10B981" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      '📊': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="18" width="6.5" height="13" rx="3" fill="#38BDF8"/><rect x="14.7" y="11" width="6.5" height="20" rx="3" fill="#2563EB"/><rect x="24.5" y="5" width="6.5" height="26" rx="3" fill="#10B981"/></svg>',
      '🍩': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="11" stroke="#8B5CF6" stroke-width="7"/><path d="M18 7A11 11 0 0 1 29 18" stroke="#38BDF8" stroke-width="7" stroke-linecap="round"/><path d="M29 18A11 11 0 0 1 18 29" stroke="#F43F5E" stroke-width="7" stroke-linecap="round"/></svg>',
      '🏆': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gCup" x1="8" y1="5" x2="28" y2="28" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#FDE047"/><stop offset="100%" stop-color="#D97706"/></linearGradient></defs><path d="M10 6H26V15C26 19.8 22.4 23.5 18 23.5C13.6 23.5 10 19.8 10 15V6Z" fill="url(#gCup)" stroke="#FFFFFF" stroke-width="1.4"/><path d="M14 30H22M18 23.5V30M10 9H6V13C6 15.5 7.8 17 10 17M26 9H30V13C30 15.5 28.2 17 26 17" stroke="#B45309" stroke-width="2.4" stroke-linecap="round"/></svg>',
      '🗓️': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="7" width="26" height="24" rx="5" fill="#EFF6FF" stroke="#2563EB" stroke-width="2.2"/><path d="M5 13H31" stroke="#2563EB" stroke-width="2.2"/><path d="M12 4V9M24 4V9" stroke="#1D4ED8" stroke-width="2.6" stroke-linecap="round"/><circle cx="13" cy="19" r="2" fill="#38BDF8"/><circle cx="18" cy="19" r="2" fill="#2563EB"/><circle cx="23" cy="19" r="2" fill="#10B981"/><circle cx="13" cy="25" r="2" fill="#F43F5E"/><circle cx="18" cy="25" r="2" fill="#38BDF8"/></svg>',
      '📅': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="7" width="26" height="24" rx="5" fill="#38BDF8" stroke="#FFFFFF" stroke-width="1.8"/><path d="M5 14H31" stroke="#FFFFFF" stroke-width="2"/><circle cx="18" cy="22" r="4" fill="#FFFFFF"/></svg>',
      '🗂️': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 10C4 7.8 5.8 6 8 6H14.5L17.5 9.5H28C30.2 9.5 32 11.3 32 13.5V26C32 28.2 30.2 30 28 30H8C5.8 30 4 28.2 4 26V10Z" fill="#38BDF8" stroke="#0284C7" stroke-width="1.8"/><rect x="8" y="15" width="20" height="11" rx="2.5" fill="#E0F2FE"/></svg>',
      '🧾': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 5H28V31L24.5 28.5L21 31L18 28.5L15 31L11.5 28.5L8 31V5Z" fill="#EDE9FE" stroke="#7C3AED" stroke-width="2"/><path d="M13 12H23M13 17H23M13 22H19" stroke="#7C3AED" stroke-width="2.4" stroke-linecap="round"/></svg>',
      '🧭': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="14" fill="#0EA5E9" stroke="#FFFFFF" stroke-width="1.8"/><polygon points="15,15 25,11 21,21 11,25" fill="#FFFFFF"/><circle cx="18" cy="18" r="2.2" fill="#0284C7"/></svg>',
      '⚡': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><polygon points="20,3 7,20 17,20 15,33 29,15 19,15" fill="#FACC15" stroke="#FFFFFF" stroke-width="1.6" stroke-linejoin="round"/></svg>',
      '🎨': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="14" fill="#1E293B" stroke="#FFFFFF" stroke-width="1.8"/><circle cx="13" cy="13" r="3.2" fill="#F43F5E"/><circle cx="22" cy="12" r="3.2" fill="#FACC15"/><circle cx="24" cy="20" r="3.2" fill="#10B981"/><circle cx="15" cy="23" r="3.2" fill="#38BDF8"/></svg>',
      '🔐': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="7" y="15" width="22" height="17" rx="5" fill="#38BDF8" stroke="#FFFFFF" stroke-width="1.8"/><path d="M12 15V11C12 7.7 14.7 5 18 5C21.3 5 24 7.7 24 11V15" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round"/><circle cx="18" cy="23.5" r="2.6" fill="#0F172A"/></svg>',
      '🚪': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="7" y="5" width="16" height="26" rx="3" fill="#FB7185" stroke="#FFFFFF" stroke-width="1.8"/><path d="M19 18H31M27 14L31 18L27 22" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      '⚙️': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="10" stroke="#E2E8F0" stroke-width="4" stroke-dasharray="4 3"/><circle cx="18" cy="18" r="5" fill="#38BDF8" stroke="#FFFFFF" stroke-width="1.8"/></svg>',
      '✨': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 4L21.5 14.5L32 18L21.5 21.5L18 32L14.5 21.5L4 18L14.5 14.5L18 4Z" fill="#38BDF8" stroke="#FFFFFF" stroke-width="1.6"/></svg>',
      '📋': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="7" width="20" height="24" rx="4" fill="#38BDF8" stroke="#FFFFFF" stroke-width="1.8"/><rect x="13" y="4" width="10" height="5" rx="2" fill="#0284C7" stroke="#FFFFFF" stroke-width="1.2"/><path d="M13 15H23M13 20H23M13 25H19" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round"/></svg>',
      '＋': '<svg class="svg-3d-art" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 8V28M8 18H28" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/></svg>'
    };

    function upgradeAllIconsToCustom3DSvg() {
      document.querySelectorAll('#brandIconDefault, .kpi-icon-box, .icon-3d, .icon-3d-sm, .icon-3d-inline').forEach(function (el) {
        var raw = (el.textContent || '').trim();
        if (SVG_3D_LIBRARY[raw]) {
          el.setAttribute('data-orig-icon', raw);
          el.innerHTML = SVG_3D_LIBRARY[raw];
        }
      });
    }
    upgradeAllIconsToCustom3DSvg();

    // Custom Brand Icon Upload & Persistence
    var LS_BRAND_ICON_KEY = 'me_custom_brand_icon_v1';
    function renderCustomBrandIcon(dataUrl) {
      var defEl = $('brandIconDefault');
      var imgEl = $('brandIconCustomImg');
      if (!defEl || !imgEl) return;
      if (dataUrl) {
        imgEl.src = dataUrl;
        imgEl.classList.remove('hidden');
        defEl.classList.add('hidden');
      } else {
        imgEl.removeAttribute('src');
        imgEl.classList.add('hidden');
        defEl.classList.remove('hidden');
      }
    }

    var savedBrandIcon = safeGetLS(LS_BRAND_ICON_KEY);
    if (savedBrandIcon) {
      renderCustomBrandIcon(savedBrandIcon);
    }

    function triggerBrandIconUpload() {
      if ($('brandIconInput')) $('brandIconInput').click();
    }
    if ($('brandIconBtn')) {
      $('brandIconBtn').addEventListener('click', triggerBrandIconUpload);
    }
    if ($('brandUploadTextBtn')) {
      $('brandUploadTextBtn').addEventListener('click', triggerBrandIconUpload);
    }
    if ($('brandIconInput')) {
      $('brandIconInput').addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!file.type || file.type.indexOf('image/') !== 0) {
          return toast('กรุณาเลือกไฟล์รูปภาพเท่านั้น', true);
        }
        var reader = new FileReader();
        reader.onload = function (ev) {
          var rawDataUrl = ev.target.result;
          var img = new Image();
          img.onload = function () {
            try {
              var canvas = document.createElement('canvas');
              var maxDim = 256;
              var w = img.width || maxDim;
              var h = img.height || maxDim;
              if (w > maxDim || h > maxDim) {
                if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
                else { w = Math.round((w * maxDim) / h); h = maxDim; }
              }
              canvas.width = w;
              canvas.height = h;
              var ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, w, h);
              var compressed = canvas.toDataURL('image/png', 0.9);
              safeSetLS(LS_BRAND_ICON_KEY, compressed);
              renderCustomBrandIcon(compressed);
              toast('อัปเดตรูปไอคอนเรียบร้อยแล้ว ✓');
            } catch (err) {
              safeSetLS(LS_BRAND_ICON_KEY, rawDataUrl);
              renderCustomBrandIcon(rawDataUrl);
              toast('อัปเดตรูปไอคอนเรียบร้อยแล้ว ✓');
            }
          };
          img.onerror = function () {
            safeSetLS(LS_BRAND_ICON_KEY, rawDataUrl);
            renderCustomBrandIcon(rawDataUrl);
            toast('อัปเดตรูปไอคอนเรียบร้อยแล้ว ✓');
          };
          img.src = rawDataUrl;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
      });
    }

    applyThemeStudio(false);
    lockWithPin('');
    load();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
