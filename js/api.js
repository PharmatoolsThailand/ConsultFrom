// ชั้นเครือข่ายกลางคุยกับ Apps Script Web App (ใช้ร่วม sheet-sync.js + templates.js)
// Apps Script ตอบช้าแกว่ง 2–60 วิ และบางครั้งตอบหน้า HTML error พร้อม HTTP 200:
//   GET  → เส้นแรกเงียบเกิน HEDGE_MS ยิงเส้นสำรองแข่ง เอาอันที่ถึงก่อน
//   POST → หมดเวลา/หลุด ส่งซ้ำด้วย _op เดิม (server จำ _op ได้ จึงไม่ออกเลขฟอร์มซ้ำ)

(function () {
  var HEDGE_MS = 4000;
  var RACE_MS = 30000;
  var LINE_MAX = 3;
  var LINE_MIN_LEFT = 3000;
  // ต้องนานกว่า tryLock ฝั่ง server (20 วิ) — ตัดก่อน = client ยอมแพ้ทั้งที่ server กำลังจะเขียน
  var POST_TIMEOUTS = [30000, 45000];
  var NO_URL = 'ยังไม่ได้ตั้งค่า URL ใน js/config.js';

  // server เวอร์ชันที่ตอบ api>=2 รองรับ _op แล้ว — server เก่าถ้าส่งซ้ำจะได้แถวใหม่อีกแถว
  var api = { idem: false };

  function url() {
    return (window.CONSULT_CONFIG && window.CONSULT_CONFIG.appsScriptUrl || '').trim();
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function once(u, opts, ms) {
    var c = new AbortController();
    var t = setTimeout(function () { c.abort(); }, ms);
    var o = {};
    for (var k in (opts || {})) o[k] = opts[k];
    o.signal = c.signal;
    return fetch(u, o).then(function (r) { return r.text(); }).then(function (txt) {
      clearTimeout(t);
      if (txt.trim().charAt(0) !== '{') { var e = new Error('html'); e.kind = 'html'; throw e; }
      var j = JSON.parse(txt);
      if (j && j.api >= 2) api.idem = true;
      return j;
    }, function (e) { clearTimeout(t); throw e; });
  }

  function friendly(e, isPost) {
    var msg;
    if (e && e.name === 'AbortError') msg = 'หมดเวลาเชื่อมต่อ (Google ตอบช้า)';
    else if (e && e.kind === 'html') msg = 'เซิร์ฟเวอร์ Google ไม่พร้อมชั่วคราว';
    else if (e && e.name === 'TypeError') msg = 'เชื่อมต่อไม่ได้ — ตรวจสอบอินเทอร์เน็ต';
    else msg = (e && e.message) || 'ไม่ทราบสาเหตุ';
    if (isPost && !api.idem) msg += '\nข้อมูลอาจบันทึกไปแล้ว — กด "ดึงข้อมูล" ตรวจก่อนกดบันทึกซ้ำ';
    else msg += ' — ลองใหม่อีกครั้ง';
    return new Error(msg);
  }

  function get(qs) {
    var u = url();
    if (!u) return Promise.reject(new Error(NO_URL));
    return new Promise(function (resolve, reject) {
      var done = false, pending = 0, lines = 0, lastErr = null, hedge;
      var start = Date.now();
      var cap = setTimeout(function () {
        var e = new Error('timeout'); e.name = 'AbortError';
        finish(null, lastErr || e);
      }, RACE_MS);
      function finish(j, err) {
        if (done) return;
        done = true;
        clearTimeout(cap); clearTimeout(hedge);
        if (err) reject(friendly(err)); else resolve(j);
      }
      function fire() {
        var left = RACE_MS - (Date.now() - start);
        if (done || lines >= LINE_MAX || left < LINE_MIN_LEFT) return;
        lines++; pending++;
        once(u + qs, null, left).then(function (j) { finish(j); }, function (e) {
          pending--; lastErr = e;
          if (done) return;
          fire();
          if (pending === 0) finish(null, e);
        });
        clearTimeout(hedge);
        hedge = setTimeout(fire, HEDGE_MS);
      }
      fire();
    });
  }

  function post(body) {
    var u = url();
    if (!u) return Promise.reject(new Error(NO_URL));
    var opts = {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // text/plain เลี่ยง CORS preflight
      body: JSON.stringify(body)
    };
    function attempt(i) {
      var more = i + 1 < POST_TIMEOUTS.length;
      return once(u, opts, POST_TIMEOUTS[i]).then(function (j) {
        if (j && j.error === 'busy' && more) return wait(700).then(function () { return attempt(i + 1); });
        return j;
      }, function (e) {
        if (more && api.idem && body._op) return wait(1000).then(function () { return attempt(i + 1); });
        throw friendly(e, true);
      });
    }
    return attempt(0);
  }

  function newOp() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  // dropdown: แสดงจาก cache ในเครื่องทันที แล้วค่อยอัปเดตจากชีตเบื้องหลัง (เน็ตล่มยังมีรายการให้เลือก)
  function cachedList(key, qs, pick, render) {
    try {
      var c = JSON.parse(localStorage.getItem(key) || 'null');
      if (c && c.length) render(c);
    } catch (e) {}
    return get(qs).then(function (r) {
      var arr = r && r.ok ? pick(r) : null;
      if (!arr) return;
      try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) {}
      render(arr);
    }).catch(function () {});
  }

  api.url = url;
  api.get = get;
  api.post = post;
  api.newOp = newOp;
  api.cachedList = cachedList;
  window.ConsultApi = api;
})();
