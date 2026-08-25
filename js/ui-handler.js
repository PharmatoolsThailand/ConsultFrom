// แบบฟอร์มปรึกษาปัญหาการใช้ยา (FM-PTC-011) — UI interactions
// Vanilla replacement for the previous DCLogic component. Loaded as a classic
// <script> so it runs by double-clicking index.html (file://), no build step.

(function () {
  // ย่อฟอนต์ช่องชื่อเมื่อชื่อยาวเกินช่อง (ชื่อเต็มต้องอยู่บนบรรทัดเดียวตอนพิมพ์)
  // เผื่อ 1px: ความกว้างช่องที่ flex คำนวณเป็นทศนิยม (เช่น 133.47) → clientWidth ปัดลงเหลือ 133
  // แต่ scrollWidth ปัดขึ้นเป็น 134 กลายเป็น "ล้น" ทั้งที่ช่องยังว่าง แล้วย่อรวดเดียวจนถึง 8px
  function growName(el) {
    var fs = 17;
    el.style.fontSize = fs + 'px';
    el.style.paddingBottom = '1px';
    while (el.scrollWidth > el.clientWidth + 1 && fs > 8) {
      fs -= 0.5;
      el.style.fontSize = fs + 'px';
    }
    alignNameUnderline(el);
  }

  // ฟอนต์เล็กลง = กล่อง input เตี้ยลง เส้นใต้จึงลอยขึ้นไม่ตรงกับช่องอื่นในแถว
  function alignNameUnderline(el) {
    var ref = document.querySelector('[data-f="hn"]');
    if (!ref) return;
    var d = ref.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom;
    if (d > 0) el.style.paddingBottom = (1 + d) + 'px';
  }

  function doClear() {
    if (!window.confirm('ต้องการล้างข้อมูลทั้งฟอร์มหรือไม่? (ข้อมูลที่ยังไม่ได้บันทึกจะหาย)')) return;
    var scope = document.querySelector('.sheet') || document;
    scope.querySelectorAll('input[type="text"]').forEach(function (i) { i.value = ''; });
    scope.querySelectorAll('textarea').forEach(function (t) { t.value = ''; });
    scope.querySelectorAll('input[type="checkbox"]').forEach(function (c) { c.checked = false; });
    var nm = scope.querySelector('[data-name-field]');
    if (nm) growName(nm);
    var fno = scope.querySelector('[data-f="formNo"]');
    if (fno) fno.textContent = '—';
    setDefaults(); // ฟอร์มใหม่หลังล้าง: วันที่=วันนี้, เรียน=แพทย์เจ้าของไข้
    document.dispatchEvent(new Event('consult:cleared')); // ให้ module อื่น (template) รีเซ็ตตาม
  }

  // ปฏิทินเลือกวัน → แปลงเป็น พ.ศ. รูปแบบ ว/ด/ปปปป (เช่น 27/6/2569)
  function initDatePicker() {
    var pick = document.getElementById('datePicker');
    var field = document.querySelector('[data-f="date"]');
    if (!pick || !field) return;
    pick.addEventListener('change', function () {
      if (!pick.value) return;
      var p = pick.value.split('-'); // YYYY-MM-DD
      field.value = parseInt(p[2], 10) + '/' + parseInt(p[1], 10) + '/' + (parseInt(p[0], 10) + 543);
    });
  }

  // จำกัดกล่องข้อความไม่ให้พิมพ์เกินความสูงที่เห็น (เช่น รายละเอียด = 7 บรรทัด)
  // พอเกินจะเกิด scroll แล้วเนื้อหาที่ล้นหายตอนพิมพ์ → ปฏิเสธการพิมพ์ที่ทำให้ล้น
  function capToHeight(sel) {
    var el = document.querySelector(sel);
    if (!el) return;
    var last = el.value;
    el.addEventListener('focus', function () { last = el.value; }); // sync ค่าที่ถูก set มาโดยโปรแกรม (โหลด/template)
    el.addEventListener('input', function () {
      if (el.scrollHeight > el.clientHeight) el.value = last; // ล้น → ย้อนกลับค่าเดิม
      else last = el.value;
    });
  }

  // ค่าเริ่มต้นของฟอร์มใหม่: วันที่ = วันนี้ (พ.ศ.), เรียน = แพทย์เจ้าของไข้ (เฉพาะช่องที่ว่าง)
  function setDefaults() {
    var dateEl = document.querySelector('[data-f="date"]');
    if (dateEl && !dateEl.value.trim()) {
      var d = new Date();
      dateEl.value = d.getDate() + '/' + (d.getMonth() + 1) + '/' + (d.getFullYear() + 543);
    }
    var toEl = document.getElementById('fldTo');
    if (toEl && !toEl.value.trim()) toEl.value = 'แพทย์เจ้าของไข้';
  }

  // เติมหน่วยท้ายช่องอัตโนมัติ (โฟกัส = ถอดหน่วยเพื่อแก้ง่าย, ออกจากช่อง = เติมกลับ)
  function unitField(sel, unit) {
    var el = document.querySelector(sel);
    if (!el) return;
    var re = new RegExp('\\s*' + unit + '\\s*$');
    el.addEventListener('focus', function () { el.value = el.value.replace(re, '').trim(); });
    el.addEventListener('blur', function () {
      var v = el.value.trim();
      el.value = v ? (re.test(v) ? v : v + ' ' + unit) : '';
    });
  }

  function init() {
    var nm = document.querySelector('[data-name-field]');
    if (nm) nm.addEventListener('input', function (e) { growName(e.target); });

    var btnClear = document.getElementById('btnClear');
    if (btnClear) btnClear.addEventListener('click', doClear);

    initDatePicker();
    unitField('[data-f="age"]', 'ปี');
    unitField('[data-f="weight"]', 'kg');
    capToHeight('[data-f="detail"]');
    capToHeight('[data-f="otherDetail"]');
    setDefaults();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
