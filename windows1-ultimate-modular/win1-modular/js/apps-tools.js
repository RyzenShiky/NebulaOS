/* =========================================================
   APLIKASI: Calculator, Clock, Calendar, Cardfile, Terminal
   ========================================================= */

/* ---- Calculator ---- */
APPS.calc = function(){
  const {body} = makeWindow({title:"Calculator", width:220, height:260, resizable:false});
  body.innerHTML = `<div class="calc-screen" id="cscr">0</div>
    <div class="calc-grid">
      ${['7','8','9','/','4','5','6','*','1','2','3','-','0','.','=','+','C'].map(k=>`<button data-k="${k}">${k}</button>`).join('')}
    </div>`;
  const scr = body.querySelector('#cscr');
  let expr='';
  body.querySelectorAll('.calc-grid button').forEach(b=>{
    b.onclick=()=>{
      const k=b.dataset.k;
      if(k==='C'){ expr=''; scr.textContent='0'; return; }
      if(k==='='){
        try{ expr = expr.replace(/[^0-9+\-*/.]/g,''); scr.textContent = String(Function('"use strict";return ('+expr+')')()); expr=scr.textContent; }
        catch(e){ scr.textContent='Error'; expr=''; }
        return;
      }
      expr+=k; scr.textContent=expr;
    };
  });
};

/* ---- Clock ---- */
APPS.clock = function(){
  const {body,win} = makeWindow({title:"Clock", width:220, height:250, resizable:false});
  body.innerHTML = `<div class="clock-face">
      <div class="hand hr" id="ch"></div>
      <div class="hand min" id="cm"></div>
      <div class="hand sec" id="cs"></div>
    </div><div class="clock-digital" id="cd"></div>`;
  function tick(){
    const now=simNow();
    const h=now.getHours()%12, m=now.getMinutes(), s=now.getSeconds();
    body.querySelector('#ch').style.transform = `rotate(${h*30+m*0.5}deg)`;
    body.querySelector('#cm').style.transform = `rotate(${m*6}deg)`;
    body.querySelector('#cs').style.transform = `rotate(${s*6}deg)`;
    body.querySelector('#cd').textContent = now.toLocaleTimeString('id-ID');
  }
  tick();
  const iv = setInterval(()=>{ if(!document.body.contains(win)) return clearInterval(iv); tick(); }, 1000);
};

/* ---- Calendar ---- */
APPS.calendar = function(){
  const {body} = makeWindow({title:"Calendar", width:300, height:300, resizable:false});
  let view = simNow();
  function render(){
    const y=view.getFullYear(), m=view.getMonth();
    const first = new Date(y,m,1);
    const days = new Date(y,m+1,0).getDate();
    const today = simNow();
    let html = `<div class="cal-header">
        <button class="win-btn" id="prev">&lt;</button>
        <b>${view.toLocaleString('id-ID',{month:'long',year:'numeric'})}</b>
        <button class="win-btn" id="next">&gt;</button>
      </div>
      <table class="cal-table"><tr>${['Min','Sen','Sel','Rab','Kam','Jum','Sab'].map(d=>`<th>${d}</th>`).join('')}</tr><tr>`;
    let col = first.getDay();
    html += '<td></td>'.repeat(col);
    for(let d=1; d<=days; d++){
      const isToday = today.getFullYear()===y && today.getMonth()===m && today.getDate()===d;
      html += `<td class="${isToday?'today':''}">${d}</td>`;
      col++;
      if(col%7===0) html+='</tr><tr>';
    }
    html += '</tr></table>';
    body.innerHTML = html;
    body.querySelector('#prev').onclick=()=>{ view=new Date(y,m-1,1); render(); };
    body.querySelector('#next').onclick=()=>{ view=new Date(y,m+1,1); render(); };
  }
  render();
};

/* ---- Cardfile ---- */
APPS.cardfile = function(){
  const {body} = makeWindow({title:"Cardfile", width:400, height:280});
  let cards = [{title:"Contoh Kartu", note:"Ini isi catatan kartu pertama."}];
  let sel = 0;
  function render(){
    body.innerHTML = `<div class="card-view">
      <div class="card-list">${cards.map((c,i)=>`<div class="${i===sel?'sel':''}" data-i="${i}">${c.title||'(tanpa judul)'}</div>`).join('')}
        <div style="padding:4px;"><button class="win-btn" id="addc">+ Kartu</button></div>
      </div>
      <div class="card-detail">
        <input id="ctitle" value="${cards[sel]?.title||''}" placeholder="Judul kartu">
        <textarea id="cnote" placeholder="Catatan...">${cards[sel]?.note||''}</textarea>
        <button class="win-btn" id="delc">Hapus Kartu</button>
      </div></div>`;
    body.querySelectorAll('.card-list div[data-i]').forEach(d=>{
      d.onclick=()=>{ sel=+d.dataset.i; render(); };
    });
    body.querySelector('#addc').onclick=()=>{ cards.push({title:"Kartu Baru",note:""}); sel=cards.length-1; render(); };
    body.querySelector('#delc').onclick=()=>{ if(cards.length>1){ cards.splice(sel,1); sel=0; render(); } };
    body.querySelector('#ctitle').oninput=e=>{ cards[sel].title=e.target.value; };
    body.querySelector('#cnote').oninput=e=>{ cards[sel].note=e.target.value; };
  }
  render();
};

/* ---- Terminal ---- */
APPS.terminal = function(){
  const {body} = makeWindow({title:"Terminal", width:440, height:300});
  body.innerHTML = `<div class="term-body" id="tout">Windows Terminal - Serial Port COM1
Ketik HELP untuk daftar perintah.
</div>
  <div style="background:#000;padding:2px 4px;"><span id="term-prompt" style="color:#33ff33;font-family:var(--mono)">${primaryBootDrive()}:\\&gt;</span><input class="term-input" id="tin"></div>`;
  const out = body.querySelector('#tout');
  const inp = body.querySelector('#tin');
  const promptEl = body.querySelector('#term-prompt');
  let curPath = [primaryBootDrive()+":\\"];
  inp.focus();

  function currentNode(){
    let node = FS[curPath[0]];
    for(let i=1;i<curPath.length;i++) node = node.items[curPath[i]];
    return node;
  }
  /* Parser path tokenization: pecah target berdasarkan backslash, telusuri
     hierarki FS token demi token (".." mundur/pop, nama folder maju/push).
     Mendukung path absolut (mulai dari "C:") maupun relatif bertingkat
     (mis. "WIN\SYSTEM32" atau "..\.."). Validasi dilakukan di SETIAP token —
     kalau ada satu saja yang tidak valid, seluruh perintah dibatalkan
     (kembalikan null) tanpa mengubah curPath sama sekali. */
  function resolvePath(targetRaw){
    let tokens = targetRaw.split('\\').filter(t=>t!=='');
    let newPath = [...curPath];
    if(tokens.length && /^[A-Z]:$/.test(tokens[0])){
      const drive = tokens[0]+"\\";
      if(!FS[drive]) return null;
      newPath = [drive];
      tokens = tokens.slice(1);
    }
    for(const tok of tokens){
      if(tok==='.') continue;
      if(tok==='..'){ if(newPath.length>1) newPath.pop(); continue; }
      let node = FS[newPath[0]];
      if(!node) return null;
      for(let i=1;i<newPath.length;i++){ node = node.items[newPath[i]]; if(!node) return null; }
      if(!node.items || !node.items[tok] || node.items[tok].type!=='dir') return null;
      newPath.push(tok);
    }
    return newPath;
  }
  function updatePrompt(){ promptEl.textContent = curPath.join('')+'>'; }

  inp.addEventListener('keydown', e=>{
    if(e.key!=='Enter') return;
    const raw = inp.value;
    const cmd = raw.trim().toUpperCase();
    out.textContent += `${curPath.join('')}>${raw}\n`;
    if(cmd==='HELP') out.textContent += "Perintah: DIR, CD <folder>, CD .., CD\\, VER, DATE, CLS, HELP\nSistem: /SHUTDOWN, /RESTART, /SLEEP, /RESET\n(Peringatan: jangan coba FORMAT C: ...)\n";
    else if(cmd==='DIR'){
      const node = currentNode();
      const entries = Object.entries(node.items||{});
      out.textContent += ` Volume in drive C is WINDOWS\n Directory of ${curPath.join('')}\n\n`;
      if(entries.length===0) out.textContent += " (folder kosong)\n";
      entries.forEach(([name,item])=>{
        if(item.type==='dir') out.textContent += `${name.padEnd(14)}<DIR>\n`;
        else if(item.type==='app') out.textContent += `${name.padEnd(14)}${String((item.content||'').length||1024).padStart(8)} bytes  <PROGRAM>\n`;
        else out.textContent += `${name.padEnd(14)}${String((item.content||'').length).padStart(8)} bytes${item.modifiedAt?'  (dimodifikasi)':''}\n`;
      });
      out.textContent += `\n${entries.length} berkas/folder ditemukan.\n`;
    }
    else if(cmd==='CD' || cmd==='CD\\' || cmd==='CD /'){ curPath=[primaryBootDrive()+":\\"]; updatePrompt(); }
    else if(cmd==='CD..' || cmd==='CD ..'){
      if(curPath.length>1) curPath.pop();
      updatePrompt();
    }
    else if(cmd.startsWith('CD ')){
      const targetRaw = raw.trim().slice(3).trim().toUpperCase();
      const resolved = resolvePath(targetRaw);
      if(resolved){ curPath = resolved; updatePrompt(); }
      else out.textContent += `Sistem tidak dapat menemukan jalur yang ditentukan.\n`;
    }
    else if(cmd==='VER') out.textContent += "MS-DOS Version 3.20 / Windows 1.0 Ultimate\n";
    else if(cmd==='DATE') out.textContent += simNow().toLocaleDateString('id-ID')+"\n";
    else if(cmd==='CLS'){ out.textContent=''; }
    else if(cmd==='/SHUTDOWN'){ out.textContent += "Mematikan sistem...\n"; setTimeout(systemShutdown, 400); }
    else if(cmd==='/RESTART'){ out.textContent += "Memulai ulang sistem...\n"; setTimeout(systemRestart, 400); }
    else if(cmd==='/SLEEP'){ out.textContent += "Masuk mode tidur...\n"; setTimeout(systemSleep, 400); }
    else if(cmd==='/RESET'){ out.textContent += "PERINGATAN: ini akan menghapus semua data tersimpan.\n"; confirmResetSystem(); }
    else if(cmd.startsWith('FORMAT C:')){
      out.textContent += "Formatting C:...\n";
      setTimeout(()=> triggerBSOD("CRITICAL_PROCESS_DIED — drive C: tidak dapat diformat dari simulator ini."), 500);
    }
    else if(cmd==='') {}
    else out.textContent += `Bad command or file name\n`;
    inp.value='';
    out.scrollTop = out.scrollHeight;
  });
};
