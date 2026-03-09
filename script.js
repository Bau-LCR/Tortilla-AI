const chat = document.getElementById("chat");
const input = document.getElementById("mensaje");
const boton = document.getElementById("btnEnviar");

const API_KEY = "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";

let historial = [
{
role: "system",
content: "Te llamas Tortilla-AI. Eres una inteligencia artificial que habla español de forma clara, amigable y útil."
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

document.getElementById("pensando").remove();

const texto = data.choices[0].message.content;

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> ${texto}</div>`;

historial.push({
role:"assistant",
content:texto
});

chat.scrollTop = chat.scrollHeight;

}catch(err){

document.getElementById("pensando").remove();

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> Hubo un error al generar la respuesta.</div>`;

}

}

boton.onclick = enviar;

input.addEventListener("keypress",function(e){

if(e.key==="Enter"){
enviar();
}

});
