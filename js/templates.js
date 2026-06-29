// Template ข้อความสำหรับช่อง "รายละเอียดอุบัติการณ์เพิ่มเติม"
// เก็บในชีต "Templates" (ผ่าน Apps Script เดิม). เลือกจาก dropdown แล้ว "แทนที่" ข้อความในช่อง.
// ติ๊กความคลาดเคลื่อนทางยาใด → template ที่ติดป้ายความคลาดนั้นเด้งขึ้นต้น (★) แต่ยังแสดงครบทุกอัน.
// จัดการ (เพิ่ม/แก้/ลบ) ได้ในหน้าหลักผ่านแถบนี้ — เลือก = โหลดมาแก้, บันทึก = สร้าง/อัปเดต, ลบ = ลบตัวที่เลือก.

(function () {
  function url() { return (window.CONSULT_CONFIG && window.CONSULT_CONFIG.appsScriptUrl || '').trim(); }
  function qa(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(id) { return document.getElementById(id); }
  function detail() { return document.querySelector('[data-f="detail"]'); }

  var _templates = [];

  function fetchJSON(u, opts, ms) {
    var c = new AbortController();
    var t = setTimeout(function () { c.abort(); }, ms || 15000);
    opts = opts || {}; opts.signal = c.signal;
    return fetch(u, opts).then(function (r) { return r.json(); })
      .then(function (j) { clearTimeout(t); return j; })
      .catch(function (e) { clearTimeout(t); if (e && e.name === 'AbortError') throw new Error('หมดเวลาเชื่อมต่อ'); throw e; });
  }
  function post(body) {
    var u = url(); if (!u) return Promise.reject(new Error('ยังไม่ได้ตั้งค่า URL ใน js/config.js'));
    return fetchJSON(u, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  }
  function toast(msg) {
    var t = el('__toast');
    if (!t) { t = document.createElement('div'); t.id = '__toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  function tickedErrors() {
    return qa('[data-f="error"]').filter(function (c) { return c.checked; })
      .map(function (c) { var sp = c.parentElement.querySelector('span'); return sp ? sp.textContent.trim() : ''; })
      .filter(Boolean);
  }
  function matches(tpl, ticked) {
    if (!tpl.errors) return false;
    var tags = tpl.errors.split('; ').map(function (s) { return s.trim(); });
    return tags.some(function (tag) { return tag && ticked.indexOf(tag) >= 0; });
  }

  function renderOptions() {
    var sel = el('tplSelect'); if (!sel) return;
    var cur = sel.value;
    var ticked = tickedErrors();
    var match = [], rest = [];
    _templates.forEach(function (t) { (matches(t, ticked) ? match : rest).push(t); });
    var ordered = match.concat(rest);
    sel.innerHTML = '<option value="">— เลือก Template —</option>';
    ordered.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t.id;
      o.textContent = (matches(t, ticked) ? '★ ' : '') + t.name;
      sel.appendChild(o);
    });
    sel.value = (cur && ordered.some(function (t) { return t.id === cur; })) ? cur : '';
    updateSaveLabel();
  }

  // ปุ่มบอกโหมด: เลือก template อยู่ = อัปเดตตัวนั้น, ไม่เลือก = สร้างใหม่
  function updateSaveLabel() {
    var bs = el('btnTplSave'), sel = el('tplSelect');
    if (bs) bs.textContent = (sel && sel.value) ? 'อัปเดต' : '+ บันทึกใหม่';
  }

  // ===== cache เฉพาะ Template ไว้ในเครื่อง (localStorage) =====
  // ใช้ localStorage แทน cookie เพราะบน file:// คุกกี้มักไม่ถูกเก็บ + คุกกี้จำกัด ~4KB
  var CACHE_KEY = 'consult_templates';
  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]') || []; } catch (e) { return []; }
  }
  function writeCache(arr) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(arr || [])); } catch (e) {}
  }
  function applyTemplates(arr, selectId) {
    _templates = arr || [];
    renderOptions();
    if (selectId) { var sel = el('tplSelect'); if (sel) sel.value = selectId; }
  }
  // ดึงจากชีตจริง → อัปเดตทั้งรายการในหน้า + cache ในเครื่อง
  function fetchTemplates(selectId, showToast) {
    var u = url();
    if (!u) { if (showToast) alert('ยังไม่ได้ตั้งค่า URL ใน js/config.js'); return Promise.resolve(); }
    return fetchJSON(u + '?action=templates').then(function (r) {
      var arr = (r && r.ok && r.templates) ? r.templates : [];
      writeCache(arr);
      applyTemplates(arr, selectId);
      if (showToast) toast('อัปเดต Template ล่าสุดแล้ว (' + arr.length + ' รายการ)');
    }).catch(function (e) { if (showToast) alert('ดึง Template ไม่สำเร็จ: ' + e.message); });
  }

  function onSelect() {
    var id = el('tplSelect').value;
    var tpl = _templates.filter(function (t) { return t.id === id; })[0];
    if (tpl) { var ta = detail(); if (ta) ta.value = tpl.text; }   // แทนที่ข้อความทั้งหมด
    updateSaveLabel();
  }

  function save() {
    var ta = detail();
    var sel = el('tplSelect');
    var id = sel ? sel.value : '';
    var existing = id ? _templates.filter(function (t) { return t.id === id; })[0] : null;
    // ไม่มีช่องชื่อแล้ว → เด้งถามชื่อตอนกดบันทึก (แก้ตัวเดิมจะใส่ชื่อเดิมไว้ให้)
    var name = window.prompt('ตั้งชื่อ Template:', existing ? existing.name : '');
    if (name === null) return;
    name = name.trim();
    if (!name) { alert('กรุณาตั้งชื่อ Template'); return; }
    var ticked = tickedErrors();
    // ติ๊กความคลาดเคลื่อนไว้ = ใช้เป็นป้ายใหม่; ถ้าไม่ติ๊กและกำลังแก้ตัวเดิม = คงป้ายเดิมไว้ (ไม่ลบทิ้ง)
    var errors = ticked.length ? ticked.join('; ') : (existing ? existing.errors : '');
    post({ type: 'template', id: id, name: name, text: ta ? ta.value : '', errors: errors })
      .then(function (r) {
        if (r && r.ok) { toast(existing ? 'อัปเดต Template แล้ว' : 'บันทึก Template ใหม่แล้ว'); fetchTemplates(r.id); }
        else alert('บันทึก Template ไม่สำเร็จ: ' + ((r && r.error) || 'ไม่ทราบสาเหตุ'));
      }).catch(function (e) { alert('บันทึก Template ไม่สำเร็จ: ' + e.message); });
  }

  function del() {
    var sel = el('tplSelect');
    var id = sel ? sel.value : '';
    if (!id) { alert('เลือก Template ที่จะลบจาก dropdown ก่อน'); return; }
    var tpl = _templates.filter(function (t) { return t.id === id; })[0];
    if (!window.confirm('ลบ Template "' + (tpl ? tpl.name : '') + '" ?')) return;
    post({ type: 'template', action: 'delete', id: id }).then(function (r) {
      if (r && r.ok) { toast('ลบ Template แล้ว'); fetchTemplates(); }
      else alert('ลบไม่สำเร็จ: ' + ((r && r.error) || ''));
    }).catch(function (e) { alert('ลบไม่สำเร็จ: ' + e.message); });
  }

  function init() {
    var sel = el('tplSelect'); if (sel) sel.addEventListener('change', onSelect);
    var bs = el('btnTplSave'); if (bs) bs.addEventListener('click', save);
    var bd = el('btnTplDelete'); if (bd) bd.addEventListener('click', del);
    var br = el('btnTplReload');
    if (br) br.addEventListener('click', function () {
      var prev = br.textContent; br.textContent = '⟳ กำลังโหลด…'; br.disabled = true;
      Promise.resolve(fetchTemplates(null, true)).then(function () { br.textContent = prev; br.disabled = false; });
    });
    qa('[data-f="error"]').forEach(function (c) { c.addEventListener('change', renderOptions); });

    // ฟอร์มถูกล้าง (หลังยืนยันใน ui-handler) → รีเซ็ต dropdown template ด้วย
    document.addEventListener('consult:cleared', function () {
      var s = el('tplSelect'); if (s) s.value = '';
      updateSaveLabel();
    });
    // ปุ่มล้างเฉพาะช่องรายละเอียดฯ (+ เลิกเลือก template กันเผลออัปเดตทับด้วยข้อความว่าง)
    var bcd = el('btnClearDetail'); if (bcd) bcd.addEventListener('click', function () {
      var ta = detail(); if (ta) ta.value = '';
      var s = el('tplSelect'); if (s) s.value = '';
      updateSaveLabel();
    });

    updateSaveLabel();
    applyTemplates(readCache());              // แสดงจาก cache ทันที (เร็ว/ออฟไลน์ได้)
    if (!_templates.length) fetchTemplates(); // ยังไม่มีใน cache → ดึงจากชีตครั้งแรก
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
