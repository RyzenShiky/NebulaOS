/* =========================================================
   APLIKASI: Word 2021 & Excel 2021
   Sengaja bergaya modern (ribbon) — kontras dengan shell
   Windows 1.0 di sekitarnya, seolah "software masa depan"
   yang nyasar jalan di sistem lama.

   Tombol Save di kedua app BENERAN men-download file
   (.doc untuk Word, .xls untuk Excel) lewat trik HTML-MHT
   yang dikenali Microsoft Office asli — 100% offline,
   tidak butuh koneksi internet atau library eksternal.
   Bukan simulasi — file itu betulan bisa dibuka di Word/Excel.
   ========================================================= */

/* ---------- util umum ---------- */
function wireRibbonTabs(root){
  const tabs = root.querySelectorAll('.o21-tabs span[data-tab]');
  const panels = root.querySelectorAll('.o21-panel');
  tabs.forEach(t=>{
    t.addEventListener('click', ()=>{
      tabs.forEach(x=>x.classList.remove('on'));
      panels.forEach(p=>p.classList.remove('active'));
      t.classList.add('on');
      const p = root.querySelector(`.o21-panel[data-tab="${t.dataset.tab}"]`);
      if(p) p.classList.add('active');
    });
  });
}
function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function downloadBlob(filename, mime, parts){
  const blob = new Blob(parts, {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
}
function saveAsWordDoc(filename, bodyHtml){
  const pre = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="utf-8"><title>Document</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>body{font-family:Calibri,Arial,sans-serif;font-size:12pt;} table{border-collapse:collapse;}</style>
</head><body>`;
  const post = `</body></html>`;
  downloadBlob(filename.endsWith('.doc')?filename:filename+'.doc', 'application/msword', ['\ufeff', pre, bodyHtml, post]);
}
function saveAsExcelXls(filename, tableHtml){
  const pre = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Sheet1</x:Name>
<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
</head><body>`;
  const post = `</body></html>`;
  downloadBlob(filename.endsWith('.xls')?filename:filename+'.xls', 'application/vnd.ms-excel', ['\ufeff', pre, tableHtml, post]);
}
function splitArgs(s){
  let args=[], depth=0, cur='', inStr=false;
  for(const ch of s){
    if(ch==='"') inStr=!inStr;
    if(ch===',' && !inStr && depth===0){ args.push(cur); cur=''; continue; }
    if(ch==='(') depth++;
    if(ch===')') depth--;
    cur+=ch;
  }
  args.push(cur);
  return args.map(a=>a.trim());
}
/* Eval aman untuk formula: setelah semua referensi sel & fungsi dikenal
   disubstitusi, string yang tersisa HARUS cuma berisi angka/operator
   matematika. Kalau masih ada huruf → nama fungsi tak dikenal (#NAME?).
   Kalau ada karakter aneh lain → #VALUE!. Baru dieksekusi via Function()
   setelah lolos whitelist ini, bukan eval() mentah atas input pengguna. */
function safeEvalExpr(expr){
  expr = expr.trim();
  if(expr==='') return '#VALUE!'; // ekspresi kosong (mis. cuma ketik "=")
  if(/[A-Za-z]/.test(expr)) return '#NAME?';
  if(!/^[0-9+\-*/%.()<>=!\s]*$/.test(expr)) return '#VALUE!';
  // validasi struktur dasar (post-sanitization check): tolak ekspresi yang
  // jelas-jelas menggantung di akhir (operator/titik) atau diawali operator
  // biner yang butuh operand kiri (*, /, %) — early exit tanpa perlu coba
  // eksekusi. Kasus rusak lain (kurung tak seimbang, "5+*", dst) tetap
  // ketangkep aman oleh try-catch di bawah tanpa perlu ditebak manual di sini,
  // supaya operator unary yang sah (mis. "5*-3", "-5+3") tidak ikut ketolak.
  if(/[+\-*/%.]$/.test(expr)) return '#VALUE!';
  if(/^[*/%]/.test(expr)) return '#VALUE!';
  try{
    const r = Function('"use strict";return('+expr+')')();
    return (typeof r==='number' && !isFinite(r)) ? '#VALUE!' : r;
  }catch(e){ return '#VALUE!'; }
}

/* =========================================================
   MICROSOFT WORD 2021
   ========================================================= */
APPS.word2021 = function(){
  const {body} = makeWindow({title:"Dokumen1 - Word", width:680, height:540});

  let footnoteCount=0, citationCount=0, figureCount=0, bookmarkCount=0, arrangeZ=1;
  let sources = [];
  let bookmarks = [];
  let trackChanges = false;
  let recordingMacro = false;
  let macroSteps = [];
  let versions = [];
  let selectedObj = null;
  let zoom = 100;

  body.innerHTML = `
  <div class="o21" id="wRoot">
    <div class="o21-ribbon word">
      <div class="o21-tabs">
        <span data-tab="File">File</span>
        <span data-tab="Home" class="on">Home</span>
        <span data-tab="Insert">Insert</span>
        <span data-tab="Layout">Layout</span>
        <span data-tab="References">References</span>
        <span data-tab="Mailings">Mailings</span>
        <span data-tab="Review">Review</span>
        <span data-tab="View">View</span>
        <span data-tab="Tools">Tools</span>
      </div>

      <div class="o21-panel active" data-tab="Home">
        <div class="o21-group">
          <div class="row">
            <button class="o21-btn" id="w-paste" title="Paste">📋</button>
            <button class="o21-btn" id="w-cut" title="Cut">✂</button>
            <button class="o21-btn" id="w-copy" title="Copy">⧉</button>
            <button class="o21-btn wide" id="w-fmtpainter" title="Format Painter">🖌 Painter</button>
          </div>
          <div class="label">Clipboard</div>
        </div>
        <div class="o21-group">
          <div class="row">
            <select class="o21-select" id="w-font">
              <option>Calibri</option><option>Arial</option><option>Georgia</option><option>Times New Roman</option><option>Consolas</option>
            </select>
            <select class="o21-select" id="w-size">
              <option>10</option><option selected>12</option><option>14</option><option>18</option><option>24</option><option>32</option>
            </select>
          </div>
          <div class="row">
            <button class="o21-btn" data-c="bold"><b>B</b></button>
            <button class="o21-btn" data-c="italic"><i>I</i></button>
            <button class="o21-btn" data-c="underline"><u>U</u></button>
            <button class="o21-btn" data-c="strikeThrough"><s>S</s></button>
            <input type="color" class="o21-color" id="w-color" value="#000000" title="Warna teks">
            <input type="color" class="o21-color" id="w-hl" value="#ffff00" title="Highlight">
          </div>
          <div class="label">Font</div>
        </div>
        <div class="o21-group">
          <div class="row">
            <button class="o21-btn" data-c="justifyLeft">≡</button>
            <button class="o21-btn" data-c="justifyCenter">≣</button>
            <button class="o21-btn" data-c="justifyRight">≡</button>
            <button class="o21-btn" data-c="justifyFull">☰</button>
            <button class="o21-btn" data-c="insertUnorderedList">•≡</button>
            <button class="o21-btn" data-c="insertOrderedList">1≡</button>
            <select class="o21-select" id="w-linespace"><option value="1">1.0</option><option value="1.5">1.5</option><option value="2">2.0</option></select>
            <button class="o21-btn wide" id="w-borders">Borders</button>
          </div>
          <div class="label">Paragraph</div>
        </div>
        <div class="o21-group">
          <div class="row">
            <select class="o21-select" id="w-style">
              <option value="p">Normal</option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
            </select>
          </div>
          <div class="label">Styles</div>
        </div>
        <div class="o21-group">
          <div class="row">
            <button class="o21-btn wide" id="w-find">🔍 Find</button>
            <button class="o21-btn wide" id="w-replace">Replace</button>
            <button class="o21-btn wide" id="w-selectall">Select All</button>
          </div>
          <div class="label">Editing</div>
        </div>
      </div>

      <div class="o21-panel" data-tab="Insert">
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-coverpage">Cover Page</button>
          <button class="o21-btn wide" id="w-blankpage">Blank Page</button>
          <button class="o21-btn wide" id="w-pagebreak">Page Break</button>
        </div><div class="label">Pages</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-table">Table</button>
        </div><div class="label">Tables</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-image">🖼 Picture</button>
          <input type="file" id="w-image-input" accept="image/*" style="display:none;">
          <button class="o21-btn wide" id="w-shape">▭ Shape</button>
          <button class="o21-btn wide" id="w-icon">🙂 Icon</button>
          <button class="o21-btn wide" id="w-smartart">SmartArt</button>
        </div><div class="label">Illustrations</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-link">🔗 Link</button>
          <button class="o21-btn wide" id="w-bookmark">Bookmark</button>
          <button class="o21-btn wide" id="w-gobookmark">Go To…</button>
        </div><div class="label">Links</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-headfoot">Header/Footer</button>
        </div><div class="label">Header &amp; Footer</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-textbox">Text Box</button>
          <button class="o21-btn wide" id="w-wordart">WordArt</button>
          <button class="o21-btn wide" id="w-dropcap">Drop Cap</button>
          <button class="o21-btn wide" id="w-signature">Signature</button>
          <button class="o21-btn wide" id="w-datetime">Date/Time</button>
        </div><div class="label">Text</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-equation">∑ Equation</button>
          <button class="o21-btn wide" id="w-symbol">Ω Symbol</button>
        </div><div class="label">Symbols</div></div>
      </div>

      <div class="o21-panel" data-tab="Layout">
        <div class="o21-group"><div class="row">
          <select class="o21-select" id="w-pagesize"><option value="794">A4</option><option value="816">Letter</option></select>
          <select class="o21-select" id="w-margin"><option value="72">Normal</option><option value="36">Narrow</option><option value="108">Wide</option></select>
          <button class="o21-btn wide" id="w-orient">🔄 Orientation</button>
          <select class="o21-select" id="w-columns"><option value="1">1 Col</option><option value="2">2 Col</option><option value="3">3 Col</option></select>
        </div><div class="label">Page Setup</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-indent-add">Indent +</button>
          <button class="o21-btn wide" id="w-indent-sub">Indent -</button>
          <button class="o21-btn wide" id="w-spacetight">Spasi Rapat</button>
          <button class="o21-btn wide" id="w-spaceloose">Spasi Renggang</button>
        </div><div class="label">Paragraph</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-front">Bring to Front</button>
          <button class="o21-btn wide" id="w-back">Send to Back</button>
        </div><div class="label">Arrange (klik gambar/shape dulu)</div></div>
      </div>

      <div class="o21-panel" data-tab="References">
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-toc">Table of Contents</button>
        </div><div class="label">Table of Contents</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-footnote">Insert Footnote</button>
        </div><div class="label">Footnotes</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-citation">Insert Citation</button>
          <button class="o21-btn wide" id="w-biblio">Bibliography</button>
        </div><div class="label">Citations &amp; Bibliography</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-caption">Insert Caption</button>
        </div><div class="label">Captions</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-markindex">Mark Entry</button>
          <button class="o21-btn wide" id="w-insertindex">Insert Index</button>
        </div><div class="label">Index</div></div>
      </div>

      <div class="o21-panel" data-tab="Mailings">
        <div class="o21-group" style="align-items:flex-start;"><div class="row" style="flex-direction:column;align-items:stretch;gap:4px;">
          <textarea id="w-mm-template" placeholder="Template surat. Gunakan {{Nama}} dan {{Kota}}" style="width:220px;height:50px;font-size:11px;">Yth. {{Nama}} di {{Kota}},

Terima kasih atas partisipasi Anda.</textarea>
          <textarea id="w-mm-list" placeholder="Satu penerima per baris: Nama,Kota" style="width:220px;height:40px;font-size:11px;">Budi,Jakarta
Siti,Bandung</textarea>
          <button class="o21-btn wide" id="w-mm-run">Buat Surat Gabungan</button>
        </div><div class="label">Mail Merge</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-envelope">✉ Envelope</button>
          <button class="o21-btn wide" id="w-label">🏷 Label</button>
        </div><div class="label">Envelopes &amp; Labels</div></div>
      </div>

      <div class="o21-panel" data-tab="Review">
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-spelling">✓ Spelling</button>
          <button class="o21-btn wide" id="w-thesaurus">Thesaurus</button>
        </div><div class="label">Proofing</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-lookup">🔎 Smart Lookup</button>
          <button class="o21-btn wide" id="w-translate">🌐 Translate</button>
        </div><div class="label">Insights / Language</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-comment">💬 Comment</button>
        </div><div class="label">Comments</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-track">Track Changes: OFF</button>
        </div><div class="label">Tracking</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-accept">✔ Accept All</button>
          <button class="o21-btn wide" id="w-reject">✘ Reject All</button>
        </div><div class="label">Changes</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-protect">🔒 Protect</button>
        </div><div class="label">Protect</div></div>
      </div>

      <div class="o21-panel" data-tab="View">
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-view-print">Print Layout</button>
          <button class="o21-btn wide" id="w-view-read">Read Mode</button>
          <button class="o21-btn wide" id="w-view-web">Web Layout</button>
        </div><div class="label">Views</div></div>
        <div class="o21-group"><div class="row">
          <label style="font-size:10px;"><input type="checkbox" id="w-show-ruler" checked> Ruler</label>
          <label style="font-size:10px;"><input type="checkbox" id="w-show-grid"> Gridlines</label>
          <label style="font-size:10px;"><input type="checkbox" id="w-show-nav"> Navigation Pane</label>
        </div><div class="label">Show</div></div>
        <div class="o21-group"><div class="row">
          <input type="range" id="w-zoom" min="50" max="200" value="100">
          <span id="w-zoom-val" style="font-size:10px;">100%</span>
        </div><div class="label">Zoom</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-split">⬛⬛ New Window</button>
        </div><div class="label">Window</div></div>
      </div>

      <div class="o21-panel" data-tab="Tools">
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-focus">Focus Mode</button>
        </div><div class="label">Focus</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-macro-rec">⏺ Record Macro</button>
          <button class="o21-btn wide" id="w-macro-play">▶ Play Macro</button>
        </div><div class="label">Macros <span class="o21-macro-status" id="w-macro-status"></span></div></div>
        <div class="o21-group" style="align-items:flex-start;"><div class="row" style="flex-direction:column;align-items:stretch;">
          <button class="o21-btn wide" id="w-ver-save">Simpan Versi</button>
          <div class="o21-versions-list" id="w-ver-list"></div>
        </div><div class="label">Version History</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="w-exportpdf">📄 Export PDF</button>
        </div><div class="label">Export</div></div>
      </div>

      <div class="o21-panel" data-tab="File">
        <div class="o21-file-panel">
          <button class="o21-btn wide" id="w-new">📄 New</button>
          <button class="o21-btn wide" id="w-save">💾 Save (download .doc)</button>
          <button class="o21-btn wide" id="w-save-txt">📃 Export sebagai .txt</button>
          <button class="o21-btn wide" id="w-print">🖨 Print</button>
          <span class="o21-sub">File otomatis terunduh ke perangkat kamu — berfungsi online maupun offline, bukan simulasi.<br>Kalau .doc diblokir "Protected View" oleh Word asli, pakai .txt sebagai cadangan teks mentah.<br>Print akan mengirim job ke Print Spooler beneran (buka app Print Spooler untuk melihat antreannya berjalan).</span>
        </div>
      </div>
    </div>

    <div class="o21-ruler" id="w-ruler"></div>
    <div class="o21-main">
      <div class="o21-navpane" id="w-navpane" style="display:none;">
        <div class="nph">Navigasi Heading <button class="o21-btn" id="w-nav-refresh" style="width:20px;height:16px;font-size:9px;">↻</button></div>
        <div id="w-nav-items"></div>
      </div>
      <div class="o21-word-scroll" id="w-scroll">
        <div class="o21-page-wrap">
          <div class="o21-page" contenteditable="true" id="w-page" style="width:794px;">
            <p>Mulai ketik dokumen kamu di sini...</p>
          </div>
        </div>
      </div>
    </div>
    <div class="o21-status">
      <span id="w-wordcount">0 kata</span>
      <span id="w-trackstatus"></span>
    </div>
  </div>`;

  wireRibbonTabs(body);
  const root = body.querySelector('#wRoot');
  const page = body.querySelector('#w-page');
  page.focus();

  /* ---- macro recorder: dengarkan klik semua tombol ribbon ---- */
  root.querySelector('.o21-ribbon').addEventListener('click', e=>{
    const btn = e.target.closest('button[id]');
    if(!btn) return;
    if(['w-macro-rec','w-macro-play'].includes(btn.id)) return;
    if(recordingMacro) macroSteps.push(btn.id);
  }, true);

  /* ---- Home ---- */
  body.querySelectorAll('[data-c]').forEach(b=>{
    b.onclick = ()=>{ page.focus(); document.execCommand(b.dataset.c, false, null); };
  });
  body.querySelector('#w-font').onchange = e=>{ page.focus(); document.execCommand('fontName', false, e.target.value); };
  body.querySelector('#w-size').onchange = e=>{
    page.focus();
    const map = {10:'2',12:'3',14:'4',18:'5',24:'6',32:'7'};
    document.execCommand('fontSize', false, map[e.target.value]||'3');
  };
  body.querySelector('#w-color').oninput = e=>{ page.focus(); document.execCommand('foreColor', false, e.target.value); };
  body.querySelector('#w-hl').oninput = e=>{ page.focus(); document.execCommand('hiliteColor', false, e.target.value); };
  body.querySelector('#w-style').onchange = e=>{ page.focus(); document.execCommand('formatBlock', false, e.target.value); };
  body.querySelector('#w-linespace').onchange = e=>{ page.style.lineHeight = e.target.value; };
  body.querySelector('#w-borders').onclick = ()=>{
    const tbl = window.getSelection().anchorNode && window.getSelection().anchorNode.parentElement && window.getSelection().anchorNode.parentElement.closest('table');
    if(tbl){ tbl.style.border = tbl.style.border ? '' : '2px solid #333'; tbl.querySelectorAll('td').forEach(td=> td.style.border = tbl.style.border ? '1px solid #333' : ''); }
    else alert('Klik di dalam tabel dahulu untuk mengatur border.');
  };
  body.querySelector('#w-copy').onclick = ()=>{ clipboard = window.getSelection().toString(); };
  body.querySelector('#w-cut').onclick = ()=>{ clipboard = window.getSelection().toString(); document.execCommand('delete'); };
  body.querySelector('#w-paste').onclick = ()=>{ page.focus(); document.execCommand('insertText', false, clipboard); };
  body.querySelector('#w-fmtpainter').onclick = ()=> alert('Format Painter: pilih teks sumber lalu tempel formatnya ke teks lain (simulasi).');
  body.querySelector('#w-selectall').onclick = ()=>{ page.focus(); document.execCommand('selectAll'); };
  body.querySelector('#w-find').onclick = ()=>{
    const q = prompt('Cari kata:'); if(!q) return;
    const found = window.find ? window.find(q) : (page.innerText||page.textContent||'').includes(q);
    if(!found) alert('Tidak ditemukan: '+q);
  };
  body.querySelector('#w-replace').onclick = ()=>{
    const q = prompt('Cari kata:'); if(!q) return;
    const r = prompt('Ganti dengan:',''); if(r===null) return;
    page.innerHTML = page.innerHTML.split(q).join(r);
  };

  /* ---- Insert ---- */
  body.querySelector('#w-coverpage').onclick = ()=>{
    const title = prompt('Judul dokumen:', 'Judul Dokumen') || 'Judul Dokumen';
    const sub = prompt('Subjudul / nama penulis:', '') || '';
    page.insertAdjacentHTML('afterbegin', `<div class="o21-coverpage"><h1>${escapeHtml(title)}</h1><div>${escapeHtml(sub)}</div></div>`);
  };
  body.querySelector('#w-blankpage').onclick = ()=>{ page.focus(); document.execCommand('insertHTML', false, '<div style="page-break-before:always;height:1px;"></div><p><br></p>'); };
  body.querySelector('#w-pagebreak').onclick = ()=>{ page.focus(); document.execCommand('insertHTML', false, '<div style="page-break-before:always;border-top:2px dashed #999;margin:16px 0;"></div>'); };
  body.querySelector('#w-table').onclick = ()=>{
    const rows = parseInt(prompt('Jumlah baris:', '3'))||3;
    const cols = parseInt(prompt('Jumlah kolom:', '3'))||3;
    page.focus();
    document.execCommand('insertHTML', false,
      `<table style="border-collapse:collapse;width:100%;margin:8px 0;">${
        Array.from({length:rows}, ()=> `<tr>${Array.from({length:cols},()=> `<td style="border:1px solid #999;padding:6px;">&nbsp;</td>`).join('')}</tr>`).join('')
      }</table>`);
  };
  body.querySelector('#w-image').onclick = ()=> body.querySelector('#w-image-input').click();
  body.querySelector('#w-image-input').onchange = e=>{
    const f = e.target.files[0]; if(!f) return;
    const reader = new FileReader();
    reader.onload = ()=>{ page.focus(); document.execCommand('insertImage', false, reader.result); };
    reader.readAsDataURL(f);
  };
  body.querySelector('#w-shape').onclick = ()=>{
    page.focus();
    document.execCommand('insertHTML', false, `<svg width="100" height="70" style="vertical-align:middle;"><rect width="98" height="68" x="1" y="1" fill="#dbe6f6" stroke="#2b579a" stroke-width="2"/></svg>`);
  };
  body.querySelector('#w-icon').onclick = ()=>{
    const icons = ['⭐','✅','📌','🔔','💡','📎','🏆','📈'];
    const s = prompt('Pilih ikon:\n'+icons.join(' '), '⭐');
    if(s){ page.focus(); document.execCommand('insertText', false, s); }
  };
  body.querySelector('#w-smartart').onclick = ()=>{
    page.focus();
    document.execCommand('insertHTML', false, `<div style="display:flex;align-items:center;gap:6px;margin:10px 0;">
      <div style="background:#2b579a;color:#fff;padding:8px 14px;border-radius:4px;">Langkah 1</div><div>→</div>
      <div style="background:#2b579a;color:#fff;padding:8px 14px;border-radius:4px;">Langkah 2</div><div>→</div>
      <div style="background:#2b579a;color:#fff;padding:8px 14px;border-radius:4px;">Langkah 3</div></div>`);
  };
  body.querySelector('#w-link').onclick = ()=>{
    const url = prompt('Alamat URL:', 'https://'); if(!url) return;
    const text = prompt('Teks tautan:', url) || url;
    page.focus();
    document.execCommand('insertHTML', false, `<a href="${url}" target="_blank">${escapeHtml(text)}</a>`);
  };
  body.querySelector('#w-bookmark').onclick = ()=>{
    const name = prompt('Nama bookmark:', 'bm'+(bookmarkCount+1)); if(!name) return;
    bookmarkCount++;
    const id = 'bm-'+name.replace(/\s+/g,'_');
    bookmarks.push({name, id});
    page.focus();
    document.execCommand('insertHTML', false, `<a id="${id}"></a>`);
  };
  body.querySelector('#w-gobookmark').onclick = ()=>{
    if(bookmarks.length===0){ alert('Belum ada bookmark.'); return; }
    const name = prompt('Ke bookmark mana?\n'+bookmarks.map(b=>b.name).join(', '));
    const bm = bookmarks.find(b=>b.name===name);
    if(!bm){ alert('Bookmark tidak ditemukan.'); return; }
    const el = body.querySelector('#'+bm.id);
    if(el) el.scrollIntoView({behavior:'smooth', block:'center'});
  };
  body.querySelector('#w-headfoot').onclick = ()=>{
    if(body.querySelector('#w-header')) { body.querySelector('#w-header').remove(); body.querySelector('#w-footer').remove(); return; }
    const header = document.createElement('div');
    header.id='w-header'; header.contentEditable='true';
    header.style.cssText='padding:6px 40px;color:#888;border-bottom:1px dashed #ccc;font-size:11px;';
    header.textContent = 'Header dokumen...';
    const footer = document.createElement('div');
    footer.id='w-footer'; footer.contentEditable='true';
    footer.style.cssText='padding:6px 40px;color:#888;border-top:1px dashed #ccc;font-size:11px;';
    footer.textContent = 'Halaman 1';
    page.parentElement.insertBefore(header, page);
    page.parentElement.appendChild(footer);
  };
  body.querySelector('#w-textbox').onclick = ()=>{
    page.focus();
    document.execCommand('insertHTML', false, `<div class="o21-textbox" contenteditable="true">Kotak teks</div>`);
  };
  body.querySelector('#w-wordart').onclick = ()=>{
    const t = prompt('Teks WordArt:', 'JUDUL'); if(!t) return;
    page.focus();
    document.execCommand('insertHTML', false, `<div class="o21-wordart">${escapeHtml(t)}</div>`);
  };
  body.querySelector('#w-dropcap').onclick = ()=>{
    const sel = window.getSelection();
    if(!sel.rangeCount){ alert('Klik di dalam paragraf dahulu.'); return; }
    let node = sel.anchorNode;
    while(node && node.nodeType!==1) node = node.parentNode;
    while(node && node.tagName!=='P' && node!==page) node = node.parentNode;
    if(!node || node===page){ alert('Klik di dalam sebuah paragraf (bukan judul) dahulu.'); return; }
    const text = node.textContent;
    if(!text.trim()) return;
    const first = text.trim()[0], rest = text.trim().slice(1);
    node.innerHTML = `<span class="o21-dropcap">${escapeHtml(first)}</span>${escapeHtml(rest)}`;
  };
  body.querySelector('#w-signature').onclick = ()=>{
    page.focus();
    document.execCommand('insertHTML', false, `<div class="o21-sigline">Tanda tangan &nbsp;&nbsp;&nbsp; Nama: ______________ &nbsp;&nbsp; Tanggal: ______________</div>`);
  };
  body.querySelector('#w-datetime').onclick = ()=>{
    page.focus();
    document.execCommand('insertText', false, new Date().toLocaleString('id-ID'));
  };
  body.querySelector('#w-equation').onclick = ()=>{
    const eq = prompt('Tulis persamaan (mis. x^2 + y^2 = r^2):', 'x^2 + y^2 = r^2'); if(!eq) return;
    page.focus();
    document.execCommand('insertHTML', false, `<span style="font-style:italic;font-family:Georgia,serif;background:#f5f5f5;padding:2px 6px;border-radius:3px;">${escapeHtml(eq)}</span>`);
  };
  body.querySelector('#w-symbol').onclick = ()=>{
    const symbols = ['©','®','™','€','£','¥','±','≈','≠','∞','π','Ω','§','†','•'];
    const s = prompt('Pilih simbol (ketik salah satu):\n'+symbols.join(' '), '©');
    if(s) { page.focus(); document.execCommand('insertText', false, s); }
  };

  /* ---- Layout ---- */
  body.querySelector('#w-pagesize').onchange = e=>{ page.style.width = e.target.value+'px'; };
  body.querySelector('#w-margin').onchange = e=>{ page.style.padding = e.target.value+'px'; };
  let landscape = false;
  body.querySelector('#w-orient').onclick = ()=>{
    landscape = !landscape;
    page.style.width = landscape ? '1123px' : '794px';
  };
  body.querySelector('#w-columns').onchange = e=>{ page.style.columnCount = e.target.value; page.style.columnGap='24px'; };
  body.querySelector('#w-indent-add').onclick = ()=>{ page.focus(); document.execCommand('indent'); };
  body.querySelector('#w-indent-sub').onclick = ()=>{ page.focus(); document.execCommand('outdent'); };
  body.querySelector('#w-spacetight').onclick = ()=>{ page.style.lineHeight='1.1'; };
  body.querySelector('#w-spaceloose').onclick = ()=>{ page.style.lineHeight='2'; };
  page.addEventListener('click', e=>{
    if(e.target.tagName==='IMG' || e.target.closest('svg') || e.target.classList.contains('o21-textbox')){
      if(selectedObj) selectedObj.style.outline='';
      selectedObj = e.target.closest('svg') || e.target;
      selectedObj.style.outline = '2px dashed #2b579a';
    }
  });
  body.querySelector('#w-front').onclick = ()=>{
    if(!selectedObj){ alert('Klik dulu gambar/shape yang ingin diatur.'); return; }
    selectedObj.style.position='relative'; selectedObj.style.zIndex = ++arrangeZ;
  };
  body.querySelector('#w-back').onclick = ()=>{
    if(!selectedObj){ alert('Klik dulu gambar/shape yang ingin diatur.'); return; }
    selectedObj.style.position='relative'; selectedObj.style.zIndex = --arrangeZ;
  };

  /* ---- References ---- */
  body.querySelector('#w-toc').onclick = ()=>{
    const heads = page.querySelectorAll('h1,h2,h3');
    if(heads.length===0){ alert('Belum ada Heading di dokumen. Gunakan Home > Styles untuk membuat Heading.'); return; }
    let list = '<div class="o21-toc"><b>Daftar Isi</b><ol>';
    heads.forEach((h,i)=>{ h.id = h.id || ('toc-'+i); list += `<li><a href="#${h.id}">${h.textContent}</a></li>`; });
    list += '</ol></div>';
    page.insertAdjacentHTML('afterbegin', list);
  };
  body.querySelector('#w-footnote').onclick = ()=>{
    const note = prompt('Isi catatan kaki:'); if(!note) return;
    footnoteCount++;
    page.focus();
    document.execCommand('insertHTML', false, `<sup>${footnoteCount}</sup>`);
    let fn = page.parentElement.querySelector('.o21-footnotes');
    if(!fn){ fn = document.createElement('div'); fn.className='o21-footnotes'; page.after(fn); }
    fn.innerHTML += `<div>${footnoteCount}. ${escapeHtml(note)}</div>`;
  };
  body.querySelector('#w-citation').onclick = ()=>{
    const author = prompt('Nama penulis sumber:'); if(!author) return;
    const year = prompt('Tahun:', '2024') || '2024';
    sources.push({author, year});
    citationCount++;
    page.focus();
    document.execCommand('insertText', false, ` (${author}, ${year})`);
  };
  body.querySelector('#w-biblio').onclick = ()=>{
    if(sources.length===0){ alert('Belum ada sitasi. Gunakan Insert Citation dahulu.'); return; }
    let list = '<div style="margin-top:20px;"><b>Daftar Pustaka</b><ul>';
    sources.forEach(s=> list += `<li>${escapeHtml(s.author)} (${s.year}).</li>`);
    list += '</ul></div>';
    page.insertAdjacentHTML('beforeend', list);
  };
  body.querySelector('#w-caption').onclick = ()=>{
    const type = prompt('Jenis (Gambar/Tabel):', 'Gambar') || 'Gambar';
    const text = prompt('Keterangan:', '') || '';
    figureCount++;
    page.focus();
    document.execCommand('insertHTML', false, `<div style="font-size:11px;color:#555;font-style:italic;">${type} ${figureCount}: ${escapeHtml(text)}</div>`);
  };
  body.querySelector('#w-markindex').onclick = ()=>{
    const sel = window.getSelection();
    if(!sel || sel.toString().trim()===''){ alert('Blok kata yang ingin dijadikan entri indeks.'); return; }
    const range = sel.getRangeAt(0);
    const mark = document.createElement('mark');
    mark.className='o21-idx';
    range.surroundContents(mark);
  };
  body.querySelector('#w-insertindex').onclick = ()=>{
    const marks = page.querySelectorAll('mark.o21-idx');
    if(marks.length===0){ alert('Belum ada entri indeks. Gunakan Mark Entry dahulu.'); return; }
    const terms = [...new Set([...marks].map(m=>m.textContent.trim()))].sort();
    let list = '<div style="margin-top:20px;column-count:2;"><b>Indeks</b><br>'+terms.map(t=>escapeHtml(t)).join('<br>')+'</div>';
    page.insertAdjacentHTML('beforeend', list);
  };

  /* ---- Mailings ---- */
  body.querySelector('#w-mm-run').onclick = ()=>{
    const tpl = body.querySelector('#w-mm-template').value;
    const rows = body.querySelector('#w-mm-list').value.split('\n').map(l=>l.trim()).filter(Boolean);
    let out = '';
    rows.forEach(row=>{
      const [nama, kota] = row.split(',').map(s=>(s||'').trim());
      let letter = tpl.replace(/{{\s*Nama\s*}}/g, nama||'').replace(/{{\s*Kota\s*}}/g, kota||'');
      out += `<div style="border-top:2px dashed #999;margin-top:16px;padding-top:12px;">${letter.split('\n').map(l=>`<p>${escapeHtml(l)}</p>`).join('')}</div>`;
    });
    page.insertAdjacentHTML('beforeend', out);
    alert('Surat gabungan untuk '+rows.length+' penerima ditambahkan ke dokumen.');
  };
  body.querySelector('#w-envelope').onclick = ()=>{
    const to = prompt('Alamat tujuan:', 'Nama Penerima\nJl. Contoh No.1\nKota'); if(!to) return;
    const from = prompt('Alamat pengirim:', 'Nama Pengirim') || '';
    page.insertAdjacentHTML('beforeend', `<div style="border:1px solid #999;padding:20px;width:400px;margin:16px auto;position:relative;height:200px;">
      <div style="font-size:11px;">${escapeHtml(from)}</div>
      <div style="position:absolute;bottom:30px;right:30px;font-size:13px;">${to.split('\n').map(l=>escapeHtml(l)).join('<br>')}</div>
      </div>`);
  };
  body.querySelector('#w-label').onclick = ()=>{
    const text = prompt('Teks label:', 'Nama\nAlamat'); if(!text) return;
    page.insertAdjacentHTML('beforeend', `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0;">
      ${Array.from({length:6},()=>`<div style="border:1px dashed #999;padding:8px;font-size:11px;">${text.split('\n').map(l=>escapeHtml(l)).join('<br>')}</div>`).join('')}
      </div>`);
  };

  /* ---- Review ---- */
  body.querySelector('#w-spelling').onclick = ()=> alert('Pemeriksaan ejaan selesai — tidak ditemukan kesalahan (simulasi, tanpa kamus daring).');
  const thesaurusDict = {
    'bagus':['baik','hebat','mengagumkan'], 'baik':['bagus','oke','positif'],
    'besar':['luas','raksasa','signifikan'], 'kecil':['mini','mungil','sedikit'],
    'cepat':['gesit','lekas','kilat'], 'lambat':['pelan','perlahan'],
    'indah':['cantik','elok','memukau'], 'penting':['krusial','esensial','vital'],
  };
  body.querySelector('#w-thesaurus').onclick = ()=>{
    const sel = window.getSelection().toString().trim().toLowerCase();
    if(!sel){ alert('Pilih (blok) satu kata dahulu.'); return; }
    const syn = thesaurusDict[sel];
    alert(syn ? `Sinonim untuk "${sel}": ${syn.join(', ')}` : `Sinonim untuk "${sel}" tidak ditemukan (kamus terbatas, simulasi).`);
  };
  body.querySelector('#w-lookup').onclick = ()=>{
    const sel = window.getSelection().toString();
    alert(sel ? `Smart Lookup: "${sel}" (simulasi — hasil pencarian tidak tersedia offline)` : 'Pilih kata dahulu untuk mencari.');
  };
  body.querySelector('#w-translate').onclick = ()=> alert('Translate: fitur simulasi, tidak terhubung ke layanan terjemahan asli.');
  body.querySelector('#w-comment').onclick = ()=>{
    const sel = window.getSelection();
    if(!sel || sel.toString().trim()===''){ alert('Pilih (blok) teks dahulu untuk diberi komentar.'); return; }
    const note = prompt('Komentar:'); if(!note) return;
    const range = sel.getRangeAt(0);
    const mark = document.createElement('mark');
    mark.className='o21-comment'; mark.title = note;
    range.surroundContents(mark);
  };
  const trackBtn = body.querySelector('#w-track');
  trackBtn.onclick = ()=>{
    trackChanges = !trackChanges;
    trackBtn.textContent = 'Track Changes: '+(trackChanges?'ON':'OFF');
    body.querySelector('#w-trackstatus').textContent = trackChanges ? 'Perubahan sedang dilacak' : '';
  };
  page.addEventListener('beforeinput', e=>{
    if(!trackChanges) return;
    if(e.inputType==='insertText' && e.data){
      e.preventDefault();
      document.execCommand('insertHTML', false, `<span class="tc-ins">${escapeHtml(e.data)}</span>`);
    }
  });
  body.querySelector('#w-accept').onclick = ()=>{
    page.querySelectorAll('.tc-ins').forEach(sp=>{ sp.replaceWith(document.createTextNode(sp.textContent)); });
    alert('Semua perubahan diterima.');
  };
  body.querySelector('#w-reject').onclick = ()=>{
    page.querySelectorAll('.tc-ins').forEach(sp=> sp.remove());
    alert('Semua perubahan ditolak.');
  };
  body.querySelector('#w-protect').onclick = ()=>{
    const locked = page.contentEditable==='false';
    if(locked){
      const pw = prompt('Masukkan password untuk membuka proteksi:');
      if(pw===null) return;
      page.contentEditable='true'; alert('Dokumen dibuka kembali untuk disunting.');
    } else {
      prompt('Buat password proteksi:','');
      page.contentEditable='false'; alert('Dokumen dikunci dari penyuntingan.');
    }
  };

  /* ---- View ---- */
  body.querySelector('#w-view-print').onclick = ()=>{ page.classList.remove('readmode'); page.style.maxWidth=''; };
  body.querySelector('#w-view-read').onclick = ()=>{ page.classList.add('readmode'); };
  body.querySelector('#w-view-web').onclick = ()=>{ page.style.padding='20px'; page.style.boxShadow='none'; };
  body.querySelector('#w-show-ruler').onchange = e=>{ body.querySelector('#w-ruler').style.display = e.target.checked?'block':'none'; };
  body.querySelector('#w-show-grid').onchange = e=>{ page.classList.toggle('gridlines', e.target.checked); };
  function rebuildNav(){
    const wrap = body.querySelector('#w-nav-items');
    const heads = page.querySelectorAll('h1,h2,h3');
    wrap.innerHTML = heads.length ? '' : '<div style="color:#999;">Belum ada Heading</div>';
    heads.forEach((h,i)=>{
      h.id = h.id || ('nav-'+i);
      const d = document.createElement('div');
      d.className='nitem'; d.style.paddingLeft = (h.tagName==='H1'?4:h.tagName==='H2'?14:24)+'px';
      d.textContent = h.textContent || '(kosong)';
      d.onclick = ()=> h.scrollIntoView({behavior:'smooth', block:'center'});
      wrap.appendChild(d);
    });
  }
  body.querySelector('#w-show-nav').onchange = e=>{
    body.querySelector('#w-navpane').style.display = e.target.checked?'block':'none';
    if(e.target.checked) rebuildNav();
  };
  body.querySelector('#w-nav-refresh').onclick = rebuildNav;
  body.querySelector('#w-zoom').oninput = e=>{
    zoom = e.target.value;
    page.style.transform = `scale(${zoom/100})`;
    page.style.transformOrigin = 'top center';
    body.querySelector('#w-zoom-val').textContent = zoom+'%';
  };
  body.querySelector('#w-split').onclick = ()=> launchApp('word2021');

  /* ---- Tools ---- */
  body.querySelector('#w-focus').onclick = ()=> root.classList.toggle('focus-mode');
  const macroStatus = body.querySelector('#w-macro-status');
  body.querySelector('#w-macro-rec').onclick = ()=>{
    recordingMacro = !recordingMacro;
    if(recordingMacro) macroSteps = [];
    macroStatus.textContent = recordingMacro ? '● Merekam...' : (macroSteps.length ? macroSteps.length+' langkah tersimpan' : '');
  };
  body.querySelector('#w-macro-play').onclick = ()=>{
    if(macroSteps.length===0){ alert('Belum ada macro yang direkam.'); return; }
    macroSteps.forEach(id=>{ const b = body.querySelector('#'+id); if(b) b.click(); });
  };
  const verList = body.querySelector('#w-ver-list');
  function renderVersions(){
    verList.innerHTML = versions.length ? '' : 'Belum ada versi tersimpan.';
    versions.forEach((v,i)=>{
      const d = document.createElement('div');
      d.innerHTML = `<span>${v.time.toLocaleTimeString('id-ID')}</span>`;
      const btn = document.createElement('button');
      btn.className='o21-btn'; btn.textContent='Restore'; btn.style.width='auto'; btn.style.padding='0 6px';
      btn.onclick = ()=>{ page.innerHTML = v.html; };
      d.appendChild(btn);
      verList.appendChild(d);
    });
  }
  body.querySelector('#w-ver-save').onclick = ()=>{ versions.push({time:new Date(), html:page.innerHTML}); renderVersions(); };
  body.querySelector('#w-exportpdf').onclick = ()=>{
    const w = window.open('', '_blank');
    if(!w){ alert('Popup diblokir browser — izinkan popup untuk Export PDF.'); return; }
    w.document.write(`<html><head><title>Export PDF</title><style>body{font-family:Calibri,Arial,sans-serif;padding:40px;}</style></head><body>${page.innerHTML}</body></html>`);
    w.document.close(); w.focus();
    setTimeout(()=>w.print(), 300);
  };

  /* ---- File / Save ---- */
  body.querySelector('#w-new').onclick = ()=>{ if(confirm('Buat dokumen baru? Perubahan yang belum disimpan akan hilang.')) page.innerHTML='<p>Mulai ketik dokumen kamu di sini...</p>'; };
  body.querySelector('#w-save').onclick = ()=>{
    const filename = prompt('Simpan sebagai (nama file):', 'Dokumen1.doc') || 'Dokumen1.doc';
    const header = body.querySelector('#w-header') ? body.querySelector('#w-header').innerHTML+'<hr>' : '';
    const footer = body.querySelector('#w-footer') ? '<hr>'+body.querySelector('#w-footer').innerHTML : '';
    saveAsWordDoc(filename, header + page.innerHTML + footer);
  };
  body.querySelector('#w-save-txt').onclick = ()=>{
    const filename = prompt('Simpan sebagai (nama file):', 'Dokumen1.txt') || 'Dokumen1.txt';
    downloadBlob(filename.endsWith('.txt')?filename:filename+'.txt', 'text/plain;charset=utf-8', [(page.innerText||page.textContent||'')]);
  };
  body.querySelector('#w-print').onclick = ()=>{
    const jobName = prompt('Nama dokumen untuk dicetak:', 'Dokumen1.doc') || 'Dokumen1.doc';
    addPrintJob(jobName);
    alert('"'+jobName+'" ditambahkan ke antrean Print Spooler.\nBuka app Print Spooler untuk melihat progres cetaknya berjalan.');
  };

  /* ---- word count ---- */
  function updateCount(){
    const text = (page.innerText||page.textContent||'').trim();
    const words = text ? text.split(/\s+/).length : 0;
    body.querySelector('#w-wordcount').textContent = words+' kata';
  }
  page.addEventListener('input', updateCount);
  updateCount();
};

/* =========================================================
   MICROSOFT EXCEL 2021
   ========================================================= */
APPS.excel2021 = function(){
  const {body} = makeWindow({title:"Buku1 - Excel", width:720, height:520});
  const COLS = 10, ROWS = 30;
  const colLetter = i => String.fromCharCode(65+i);
  const cellId = (r,c) => colLetter(c)+(r+1);
  const parseRef = ref => { const m = ref.match(/^([A-Z]+)(\d+)$/); return {c:m[1].charCodeAt(0)-65, r:+m[2]-1}; };

  const sheets = { Sheet1:{}, Sheet2:{}, Sheet3:{} };
  let currentSheet = 'Sheet1';
  let cells = sheets[currentSheet];
  const validations = {};
  const condFormats = [];
  let recordingMacro = false, macroSteps = [];
  let goalSeekBusy = false;

  function resolveArg(tok, seen){
    tok = tok.trim();
    if(/^".*"$/.test(tok)) return tok.slice(1,-1);
    if(/^-?\d+(\.\d+)?$/.test(tok)) return parseFloat(tok);
    if(/^[A-Z]+\d+$/i.test(tok)) return evalCell(tok.toUpperCase(), seen);
    return tok;
  }
  function rangeCells(a,b){
    const pa=parseRef(a), pb=parseRef(b);
    const r1=Math.min(pa.r,pb.r), r2=Math.max(pa.r,pb.r);
    const c1=Math.min(pa.c,pb.c), c2=Math.max(pa.c,pb.c);
    const list=[];
    for(let r=r1;r<=r2;r++) for(let c=c1;c<=c2;c++) list.push(cellId(r,c));
    return list;
  }

  /* jaring pengaman terluar: rumus apa pun yang rusak (kurung tak seimbang,
     regex tak cocok, dsb.) tidak boleh melempar exception ke luar dan
     menghentikan simulator — selalu kembalikan kode error Excel standar. */
  function evalCell(id, seen){
    try{
      return evalCellInner(id, seen);
    }catch(e){
      return '#VALUE!';
    }
  }

  function evalCellInner(id, seen){
    seen = seen || new Set();
    const raw = cells[id];
    if(raw===undefined || raw==='') return '';
    if(seen.has(id)) return '#REF!';
    seen.add(id);
    if(String(raw).startsWith('=')){
      let expr = raw.slice(1).toUpperCase();

      const rangeFn = expr.match(/^(SUM|AVERAGE|MAX|MIN|COUNT)\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
      if(rangeFn){
        const [,fn,a,b] = rangeFn;
        let vals=[];
        rangeCells(a,b).forEach(rid=>{ const v=parseFloat(evalCell(rid,seen)); if(!isNaN(v)) vals.push(v); });
        if(fn==='SUM') return vals.reduce((x,y)=>x+y,0);
        if(fn==='AVERAGE') return vals.length? +(vals.reduce((x,y)=>x+y,0)/vals.length).toFixed(2) : 0;
        if(fn==='MAX') return vals.length? Math.max(...vals):0;
        if(fn==='MIN') return vals.length? Math.min(...vals):0;
        if(fn==='COUNT') return vals.length;
      }

      const ifFn = expr.match(/^IF\((.+),(.+),(.+)\)$/);
      if(ifFn){
        const cond = ifFn[1].replace(/[A-Z]+\d+/g, r=>{ const n=parseFloat(evalCell(r,seen)); return isNaN(n)?0:n; });
        const res = safeEvalExpr(cond);
        if(res==='#NAME?' || res==='#VALUE!') return res;
        return res ? ifFn[2].replace(/^"|"$/g,'') : ifFn[3].replace(/^"|"$/g,'');
      }

      const vlookupFn = expr.match(/^VLOOKUP\((.+)\)$/);
      if(vlookupFn){
        const args = splitArgs(vlookupFn[1]);
        const lookupVal = resolveArg(args[0], seen);
        const rg = args[1].match(/^([A-Z]+\d+):([A-Z]+\d+)$/);
        if(!rg) return '#REF!';
        const colIdx = parseInt(resolveArg(args[2], seen))-1;
        const pa = parseRef(rg[1]), pb = parseRef(rg[2]);
        const r1=Math.min(pa.r,pb.r), r2=Math.max(pa.r,pb.r), c1=Math.min(pa.c,pb.c);
        for(let r=r1;r<=r2;r++){
          const v = evalCell(cellId(r,c1), seen);
          if(String(v)===String(lookupVal)) return evalCell(cellId(r,c1+colIdx), seen);
        }
        return '#N/A';
      }

      const xlookupFn = expr.match(/^XLOOKUP\((.+)\)$/);
      if(xlookupFn){
        const args = splitArgs(xlookupFn[1]);
        const lookupVal = resolveArg(args[0], seen);
        const lr = args[1].match(/^([A-Z]+\d+):([A-Z]+\d+)$/), rr = args[2].match(/^([A-Z]+\d+):([A-Z]+\d+)$/);
        if(!lr||!rr) return '#REF!';
        const lookupIds = rangeCells(lr[1], lr[2]);
        const returnIds = rangeCells(rr[1], rr[2]);
        for(let i=0;i<lookupIds.length;i++){
          if(String(evalCell(lookupIds[i],seen))===String(lookupVal)) return evalCell(returnIds[i]||returnIds[0], seen);
        }
        return '#N/A';
      }

      const matchFn = expr.match(/^MATCH\((.+)\)$/);
      if(matchFn){
        const args = splitArgs(matchFn[1]);
        const val = resolveArg(args[0], seen);
        const rg = args[1].match(/^([A-Z]+\d+):([A-Z]+\d+)$/);
        if(!rg) return '#REF!';
        const ids = rangeCells(rg[1], rg[2]);
        for(let i=0;i<ids.length;i++){ if(String(evalCell(ids[i],seen))===String(val)) return i+1; }
        return '#N/A';
      }

      const indexFn = expr.match(/^INDEX\((.+)\)$/);
      if(indexFn){
        const args = splitArgs(indexFn[1]);
        const rg = args[0].match(/^([A-Z]+\d+):([A-Z]+\d+)$/);
        if(!rg) return '#REF!';
        const rowN = parseInt(resolveArg(args[1], seen));
        const pa = parseRef(rg[1]);
        const targetR = pa.r + rowN - 1;
        const targetC = args[2] ? pa.c + parseInt(resolveArg(args[2],seen)) - 1 : pa.c;
        return evalCell(cellId(targetR, targetC), seen);
      }

      // fungsi berupa NAMA(...) yang tidak dikenal semua pola di atas → #NAME?
      if(/^[A-Z_][A-Z0-9_]*\(/.test(expr)) return '#NAME?';

      expr = expr.replace(/[A-Z]+\d+/g, r=>{
        const v = evalCell(r, seen);
        const n = parseFloat(v);
        return isNaN(n) ? 0 : n;
      });
      return safeEvalExpr(expr);
    }
    return raw;
  }

  let html = `<div class="o21">
    <div class="o21-ribbon excel">
      <div class="o21-tabs">
        <span data-tab="File">File</span>
        <span data-tab="Home" class="on">Home</span>
        <span data-tab="Insert">Insert</span>
        <span data-tab="Formulas">Formulas</span>
        <span data-tab="Data">Data</span>
        <span data-tab="Tools">Tools</span>
      </div>

      <div class="o21-panel active" data-tab="Home">
        <div class="o21-group">
          <div class="row">
            <button class="o21-btn" id="x-bold"><b>B</b></button>
            <button class="o21-btn" id="x-italic"><i>I</i></button>
            <input type="color" class="o21-color" id="x-color" value="#000000" title="Warna sel">
          </div>
          <div class="label">Font</div>
        </div>
        <div class="o21-group">
          <div class="row">
            <select class="o21-select" id="x-format">
              <option value="general">General</option>
              <option value="number">Number</option>
              <option value="currency">Currency</option>
              <option value="percent">Percentage</option>
            </select>
          </div>
          <div class="label">Angka</div>
        </div>
        <div class="o21-group">
          <div class="row"><button class="o21-btn wide" id="x-autosum">Σ AutoSum</button></div>
          <div class="label">Editing</div>
        </div>
      </div>

      <div class="o21-panel" data-tab="Insert">
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="x-chart">📊 Bar</button>
          <button class="o21-btn wide" id="x-chart-line">📈 Line</button>
          <button class="o21-btn wide" id="x-chart-pie">🥧 Pie</button>
        </div><div class="label">Charts</div></div>
        <div class="o21-group"><div class="row"><button class="o21-btn wide" id="x-addrow">+ Baris</button></div><div class="label">Tables</div></div>
        <div class="o21-group"><div class="row"><button class="o21-btn wide" id="x-sparkline">Sparkline</button></div><div class="label">Sparklines</div></div>
      </div>

      <div class="o21-panel" data-tab="Formulas">
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" data-fn="SUM">SUM</button>
          <button class="o21-btn wide" data-fn="AVERAGE">AVERAGE</button>
          <button class="o21-btn wide" data-fn="COUNT">COUNT</button>
          <button class="o21-btn wide" data-fn="MAX">MAX</button>
          <button class="o21-btn wide" data-fn="MIN">MIN</button>
        </div><div class="label">Function Library</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="x-if">IF</button>
          <button class="o21-btn wide" id="x-vlookup">VLOOKUP</button>
          <button class="o21-btn wide" id="x-xlookup">XLOOKUP</button>
          <button class="o21-btn wide" id="x-indexmatch">INDEX/MATCH</button>
        </div><div class="label">Logical &amp; Lookup</div></div>
      </div>

      <div class="o21-panel" data-tab="Data">
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="x-sort-asc">Sort A→Z</button>
          <button class="o21-btn wide" id="x-sort-desc">Sort Z→A</button>
        </div><div class="label">Sort</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="x-filter">Filter</button>
          <button class="o21-btn wide" id="x-filter-clear">Hapus Filter</button>
        </div><div class="label">Filter</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="x-flashfill">Flash Fill</button>
          <button class="o21-btn wide" id="x-validation">Data Validation</button>
        </div><div class="label">Data Tools</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="x-pivot">PivotTable</button>
          <button class="o21-btn wide" id="x-slicer">Slicer</button>
        </div><div class="label">Analysis</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="x-goalseek">Goal Seek</button>
        </div><div class="label">What-If Analysis</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="x-condformat">Conditional Format</button>
        </div><div class="label">Styles</div></div>
      </div>

      <div class="o21-panel" data-tab="Tools">
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="x-freeze">❄ Freeze Panes</button>
        </div><div class="label">Window</div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="x-macro-rec">⏺ Record Macro</button>
          <button class="o21-btn wide" id="x-macro-play">▶ Play Macro</button>
        </div><div class="label">Macros <span class="o21-macro-status" id="x-macro-status"></span></div></div>
        <div class="o21-group"><div class="row">
          <button class="o21-btn wide" id="x-protect">🔒 Protect Sheet</button>
        </div><div class="label">Protect</div></div>
      </div>

      <div class="o21-panel" data-tab="File">
        <div class="o21-file-panel">
          <button class="o21-btn wide" id="x-new">📄 New</button>
          <button class="o21-btn wide" id="x-save">💾 Save (download .xls)</button>
          <button class="o21-btn wide" id="x-save-csv">📃 Export sebagai .csv</button>
          <span class="o21-sub">File otomatis terunduh ke perangkat kamu — berfungsi online maupun offline, bukan simulasi.<br>Kalau .xls diblokir "Protected View" oleh Excel asli, pakai .csv sebagai data mentah.</span>
        </div>
      </div>
    </div>
    <div class="o21-formula-bar">
      <input class="o21-cellref" id="x-ref" value="A1">
      <input class="o21-formula-input" id="x-fx" placeholder="Masukkan nilai atau formula, contoh: =SUM(A1:A5)">
    </div>
    <div class="o21-grid-wrap">
      <table class="o21-grid" id="x-grid"><thead><tr><th class="rowhead"></th>${Array.from({length:COLS},(_,c)=>`<th>${colLetter(c)}</th>`).join('')}</tr></thead><tbody>`;
  for(let r=0;r<ROWS;r++){
    html += `<tr><th class="rowhead">${r+1}</th>`;
    for(let c=0;c<COLS;c++){
      html += `<td><input data-id="${cellId(r,c)}"></td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table></div>
    <div class="o21-sheet-tabs" id="x-sheettabs"></div>
    <div class="o21-chart-box" id="x-chartbox" style="display:none;">
      <canvas id="x-canvas" width="480" height="160"></canvas>
      <div id="x-extra"></div>
    </div>
  </div>`;
  body.innerHTML = html;
  wireRibbonTabs(body);

  const rootEl = body.querySelector('.o21');
  rootEl.querySelector('.o21-ribbon').addEventListener('click', e=>{
    const btn = e.target.closest('button[id]');
    if(!btn) return;
    if(['x-macro-rec','x-macro-play'].includes(btn.id)) return;
    if(recordingMacro) macroSteps.push(btn.id);
  }, true);

  let activeId = 'A1';
  let chartType = 'bar';
  const ref = body.querySelector('#x-ref');
  const fx = body.querySelector('#x-fx');
  const grid = body.querySelector('#x-grid');

  function renderSheetTabs(){
    const bar = body.querySelector('#x-sheettabs');
    bar.innerHTML = Object.keys(sheets).map(name=>
      `<div class="stab ${name===currentSheet?'on':''}" data-s="${name}">${name}</div>`
    ).join('') + `<div class="stab-add" id="x-sheet-add">+</div>`;
    bar.querySelectorAll('.stab').forEach(t=>{
      t.onclick = ()=> switchSheet(t.dataset.s);
      t.addEventListener('dblclick', ()=>{
        const newName = prompt('Ganti nama sheet:', t.dataset.s);
        if(newName && newName!==t.dataset.s && !sheets[newName]){
          sheets[newName] = sheets[t.dataset.s];
          delete sheets[t.dataset.s];
          if(currentSheet===t.dataset.s) currentSheet = newName;
          cells = sheets[currentSheet];
          renderSheetTabs();
        }
      });
    });
    bar.querySelector('#x-sheet-add').onclick = ()=>{
      let i=1; while(sheets['Sheet'+i]) i++;
      const name = 'Sheet'+i;
      sheets[name] = {};
      switchSheet(name);
    };
  }
  function switchSheet(name){
    currentSheet = name;
    cells = sheets[name];
    grid.querySelectorAll('input[data-id]').forEach(inp=>{
      inp.value=''; inp.style=''; inp.parentElement.style.background='';
    });
    refreshAll();
    renderSheetTabs();
  }

  function refreshDisplay(id){
    const inp = grid.querySelector(`input[data-id="${id}"]`);
    if(!inp || document.activeElement===inp) return;
    const v = evalCell(id);
    inp.value = (v===undefined?'':v);
    const {c} = parseRef(id);
    condFormats.forEach(rule=>{
      if(rule.col!==c) return;
      const n = parseFloat(v);
      if(isNaN(n)) return;
      const match = rule.op==='>' ? n>rule.val : rule.op==='<' ? n<rule.val : n===rule.val;
      if(match) inp.parentElement.style.background = rule.color;
    });
  }
  function refreshAll(){ Object.keys(cells).forEach(refreshDisplay); }

  function wireCell(inp){
    inp.addEventListener('focus', ()=>{
      activeId = inp.dataset.id;
      ref.value = activeId;
      fx.value = cells[activeId] !== undefined ? cells[activeId] : '';
      inp.value = cells[activeId] !== undefined ? cells[activeId] : '';
    });
    inp.addEventListener('blur', ()=>{
      const id = inp.dataset.id;
      const val = inp.value;
      const rule = validations[id];
      if(rule){
        if(rule.type==='number'){
          const n = parseFloat(val);
          if(val!=='' && (isNaN(n) || n<rule.min || n>rule.max)){
            alert(`Nilai harus angka antara ${rule.min} dan ${rule.max}.`);
            inp.value = cells[id] || ''; return;
          }
        } else if(rule.type==='list'){
          if(val!=='' && !rule.values.includes(val)){
            alert('Nilai harus salah satu dari: '+rule.values.join(', '));
            inp.value = cells[id] || ''; return;
          }
        }
      }
      cells[id] = val;
      refreshDisplay(id);
      refreshAll();
    });
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter') inp.blur(); });
  }
  grid.querySelectorAll('input[data-id]').forEach(wireCell);
  renderSheetTabs();

  fx.addEventListener('keydown', e=>{
    if(e.key==='Enter'){
      cells[activeId] = fx.value;
      const inp = grid.querySelector(`input[data-id="${activeId}"]`);
      if(inp) inp.value = fx.value;
      refreshDisplay(activeId);
      refreshAll();
    }
  });
  fx.addEventListener('focus', ()=>{ fx.value = cells[activeId] !== undefined ? cells[activeId] : ''; });
  ref.addEventListener('keydown', e=>{
    if(e.key==='Enter'){
      const target = ref.value.trim().toUpperCase();
      const inp = grid.querySelector(`input[data-id="${target}"]`);
      if(inp){ inp.focus(); inp.scrollIntoView({block:'center'}); }
      else alert('Referensi sel tidak valid.');
    }
  });

  /* ---- Home ---- */
  body.querySelector('#x-bold').onclick = ()=>{
    const inp = grid.querySelector(`input[data-id="${activeId}"]`);
    if(inp) inp.style.fontWeight = inp.style.fontWeight==='bold' ? 'normal' : 'bold';
  };
  body.querySelector('#x-italic').onclick = ()=>{
    const inp = grid.querySelector(`input[data-id="${activeId}"]`);
    if(inp) inp.style.fontStyle = inp.style.fontStyle==='italic' ? 'normal' : 'italic';
  };
  body.querySelector('#x-color').oninput = e=>{
    const td = grid.querySelector(`input[data-id="${activeId}"]`)?.parentElement;
    if(td) td.style.background = e.target.value;
  };
  body.querySelector('#x-format').onchange = e=>{
    const id = activeId;
    const n = parseFloat(evalCell(id));
    if(isNaN(n)) return;
    let display = n;
    if(e.target.value==='number') display = n.toFixed(2);
    if(e.target.value==='currency') display = 'Rp' + n.toLocaleString('id-ID');
    if(e.target.value==='percent') display = (n*100).toFixed(1)+'%';
    const inp = grid.querySelector(`input[data-id="${id}"]`);
    if(inp) inp.value = display;
  };
  body.querySelector('#x-autosum').onclick = ()=>{
    const {c,r} = parseRef(activeId);
    let top = r;
    while(top>0 && cells[cellId(top-1,c)]!==undefined && cells[cellId(top-1,c)]!=='') top--;
    if(top===r) return;
    const formula = `=SUM(${cellId(top,c)}:${cellId(r-1,c)})`;
    cells[activeId] = formula;
    const inp = grid.querySelector(`input[data-id="${activeId}"]`);
    if(inp) inp.value = formula;
    refreshDisplay(activeId);
  };

  /* ---- Insert ---- */
  function showChartBox(){ body.querySelector('#x-chartbox').style.display='block'; drawChart(); }
  body.querySelector('#x-chart').onclick = ()=>{ chartType='bar'; showChartBox(); };
  body.querySelector('#x-chart-line').onclick = ()=>{ chartType='line'; showChartBox(); };
  body.querySelector('#x-chart-pie').onclick = ()=>{ chartType='pie'; showChartBox(); };
  body.querySelector('#x-addrow').onclick = ()=>{
    const tbody = grid.querySelector('tbody');
    const rIndex = tbody.children.length;
    const tr = document.createElement('tr');
    tr.innerHTML = `<th class="rowhead">${rIndex+1}</th>` + Array.from({length:COLS},(_,c)=>`<td><input data-id="${cellId(rIndex,c)}"></td>`).join('');
    tbody.appendChild(tr);
    tr.querySelectorAll('input').forEach(wireCell);
  };
  body.querySelector('#x-sparkline').onclick = ()=>{
    const {r} = parseRef(activeId);
    const vals = [];
    for(let c=0;c<COLS;c++){ const v=parseFloat(evalCell(cellId(r,c))); if(!isNaN(v)) vals.push(v); }
    if(vals.length<2){ alert('Isi minimal 2 sel angka di baris ini.'); return; }
    const max=Math.max(...vals), min=Math.min(...vals);
    const pts = vals.map((v,i)=> `${i*(100/(vals.length-1))},${30-((v-min)/((max-min)||1))*28}`).join(' ');
    const box = body.querySelector('#x-chartbox'); box.style.display='block';
    body.querySelector('#x-extra').innerHTML += `<div>Baris ${r+1}: <svg width="110" height="32" class="o21-sparkline"><polyline points="${pts}" fill="none" stroke="#217346" stroke-width="2"/></svg></div>`;
  };

  /* ---- Formulas ---- */
  body.querySelectorAll('[data-fn]').forEach(btn=>{
    btn.onclick = ()=>{ fx.value = `=${btn.dataset.fn}(A1:A5)`; fx.focus(); };
  });
  body.querySelector('#x-if').onclick = ()=>{ fx.value = '=IF(A1>10,"Besar","Kecil")'; fx.focus(); };
  body.querySelector('#x-vlookup').onclick = ()=>{ fx.value = '=VLOOKUP(A1,B1:C10,2)'; fx.focus(); };
  body.querySelector('#x-xlookup').onclick = ()=>{ fx.value = '=XLOOKUP(A1,B1:B10,C1:C10)'; fx.focus(); };
  body.querySelector('#x-indexmatch').onclick = ()=>{ fx.value = '=INDEX(B1:B10,MATCH(A1,C1:C10,0))'; fx.focus(); alert('Catatan: pada simulator ini INDEX dan MATCH dievaluasi sebagai formula terpisah per sel, bukan bersarang.'); };

  /* ---- Data ---- */
  function currentRows(){
    const rows = [];
    for(let r=0;r<ROWS;r++){
      const rowVals=[]; let any=false;
      for(let c=0;c<COLS;c++){ const v=cells[cellId(r,c)]; rowVals.push(v||''); if(v) any=true; }
      if(any) rows.push({r, vals:rowVals});
    }
    return rows;
  }
  function sortByColumn(desc){
    const {c} = parseRef(activeId);
    const rows = currentRows();
    rows.sort((a,b)=>{
      const va=parseFloat(evalCell(cellId(a.r,c))), vb=parseFloat(evalCell(cellId(b.r,c)));
      const na = isNaN(va)?String(a.vals[c]):va, nb = isNaN(vb)?String(b.vals[c]):vb;
      if(na<nb) return desc?1:-1; if(na>nb) return desc?-1:1; return 0;
    });
    rows.forEach((row,i)=> row.vals.forEach((v,c2)=>{ cells[cellId(i,c2)] = v; }));
    for(let r=0;r<rows.length;r++) for(let c2=0;c2<COLS;c2++) refreshDisplay(cellId(r,c2));
    refreshAll();
  }
  body.querySelector('#x-sort-asc').onclick = ()=> sortByColumn(false);
  body.querySelector('#x-sort-desc').onclick = ()=> sortByColumn(true);
  body.querySelector('#x-filter').onclick = ()=>{
    const {c} = parseRef(activeId);
    const q = prompt('Tampilkan baris di kolom '+colLetter(c)+' yang berisi:'); if(q===null) return;
    for(let r=0;r<ROWS;r++){
      const tr = grid.querySelectorAll('tbody tr')[r];
      const v = String(evalCell(cellId(r,c))||'');
      tr.style.display = v.includes(q) || v==='' ? '' : 'none';
    }
  };
  body.querySelector('#x-filter-clear').onclick = ()=>{ grid.querySelectorAll('tbody tr').forEach(tr=> tr.style.display=''); };
  body.querySelector('#x-flashfill').onclick = ()=>{
    const {c:targetCol} = parseRef(activeId);
    const srcLetter = prompt('Kolom sumber (contoh: A):', 'A'); if(!srcLetter) return;
    const srcCol = srcLetter.toUpperCase().charCodeAt(0)-65;
    const rows = currentRows().filter(row=> row.vals[srcCol]);
    if(rows.length<1){ alert('Kolom sumber kosong.'); return; }
    const exampleRow = rows.find(row=> cells[cellId(row.r, targetCol)]);
    if(!exampleRow){ alert('Isi satu contoh hasil di baris pertama kolom target dahulu, lalu jalankan Flash Fill.'); return; }
    const src = String(evalCell(cellId(exampleRow.r, srcCol)));
    const example = String(cells[cellId(exampleRow.r, targetCol)]);
    let mode = 'copy';
    if(src.split(' ')[0]===example) mode='first';
    else if(src.split(' ').pop()===example) mode='last';
    else if(src.includes(example)) mode='substr';
    rows.forEach(row=>{
      if(row.r===exampleRow.r) return;
      const v = String(evalCell(cellId(row.r, srcCol)));
      let result = v;
      if(mode==='first') result = v.split(' ')[0];
      else if(mode==='last') result = v.split(' ').pop();
      else if(mode==='substr') result = v;
      cells[cellId(row.r, targetCol)] = result;
      refreshDisplay(cellId(row.r, targetCol));
    });
    alert('Flash Fill diterapkan ke '+ (rows.length-1) +' baris (mode: '+mode+').');
  };
  body.querySelector('#x-validation').onclick = ()=>{
    const type = prompt('Jenis validasi untuk sel '+activeId+': ketik "number" atau "list"', 'number');
    if(type==='number'){
      const min = parseFloat(prompt('Nilai minimum:', '0'));
      const max = parseFloat(prompt('Nilai maksimum:', '100'));
      validations[activeId] = {type:'number', min, max};
      alert('Validasi angka '+min+'–'+max+' diterapkan pada '+activeId+'.');
    } else if(type==='list'){
      const values = (prompt('Daftar nilai valid (pisahkan koma):','A,B,C')||'').split(',').map(s=>s.trim());
      validations[activeId] = {type:'list', values};
      alert('Validasi daftar diterapkan pada '+activeId+'.');
    }
  };
  body.querySelector('#x-pivot').onclick = ()=>{
    const groupLetter = prompt('Kolom untuk dikelompokkan (contoh: A):', 'A'); if(!groupLetter) return;
    const valueLetter = prompt('Kolom nilai untuk dijumlahkan (contoh: B):', 'B'); if(!valueLetter) return;
    const gc = groupLetter.toUpperCase().charCodeAt(0)-65, vc = valueLetter.toUpperCase().charCodeAt(0)-65;
    const groups = {};
    currentRows().forEach(row=>{
      const key = String(evalCell(cellId(row.r,gc))||'(kosong)');
      const val = parseFloat(evalCell(cellId(row.r,vc)))||0;
      groups[key] = (groups[key]||0) + val;
    });
    let tbl = '<div class="o21-pivot"><b>PivotTable</b><table><tr><th>'+groupLetter.toUpperCase()+'</th><th>Total '+valueLetter.toUpperCase()+'</th></tr>';
    Object.entries(groups).forEach(([k,v])=>{ tbl += `<tr><td>${escapeHtml(k)}</td><td>${v}</td></tr>`; });
    tbl += '</table></div>';
    const box = body.querySelector('#x-chartbox'); box.style.display='block';
    body.querySelector('#x-extra').innerHTML = tbl;
  };
  body.querySelector('#x-slicer').onclick = ()=>{
    const letter = prompt('Kolom untuk dijadikan slicer (contoh: A):', 'A'); if(!letter) return;
    const c = letter.toUpperCase().charCodeAt(0)-65;
    const values = [...new Set(currentRows().map(row=> String(evalCell(cellId(row.r,c)))).filter(Boolean))];
    let html2 = '<div class="o21-slicer"><b>Slicer '+letter.toUpperCase()+'</b><br>'+values.map(v=>`<button data-v="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join('')+' <button data-v="__all__">Semua</button></div>';
    const box = body.querySelector('#x-chartbox'); box.style.display='block';
    const extra = body.querySelector('#x-extra');
    extra.innerHTML = html2;
    extra.querySelectorAll('button').forEach(b=>{
      b.onclick = ()=>{
        extra.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        const v = b.dataset.v;
        grid.querySelectorAll('tbody tr').forEach((tr,r)=>{
          if(v==='__all__'){ tr.style.display=''; return; }
          tr.style.display = String(evalCell(cellId(r,c)))===v ? '' : 'none';
        });
      };
    });
  };
  body.querySelector('#x-goalseek').onclick = ()=>{
    if(goalSeekBusy) return;
    const targetId = (prompt('Sel target (berisi formula), contoh B5:', 'B5')||'').toUpperCase();
    const targetVal = parseFloat(prompt('Nilai target yang diinginkan:', '100'));
    const changeId = (prompt('Sel yang boleh diubah, contoh A1:', 'A1')||'').toUpperCase();
    if(!cells[targetId] || isNaN(targetVal) || !changeId) { alert('Input tidak lengkap.'); return; }
    goalSeekBusy = true;
    let lo=-100000, hi=100000, guess=parseFloat(cells[changeId])||0;
    for(let i=0;i<60;i++){
      const mid = (lo+hi)/2;
      cells[changeId] = String(mid);
      const result = parseFloat(evalCell(targetId, new Set()));
      if(isNaN(result)) break;
      if(result < targetVal) lo = mid; else hi = mid;
      guess = mid;
    }
    cells[changeId] = String(Math.round(guess*100)/100);
    refreshDisplay(changeId); refreshDisplay(targetId); refreshAll();
    goalSeekBusy = false;
    alert(`Goal Seek selesai: ${changeId} ≈ ${cells[changeId]} agar ${targetId} ≈ ${targetVal} (hasil aktual: ${evalCell(targetId, new Set())}).`);
  };
  body.querySelector('#x-condformat').onclick = ()=>{
    const {c} = parseRef(activeId);
    const op = prompt('Operator (>, <, =):', '>') || '>';
    const val = parseFloat(prompt('Nilai ambang:', '50'));
    const color = prompt('Warna (kode hex):', '#ffcccc') || '#ffcccc';
    condFormats.push({col:c, op, val, color});
    refreshAll();
    alert('Conditional formatting diterapkan ke kolom '+colLetter(c)+'.');
  };

  function drawChart(){
    const canvas = body.querySelector('#x-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const vals = [];
    for(let r=0;r<ROWS;r++){
      const v = parseFloat(evalCell(cellId(r,0)));
      if(!isNaN(v)) vals.push(v); else if(vals.length) break;
    }
    if(vals.length===0){
      ctx.fillStyle='#888'; ctx.font='12px sans-serif';
      ctx.fillText('Isi kolom A dengan angka untuk menampilkan chart', 10, 80);
      return;
    }
    const max = Math.max(...vals, 1);
    if(chartType==='bar'){
      const bw = canvas.width / vals.length;
      vals.forEach((v,i)=>{
        const h = (v/max) * 130;
        ctx.fillStyle = '#217346';
        ctx.fillRect(i*bw+6, canvas.height-h-20, bw-12, h);
        ctx.fillStyle = '#333'; ctx.font='10px sans-serif';
        ctx.fillText('A'+(i+1), i*bw+8, canvas.height-6);
      });
    } else if(chartType==='line'){
      ctx.strokeStyle='#217346'; ctx.lineWidth=2; ctx.beginPath();
      vals.forEach((v,i)=>{
        const x = i*(canvas.width/(vals.length-1||1));
        const y = canvas.height-20-(v/max)*130;
        i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
      });
      ctx.stroke();
    } else if(chartType==='pie'){
      const total = vals.reduce((a,b)=>a+b,0) || 1;
      let start=0;
      const colors=['#217346','#4caf80','#8bd4b0','#c8e6d5','#2b579a','#6ea8fe'];
      vals.forEach((v,i)=>{
        const slice = (v/total)*Math.PI*2;
        ctx.fillStyle = colors[i%colors.length];
        ctx.beginPath(); ctx.moveTo(100,80); ctx.arc(100,80,70,start,start+slice); ctx.closePath(); ctx.fill();
        start += slice;
      });
    }
  }

  /* ---- Tools ---- */
  const xMacroStatus = body.querySelector('#x-macro-status');
  body.querySelector('#x-macro-rec').onclick = ()=>{
    recordingMacro = !recordingMacro;
    if(recordingMacro) macroSteps = [];
    xMacroStatus.textContent = recordingMacro ? '● Merekam...' : (macroSteps.length ? macroSteps.length+' langkah tersimpan' : '');
  };
  body.querySelector('#x-macro-play').onclick = ()=>{
    if(macroSteps.length===0){ alert('Belum ada macro yang direkam.'); return; }
    macroSteps.forEach(id=>{ const b = body.querySelector('#'+id); if(b) b.click(); });
  };
  body.querySelector('#x-freeze').onclick = ()=> grid.classList.toggle('frozen');
  let sheetLocked = false;
  body.querySelector('#x-protect').onclick = ()=>{
    if(sheetLocked){
      const pw = prompt('Masukkan password untuk membuka:'); if(pw===null) return;
      grid.querySelectorAll('input').forEach(i=> i.disabled=false);
      sheetLocked=false; alert('Sheet dibuka kembali.');
    } else {
      prompt('Buat password proteksi:','');
      grid.querySelectorAll('input').forEach(i=> i.disabled=true);
      sheetLocked=true; alert('Sheet dikunci dari penyuntingan.');
    }
  };

  /* ---- File / Save ---- */
  body.querySelector('#x-new').onclick = ()=>{
    if(!confirm('Buat sheet baru? Data yang belum disimpan akan hilang.')) return;
    Object.keys(cells).forEach(k=>delete cells[k]);
    grid.querySelectorAll('input[data-id]').forEach(inp=>{ inp.value=''; inp.style=''; inp.parentElement.style.background=''; });
  };
  body.querySelector('#x-save').onclick = ()=>{
    const filename = prompt('Simpan sebagai (nama file):', 'Buku1.xls') || 'Buku1.xls';
    let tbl = '<table border="1"><tr><td></td>'+Array.from({length:COLS},(_,c)=>`<td><b>${colLetter(c)}</b></td>`).join('')+'</tr>';
    for(let r=0;r<ROWS;r++){
      tbl += `<tr><td><b>${r+1}</b></td>`;
      for(let c=0;c<COLS;c++){ tbl += `<td>${escapeHtml(String(evalCell(cellId(r,c))||''))}</td>`; }
      tbl += '</tr>';
    }
    tbl += '</table>';
    saveAsExcelXls(filename, tbl);
  };
  body.querySelector('#x-save-csv').onclick = ()=>{
    const filename = prompt('Simpan sebagai (nama file):', 'Buku1.csv') || 'Buku1.csv';
    let csv = '';
    for(let r=0;r<ROWS;r++){
      const row = [];
      for(let c=0;c<COLS;c++){
        let v = String(evalCell(cellId(r,c))||'');
        if(v.includes(',')||v.includes('"')) v = '"'+v.replace(/"/g,'""')+'"';
        row.push(v);
      }
      csv += row.join(',')+'\r\n';
    }
    downloadBlob(filename.endsWith('.csv')?filename:filename+'.csv', 'text/csv;charset=utf-8', ['\ufeff', csv]);
  };
};
