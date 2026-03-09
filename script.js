let generator;

async function iniciarIA(){

const chat = document.getElementById("chat");

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> Cargando inteligencia artificial...</div>`;

const { pipeline } = window.transformers;

generator = await pipeline(
"text-generation",
"Xenova/distilgpt2"
);

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> ¡Estoy lista! Puedes hablar conmigo.</div>`;

}

iniciarIA();

async function enviar(){

const input = document.getElementById("mensaje");
const chat = document.getElementById("chat");

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

}catch(error){

document.getElementById("pensando").remove();
chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> Error generando respuesta.</div>`;

}

chat.scrollTop = chat.scrollHeight;

}
