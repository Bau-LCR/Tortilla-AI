const chat = document.getElementById("chat");
const input = document.getElementById("input");
const chat = document.getElementById("chat")
const input = document.getElementById("input")

function enviarMensaje(){
let nombreUsuario = localStorage.getItem("nombreUsuario")
let historial = JSON.parse(localStorage.getItem("historial")) || []

let texto = input.value.trim();
/* restaurar chat al recargar */

if(texto === "") return;
const chatGuardado = localStorage.getItem("chat")
if(chatGuardado){
chat.innerHTML = chatGuardado
}

function sendMessage(){

const msg = input.value.trim()

if(!msg) return

historial.push(msg)

agregarMensaje("Tú: " + texto,"user");
localStorage.setItem("historial", JSON.stringify(historial))

input.value="";
chat.innerHTML += `<div class="user"><b>Tú:</b> ${msg}</div>`

let typing = document.createElement("div");
typing.className="ai";
typing.id="typing";
typing.innerText="Tortilla-AI está escribiendo...";
chat.appendChild(typing);
input.value=""

chat.scrollTop = chat.scrollHeight;
/* pensando */

chat.innerHTML += `<div class="ai" id="pensando"><b>Tortilla-AI:</b> pensando...</div>`

let respuesta = generarRespuesta(msg.toLowerCase())

setTimeout(()=>{

typing.remove();
const pensando = document.getElementById("pensando")
if(pensando) pensando.remove()

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> ${respuesta}</div>`

chat.scrollTop = chat.scrollHeight

let respuesta = generarRespuesta(texto);
/* guardar chat */

escribirMensaje("Tortilla-AI: " + respuesta,"ai");
localStorage.setItem("chat", chat.innerHTML)

},800);
},600)

}

function agregarMensaje(texto,clase){
function generarRespuesta(msg){

let msg=document.createElement("div");
/* memoria simple */

msg.className=clase;
if(msg.startsWith("me llamo")){

msg.innerText=texto;
nombreUsuario = msg.replace("me llamo","").trim()

chat.appendChild(msg);
localStorage.setItem("nombreUsuario", nombreUsuario)

chat.scrollTop=chat.scrollHeight;
return `Encantada de conocerte ${nombreUsuario}.`

}

function escribirMensaje(texto,clase){
/* recordar mensaje */

let msg=document.createElement("div");
if(msg.includes("que dije antes")){

msg.className=clase;
if(historial.length > 1){
return `Antes dijiste: "${historial[historial.length-2]}"`
}else{
return "Todavía no dijiste mucho."
}

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

clearInterval(intervalo);
return "Estoy funcionando correctamente."

}

},18);
if(msg.includes("quien eres")){

return "Soy Tortilla-AI, una inteligencia artificial simple que funciona sin internet."

}

/* IA BASICA */
if(msg.includes("que puedes hacer")){

function generarRespuesta(texto){
return "Puedo conversar contigo y responder preguntas simples."

texto=texto.toLowerCase();
}

/* SALUDOS */
/* programación */

if(texto.includes("hola")||texto.includes("buenas")){
if(msg.includes("programar") || msg.includes("programacion")){

return "Hola. ¿En qué estás pensando?";
return "La programación es una habilidad muy poderosa. Aprender JavaScript es un gran comienzo."

}

/* COMO ESTAS */
if(msg.includes("javascript")){

if(texto.includes("como estas")||texto.includes("cómo estás")){

return "Estoy funcionando correctamente.";
return "JavaScript es uno de los lenguajes más importantes del desarrollo web."

}

/* NOMBRE */
if(msg.includes("html")){

return "HTML sirve para estructurar páginas web."

if(texto.includes("tu nombre")){
}

if(msg.includes("css")){

return "Soy Tortilla-AI.";
return "CSS se usa para diseñar páginas web."

}

/* PROGRAMACION */
/* juegos */

if(texto.includes("programar")||texto.includes("codigo")){
if(msg.includes("minecraft")){

return "Programar es resolver problemas usando lógica.";
return "Minecraft es uno de los juegos más creativos que existen."

}

/* QUIEN ERES */

if(texto.includes("quien eres")){
if(msg.includes("fortnite")){

return "Soy una inteligencia artificial simple creada para conversar.";
return "Fortnite es un juego muy popular de batalla real."

}

/* EDAD */
/* despedida */

if(texto.includes("edad")){
if(msg.includes("adios") || msg.includes("bye")){

return "No tengo edad. Soy un programa.";
return "Hasta luego."

}

/* DEFAULT */
/* respuestas aleatorias */

let respuestas=[
const respuestas = [

"Interesante.",
"Podrías explicar un poco más.",
"No estoy completamente seguro.",
"Tal vez tengas razón.",
"Eso suena lógico.",
"Interesante. Cuéntame más.",
"No estoy completamente segura, pero suena interesante.",
"¿Por qué piensas eso?",
"Absolutamente.",
"Sí, creo que sí."
"Esa es una buena pregunta.",
"Podrías explicarlo un poco más.",
"No tengo toda la información, pero intento aprender.",
"Tal vez tengas razón.",
"Eso suena curioso."

];
]

return respuestas[Math.floor(Math.random()*respuestas.length)];
return respuestas[Math.floor(Math.random()*respuestas.length)]

}

/* NUEVO CHAT */
/* ENTER */

function nuevoChat(){
input.addEventListener("keypress",function(e){

chat.innerHTML="";
if(e.key==="Enter"){

sendMessage()

}

/* ENTER PARA ENVIAR */
})

input.addEventListener("keydown",function(e){
/* PARTICULAS */

if(e.key==="Enter"){
const container = document.getElementById("particles")

enviarMensaje();
for(let i=0;i<90;i++){

}
let p=document.createElement("div")

});
p.className="particle"

p.style.left=Math.random()*100+"%"

let size = 2 + Math.random()*4

p.style.width=size+"px"
p.style.height=size+"px"

p.style.bottom=Math.random()*100+"%"

p.style.animationDuration=(5+Math.random()*10)+"s"

container.appendChild(p)

}
