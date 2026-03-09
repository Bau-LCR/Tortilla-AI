import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

const chat = document.getElementById("chat");
const input = document.getElementById("mensaje");
const boton = document.getElementById("btnEnviar");

let generator;
let translator;
let historial = [];

async function iniciarIA(){

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> Cargando inteligencia artificial...</div>`;

generator = await pipeline(
"text-generation",
"Xenova/distilgpt2"
);

translator = await pipeline(
"translation",
"Xenova/opus-mt-en-es"
);

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> Hola, soy Tortilla-AI. Estoy lista para conversar contigo.</div>`;

}

iniciarIA();

async function enviar(){

const mensaje = input.value.trim();
if(!mensaje) return;

chat.innerHTML += `<div class="user"><b>Tú:</b> ${mensaje}</div>`;
input.value="";

historial.push(`Usuario: ${mensaje}`);

let contexto = historial.slice(-4).join("\n");

const prompt =
`Conversation between a user and an AI called Tortilla-AI.

${contexto}
Tortilla-AI:`;


chat.innerHTML += `<div class="ai" id="pensando"><b>Tortilla-AI:</b> escribiendo...</div>`;

try{

const resultado = await generator(prompt,{
max_new_tokens:40,
temperature:0.7
});

let texto = resultado[0].generated_text.replace(prompt,"").trim();

if(texto.includes("Usuario:")){
texto = texto.split("Usuario:")[0];
}

const traduccion = await translator(texto);

let respuesta = traduccion[0].translation_text;

const p = document.getElementById("pensando");
if(p) p.remove();

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> ${respuesta}</div>`;

historial.push(`Tortilla-AI: ${respuesta}`);

chat.scrollTop = chat.scrollHeight;

}catch(err){

const p = document.getElementById("pensando");
if(p) p.remove();

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> Error generando respuesta.</div>`;

}

}

boton.onclick = enviar;

input.addEventListener("keypress",function(e){
if(e.key==="Enter"){
enviar();
}
});
