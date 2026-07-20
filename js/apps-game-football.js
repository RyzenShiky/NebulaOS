/* =========================================================
   RETRO KICK 3D
   Game sepak bola arkade orisinal (nama tim/klub fiktif, TIDAK
   meniru merek dagang apa pun). Lapangan & pemain digambar
   pakai proyeksi perspektif 3D sejati (rumus sama yang sudah
   divalidasi di Starfield Commander 3D) dari kamera tetap di
   belakang gawang, ditambah fisika bola nyata (gravitasi,
   pantulan, gesekan), AI rekan setim & lawan, sprint+stamina,
   dan multiplayer host-authoritative lewat WebRTC (pola sama
   seperti Pong 1985).
   ========================================================= */
APPS.football3d = function(){
  const {body, win} = makeWindow({title:"Retro Kick 3D", width:600, height:460});
  body.innerHTML = `<div class="game-wrap" id="rk-wrap"></div>`;
  const wrap = body.querySelector('#rk-wrap');

  const PITCH_X = 34, PITCH_Z = 52, GOAL_HALF_W = 3.66, GOAL_H = 2.44;
  const F = 340; // focal length kamera

  let raf = null, mode = null;
  function cleanup(){ if(raf) cancelAnimationFrame(raf); MP.close(); }
  win.querySelector('.close').addEventListener('click', cleanup);

  buildMultiplayerPanel(wrap, {
    onReady:(role)=>{ setTitlebarMic(win, MP.hasMic()); startGame(role); },
    onLocal:()=> startGame('local'),
  });

  function project(v, cx, cy){
    if(v[2] <= 0.5) return null;
    return { x:(v[0]*F)/v[2]+cx, y:(v[1]*F)/v[2]+cy, scale: F/v[2] };
  }
  function worldToCam(p, cam){
    // KOREKSI: rumus sebelumnya salah tanda pada komponen tinggi (ry), membuat
    // hampir semua objek di lapangan terproyeksi ke luar batas atas kanvas
    // (screenY negatif) sehingga tidak terlihat sama sekali - itu sebabnya
    // Merah dan bola tidak tampak di layar. ry sekarang dihitung sebagai
    // (tinggi kamera - tinggi objek) supaya objek yang lebih rendah dari
    // kamera konsisten terproyeksi ke bagian bawah layar, sudah diverifikasi
    // dengan titik-titik asli dari lapangan (pemain, bola, tepi lapangan).
    const rx = p[0]-cam.pos[0], ry = cam.pos[1]-p[1], rz = p[2]-cam.pos[2];
    return [ rx, ry*Math.cos(cam.pitch)-rz*Math.sin(cam.pitch), ry*Math.sin(cam.pitch)+rz*Math.cos(cam.pitch) ];
  }

  function startGame(role){
    mode = role;
    wrap.innerHTML = `
      <canvas id="rk-canvas" width="520" height="360"></canvas>
      <div class="game-hud" id="rk-score">MERAH 0 : 0 BIRU</div>
      <div class="game-hud-right" id="rk-time">02:00${mode==='local'?' · vs KOMPUTER':(mode==='host'?' · HOST (Merah)':' · CLIENT (Biru)')}</div>
      <div class="game-lockhint">WASD/Panah: gerak · Shift: sprint · Spasi (tap=umpan, tahan=tendang keras)</div>`;
    const canvas = wrap.querySelector('#rk-canvas');
    const ctx = canvas.getContext('2d');
    const W=canvas.width, H=canvas.height, CX=W/2, CY=H/2+40;
    const cam = { pos:[0,22,-78], pitch:0.36 };

    // ---- state dunia ----
    const ball = {x:0,y:0.11,z:0,vx:0,vy:0,vz:0, owner:null};
    let scoreRed=0, scoreBlue=0, timeLeft=120, matchOver=false;

    function makePlayer(team, x, z, isUser){
      return { team, x, z, baseX:x, baseZ:z, vx:0, vz:0, stamina:100, sprint:false, isUser };
    }
    // formasi sederhana: 4 pemain per tim (termasuk 1 dikendalikan user/AI utama)
    const players = [
      makePlayer('red', -8, -20, mode!=='client'),
      makePlayer('red', 8, -20, false),
      makePlayer('red', -14, -40, false),
      makePlayer('red', 14, -40, false),
      makePlayer('blue', -8, 20, mode==='client'),
      makePlayer('blue', 8, 20, false),
      makePlayer('blue', -14, 40, false),
      makePlayer('blue', 14, 40, false),
    ];
    const myPlayer = players.find(p=>p.isUser) || players[0];

    const keys = {};
    window.addEventListener('keydown', e=>{ keys[e.key.toLowerCase()]=true; });
    window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()]=false; });
    let spaceDownAt = 0;
    window.addEventListener('keydown', e=>{ if(e.key===' ' && !spaceDownAt) spaceDownAt = performance.now(); });
    window.addEventListener('keyup', e=>{
      if(e.key===' ' && spaceDownAt){
        const held = performance.now()-spaceDownAt;
        spaceDownAt = 0;
        tryKick(myPlayer, held);
      }
    });

    function dist2(a,b){ const dx=a.x-b.x, dz=a.z-b.z; return dx*dx+dz*dz; }

    function tryKick(p, heldMs){
      const dx=ball.x-p.x, dz=ball.z-p.z;
      if(dx*dx+dz*dz > 3.5) return; // bola terlalu jauh buat ditendang
      // arah tendangan: ke arah gerak pemain, atau ke depan gawang lawan kalau diam
      let dirX = p.vx, dirZ = p.vz;
      const mag = Math.hypot(dirX,dirZ);
      if(mag<0.1){ dirZ = p.team==='red' ? 1 : -1; dirX = 0; } else { dirX/=mag; dirZ/=mag; }
      const charged = Math.min(1, heldMs/500);
      const power = 6 + charged*16; // tap = umpan pelan, tahan = tendangan keras
      ball.vx = dirX*power; ball.vz = dirZ*power;
      ball.vy = 2 + charged*6; // makin ditahan, makin melambung (efek tendangan keras/lob)
      ball.owner = null;
      beep(700,25);
      if(mode!=='local' && p===myPlayer) MP.send({t:'kick', vx:ball.vx, vy:ball.vy, vz:ball.vz, x:ball.x, z:ball.z});
    }

    if(mode!=='local'){
      MP.onData(msg=>{
        if(msg.t==='input'){ remoteInput = msg; }
        else if(msg.t==='kick'){ ball.vx=msg.vx; ball.vy=msg.vy; ball.vz=msg.vz; ball.x=msg.x; ball.z=msg.z; ball.owner=null; beep(500,20); }
        else if(msg.t==='state'){ applyRemoteState(msg); }
      });
    }
    let remoteInput = {dx:0, dz:0, sprint:false};

    function applyRemoteState(s){
      ball.x=s.b[0]; ball.y=s.b[1]; ball.z=s.b[2]; ball.vx=s.b[3]; ball.vy=s.b[4]; ball.vz=s.b[5];
      players.forEach((p,i)=>{ if(i!==players.indexOf(myPlayer)){ p.x=s.p[i][0]; p.z=s.p[i][1]; } });
      scoreRed=s.sr; scoreBlue=s.sb; timeLeft=s.tl;
    }

    function moveUserPlayer(p, dt){
      let dx=0, dz=0;
      if(keys['w']||keys['arrowup']) dz-=1;
      if(keys['s']||keys['arrowdown']) dz+=1;
      if(keys['a']||keys['arrowleft']) dx-=1;
      if(keys['d']||keys['arrowright']) dx+=1;
      const mag = Math.hypot(dx,dz);
      const sprinting = !!keys['shift'] && p.stamina>5;
      const baseSpeed = 8;
      const speed = sprinting ? baseSpeed*1.6 : baseSpeed;
      if(mag>0){ dx/=mag; dz/=mag; p.x += dx*speed*dt; p.z += dz*speed*dt; p.vx=dx*speed; p.vz=dz*speed; }
      else { p.vx*=0.8; p.vz*=0.8; }
      if(sprinting){ p.stamina = Math.max(0, p.stamina-25*dt); } else { p.stamina = Math.min(100, p.stamina+12*dt); }
      p.x = Math.max(-PITCH_X, Math.min(PITCH_X, p.x));
      p.z = Math.max(-PITCH_Z, Math.min(PITCH_Z, p.z));
    }

    function moveRemotePlayer(p, dt){
      const speed = remoteInput.sprint ? 12.8 : 8;
      p.x += remoteInput.dx*speed*dt; p.z += remoteInput.dz*speed*dt;
      p.x = Math.max(-PITCH_X, Math.min(PITCH_X, p.x));
      p.z = Math.max(-PITCH_Z, Math.min(PITCH_Z, p.z));
    }

    function moveAI(p, dt){
      // AI sederhana: kalau dekat bola & tak bertuan, kejar bola; kalau tidak, jaga posisi formasi (dengan sedikit tarikan ke arah bola)
      const dToBall = Math.hypot(ball.x-p.x, ball.z-p.z);
      let targetX, targetZ;
      const nearestSameTeam = players.filter(q=>q.team===p.team).reduce((best,q)=>{
        const d = Math.hypot(ball.x-q.x, ball.z-q.z);
        return (!best || d<best.d) ? {q,d} : best;
      }, null);
      const isClosestChaser = nearestSameTeam && nearestSameTeam.q===p;
      if(isClosestChaser && dToBall<28){
        targetX = ball.x; targetZ = ball.z;
      } else {
        targetX = p.baseX + (ball.x-p.baseX)*0.25;
        targetZ = p.baseZ + (ball.z-p.baseZ)*0.2;
      }
      const dx=targetX-p.x, dz=targetZ-p.z;
      const mag=Math.hypot(dx,dz);
      const speed = 7;
      if(mag>0.3){ p.x += (dx/mag)*speed*dt; p.z += (dz/mag)*speed*dt; p.vx=(dx/mag)*speed; p.vz=(dz/mag)*speed; }
      // AI otomatis nendang kalau deket bola & bebas
      if(dToBall<1.6 && ball.owner===null && Math.random()<0.06) tryKick(p, Math.random()*400);
      p.x = Math.max(-PITCH_X, Math.min(PITCH_X, p.x));
      p.z = Math.max(-PITCH_Z, Math.min(PITCH_Z, p.z));
    }

    function updateBall(dt){
      ball.vy -= 9.8*dt;
      ball.x += ball.vx*dt; ball.y += ball.vy*dt; ball.z += ball.vz*dt;
      if(ball.y<=0.11){
        ball.y=0.11;
        if(ball.vy<0) ball.vy=-ball.vy*0.42;
        const fric = 1-Math.min(1, 2.4*dt);
        ball.vx*=fric; ball.vz*=fric;
        if(Math.abs(ball.vy)<0.5) ball.vy=0;
      }
      // pantul dari sisi lapangan (out samping sederhana: dorong balik biar tetap dalam arena)
      if(ball.x<-PITCH_X){ ball.x=-PITCH_X; ball.vx*=-0.5; }
      if(ball.x>PITCH_X){ ball.x=PITCH_X; ball.vx*=-0.5; }
      // dribble sederhana: kalau pemain dekat & bola pelan, bola nempel dituntun pemain terdekat
      let closest=null, closestD=999;
      players.forEach(p=>{ const d=Math.hypot(ball.x-p.x, ball.z-p.z); if(d<closestD){closestD=d; closest=p;} });
      const ballSpeed = Math.hypot(ball.vx,ball.vz);
      if(closest && closestD<1.1 && ballSpeed<9 && ball.y<0.3){
        const dx=closest.x-ball.x, dz=closest.z-ball.z;
        ball.x += dx*0.18; ball.z += dz*0.18;
        ball.owner = closest;
      }
      // deteksi gol
      if(!matchOver){
        if(ball.z > PITCH_Z+1 && Math.abs(ball.x) < GOAL_HALF_W && ball.y < GOAL_H){ scoreBlue++; beep(900,80); setTimeout(()=>beep(1200,120),90); resetKickoff(); }
        else if(ball.z < -PITCH_Z-1 && Math.abs(ball.x) < GOAL_HALF_W && ball.y < GOAL_H){ scoreRed++; beep(900,80); setTimeout(()=>beep(1200,120),90); resetKickoff(); }
        else if(Math.abs(ball.z)>PITCH_Z+1){ resetKickoff(); } // keluar belakang gawang tapi bukan gol -> reset simpel
      }
    }
    function resetKickoff(){
      ball.x=0; ball.y=0.11; ball.z=0; ball.vx=0; ball.vy=0; ball.vz=0; ball.owner=null;
      players.forEach(p=>{ p.x=p.baseX; p.z=p.baseZ; });
    }

    let lastSend=0, lastT=performance.now();
    function tick(t){
      const dt = Math.min(0.05, (t-lastT)/1000); lastT=t;
      if(!matchOver && (mode==='local'||mode==='host')){
        timeLeft -= dt;
        if(timeLeft<=0){ timeLeft=0; matchOver=true; }
      }
      const myIndex = players.indexOf(myPlayer);
      players.forEach((p,i)=>{
        if(p===myPlayer){ moveUserPlayer(p, dt); }
        else if(mode!=='local' && i===(mode==='host'?4:0)){ moveRemotePlayer(p, dt); } // slot lawan manusia
        else { moveAI(p, dt); }
      });
      if(mode==='local' || mode==='host'){
        updateBall(dt);
        if(mode!=='local' && t-lastSend>50){
          MP.send({t:'state', b:[ball.x,ball.y,ball.z,ball.vx,ball.vy,ball.vz], p:players.map(p=>[p.x,p.z]), sr:scoreRed, sb:scoreBlue, tl:timeLeft});
          lastSend=t;
        }
      }
      if(mode==='client' && t-lastSend>50){
        MP.send({t:'input', dx: (keys['d']||keys['arrowright']?1:0)-(keys['a']||keys['arrowleft']?1:0), dz:(keys['s']||keys['arrowdown']?1:0)-(keys['w']||keys['arrowup']?1:0), sprint: !!keys['shift']});
        lastSend=t;
      }
      render();
      raf = requestAnimationFrame(tick);
    }

    function render(){
      ctx.fillStyle='#1a8a3a'; ctx.fillRect(0,0,W,H);
      // garis lapangan (proyeksi 4 sudut lapangan + garis tengah + kotak gawang)
      function proj(p){ const c=worldToCam(p,cam); return project(c,CX,CY); }
      function drawLine(a,b,color,width){
        const pa=proj(a), pb=proj(b);
        if(!pa||!pb) return;
        ctx.strokeStyle=color; ctx.lineWidth=width||2;
        ctx.beginPath(); ctx.moveTo(pa.x,pa.y); ctx.lineTo(pb.x,pb.y); ctx.stroke();
      }
      drawLine([-PITCH_X,0,-PITCH_Z],[PITCH_X,0,-PITCH_Z],'#fff');
      drawLine([PITCH_X,0,-PITCH_Z],[PITCH_X,0,PITCH_Z],'#fff');
      drawLine([PITCH_X,0,PITCH_Z],[-PITCH_X,0,PITCH_Z],'#fff');
      drawLine([-PITCH_X,0,PITCH_Z],[-PITCH_X,0,-PITCH_Z],'#fff');
      drawLine([-PITCH_X,0,0],[PITCH_X,0,0],'#fff');
      drawLine([-GOAL_HALF_W,0,PITCH_Z],[GOAL_HALF_W,0,PITCH_Z],'#ff5',3);
      drawLine([-GOAL_HALF_W,0,-PITCH_Z],[GOAL_HALF_W,0,-PITCH_Z],'#ff5',3);

      // urutkan objek dari jauh ke dekat (painter's algorithm sederhana) biar oklusi masuk akal
      const objs = [
        ...players.map(p=>({type:'player', ref:p, z:p.z})),
        {type:'ball', z:ball.z},
      ].sort((a,b)=> b.z - a.z);

      objs.forEach(o=>{
        if(o.type==='player'){
          const p = o.ref;
          const cam3 = worldToCam([p.x,0,p.z], cam);
          const pr = project(cam3, CX, CY);
          if(!pr) return;
          const size = Math.max(4, Math.min(40, pr.scale*1.6));
          ctx.fillStyle = p.team==='red' ? '#d33' : '#37f';
          ctx.beginPath(); ctx.arc(pr.x, pr.y, size/2, 0, Math.PI*2); ctx.fill();
          if(p===myPlayer){ ctx.strokeStyle='#ff0'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(pr.x,pr.y,size/2+3,0,Math.PI*2); ctx.stroke(); }
        } else {
          const cam3 = worldToCam([ball.x, ball.y, ball.z], cam);
          const pr = project(cam3, CX, CY);
          if(!pr) return;
          const size = Math.max(2, Math.min(14, pr.scale*0.5));
          ctx.fillStyle='#fff';
          ctx.beginPath(); ctx.arc(pr.x, pr.y, size/2, 0, Math.PI*2); ctx.fill();
          ctx.strokeStyle='#333'; ctx.lineWidth=1; ctx.stroke();
        }
      });

      wrap.querySelector('#rk-score').textContent = `MERAH ${scoreRed} : ${scoreBlue} BIRU`;
      const mm = Math.floor(Math.max(0,timeLeft)/60), ss = Math.floor(Math.max(0,timeLeft)%60);
      wrap.querySelector('#rk-time').textContent = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}${mode==='local'?' · vs KOMPUTER':(mode==='host'?' · HOST (Merah)':' · CLIENT (Biru)')}`;

      // bar stamina pemain user
      ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(10,H-18,80,10);
      ctx.fillStyle = myPlayer.stamina>30?'#3f3':'#f33'; ctx.fillRect(11,H-17, 78*(myPlayer.stamina/100), 8);

      if(matchOver){
        ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0,H/2-30,W,60);
        ctx.fillStyle='#fff'; ctx.font='20px monospace'; ctx.textAlign='center';
        ctx.fillText('PERTANDINGAN SELESAI: '+(scoreRed>scoreBlue?'MERAH MENANG':scoreBlue>scoreRed?'BIRU MENANG':'SERI'), W/2, H/2+7);
        ctx.textAlign='start';
      }
    }
    raf = requestAnimationFrame(tick);
  }
};
