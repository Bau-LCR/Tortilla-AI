import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

let generator;

const chat = document.getElementById("chat");

async function iniciarIA(){

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> Cargando inteligencia artificial...</div>`;

generator = await pipeline(
"text-generation",
"Xenova/distilgpt2"
);

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> ¡Estoy lista! Puedes hablar conmigo.</div>`;

}

iniciarIA();

window.enviar = async function(){

const input = document.getElementById("mensaje");
const mensaje = input.value.trim();

if(!mensaje) return;

chat.innerHTML += `<div class="user"><b>Tú:</b> ${mensaje}</div>`;

input.value="";

chat.innerHTML += `<div class="ai" id="pensando"><b>Tortilla-AI:</b> pensando...</div>`;

try{

const resultado = await generator(mensaje,{
max_new_tokens:50
});

document.getElementById("pensando").remove();

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> ${resultado[0].generated_text}</div>`;

}catch(err){

document.getElementById("pensando").remove();
chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> Error generando respuesta.</div>`;

}

chat.scrollTop = chat.scrollHeight;

}
