/* =========================================================
   DOOM 1.0 MINI-FPS (raycasting ala Wolfenstein/DOOM klasik)
   Peta cuma array 2D kotak-kotak. Tiap frame, puluhan sinar
   ditembakkan dari posisi & sudut hadap pemain; jarak sinar ke
   dinding menentukan tinggi kolom vertikal yang digambar —
   gabungan ratusan kolom itu menciptakan ilusi lorong 3D tanpa
   WebGL. Lawan main (kalau multiplayer) digambar sebagai sprite
   2D yang membesar/mengecil sesuai jarak dari kamera kita.
   ========================================================= */
APPS.doom3d = function(){
  const {body, win} = makeWindow({title:"DOOM 1.0 Mini-FPS", width:560, height:440});
  body.innerHTML = `<div class="game-wrap" id="doom-wrap"></div>`;
  const wrap = body.querySelector('#doom-wrap');

  const MAP = [
    [1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,1,0,0,0,0,0,0,1],
    [1,0,1,0,1,0,1,1,1,1,0,1],
    [1,0,1,0,0,0,1,0,0,0,0,1],
    [1,0,1,1,1,0,1,0,1,1,0,1],
    [1,0,0,0,1,0,0,0,1,0,0,1],
    [1,1,1,0,1,1,1,0,1,0,1,1],
    [1,0,0,0,0,0,1,0,0,0,0,1],
    [1,0,1,1,1,0,1,1,1,1,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1],
  ];
  const FOV = Math.PI/3, NUM_RAYS = 100, MAX_DIST = 16, STEP = 0.03;
  let raf = null, mode = null;

  function cleanup(){
    if(raf) cancelAnimationFrame(raf);
    if(document.pointerLockElement) document.exitPointerLock();
    MP.close();
  }
  win.querySelector('.close').addEventListener('click', cleanup);

  buildMultiplayerPanel(wrap, {
    onReady:(role)=>{ setTitlebarMic(win, MP.hasMic()); startGame(role); },
    onLocal:()=> startGame('local'),
  });

  function castRay(px, py, angle){
    let dist = 0;
    let steps = 0;
    const MAX_STEPS = Math.ceil(MAX_DIST/STEP) + 8; // safety boundary guard eksplisit
    while(dist < MAX_DIST){
      steps++;
      if(steps > MAX_STEPS) return MAX_DIST; // jaga-jaga ekstra: paksa berhenti, anggap kena batas pandang terjauh
      dist += STEP;
      const x = px + Math.cos(angle)*dist;
      const y = py + Math.sin(angle)*dist;
      const mx = Math.floor(x), my = Math.floor(y);
      if(my<0||my>=MAP.length||mx<0||mx>=MAP[0].length||MAP[my][mx]===1) return dist;
    }
    return MAX_DIST;
  }
  function isWall(x,y){
    const mx=Math.floor(x), my=Math.floor(y);
    if(my<0||my>=MAP.length||mx<0||mx>=MAP[0].length) return true;
    return MAP[my][mx]===1;
  }
  /* FIX: cek apakah ada dinding di antara dua titik (line-of-sight), supaya
     sprite lawan tidak digambar kalau sebenarnya terhalang dinding.
     Sebelumnya sprite hanya dicek berdasarkan sudut pandang (FOV) dan jarak
     maksimum saja, tidak pernah dicek apakah ada tembok di antaranya —
     itu sebabnya lawan kelihatan "tembus dinding". */
  function hasLineOfSight(px, py, tx, ty){
    const dx=tx-px, dy=ty-py;
    const distToTarget = Math.hypot(dx,dy);
    const angle = Math.atan2(dy,dx);
    const distToWall = castRay(px,py,angle);
    return distToTarget < distToWall - 0.05; // toleransi kecil biar tidak "flicker" pas persis di ambang pintu
  }

  function startGame(role){
    mode = role;
    wrap.innerHTML = `
      <div class="game-overlay-btn" id="doom-lockbtn">Klik untuk mulai<br><small>(mouse akan dikunci untuk melihat sekeliling — tekan ESC untuk lepas)</small></div>
      <canvas id="doom-canvas" width="480" height="320"></canvas>
      <div class="game-hud" id="doom-hud">HP: 100</div>
      <div class="game-hud-right">${mode==='local'?'MODE LATIHAN (tanpa lawan)':(mode==='host'?'HOST':'CLIENT')}</div>
      <div class="game-crosshair" id="doom-cross"></div>
      <div class="game-lockhint">WASD: gerak · Mouse: lihat sekeliling · Klik: tembak</div>`;
    const canvas = wrap.querySelector('#doom-canvas');
    const ctx = canvas.getContext('2d');
    const W=canvas.width, H=canvas.height;
    const lockBtn = wrap.querySelector('#doom-lockbtn');

    let px=1.5, py=1.5, pa=0, hp=100;
    let dead = false;
    const SPAWN = {x:1.5, y:1.5, a:0};
    let remote = null; // {x,y,angle} lawan, kalau multiplayer

    lockBtn.onclick = ()=>{ canvas.requestPointerLock(); lockBtn.style.display='none'; };
    document.addEventListener('pointerlockchange', ()=>{
      if(document.pointerLockElement!==canvas) lockBtn.style.display='flex';
    });
    document.addEventListener('mousemove', e=>{
      if(document.pointerLockElement===canvas) pa += e.movementX * 0.0025;
    });
    canvas.addEventListener('click', ()=>{
      if(document.pointerLockElement!==canvas) return;
      if(dead) return; // tidak bisa nembak saat mati
      beep(1400,25); setTimeout(()=>beep(900,60),30); // dor! efek 8-bit
      if(mode!=='local') MP.send({t:'shoot'});
      if(remote){
        const dx=remote.x-px, dy=remote.y-py;
        const distToRemote = Math.hypot(dx,dy);
        const angToRemote = Math.atan2(dy,dx);
        let diff = ((angToRemote-pa+Math.PI*3)%(Math.PI*2))-Math.PI;
        if(Math.abs(diff)<0.15 && distToRemote<10 && hasLineOfSight(px,py,remote.x,remote.y)){
          beep(1800,40); setTimeout(()=>beep(2200,80),50);
          if(mode!=='local') MP.send({t:'hit'});
        }
      }
    });

    const keys = {};
    window.addEventListener('keydown', e=>{ keys[e.key.toLowerCase()]=true; });
    window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()]=false; });

    if(mode!=='local'){
      MP.onData(msg=>{
        if(msg.t==='pose') remote = {x:msg.x, y:msg.y, angle:msg.angle};
        else if(msg.t==='shoot'){ /* lawan menembak — beep jauh biar kerasa suasana */ beep(700,50); }
        else if(msg.t==='hit'){
          if(dead) return; // sudah mati, jangan diproses lagi sampai respawn
          hp = Math.max(0, hp-20);
          beep(220,200,'sawtooth');
          if(hp<=0) triggerDeath();
        }
      });
    }

    function triggerDeath(){
      dead = true;
      beep(180,150,'sawtooth'); setTimeout(()=>beep(120,150,'sawtooth'),140); setTimeout(()=>beep(80,300,'sawtooth'),280);
      if(document.pointerLockElement===canvas) document.exitPointerLock();
      const overlay = document.createElement('div');
      overlay.className='game-overlay-btn';
      overlay.id='doom-death-overlay';
      overlay.innerHTML = `<div style="text-align:center;">
        <div style="font-size:22px;color:#e33;font-weight:bold;margin-bottom:10px;">KAMU MATI</div>
        <button class="win-btn" id="doom-respawn-btn">Respawn</button>
      </div>`;
      wrap.appendChild(overlay);
      overlay.querySelector('#doom-respawn-btn').onclick = (e)=>{
        e.stopPropagation();
        respawn();
        overlay.remove();
      };
    }
    function respawn(){
      hp = 100; dead = false;
      px = SPAWN.x; py = SPAWN.y; pa = SPAWN.a;
      lockBtn.style.display='flex';
    }

    let lastSend = 0;
    function movePlayer(dt){
      if(dead) return; // tidak bisa gerak saat mati
      const speed = 2.4*dt;
      let mx=0, my=0;
      if(keys['w']||keys['arrowup']){ mx+=Math.cos(pa)*speed; my+=Math.sin(pa)*speed; }
      if(keys['s']||keys['arrowdown']){ mx-=Math.cos(pa)*speed; my-=Math.sin(pa)*speed; }
      if(keys['a']){ mx+=Math.cos(pa-Math.PI/2)*speed; my+=Math.sin(pa-Math.PI/2)*speed; }
      if(keys['d']){ mx+=Math.cos(pa+Math.PI/2)*speed; my+=Math.sin(pa+Math.PI/2)*speed; }
      if(!isWall(px+mx, py)) px+=mx;
      if(!isWall(px, py+my)) py+=my;
    }

    function render(){
      // langit & lantai
      ctx.fillStyle='#333'; ctx.fillRect(0,0,W,H/2);
      ctx.fillStyle='#111'; ctx.fillRect(0,H/2,W,H/2);
      // dinding via raycasting
      for(let i=0;i<NUM_RAYS;i++){
        const rayAngle = pa - FOV/2 + (i/NUM_RAYS)*FOV;
        let dist = castRay(px,py,rayAngle);
        dist *= Math.cos(rayAngle-pa); // koreksi efek fisheye
        const colH = Math.min(H, (H/dist)*0.9);
        const shade = Math.max(0.15, 1-dist/MAX_DIST);
        const g = Math.floor(40+180*shade);
        ctx.fillStyle = `rgb(${Math.floor(g*0.3)},${g},${Math.floor(g*0.3)})`;
        ctx.fillRect(i*(W/NUM_RAYS), H/2-colH/2, Math.ceil(W/NUM_RAYS)+1, colH);
      }
      // sprite lawan (billboard sederhana)
      if(remote){
        const dx=remote.x-px, dy=remote.y-py;
        const dist = Math.hypot(dx,dy);
        const angTo = Math.atan2(dy,dx);
        let diff = ((angTo-pa+Math.PI*3)%(Math.PI*2))-Math.PI;
        if(Math.abs(diff)<FOV/2+0.2 && dist<MAX_DIST && hasLineOfSight(px,py,remote.x,remote.y)){
          const screenX = W/2 + Math.tan(diff)*(W/2)/Math.tan(FOV/2);
          const size = Math.min(H, (H/dist)*0.55);
          ctx.fillStyle = '#e33';
          ctx.fillRect(screenX-size/4, H/2-size/2, size/2, size);
          ctx.fillStyle = '#fff';
          ctx.fillRect(screenX-size/6, H/2-size/2, size/3, size/6);
        }
      }
      // senjata di bawah
      ctx.fillStyle='#555';
      ctx.fillRect(W/2-30, H-60, 60, 60);
      ctx.fillStyle='#888';
      ctx.fillRect(W/2-8, H-100, 16, 44);

      wrap.querySelector('#doom-hud').textContent = dead ? 'HP: 0 — MATI' : 'HP: '+hp;
      wrap.querySelector('#doom-hud').style.color = dead ? '#f55' : '';
    }

    let lastT = performance.now();
    function loop(t){
      const dt = Math.min(0.05,(t-lastT)/1000); lastT=t;
      movePlayer(dt);
      if(mode!=='local' && t-lastSend>60){ MP.send({t:'pose', x:px, y:py, angle:pa}); lastSend=t; }
      render();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
  }
};
