/* bills.js — รายการหลักล่าสุด (template สำหรับลอกเดือนหน้า) */
var BillsUI = (function () {
  function renderTemplate(bills, handlers) {
    handlers = handlers || {};
    var box = document.getElementById('templateList');
    var active = (bills || []).filter(function (b) { return b.active; });
    var hidden = (bills || []).filter(function (b) { return !b.active; });

    function card(b) {
      return '<div class="border rounded-xl px-3 py-2 flex items-center gap-2 ' + (b.active ? '' : 'opacity-60 bg-slate-50') + '">' +
        '<div class="flex-1 min-w-0"><div class="font-bold truncate">' + esc(b.name) + '</div>' +
        '<div class="text-xs text-slate-400">' + esc(b.id || '') + '</div></div>' +
        (b.active
          ? '<button class="row-btn btn-edit" data-tedit="' + esc(b.id) + '">แก้</button>' +
            '<button class="row-btn btn-del" data-tdel="' + esc(b.id) + '">ซ่อน</button>'
          : '<button class="row-btn btn-edit" data-trestore="' + esc(b.id) + '">คืน</button>') +
      '</div>';
    }

    box.innerHTML =
      '<div class="text-xs text-slate-400 mb-1">ใช้งานอยู่ (' + active.length + ')</div>' +
      (active.map(card).join('') || '<div class="text-sm text-slate-400">ยังไม่มี — เพิ่มด้านบนได้เลย</div>') +
      (hidden.length ? '<div class="text-xs text-slate-400 mt-3 mb-1">ซ่อนอยู่ (' + hidden.length + ') — ประวัติเก่ายังอยู่</div>' + hidden.map(card).join('') : '');

    box.querySelectorAll('[data-tedit]').forEach(function (btn) {
      btn.addEventListener('click', function () { handlers.onEdit && handlers.onEdit(btn.getAttribute('data-tedit')); });
    });
    box.querySelectorAll('[data-tdel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (confirm('ซ่อน “' + btn.getAttribute('data-tdel') + '” จากรายการหลัก?\n(เดือนเก่าไม่หาย แต่เดือนหน้าจะไม่ลอกไป)')) handlers.onDelete && handlers.onDelete(btn.getAttribute('data-tdel'));
      });
    });
    box.querySelectorAll('[data-trestore]').forEach(function (btn) {
      btn.addEventListener('click', function () { handlers.onRestore && handlers.onRestore(btn.getAttribute('data-trestore')); });
    });
  }

  return { renderTemplate: renderTemplate };
})();
