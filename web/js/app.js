/* app.js — ตัวเริ่มแอป + สลับเดือน/tab + ต่อ API */
(function () {
  var state = { month: currentMonth(), bills: [], ledger: [], tab: 'dash' };

  function $ (id) { return document.getElementById(id); }
  function billsById() {
    var m = {};
    state.bills.forEach(function (b) { m[b.id] = b; });
    return m;
  }

  function showErr(msg) {
    var box = $('errBox');
    if (!msg) { box.classList.add('hidden'); return; }
    box.textContent = msg; box.classList.remove('hidden');
  }

  // toast เด้งบอกทุกครั้งที่บันทึกสำเร็จ (ล่างจอ หายเองใน ~2 วินาที)
  var toastTimer = null;
  function toast(msg, isErr) {
    var t = $('toast');
    if (!t) { if (isErr) showErr(msg); else alert(msg); return; }
    t.textContent = msg;
    t.classList.toggle('err', !!isErr);
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function load() {
    $('loading').classList.remove('hidden');
    showErr('');
    $('demoBadge').classList.toggle('hidden', !isDemoMode());
    Promise.all([Api.listBills(true), Api.getLedger(state.month)]).then(function (res) {
      $('loading').classList.add('hidden');
      if (!res[0].ok) return showErr('โหลดรายชื่อไม่ได้: ' + (res[0].error || ''));
      if (!res[1].ok) return showErr('โหลดเดือนนี้ไม่ได้: ' + (res[1].error || ''));
      state.bills = res[0].bills || [];
      state.ledger = res[1].rows || [];
      render();
    }).catch(function (e) {
      $('loading').classList.add('hidden');
      showErr('เชื่อมต่อไม่ได้: ' + e.message + ' — ตรวจ URL ใน ⚙️');
    });
  }

  function render() {
    $('monthLabel').textContent = monthLabel(state.month);
    Dashboard.renderSummary(state.ledger);
    Dashboard.renderList(state.ledger, billsById(),
      function (billId, checked) { // ติ๊กจ่ายเอง
        var row = state.ledger.find(function (r) { return r.bill_id === billId; });
        // optimistic UI
        if (row) { row.paid = checked; if (checked) row.paid_at = new Date().toISOString().slice(0, 10); }
        Dashboard.renderSummary(state.ledger);
        var p = checked
          ? Api.markPaid(state.month, billId, row ? row.amount : 0)
          : Api.unmark(state.month, billId);
        p.then(function (res) {
          if (!res.ok) { showErr('บันทึกไม่ได้: ' + res.error); load(); return; }
          toast(checked ? 'ติ๊กจ่ายแล้ว ✓' : 'เอาติ๊กออกแล้ว ✓');
        })
         .catch(function (e) { showErr('บันทึกไม่ได้: ' + e.message); });
      },
      function (billId, amount) {
        var row = state.ledger.find(function (r) { return r.bill_id === billId; });
        if (row) row.amount = amount;
        Dashboard.renderSummary(state.ledger);
        Api.upsertLedger({ month: state.month, bill_id: billId, amount: amount }).then(function (res) {
          if (!res.ok) { showErr('แก้ยอดไม่ได้: ' + res.error); load(); return; }
          toast('แก้ยอดแล้ว ✓');
        });
      });
    BillsUI.renderManage(state.bills, fillForm, function (id) {
      Api.deleteBill(id).then(function (res) {
        if (!res.ok) return showErr('ลบไม่ได้: ' + res.error);
        toast('ซ่อนบิลแล้ว ✓'); load();
      });
    }, function (id) {
      Api.restoreBill(id).then(function (res) {
        if (!res.ok) return showErr('คืนชีพไม่ได้: ' + res.error);
        toast('คืนชีพบิลแล้ว ✓'); load();
      });
    });
  }

  function loadHistory() {
    $('historyList').innerHTML = '<div class="text-slate-500">กำลังโหลด...</div>';
    Api.dashboard(12).then(function (res) {
      if (!res.ok) { $('historyList').textContent = 'โหลดไม่ได้: ' + res.error; return; }
      Dashboard.renderHistory(res.dashboard);
    }).catch(function (e) { $('historyList').textContent = 'โหลดไม่ได้: ' + e.message; });
  }

  function fillForm(id) {
    var b = state.bills.find(function (x) { return x.id === id; });
    if (!b) return;
    $('fId').value = b.id; $('fName').value = b.name;
    $('fDue').value = b.due_day; $('fCat').value = b.category || 'อื่นๆ';
    $('fNote').value = b.note || '';
    $('cancelEditBtn').classList.remove('hidden');
    switchTab('bills');
    $('fName').focus();
  }
  function clearForm() {
    $('fId').value = ''; $('fName').value = ''; $('fDue').value = CONFIG.DEFAULT_DUE_DAY;
    $('fCat').value = 'อื่นๆ'; $('fNote').value = '';
    $('cancelEditBtn').classList.add('hidden');
  }

  function switchTab(t) {
    state.tab = t;
    document.querySelectorAll('.tabBtn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === t);
    });
    $('tab-dash').classList.toggle('hidden', t !== 'dash');
    $('tab-bills').classList.toggle('hidden', t !== 'bills');
    $('tab-history').classList.toggle('hidden', t !== 'history');
    if (t === 'history') loadHistory();
  }

  function init() {
    // ล็อก PIN ก่อน
    if (!Lock.isUnlocked()) Lock.show(); else Lock.hide();
    $('pinBtn').addEventListener('click', function () { Lock.tryUnlock($('pinInput').value); });
    $('pinInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') Lock.tryUnlock($('pinInput').value); });

    document.querySelectorAll('.tabBtn').forEach(function (b) {
      b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
    });
    $('prevMonth').addEventListener('click', function () { state.month = shiftMonth(state.month, -1); load(); });
    $('nextMonth').addEventListener('click', function () { state.month = shiftMonth(state.month, 1); load(); });

    $('ensureBtn').addEventListener('click', function () {
      if (!confirm('ดึงรายชื่อที่ใช้งานอยู่ทั้งหมดมาตั้งเป็นบิลเดือน ' + monthShort(state.month) + ' ใช่ไหม?')) return;
      Api.ensureMonth(state.month).then(function (res) {
        if (!res.ok) return showErr(res.error);
        toast('ตั้งบิลเดือนนี้แล้ว +' + (res.added || 0) + ' รายการ ✓');
        load();
      });
    });
    $('addQuickBtn').addEventListener('click', function () { clearForm(); switchTab('bills'); });

    $('saveBillBtn').addEventListener('click', function () {
      var bill = {
        id: $('fId').value || undefined,
        name: $('fName').value.trim(),
        due_day: parseInt($('fDue').value, 10) || CONFIG.DEFAULT_DUE_DAY,
        category: $('fCat').value, note: $('fNote').value.trim()
      };
      if (!bill.name) return toast('ใส่ชื่อบิลก่อน', true);
      Api.upsertBill(bill).then(function (res) {
        if (!res.ok) return toast('บันทึกไม่ได้: ' + res.error, true);
        toast('บันทึกบิลแล้ว ✓');
        clearForm(); load();
      });
    });
    $('cancelEditBtn').addEventListener('click', clearForm);

    // settings
    var modal = $('settingsModal');
    $('settingsBtn').addEventListener('click', function () {
      var s = getSettings();
      $('sUrl').value = s.url; $('sKey').value = s.key;
      modal.style.display = 'flex';
    });
    $('closeSettingsBtn').addEventListener('click', function () { modal.style.display = 'none'; });
    $('saveSettingsBtn').addEventListener('click', function () {
      saveSettings($('sUrl').value, $('sKey').value);
      modal.style.display = 'none';
      toast('บันทึกการตั้งค่าแล้ว ✓');
      load();
    });
    $('lockNowBtn').addEventListener('click', function () { modal.style.display = 'none'; Lock.lockNow(); });

    // เตือนในเว็บ (Notification API แบบขออนุญาตเมื่อเปิดครั้งแรก)
    if ('Notification' in window && Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch (e) {}
    }

    switchTab('dash');
    load();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
