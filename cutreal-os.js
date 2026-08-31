/* CUT-REAL OS — additive orchestration layer. It never replaces existing modules. */
(function () {
  'use strict';
  const KEY = 'cutreal-os-state-v1';
  const state = Object.assign({
    permissions: { microphone: false, location: false, files: false, actions: false },
    projects: [], skills: [], vault: [], workflows: [], memory: [], windows: {}, activeProject: null,
    router: 'auto', lastRoute: null
  }, JSON.parse(localStorage.getItem(KEY) || '{}'));
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
  const $ = (s, r = document) => r.querySelector(s);
  const uid = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;

  const skills = [
    ['research','Investigación pública','Analiza fuentes aportadas; no inventa resultados.'],
    ['code','Ingeniería de código','Propone cambios aislados y conserva contratos.'],
    ['files','Archivos universales','Clasifica archivos locales antes de procesarlos.'],
    ['workflow','Automatización segura','Construye TRIGGER → ACTION → RESULT con confirmación.'],
    ['memory','Memoria contextual','Guarda solo notas que el usuario confirme.']
  ];
  skills.forEach(([id, name, desc]) => { if (!state.skills.some(x => x.id === id)) state.skills.push({ id, name, desc, enabled: true }); });
  save();

  function makeShell() {
    if ($('#cutreal-os-root')) return $('#cutreal-os-root');
    const root = document.createElement('section'); root.id = 'cutreal-os-root'; root.setAttribute('aria-label','CUT-REAL Command Center');
    root.innerHTML = `<button id="cutreal-os-launch" class="cro-launch" type="button" title="Abrir Command Center">◈ CUT-REAL OS</button>
      <div id="cro-drawer" class="cro-drawer" hidden>
       <header class="cro-head"><div><span class="cro-kicker">CUT-REAL OS // COMMAND CENTER</span><strong>Centro de control</strong></div><button data-cro-close type="button">×</button></header>
       <nav class="cro-tabs" aria-label="Módulos CUT-REAL OS">
        <button data-cro-tab="dashboard" class="active">Dashboard</button><button data-cro-tab="desktop">Desktop</button><button data-cro-tab="projects">Projects</button><button data-cro-tab="memory">Memory</button><button data-cro-tab="skills">Skills</button><button data-cro-tab="files">Vault</button><button data-cro-tab="workflows">Workflows</button><button data-cro-tab="permissions">Permisos</button>
       </nav>
       <main id="cro-content" class="cro-content"></main>
      </div>`;
    document.body.appendChild(root);
    $('#cutreal-os-launch').addEventListener('click', () => { $('#cro-drawer').hidden = false; render('dashboard'); });
    $('[data-cro-close]').addEventListener('click', () => { $('#cro-drawer').hidden = true; });
    root.addEventListener('click', e => { const close=e.target.closest('[data-cro-close]'); if(close){e.preventDefault();e.stopPropagation();$('#cro-drawer').hidden=true;return;} const b=e.target.closest('[data-cro-tab]'); if(b) render(b.dataset.croTab); });
    $('#cro-drawer').addEventListener('click', e => { if(e.target.id === 'cro-drawer'){ e.currentTarget.hidden=true; } });
    return root;
  }
  function card(title, body, cls='') { return `<article class="cro-card ${cls}"><h3>${title}</h3>${body}</article>`; }
  function render(tab='dashboard') {
    makeShell(); const c=$('#cro-content'); if(!c) return;
    document.querySelectorAll('[data-cro-tab]').forEach(b=>b.classList.toggle('active',b.dataset.croTab===tab));
    const views = {
      dashboard: `<div class="cro-grid">${card('Live Dashboard','<div class="cro-metrics"><b>'+state.projects.length+'<small> proyectos</small></b><b>'+state.vault.length+'<small> archivos</small></b><b>'+state.memory.length+'<small> recuerdos</small></b><b>'+state.workflows.length+'<small> workflows</small></b></div><p class="cro-muted">Estado local: listo · módulos aislados · acciones reales requieren permiso.</p>')} ${card('Command Center','<div class="cro-command"><input id="cro-command" placeholder="Escribe una orden… (Ctrl+K)"><button id="cro-run-command">Ejecutar</button></div><div id="cro-command-result" class="cro-result">Sin orden ejecutada.</div>')} ${card('Multi-Model Router','<label>Modo de enrutamiento <select id="cro-router"><option value="auto">Automático por tarea</option><option value="chat">Chat normal</option><option value="super">SUPER</option><option value="sandbox">Sandbox</option><option value="randar">RANDAR</option></select></label><p class="cro-muted">El router propone un destino; no cambia proveedores ni historial sin confirmación.</p>')} ${card('AI Handoff','<button id="cro-handoff" class="cro-primary">Preparar transferencia segura</button><p id="cro-handoff-status" class="cro-muted">Sin transferencia pendiente.</p>')}</div>`,
      desktop: `<div class="cro-desktop"><div class="cro-desktop-toolbar"><button data-cro-window="context">Context Manager</button><button data-cro-window="knowledge">Knowledge Map</button><button data-cro-window="workflow">Workflow Builder</button><button data-cro-window="dashboard">Widget Dashboard</button></div><div id="cro-window-area" class="cro-window-area"><p class="cro-muted">Abrí una ventana para comenzar. Las ventanas son movibles y se guardan localmente.</p></div></div>`,
      projects: `<div class="cro-grid">${card('Project Mode','<div class="cro-command"><input id="cro-project-name" placeholder="Nombre del proyecto"><button id="cro-project-create">Crear</button></div><div id="cro-project-list">'+(state.projects.map(p=>`<button class="cro-list-row ${state.activeProject===p.id?'selected':''}" data-project="${p.id}">${esc(p.name)} <small>${p.items||0} elementos</small></button>`).join('')||'<p class="cro-muted">No hay proyectos todavía.</p>')+'</div>')} ${card('Context Manager','<p>Proyecto activo: <b>'+esc(state.projects.find(p=>p.id===state.activeProject)?.name||'Ninguno')+'</b></p><button id="cro-project-context">Ver contexto permitido</button><div id="cro-project-context-out" class="cro-result"></div>')}</div>`,
      memory: `<div class="cro-grid">${card('Memory Graph','<svg id="cro-memory-svg" class="cro-graph" viewBox="0 0 700 320" role="img" aria-label="Grafo de memoria"></svg><div class="cro-command"><input id="cro-memory-note" placeholder="Nota confirmada para recordar"><button id="cro-memory-add">Guardar</button></div>')} ${card('Knowledge Map','<div class="cro-map"><span>Chat</span><i>→</i><span>Proyecto</span><i>→</i><span>Contexto</span><i>→</i><span>Respuesta</span></div><p class="cro-muted">Mapa conceptual local. No representa conocimiento no cargado.</p>')}</div>`,
      skills: `<div class="cro-grid">${skills.map(s=>card(esc(s[1]),`<p>${esc(s[2])}</p><label class="cro-switch"><input type="checkbox" data-skill="${s[0]}" ${state.skills.find(x=>x.id===s[0])?.enabled?'checked':''}> Activar skill</label>`)).join('')}</div>`,
      files: `<div class="cro-grid">${card('Universal File Vault','<input id="cro-file-input" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*,video/*"><p class="cro-muted">Los archivos quedan locales hasta que autorices una acción.</p><div id="cro-file-list">'+(state.vault.map(f=>`<div class="cro-list-row">${esc(f.name)} <small>${esc(f.type||'tipo desconocido')}</small></div>`).join('')||'<p class="cro-muted">Vault vacío.</p>')+'</div>')} ${card('Control de transferencia','<button id="cro-send-super" class="cro-primary">Preparar envío a SUPER</button><p id="cro-send-status" class="cro-muted">Solo se enviará el contexto que selecciones y confirmes.</p>')}</div>`,
      workflows: `<div class="cro-grid">${card('Auto Workflow Builder','<div class="cro-flow"><input id="cro-trigger" placeholder="TRIGGER"><span>→</span><input id="cro-action" placeholder="ACTION"><span>→</span><input id="cro-result" placeholder="RESULT"><button id="cro-workflow-add">Guardar</button></div><div id="cro-workflow-list">'+(state.workflows.map(w=>`<div class="cro-list-row">${esc(w.trigger)} → ${esc(w.action)} → ${esc(w.result)}</div>`).join('')||'<p class="cro-muted">No hay workflows.</p>')+'</div>')} ${card('Sandbox Simulation','<button id="cro-simulate" class="cro-primary">Simular antes de ejecutar</button><div id="cro-simulation" class="cro-result">Ninguna simulación pendiente.</div>')}</div>`,
      permissions: `<div class="cro-grid">${card('Permission Center','<p>Las acciones sensibles requieren confirmación explícita.</p>'+Object.entries(state.permissions).map(([k,v])=>`<label class="cro-permission"><input type="checkbox" data-perm="${k}" ${v?'checked':''}> ${esc(k)}</label>`).join(''))} ${card('Voice Commands','<button id="cro-voice" class="cro-primary">Activar comandos de voz</button><p id="cro-voice-status" class="cro-muted">Inactivo. Requiere permiso del micrófono.</p>')}</div>`,
    };
    c.innerHTML=views[tab]||views.dashboard; wire(tab); 
  }
  function wire(tab) {
    $('#cro-router')?.addEventListener('change',e=>{state.router=e.target.value;save();});
    $('#cro-run-command')?.addEventListener('click',()=>runCommand($('#cro-command').value));
    $('#cro-command')?.addEventListener('keydown',e=>{if(e.key==='Enter')runCommand(e.target.value);});
    $('#cro-handoff')?.addEventListener('click',()=>confirmAction('Preparar handoff público hacia SUPER?',()=>{emit('cutreal:handoff',{source:'cutreal-os',target:'SUPER',scope:'selected-public-context'});$('#cro-handoff-status').textContent='Handoff preparado: requiere confirmación en SUPER.';}));
    $('#cro-project-create')?.addEventListener('click',()=>{const n=$('#cro-project-name').value.trim();if(!n)return;state.projects.push({id:uid('project'),name:n,items:0,createdAt:new Date().toISOString()});save();render('projects');});
    document.querySelectorAll('[data-project]').forEach(b=>b.addEventListener('click',()=>{state.activeProject=b.dataset.project;save();render('projects');}));
    $('#cro-project-context')?.addEventListener('click',()=>$('#cro-project-context-out').textContent='Contexto permitido: proyecto activo, archivos seleccionados y notas confirmadas. Proveedores y historiales permanecen aislados.');
    $('#cro-memory-add')?.addEventListener('click',()=>{const n=$('#cro-memory-note').value.trim();if(!n)return;state.memory.push({id:uid('memory'),text:n,createdAt:new Date().toISOString()});save();render('memory');});
    if(tab==='memory')drawMemory();
    document.querySelectorAll('[data-skill]').forEach(i=>i.addEventListener('change',()=>{const s=state.skills.find(x=>x.id===i.dataset.skill);if(s)s.enabled=i.checked;save();}));
    $('#cro-file-input')?.addEventListener('change',e=>{if(!confirmPermission('files'))return;Array.from(e.target.files).forEach(f=>state.vault.push({id:uid('file'),name:f.name,type:f.type,size:f.size}));save();render('files');});
    $('#cro-send-super')?.addEventListener('click',()=>confirmAction('Enviar el contexto público seleccionado a SUPER?',()=>{$('#cro-send-status').textContent='Contexto preparado para SUPER; no se transmitieron archivos automáticamente.';emit('cutreal:send-to-super',{source:'cutreal-os',scope:'user-selected-public-context'});}));
    $('#cro-workflow-add')?.addEventListener('click',()=>{const a=['trigger','action','result'].map(k=>$('#cro-'+k).value.trim());if(a.some(x=>!x))return;state.workflows.push({trigger:a[0],action:a[1],result:a[2]});save();render('workflows');});
    $('#cro-simulate')?.addEventListener('click',()=>{$('#cro-simulation').textContent='SIMULACIÓN: no se ejecutó ninguna acción real. Resultado previsto registrado localmente.';});
    document.querySelectorAll('[data-perm]').forEach(i=>i.addEventListener('change',()=>{state.permissions[i.dataset.perm]=i.checked;save();}));
    $('#cro-voice')?.addEventListener('click',startVoice);
    document.querySelectorAll('[data-cro-window]').forEach(b=>b.addEventListener('click',()=>openWindow(b.dataset.croWindow)));
  }
  function confirmPermission(type){ if(state.permissions[type]) return true; return confirm(`CUT-REAL OS solicita permiso: ${type}. ¿Concederlo ahora?`) && (state.permissions[type]=true,save(),true); }
  function confirmAction(question,fn){ if(confirm(question)){state.permissions.actions=true;save();fn();} }
  function runCommand(raw){const text=raw.toLowerCase();const out=$('#cro-command-result');let route='Chat';if(text.includes('código')||text.includes('program'))route='SUPER / Workspace';if(text.includes('satélite')||text.includes('radar')||text.includes('randar'))route='RANDAR';if(text.includes('sandbox')||text.includes('modelo 3d'))route='Sandbox';state.lastRoute=route;save();if(out)out.textContent=`Ruta propuesta: ${route}. Acción: ${raw || 'sin orden'}. Estado: requiere confirmación si produce cambios.`;emit('cutreal:command',{command:raw,route});}
  function openWindow(type){const area=$('#cro-window-area');if(!area)return;const content={context:'<h3>Context Manager</h3><p>Contexto activo: '+esc(state.projects.find(p=>p.id===state.activeProject)?.name||'general')+'</p><p>Solo se incluyen elementos seleccionados y permisos concedidos.</p>',knowledge:'<h3>Knowledge Map</h3><div class="cro-map"><span>Fuente</span><i>→</i><span>Memoria</span><i>→</i><span>Proyecto</span><i>→</i><span>Salida</span></div>',workflow:'<h3>Workflow Builder</h3><p>TRIGGER → ACTION → RESULT. Todas las acciones sensibles exigen confirmación.</p>',dashboard:'<h3>Widget Dashboard</h3><p>Widgets activos: proyectos, archivos, memoria, workflows y última ruta.</p>'}[type]||'<p>Ventana desconocida.</p>';const w=document.createElement('article');w.className='cro-window';w.innerHTML=`<button class="cro-window-close">×</button>${content}`;area.appendChild(w);w.querySelector('button').onclick=()=>w.remove();makeDraggable(w);}
  function makeDraggable(el){let sx=0,sy=0,ox=0,oy=0;el.addEventListener('pointerdown',e=>{if(e.target.tagName==='BUTTON')return;sx=e.clientX;sy=e.clientY;const r=el.getBoundingClientRect();ox=r.left;oy=r.top;el.setPointerCapture(e.pointerId);const move=x=>{el.style.left=Math.max(8,ox+x.clientX-sx)+'px';el.style.top=Math.max(8,oy+x.clientY-sy)+'px';};const up=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);};el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);});}
  function drawMemory(){const svg=$('#cro-memory-svg');if(!svg)return;svg.innerHTML='';const nodes=[{x:90,y:160,t:'CUT-REAL'}].concat(state.memory.slice(0,8).map((m,i)=>({x:150+(i%4)*145,y:70+Math.floor(i/4)*150,t:m.text.slice(0,18)})));nodes.slice(1).forEach((n,i)=>{const l=document.createElementNS('http://www.w3.org/2000/svg','line');l.setAttribute('x1',nodes[0].x);l.setAttribute('y1',nodes[0].y);l.setAttribute('x2',n.x);l.setAttribute('y2',n.y);l.setAttribute('class','cro-edge');svg.appendChild(l);});nodes.forEach(n=>{const g=document.createElementNS('http://www.w3.org/2000/svg','g');g.innerHTML=`<circle cx="${n.x}" cy="${n.y}" r="28" class="cro-node"></circle><text x="${n.x}" y="${n.y+4}" text-anchor="middle">${esc(n.t)}</text>`;svg.appendChild(g);});}
  function startVoice(){if(!confirmPermission('microphone'))return;const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){$('#cro-voice-status').textContent='Reconocimiento de voz no disponible en este navegador.';return;}const r=new SR();r.lang='es-AR';r.interimResults=false;r.onstart=()=>$('#cro-voice-status').textContent='Escuchando comando…';r.onresult=e=>{const t=e.results[0][0].transcript;$('#cro-voice-status').textContent='Orden recibida: '+t;runCommand(t);};r.onerror=()=>$('#cro-voice-status').textContent='No se pudo interpretar el comando.';r.onend=()=>$('#cro-voice-status').textContent+=' · finalizado';r.start();}
  window.CutRealOS={state,open:()=>{$('#cro-drawer').hidden=false;render('dashboard');},render,runCommand,registerSkill:(skill)=>{if(skill?.id&&!state.skills.some(x=>x.id===skill.id)){state.skills.push(skill);save();}},requestPermission:(p)=>confirmPermission(p),simulate:(x)=>({status:'SIMULATED',action:x}),route:(text)=>({route:text.match(/randar/i)?'RANDAR':text.match(/sandbox/i)?'Sandbox':text.match(/super/i)?'SUPER':'Chat',status:'PROPOSED'})};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#cro-drawer')?.hidden){e.preventDefault();$('#cro-drawer').hidden=true;return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#cro-drawer').hidden=false;render('dashboard');$('#cro-command')?.focus();}});
  document.addEventListener('DOMContentLoaded',makeShell);
})();
