/* =========================================================
   APLIKASI: Reversi
   (Word & Excel versi lama sudah dihapus — lihat
   js/apps-office2021.js untuk Word 2021 & Excel 2021)
   ========================================================= */

/* ---- Reversi Ultimate (lokal 1-layar + multiplayer online via WebRTC) ---- */
APPS.reversi = function(){
  const {body, win} = makeWindow({title:"Reversi", width:320, height:400, resizable:false});
  const N=8;
  let board = Array.from({length:N},()=>Array(N).fill(0));
  board[3][3]=2; board[3][4]=1; board[4][3]=1; board[4][4]=2; // 1=black,2=white
  let turn=1;
  let myColor = null; // null = mode lokal (siapa saja boleh klik gantian); 1/2 = mode online
  const dirs=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

  win.querySelector('.close').addEventListener('click', ()=> MP.close());

  const netBar = document.createElement('div');
  const boardContainer = document.createElement('div');
  body.appendChild(netBar);
  body.appendChild(boardContainer);

  function validMoves(t){
    const moves=[];
    for(let r=0;r<N;r++)for(let c=0;c<N;c++){
      if(board[r][c]!==0) continue;
      if(flipsFor(r,c,t).length>0) moves.push([r,c]);
    }
    return moves;
  }
  function flipsFor(r,c,t){
    const opp = t===1?2:1; let flips=[];
    for(const [dr,dc] of dirs){
      let rr=r+dr, cc=c+dc, line=[];
      while(rr>=0&&rr<N&&cc>=0&&cc<N&&board[rr][cc]===opp){ line.push([rr,cc]); rr+=dr; cc+=dc; }
      if(line.length && rr>=0&&rr<N&&cc>=0&&cc<N&&board[rr][cc]===t) flips=flips.concat(line);
    }
    return flips;
  }
  function applyMove(r,c,t){
    const flips = flipsFor(r,c,t);
    if(board[r][c]!==0 || flips.length===0) return false;
    board[r][c]=t;
    flips.forEach(([fr,fc])=> board[fr][fc]=t);
    beep(500,30);
    turn = t===1?2:1;
    return true;
  }

  function showNetworkBar(){
    netBar.className='app-pad';
    netBar.innerHTML = `<button class="win-btn" id="rev-online">🌐 Main Online</button> <span style="font-size:11px;color:#666;">(atau langsung main lokal di bawah, gantian klik)</span>`;
    netBar.querySelector('#rev-online').onclick = ()=>{
      const panelWrap = document.createElement('div');
      netBar.replaceWith(panelWrap);
      buildMultiplayerPanel(panelWrap, {
        onReady:(role)=>{
          panelWrap.remove();
          myColor = role==='host' ? 1 : 2;
          setTitlebarMic(win, MP.hasMic());
          MP.onData(msg=>{
            if(msg.t==='move'){ applyMove(msg.r, msg.c, turn); render(); }
          });
          render();
        },
        onLocal:()=>{ panelWrap.remove(); render(); },
      });
    };
  }

  function render(){
    let html = `<div class="rev-status" id="rst"></div><div class="rev-board">`;
    for(let r=0;r<N;r++)for(let c=0;c<N;c++){
      html += `<div class="rev-cell" data-r="${r}" data-c="${c}">${board[r][c]?`<div class="rev-disc ${board[r][c]===1?'black':'white'}"></div>`:''}</div>`;
    }
    html += `</div>`;
    boardContainer.innerHTML = html;
    const moves = validMoves(turn);
    const b = board.flat().filter(x=>x===1).length, w = board.flat().filter(x=>x===2).length;
    let statusTxt = `Giliran: ${turn===1?'Hitam':'Putih'}  |  Hitam:${b} Putih:${w}`;
    if(myColor){ statusTxt += myColor===turn ? '  (giliranmu!)' : '  (menunggu lawan...)'; }
    boardContainer.querySelector('#rst').textContent = statusTxt;
    if(moves.length===0){
      const other = turn===1?2:1;
      if(validMoves(other).length===0){
        boardContainer.querySelector('#rst').textContent = `Permainan selesai! ${b>w?'Hitam menang':w>b?'Putih menang':'Seri'}`;
        return;
      } else { turn=other; render(); return; }
    }
    boardContainer.querySelectorAll('.rev-cell').forEach(cell=>{
      const r=+cell.dataset.r, c=+cell.dataset.c;
      cell.addEventListener('click', ()=>{
        if(myColor && turn!==myColor) return; // bukan giliranmu di mode online
        if(!applyMove(r,c,myColor||turn)) return;
        if(myColor) MP.send({t:'move', r, c});
        render();
      });
    });
  }
  showNetworkBar();
  render();
};


