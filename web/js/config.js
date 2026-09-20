/* config.js — ค่าตั้งต้น + helper วันที่/ยอด (เว็บไซต์เวอร์ชันคอม) */
var CONFIG = {
  DEFAULT_DUE_DAY: 1,
  LS_URL: 'me_apps_script_url',
  LS_KEY: 'me_api_key',
  DEFAULT_URL: 'https://script.google.com/macros/s/AKfycbzKG7A4Oy2P7qVB3gVyLk8HMzRarFOgPwJu0qIs-YLb-ovrqppblNlTy-9AaPidKVRe/exec'
};

function getSettings() {
  return {
    url: (localStorage.getItem(CONFIG.LS_URL) || CONFIG.DEFAULT_URL || '').trim(),
    key: (localStorage.getItem(CONFIG.LS_KEY) || '').trim()
  };
}
function saveSettings(url, key) {
  localStorage.setItem(CONFIG.LS_URL, (url || '').trim());
  localStorage.setItem(CONFIG.LS_KEY, (key || '').trim());
}
function isDemoMode() { return !getSettings().url; }

var TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
var TH_MONTHS_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

function monthLabel(month) {
  var p = String(month).split('-');
  var y = parseInt(p[0], 10), m = parseInt(p[1], 10);
  if (!y || !m) return String(month);
  return TH_MONTHS_FULL[m - 1] + ' ' + (y + 543);
}
function monthShort(month) {
  var p = String(month).split('-');
  var y = parseInt(p[0], 10), m = parseInt(p[1], 10);
  if (!y || !m) return String(month);
  return TH_MONTHS[m - 1] + ' ' + String(y + 543).slice(-2);
}
function currentMonth() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function shiftMonth(month, n) {
  var p = String(month).split('-');
  var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1 + n, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function fmt(n) { return Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
function fmtInt(n) { return Number(n || 0).toLocaleString('th-TH'); }
function parseAmount(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  var s = String(v == null ? '' : v).replace(/[, ]/g, '');
  var n = parseFloat(s);
  return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}
function calcDueDate(month, dueDay) {
  var p = String(month).split('-');
  var y = +p[0], m = +p[1];
  if (!y || !m) return month + '-01';
  var last = new Date(y, m, 0).getDate();
  var d = Math.min(Math.max(parseInt(dueDay, 10) || 1, 1), last);
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
