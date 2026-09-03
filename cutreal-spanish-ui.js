/* Visible Spanish UI layer: text-only, no provider, state or API changes. */
(() => {
  'use strict';
  const replacements = new Map([
    ['DASHBOARD','PANEL PRINCIPAL'],['DESKTOP','ESCRITORIO'],['PROJECTS','PROYECTOS'],['MEMORY','MEMORIA'],['SKILLS','CAPACIDADES'],['VAULT','ARCHIVOS'],['WORKFLOWS','FLUJOS'],['PERMISSIONS','PERMISOS'],['Permisos','Permisos'],['AI NETWORK','RED DE IA'],['KNOWLEDGE','CONOCIMIENTO'],['BOTH','AMBOS'],['FIT','AJUSTAR'],['RESET','RESTABLECER'],['PAN ON','PANORÁMICA ACTIVA'],['REPLAY','REPETIR'],['LIVE TIMELINE','LÍNEA DE TIEMPO'],['NODE INSPECTOR','INSPECTOR DE NODO'],['SUPER HISTORY','HISTORIAL DE SUPER'],['SUPER COGNITIVE MAP','MAPA COGNITIVO DE SUPER'],['EXPORT CENTER','CENTRO DE EXPORTACIÓN'],['SAVE FULL PROCESS','GUARDAR PROCESO COMPLETO'],['SAVE FINAL ANSWER ONLY','GUARDAR SOLO RESPUESTA'],["DON'T SAVE",'NO GUARDAR'],['WORD (.DOCX)','WORD (.DOCX)'],['TEXT (.TXT)','TEXTO (.TXT)'],['AUTOMATIC · ACCORDING TO YOUR REQUEST','AUTOMÁTICO · SEGÚN TU PEDIDO'],['All','Todo'],['ALL','TODOS'],['QUESTION','PREGUNTA'],['CONCEPTS','CONCEPTOS'],['SOURCES','FUENTES'],['CONCLUSIONS','CONCLUSIONES'],['CONFLICTS','CONFLICTOS'],['CONSENSUS','CONSENSO'],['JUDGE','EVALUADOR'],['Preparing','Preparando'],['Processing','Procesando'],['Waiting','Esperando'],['READY','LISTO'],['ERROR','ERROR']
  ]);
  function translate(root=document) {
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];let n;while((n=walker.nextNode()))nodes.push(n);
    nodes.forEach(node=>{let value=node.nodeValue;replacements.forEach((to,from)=>{if(value.trim()===from)value=to;});if(value!==node.nodeValue)node.nodeValue=value;});
  }
  document.addEventListener('DOMContentLoaded',()=>translate(document));
  new MutationObserver(()=>translate(document.getElementById('super-overlay')||document)).observe(document.documentElement,{childList:true,subtree:true});
})();
