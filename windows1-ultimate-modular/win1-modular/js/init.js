/* =========================================================
   INIT — dijalankan setelah semua modul app terdaftar
   ========================================================= */
loadTheme();
loadWallpaper();
loadSettings();
ensureBaselines();
initDesktopIcons();

bootSequence(()=>{
  beepStartup();
  launchApp('executive'); // buka MS-DOS Executive dulu seperti shell Windows 1.0 asli
});
