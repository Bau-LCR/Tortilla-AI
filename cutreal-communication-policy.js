/* CUT-REAL COMMUNICATION POLICY · consentimiento, límites y cancelación */
(function(){
  'use strict';
  const KEY='cutreal-communication-policy-v1';
  const defaults={allowCalls:false,allowProactiveMessages:false,spontaneousCalls:false,muted:false,dailyLimit:2,usedToday:0,day:'',windowStart:'09:00',windowEnd:'21:00'};
  let state=Object.assign({},defaults,JSON.parse(localStorage.getItem(KEY)||'{}'));
  const today=()=>new Date().toISOString().slice(0,10);
  function normalize(){if(state.day!==today()){state.day=today();state.usedToday=0;save();}}
  function save(){localStorage.setItem(KEY,JSON.stringify(state));}
  function inWindow(){const now=new Date();const mins=now.getHours()*60+now.getMinutes();const parse=s=>{const [h,m]=String(s||'00:00').split(':').map(Number);return h*60+m};return mins>=parse(state.windowStart)&&mins<=parse(state.windowEnd)}
  function canInitiate(kind){normalize();const permission=kind==='call'?state.allowCalls:state.allowProactiveMessages;return {allowed:Boolean(permission&&!state.muted&&inWindow()&&state.usedToday<Math.max(0,Number(state.dailyLimit)||0)),reason:!permission?'Consentimiento desactivado':state.muted?'Comunicaciones silenciadas':!inWindow()?'Fuera del horario permitido':state.usedToday>=state.dailyLimit?'Límite diario alcanzado':'OK'};}
  function consume(kind){const result=canInitiate(kind);if(result.allowed){state.usedToday+=1;save();}return result;}
  window.CutRealCommunication=Object.freeze({getState:()=>({...state}),set(next){state=Object.assign({},state,next||{});save();return {...state}},canInitiate,consume,cancel(){state.allowCalls=false;state.spontaneousCalls=false;state.allowProactiveMessages=false;state.muted=true;save();return {...state}},resetDaily(){state.day=today();state.usedToday=0;save();return {...state}}});
})();
