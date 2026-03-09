import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

const chat = document.getElementById("chat");
const input = document.getElementById("mensaje");
const boton = document.getElementById("btnEnviar");

let generator;
let historial = [];

async function iniciarIA(){

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> Cargando inteligencia artificial...</div>`;

generator = await pipeline(
"text-generation",
"Xenova/distilgpt2"
);

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> Hola, soy Tortilla - AI, una Inteligencia Artificial con respuestas muy limitadas, debido a la poca infraestructura que tengo, asi que sé paciente con mis respuestas, en caso de que no funcione, reinicia la página. ¿En qué puedo ayudarte?</div>`;

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
`Conversación entre un usuario y una inteligencia artificial llamada Tortilla-AI.

${contexto}
Tortilla-AI:`;


chat.innerHTML += `<div class="ai" id="pensando"><b>Tortilla-AI:</b> escribiendo...</div>`;

try{

const resultado = await generator(prompt,{
max_new_tokens:40,
temperature:0.7,
top_p:0.9
});

const p = document.getElementById("pensando");
if(p) p.remove();

let texto = resultado[0].generated_text;

let respuesta = texto.replace(prompt,"");

if(respuesta.includes("Usuario:")){
respuesta = respuesta.split("Usuario:")[0];
}

respuesta = respuesta.trim();

if(respuesta.length < 3){
respuesta = "Todavía estoy aprendiendo a responder mejor.";
}

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> ${respuesta}</div>`;

historial.push(`Tortilla-AI: ${respuesta}`);

chat.scrollTop = chat.scrollHeight;

}catch(err){

const p = document.getElementById("pensando");
if(p) p.remove();

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> Ocurrió un error generando respuesta.</div>`;

}

}

boton.onclick = enviar;

input.addEventListener("keypress",function(e){
if(e.key==="Enter"){
enviar();
}
});
