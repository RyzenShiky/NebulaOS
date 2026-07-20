/* =========================================================
   APLIKASI: Copilot 1985 (versi upgrade)
   Chatbot rule-based (bukan AI/API sungguhan — 100% offline,
   tanpa API key) yang dipecah jadi 4 modul internal:

   1. Text Normalizer   — bersihin teks mentah jadi bentuk baku
   2. Intent & Context Analyzer — cari niat user + tangani
      percakapan bersambung (context state machine)
   3. Action Dispatcher  — eksekusi niat ke fungsi inti OS
      simulator (systemRestart, launchApp, FS, tema, dst)
   4. Audio Feedback     — beep pendek nada tinggi tiap Copilot
      selesai memproses sesuatu, kesan mekanis 8-bit

   Copilot BENERAN terhubung ke window-manager.js/apps-core.js
   lewat pemanggilan fungsi global (systemRestart, launchApp,
   tileWindows, applyTheme, notifyFSChanged, hashStr, dst).
   ========================================================= */

/* =========================================================
   MODUL 1 — TEXT NORMALIZER
   ========================================================= */
function copilotNormalize(raw){
  return raw
    .toLowerCase()
    .replace(/[.,!?;:()"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* =========================================================
   MODUL 3 — ACTION DISPATCHER
   Fungsi-fungsi ini benar-benar memanggil inti simulator.
   ========================================================= */
const COPILOT_APP_KEYWORDS = [
  {kw:['gambar','coret','paint','lukis'], id:'paint', label:'Paint'},
  {kw:['kalkulator','calculator','hitung'], id:'calc', label:'Calculator'},
  {kw:['notepad'], id:'notepad', label:'Notepad'},
  {kw:['write','wordpad'], id:'write', label:'Write'},
  {kw:['excel'], id:'excel2021', label:'Excel 2021'},
  {kw:['word','dokumen'], id:'word2021', label:'Word 2021'},
  {kw:['terminal','command prompt','cmd'], id:'terminal', label:'Terminal'},
  {kw:['kalender','calendar'], id:'calendar', label:'Calendar'},
  {kw:['jam','clock'], id:'clock', label:'Clock'},
  {kw:['reversi','othello'], id:'reversi', label:'Reversi'},
  {kw:['file manager','explorer','executive','dos executive'], id:'executive', label:'MS-DOS Executive'},
  {kw:['control panel','pengaturan sistem'], id:'control', label:'Control Panel'},
  {kw:['cardfile','kartu catatan'], id:'cardfile', label:'Cardfile'},
  {kw:['print spooler','spooler'], id:'spooler', label:'Print Spooler'},
  {kw:['pif editor'], id:'pif', label:'PIF Editor'},
  {kw:['file guard','pemantau file','integritas file'], id:'fileguard', label:'Nebula File Guard'},
];
const COPILOT_THEME_KEYWORDS = {
  hijau: 'Hijau Klasik',
  biru: 'Windows Standard',
  standar: 'Windows Standard',
  hitam: 'Hercules Mono',
  mono: 'Hercules Mono',
  ungu: 'CGA Bold',
  merah: 'CGA Bold',
  cyan: 'EGA Sky',
  langit: 'EGA Sky',
};

/* eksekusi nyata pembuatan file ke FS global + sinyal pembaruan */
function copilotCreateFile(rawName, typeHint){
  let name = rawName.toUpperCase().replace(/[^A-Z0-9_\-.]/g, '');
  if(!name) return 'Nama file tidak valid, coba lagi.';
  const hasExt = /\.[A-Z0-9]{1,4}$/.test(name);
  if(!hasExt) name += (typeHint==='XLS' ? '.XLS' : '.TXT');

  if(name.endsWith('.XLS') || name.endsWith('.XLSX')){
    FS["C:\\"].items[name] = {type:'app', app:'excel2021'};
    notifyFSChanged();
    beep(1500,45);
    return `Siap! ${name} dibuat di drive C: sebagai shortcut ke Excel 2021 (isi file .XLS penuh belum didukung simulator ini, tapi bisa langsung dibuka dari MS-DOS Executive).`;
  }
  const content = '';
  FS["C:\\"].items[name] = {type:'file', content, baselineHash: hashStr(content), modifiedAt:null};
  notifyFSChanged();
  beep(1500,45);
  return `Siap! File ${name} berhasil dibuat di drive C:. Buka lewat MS-DOS Executive (dobel klik) untuk mulai mengetik di Notepad.`;
}

/* =========================================================
   MODUL 2 — INTENT & CONTEXT ANALYZER
   Setiap aturan: {name, match(raw,norm) -> data|null, run(data)->balasan}
   Dicek berurutan dari atas; yang pertama cocok langsung dieksekusi
   lewat Action Dispatcher (modul 3) di dalam run().
   ========================================================= */
const COPILOT_INTENTS = [
  /* --- CREATE_FILE langsung, lengkap dengan nama di kalimat yang sama --- */
  {
    name:'CREATE_FILE',
    match:(raw)=>{
      const m = raw.match(/buat(?:kan)?\s+(?:file|berkas)\s+(?:teks\s+|text\s+|excel\s+)?([a-zA-Z0-9_\-.]+)/i);
      return m ? {entity:m[1]} : null;
    },
    run:(d)=> copilotCreateFile(d.entity),
  },
  /* --- CREATE_FILE tanpa nama -> mulai context AWAITING_FILE_TYPE --- */
  {
    name:'CREATE_FILE_START',
    match:(raw,norm)=> /\b(mau|ingin|pengen)\b.*\b(bikin|buat)\b.*\b(file|berkas)\b/.test(norm) ? {} : null,
    run:(d, ctxRef)=>{ ctxRef.state='AWAITING_FILE_TYPE'; return 'Tentu! Kamu mau bikin file teks (.TXT) atau Excel (.XLS)?'; },
  },
  /* --- perintah sistem --- */
  {
    name:'SYS_RESTART',
    match:(raw,norm)=> /restart|mulai ulang|reboot/.test(norm) ? {} : null,
    run:()=>{ systemRestart(); return 'Baik, saya restart komputernya sekarang.'; },
  },
  {
    name:'SYS_SHUTDOWN',
    match:(raw,norm)=> /matikan komputer|shutdown|shut down|matiin komputer/.test(norm) ? {} : null,
    run:()=>{ systemShutdown(); return 'Baik, saya matikan komputernya sekarang.'; },
  },
  {
    name:'SYS_SLEEP',
    match:(raw,norm)=> /\btidur\b|\bsleep\b|matiin layar/.test(norm) ? {} : null,
    run:()=>{ systemSleep(); return 'Oke, komputer saya tidurkan.'; },
  },
  {
    name:'SYS_RESET',
    match:(raw,norm)=> /reset sistem|reset semua|factory reset/.test(norm) ? {} : null,
    run:()=>{ confirmResetSystem(); return 'Saya buka dialog konfirmasi reset sistem — ketik RESET di sana untuk melanjutkan.'; },
  },
  /* --- UI --- */
  {
    name:'UI_TILE',
    match:(raw,norm)=> /rapikan jendela|tile|susun jendela/.test(norm) ? {} : null,
    run:()=>{ tileWindows(); return 'Sudah saya rapikan semua jendela (tiling).'; },
  },
  /* --- ganti tema --- */
  {
    name:'SET_THEME',
    match:(raw,norm)=>{
      if(!/warna|tema/.test(norm)) return null;
      for(const key in COPILOT_THEME_KEYWORDS){ if(norm.includes(key)) return {scheme:COPILOT_THEME_KEYWORDS[key], label:key}; }
      return null;
    },
    run:(d)=>{
      applyTheme(d.scheme);
      beep(1200,40);
      return `Oke, tema saya ubah ke skema "${d.scheme}".`;
    },
  },
  /* --- buka aplikasi --- */
  {
    name:'LAUNCH_APP',
    match:(raw,norm)=>{
      if(!/buka|jalankan|launch/.test(norm)) return null;
      for(const app of COPILOT_APP_KEYWORDS){
        if(app.kw.some(k=> norm.includes(k))) return {appId:app.id, label:app.label};
      }
      return null;
    },
    run:(d)=>{ launchApp(d.appId); return `Oke, saya bukakan ${d.label}.`; },
  },
];

/* penanganan context yang sedang menggantung (state machine) */
function copilotHandleContext(ctx, raw, norm){
  if(/batal|cancel/.test(norm)){ ctx.state=null; return 'Oke, dibatalkan.'; }

  if(ctx.state==='AWAITING_FILE_TYPE'){
    let type = null;
    if(/\b(teks|text|txt)\b/.test(norm)) type='TXT';
    else if(/\b(excel|xls|spreadsheet)\b/.test(norm)) type='XLS';
    if(!type) return 'Maaf, saya belum paham. Ketik "teks" atau "excel" ya (atau "batal").';
    ctx.state='AWAITING_FILE_NAME';
    ctx.fileType=type;
    return `Oke, apa nama file ${type==='TXT'?'teksnya':'Excel-nya'}?`;
  }
  if(ctx.state==='AWAITING_FILE_NAME'){
    const name = raw.trim().split(/\s+/)[0];
    const type = ctx.fileType;
    ctx.state=null; ctx.fileType=null;
    return copilotCreateFile(name, type);
  }
  ctx.state=null;
  return 'Maaf, konteks percakapan sebelumnya sudah saya reset. Coba ulangi ya.';
}

/* fallback obrolan santai kalau tidak ada niat sistem yang cocok (ELIZA-lite) */
function elizaReply(input){
  const t = copilotNormalize(input);
  if(!t) return 'Silakan ketik sesuatu.';
  const rules = [
    [/\b(halo|hai|hi|hello)\b/, ['Halo! Ada yang bisa saya bantu?', 'Hai juga. Ceritakan lebih lanjut.']],
    [/nama (kamu|mu)/, ['Saya Copilot 1985, asisten simulasi di dalam Windows 1.0 ini.']],
    [/kenapa.*\?|kenapa$/, ['Menurutmu sendiri kenapa begitu?', 'Coba jelaskan lebih detail alasannya.']],
    [/saya (sedih|kecewa|capek|lelah)/, ['Aku turut prihatin mendengarnya. Sudah berapa lama kamu merasa begitu?']],
    [/saya (senang|bahagia|gembira)/, ['Senang mendengarnya! Apa yang membuatmu merasa begitu?']],
    [/terima kasih|makasih/, ['Sama-sama!', 'Senang bisa membantu.']],
    [/siapa (yang )?membuat(mu)?/, ['Saya bagian dari simulator Windows 1.0 Ultimate buatan Zen Production.']],
    [/\?$/, ['Pertanyaan menarik. Menurutmu bagaimana?', 'Hmm, coba jelaskan lebih lanjut soal itu.']],
  ];
  for(const [re, opts] of rules){ if(re.test(t)) return opts[Math.floor(Math.random()*opts.length)]; }
  const fallback = [
    'Menarik. Ceritakan lebih lanjut.',
    'Saya mengerti. Lalu apa yang terjadi setelah itu?',
    'Coba jelaskan dengan kata lain.',
    'Bagaimana perasaanmu soal itu?',
    'Hmm... lanjutkan.',
  ];
  return fallback[Math.floor(Math.random()*fallback.length)];
}

/* pipeline utama: Normalizer -> Analyzer (context lalu intent) -> balasan.
   Eksekusi nyata (Dispatcher) terjadi di dalam masing-masing run(). */
function copilotProcess(rawInput, ctx){
  const raw = rawInput.trim();
  const norm = copilotNormalize(raw);

  if(ctx.state){
    return copilotHandleContext(ctx, raw, norm);
  }
  for(const intent of COPILOT_INTENTS){
    const data = intent.match(raw, norm);
    if(data){ return intent.run(data, ctx); }
  }
  return elizaReply(raw);
}

/* =========================================================
   APP — merangkai ke-4 modul jadi jendela Copilot 1985
   ========================================================= */
APPS.copilot = function(){
  const {body} = makeWindow({title:"Copilot 1985", width:400, height:360});
  body.innerHTML = `<div class="copilot-body">
    <div class="copilot-log" id="cp-log">COPILOT 1985 — asisten simulasi (rule-based, offline, tanpa API key)
Sekarang paham niat & konteks percakapan, dan terhubung ke sistem nyata.
Coba: "restart komputer", "buka paint", "ubah tema jadi hijau", "buatkan file rahasia.txt", atau "saya mau bikin file baru".
Ketik HELP untuk bantuan.
</div>
    <div class="copilot-inputrow"><span>&gt;</span><input id="cp-in" autofocus></div>
  </div>`;
  const log = body.querySelector('#cp-log');
  const inp = body.querySelector('#cp-in');
  inp.focus();

  /* context percakapan — melekat per jendela Copilot, bukan global,
     supaya beberapa jendela Copilot tidak saling mengganggu state. */
  const ctx = {state:null};

  inp.addEventListener('keydown', e=>{
    if(e.key!=='Enter') return;
    const msg = inp.value;
    if(!msg.trim()) return;
    log.textContent += `\n> ${msg}\n`;
    const upper = msg.trim().toUpperCase();

    if(upper==='HELP'){
      log.textContent += "Ini simulasi chatbot rule-based (bukan AI sungguhan), tapi sudah paham niat & konteks.\n"+
        "Perintah sistem: restart, matikan komputer, tidurkan komputer, rapikan jendela, reset sistem.\n"+
        "Buka aplikasi: \"buka <nama app>\" (mis. buka paint, buka excel, buka terminal).\n"+
        "Ganti tema: \"ubah tema jadi <warna>\" (biru/hijau/hitam/ungu/cyan).\n"+
        "Buat file: \"buatkan file <nama.ext>\" atau mulai dengan \"saya mau bikin file baru\".\n"+
        "Ketik EXIT untuk menutup.\n";
    } else if(upper==='EXIT'){
      log.textContent += "Sampai jumpa!\n";
    } else {
      log.textContent += copilotProcess(msg, ctx) + "\n";
    }
    beep(1100, 35); // Modul 4 — Audio Feedback: beep pendek tiap selesai memproses
    inp.value='';
    log.scrollTop = log.scrollHeight;
  });
};
