/* CUTREAL SPACE · core aislado */
(function(){'use strict';
const G=6.67430e-11, AU=1.495978707e11, DAY=86400;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const clone=o=>JSON.parse(JSON.stringify(o));
function body(id,name,type,mass,radius,pos,vel,color){return {id,name,type,mass,radius,density:mass/(4/3*Math.PI*radius**3),temperature:288,position:pos.slice(),velocity:vel.slice(),acceleration:[0,0,0],rotationSpeed:0.00007,axialTilt:23.4,visualScale:1,color,atmosphere:type==='star'?false:true,rings:false};}
const presets={
 solar(){return [body('sun','Sol','star',1.989e30,6.9634e8,[0,0,0],[0,0,0],'#ffd166'),body('earth','Tierra','planet',5.972e24,6.371e6,[AU,0,0],[0,29780,0],'#4da3ff'),body('moon','Luna','moon',7.342e22,1.737e6,[AU+384.4e6,0,0],[0,29780+1022,0],'#d5deea'),body('mars','Marte','planet',6.39e23,3.389e6,[1.524*AU,0,0],[0,24077,0],'#c7795a')];},
 earthMoon(){return [body('earth','Tierra','planet',5.972e24,6.371e6,[0,0,0],[0,0,0],'#4da3ff'),body('moon','Luna','moon',7.342e22,1.737e6,[384.4e6,0,0],[0,1022,0],'#d5deea')];},
 binary(){return [body('star-a','Estrella A','star',1.5e30,6e8,[-1.2e10,0,0],[0,-20500,0],'#ffe29a'),body('star-b','Estrella B','star',1e30,5e8,[1.8e10,0,0],[0,30750,0],'#9ecbff'),body('planet','Planeta','planet',5.9e24,6e6,[0,3e11,0],[-18000,0,0],'#5ee7c7')];}
};
const state={bodies:[],running:false,time:0,speed:86400,quality:'BALANCED',mode:'3D SPACETIME GRID',visualAmplification:1.8,gridDensity:12,gridDepth:5,layerCount:5,trailMode:'medium',selectedId:null,events:[],history:[],experimental:{gravityMultiplier:1},scenarioName:'Sin título'};
function reset(){state.bodies=[];state.running=false;state.time=0;state.selectedId=null;state.events=[];state.history=[];}
function loadPreset(name){reset();const fn=presets[name]||presets.solar;state.bodies=fn();event('Preset cargado: '+name);return snapshot();}
function addCustom(data={}){const i=state.bodies.length+1;const b=body(data.id||`custom-${Date.now()}`,data.name||`Cuerpo ${i}`,data.type||'planet',Number(data.mass)||5.972e24,Number(data.radius)||6.371e6,data.position||[0,i*1e8,0],data.velocity||[0,Math.sqrt(G*1.989e30/(i*1e8)),0],data.color||'#70e8ff');state.bodies.push(b);event(`Objeto creado: ${b.name}`);return clone(b);}
function event(text){state.events.unshift({time:state.time,text});state.events=state.events.slice(0,100);}
function step(dt=1){const bs=state.bodies;for(const a of bs){a.acceleration=[0,0,0];for(const b of bs){if(a===b)continue;const d=[b.position[0]-a.position[0],b.position[1]-a.position[1],b.position[2]-a.position[2]];const r2=Math.max(1,d[0]**2+d[1]**2+d[2]**2);const r=Math.sqrt(r2),f=G*state.experimental.gravityMultiplier*b.mass/(r2*r);a.acceleration[0]+=d[0]*f;a.acceleration[1]+=d[1]*f;a.acceleration[2]+=d[2]*f;} }for(const a of bs){for(let k=0;k<3;k++){a.velocity[k]+=a.acceleration[k]*dt;a.position[k]+=a.velocity[k]*dt;}}state.time+=dt;state.history.push(bs.map(b=>({id:b.id,p:b.position.slice()})));if(state.history.length>300)state.history.shift();return snapshot();}
function update(){if(state.running)step(Math.min(state.speed/30,864000));return snapshot();}
function setParam(id,key,value){const b=state.bodies.find(x=>x.id===id);if(!b)return false;if(['mass','radius','temperature','rotationSpeed','axialTilt','visualScale'].includes(key))b[key]=Math.max(0,Number(value));else if(['position','velocity'].includes(key)&&Array.isArray(value))b[key]=value.map(Number);else if(key==='name'||key==='color')b[key]=String(value);else return false;event(`Parámetro actualizado: ${b.name} · ${key}`);return true;}
function select(id){state.selectedId=id;return selected();} function selected(){return clone(state.bodies.find(b=>b.id===state.selectedId)||null);}
function analysis(){return state.bodies.map(b=>({id:b.id,name:b.name,mass:b.mass,radius:b.radius,speed:Math.hypot(...b.velocity),gravity:G*state.experimental.gravityMultiplier*b.mass/(b.radius*b.radius),position:b.position.slice()}));}
function why(){const b=state.bodies.find(x=>x.id===state.selectedId);if(!b)return 'Seleccioná un cuerpo para explicar su estado.';const influence=state.bodies.filter(x=>x!==b).sort((a,c)=>c.mass-a.mass)[0];return `${b.name} cambia su trayectoria por la aceleración gravitacional resultante de todos los cuerpos. El cuerpo con mayor masa disponible es ${influence?.name||'desconocido'}. La explicación usa el estado actual de la simulación; la visualización de curvatura es conceptual.`;}
function snapshot(){return {time:state.time,running:state.running,speed:state.speed,mode:state.mode,visualAmplification:state.visualAmplification,gridDensity:state.gridDensity,gridDepth:state.gridDepth,layerCount:state.layerCount,selectedId:state.selectedId,bodies:clone(state.bodies),events:clone(state.events),scenarioName:state.scenarioName};}
function exportJSON(){return JSON.stringify({version:1,space:snapshot()},null,2)}
window.CutRealSpaceCore={state,constants:{G,AU,DAY},presets,loadPreset,addCustom,step,update,setParam,select,selected,analysis,why,snapshot,exportJSON,reset,event};
})();
