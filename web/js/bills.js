/* bills.js — จัดการรายชื่อบิล (เพิ่ม/แก้/ลบแบบซ่อน) */
var BillsUI = (function () {
  function renderManage(bills, onEdit, onDelete, onRestore) {
    var box = document.getElementById('manageList');
    var active = bills.filter(function (b) { return b.active; });
    var hidden = bills.filter(function (b) { return !b.active; });
    function card(b) {
      return '<div class="bg-white rounded-xl p-3 shadow flex items-center gap-2">' +
        '<div class="flex-1"><div class="font-bold">' + esc(b.name) + '</div>' +
        '<div class="text-xs text-slate-500">ทุกวันที่ ' + b.due_day + ' · ' + esc(b.category || '') + (b.note ? ' · ' + esc(b.note) : '') + '</div></div>' +
        (b.active
          ? '<button data-edit="' + b.id + '" class="px-3 py-1 bg-slate-200 rounded-lg text-sm">แก้</button>' +
            '<button data-del="' + b.id + '" class="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-sm">ลบ</button>'
          : '<button data-restore="' + b.id + '" class="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm">คืนชีพ</button>') +
      '</div>';
    }
    box.innerHTML =
      '<div class="text-xs text-slate-500 mb-1">ใช้งานอยู่ (' + active.length + ')</div>' +
      (active.map(card).join('') || '<div class="text-sm text-slate-400">ยังไม่มี</div>') +
      (hidden.length ? '<div class="text-xs text-slate-500 mt-3 mb-1">ซ่อนอยู่ (ประวัติเก่ายังอยู่) (' + hidden.length + ')</div>' + hidden.map(card).join('') : '');

    box.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () { onEdit(btn.getAttribute('data-edit')); });
    });
    box.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (confirm('ซ่อนบิลนี้จากเดือนใหม่? (ประวัติเดือนเก่าไม่หาย)')) onDelete(btn.getAttribute('data-del'));
      });
    });
    box.querySelectorAll('[data-restore]').forEach(function (btn) {
      btn.addEventListener('click', function () { onRestore(btn.getAttribute('data-restore')); });
    });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  return { renderManage: renderManage };
})();
