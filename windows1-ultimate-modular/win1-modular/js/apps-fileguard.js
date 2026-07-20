/* =========================================================
   APLIKASI: Nebula File Guard
   Memindai seluruh filesystem simulasi (FS), menghitung
   checksum tiap file, dan membandingkannya dengan baseline
   yang direkam sebelumnya — untuk mendeteksi file mana yang
   sudah dimodifikasi sejak baseline terakhir diambil.
   ========================================================= */
APPS.fileguard = function(){
  const {body} = makeWindow({title:"Nebula File Guard", width:440, height:340});
  ensureBaselines();

  body.innerHTML = `
    <div class="dos-toolbar">
      <button class="win-btn" id="fg-scan">🔍 Pindai Ulang</button>
      <button class="win-btn" id="fg-baseline">✔ Jadikan Baseline Baru (semua)</button>
    </div>
    <div class="app-pad" id="fg-summary" style="font-weight:bold;"></div>
    <div id="fg-list" style="font-family:var(--mono);font-size:11px;"></div>
  `;
  const list = body.querySelector('#fg-list');
  const summary = body.querySelector('#fg-summary');

  function scan(){
    const files = [];
    Object.entries(FS).forEach(([drive, node])=>{
      walkFiles(node, drive).forEach(f=> files.push(f));
    });
    let modifiedCount = 0;
    let html = `<table style="width:100%;border-collapse:collapse;">
      <tr style="background:#ddd;"><th style="text-align:left;padding:3px 6px;">Path</th><th style="text-align:left;padding:3px 6px;">Status</th><th style="text-align:left;padding:3px 6px;">Terakhir Diubah</th><th></th></tr>`;
    files.forEach(f=>{
      const currentHash = hashStr(f.node.content||'');
      const baseline = f.node.baselineHash;
      const changed = baseline!==undefined && currentHash!==baseline;
      if(changed) modifiedCount++;
      const statusLabel = baseline===undefined ? '⚪ Belum ada baseline' : (changed ? '🔴 TERMODIFIKASI' : '🟢 Tidak berubah');
      const modTime = f.node.modifiedAt ? new Date(f.node.modifiedAt).toLocaleString('id-ID') : '-';
      html += `<tr style="border-bottom:1px solid #eee;">
        <td style="padding:3px 6px;">${f.path}</td>
        <td style="padding:3px 6px;${changed?'color:#a30000;font-weight:bold;':''}">${statusLabel}</td>
        <td style="padding:3px 6px;">${modTime}</td>
        <td style="padding:3px 6px;"><button class="win-btn" data-reset="${f.path}" style="font-size:10px;padding:1px 6px;">Reset Baseline</button></td>
        </tr>`;
    });
    html += `</table>`;
    if(files.length===0) html = '<div class="app-pad">Belum ada file di filesystem.</div>';
    list.innerHTML = html;
    summary.textContent = files.length===0
      ? 'Tidak ada file untuk dipindai.'
      : (modifiedCount>0
          ? `⚠ ${modifiedCount} dari ${files.length} file terdeteksi berubah sejak baseline.`
          : `✔ Semua ${files.length} file sesuai dengan baseline (tidak ada perubahan).`);

    list.querySelectorAll('[data-reset]').forEach(btn=>{
      btn.onclick = ()=>{
        const path = btn.dataset.reset;
        const target = files.find(f=>f.path===path);
        if(target){ target.node.baselineHash = hashStr(target.node.content||''); notifyFSChanged(); scan(); }
      };
    });
  }

  body.querySelector('#fg-scan').onclick = scan;
  body.querySelector('#fg-baseline').onclick = ()=>{
    if(!confirm('Jadikan kondisi SEMUA file saat ini sebagai baseline baru? Perubahan yang sudah terdeteksi akan dianggap "normal" mulai sekarang.')) return;
    Object.values(FS).forEach(drive=>{
      walkFiles(drive).forEach(f=>{ f.node.baselineHash = hashStr(f.node.content||''); });
    });
    notifyFSChanged();
    scan();
  };

  scan();
  // observer: auto pindai ulang kalau ada file yang berubah di tempat lain (mis. disimpan dari Notepad)
  onFSChanged(()=>{ if(document.body.contains(body.closest('.window'))) scan(); });
};
