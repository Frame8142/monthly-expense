/* app.js — เว็บไซต์ค่าใช้จ่ายรายเดือน (desktop-first) */
(function () {
  var state = {
    month: currentMonth(),
    bills: [],
    ledger: [],
    history: [],
    cacheLedger: {},   // month -> rows (กันยิงซ้ำตอนกางประวัติ)
    unlockedPast: {}   // month -> true เมื่อกดปลดล็อก
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

  function setConn(mode) {
    var light = $('connLight'), text = $('connText');
    light.className = 'conn-light' + (mode === 'ok' ? ' ok' : mode === 'err' ? ' err' : '');
    text.textContent = mode === 'ok' ? 'ต่อ Sheet แล้ว' : mode === 'err' ? 'ต่อไม่ได้' : 'โหมดทดลอง';
  }

  /* ---------- โหลด ---------- */
  function load() {
    $('loading').classList.remove('hidden');
    showErr('');
    $('demoBadge').classList.toggle('hidden', !isDemoMode());
    setConn(isDemoMode() ? 'demo' : 'ok');

    Promise.all([Api.listBills(true), Api.getLedger(state.month), Api.dashboard(24)])
      .then(function (res) {
        $('loading').classList.add('hidden');
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
    // หัวเดือน
    $('monthLabel').textContent = monthLabel(state.month) + ' (' + monthShort(state.month) + ')';
    var t = Dashboard.totals(state.ledger);
    var badge = $('monthBadge');
    if (state.month === currentMonth()) {
      $('monthSub').textContent = t.count + ' รายการ · เดือนปัจจุบัน แก้ได้เลย';
      badge.textContent = 'เดือนนี้'; badge.className = 'badge badge-ok ml-1';
    } else if (isPast(state.month)) {
      $('monthSub').textContent = t.count + ' รายการ · ประวัติแยกเก็บ (ติ๊กไว้ไม่หาย)';
      badge.textContent = 'เดือนก่อน'; badge.className = 'badge badge-old ml-1';
    } else {
      $('monthSub').textContent = t.count + ' รายการ · เดือนล่วงหน้า (วางแผนได้)';
      badge.textContent = 'ล่วงหน้า'; badge.className = 'badge badge-warn ml-1';
    }

    // แบนเนอร์ล็อกเดือนก่อน
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

    BillsUI.renderTemplate(state.bills, {
      onEdit: onEditTemplate,
      onDelete: function (id) { Api.deleteBill(id).then(afterOk('ซ่อนแล้ว ✓')); },
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
    Api.upsertLedger({ month: state.month, bill_id: billId, amount: amount }).then(function (res) {
      if (!res.ok) { toast('แก้ยอดไม่ได้: ' + res.error, true); load(); return; }
      state.cacheLedger[state.month] = state.ledger;
      refreshHistory(true);
    }).catch(function () { /* เงียบไว้เพราะพิมพ์ต่อเนื่อง */ });
  }

  function refreshHistory(silent) {
    Api.dashboard(24).then(function (res) {
      if (!res.ok) return;
      state.history = res.dashboard || [];
      Dashboard.renderHistory(state.history, state.month, {
        onExpand: function (m) { return Promise.resolve(state.cacheLedger[m] || Api.getLedger(m).then(function (r) { state.cacheLedger[m] = r.ok ? r.rows : []; return state.cacheLedger[m]; })); },
        onJump: function (m) { state.month = m; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      });
    }).catch(function () { if (!silent) toast('โหลดประวัติไม่ได้', true); });
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
    if (cur > 0) {
      if (!confirm('เดือนนี้มี ' + cur + ' รายการแล้ว จะลอกเพิ่มเฉพาะรายการที่ยังไม่มีใช่ไหม?\n(ยอดเดิมของแถวที่มีอยู่จะไม่ถูกทับ)')) return;
    }
    if (!src) {
      if (!confirm('ยังไม่มีเดือนก่อนเลย จะตั้งบิลเดือน ' + monthShort(state.month) + ' จากรายการหลักใช่ไหม?')) return;
      doCopy();
      return;
    }
    var srcRows = state.cacheLedger[src];
    function showModalWithCount(count, total) {
      $('copyDesc').innerHTML = 'จะลอก <b>' + esc(monthLabel(src)) + '</b> มา <b>' + esc(monthLabel(state.month)) + '</b><br>' +
        '• ' + count + ' รายการ พร้อมยอดเดิมรวม ' + fmt(total) + ' บาท<br>' +
        '• ติ๊กจ่าย reset ใหม่หมด (ต้องติ๊กเอง)<br>' +
        (cur > 0 ? '• แถวที่มีอยู่แล้วจะไม่ถูกทับ<br>' : '');
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
    if (!confirm('ลบ “' + name + '” ออกจาก ' + monthLabel(state.month) + ' เท่านั้น?\n\n• เดือนก่อนไม่หาย\n• รายการหลักยังอยู่ (เดือนหน้าลอกได้เหมือนเดิม)')) return;
    Api.deleteLedgerRow(state.month, billId).then(function (res) {
      if (!res.ok) return toast('ลบไม่ได้: ' + res.error, true);
      toast('ลบออกจากเดือนนี้แล้ว ✓');
      load();
    });
  }

  function onEditTemplate(id) {
    var b = state.bills.find(function (x) { return x.id === id; });
    if (!b) return;
    var name = prompt('แก้ชื่อในรายการหลัก (มีผลกับเดือนหน้า):', b.name);
    if (name === null) return;
    name = String(name).trim();
    if (!name) return toast('ชื่อว่างไม่ได้', true);
    Api.upsertBill({ id: b.id, name: name }).then(afterOk('แก้ชื่อแล้ว ✓'));
  }

  /* ---------- init ---------- */
  function init() {
    $('prevMonth').addEventListener('click', function () { state.month = shiftMonth(state.month, -1); load(); });
    $('nextMonth').addEventListener('click', function () { state.month = shiftMonth(state.month, 1); load(); });
    $('todayBtn').addEventListener('click', function () { state.month = currentMonth(); load(); });

    $('copyPrevBtn').addEventListener('click', openCopy);
    $('emptyCopyBtn').addEventListener('click', openCopy);
    $('copyConfirmBtn').addEventListener('click', doCopy);

    $('unlockPastBtn').addEventListener('click', function () {
      if (isLocked()) { state.unlockedPast[state.month] = true; toast('ปลดล็อกแล้ว แก้ได้เลย 🔓'); }
      else { delete state.unlockedPast[state.month]; toast('ล็อกกลับแล้ว 🔒'); }
      render();
    });

    // เพิ่มรายการ (modal)
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

    // แก้ชื่อในแถว
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

    // รายการหลัก: เพิ่มด่วน
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

    // modal ปิด
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

    // settings
    $('settingsBtn').addEventListener('click', function () {
      var s = getSettings();
      $('sUrl').value = s.url; $('sKey').value = s.key;
      $('connResult').classList.add('hidden');
      openModal('settingsModal');
    });
    $('saveSettingsBtn').addEventListener('click', function () {
      saveSettings($('sUrl').value, $('sKey').value);
      closeModal('settingsModal');
      toast('บันทึกแล้ว ✓');
      load();
    });
    $('testConnBtn').addEventListener('click', function () {
      saveSettings($('sUrl').value, $('sKey').value);
      var box = $('connResult');
      box.classList.remove('hidden');
      box.className = 'text-sm rounded-lg px-3 py-2 mb-3 bg-slate-100';
      box.textContent = 'กำลังทดสอบ...';
      Api.ping().then(function (res) {
        if (res && res.ok) { box.className = 'text-sm rounded-lg px-3 py-2 mb-3 bg-green-50 border border-green-300 text-green-700'; box.textContent = 'ต่อได้ ✓ ' + (res.time || ''); setConn('ok'); }
        else { box.className = 'text-sm rounded-lg px-3 py-2 mb-3 bg-red-50 border border-red-300 text-red-700'; box.textContent = 'ต่อไม่ได้: ' + ((res && res.error) || 'unknown'); setConn('err'); }
      }).catch(function (e) {
        box.className = 'text-sm rounded-lg px-3 py-2 mb-3 bg-red-50 border border-red-300 text-red-700';
        box.textContent = 'ต่อไม่ได้: ' + e.message; setConn('err');
      });
    });
    $('resetDemoBtn').addEventListener('click', function () {
      if (!confirm('รีเซ็ตข้อมูลทดลองในเครื่องนี้กลับเป็น ก.ย.69 เริ่มใหม่?')) return;
      LocalStore.reset();
      closeModal('settingsModal');
      state.month = '2026-09';
      toast('รีเซ็ตแล้ว ✓');
      load();
    });

    load();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
