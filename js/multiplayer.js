/* =========================================================
   MULTIPLAYER CORE — WebRTC P2P tanpa server dedicated.
   Host membuat "kode undangan" (SDP offer, di-base64) yang
   dibagikan manual (chat/WA/dsb) ke teman. Teman (Client)
   tempel kode itu, sistem membuat "kode balasan" (SDP answer)
   yang ditempel balik oleh Host. Setelah itu koneksi P2P
   murni terbentuk (data channel + opsional audio track).

   KETERBATASAN YANG JUJUR DIUNGKAP:
   - Tidak ada server pencocokan kode 4 digit otomatis — itu
     butuh server signaling nyata yang tidak tersedia di
     lingkungan ini. Mekanisme yang benar-benar bekerja di sini
     adalah tukar-menukar kode secara manual (copy-paste).
   - Pakai STUN publik Google (stun:stun.l.google.com:19302,
     gratis, tanpa API key) supaya bisa tembus NAT rumahan.
     Untuk jaringan yang sangat ketat (firewall korporat/API
     symmetric NAT), koneksi P2P murni bisa saja tetap gagal —
     itu keterbatasan WebRTC tanpa server TURN berbayar, bukan
     bug di kode ini.
   - Belum diuji dengan dua browser sungguhan di sesi ini
     (sandbox tidak punya dua browser live) — logika koneksi
     mengikuti spesifikasi WebRTC standar dan sudah diuji
     sintaks & alur promise-nya, tapi silakan uji dengan 2 tab
     asli untuk konfirmasi akhir di jaringanmu.
   ========================================================= */

const MP = (function(){
  let pc = null, dc = null, role = null, micActive = false;
  let onDataCb = null, onStateCb = null, onStreamCb = null;
  let generation = 0; // token: tiap host()/join()/close() baru menaikkan ini,
                       // supaya event dari koneksi LAMA yang sudah ditinggal
                       // tidak bisa lagi memicu onReady/status (mencegah "mulai
                       // duluan" kalau user sempat klik ulang Buat Kode Undangan)
  const STUN_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  function b64encode(obj){ return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))); }
  function b64decode(str){ return JSON.parse(decodeURIComponent(escape(atob(str.trim())))); }

  function waitIceComplete(conn){
    return new Promise(resolve=>{
      if(conn.iceGatheringState==='complete'){ resolve(); return; }
      let resolved = false, graceTimer = null, hardTimer = null;
      function finish(){
        if(resolved) return;
        resolved = true;
        conn.removeEventListener('icegatheringstatechange', onStateChange);
        conn.removeEventListener('icecandidate', onCandidate);
        if(graceTimer) clearTimeout(graceTimer);
        if(hardTimer) clearTimeout(hardTimer);
        resolve();
      }
      function onStateChange(){ if(conn.iceGatheringState==='complete') finish(); }
      function onCandidate(e){
        // begitu kandidat PERTAMA datang (biasanya <1 detik), kasih jeda singkat
        // buat nunggu beberapa kandidat lain menyusul — TIDAK perlu nunggu status
        // benar-benar 'complete', yang kadang lama karena browser nunggu kandidat
        // lain yang sebenarnya tidak akan kepakai (mis. jalur jaringan yang mati).
        if(e.candidate && !graceTimer){ graceTimer = setTimeout(finish, 700); }
      }
      conn.addEventListener('icegatheringstatechange', onStateChange);
      conn.addEventListener('icecandidate', onCandidate);
      hardTimer = setTimeout(finish, 4000); // jaring pengaman kalau STUN gagal total
    });
  }

  function setupCommon(conn, gen){
    conn.oniceconnectionstatechange = ()=>{
      if(gen!==generation) return; // koneksi ini sudah basi/ditinggal, abaikan
      const s = conn.iceConnectionState;
      // PENTING: JANGAN teruskan 'connected'/'completed' dari level ICE ke UI.
      // Status ICE 'connected' hanya berarti jalur transport ketemu — ini BISA
      // muncul (termasuk di beberapa kondisi browser/NAT tertentu) SEBELUM
      // handshake data channel benar-benar rampung, dan sebelumnya ini malah
      // ikut memicu cek `state==='connected'` di UI, membuat game seolah mulai
      // padahal data channel belum benar-benar 'open'. Satu-satunya sinyal sah
      // untuk "siap main" adalah dc.onopen (dikirim terpisah di wireDataChannel).
      // Di sini status ICE HANYA dipakai untuk mendeteksi koneksi terputus.
      if(s==='disconnected' || s==='failed' || s==='closed'){
        onStateCb && onStateCb(s);
      }
    };
    conn.ontrack = e=>{ if(gen===generation) onStreamCb && onStreamCb(e.streams[0]); };
  }

  function wireDataChannel(gen){
    dc.onopen = ()=>{ if(gen===generation) onStateCb && onStateCb('connected'); };
    dc.onclose = ()=>{ if(gen===generation) onStateCb && onStateCb('closed'); };
    dc.onerror = ()=>{ if(gen===generation) onStateCb && onStateCb('error'); };
    dc.onmessage = e=>{
      if(gen!==generation) return;
      try{ const msg = JSON.parse(e.data); onDataCb && onDataCb(msg); }catch(err){ /* pesan rusak, abaikan */ }
    };
  }

  async function addMicIfRequested(conn, withMic){
    if(!withMic) return;
    try{
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      stream.getTracks().forEach(t=> conn.addTrack(t, stream));
      micActive = true;
    }catch(e){
      console.warn('Copilot/Multiplayer: mikrofon tidak tersedia atau ditolak izinnya', e);
    }
  }

  async function host(withMic){
    close(); // pastikan sesi/koneksi lama (kalau ada) benar-benar ditutup dulu
    const gen = ++generation;
    role = 'host';
    pc = new RTCPeerConnection(STUN_CONFIG);
    setupCommon(pc, gen);
    dc = pc.createDataChannel('game', { ordered:true });
    wireDataChannel(gen);
    await addMicIfRequested(pc, withMic);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIceComplete(pc);
    if(gen!==generation) throw new Error('Sesi dibatalkan sebelum selesai.');
    return b64encode(pc.localDescription);
  }

  async function completeHost(answerText){
    if(!pc) throw new Error('Belum ada undangan aktif — buat kode undangan dulu.');
    const gen = generation;
    const answer = b64decode(answerText);
    await pc.setRemoteDescription(answer);
    if(gen!==generation) throw new Error('Sesi dibatalkan.');
  }

  async function join(offerText, withMic){
    close();
    const gen = ++generation;
    role = 'client';
    pc = new RTCPeerConnection(STUN_CONFIG);
    setupCommon(pc, gen);
    pc.ondatachannel = e=>{ if(gen!==generation) return; dc = e.channel; wireDataChannel(gen); };
    await addMicIfRequested(pc, withMic);
    const offer = b64decode(offerText);
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitIceComplete(pc);
    if(gen!==generation) throw new Error('Sesi dibatalkan sebelum selesai.');
    return b64encode(pc.localDescription);
  }

  function send(obj){ if(dc && dc.readyState==='open') dc.send(JSON.stringify(obj)); }
  function isHost(){ return role==='host'; }
  function isConnected(){ return !!dc && dc.readyState==='open'; }
  function hasMic(){ return micActive; }
  function close(){
    generation++; // koneksi manapun yang masih berjalan otomatis dianggap basi
    try{ if(dc) dc.close(); }catch(e){}
    try{ if(pc) pc.close(); }catch(e){}
    dc=null; pc=null; role=null; micActive=false;
  }
  function onData(fn){ onDataCb = fn; }
  function onState(fn){ onStateCb = fn; }
  function onStream(fn){ onStreamCb = fn; }

  return { host, completeHost, join, send, isHost, isConnected, hasMic, close, onData, onState, onStream };
})();

/* ---------- panel UI Host/Join yang dipakai bareng oleh semua game ----------
   container: elemen DOM tempat panel dirender
   opts.onReady(role): dipanggil sekali saat data channel benar-benar 'open'
   opts.onLocal(): dipanggil kalau user pilih main lokal / vs komputer (tanpa jaringan) */
function buildMultiplayerPanel(container, opts){
  container.innerHTML = `
    <div class="mp-panel">
      <div class="mp-tabs">
        <button class="mp-tab-btn active" data-m="host">Host (buka ruang)</button>
        <button class="mp-tab-btn" data-m="join">Join (gabung ke teman)</button>
      </div>
      <label class="mp-mic"><input type="checkbox" class="mp-mic-chk"> 🎙 Aktifkan Voice Chat (mic)</label>

      <div class="mp-mode mp-mode-host">
        <div class="mp-step"><b>Langkah 1:</b> Klik tombol ini, lalu kirim kode yang muncul ke temanmu (chat/WA).</div>
        <button class="win-btn mp-host-btn">Buat Kode Undangan</button>
        <textarea class="mp-host-offer" placeholder="Kode undangan akan muncul di sini setelah tombol di atas ditekan — salin dan kirim ke teman." readonly></textarea>
        <div class="mp-step"><b>Langkah 2:</b> Tunggu teman kirim balik "kode balasan" dari dia, lalu tempel di sini:</div>
        <textarea class="mp-host-answer" placeholder="Tempel kode balasan dari teman di sini..."></textarea>
        <div class="mp-step"><b>Langkah 3:</b> Baru klik Sambungkan.</div>
        <button class="win-btn mp-host-connect">Sambungkan</button>
      </div>

      <div class="mp-mode mp-mode-join" style="display:none;">
        <div class="mp-step"><b>Langkah 1:</b> Tempel kode undangan yang dikirim Host ke sini:</div>
        <textarea class="mp-join-offer" placeholder="Tempel kode undangan dari Host..."></textarea>
        <div class="mp-step"><b>Langkah 2:</b> Klik tombol ini untuk membuat kode balasan.</div>
        <button class="win-btn mp-join-btn">Buat Kode Balasan</button>
        <textarea class="mp-join-answer" placeholder="Kode balasan akan muncul di sini — kirim balik ke Host." readonly></textarea>
        <div class="mp-step"><b>Langkah 3:</b> Kirim kode balasan itu ke Host, lalu <u>TUNGGU</u> — Host yang harus klik Sambungkan di sisi dia. Jangan tutup panel ini.</div>
      </div>

      <div class="mp-status">Belum tersambung.</div>
      <div class="mp-local-sep">— atau —</div>
      <div class="mp-step" style="color:#a30000;">⚠ Tombol di bawah ini BUKAN bagian dari proses di atas. Ini untuk main SENDIRIAN lawan komputer (tanpa teman, tanpa jaringan). Kalau lagi coba mabar, JANGAN klik ini.</div>
      <button class="win-btn mp-local-btn">Main Sendiri / vs Komputer (bukan online)</button>
    </div>`;

  const statusEl = container.querySelector('.mp-status');
  function setStatus(t){ statusEl.textContent = t; }

  container.querySelectorAll('.mp-tab-btn').forEach(b=>{
    b.onclick = ()=>{
      container.querySelectorAll('.mp-tab-btn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      container.querySelector('.mp-mode-host').style.display = b.dataset.m==='host' ? 'block':'none';
      container.querySelector('.mp-mode-join').style.display = b.dataset.m==='join' ? 'block':'none';
    };
  });

  MP.onState(state=>{
    if(state==='connected'){ statusEl.classList.remove('mp-waiting'); setStatus('✔ Tersambung! Game dimulai...'); opts.onReady && opts.onReady(MP.isHost()?'host':'client'); }
    else if(state==='disconnected'||state==='closed'||state==='failed'){ statusEl.classList.remove('mp-waiting'); setStatus('Koneksi terputus.'); }
  });

  const localBtn = container.querySelector('.mp-local-btn');
  const hostBtn = container.querySelector('.mp-host-btn');
  const hostConnectBtn = container.querySelector('.mp-host-connect');
  const joinBtn = container.querySelector('.mp-join-btn');

  hostBtn.onclick = async ()=>{
    hostBtn.disabled = true; localBtn.disabled = true;
    setStatus('Membuat kode undangan (biasanya 1-2 detik)...');
    const withMic = container.querySelector('.mp-mic-chk').checked;
    try{
      const offer = await MP.host(withMic);
      container.querySelector('.mp-host-offer').value = offer;
      setStatus('⏳ Kode undangan siap — kirim ke teman. SEKARANG MENUNGGU dia kirim balik kode balasan (tempel di kotak bawah), baru klik Sambungkan.');
      statusEl.classList.add('mp-waiting');
    }catch(e){ setStatus('Gagal membuat koneksi: '+e.message); hostBtn.disabled=false; localBtn.disabled=false; }
  };
  hostConnectBtn.onclick = async ()=>{
    const ans = container.querySelector('.mp-host-answer').value.trim();
    if(!ans){ setStatus('Tempel kode balasan dari teman dulu.'); return; }
    hostConnectBtn.disabled = true;
    try{ setStatus('Menyambungkan — kalau lama, cek lagi kode yang ditempel sudah pas...'); await MP.completeHost(ans); }
    catch(e){ setStatus('Kode balasan tidak valid: '+e.message); hostConnectBtn.disabled=false; }
  };
  joinBtn.onclick = async ()=>{
    const offerText = container.querySelector('.mp-join-offer').value.trim();
    if(!offerText){ setStatus('Tempel kode undangan dari Host dulu.'); return; }
    joinBtn.disabled = true; localBtn.disabled = true;
    const withMic = container.querySelector('.mp-mic-chk').checked;
    try{
      setStatus('Membuat kode balasan (biasanya 1-2 detik)...');
      const answer = await MP.join(offerText, withMic);
      container.querySelector('.mp-join-answer').value = answer;
      setStatus('⏳ Kode balasan siap — kirim balik ke Host lewat chat/WA. SEKARANG MENUNGGU Host menempel kode ini dan klik Sambungkan di sisi dia. Jangan klik apa pun lagi, cukup tunggu di sini.');
      statusEl.classList.add('mp-waiting');
    }catch(e){ setStatus('Kode undangan tidak valid: '+e.message); joinBtn.disabled=false; localBtn.disabled=false; }
  };
  localBtn.onclick = ()=>{ MP.close(); opts.onLocal && opts.onLocal(); };
}
