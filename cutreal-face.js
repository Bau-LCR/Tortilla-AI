/* CUT-REAL FACE · avatar 2D ligero sincronizado con TTS */
(function(){
  'use strict';
  function mount(){
    if(document.getElementById('cutreal-face')) return;
    const el=document.createElement('aside'); el.id='cutreal-face'; el.className='cutreal-face idle'; el.setAttribute('aria-label','Avatar de voz de Cut-real AI');
    el.innerHTML='<div class="cutreal-face-orbit"></div><div class="cutreal-face-head"><span class="cutreal-eye left"></span><span class="cutreal-eye right"></span><span class="cutreal-face-mouth"></span></div><span class="cutreal-face-label">CUT-REAL · LISTA</span>';
    document.body.appendChild(el);
  }
  function setState(state){const el=document.getElementById('cutreal-face');if(!el)return;el.classList.remove('idle','speaking','listening','thinking');el.classList.add(state||'idle');const label=el.querySelector('.cutreal-face-label');if(label)label.textContent=state==='speaking'?'CUT-REAL · HABLANDO':state==='listening'?'CUT-REAL · ESCUCHANDO':state==='thinking'?'CUT-REAL · PROCESANDO':'CUT-REAL · LISTA';}
  function hook(){
    if(!window.LoquendoSpeak||window.LoquendoSpeak.__faceHooked)return;
    const original=window.LoquendoSpeak; const wrapped=function(text,onEnd){setState('speaking');return original.call(this,text,function(){setState('idle');if(onEnd)onEnd();});}; wrapped.__faceHooked=true; window.LoquendoSpeak=wrapped;
    const stop=window.LoquendoStop; if(stop&&!stop.__faceHooked){window.LoquendoStop=function(){setState('idle');return stop.apply(this,arguments)};window.LoquendoStop.__faceHooked=true;}
  }
  function init(){mount();hook();setTimeout(hook,500);setTimeout(hook,1500);window.addEventListener('cutreal:thinking',()=>setState('thinking'));window.addEventListener('cutreal:listening',()=>setState('listening'));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  window.CutRealFace={setState};
})();
