/* =========================================================
   PONG 1985 ARCADE
   Host menghitung fisika bola + posisi complete authoritative,
   menyiarkan state tiap frame. Client cuma mengirim posisi Y
   paddle-nya sendiri, dan merender state terakhir yang diterima
   dari Host — pola "host-authoritative" yang disebut di dokumen.
   Mode "Main Lokal" jalan vs AI sederhana kalau tidak ada lawan.
   ========================================================= */
APPS.pong2d = function(){
  const {body, win} = makeWindow({title:"Pong 1985 Arcade", width:520, height:420});
  body.innerHTML = `<div class="game-wrap" id="pong-wrap"></div>`;
  const wrap = body.querySelector('#pong-wrap');

  let mode = null; // 'host' | 'client' | 'local'
  let raf = null;

  function cleanup(){
    if(raf) cancelAnimationFrame(raf);
    MP.close();
  }
  win.querySelector('.close').addEventListener('click', cleanup);

  buildMultiplayerPanel(wrap, {
    onReady:(role)=>{ setTitlebarMic(win, MP.hasMic()); startGame(role); },
    onLocal:()=> startGame('local'),
  });

  function startGame(role){
    mode = role;
    wrap.innerHTML = `
      <canvas id="pong-canvas" width="480" height="320"></canvas>
      <div class="game-hud" id="pong-score">0 : 0</div>
      <div class="game-hud-right">${mode==='local' ? 'vs KOMPUTER' : (mode==='host'?'HOST (kiri)':'CLIENT (kanan)')}</div>`;
    const canvas = wrap.querySelector('#pong-canvas');
    const ctx = canvas.getContext('2d');
    const W=canvas.width, H=canvas.height, PW=8, PH=60;

    let leftY=H/2, rightY=H/2, ballX=W/2, ballY=H/2, ballVX=4, ballVY=2.4, scoreL=0, scoreR=0;
    let myY = H/2; // posisi paddle yang dikendalikan pemain ini secara lokal

    canvas.addEventListener('mousemove', e=>{
      const r = canvas.getBoundingClientRect();
      myY = Math.max(PH/2, Math.min(H-PH/2, e.clientY - r.top));
      if(mode==='client') MP.send({t:'paddle', y:myY});
    });

    if(mode!=='client'){
      MP.onData(msg=>{ if(msg.t==='paddle') rightY = msg.y; });
    } else {
      MP.onData(msg=>{ if(msg.t==='state'){ ballX=msg.ballX; ballY=msg.ballY; leftY=msg.leftY; rightY=msg.rightY; scoreL=msg.scoreL; scoreR=msg.scoreR; } });
    }

    function resetBall(dir){ ballX=W/2; ballY=H/2; ballVX=4*dir; ballVY=(Math.random()*4-2); }

    function hostTick(){
      leftY = myY;
      if(mode==='local'){
        // AI sederhana: kejar posisi bola dengan kecepatan terbatas
        const target = ballY;
        if(rightY < target-4) rightY += 3.2;
        else if(rightY > target+4) rightY -= 3.2;
      }
      ballX += ballVX; ballY += ballVY;
      if(ballY<6){ ballY=6; ballVY*=-1; }
      if(ballY>H-6){ ballY=H-6; ballVY*=-1; }
      // tabrakan paddle kiri
      if(ballX-6<PW+10 && ballX-6>0 && Math.abs(ballY-leftY)<PH/2){ ballVX=Math.abs(ballVX)*1.03; ballX=PW+16; beep(500,30); }
      // tabrakan paddle kanan
      if(ballX+6>W-PW-10 && ballX+6<W && Math.abs(ballY-rightY)<PH/2){ ballVX=-Math.abs(ballVX)*1.03; ballX=W-PW-16; beep(500,30); }
      if(ballX<0){ scoreR++; beep(200,150); resetBall(1); }
      if(ballX>W){ scoreL++; beep(200,150); resetBall(-1); }
      if(mode!=='local') MP.send({t:'state', ballX,ballY,leftY,rightY,scoreL,scoreR});
    }

    function render(){
      ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
      ctx.strokeStyle='#0f0'; ctx.setLineDash([6,8]);
      ctx.beginPath(); ctx.moveTo(W/2,0); ctx.lineTo(W/2,H); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle='#0f0';
      ctx.fillRect(6, leftY-PH/2, PW, PH);
      ctx.fillRect(W-6-PW, rightY-PH/2, PW, PH);
      ctx.beginPath(); ctx.arc(ballX,ballY,6,0,Math.PI*2); ctx.fill();
      wrap.querySelector('#pong-score').textContent = `${scoreL} : ${scoreR}`;
      if(scoreL>=5 || scoreR>=5){
        ctx.fillStyle='#0f0'; ctx.font='24px monospace'; ctx.textAlign='center';
        ctx.fillText((scoreL>=5?'KIRI':'KANAN')+' MENANG!', W/2, H/2);
        ctx.textAlign='start';
      }
    }

    function loop(){
      if(scoreL<5 && scoreR<5){
        if(mode==='host' || mode==='local') hostTick();
        else { rightY = myY; } // client: update posisi paddle sendiri untuk dirender halus di layarnya
      }
      render();
      raf = requestAnimationFrame(loop);
    }
    loop();
  }
};
