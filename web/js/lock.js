/* lock.js — ล็อก PIN หน้าเว็บ (เก็บแบบ hash ไม่เก็บเลขตรงๆ) */
var Lock = (function () {
  // SHA-256 ของ PIN — เปลี่ยน PIN โดยแทน hash นี้ด้วยค่าใหม่ (สร้างจากคำสั่งใน README)
  var PIN_HASH = 'b26f2fdfb616af630fb3cacff5dce00c7d7403d949ee4d046ef1f3160e5a2fff';
  var LS = 'me_unlock_until';
  var HOURS = 12;

  function sha256hex(s) {
    if (crypto.subtle && crypto.subtle.digest) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (buf) {
        return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      });
    }
    // fallback เก่า (ไม่ใช่ SHA256 แท้ แต่พอใช้โหมดทดลอง)
    var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return Promise.resolve('fb' + h.toString(16));
  }
  function isUnlocked() { return Date.now() < +(localStorage.getItem(LS) || 0); }
  function show() { document.getElementById('lockScreen').style.display = 'flex'; }
  function hide() { document.getElementById('lockScreen').style.display = 'none'; }
  function tryUnlock(pin) {
    return sha256hex(String(pin).trim()).then(function (h) {
      if (h === PIN_HASH) {
        localStorage.setItem(LS, String(Date.now() + HOURS * 3600 * 1000));
        hide();
        var e = document.getElementById('pinErr'); if (e) e.classList.add('hidden');
        return true;
      }
      var e2 = document.getElementById('pinErr'); if (e2) e2.classList.remove('hidden');
      return false;
    });
  }
  function lockNow() { localStorage.removeItem(LS); show(); }
  return { isUnlocked: isUnlocked, show: show, hide: hide, tryUnlock: tryUnlock, lockNow: lockNow };
})();
