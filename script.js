const chat = document.getElementById("chat");
const input = document.getElementById("mensaje");
const boton = document.getElementById("btnEnviar");

const API_KEY = "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";

let historial = [
{
role:"system",
content:"Te llamas Tortilla-AI. Siempre hablas en español y te presentas como Tortilla-AI."
}
];

async function enviar(){

const mensaje = input.value.trim();
if(!mensaje) return;

chat.innerHTML += `<div class="user"><b>Tú:</b> ${mensaje}</div>`;
input.value="";

historial.push({
role:"user",
content:mensaje
});

chat.innerHTML += `<div class="ai" id="pensando"><b>Tortilla-AI:</b> pensando...</div>`;

try{

const respuesta = await fetch("https://api.openai.com/v1/chat/completions",{

method:"POST",

headers:{
"Content-Type":"application/json",
"Authorization":"Bearer " + API_KEY
},

body:JSON.stringify({

model:"gpt-4o-mini",
messages:historial,
temperature:0.7

})

});

const data = await respuesta.json();

const p = document.getElementById("pensando");
if(p) p.remove();

const texto = data.choices?.[0]?.message?.content || "No pude responder.";

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> ${texto}</div>`;

historial.push({
role:"assistant",
content:texto
});

chat.scrollTop = chat.scrollHeight;

}catch(err){

const p = document.getElementById("pensando");
if(p) p.remove();

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> Error al generar respuesta.</div>`;

}

}

boton.onclick = enviar;

input.addEventListener("keypress",function(e){
if(e.key==="Enter") enviar();
});
