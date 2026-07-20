/* =========================================================
   APLIKASI: MS-DOS Executive, Notepad, Write, Paint
   ========================================================= */

/* ---- MS-DOS Executive (file manager) ---- */
APPS.executive = function(){
  const {body, win} = makeWindow({title:"MS-DOS Executive", width:380, height:320});
  let curPath = [primaryBootDrive()+":\\"];
  function render(){
    const pathStr = curPath.join("");
    let node = FS[curPath[0]];
    for(let i=1;i<curPath.length;i++) node = node.items[curPath[i]];
    if(!node){ curPath=[primaryBootDrive()+":\\"]; node = FS[curPath[0]]; }
    let html = `<div class="exec-path">${pathStr}</div><div class="exec-list">`;
    if(curPath.length>1){
      html += `<div class="exec-row" data-up="1">[..]</div>`;
    }
    const entries = Object.entries(node.items||{});
    entries.sort((a,b)=> (a[1].type==='dir'?0:1) - (b[1].type==='dir'?0:1));
    for(const [name,item] of entries){
      const tag = item.type==='dir' ? '[DIR]' : (item.type==='app' ? '.EXE ' : '     ');
      const mod = item.modifiedAt ? ' *' : '';
      html += `<div class="exec-row" data-name="${name}">${tag}  ${name}${mod}</div>`;
    }
    html += `</div>`;
    body.innerHTML = html;
    body.querySelectorAll('.exec-row').forEach(r=>{
      r.addEventListener('dblclick', ()=>{
        if(r.dataset.up){ curPath.pop(); render(); return; }
        const name = r.dataset.name;
        const item = node.items[name];
        if(item.type==='dir'){ curPath.push(name); render(); }
        else if(item.type==='app'){ launchApp(item.app); }
        else if(item.content!==undefined){
          launchApp('notepad', {title:'Notepad - '+name, text:item.content, fsRef:{node, name}});
        }
        else { alert(name+"\n\n(File data biner - tidak bisa dibuka di simulator ini)"); }
      });
      r.addEventListener('contextmenu', e=>{
        e.preventDefault(); e.stopPropagation();
        if(r.dataset.up) return;
        showContextMenu(e.clientX, e.clientY, [
          {label:'🗑 Hapus', action:()=>{ delete node.items[r.dataset.name]; notifyFSChanged(); }},
        ]);
      });
    });
  }
  render();
  body.addEventListener('contextmenu', e=>{
    if(e.target.closest('.exec-row')) return;
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, [
      {label:'📄 File Teks Baru', action:()=>{
        const name = (prompt('Nama file baru:', 'BARU.TXT')||'BARU.TXT').toUpperCase();
        let node = FS[curPath[0]];
        for(let i=1;i<curPath.length;i++) node = node.items[curPath[i]];
        node.items[name] = {type:'file', content:'', baselineHash: hashStr(''), modifiedAt:null};
        notifyFSChanged();
      }},
    ]);
  });
  // observer: file/folder baru yang dibuat lewat context menu desktop langsung tampil di sini
  onFSChanged(()=>{ if(document.body.contains(win)) render(); });
};

/* ---- Notepad ---- */
APPS.notepad = function(opts){
  const {body, win} = makeWindow({title:(opts&&opts.title)||"Notepad - (untitled)", width:400, height:300});
  body.innerHTML = `
    <div class="menubar">
      <div class="mitem" data-a="new">File</div>
      <div class="mitem" data-a="save">Save</div>
      <div class="mitem" data-a="cut">Cut</div>
      <div class="mitem" data-a="copy">Copy</div>
      <div class="mitem" data-a="paste">Paste</div>
    </div>
    <textarea class="notepad-area" placeholder="Ketik teks di sini..."></textarea>`;
  const ta = body.querySelector('textarea');
  const fsRef = opts && opts.fsRef; // {node, name} — kalau ada, file ini terhubung ke FS
  if(opts && opts.text) ta.value = opts.text;
  body.querySelector('[data-a=new]').onclick=()=>{ ta.value=''; };
  body.querySelector('[data-a=save]').onclick=()=>{
    if(!fsRef){ alert('File ini belum terhubung ke MS-DOS Executive.\nBuat "File Teks Baru" lewat klik-kanan desktop/Executive dulu, baru buka & edit di sini.'); return; }
    fsRef.node.items[fsRef.name].content = ta.value;
    fsRef.node.items[fsRef.name].modifiedAt = simNow().toISOString();
    notifyFSChanged();
    win.querySelector('.ttext').textContent = 'Notepad - '+fsRef.name+' (tersimpan)';
  };
  body.querySelector('[data-a=cut]').onclick=()=>{
    const s=ta.selectionStart,e=ta.selectionEnd;
    clipboard = ta.value.slice(s,e);
    ta.value = ta.value.slice(0,s)+ta.value.slice(e);
  };
  body.querySelector('[data-a=copy]').onclick=()=>{
    clipboard = ta.value.slice(ta.selectionStart, ta.selectionEnd);
  };
  body.querySelector('[data-a=paste]').onclick=()=>{
    const s=ta.selectionStart;
    ta.value = ta.value.slice(0,s)+clipboard+ta.value.slice(ta.selectionEnd);
  };
};

/* ---- Write (rich-ish) ---- */
APPS.write = function(){
  const {body} = makeWindow({title:"Write - (untitled)", width:440, height:320});
  body.innerHTML = `
    <div class="menubar write-toolbar" style="padding:3px;">
      <button class="win-btn" data-c="bold"><b>B</b></button>
      <button class="win-btn" data-c="italic"><i>I</i></button>
      <button class="win-btn" data-c="underline"><u>U</u></button>
    </div>
    <div contenteditable="true" style="height:calc(100% - 26px);padding:6px;outline:none;font-family:var(--ui);" ></div>`;
  const editor = body.querySelector('[contenteditable]');
  body.querySelectorAll('[data-c]').forEach(b=>{
    b.onclick = ()=> document.execCommand(b.dataset.c, false, null);
  });
  editor.focus();
};

/* ---- Paint ---- */
APPS.paint = function(){
  const {body} = makeWindow({title:"Paint - (untitled)", width:420, height:340});
  body.innerHTML = `
    <div class="paint-tools">
      <button data-t="pencil" class="active" title="Pencil">✏</button>
      <button data-t="line" title="Line">╱</button>
      <button data-t="rect" title="Rectangle">▭</button>
      <button data-t="ellipse" title="Ellipse">◯</button>
      <button data-t="eraser" title="Eraser">▢E</button>
      <button data-t="fill" title="Fill">🪣</button>
      <button data-t="clear" title="Clear">✕</button>
    </div>
    <canvas class="paint-canvas" width="600" height="420"></canvas>`;
  const canvas = body.querySelector('canvas');
  const ctx = canvas.getContext('2d');

  /* --- Double buffering: canvas tersembunyi (buffer) menyimpan gambar
     permanen. Canvas yang terlihat cuma dipakai buat blit (drawImage,
     murah) + preview shape sementara — bukan getImageData/putImageData
     per piksel yang berat di setiap gerakan mouse. --- */
  const buffer = document.createElement('canvas');
  buffer.width = canvas.width; buffer.height = canvas.height;
  const bctx = buffer.getContext('2d');
  bctx.fillStyle = '#fff'; bctx.fillRect(0,0,buffer.width,buffer.height);
  function blit(){ ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(buffer,0,0); }
  blit();

  let tool='pencil', drawing=false, sx,sy, lastP={x:0,y:0};
  body.querySelectorAll('.paint-tools button[data-t]').forEach(b=>{
    b.onclick = ()=>{
      body.querySelectorAll('.paint-tools button').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); tool=b.dataset.t;
      if(tool==='clear'){ bctx.fillStyle='#fff'; bctx.fillRect(0,0,buffer.width,buffer.height); blit(); }
    };
  });
  function pos(e){ const r=canvas.getBoundingClientRect(); return {x:e.clientX-r.left, y:e.clientY-r.top}; }
  function drawShape(context, p){
    context.strokeStyle='#000'; context.lineWidth=2;
    if(tool==='line'){ context.beginPath(); context.moveTo(sx,sy); context.lineTo(p.x,p.y); context.stroke(); }
    else if(tool==='rect'){ context.strokeRect(sx,sy,p.x-sx,p.y-sy); }
    else if(tool==='ellipse'){
      context.beginPath(); context.ellipse((sx+p.x)/2,(sy+p.y)/2, Math.abs(p.x-sx)/2, Math.abs(p.y-sy)/2,0,0,7);
      context.stroke();
    }
  }
  canvas.addEventListener('mousedown', e=>{
    drawing=true; const p=pos(e); sx=p.x; sy=p.y; lastP=p;
    if(tool==='pencil'||tool==='eraser'){ bctx.beginPath(); bctx.moveTo(sx,sy); }
    if(tool==='fill'){
      bctx.fillStyle='#000'; bctx.fillRect(0,0,buffer.width,buffer.height); blit(); drawing=false;
    }
  });
  canvas.addEventListener('mousemove', e=>{
    if(!drawing) return;
    const p = pos(e); lastP = p;
    if(tool==='pencil'){ bctx.strokeStyle='#000'; bctx.lineWidth=2; bctx.lineTo(p.x,p.y); bctx.stroke(); blit(); }
    else if(tool==='eraser'){ bctx.strokeStyle='#fff'; bctx.lineWidth=10; bctx.lineTo(p.x,p.y); bctx.stroke(); blit(); }
    else {
      // pratampilan sementara: buffer TIDAK disentuh, cuma di-blit lalu digambar preview di atasnya
      blit();
      drawShape(ctx, p);
    }
  });
  window.addEventListener('mouseup', ()=>{
    if(drawing && (tool==='line'||tool==='rect'||tool==='ellipse')){
      // baru sekarang bentuk final digabungkan permanen ke buffer
      drawShape(bctx, lastP);
      blit();
    }
    drawing=false;
  });
};
