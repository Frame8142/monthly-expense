/* config.js — ค่าตั้งต้น + อ่าน/บันทึกการตั้งค่า */
var CONFIG = {
  DEFAULT_DUE_DAY: 1,          // รายการส่วนใหญ่จ่ายวันที่ 1
  SOON_DAYS: 3,                // เหลือ <=3 วัน = ใกล้ถึง (เหลือง)
  NOTIFY_EMAIL: 'frame8142@gmail.com',
  LS_URL: 'me_apps_script_url',
  LS_KEY: 'me_api_key',
  // URL ตั้งต้นของชีท (ฝังไว้เลย ไม่ต้องกรอกใหม่ทุกเครื่อง; ค่าในเครื่องที่เคยบันทึกไว้จะชนะค่านี้)
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

// ชื่อเดือนไทย (พ.ศ. ย่อแบบในชีทเดิม เช่น ก.ย. 69)
var TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
var TH_MONTHS_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
function monthLabel(month) {
  var p = String(month).split('-');
  var y = parseInt(p[0], 10), m = parseInt(p[1], 10);
  return TH_MONTHS_FULL[m - 1] + ' ' + (y + 543);
}
function monthShort(month) {
  var p = String(month).split('-');
  var y = parseInt(p[0], 10), m = parseInt(p[1], 10);
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
// วันครบกำหนดของเดือน (ปัด 31 -> สิ้นเดือน)
function calcDueDate(month, dueDay) {
  var p = String(month).split('-');
  var y = +p[0], m = +p[1];
  var last = new Date(y, m, 0).getDate();
  var d = Math.min(dueDay || 1, last);
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
function fmtDateThai(iso) {
  if (!iso) return '-';
  var p = String(iso).slice(0, 10).split('-');
  return parseInt(p[2], 10) + ' ' + TH_MONTHS[parseInt(p[1], 10) - 1] + ' ' + String(parseInt(p[0], 10) + 543).slice(-2);
}
function daysLeft(dueDateIso) {
  var t = new Date(); t.setHours(0, 0, 0, 0);
  var d = new Date(String(dueDateIso).slice(0, 10) + 'T00:00:00');
  return Math.round((d - t) / 86400000);
}
