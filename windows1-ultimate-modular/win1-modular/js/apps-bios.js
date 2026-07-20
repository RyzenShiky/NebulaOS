/* =========================================================
   BIOS SETUP UTILITY
   Diakses dengan menekan DEL saat layar boot. Bekerja atas
   draft config terpisah — perubahan baru diterapkan & disimpan
   permanen kalau "Save & Exit" ditekan; "Discard & Exit" batal.
   ========================================================= */

function cpuGhz(cfg){
  if(cfg.overclockProfile==='profile1') return '4.0';
  if(cfg.overclockProfile==='profile2') return '4.6';
  return '3.2';
}
function cpuCores(cfg){
  const real = navigator.hardwareConcurrency || 4;
  return cfg.coreControl>0 ? Math.min(real, cfg.coreControl) : real;
}
function ramInfo(){
  if(navigator.deviceMemory) return (navigator.deviceMemory*1024)+' MB (terdeteksi via browser)';
  return '8192 MB (perkiraan)';
}

function openBiosSetup(onExit){
  beep(600,80); setTimeout(()=>beep(900,80),90);
  let draft = JSON.parse(JSON.stringify(biosConfig));
  let monitorTimer = null;

  const overlay = document.createElement('div');
  overlay.className = 'bios-overlay';
  document.body.appendChild(overlay);

  function closeOverlay(){
    if(monitorTimer) clearInterval(monitorTimer);
    overlay.remove();
    document.removeEventListener('keydown', globalKeyHandler);
  }
  function saveAndExit(){
    biosConfig = draft;
    saveBiosConfig();
    beep(700,100); setTimeout(()=>beep(1000,120),110);
    closeOverlay();
    onExit && onExit();
  }
  function discardAndExit(){
    beep(300,120);
    closeOverlay();
    onExit && onExit();
  }
  function globalKeyHandler(e){
    if(e.key==='F10'){ e.preventDefault(); saveAndExit(); }
    else if(e.key==='Escape'){ e.preventDefault(); discardAndExit(); }
  }
  document.addEventListener('keydown', globalKeyHandler);

  const TABS = ['Main','Advanced','Monitor','Boot','Security','Tool','Exit'];
  let activeTab = 'Main';

  /* ---- gerbang password, kalau diatur ---- */
  if(draft.password){
    renderLock();
  } else {
    renderShell();
  }

  function renderLock(){
    let attempts = 0;
    overlay.innerHTML = `
      <div class="bios-lock">
        <div class="bios-lock-title">🔒 BIOS SETUP — PASSWORD DIPERLUKAN</div>
        <input type="password" id="bios-pw-input" autofocus>
        <div class="bios-lock-msg" id="bios-pw-msg"></div>
      </div>`;
    const input = overlay.querySelector('#bios-pw-input');
    const msg = overlay.querySelector('#bios-pw-msg');
    input.focus();
    input.addEventListener('keydown', e=>{
      if(e.key!=='Enter') return;
      if(hashStr(input.value)===draft.password){
        beep(800,90);
        renderShell();
      } else {
        attempts++;
        beepError();
        if(attempts>=3){
          msg.textContent = 'Terlalu banyak percobaan gagal. Kembali ke boot.';
          setTimeout(discardAndExit, 1200);
        } else {
          msg.textContent = `Password salah. Sisa percobaan: ${3-attempts}`;
          input.value=''; input.focus();
        }
      }
    });
  }

  /* ---- shell utama: header + tab + panel + footer ---- */
  function renderShell(){
    overlay.innerHTML = `
      <div class="bios-window">
        <div class="bios-header">NEBULA BIOS SETUP UTILITY — ${draft.biosVersion}</div>
        <div class="bios-tabs" id="bios-tabs">
          ${TABS.map(t=>`<div class="bios-tab ${t===activeTab?'active':''}" data-t="${t}">${t}</div>`).join('')}
        </div>
        <div class="bios-panel" id="bios-panel"></div>
        <div class="bios-footer">↑↓←→: Navigasi (klik)   F10: Save &amp; Exit   ESC: Discard &amp; Exit</div>
      </div>`;
    overlay.querySelectorAll('.bios-tab').forEach(t=>{
      t.onclick = ()=>{ activeTab = t.dataset.t; beep(500,30); renderShell(); };
    });
    renderPanel();
  }

  function renderPanel(){
    const panel = overlay.querySelector('#bios-panel');
    if(monitorTimer){ clearInterval(monitorTimer); monitorTimer=null; }
    if(activeTab==='Main') renderMain(panel);
    else if(activeTab==='Advanced') renderAdvanced(panel);
    else if(activeTab==='Monitor') renderMonitor(panel);
    else if(activeTab==='Boot') renderBoot(panel);
    else if(activeTab==='Security') renderSecurity(panel);
    else if(activeTab==='Tool') renderTool(panel);
    else if(activeTab==='Exit') renderExit(panel);
  }

  /* ===================== MAIN ===================== */
  function renderMain(panel){
    const now = new Date(Date.now() + draft.clockOffsetMs);
    const dateStr = now.toISOString().slice(0,10);
    const timeStr = now.toTimeString().slice(0,5);
    panel.innerHTML = `
      <div class="bios-section-title">System Information</div>
      <div class="bios-row"><span>BIOS Version</span><b>${draft.biosVersion}</b></div>
      <div class="bios-row"><span>CPU Type</span><b>Simulated CPU @ ${cpuGhz(draft)} GHz</b></div>
      <div class="bios-row"><span>CPU Cores</span><b>${cpuCores(draft)}</b></div>
      <div class="bios-row"><span>Total Memory</span><b>${ramInfo()}</b></div>
      <div class="bios-row"><span>System Date</span><input type="date" id="bios-date" value="${dateStr}"></div>
      <div class="bios-row"><span>System Time</span><input type="time" id="bios-time" value="${timeStr}"></div>
      <div class="bios-hint">Mengubah tanggal/waktu di sini beneran mengubah jam yang ditampilkan Clock, Calendar, dan Terminal di dalam simulator.</div>
    `;
    function applyDateTime(){
      const d = panel.querySelector('#bios-date').value;
      const t = panel.querySelector('#bios-time').value || '00:00';
      if(!d) return;
      const target = new Date(`${d}T${t}:00`);
      draft.clockOffsetMs = target.getTime() - Date.now();
    }
    panel.querySelector('#bios-date').onchange = applyDateTime;
    panel.querySelector('#bios-time').onchange = applyDateTime;
  }

  /* ===================== ADVANCED (Tweaker) ===================== */
  function renderAdvanced(panel){
    panel.innerHTML = `
      <div class="bios-section-title">Tweaker / Overclocking</div>
      <div class="bios-row"><span>XMP / EXPO Profile</span>
        <select id="bios-oc">
          <option value="auto" ${draft.overclockProfile==='auto'?'selected':''}>Auto (Disabled) — 3.2 GHz</option>
          <option value="profile1" ${draft.overclockProfile==='profile1'?'selected':''}>Profile 1 — 4.0 GHz (boot lebih cepat)</option>
          <option value="profile2" ${draft.overclockProfile==='profile2'?'selected':''}>Profile 2 — 4.6 GHz (boot tercepat)</option>
        </select></div>
      <div class="bios-section-title">Storage &amp; PCIe</div>
      <div class="bios-row"><span>SATA Mode</span>
        <select id="bios-sata"><option ${draft.sataMode==='AHCI'?'selected':''}>AHCI</option><option ${draft.sataMode==='RAID'?'selected':''}>RAID</option></select></div>
      <div class="bios-row"><span>PCIe Speed</span>
        <select id="bios-pcie"><option ${draft.pcieGen==='Gen3'?'selected':''}>Gen3</option><option ${draft.pcieGen==='Gen4'?'selected':''}>Gen4</option><option ${draft.pcieGen==='Gen5'?'selected':''}>Gen5</option></select></div>
      <div class="bios-section-title">CPU Configuration</div>
      <div class="bios-row"><span>Virtualization (VT-x/AMD-V)</span>
        <select id="bios-virt"><option value="1" ${draft.virtualization?'selected':''}>Enabled</option><option value="0" ${!draft.virtualization?'selected':''}>Disabled</option></select></div>
      <div class="bios-row"><span>Core Control</span>
        <select id="bios-core">
          <option value="0" ${draft.coreControl===0?'selected':''}>Semua Core Aktif (${navigator.hardwareConcurrency||4})</option>
          ${[2,4,6,8].filter(n=>n<(navigator.hardwareConcurrency||4)).map(n=>`<option value="${n}" ${draft.coreControl===n?'selected':''}>${n} Core</option>`).join('')}
        </select></div>
      <div class="bios-hint">Overclock profile beneran mempercepat proses booting simulator (timer boot dipangkas). Core Control beneran mengubah jumlah core yang ditampilkan di tab Main.</div>
    `;
    panel.querySelector('#bios-oc').onchange = e=> draft.overclockProfile = e.target.value;
    panel.querySelector('#bios-sata').onchange = e=> draft.sataMode = e.target.value;
    panel.querySelector('#bios-pcie').onchange = e=> draft.pcieGen = e.target.value;
    panel.querySelector('#bios-virt').onchange = e=> draft.virtualization = e.target.value==='1';
    panel.querySelector('#bios-core').onchange = e=> draft.coreControl = parseInt(e.target.value);
  }

  /* ===================== MONITOR ===================== */
  function renderMonitor(panel){
    panel.innerHTML = `
      <div class="bios-section-title">Hardware Monitor</div>
      <div class="bios-row"><span>CPU Temperature</span><b id="bios-cputemp">--</b></div>
      <div class="bios-row"><span>Motherboard Temperature</span><b id="bios-mbtemp">--</b></div>
      <div class="bios-row"><span>CPU Fan Speed</span><b id="bios-fanrpm">--</b></div>
      <div class="bios-row"><span>Voltage 12V</span><b id="bios-v12">--</b></div>
      <div class="bios-row"><span>Voltage 5V</span><b id="bios-v5">--</b></div>
      <div class="bios-row"><span>Voltage 3.3V</span><b id="bios-v33">--</b></div>
      <div class="bios-section-title">Fan Control</div>
      <div class="bios-row"><span>Kecepatan Kipas</span><input type="range" id="bios-fan" min="0" max="100" value="${draft.fanSpeed}"> <b id="bios-fan-val">${draft.fanSpeed}%</b></div>
      <div class="bios-hint">Nilai di atas diperbarui real-time. Menaikkan kecepatan kipas beneran menurunkan suhu CPU yang ditampilkan.</div>
    `;
    function tick(){
      const fan = draft.fanSpeed;
      const cpuTemp = (52 - fan*0.22 + (Math.random()*2-1)).toFixed(1);
      const mbTemp = (38 - fan*0.1 + (Math.random()*1.5-0.75)).toFixed(1);
      const rpm = Math.round(500 + fan*17 + (Math.random()*40-20));
      panel.querySelector('#bios-cputemp').textContent = cpuTemp+' °C';
      panel.querySelector('#bios-mbtemp').textContent = mbTemp+' °C';
      panel.querySelector('#bios-fanrpm').textContent = rpm+' RPM';
      panel.querySelector('#bios-v12').textContent = (12 + (Math.random()*0.1-0.05)).toFixed(2)+' V';
      panel.querySelector('#bios-v5').textContent = (5 + (Math.random()*0.06-0.03)).toFixed(2)+' V';
      panel.querySelector('#bios-v33').textContent = (3.3 + (Math.random()*0.04-0.02)).toFixed(2)+' V';
    }
    tick();
    monitorTimer = setInterval(tick, 900);
    panel.querySelector('#bios-fan').oninput = e=>{
      draft.fanSpeed = parseInt(e.target.value);
      panel.querySelector('#bios-fan-val').textContent = draft.fanSpeed+'%';
      tick();
    };
  }

  /* ===================== BOOT ===================== */
  function renderBoot(panel){
    panel.innerHTML = `
      <div class="bios-section-title">Boot Priority</div>
      <div id="bios-bootlist"></div>
      <div class="bios-section-title">Boot Options</div>
      <div class="bios-row"><span>Fast Boot</span>
        <select id="bios-fastboot"><option value="1" ${draft.fastBoot?'selected':''}>Enabled</option><option value="0" ${!draft.fastBoot?'selected':''}>Disabled</option></select></div>
      <div class="bios-row"><span>CSM (Legacy Support)</span>
        <select id="bios-csm"><option value="1" ${draft.csm?'selected':''}>Enabled</option><option value="0" ${!draft.csm?'selected':''}>Disabled</option></select></div>
      <div class="bios-hint">Urutan boot beneran menentukan drive (C: atau A:) yang aktif saat MS-DOS Executive/Terminal dibuka. Fast Boot beneran mempersingkat proses boot.</div>
    `;
    const labels = {C:'C: Hard Disk (Nebula FS)', A:'A: Floppy Disk'};
    function renderList(){
      const wrap = panel.querySelector('#bios-bootlist');
      wrap.innerHTML = draft.bootOrder.map((d,i)=>`
        <div class="bios-bootitem">
          <span>${i+1}. ${labels[d]}</span>
          <span>
            <button class="bios-mini-btn" data-up="${i}" ${i===0?'disabled':''}>↑</button>
            <button class="bios-mini-btn" data-down="${i}" ${i===draft.bootOrder.length-1?'disabled':''}>↓</button>
          </span>
        </div>`).join('');
      wrap.querySelectorAll('[data-up]').forEach(b=> b.onclick=()=>{
        const i=+b.dataset.up; [draft.bootOrder[i-1],draft.bootOrder[i]]=[draft.bootOrder[i],draft.bootOrder[i-1]]; renderList();
      });
      wrap.querySelectorAll('[data-down]').forEach(b=> b.onclick=()=>{
        const i=+b.dataset.down; [draft.bootOrder[i+1],draft.bootOrder[i]]=[draft.bootOrder[i],draft.bootOrder[i+1]]; renderList();
      });
    }
    renderList();
    panel.querySelector('#bios-fastboot').onchange = e=> draft.fastBoot = e.target.value==='1';
    panel.querySelector('#bios-csm').onchange = e=> draft.csm = e.target.value==='1';
  }

  /* ===================== SECURITY ===================== */
  function renderSecurity(panel){
    panel.innerHTML = `
      <div class="bios-section-title">Password</div>
      <div class="bios-row"><span>Status Password BIOS</span><b>${draft.password?'Diatur':'Tidak diatur'}</b></div>
      <div class="bios-row"><button class="bios-btn" id="bios-setpw">${draft.password?'Ganti Password':'Atur Password Baru'}</button>
        ${draft.password?'<button class="bios-btn" id="bios-clearpw">Hapus Password</button>':''}</div>
      <div class="bios-section-title">Boot Security</div>
      <div class="bios-row"><span>Secure Boot</span>
        <select id="bios-secboot"><option value="1" ${draft.secureBoot?'selected':''}>Enabled</option><option value="0" ${!draft.secureBoot?'selected':''}>Disabled</option></select></div>
      <div class="bios-hint">Kalau password diatur, lain kali masuk BIOS Setup (tekan DEL saat boot) akan diminta password ini.</div>
    `;
    panel.querySelector('#bios-setpw').onclick = ()=>{
      const pw1 = prompt('Password BIOS baru:'); if(!pw1) return;
      const pw2 = prompt('Ulangi password:'); if(pw1!==pw2){ alert('Password tidak cocok.'); return; }
      draft.password = hashStr(pw1);
      alert('Password BIOS berhasil diatur.');
      renderPanel();
    };
    const clearBtn = panel.querySelector('#bios-clearpw');
    if(clearBtn) clearBtn.onclick = ()=>{
      const cur = prompt('Masukkan password saat ini untuk menghapus:');
      if(cur===null) return;
      if(hashStr(cur)===draft.password){ draft.password=null; alert('Password dihapus.'); renderPanel(); }
      else alert('Password salah.');
    };
    panel.querySelector('#bios-secboot').onchange = e=> draft.secureBoot = e.target.value==='1';
  }

  /* ===================== TOOL ===================== */
  function renderTool(panel){
    panel.innerHTML = `
      <div class="bios-section-title">Q-Flash — BIOS Update Utility</div>
      <div class="bios-row"><span>Versi Saat Ini</span><b>${draft.biosVersion}</b></div>
      <div class="bios-row"><button class="bios-btn" id="bios-flash">Update BIOS ke Versi Berikutnya</button></div>
      <div id="bios-flash-progress"></div>
      <div class="bios-section-title">Profiles</div>
      <div class="bios-row"><input type="text" id="bios-prof-name" placeholder="Nama profil"><button class="bios-btn" id="bios-prof-save">Simpan Profil Ini</button></div>
      <div class="bios-row"><select id="bios-prof-list">${Object.keys(draft.profiles).length? Object.keys(draft.profiles).map(n=>`<option>${n}</option>`).join('') : '<option disabled>(belum ada profil)</option>'}</select>
        <button class="bios-btn" id="bios-prof-load">Muat</button><button class="bios-btn" id="bios-prof-del">Hapus</button></div>
    `;
    panel.querySelector('#bios-flash').onclick = ()=>{
      const prog = panel.querySelector('#bios-flash-progress');
      prog.innerHTML = `<div class="bios-hint">Jangan matikan sistem selama proses flashing...</div><div class="boot-bar" style="margin-top:4px;"><div class="boot-bar-fill" id="bios-flash-bar" style="width:0%;"></div></div>`;
      let pct=0;
      const iv = setInterval(()=>{
        pct += 8 + Math.random()*10;
        if(pct>=100){
          pct=100; clearInterval(iv);
          const m = draft.biosVersion.match(/F\.(\d+)/);
          draft.biosVersion = m ? `F.${parseInt(m[1])+1}` : 'F.13';
          beep(1000,150);
          setTimeout(()=>{ alert('BIOS berhasil diperbarui ke versi '+draft.biosVersion); renderPanel(); }, 200);
        }
        panel.querySelector('#bios-flash-bar').style.width = pct+'%';
      }, 200);
    };
    panel.querySelector('#bios-prof-save').onclick = ()=>{
      const name = panel.querySelector('#bios-prof-name').value.trim();
      if(!name){ alert('Beri nama profil dulu.'); return; }
      const snap = JSON.parse(JSON.stringify(draft));
      delete snap.profiles;
      draft.profiles[name] = snap;
      alert('Profil "'+name+'" disimpan.');
      renderPanel();
    };
    panel.querySelector('#bios-prof-load').onclick = ()=>{
      const sel = panel.querySelector('#bios-prof-list');
      const name = sel.value;
      if(!draft.profiles[name]) return;
      const profiles = draft.profiles;
      draft = JSON.parse(JSON.stringify(draft.profiles[name]));
      draft.profiles = profiles;
      alert('Profil "'+name+'" dimuat. Ingat Save & Exit untuk menerapkan permanen.');
      renderPanel();
    };
    panel.querySelector('#bios-prof-del').onclick = ()=>{
      const sel = panel.querySelector('#bios-prof-list');
      const name = sel.value;
      if(!draft.profiles[name]) return;
      delete draft.profiles[name];
      renderPanel();
    };
  }

  /* ===================== EXIT ===================== */
  function renderExit(panel){
    panel.innerHTML = `
      <div class="bios-section-title">Exit</div>
      <div class="bios-row"><button class="bios-btn" id="bios-save-exit">💾 Save Changes and Exit (F10)</button></div>
      <div class="bios-row"><button class="bios-btn" id="bios-discard-exit">✕ Discard Changes and Exit (ESC)</button></div>
      <div class="bios-row"><button class="bios-btn" id="bios-defaults">↺ Load Setup Defaults</button></div>
      <div class="bios-hint">Load Setup Defaults mengembalikan semua pengaturan ke bawaan pabrik — tetap perlu Save &amp; Exit untuk benar-benar diterapkan.</div>
    `;
    panel.querySelector('#bios-save-exit').onclick = saveAndExit;
    panel.querySelector('#bios-discard-exit').onclick = discardAndExit;
    panel.querySelector('#bios-defaults').onclick = ()=>{
      const keepProfiles = draft.profiles;
      draft = JSON.parse(JSON.stringify(BIOS_DEFAULTS));
      draft.profiles = keepProfiles;
      alert('Pengaturan dikembalikan ke default (belum disimpan).');
      renderPanel();
    };
  }
}
