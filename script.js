const chat = document.getElementById("chat")
const input = document.getElementById("input")
const chat = document.getElementById("chat");
const input = document.getElementById("input");

let nombreUsuario = localStorage.getItem("nombreUsuario")
let historial = JSON.parse(localStorage.getItem("historial")) || []
function enviarMensaje(){

/* restaurar chat al recargar */
let texto = input.value.trim();

const chatGuardado = localStorage.getItem("chat")
if(chatGuardado){
chat.innerHTML = chatGuardado
}

function sendMessage(){

const msg = input.value.trim()

if(!msg) return

historial.push(msg)
if(texto === "") return;

localStorage.setItem("historial", JSON.stringify(historial))
agregarMensaje("Tú: " + texto,"user");

chat.innerHTML += `<div class="user"><b>Tú:</b> ${msg}</div>`
input.value="";

input.value=""
let typing = document.createElement("div");
typing.className="ai";
typing.id="typing";
typing.innerText="Tortilla-AI está escribiendo...";
chat.appendChild(typing);

/* pensando */

chat.innerHTML += `<div class="ai" id="pensando"><b>Tortilla-AI:</b> pensando...</div>`

let respuesta = generarRespuesta(msg.toLowerCase())
chat.scrollTop = chat.scrollHeight;

setTimeout(()=>{

const pensando = document.getElementById("pensando")
if(pensando) pensando.remove()

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> ${respuesta}</div>`

chat.scrollTop = chat.scrollHeight
typing.remove();

/* guardar chat */
let respuesta = generarRespuesta(texto);

localStorage.setItem("chat", chat.innerHTML)
escribirMensaje("Tortilla-AI: " + respuesta,"ai");

},600)
},800);

}

function generarRespuesta(msg){
function agregarMensaje(texto,clase){

/* memoria simple */
let msg=document.createElement("div");

if(msg.startsWith("me llamo")){
msg.className=clase;

nombreUsuario = msg.replace("me llamo","").trim()
msg.innerText=texto;

localStorage.setItem("nombreUsuario", nombreUsuario)
chat.appendChild(msg);

return `Encantada de conocerte ${nombreUsuario}.`
chat.scrollTop=chat.scrollHeight;

}

/* recordar mensaje */
function escribirMensaje(texto,clase){

if(msg.includes("que dije antes")){
let msg=document.createElement("div");

if(historial.length > 1){
return `Antes dijiste: "${historial[historial.length-2]}"`
}else{
return "Todavía no dijiste mucho."
}
msg.className=clase;

}
chat.appendChild(msg);

/* saludos */
let i=0;

if(msg.includes("hola") || msg.includes("hi")){
let intervalo=setInterval(()=>{

if(nombreUsuario)
return `Hola ${nombreUsuario}, ¿cómo estás?`
msg.innerText+=texto.charAt(i);

return "Hola. Soy Tortilla-AI."
i++;

}
chat.scrollTop=chat.scrollHeight;

/* preguntas */
if(i>=texto.length){

if(msg.includes("como estas") || msg.includes("how are you")){

return "Estoy funcionando correctamente."
clearInterval(intervalo);

}

if(msg.includes("quien eres")){

return "Soy Tortilla-AI, una inteligencia artificial simple que funciona sin internet."
},18);

}

if(msg.includes("que puedes hacer")){
/* IA BASICA */

return "Puedo conversar contigo y responder preguntas simples."
function generarRespuesta(texto){

}
texto=texto.toLowerCase();

/* programación */
/* SALUDOS */

if(msg.includes("programar") || msg.includes("programacion")){
if(texto.includes("hola")||texto.includes("buenas")){

return "La programación es una habilidad muy poderosa. Aprender JavaScript es un gran comienzo."
return "Hola. ¿En qué estás pensando?";

}

if(msg.includes("javascript")){

return "JavaScript es uno de los lenguajes más importantes del desarrollo web."

}
/* COMO ESTAS */

if(msg.includes("html")){
if(texto.includes("como estas")||texto.includes("cómo estás")){

return "HTML sirve para estructurar páginas web."
return "Estoy funcionando correctamente.";

}

if(msg.includes("css")){
/* NOMBRE */

return "CSS se usa para diseñar páginas web."
if(texto.includes("tu nombre")){

return "Soy Tortilla-AI.";

}

/* juegos */
/* PROGRAMACION */

if(msg.includes("minecraft")){
if(texto.includes("programar")||texto.includes("codigo")){

return "Minecraft es uno de los juegos más creativos que existen."
return "Programar es resolver problemas usando lógica.";

}

if(msg.includes("fortnite")){
/* QUIEN ERES */

if(texto.includes("quien eres")){

return "Fortnite es un juego muy popular de batalla real."
return "Soy una inteligencia artificial simple creada para conversar.";

}

/* despedida */
/* EDAD */

if(msg.includes("adios") || msg.includes("bye")){
if(texto.includes("edad")){

return "Hasta luego."
return "No tengo edad. Soy un programa.";

}

/* respuestas aleatorias */
/* DEFAULT */

const respuestas = [
let respuestas=[

"Interesante. Cuéntame más.",
"Si, creo.",
"Si.",
"No.",
"Absolutamente.",
"67.",
"No estoy completamente segura, pero suena interesante.",
"¿Por qué piensas eso?",
"Esa es una buena pregunta.",
"Podrías explicarlo un poco más.",
"No tengo toda la información, pero intento aprender.",
"Interesante.",
"Podrías explicar un poco más.",
"No estoy completamente seguro.",
"Tal vez tengas razón.",
"Eso suena curioso."
"Eso suena lógico.",
"¿Por qué piensas eso?",
"Absolutamente.",
"Sí, creo que sí."

]
];

return respuestas[Math.floor(Math.random()*respuestas.length)]
return respuestas[Math.floor(Math.random()*respuestas.length)];

}

/* ENTER */

input.addEventListener("keypress",function(e){
/* NUEVO CHAT */

if(e.key==="Enter"){
function nuevoChat(){

sendMessage()
chat.innerHTML="";

}

})

/* PARTICULAS */
/* ENTER PARA ENVIAR */

const container = document.getElementById("particles")
input.addEventListener("keydown",function(e){

for(let i=0;i<90;i++){

let p=document.createElement("div")

p.className="particle"

p.style.left=Math.random()*100+"%"

let size = 2 + Math.random()*4

p.style.width=size+"px"
p.style.height=size+"px"

p.style.bottom=Math.random()*100+"%"

p.style.animationDuration=(5+Math.random()*10)+"s"
if(e.key==="Enter"){

container.appendChild(p)
enviarMensaje();

}

});
