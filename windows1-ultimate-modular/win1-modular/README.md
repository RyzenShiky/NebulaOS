# Windows 1.0 Ultimate — Panduan Modding & Pengembangan

Simulator Windows 1.0 bergaya retro yang berjalan 100% di browser (HTML/CSS/JS murni, tanpa build tool, tanpa server). Dokumen ini menjelaskan cara menambah aplikasi baru, "install APK" ala simulator ini, membuat mod, dan memodifikasi sistem intinya.

> **Catatan jujur soal istilah "APK/install":** ini bukan Android, jadi tidak ada APK sungguhan. Yang dimaksud "install aplikasi" di sini adalah **menambahkan file JavaScript baru yang mendaftarkan diri ke sistem**, persis seperti aplikasi bawaan (Notepad, Paint, dst). Bagian [Install "APK" / Paket Aplikasi Siap Pakai](#5-install-apk--paket-aplikasi-siap-pakai) menjelaskan format paket `.nebulapp` yang dipakai simulator ini sebagai analoginya.

---

## Daftar Isi

1. [Struktur Proyek](#1-struktur-proyek)
2. [Cara Kerja Sistem (Arsitektur Singkat)](#2-cara-kerja-sistem-arsitektur-singkat)
3. [Menambah Aplikasi Baru](#3-menambah-aplikasi-baru)
4. [Mendaftarkan Aplikasi ke Desktop & MS-DOS Executive](#4-mendaftarkan-aplikasi-ke-desktop--ms-dos-executive)
5. [Install "APK" / Paket Aplikasi Siap Pakai](#5-install-apk--paket-aplikasi-siap-pakai)
6. [Membuat Mod (Tema, Suara, Ikon)](#6-membuat-mod-tema-suara-ikon)
7. [Modifikasi Sistem Inti](#7-modifikasi-sistem-inti)
8. [API Referensi Cepat](#8-api-referensi-cepat)
9. [Multiplayer: Menghubungkan App Baru ke WebRTC](#9-multiplayer-menghubungkan-app-baru-ke-webrtc)
10. [Debugging & Kesalahan Umum](#10-debugging--kesalahan-umum)
11. [Checklist Sebelum Rilis Mod](#11-checklist-sebelum-rilis-mod)

---

## 1. Struktur Proyek

```
win1-modular/
├── index.html                  ← entry point, daftar semua <script>/<link> di sini
├── css/
│   ├── theme-schemes.css       ← variabel warna (--desk-bg, --win-bg, dst)
│   ├── core-desktop.css        ← desktop, ikon, context menu, boot screen, BSOD
│   ├── window-manager.css      ← anatomi jendela (titlebar, tombol, resize)
│   ├── apps-retro.css          ← styling app bergaya 1985 (Notepad, Paint, dst)
│   ├── apps-modern-office.css  ← styling Word/Excel 2021 (ribbon, dsb)
│   ├── bios-setup.css          ← tampilan BIOS Setup (tekan DEL saat boot)
│   └── games.css               ← HUD game & panel multiplayer
└── js/
    ├── window-manager.js       ← INTI: makeWindow, FS, ikon desktop, BIOS trigger, dst
    ├── apps-bios.js            ← BIOS Setup Utility
    ├── multiplayer.js          ← inti WebRTC P2P (objek MP) + panel Host/Join
    ├── apps-core.js            ← MS-DOS Executive, Notepad, Write, Paint
    ├── apps-tools.js           ← Calculator, Clock, Calendar, Cardfile, Terminal
    ├── apps-system.js          ← Control Panel, PIF Editor, Print Spooler
    ├── apps-office.js          ← Reversi
    ├── apps-office2021.js      ← Word 2021, Excel 2021
    ├── apps-copilot.js         ← Copilot 1985 (chatbot rule-based)
    ├── apps-fileguard.js       ← Nebula File Guard (deteksi file dimodifikasi)
    ├── apps-games-*.js         ← Pong, DOOM, Starfield, Retro Kick 3D
    └── init.js                 ← dijalankan terakhir: boot sequence + buka Executive
```

Tidak ada `npm install`, tidak ada Webpack/Vite. Buka `index.html` langsung di browser (atau lewat GitHub Pages) dan semuanya jalan.

---

## 2. Cara Kerja Sistem (Arsitektur Singkat)

Tiga hal yang wajib dipahami sebelum menambah apa pun:

### a. Registry `APPS`
Semua aplikasi adalah **fungsi** yang didaftarkan ke objek global `APPS`:
```js
APPS.namaaplikasiku = function(opts){
  // ...isi aplikasi...
};
```
`window-manager.js` memanggil `launchApp('namaaplikasiku')` yang tinggal menjalankan `APPS.namaaplikasiku()`. Tidak ada "compile" atau "registrasi" tambahan — cukup file JS dimuat (lewat `<script>` di `index.html`) dan fungsinya otomatis tersedia karena `APPS` adalah objek global.

### b. `makeWindow()` — bikin jendela
Setiap aplikasi memanggil `makeWindow()` sekali untuk mendapat jendela siap pakai:
```js
const {body, win} = makeWindow({
  title: "Judul Jendela",
  width: 400,        // opsional, default 420
  height: 300,        // opsional, default 300
  x: 100, y: 80,       // opsional, posisi awal
  resizable: true,     // opsional, default true
});
```
- `body` — elemen `<div>` tempat kamu render UI aplikasi (`body.innerHTML = ...`)
- `win` — elemen jendela penuh, dipakai kalau butuh akses titlebar dsb (mis. `win.querySelector('.close')`)

### c. `FS` — filesystem tiruan
Objek `FS` (didefinisikan di `window-manager.js`) adalah "hard disk" simulator ini. MS-DOS Executive dan Terminal membaca struktur ini secara langsung. Menambahkan entri baru ke `FS` = aplikasi baru muncul di File Manager.

---

## 3. Menambah Aplikasi Baru

### Langkah 1 — Buat file JS baru
Buat file baru di `js/`, misalnya `js/apps-punyaku.js`:

```js
/* =========================================================
   APLIKASI: Nama Aplikasi Saya
   ========================================================= */
APPS.namaaplikasiku = function(opts){
  const {body, win} = makeWindow({
    title: "Aplikasi Saya",
    width: 380,
    height: 260,
  });

  body.innerHTML = `
    <div class="app-pad">
      <p>Halo dari aplikasi baru!</p>
      <button class="win-btn" id="btn-tes">Klik Saya</button>
    </div>`;

  body.querySelector('#btn-tes').onclick = () => {
    beep(700, 60); // efek suara 8-bit bawaan sistem
    alert('Tombol ditekan!');
  };
};
```

**Kelas CSS siap pakai** (dari `apps-retro.css`, otomatis cocok dengan tema retro):
- `.app-pad` — padding standar untuk konten aplikasi
- `.win-btn` — tombol bergaya Windows 1.0 (border 3D)
- `.dos-toolbar` — toolbar baris atas ala aplikasi klasik

### Langkah 2 — Daftarkan `<script>` di `index.html`
Tambahkan baris ini **setelah** `window-manager.js`, `apps-bios.js`, dan `multiplayer.js` (ketiganya harus dimuat lebih dulu karena berisi fungsi inti yang dipakai semua app), tapi **sebelum** `init.js`:

```html
<script src="js/apps-punyaku.js"></script>
```

Urutan lengkap yang benar:
```html
<script src="js/window-manager.js"></script>
<script src="js/apps-bios.js"></script>
<script src="js/multiplayer.js"></script>

<script src="js/apps-core.js"></script>
<!-- ...app lain... -->
<script src="js/apps-punyaku.js"></script>  <!-- ← app barumu di sini -->

<script src="js/init.js"></script>
```

Sampai di sini aplikasimu **sudah bisa dijalankan** lewat console browser (`launchApp('namaaplikasiku')`), tapi belum ada ikon/cara buka dari UI. Lanjut ke langkah 4.

---

## 4. Mendaftarkan Aplikasi ke Desktop & MS-DOS Executive

### a. Ikon di Desktop
Buka `js/window-manager.js`, cari array `iconDefs` (sekitar baris 320), tambahkan barismu:

```js
const iconDefs = [
  {label:"MS-DOS Executive", app:"executive", glyph:"🗂"},
  // ...baris lain...
  {label:"Aplikasi Saya", app:"namaaplikasiku", glyph:"🎯"},  // ← tambahkan ini
];
```
- `label` — teks di bawah ikon
- `app` — **harus sama persis** dengan nama fungsi di `APPS.namaaplikasiku`
- `glyph` — emoji sebagai ikon (bisa diganti gambar, lihat [bagian 6](#c-ikon-kustom-non-emoji))

### b. Entri di MS-DOS Executive (opsional tapi disarankan)
Supaya muncul juga saat file explorer dibuka, edit `DEFAULT_FS` di `js/window-manager.js`:

```js
const DEFAULT_FS = {
  "C:\\": {type:"dir", items:{
    "WIN": {type:"dir", items:{
      // ...entri lain...
      "PUNYAKU.EXE": {type:"app", app:"namaaplikasiku"},  // ← tambahkan ini
    }},
```

Format entri FS:
| `type` | Arti | Field tambahan |
|---|---|---|
| `"dir"` | Folder | `items: {...}` — isi folder |
| `"app"` | Shortcut ke aplikasi | `app: "namaFungsiAPPS"` |
| `"file"` | File teks biasa | `content: "..."` (opsional), bisa dibuka/diedit di Notepad |

> ⚠️ Perubahan di `DEFAULT_FS` hanya berlaku untuk **instalasi baru**. Kalau kamu sudah pernah membuka simulator ini di browser yang sama sebelumnya, `FS` tersimpan di `localStorage` dan entri lama akan dipakai (bukan `DEFAULT_FS` terbaru). Untuk memaksa reset: buka Control Panel → Reset Sistem, atau jalankan `localStorage.clear()` di console lalu refresh.

### c. Verifikasi
Refresh halaman (hard refresh `Ctrl+Shift+R` supaya tidak kena cache lama), lalu:
1. Ikon barumu harus muncul di desktop
2. Dobel klik → aplikasi terbuka
3. Buka MS-DOS Executive → masuk `C:\WIN` → file `.EXE` barumu ada di sana

---

## 5. Install "APK" / Paket Aplikasi Siap Pakai

Kalau kamu dapat file aplikasi dari orang lain (atau mau membagikan aplikasimu), formatnya cukup **satu file `.js`** yang mengikuti pola di [bagian 3](#3-menambah-aplikasi-baru). Ini "APK"-nya simulator ini.

### Cara "install" app dari orang lain:
1. Taruh file `.js` yang dikasih ke folder `js/`
2. Tambahkan `<script src="js/nama-file-itu.js"></script>` di `index.html` (sebelum `init.js`)
3. Tambahkan entri di `iconDefs` (lihat [bagian 4a](#a-ikon-di-desktop)) — **kecuali** file itu sudah menambahkan ikonnya sendiri secara otomatis (lihat pola self-registering di bawah)

### Pola "self-installing" (disarankan untuk app yang dibagikan ke orang lain)
Supaya orang lain tidak perlu edit `window-manager.js` secara manual, buat app-mu **mendaftarkan ikonnya sendiri** di akhir file:

```js
APPS.namaaplikasiku = function(opts){ /* ...seperti biasa... */ };

// Self-register: app ini otomatis menambahkan ikon sendiri ke desktop
// dan entri FS, tanpa perlu orang lain mengedit window-manager.js.
if (typeof iconDefs !== 'undefined') {
  iconDefs.push({label:"Aplikasi Saya", app:"namaaplikasiku", glyph:"🎯"});
}
if (typeof FS !== 'undefined' && FS["C:\\"] && FS["C:\\"].items["WIN"]) {
  FS["C:\\"].items["WIN"].items["PUNYAKU.EXE"] = {type:"app", app:"namaaplikasiku"};
}
```

Dengan pola ini, "install" app orang lain benar-benar tinggal:
1. Copy file `.js` ke folder `js/`
2. Tambah satu baris `<script>` di `index.html`
3. Refresh — selesai, ikon otomatis muncul.

> **Catatan urutan:** kode self-register di atas jalan saat file di-load, jadi file app tetap harus dimuat **setelah** `window-manager.js` (karena butuh `iconDefs` dan `FS` sudah ada) — taruh `<script>`-nya di antara app-app lain, sebelum `init.js`, seperti biasa.

---

## 6. Membuat Mod (Tema, Suara, Ikon)

### a. Menambah Tema Warna Baru
Buka `js/apps-system.js`, cari objek `schemes` (baris ~5):
```js
const schemes = {
  "Windows Standard": {desk:"#008080", title:"#000080"},
  "Hercules Mono": {desk:"#1a1a1a", title:"#000000"},
  "CGA Bold": {desk:"#550055", title:"#aa0000"},
  "EGA Sky": {desk:"#0000aa", title:"#00aaaa"},
  "Hijau Klasik": {desk:"#0b3d0b", title:"#145214"},
  "Tema Buatanku": {desk:"#4a0e4e", title:"#81318c"},  // ← tambahkan barumu
};
```
- `desk` — warna latar desktop (dipetakan ke variabel CSS `--desk-bg`)
- `title` — warna titlebar jendela aktif (`--title-active`)

Otomatis muncul di Control Panel → Colors, dan bisa dipanggil Copilot 1985 lewat perintah "ubah tema jadi ..." kalau kamu tambahkan juga kata kuncinya di `COPILOT_THEME_KEYWORDS` (`js/apps-copilot.js`).

Untuk kontrol warna yang lebih detail (bukan cuma 2 warna), semua variabel yang bisa diubah ada di `css/theme-schemes.css`:
```css
:root{
  --desk-bg: ...;      /* latar desktop */
  --win-bg: ...;        /* latar badan jendela */
  --win-border: ...;     /* border jendela */
  --title-active: ...;    /* titlebar jendela aktif */
  --title-inactive: ...;   /* titlebar jendela tidak aktif */
  --title-text: ...;        /* warna teks titlebar */
  --btn-face: ...;           /* warna tombol */
}
```
Kamu bisa set variabel ini langsung dari JS di mana saja:
```js
document.documentElement.style.setProperty('--win-bg', '#ffccff');
```

### b. Menambah Efek Suara Kustom
Semua suara sistem pakai Web Audio API murni (tidak ada file `.mp3`/`.wav` yang di-load — jadi mod suara di sini berarti *mengubah gelombang bunyi lewat kode*, bukan mengganti file audio). Fungsi dasarnya ada di `js/window-manager.js`:

```js
beep(freq = 520, dur = 90, type = 'square', vol = 0.05);
// freq: frekuensi nada (Hz)
// dur: durasi (milidetik)
// type: 'square' | 'sine' | 'sawtooth' | 'triangle'
// vol: volume 0–1
```

Contoh bikin efek suara custom (misal "tada!" 3 nada naik):
```js
function beepTada(){
  beep(600, 80);
  setTimeout(()=>beep(800, 80), 90);
  setTimeout(()=>beep(1000, 150), 180);
}
```
Panggil `beepTada()` di titik manapun dalam app-mu.

> Kalau kamu benar-benar ingin memutar file audio asli (`.mp3`/`.wav`), itu juga bisa — pakai `<audio>` HTML5 biasa di dalam `body.innerHTML` app-mu. Sistem tidak membatasi ini, cuma efek bawaan sistem (boot, buka/tutup jendela, error) memang sengaja synth murni biar tidak perlu file aset tambahan.

### c. Ikon Kustom (Non-Emoji)
Ikon desktop default pakai emoji (field `glyph` di `iconDefs`). Untuk pakai gambar asli:

1. Ubah render ikon di `initDesktopIcons()` (`js/window-manager.js`) — cari baris:
   ```js
   el.innerHTML = `<div class="glyph" ...>${d.glyph}</div><div class="label">${d.label}</div>`;
   ```
2. Tambahkan dukungan field `iconUrl` opsional:
   ```js
   const glyphHtml = d.iconUrl
     ? `<img src="${d.iconUrl}" style="width:32px;height:32px;">`
     : `<div class="glyph" style="font-size:28px;text-align:center;">${d.glyph}</div>`;
   el.innerHTML = `${glyphHtml}<div class="label">${d.label}</div>`;
   ```
3. Di `iconDefs`, pakai `iconUrl` alih-alih `glyph`:
   ```js
   {label:"App Saya", app:"appku", iconUrl:"assets/icon-appku.png"}
   ```
4. Taruh file gambar di folder baru `assets/` di root project.

---

## 7. Modifikasi Sistem Inti

Bagian ini untuk perubahan yang lebih dalam — **hati-hati**, salah edit di sini bisa merusak seluruh sistem, bukan cuma satu app.

### a. Menambah Command Baru di Terminal
Edit `js/apps-tools.js`, cari `APPS.terminal`, tambahkan cabang baru di rantai `if/else if`:
```js
else if(cmd==='HALO'){ out.textContent += "Halo juga!\n"; }
```
Command sistem yang sudah ada (`DIR`, `CD`, `/SHUTDOWN`, dst) mengikuti pola yang sama — ikuti gaya itu agar konsisten.

### b. Menambah Item Baru di BIOS Setup
BIOS punya 7 tab (Main/Advanced/Monitor/Boot/Security/Tool/Exit) di `js/apps-bios.js`, tiap tab adalah fungsi `renderXxx(panel)`. Tambahkan baris HTML baru di dalam `panel.innerHTML` fungsi yang relevan, lalu wire event handler-nya seperti pola yang sudah ada (lihat `draft.xxx = ...` untuk pola penyimpanan setting).

### c. Menambah Item Context Menu (Klik Kanan)
Ada di `js/window-manager.js`, fungsi `showContextMenu()` dipanggil dari listener `contextmenu` di `desktop`:
```js
desktop.addEventListener('contextmenu', e=>{
  e.preventDefault();
  showContextMenu(e.clientX, e.clientY, [
    {label:'📄 File Teks Baru', action:()=>{ /* ... */ }},
    // tambahkan item barumu di sini:
    {label:'🎯 Aksi Baru', action:()=>{ alert('Item context menu kustom!'); }},
    '-',  // '-' = garis pemisah
  ]);
});
```

### d. Mengubah Perilaku Boot Sequence
`bootSequence()` di `js/window-manager.js` mengontrol layar loading. Tahapannya ada di array `steps` di dalam fungsi `getSteps()` — tambah/kurangi baris di array itu untuk mengubah tahapan yang ditampilkan.

### e. Menyimpan Data Persisten untuk App-mu
Sistem sudah punya pola `localStorage` untuk FS, tema, dan pengaturan (lihat `LS_FS_KEY`, `LS_THEME_KEY`, `LS_SETTINGS_KEY`, `LS_BIOS_KEY` di `window-manager.js`). Untuk app-mu sendiri, ikuti pola yang sama — **selalu pakai prefix unik** supaya tidak bentrok dengan key lain:
```js
const LS_MYAPP_KEY = 'nebula-win1-myapp-data';
function saveMyData(data){
  try{ localStorage.setItem(LS_MYAPP_KEY, JSON.stringify(data)); }catch(e){ /* storage penuh/diblokir */ }
}
function loadMyData(){
  try{ return JSON.parse(localStorage.getItem(LS_MYAPP_KEY) || 'null'); }catch(e){ return null; }
}
```

---

## 8. API Referensi Cepat

Fungsi/objek global yang tersedia untuk semua aplikasi (didefinisikan di `window-manager.js` kecuali disebutkan lain):

| Nama | Keterangan |
|---|---|
| `makeWindow({title, width, height, x, y, resizable})` | Buat jendela baru, return `{body, win}` |
| `launchApp(appId, opts)` | Buka aplikasi lain dari dalam app-mu, mis. `launchApp('notepad')` |
| `APPS` | Registry semua aplikasi (`APPS.namaapp = function(){...}`) |
| `FS` | Objek filesystem tiruan (lihat [bagian 4b](#b-entri-di-ms-dos-executive-opsional-tapi-disarankan)) |
| `notifyFSChanged()` | Panggil setelah mengubah `FS` supaya MS-DOS Executive auto-refresh |
| `onFSChanged(fn)` | Daftar listener yang dipanggil tiap kali `FS` berubah |
| `hashStr(str)` | Hash sederhana (dipakai Nebula File Guard untuk deteksi modifikasi) |
| `beep(freq, dur, type, vol)` | Efek suara 8-bit sintetis |
| `simNow()` | Waktu sistem simulasi (ganti `new Date()` — bisa diubah lewat BIOS) |
| `primaryBootDrive()` | Drive aktif menurut urutan boot di BIOS (`"C"` atau `"A"`) |
| `applyTheme(schemeName)` | Ganti tema warna sistem (dari `js/apps-system.js`) |
| `tileWindows()` | Susun semua jendela terbuka jadi ubin (tiling) |
| `setTitlebarMic(win, on)` | Tampilkan/sembunyikan badge 🔊 ON-MIC di titlebar jendela |
| `triggerBSOD(message)` | Tampilkan layar biru kematian (BSOD) dengan pesan kustom |
| `confirmResetSystem()` | Dialog konfirmasi reset seluruh sistem |
| `showContextMenu(x, y, items)` | Tampilkan menu klik-kanan kustom |
| `clipboard` | Variabel string clipboard sistem (dipakai Notepad/Write dsb) |

---

## 9. Multiplayer: Menghubungkan App Baru ke WebRTC

Kalau aplikasimu butuh fitur mabar online, pakai infrastruktur yang sudah ada di `js/multiplayer.js` — **jangan bikin sistem WebRTC sendiri dari nol**.

### Pola dasar (contoh minimal):
```js
APPS.gamekustomku = function(){
  const {body, win} = makeWindow({title:"Game Saya", width:500, height:400});
  body.innerHTML = `<div class="game-wrap" id="gk-wrap"></div>`;
  const wrap = body.querySelector('#gk-wrap');

  win.querySelector('.close').addEventListener('click', ()=> MP.close());

  buildMultiplayerPanel(wrap, {
    onReady: (role) => { startGame(role); },  // role: 'host' atau 'client'
    onLocal: () => { startGame('local'); },    // main sendiri/vs komputer
  });

  function startGame(mode){
    wrap.innerHTML = `<canvas id="gk-canvas" width="460" height="320"></canvas>`;
    // ...logika game...

    // kirim data ke lawan:
    MP.send({t:'posisi', x: 10, y: 20});

    // terima data dari lawan:
    MP.onData(msg => {
      if(msg.t === 'posisi'){ /* update posisi lawan */ }
    });
  }
};
```

### API `MP` (objek singleton, dari `multiplayer.js`):
| Fungsi | Keterangan |
|---|---|
| `MP.host(withMic)` | Mulai sebagai Host, return Promise kode undangan (base64) |
| `MP.join(offerText, withMic)` | Gabung sebagai Client, return Promise kode balasan |
| `MP.completeHost(answerText)` | Host menyelesaikan koneksi dengan kode balasan dari Client |
| `MP.send(obj)` | Kirim objek (di-`JSON.stringify` otomatis) ke lawan |
| `MP.onData(fn)` | Daftar handler untuk pesan masuk dari lawan |
| `MP.onState(fn)` | Daftar handler status koneksi (dipakai internal oleh `buildMultiplayerPanel`, biasanya tidak perlu dipanggil manual di app-mu) |
| `MP.isHost()` | `true` kalau kamu adalah Host |
| `MP.isConnected()` | `true` kalau data channel benar-benar terbuka |
| `MP.hasMic()` | `true` kalau voice chat aktif |
| `MP.close()` | Tutup koneksi (**wajib** dipanggil saat jendela ditutup) |

> ⚠️ **Penting:** sinyal "siap main" yang sah **hanya** `onReady` dari `buildMultiplayerPanel` (dipicu oleh data channel benar-benar terbuka). Jangan pernah membuat logika sendiri yang menganggap koneksi "siap" dari status ICE mentah (`iceConnectionState`) — itu level jaringan, bukan indikator kesiapan data channel, dan pernah menyebabkan bug game mulai sebelum kedua sisi benar-benar terhubung.

### Pola host-authoritative (disarankan untuk game real-time)
Untuk game yang butuh fisika/state sinkron (lihat `apps-games-pong.js` atau `apps-game-football.js` sebagai contoh): **Host** menjalankan seluruh simulasi (fisika, AI, skor) dan menyiarkan state penuh tiap frame; **Client** cuma mengirim input (tombol yang ditekan) dan merender apa yang diterima dari Host. Ini menghindari desync karena cuma ada satu sumber kebenaran.

---

## 10. Debugging & Kesalahan Umum

| Gejala | Kemungkinan Penyebab | Solusi |
|---|---|---|
| Aplikasi tidak muncul di desktop | Lupa tambah entri di `iconDefs` | Cek [bagian 4a](#a-ikon-di-desktop) |
| Dobel klik ikon tidak terjadi apa-apa | Nama `app:` di `iconDefs` tidak sama persis dengan `APPS.namaFungsi` | Pastikan penulisan identik (case-sensitive) |
| `Uncaught ReferenceError: APPS is not defined` | File app dimuat **sebelum** `window-manager.js` di `index.html` | Pindahkan `<script>` app-mu ke bawah `window-manager.js` |
| Ikon lama masih muncul setelah edit `DEFAULT_FS` | `FS` sudah tersimpan di `localStorage` dari sesi sebelumnya | Reset lewat Control Panel, atau `localStorage.clear()` di console |
| Perubahan CSS tidak kelihatan | Cache browser | Hard refresh (`Ctrl+Shift+R` / `Cmd+Shift+R`) |
| Game multiplayer "nyangkut"/tidak mulai | Kode undangan/balasan belum ditukar tuntas, atau `MP.close()` tidak dipanggil saat jendela lama ditutup | Lihat [bagian 9](#9-multiplayer-menghubungkan-app-baru-ke-webrtc), pastikan alur Host→Client→Host diikuti persis |
| Error di console pas buka app baru | Salah ketik di `body.innerHTML` (tag tidak ditutup) atau `querySelector` mengambil elemen yang belum ada di DOM | Buka DevTools (`F12`) → tab Console, baca baris error-nya, biasanya nunjuk persis baris yang salah |

**Cara paling cepat mengecek app baru jalan atau tidak:** buka DevTools Console (`F12`), ketik langsung:
```js
launchApp('namaaplikasiku')
```
Kalau muncul jendela → kode app-nya benar, masalahnya di pendaftaran ikon/FS. Kalau muncul error di console → masalahnya di dalam kode app itu sendiri.

---

## 11. Checklist Sebelum Rilis Mod

- [ ] File `.js` baru ditaruh di folder `js/`
- [ ] `<script>` ditambahkan di `index.html`, urutannya **setelah** `window-manager.js`/`apps-bios.js`/`multiplayer.js`, **sebelum** `init.js`
- [ ] Nama di `APPS.xxx` sama persis dengan yang dipakai di `iconDefs`/`FS`
- [ ] Sudah dites: hard refresh browser, buka dari desktop DAN dari MS-DOS Executive
- [ ] Tidak ada error di DevTools Console (`F12`)
- [ ] Kalau app pakai `localStorage`, key-nya pakai prefix unik (tidak bentrok `nebula-win1-*` bawaan sistem)
- [ ] Kalau app multiplayer: `MP.close()` dipanggil di event `close` jendela
- [ ] Kalau dibagikan ke orang lain: pertimbangkan pola *self-installing* ([bagian 5](#5-install-apk--paket-aplikasi-siap-pakai)) biar tidak perlu edit manual `window-manager.js`

---

*Windows 1.0 Ultimate — Zen Production. Simulator edukatif/hobi, tidak berafiliasi dengan Microsoft.*
