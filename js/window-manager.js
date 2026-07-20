/* =========================================================
   WINDOWS 1.0 "ULTIMATE" — Window Manager & Desktop Core
   Zen Production
   ========================================================= */

const desktop = document.getElementById('desktop');
let zTop = 10;
let activeWin = null;
let clipboard = "";
let winCount = 0;
let minIconSlots = 0;

/* registry semua aplikasi, diisi oleh file js/apps/*.js */
const APPS = {};

/* ---------- sound effect (PC Speaker 8-bit ala jadul) ---------- */
let audioCtx = null;
function beep(freq=520, dur=90, type='square', vol=0.05){
  try{
    audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type; osc.frequency.value = freq;
    gain.gain.value = vol;
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur/1000);
    osc.stop(audioCtx.currentTime + dur/1000);
  }catch(e){ /* audio tidak tersedia, abaikan diam-diam */ }
}
function beepStartup(){ beep(400,120); setTimeout(()=>beep(600,120),130); setTimeout(()=>beep(800,180),260); }
function beepOpen(){ beep(700,60); }
function beepClose(){ beep(300,80); }
function beepError(){ beep(180,220,'sawtooth',0.06); }

/* ---------- fake file system untuk MS-DOS Executive ---------- */
const DEFAULT_FS = {
  "C:\\": {type:"dir", items:{
    "WIN": {type:"dir", items:{
      "NOTEPAD.EXE": {type:"app", app:"notepad"},
      "WRITE.EXE": {type:"app", app:"write"},
      "PAINT.EXE": {type:"app", app:"paint"},
      "CALC.EXE": {type:"app", app:"calc"},
      "CLOCK.EXE": {type:"app", app:"clock"},
      "CALENDAR.EXE": {type:"app", app:"calendar"},
      "CARDFILE.EXE": {type:"app", app:"cardfile"},
      "CONTROL.EXE": {type:"app", app:"control"},
      "TERMINAL.EXE": {type:"app", app:"terminal"},
      "PIFEDIT.EXE": {type:"app", app:"pif"},
      "SPOOLER.EXE": {type:"app", app:"spooler"},
      "REVERSI.EXE": {type:"app", app:"reversi"},
      "COPILOT.EXE": {type:"app", app:"copilot"},
      "FGUARD.EXE": {type:"app", app:"fileguard"},
    }},
    "WORD": {type:"dir", items:{ "WINWORD.EXE": {type:"app", app:"word2021"} }},
    "EXCEL": {type:"dir", items:{ "EXCEL.EXE": {type:"app", app:"excel2021"} }},
    "GAME": {type:"dir", items:{
      "REVERSI.EXE": {type:"app", app:"reversi"},
      "PONG2D.EXE": {type:"app", app:"pong2d"},
      "DOOM3D.EXE": {type:"app", app:"doom3d"},
      "SPACE3D.EXE": {type:"app", app:"space3d"},
      "KICK3D.EXE": {type:"app", app:"football3d"},
    }},
    "DOS": {type:"dir", items:{
      "COMMAND.COM": {type:"file"}, "FORMAT.COM": {type:"file"}, "CONFIG.SYS": {type:"file", content:"DEVICE=HIMEM.SYS\nFILES=30"}
    }},
    "AUTOEXEC.BAT": {type:"file", content:"@ECHO OFF\nWIN.COM"},
  }},
  "A:\\": {type:"dir", items:{ "README.TXT": {type:"file", content:"Selamat datang di Windows 1.0 Ultimate.\nDibuat oleh Zen Production."} }}
};

/* ---------- persistensi localStorage ---------- */
const LS_FS_KEY = 'nebula-win1-fs';
const LS_THEME_KEY = 'nebula-win1-theme';

function loadFS(){
  try{
    const saved = localStorage.getItem(LS_FS_KEY);
    return saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(DEFAULT_FS));
  }catch(e){ return JSON.parse(JSON.stringify(DEFAULT_FS)); }
}
const FS = loadFS();

function saveFS(){
  try{ localStorage.setItem(LS_FS_KEY, JSON.stringify(FS)); }catch(e){ /* storage penuh/diblokir, abaikan */ }
}
/* pub/sub sederhana: siapa pun yang mengubah FS memanggil notifyFSChanged(),
   semua window MS-DOS Executive yang terbuka akan otomatis meredraw diri. */
const fsListeners = [];
function onFSChanged(fn){ fsListeners.push(fn); }
function notifyFSChanged(){ saveFS(); fsListeners.forEach(fn=>{ try{ fn(); }catch(e){} }); }

/* ---------- antrean print global — nyata, jalan otomatis lewat timer,
   dipakai bareng oleh Word 2021 (kirim job) dan Print Spooler (render job) ---------- */
let printQueue = [];
const spoolerListeners = [];
function onSpoolerChanged(fn){ spoolerListeners.push(fn); }
function notifySpoolerChanged(){ spoolerListeners.forEach(fn=>{ try{ fn(); }catch(e){} }); }
function addPrintJob(name){
  printQueue.push({name, status:'Menunggu', progress:0});
  notifySpoolerChanged();
}
setInterval(()=>{
  if(printQueue.length===0) return;
  const job = printQueue[0];
  if(job.status==='Menunggu') job.status='Mencetak...';
  if(job.status==='Mencetak...'){
    job.progress = Math.min(100, job.progress + 9);
    if(job.progress>=100){
      job.status='Selesai';
      setTimeout(()=>{ printQueue.shift(); notifySpoolerChanged(); }, 900);
    }
  }
  notifySpoolerChanged();
}, 300);

function loadTheme(){
  try{
    const saved = JSON.parse(localStorage.getItem(LS_THEME_KEY) || 'null');
    if(saved){
      document.documentElement.style.setProperty('--desk-bg', saved.desk);
      document.documentElement.style.setProperty('--title-active', saved.title);
    }
  }catch(e){ /* abaikan */ }
}
function saveTheme(desk, title){
  try{ localStorage.setItem(LS_THEME_KEY, JSON.stringify({desk, title})); }catch(e){ /* abaikan */ }
}

/* ---------- wallpaper kustom (gambar), terpisah dari tema warna ----------
   Disimpan sebagai data-URL base64 di localStorage. Layer wallpaper (elemen
   #wallpaper-layer) sengaja berupa <div> tersendiri yang duduk DI ATAS
   background warna tema tapi DI BAWAH ikon/jendela — jadi kalau wallpaper
   dihapus, warna tema di baliknya otomatis kelihatan lagi tanpa perlu
   logika tambahan. */
const LS_WALLPAPER_KEY = 'nebula-win1-wallpaper';
function setWallpaper(dataUrl){
  const layer = document.getElementById('wallpaper-layer');
  if(layer) layer.style.backgroundImage = `url(${dataUrl})`;
  try{
    localStorage.setItem(LS_WALLPAPER_KEY, dataUrl);
    return true;
  }catch(e){
    // localStorage biasanya dibatasi ~5-10MB per origin — gambar besar bisa gagal disimpan
    return false;
  }
}
function clearWallpaper(){
  const layer = document.getElementById('wallpaper-layer');
  if(layer) layer.style.backgroundImage = '';
  try{ localStorage.removeItem(LS_WALLPAPER_KEY); }catch(e){ /* abaikan */ }
}
function loadWallpaper(){
  try{
    const saved = localStorage.getItem(LS_WALLPAPER_KEY);
    if(saved){
      const layer = document.getElementById('wallpaper-layer');
      if(layer) layer.style.backgroundImage = `url(${saved})`;
    }
  }catch(e){ /* abaikan */ }
}

/* ---------- pengaturan sistem: sensitivitas mouse & tiling autopilot ---------- */
const LS_SETTINGS_KEY = 'nebula-win1-settings';
let mouseSensitivity = 1;
let tilingAutopilot = false;
function loadSettings(){
  try{
    const s = JSON.parse(localStorage.getItem(LS_SETTINGS_KEY)||'null');
    if(s){ mouseSensitivity = s.mouseSensitivity ?? 1; tilingAutopilot = !!s.tilingAutopilot; }
  }catch(e){ /* abaikan */ }
}
function saveSettings(){
  try{ localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify({mouseSensitivity, tilingAutopilot})); }catch(e){ /* abaikan */ }
}
function setMouseSensitivity(v){ mouseSensitivity = v; saveSettings(); }
function setTilingAutopilot(v){ tilingAutopilot = v; saveSettings(); if(v) tileWindows(); }

/* ---------- Reset Sistem — hapus semua data tersimpan (FS, tema, pengaturan)
   dan muat ulang dari kondisi default pabrik ---------- */
function resetSystem(){
  try{
    localStorage.removeItem(LS_FS_KEY);
    localStorage.removeItem(LS_THEME_KEY);
    localStorage.removeItem(LS_SETTINGS_KEY);
    localStorage.removeItem(LS_BIOS_KEY);
    localStorage.removeItem(LS_WALLPAPER_KEY);
  }catch(e){ /* localStorage diblokir/tidak tersedia, tetap lanjut reload */ }
  location.reload();
}
/* konfirmasi 2 langkah supaya tidak ke-reset tidak sengaja:
   pengguna harus mengetik persis "RESET" untuk melanjutkan. */
function confirmResetSystem(){
  const typed = prompt('Ini akan MENGHAPUS SEMUA DATA tersimpan — filesystem, file yang kamu buat, tema, dan pengaturan — lalu memuat ulang sistem dari kondisi awal.\n\nKetik RESET (huruf besar semua) untuk melanjutkan:');
  if(typed==='RESET'){ resetSystem(); }
  else if(typed!==null){ alert('Reset dibatalkan — teks yang diketik tidak cocok.'); }
}

/* ---------- window manager (drag & resize pakai SATU listener global,
   tidak lagi menumpuk listener baru setiap window dibuat) ---------- */
let dragState = null;   // {win, lastX, lastY}
let resizeState = null; // {win, srx, sry, sw, sh}

window.addEventListener('mousemove', e=>{
  if(dragState){
    const {win} = dragState;
    const dx = (e.clientX - dragState.lastX) * mouseSensitivity;
    const dy = (e.clientY - dragState.lastY) * mouseSensitivity;
    win.style.left = Math.max(0, win.offsetLeft + dx) + 'px';
    win.style.top = Math.max(0, win.offsetTop + dy) + 'px';
    dragState.lastX = e.clientX; dragState.lastY = e.clientY;
  }
  if(resizeState){
    const {win, srx, sry, sw, sh} = resizeState;
    win.style.width = Math.max(180, sw+(e.clientX-srx)*mouseSensitivity)+'px';
    win.style.height = Math.max(120, sh+(e.clientY-sry)*mouseSensitivity)+'px';
  }
});
window.addEventListener('mouseup', ()=>{ dragState=null; resizeState=null; });

function makeWindow({title, width=420, height=300, x, y, resizable=true}){
  winCount++;
  const w = document.createElement('div');
  w.className = 'window';
  w.style.width = width+'px';
  w.style.height = height+'px';
  w.style.left = (x!==undefined?x:40+ (winCount*18)%220) + 'px';
  w.style.top = (y!==undefined?y:30+ (winCount*16)%160) + 'px';
  w.style.zIndex = ++zTop;

  const tb = document.createElement('div');
  tb.className='titlebar';
  tb.innerHTML = `<span class="ttext">${title}</span>
    <div class="tbtn min" title="Minimize">▁</div>
    <div class="tbtn max" title="Maximize">▢</div>
    <div class="tbtn close" title="Close">✕</div>`;
  w.appendChild(tb);

  const body = document.createElement('div');
  body.className='winbody';
  w.appendChild(body);

  if(resizable){
    const rs = document.createElement('div');
    rs.className='win-resize';
    w.appendChild(rs);
    rs.addEventListener('mousedown', e=>{
      resizeState = {win:w, srx:e.clientX, sry:e.clientY, sw:w.offsetWidth, sh:w.offsetHeight};
      focusWin(w); e.stopPropagation(); e.preventDefault();
    });
  }

  tb.addEventListener('mousedown', e=>{
    if(e.target.classList.contains('tbtn')) return;
    dragState = {win:w, lastX:e.clientX, lastY:e.clientY};
    focusWin(w);
  });

  w.addEventListener('mousedown', ()=>focusWin(w));

  let maximized=false, preRect=null;
  tb.querySelector('.max').addEventListener('click', ()=>{
    if(!maximized){
      preRect = {l:w.style.left,t:w.style.top,wd:w.style.width,ht:w.style.height};
      w.style.left='0px'; w.style.top='0px';
      w.style.width='100%'; w.style.height=(window.innerHeight-4)+'px';
      maximized=true;
    } else {
      w.style.left=preRect.l; w.style.top=preRect.t; w.style.width=preRect.wd; w.style.height=preRect.ht;
      maximized=false;
    }
  });
  tb.querySelector('.close').addEventListener('click', ()=>{
    beepClose();
    w.remove();
    if(w._minIcon) w._minIcon.remove();
    if(tilingAutopilot) tileWindows();
  });
  tb.querySelector('.min').addEventListener('click', ()=>{
    minimizeWin(w, title);
    if(tilingAutopilot) tileWindows();
  });

  desktop.appendChild(w);
  focusWin(w);
  beepOpen();
  if(tilingAutopilot) tileWindows();
  return {win:w, body};
}

function focusWin(w){
  document.querySelectorAll('.window').forEach(x=>x.classList.remove('active'));
  w.classList.add('active');
  w.style.zIndex = ++zTop;
  activeWin = w;
}

function minimizeWin(w, title){
  w.style.display='none';
  const icon = document.createElement('div');
  icon.className='win-min-icon';
  icon.style.left = (8 + (minIconSlots%5)*156)+'px';
  icon.style.bottom = '8px';
  icon.textContent = '▭ '+title;
  icon.addEventListener('click', ()=>{
    w.style.display='flex';
    focusWin(w);
    icon.remove();
    minIconSlots--;
  });
  minIconSlots++;
  desktop.appendChild(icon);
  w._minIcon = icon;
}

function launchApp(app, opts){
  const fn = APPS[app];
  if(fn) fn(opts);
}

/* dipakai game multiplayer: nampilin/hapus indikator 🔊 ON-MIC di title bar
   jendela (bukan cuma di dalam kanvas game) saat voice chat aktif. */
function setTitlebarMic(win, on){
  if(!win) return;
  const tb = win.querySelector('.titlebar');
  if(!tb) return;
  let badge = tb.querySelector('.mic-indicator');
  if(on && !badge){
    badge = document.createElement('span');
    badge.className = 'mic-indicator';
    badge.textContent = '🔊ON-MIC';
    tb.insertBefore(badge, tb.querySelector('.tbtn'));
  } else if(!on && badge){
    badge.remove();
  }
}

/* ---------- Tile Windows ---------- */
function tileWindows(){
  const wins = [...document.querySelectorAll('.window')].filter(w=>w.style.display!=='none');
  if(wins.length===0) return;
  const cols = Math.ceil(Math.sqrt(wins.length));
  const rows = Math.ceil(wins.length/cols);
  const areaW = desktop.clientWidth, areaH = desktop.clientHeight-40;
  const cw = Math.floor(areaW/cols), ch = Math.floor(areaH/rows);
  wins.forEach((w,i)=>{
    const col = i%cols, row = Math.floor(i/cols);
    w.style.left = (col*cw)+'px';
    w.style.top = (row*ch)+'px';
    w.style.width = (cw-4)+'px';
    w.style.height = (ch-4)+'px';
  });
}

/* ---------- desktop icons ---------- */
const iconDefs = [
  {label:"MS-DOS Executive", app:"executive", glyph:"🗂"},
  {label:"Control Panel", app:"control", glyph:"⚙"},
  {label:"Notepad", app:"notepad", glyph:"📝"},
  {label:"Write", app:"write", glyph:"📄"},
  {label:"Paint", app:"paint", glyph:"🖌"},
  {label:"Calculator", app:"calc", glyph:"🧮"},
  {label:"Clock", app:"clock", glyph:"🕐"},
  {label:"Calendar", app:"calendar", glyph:"📅"},
  {label:"Cardfile", app:"cardfile", glyph:"🗃"},
  {label:"Terminal", app:"terminal", glyph:"💻"},
  {label:"Reversi", app:"reversi", glyph:"⚫"},
  {label:"Pong 1985", app:"pong2d", glyph:"🏓"},
  {label:"DOOM 1.0", app:"doom3d", glyph:"🔫"},
  {label:"Starfield 3D", app:"space3d", glyph:"🚀"},
  {label:"Retro Kick 3D", app:"football3d", glyph:"⚽"},
  {label:"PIF Editor", app:"pif", glyph:"🧾"},
  {label:"Print Spooler", app:"spooler", glyph:"🖨"},
  {label:"Word 2021", app:"word2021", glyph:"🅆"},
  {label:"Excel 2021", app:"excel2021", glyph:"🅇"},
  {label:"Copilot 1985", app:"copilot", glyph:"🤖"},
  {label:"Nebula File Guard", app:"fileguard", glyph:"🛡"},
];

function initDesktopIcons(){
  const iconsWrap = document.getElementById('icons');
  iconDefs.forEach(d=>{
    const el = document.createElement('div');
    el.className='icon';
    el.innerHTML = `<div class="glyph" style="font-size:28px;text-align:center;">${d.glyph}</div><div class="label">${d.label}</div>`;
    el.addEventListener('click', (e)=>{
      document.querySelectorAll('.icon').forEach(i=>i.classList.remove('selected'));
      el.classList.add('selected');
      e.stopPropagation();
    });
    el.addEventListener('dblclick', ()=> launchApp(d.app));
    iconsWrap.appendChild(el);
  });
  desktop.addEventListener('mousedown', (e)=>{
    if(e.target===desktop || e.target===iconsWrap){
      document.querySelectorAll('.icon').forEach(i=>i.classList.remove('selected'));
    }
  });
}

/* ---------- context menu (klik kanan) ---------- */
function closeContextMenu(){
  const m = document.getElementById('ctx-menu');
  if(m) m.remove();
}
function showContextMenu(x, y, items){
  closeContextMenu();
  const menu = document.createElement('div');
  menu.id = 'ctx-menu';
  menu.className = 'ctx-menu';
  menu.style.left = x+'px';
  menu.style.top = y+'px';
  items.forEach(it=>{
    if(it==='-'){ const hr=document.createElement('div'); hr.className='ctx-sep'; menu.appendChild(hr); return; }
    const row = document.createElement('div');
    row.className='ctx-item';
    row.textContent = it.label;
    row.onclick = ()=>{ closeContextMenu(); it.action(); };
    menu.appendChild(row);
  });
  document.body.appendChild(menu);
}
document.addEventListener('click', closeContextMenu);
desktop.addEventListener('contextmenu', e=>{
  e.preventDefault();
  showContextMenu(e.clientX, e.clientY, [
    {label:'📄 File Teks Baru', action:()=>{
      const name = (prompt('Nama file baru:', 'BARU.TXT')||'BARU.TXT').toUpperCase();
      FS["C:\\"].items[name] = {type:'file', content:'', baselineHash: hashStr(''), modifiedAt:null};
      notifyFSChanged();
      alert('File '+name+' dibuat di C:\\ — buka lewat MS-DOS Executive (double klik untuk edit di Notepad).');
    }},
    {label:'📊 File Excel Baru', action:()=>{
      const name = (prompt('Nama file baru:', 'BARU.XLS')||'BARU.XLS').toUpperCase();
      FS["C:\\"].items[name] = {type:'app', app:'excel2021'};
      notifyFSChanged();
      alert('File '+name+' dibuat di C:\\ — buka lewat MS-DOS Executive.');
    }},
    '-',
    {label:'▦ Tile Windows', action: tileWindows},
    {label:'↻ Refresh', action: ()=> location.reload()},
    '-',
    {label:'⚠ Reset Sistem...', action: confirmResetSystem},
  ]);
});

/* ---------- BSOD (easter egg) ---------- */
function triggerBSOD(message){
  beepError();
  const bsod = document.createElement('div');
  bsod.className = 'bsod';
  bsod.innerHTML = `
    <div class="bsod-inner">
:-(<br><br>
Windows telah mengalami masalah dan perlu dimulai ulang.<br><br>
${escapeHtmlSafe(message || 'SYSTEM_FAULT: UNEXPECTED_KERNEL_ERROR')}<br><br>
Teknis: STOP 0x0000004E (0x00000001, 0x0000FA20, 0x00000002, 0x00000000)<br><br>
Kumpulkan informasi ini lalu hubungi administrator sistem Anda.<br><br>
&gt; Tekan tombol di bawah untuk mulai ulang <br><br>
<button id="bsod-reboot">REBOOT SYSTEM</button>
    </div>`;
  document.body.appendChild(bsod);
  bsod.querySelector('#bsod-reboot').onclick = ()=> location.reload();
}
function escapeHtmlSafe(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ---------- hash sederhana untuk deteksi file yang dimodifikasi ---------- */
function hashStr(s){
  s = String(s||'');
  let h = 5381;
  for(let i=0;i<s.length;i++){ h = ((h<<5)+h) + s.charCodeAt(i); h |= 0; }
  return (h>>>0).toString(16);
}
/* jalan-jalan rekursif ke semua file di FS, kembalikan [{path, name, node}] */
function walkFiles(node, path, out){
  out = out || [];
  path = path || '';
  Object.entries(node.items||{}).forEach(([name, item])=>{
    const full = path + name;
    if(item.type==='dir') walkFiles(item, full+'\\', out);
    else if(item.type==='file') out.push({path: full, name, node: item});
  });
  return out;
}
/* pastikan setiap file punya baseline hash (dipanggil sekali saat boot / saat file baru dibuat) */
function ensureBaselines(){
  Object.values(FS).forEach(drive=>{
    walkFiles(drive).forEach(f=>{
      if(f.node.baselineHash===undefined){
        f.node.baselineHash = hashStr(f.node.content||'');
        f.node.modifiedAt = f.node.modifiedAt || null;
      }
    });
  });
}

/* ---------- Boot Sequence (loading beneran, bukan animasi kosong) ---------- */
/* ---------- Konfigurasi BIOS — persisten, beneran memengaruhi simulator ---------- */
const LS_BIOS_KEY = 'nebula-win1-bios';
const BIOS_DEFAULTS = {
  biosVersion: 'F.12',
  clockOffsetMs: 0,        // selisih waktu sistem simulasi vs waktu asli perangkat
  bootOrder: ['C','A'],    // urutan boot; bootOrder[0] menentukan drive aktif saat MS-DOS Executive/Terminal dibuka
  fastBoot: false,         // beneran mempersingkat boot sequence
  overclockProfile: 'auto',// auto | profile1 | profile2 — beneran mempercepat timer boot
  sataMode: 'AHCI',
  pcieGen: 'Gen4',
  virtualization: true,
  coreControl: 0,          // 0 = semua core aktif; >0 membatasi jumlah core yang ditampilkan
  csm: false,
  secureBoot: true,
  fanSpeed: 60,            // 0-100%, beneran memengaruhi suhu simulasi di Hardware Monitor
  password: null,          // hash — beneran mengunci akses BIOS Setup
  profiles: {},
};
function loadBiosConfig(){
  try{
    const saved = JSON.parse(localStorage.getItem(LS_BIOS_KEY)||'null');
    return saved ? Object.assign({}, BIOS_DEFAULTS, saved) : Object.assign({}, BIOS_DEFAULTS);
  }catch(e){ return Object.assign({}, BIOS_DEFAULTS); }
}
function saveBiosConfig(){ try{ localStorage.setItem(LS_BIOS_KEY, JSON.stringify(biosConfig)); }catch(e){ /* abaikan */ } }
let biosConfig = loadBiosConfig();
/* dipakai di seluruh simulator sebagai pengganti `new Date()` kapan pun
   "jam sistem" ditampilkan ke pengguna — supaya ubah tanggal/waktu di
   BIOS beneran kerasa efeknya di Clock, Calendar, Terminal, dsb. */
function simNow(){ return new Date(Date.now() + (biosConfig.clockOffsetMs||0)); }
function primaryBootDrive(){ return (biosConfig.bootOrder && biosConfig.bootOrder[0]) || 'C'; }

function bootSequence(onDone){
  const screen = document.getElementById('boot-screen');
  const statusEl = document.getElementById('boot-status');
  const bar = document.getElementById('boot-bar-fill');
  const hintEl = document.getElementById('boot-hint');
  if(!screen){ onDone && onDone(); return; }
  if(hintEl) hintEl.textContent = 'Tekan DEL untuk masuk BIOS Setup — Zen Production © 1985';

  let inBios = false, finished = false;

  function speedFactor(){
    let f = 1;
    if(biosConfig.fastBoot) f *= 0.35;
    if(biosConfig.overclockProfile==='profile1') f *= 0.8;
    else if(biosConfig.overclockProfile==='profile2') f *= 0.6;
    return f;
  }
  function getSteps(){
    const full = [
      ['Memuat kernel MS-DOS...', 12],
      ['Menginisialisasi driver mouse...', 26],
      ['Memuat GDI & USER...', 42],
      ['Membaca konfigurasi sistem (localStorage)...', 58],
      [`Menyiapkan MS-DOS Executive (boot dari ${primaryBootDrive()}:)...`, 74],
      ['Memuat font & tema...', 88],
      ['Selesai.', 100],
    ];
    return biosConfig.fastBoot ? [full[0], full[4], full[6]] : full;
  }

  function onKeyDel(e){
    if(e.key!=='Delete' || inBios || finished) return;
    inBios = true;
    beep(900,60);
    openBiosSetup(()=>{
      inBios = false;
      if(statusEl) statusEl.textContent = 'Melanjutkan boot dengan pengaturan BIOS baru...';
      setTimeout(runSteps, 500);
    });
  }
  document.addEventListener('keydown', onKeyDel);

  function runSteps(){
    const steps = getSteps();
    let i = 0;
    (function next(){
      if(inBios || finished) return;
      if(i>=steps.length){
        finished = true;
        document.removeEventListener('keydown', onKeyDel);
        setTimeout(()=>{
          screen.classList.add('hide');
          setTimeout(()=>{ screen.remove(); onDone && onDone(); }, 650);
        }, 200);
        return;
      }
      const [label, pct] = steps[i++];
      if(statusEl) statusEl.textContent = label;
      if(bar) bar.style.width = pct+'%';
      setTimeout(next, (220 + Math.random()*220) * speedFactor());
    })();
  }
  runSteps();
}

/* ---------- Shutdown / Restart / Sleep — dipanggil dari Terminal (/shutdown, /restart, /sleep) ---------- */
function systemShutdown(){
  beep(220,300,'sawtooth',0.05);
  const ov = document.createElement('div');
  ov.className = 'sys-overlay shutdown';
  ov.innerHTML = `<div class="sys-msg" id="sd-msg">Windows sedang dimatikan...</div>`;
  document.body.appendChild(ov);
  setTimeout(()=>{
    ov.innerHTML = `<div class="sys-msg">Sekarang aman untuk mematikan komputer Anda.</div>
      <div class="sys-sub">(simulator — tekan tombol di bawah untuk menyalakan lagi)</div>
      <button id="sd-power">⏻ Nyalakan Kembali</button>`;
    ov.querySelector('#sd-power').onclick = ()=> location.reload();
  }, 1400);
}
function systemRestart(){
  beep(300,150); setTimeout(()=>beep(500,150),160);
  const ov = document.createElement('div');
  ov.className = 'sys-overlay shutdown';
  ov.innerHTML = `<div class="sys-msg">Memulai ulang Windows...</div>`;
  document.body.appendChild(ov);
  setTimeout(()=> location.reload(), 1300);
}
function systemSleep(){
  beep(440,120);
  const ov = document.createElement('div');
  ov.className = 'sys-overlay sleep';
  ov.innerHTML = `<div class="sys-msg">💤 Sedang tidur...</div><div class="sys-sub">Klik di mana saja atau tekan tombol apa pun untuk membangunkan</div>`;
  document.body.appendChild(ov);
  const wake = ()=>{ beep(700,80); ov.remove(); document.removeEventListener('keydown', wake); };
  ov.addEventListener('click', wake);
  document.addEventListener('keydown', wake, {once:true});
}
