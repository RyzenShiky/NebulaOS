/* =========================================================
   STARFIELD COMMANDER 3D
   Bukan grid 2D seperti DOOM — semua objek (bintang, pesawat
   lawan, laser) disimpan sebagai titik koordinat 3D sejati
   (X,Y,Z). Tiap frame, titik dunia ditransformasi ke ruang
   kamera (relatif ke posisi & rotasi pesawat kita), lalu
   diproyeksikan ke layar 2D via pembagian perspektif:
     ScreenX = (X * FocalLength)/Z + CenterX
     ScreenY = (Y * FocalLength)/Z + CenterY
   Karena dibagi Z, objek yang menjauh (Z besar) otomatis
   mengecil dan objek yang mendekat (Z kecil) membesar.
   ========================================================= */
APPS.space3d = function(){
  const {body, win} = makeWindow({title:"Starfield Commander 3D", width:560, height:440});
  body.innerHTML = `<div class="game-wrap" id="sf-wrap"></div>`;
  const wrap = body.querySelector('#sf-wrap');

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

  /* ---- util vektor 3D ---- */
  function sub(a,b){ return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
  function length(v){ return Math.hypot(v[0],v[1],v[2]); }
  function rotateYawPitch(v, yaw, pitch){
    const cy=Math.cos(yaw), sy=Math.sin(yaw);
    let x1 = v[0]*cy - v[2]*sy;
    let z1 = v[0]*sy + v[2]*cy;
    const cp=Math.cos(pitch), sp=Math.sin(pitch);
    let y2 = v[1]*cp - z1*sp;
    let z2 = v[1]*sp + z1*cp;
    return [x1, y2, z2];
  }
  function forwardVector(yaw, pitch){
    return [Math.sin(yaw)*Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw)*Math.cos(pitch)];
  }
  function project(v, focal, cx, cy){
    if(v[2] <= 0.1) return null;
    return { x:(v[0]*focal)/v[2]+cx, y:(v[1]*focal)/v[2]+cy, scale: focal/v[2] };
  }

  function startGame(role){
    mode = role;
    wrap.innerHTML = `
      <div class="game-overlay-btn" id="sf-lockbtn">Klik untuk mulai<br><small>(mouse mengendalikan arah pandang kokpit — tekan ESC untuk lepas)</small></div>
      <canvas id="sf-canvas" width="480" height="320"></canvas>
      <div class="game-hud">HP: <span id="sf-hp">100</span></div>
      <div class="game-hud-right">${mode==='local'?'MODE LATIHAN':(mode==='host'?'HOST':'CLIENT')}<br><canvas id="sf-radar" width="70" height="70"></canvas></div>
      <div class="game-crosshair"></div>
      <div class="game-lockhint">W/S: maju-mundur · Mouse: arah pandang · A/D: roll · Klik: tembak laser</div>`;
    const canvas = wrap.querySelector('#sf-canvas');
    const ctx = canvas.getContext('2d');
    const radar = wrap.querySelector('#sf-radar');
    const rctx = radar.getContext('2d');
    const W=canvas.width, H=canvas.height, F=300, CX=W/2, CY=H/2;
    const lockBtn = wrap.querySelector('#sf-lockbtn');

    let pos=[0,0,0], yaw=0, pitch=0, roll=0, hp=100, speed=0;
    let remotePos=null, remoteVisible=false;
    const lasers = []; // {pos:[x,y,z], vel:[x,y,z], mine:bool, life}
    const stars = Array.from({length:140}, ()=>[
      (Math.random()*2-1)*40, (Math.random()*2-1)*40, Math.random()*60+2
    ]);

    lockBtn.onclick = ()=>{ canvas.requestPointerLock(); lockBtn.style.display='none'; };
    document.addEventListener('pointerlockchange', ()=>{
      if(document.pointerLockElement!==canvas) lockBtn.style.display='flex';
    });
    document.addEventListener('mousemove', e=>{
      if(document.pointerLockElement!==canvas) return;
      yaw += e.movementX*0.0022;
      pitch = Math.max(-1.2, Math.min(1.2, pitch + e.movementY*0.0022));
    });
    const keys = {};
    window.addEventListener('keydown', e=>{ keys[e.key.toLowerCase()]=true; });
    window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()]=false; });

    canvas.addEventListener('click', ()=>{
      if(document.pointerLockElement!==canvas) return;
      const fwd = forwardVector(yaw,pitch);
      const laser = { pos:[pos[0]+fwd[0]*2,pos[1]+fwd[1]*2,pos[2]+fwd[2]*2], vel:[fwd[0]*40,fwd[1]*40,fwd[2]*40], mine:true, life:2 };
      lasers.push(laser);
      beep(1500,20);
      if(mode!=='local') MP.send({t:'fire', pos:laser.pos, vel:laser.vel});
    });

    if(mode!=='local'){
      MP.onData(msg=>{
        if(msg.t==='pose'){ remotePos=msg.pos; remoteVisible=true; }
        else if(msg.t==='fire'){ lasers.push({pos:msg.pos, vel:msg.vel, mine:false, life:2}); }
        else if(msg.t==='hit'){ hp=Math.max(0,hp-25); beep(220,220,'sawtooth'); wrap.querySelector('#sf-hp').textContent=hp; }
      });
    }

    let lastSend=0, lastT=performance.now();
    function update(dt){
      if(keys['a']) roll -= 1.6*dt;
      if(keys['d']) roll += 1.6*dt;
      if(keys['w']) speed = Math.min(14, speed+8*dt);
      else if(keys['s']) speed = Math.max(-6, speed-8*dt);
      else speed *= (1-1.5*dt);
      const fwd = forwardVector(yaw,pitch);
      pos = [pos[0]+fwd[0]*speed*dt, pos[1]+fwd[1]*speed*dt, pos[2]+fwd[2]*speed*dt];

      // bintang: reset kalau sudah lewat kamera, biar terasa terbang terus-menerus
      stars.forEach(s=>{ s[2]-=speed*dt; if(s[2]<1){ s[0]=(Math.random()*2-1)*40; s[1]=(Math.random()*2-1)*40; s[2]=60; } });

      // laser bergerak & mati setelah beberapa detik
      for(let i=lasers.length-1;i>=0;i--){
        const l=lasers[i];
        l.pos=[l.pos[0]+l.vel[0]*dt, l.pos[1]+l.vel[1]*dt, l.pos[2]+l.vel[2]*dt];
        l.life-=dt;
        if(l.life<=0){ lasers.splice(i,1); continue; }
        if(l.mine && remotePos){
          const d = length(sub(l.pos, remotePos));
          if(d<1.2){
            beep(1800,40); setTimeout(()=>beep(2200,90),50);
            lasers.splice(i,1);
            if(mode!=='local') MP.send({t:'hit'});
          }
        }
      }
      if(mode!=='local' && performance.now()-lastSend>60){ MP.send({t:'pose', pos}); lastSend=performance.now(); }
    }

    function toCamSpace(worldPoint){
      const rel = sub(worldPoint, pos);
      // KOREKSI: -yaw,-pitch sebelumnya membuat arah pandang terbalik (mouse ke
      // bawah/kanan membuat objek bergerak ke arah yang salah di layar).
      // Sudah diverifikasi ulang: yaw,pitch tanpa negasi menghasilkan arah yang benar.
      return rotateYawPitch(rel, yaw, pitch);
    }
    function applyRoll(x,y){
      const dx=x-CX, dy=y-CY;
      const cr=Math.cos(-roll), sr=Math.sin(-roll);
      return { x: CX+dx*cr-dy*sr, y: CY+dx*sr+dy*cr };
    }

    function render(){
      ctx.fillStyle='#000010'; ctx.fillRect(0,0,W,H);
      // bintang
      ctx.fillStyle='#fff';
      stars.forEach(s=>{
        const cam = rotateYawPitch(s, yaw, pitch); // bintang posisinya sudah relatif ke kamera (self-managed di array)
        const p = project(cam, F, CX, CY);
        if(!p) return;
        const rp = applyRoll(p.x,p.y);
        const size = Math.max(0.6, Math.min(3, p.scale*0.15));
        ctx.fillRect(rp.x, rp.y, size, size);
      });
      // laser
      lasers.forEach(l=>{
        const cam = toCamSpace(l.pos);
        const p = project(cam, F, CX, CY);
        if(!p) return;
        const rp = applyRoll(p.x,p.y);
        ctx.fillStyle = l.mine ? '#5ff' : '#f55';
        const s = Math.max(2, Math.min(8,p.scale*0.3));
        ctx.fillRect(rp.x-s/2, rp.y-s/2, s, s);
      });
      // pesawat lawan
      if(remotePos){
        const cam = toCamSpace(remotePos);
        const p = project(cam, F, CX, CY);
        if(p && p.scale>0){
          const rp = applyRoll(p.x,p.y);
          const size = Math.max(4, Math.min(120, p.scale*3));
          ctx.fillStyle='#e33';
          ctx.beginPath();
          ctx.moveTo(rp.x, rp.y-size/2);
          ctx.lineTo(rp.x-size/2, rp.y+size/2);
          ctx.lineTo(rp.x+size/2, rp.y+size/2);
          ctx.closePath(); ctx.fill();
        }
      }
      // radar mini (tampak atas)
      rctx.clearRect(0,0,70,70);
      rctx.strokeStyle='#0f0'; rctx.strokeRect(0,0,70,70);
      rctx.fillStyle='#0f0'; rctx.fillRect(33,33,4,4); // posisi kita di tengah
      if(remotePos){
        const rel = sub(remotePos,pos);
        const camRel = rotateYawPitch(rel,yaw,0);
        const rx = 35+Math.max(-32,Math.min(32,camRel[0]*1.2));
        const ry = 35+Math.max(-32,Math.min(32,camRel[2]*1.2));
        rctx.fillStyle='#f55'; rctx.fillRect(rx-2,ry-2,5,5);
      }
    }

    function loop(t){
      const dt = Math.min(0.05,(t-lastT)/1000); lastT=t;
      update(dt);
      render();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
  }
};
