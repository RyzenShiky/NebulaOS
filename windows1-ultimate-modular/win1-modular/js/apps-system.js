/* =========================================================
   APLIKASI: Control Panel, PIF Editor, Print Spooler
   ========================================================= */

const schemes = {
  "Windows Standard": {desk:"#008080", title:"#000080"},
  "Hercules Mono": {desk:"#1a1a1a", title:"#000000"},
  "CGA Bold": {desk:"#550055", title:"#aa0000"},
  "EGA Sky": {desk:"#0000aa", title:"#00aaaa"},
  "Hijau Klasik": {desk:"#0b3d0b", title:"#145214"},
};
/* dipakai bareng oleh Control Panel dan Copilot 1985 (perintah "ubah tema") */
function applyTheme(schemeName){
  const sc = schemes[schemeName];
  if(!sc) return false;
  document.documentElement.style.setProperty('--desk-bg', sc.desk);
  document.documentElement.style.setProperty('--title-active', sc.title);
  saveTheme(sc.desk, sc.title);
  return true;
}

/* ---- Control Panel ---- */
APPS.control = function(){
  const {body} = makeWindow({title:"Control Panel", width:360, height:280, resizable:false});
  body.innerHTML = `<div class="cp-grid">
    <div class="cp-item" id="cp-color"><div class="cp-icon">🎨</div>Colors</div>
    <div class="cp-item" id="cp-wallpaper"><div class="cp-icon">🖼</div>Wallpaper</div>
    <div class="cp-item" id="cp-date"><div class="cp-icon">📅</div>Date/Time</div>
    <div class="cp-item" id="cp-mouse"><div class="cp-icon">🖱</div>Mouse</div>
    <div class="cp-item" id="cp-tiling"><div class="cp-icon">▦</div>Window Tiling</div>
    <div class="cp-item" id="cp-reset"><div class="cp-icon">⟲</div>Reset Sistem</div>
  </div>
  <div id="cp-panel" class="app-pad"></div>`;
  const panel = body.querySelector('#cp-panel');
  body.querySelector('#cp-color').onclick=()=>{
    panel.innerHTML = 'Pilih skema warna:<br>'+ Object.keys(schemes).map(s=>`<button class="win-btn" data-s="${s}" style="margin:4px;">${s}</button>`).join('');
    panel.querySelectorAll('[data-s]').forEach(b=>{
      b.onclick=()=> applyTheme(b.dataset.s);
    });
  };
  body.querySelector('#cp-wallpaper').onclick=()=>{
    const hasWallpaper = !!(localStorage.getItem && localStorage.getItem('nebula-win1-wallpaper'));
    panel.innerHTML = `
      <div><b>Upload gambar dari perangkat:</b></div>
      <input type="file" id="cp-wp-file" accept="image/*" style="margin:4px 0;">
      <div class="o21-sub">Format umum (JPG/PNG/GIF/WebP) didukung. Gambar besar mungkin gagal tersimpan kalau melebihi kapasitas penyimpanan browser — kalau begitu, coba gambar dengan ukuran file lebih kecil.</div>
      <div style="margin-top:10px;"><b>Atau pakai URL gambar:</b></div>
      <input type="text" id="cp-wp-url" placeholder="https://..." style="width:90%;margin:4px 0;">
      <button class="win-btn" id="cp-wp-apply-url">Terapkan URL</button>
      <div class="o21-sub">Catatan: sebagian situs memblokir gambar mereka dipakai dari domain lain (CORS/hotlink protection) — kalau gambar tidak muncul, coba unduh dulu lalu upload sebagai file.</div>
      <div style="margin-top:12px;">
        <button class="win-btn" id="cp-wp-clear" ${hasWallpaper?'':'disabled'}>Hapus Wallpaper (kembali ke warna tema)</button>
      </div>
      <div class="o21-sub" id="cp-wp-status" style="margin-top:8px;"></div>`;
    const statusEl = panel.querySelector('#cp-wp-status');

    panel.querySelector('#cp-wp-file').onchange = (e)=>{
      const file = e.target.files[0];
      if(!file) return;
      if(!file.type.startsWith('image/')){
        statusEl.textContent = 'File yang dipilih bukan gambar.';
        statusEl.style.color = '#a30000';
        return;
      }
      const reader = new FileReader();
      reader.onload = ()=>{
        const ok = setWallpaper(reader.result);
        panel.querySelector('#cp-wp-clear').disabled = false;
        if(ok){
          statusEl.textContent = '✔ Wallpaper diterapkan dan disimpan.';
          statusEl.style.color = '';
        } else {
          // tetap diterapkan secara visual untuk sesi ini, walau gagal tersimpan permanen
          statusEl.textContent = '⚠ Wallpaper diterapkan untuk sesi ini, tapi GAGAL disimpan permanen (kemungkinan ukuran file terlalu besar untuk penyimpanan browser). Wallpaper akan hilang saat refresh — coba gambar yang lebih kecil.';
          statusEl.style.color = '#a30000';
        }
      };
      reader.onerror = ()=>{ statusEl.textContent = 'Gagal membaca file.'; statusEl.style.color='#a30000'; };
      reader.readAsDataURL(file);
    };
    panel.querySelector('#cp-wp-apply-url').onclick = ()=>{
      const url = panel.querySelector('#cp-wp-url').value.trim();
      if(!url){ statusEl.textContent = 'Masukkan URL gambar dulu.'; statusEl.style.color='#a30000'; return; }
      const ok = setWallpaper(url);
      panel.querySelector('#cp-wp-clear').disabled = false;
      statusEl.textContent = ok ? '✔ Wallpaper diterapkan dari URL.' : '⚠ Diterapkan untuk sesi ini, gagal disimpan permanen.';
      statusEl.style.color = ok ? '' : '#a30000';
    };
    panel.querySelector('#cp-wp-clear').onclick = ()=>{
      clearWallpaper();
      statusEl.textContent = 'Wallpaper dihapus, kembali ke warna tema.';
      statusEl.style.color = '';
      panel.querySelector('#cp-wp-clear').disabled = true;
    };
  };
  body.querySelector('#cp-date').onclick=()=>{
    panel.innerHTML = 'Tanggal &amp; waktu sistem: '+simNow().toLocaleString('id-ID')+'<div class="o21-sub" style="margin-top:6px;">Untuk mengubah tanggal/waktu sistem, gunakan BIOS Setup (tekan DEL saat boot).</div>';
  };
  body.querySelector('#cp-mouse').onclick=()=>{
    panel.innerHTML = `Kecepatan mouse (beneran mengatur seberapa cepat jendela bergeser saat digeser):<br>
      <input type="range" id="cp-mouse-range" min="0.3" max="3" step="0.1" value="${mouseSensitivity}"> <span id="cp-mouse-val">${mouseSensitivity}x</span>
      <div class="o21-sub">Coba geser jendela mana pun setelah mengatur ini — kecepatannya beneran berubah.</div>`;
    const range = panel.querySelector('#cp-mouse-range');
    range.oninput = ()=>{
      setMouseSensitivity(parseFloat(range.value));
      panel.querySelector('#cp-mouse-val').textContent = range.value+'x';
    };
  };
  body.querySelector('#cp-tiling').onclick=()=>{
    panel.innerHTML = `<label><input type="checkbox" id="cp-tiling-chk" ${tilingAutopilot?'checked':''}> Aktifkan Mode Autopilot Tiling</label>
      <div class="o21-sub">Kalau aktif, setiap jendela dibuka/ditutup/diminimize, semua jendela otomatis disusun ubin (tiling) memenuhi layar tanpa bertumpuk — sesuai gaya asli Windows 1.0 tahun 1985.</div>`;
    panel.querySelector('#cp-tiling-chk').onchange = e=> setTilingAutopilot(e.target.checked);
  };
  body.querySelector('#cp-reset').onclick=()=>{
    panel.innerHTML = `<div style="color:#a30000;font-weight:bold;">⚠ Reset Sistem</div>
      <div class="o21-sub" style="margin:6px 0;">Menghapus SEMUA data tersimpan: file di MS-DOS Executive, dokumen yang kamu buat, baseline Nebula File Guard, tema warna, dan pengaturan mouse/tiling. Sistem akan dimuat ulang seperti kondisi awal pertama kali dibuka.</div>
      <button class="win-btn" id="cp-reset-btn" style="border-color:#a30000;">Reset Seluruh Sistem...</button>`;
    panel.querySelector('#cp-reset-btn').onclick = confirmResetSystem;
  };
};

/* ---- PIF Editor ---- */
APPS.pif = function(){
  const {body} = makeWindow({title:"PIF Editor - (untitled)", width:380, height:300, resizable:false});
  body.innerHTML = `<div class="app-pad">
    <div class="pif-row"><label>Program Filename:</label><input id="pif-name" value="PROGRAM.EXE"></div>
    <div class="pif-row"><label>Window Title:</label><input id="pif-title" value="Program DOS"></div>
    <div class="pif-row"><label>Memory Required (KB):</label><input id="pif-mem" value="128"></div>
    <div class="pif-row"><label>EMS Memory (KB):</label><input id="pif-ems" value="0"></div>
    <div class="pif-row"><label>Directly Modifies:</label><input id="pif-com" value="COM1"></div>
    <button class="win-btn" id="save">Save PIF</button>
    <div class="o21-sub" style="margin-top:6px;">File .PIF akan benar-benar tersimpan di C:\\WIN dan bisa dilihat lewat MS-DOS Executive / Terminal (DIR).</div>
  </div>`;
  body.querySelector('#save').onclick = ()=>{
    const progName = body.querySelector('#pif-name').value.trim().toUpperCase() || 'PROGRAM.EXE';
    const pifName = progName.replace(/\.[A-Z0-9]+$/,'') + '.PIF';
    const content = [
      `[PIF]`,
      `ProgramFilename=${progName}`,
      `WindowTitle=${body.querySelector('#pif-title').value}`,
      `MemoryRequiredKB=${body.querySelector('#pif-mem').value}`,
      `EMSMemoryKB=${body.querySelector('#pif-ems').value}`,
      `DirectlyModifies=${body.querySelector('#pif-com').value}`,
    ].join('\n');
    const winNode = FS["C:\\"].items["WIN"];
    winNode.items[pifName] = {type:'file', content, baselineHash: hashStr(content), modifiedAt: simNow().toISOString()};
    notifyFSChanged();
    alert('File '+pifName+' benar-benar tersimpan di C:\\WIN\\'+pifName+'.\nCoba buka lewat MS-DOS Executive atau ketik DIR di Terminal.');
  };
};

/* ---- Print Spooler ---- */
APPS.spooler = function(){
  const {body, win} = makeWindow({title:"Print Spooler", width:360, height:260, resizable:false});
  function render(){
    if(printQueue.length===0){
      body.innerHTML = `<div class="app-pad">Antrean cetak kosong.<br><br>Coba cetak dokumen dari Word 2021 (File &gt; Print) untuk melihat antrean di sini.</div>`;
      return;
    }
    body.innerHTML = printQueue.map(j=>`
      <div class="spool-row" style="flex-direction:column;align-items:stretch;gap:2px;">
        <div style="display:flex;justify-content:space-between;"><span>${j.name}</span><span>${j.status}</span></div>
        <div style="background:#ddd;height:8px;border:1px solid #999;"><div style="background:#217346;height:100%;width:${j.progress}%;transition:width .25s;"></div></div>
      </div>`).join('')
      + `<div class="app-pad"><button class="win-btn" id="cancel">Batalkan Job Pertama</button></div>`;
    const cancelBtn = body.querySelector('#cancel');
    if(cancelBtn) cancelBtn.onclick=()=>{ printQueue.shift(); notifySpoolerChanged(); };
  }
  render();
  onSpoolerChanged(()=>{ if(document.body.contains(win)) render(); });
};
