// บันทึก/ดึงข้อมูล consult เข้า-ออก Google Sheet ผ่าน Apps Script Web App.
// แหล่งความจริงของเลขฟอร์มคือ <span data-f="formNo"> บนกระดาษ (ไม่เก็บ state แยก).

(function () {
  function url() {
    return (window.CONSULT_CONFIG && window.CONSULT_CONFIG.appsScriptUrl || '').trim();
  }
  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function scope() { return q('.sheet') || document; }

  function getFormNo() {
    var el = q('[data-f="formNo"]');
    if (!el) return '';
    var t = (el.textContent || '').trim();
    return (t === '—' || t === '-') ? '' : t;
  }
  function setFormNo(n) {
    var el = q('[data-f="formNo"]');
    if (el) el.textContent = n || '—';
  }
  // _rev = โทเคนเวอร์ชันของแถว (เก็บบน span เลขฟอร์ม) ใช้ตรวจว่ามีคนแก้แซงก่อนบันทึก
  function getRev() {
    var el = q('[data-f="formNo"]');
    return el ? (el.getAttribute('data-rev') || '') : '';
  }
  function setRev(v) {
    var el = q('[data-f="formNo"]');
    if (el) el.setAttribute('data-rev', v || '');
  }

  function labelOf(checkbox) {
    var sp = checkbox.parentElement && checkbox.parentElement.querySelector('span');
    return sp ? sp.textContent.trim() : '';
  }
  // อายุ/น้ำหนัก: เก็บลงชีตเป็นตัวเลขล้วน (ตัดหน่วย), ดึงกลับมาเติมหน่วยเสมอ
  function stripUnit(s, unit) {
    return String(s == null ? '' : s).replace(new RegExp('\\s*' + unit + '\\s*$'), '').trim();
  }
  function addUnit(v, unit) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    return new RegExp(unit + '\\s*$').test(s) ? s : s + ' ' + unit;
  }

  // รวมข้อมูล 14 คอลัมน์จากฟอร์ม
  function collect() {
    var s = scope();
    var val = function (sel) { var e = q(sel, s); return e ? e.value.trim() : ''; };
    var checkedVals = function (sel) {
      return qa(sel, s).filter(function (c) { return c.checked; })
        .map(function (c) { return c.getAttribute('data-v'); }).join(', ');
    };
    var errors = qa('[data-f="error"]', s).filter(function (c) { return c.checked; })
      .map(labelOf).filter(Boolean).join('; ');
    var resultDetail = qa('[data-f="resultDetail"]', s)
      .map(function (e) { return e.value.trim(); }).filter(Boolean).join(' | ');

    return {
      formNo: getFormNo(),
      date: val('[data-f="date"]'),
      ptype: checkedVals('[data-f="ptype"]'),
      hn: val('[data-f="hn"]'),
      name: val('[data-f="name"]'),
      age: stripUnit(val('[data-f="age"]'), 'ปี'),
      weight: stripUnit(val('[data-f="weight"]'), 'kg'),
      ward: val('[data-f="ward"]'),
      error: errors,
      otherDetail: val('[data-f="otherDetail"]'),
      detail: val('[data-f="detail"]'),
      pharmacist: val('[data-f="pharmacist"]'),
      result: checkedVals('[data-f="result"]'),
      resultDetail: resultDetail,
      doctor: val('[data-f="doctor"]'),
      _rev: getRev()
    };
  }

  // เติมข้อมูลที่ดึงกลับมาลงฟอร์ม
  function apply(o) {
    var s = scope();
    var set = function (sel, v) { var e = q(sel, s); if (e) e.value = v || ''; };
    set('[data-f="date"]', o.date);
    set('[data-f="hn"]', o.hn);
    set('[data-f="name"]', o.name);
    set('[data-f="age"]', addUnit(o.age, 'ปี'));
    set('[data-f="weight"]', addUnit(o.weight, 'kg'));
    set('[data-f="ward"]', o.ward);
    set('[data-f="otherDetail"]', o.otherDetail);
    set('[data-f="detail"]', o.detail);
    set('[data-f="pharmacist"]', o.pharmacist);
    set('[data-f="doctor"]', o.doctor);
    setFormNo(o.formNo);
    setRev(o._rev);

    qa('[data-f="ptype"]', s).forEach(function (c) {
      c.checked = (o.ptype || '').indexOf(c.getAttribute('data-v')) >= 0;
    });
    qa('[data-f="result"]', s).forEach(function (c) {
      c.checked = (o.result || '').indexOf(c.getAttribute('data-v')) >= 0;
    });
    qa('[data-f="error"]', s).forEach(function (c) {
      var t = labelOf(c);
      c.checked = !!t && (o.error || '').indexOf(t) >= 0;
    });
    var rd = (o.resultDetail || '').split(' | ');
    qa('[data-f="resultDetail"]', s).forEach(function (e, i) { e.value = rd[i] || ''; });
  }

  // fetch + timeout กันค้างเมื่อเครือข่ายช้า/หลุด
  function fetchJSON(u, opts, timeoutMs) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || 15000);
    opts = opts || {};
    opts.signal = ctrl.signal;
    return fetch(u, opts).then(function (r) { return r.json(); })
      .then(function (j) { clearTimeout(timer); return j; })
      .catch(function (err) {
        clearTimeout(timer);
        if (err && err.name === 'AbortError') throw new Error('หมดเวลาเชื่อมต่อ (เครือข่ายช้า) — ลองใหม่อีกครั้ง');
        throw err;
      });
  }

  // ใช้ text/plain เพื่อเลี่ยง CORS preflight; Apps Script ตอบ Access-Control-Allow-Origin: *
  // ถ้า server ตอบ busy (มีคนเขียนพร้อมกัน) ให้ลองซ้ำอัตโนมัติ 1 ครั้ง
  function postJSON(body) {
    var u = url();
    if (!u) return Promise.reject(new Error('ยังไม่ได้ตั้งค่า URL ใน js/config.js'));
    var opts = {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    };
    return fetchJSON(u, opts).then(function (j) {
      if (j && j.error === 'busy') {
        return new Promise(function (res) { setTimeout(res, 700); })
          .then(function () { return fetchJSON(u, opts); });
      }
      return j;
    });
  }
  function getList(q) {
    var u = url();
    if (!u) return Promise.reject(new Error('ยังไม่ได้ตั้งค่า URL ใน js/config.js'));
    var qs = '?action=list&limit=10';
    if (q) qs += '&q=' + encodeURIComponent(q);
    return fetchJSON(u + qs, null, 15000);
  }

  // เติมรายชื่อเภสัชกรที่เคยใช้ลง datalist (พิมพ์ชื่อใหม่เองได้ ครั้งหน้าจะขึ้นในรายการเอง)
  function loadPharmacists() {
    var u = url(); if (!u) return;
    fetchJSON(u + '?action=pharmacists').then(function (r) {
      var dl = document.getElementById('pharmacistList');
      if (!dl || !r || !r.ok || !r.names) return;
      dl.innerHTML = '';
      r.names.forEach(function (n) { var o = document.createElement('option'); o.value = n; dl.appendChild(o); });
    }).catch(function () {});
  }
  // เติมชื่อหอผู้ป่วยลง datalist (แก้รายการได้ในชีต "Wards")
  function loadWards() {
    var u = url(); if (!u) return;
    fetchJSON(u + '?action=wards').then(function (r) {
      var dl = document.getElementById('wardList');
      if (!dl || !r || !r.ok || !r.wards) return;
      dl.innerHTML = '';
      r.wards.forEach(function (n) { var o = document.createElement('option'); o.value = n; dl.appendChild(o); });
    }).catch(function () {});
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // บังคับกรอกช่องจำเป็นก่อนบันทึก/พิมพ์ — คืนรายการช่องที่ยังไม่กรอก (ว่าง = ผ่าน)
  function validate() {
    var d = collect();
    var miss = [];
    if (!d.name) miss.push('ชื่อ – สกุล ผู้ป่วย');
    if (!d.hn) miss.push('HN');
    if (!d.date) miss.push('วันที่');
    if (!d.ward) miss.push('ตึก (หอผู้ป่วย)');
    if (!d.ptype) miss.push('ประเภทผู้ป่วย');
    if (!d.error) miss.push('ความคลาดเคลื่อนทางยา (ติ๊กอย่างน้อย 1 ข้อ)');
    if (!d.detail) miss.push('รายละเอียดอุบัติการณ์เพิ่มเติม');
    if (!d.pharmacist) miss.push('เภสัชกรผู้ส่งปรึกษา');
    return miss;
  }
  function checkValid() {
    var miss = validate();
    if (!miss.length) return true;
    alert('กรุณากรอกข้อมูลให้ครบก่อนบันทึก / ออกเลข & พิมพ์:\n\n• ' + miss.join('\n• '));
    return false;
  }

  // บันทึก: ถ้ามีเลขฟอร์มแล้ว = อัปเดตแถวเดิม, ถ้ายังไม่มี = สร้างแถวใหม่ + Sheet ออกเลข
  // (ตรวจช่องจำเป็นแล้วที่ปุ่มก่อนเรียกฟังก์ชันนี้)
  function save(silent) {
    var data = collect();
    return postJSON(data).then(function (r) {
      if (r && r.ok) {
        setFormNo(r.formNo);
        setRev(r.rev);
        if (!silent) toast((r.mode === 'update' ? 'อัปเดตแล้ว' : 'บันทึกแล้ว') + ' · เลขฟอร์ม ' + r.formNo);
        return r.formNo;
      }
      if (r && r.error === 'conflict') {
        if (r.row) apply(r.row);
        alert('ข้อมูลฟอร์มนี้ถูกผู้ใช้อื่นแก้ไขไปก่อนแล้ว\nระบบดึงข้อมูลล่าสุดมาให้แล้ว — กรุณาตรวจ/แก้ไขแล้วบันทึกอีกครั้ง');
        return null;
      }
      if (r && r.error === 'no_data') { alert('ยังไม่มีข้อมูลให้บันทึก'); return null; }
      alert('บันทึกไม่สำเร็จ: ' + ((r && r.error) || 'ไม่ทราบสาเหตุ'));
      return null;
    }).catch(function (err) {
      alert('บันทึกไม่สำเร็จ: ' + err.message);
      return null;
    });
  }

  // ออกเลขตอนปริ้น: ถ้ายังไม่มีเลข ให้บันทึก(ออกเลข)ก่อน แล้วค่อยพิมพ์
  function issueAndPrint() {
    if (getFormNo() || !url()) { window.print(); return Promise.resolve(); }
    return save(true).then(function (no) {
      if (!no && !window.confirm('ออกเลข/บันทึกไม่สำเร็จ — พิมพ์โดยไม่มีเลขฟอร์มหรือไม่?')) return;
      window.print();
    });
  }

  // แจ้งผลแบบไม่บล็อก (toast มุมล่าง) สำหรับ success — ลดความรู้สึกหน่วง
  function toast(msg) {
    var t = document.getElementById('__toast');
    if (!t) {
      t = document.createElement('div');
      t.id = '__toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  // กันกดซ้ำระหว่างรอ server (กันส่งซ้ำ→ข้อมูลซ้ำ) + แสดงสถานะ "กำลัง…" บนปุ่ม
  var _inflight = false;
  function runExclusive(btn, label, fn) {
    if (_inflight) return;
    _inflight = true;
    var prevText, wasDisabled;
    if (btn) { prevText = btn.textContent; wasDisabled = btn.disabled; btn.textContent = label; btn.disabled = true; }
    var done = function () {
      _inflight = false;
      if (btn) { btn.textContent = prevText; btn.disabled = wasDisabled; }
    };
    Promise.resolve().then(fn).then(done, done);
  }

  // ===== modal ดึงข้อมูลผู้ป่วย (ดึงจาก server ล่าสุด 10, ค้นหาผ่าน server) =====
  function renderRecords(rows) {
    var box = document.getElementById('loadList');
    if (!box) return;
    if (!rows || !rows.length) { box.innerHTML = '<div class="modal-empty">ไม่พบรายการ</div>'; return; }
    box.innerHTML = '';
    rows.forEach(function (r) {
      var div = document.createElement('div');
      div.className = 'rec';
      var sub = [r.date, r.ptype].filter(Boolean).join(' · ');
      div.innerHTML = '<span class="rec-no">' + esc(r.formNo) + '</span>' +
        '<div class="rec-main"><div class="rec-name">' + esc(r.name || '(ไม่ระบุชื่อ)') +
        '</div><div class="rec-sub">' + esc(sub) + '</div></div>';
      div.addEventListener('click', function () { apply(r); closeModal(); });
      box.appendChild(div);
    });
  }

  function searchRecords(q) {
    var box = document.getElementById('loadList');
    if (box) box.innerHTML = '<div class="modal-empty">' + (q ? 'กำลังค้นหา…' : 'กำลังโหลด…') + '</div>';
    getList(q).then(function (r) {
      renderRecords((r && r.ok && r.rows) ? r.rows : []);
    }).catch(function (err) {
      if (box) box.innerHTML = '<div class="modal-empty">โหลดไม่สำเร็จ: ' + esc(err.message) + '</div>';
    });
  }

  function openModal() {
    if (!url()) { alert('ยังไม่ได้ตั้งค่า URL ใน js/config.js'); return; }
    var m = document.getElementById('loadModal');
    if (!m) return;
    m.style.display = 'flex';
    var search = document.getElementById('loadSearch');
    if (search) { search.value = ''; search.focus(); }
    searchRecords('');
  }

  function closeModal() {
    var m = document.getElementById('loadModal');
    if (m) m.style.display = 'none';
  }

  function init() {
    var bp = document.getElementById('btnPrint');
    if (bp) bp.addEventListener('click', function () { if (checkValid()) runExclusive(bp, 'กำลังออกเลข…', issueAndPrint); });
    var bs = document.getElementById('btnSave');
    if (bs) bs.addEventListener('click', function () { if (checkValid()) runExclusive(bs, 'กำลังบันทึก…', function () { return save(false); }); });
    var bl = document.getElementById('btnLoad');
    if (bl) bl.addEventListener('click', openModal);

    var lc = document.getElementById('loadModalClose');
    if (lc) lc.addEventListener('click', closeModal);
    var ls = document.getElementById('loadSearch');
    if (ls) {
      var searchTimer;
      ls.addEventListener('input', function (e) {
        var v = e.target.value.trim();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () { searchRecords(v); }, 350); // debounce กันยิง server ทุกตัวอักษร
      });
    }
    var ov = document.getElementById('loadModal');
    if (ov) ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

    loadPharmacists();
    loadWards();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
