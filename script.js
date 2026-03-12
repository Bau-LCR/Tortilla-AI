const chat = document.getElementById("chat")
const input = document.getElementById("input")

let nombreUsuario = localStorage.getItem("nombreUsuario")
let historial = JSON.parse(localStorage.getItem("historial")) || []

/* restaurar chat al recargar */

const chatGuardado = localStorage.getItem("chat")
if(chatGuardado){
chat.innerHTML = chatGuardado
}

function sendMessage(){

const msg = input.value.trim()

if(!msg) return

historial.push(msg)

localStorage.setItem("historial", JSON.stringify(historial))

chat.innerHTML += `<div class="user"><b>Tú:</b> ${msg}</div>`

input.value=""

/* pensando */

chat.innerHTML += `<div class="ai" id="pensando"><b>Tortilla-AI:</b> pensando...</div>`

chat.scrollTop = chat.scrollHeight

setTimeout(()=>{

const pensando = document.getElementById("pensando")
if(pensando) pensando.remove()

let respuesta = generarRespuesta(msg.toLowerCase())

/* crear mensaje del bot */

const mensajeBot = document.createElement("div")
mensajeBot.className = "ai"

const titulo = document.createElement("b")
titulo.textContent = "Tortilla-AI: "

const texto = document.createElement("span")

mensajeBot.appendChild(titulo)
mensajeBot.appendChild(texto)

chat.appendChild(mensajeBot)

chat.scrollTop = chat.scrollHeight

/* animacion escritura */

let i = 0

let intervalo = setInterval(()=>{

texto.textContent += respuesta.charAt(i)

i++

chat.scrollTop = chat.scrollHeight

if(i >= respuesta.length){

clearInterval(intervalo)

/* guardar chat */

localStorage.setItem("chat", chat.innerHTML)

}

},20)

},600)

}

function generarRespuesta(msg){

/* memoria simple */

if(msg.startsWith("me llamo")){

nombreUsuario = msg.replace("me llamo","").trim()

localStorage.setItem("nombreUsuario", nombreUsuario)

return `Encantada de conocerte ${nombreUsuario}.`

}

/* recordar mensaje */

if(msg.includes("que dije antes")){

if(historial.length > 1){
return `Antes dijiste: "${historial[historial.length-2]}"`
}else{
return "Todavía no dijiste mucho."
}

}

/* saludos */

if(msg.includes("hola") || msg.includes("hi")){

if(nombreUsuario)
return `Hola ${nombreUsuario}, ¿cómo estás?`

return "Hola. Soy Tortilla-AI."

}

/* preguntas */

if(msg.includes("como estas") || msg.includes("how are you")){

return "Estoy funcionando correctamente."

}

if(msg.includes("quien eres")){

return "Soy Tortilla-AI, una inteligencia artificial simple que funciona sin internet."

}

if(msg.includes("que puedes hacer")){

return "Puedo conversar contigo y responder preguntas simples."

}

/* programación */

if(msg.includes("programar") || msg.includes("programacion")){

return "La programación es una habilidad muy poderosa. Aprender JavaScript es un gran comienzo."

}

if(msg.includes("javascript")){

return "JavaScript es uno de los lenguajes más importantes del desarrollo web."

}

if(msg.includes("html")){

return "HTML sirve para estructurar páginas web."

}

if(msg.includes("css")){

return "CSS se usa para diseñar páginas web."

}

/* juegos */

if(msg.includes("minecraft")){

return "Minecraft es uno de los juegos más creativos que existen."

}

if(msg.includes("fortnite")){

return "Fortnite es un juego muy popular de batalla real."

}

/* despedida */

if(msg.includes("adios") || msg.includes("bye")){

return "Hasta luego."

}

/* respuestas aleatorias */

const respuestas = [

"Interesante. Cuéntame más.",
"No estoy completamente segura, pero suena interesante.",
"¿Por qué piensas eso?",
"Esa es una buena pregunta.",
"Podrías explicarlo un poco más.",
"No tengo toda la información, pero intento aprender.",
"Tal vez tengas razón.",
"Eso suena curioso."

]

return respuestas[Math.floor(Math.random()*respuestas.length)]

}

/* ENTER */

input.addEventListener("keypress",function(e){

if(e.key==="Enter"){

sendMessage()

}

})

/* PARTICULAS */

const container = document.getElementById("particles")

for(let i=0;i<90;i++){

let p=document.createElement("div")

p.className="particle"

p.style.left=Math.random()*100+"%"

let size = 2 + Math.random()*4

p.style.width=size+"px"
p.style.height=size+"px"

p.style.bottom=Math.random()*100+"%"

p.style.animationDuration=(5+Math.random()*10)+"s"

container.appendChild(p)

}

function resetChat(){

chat.innerHTML=""

historial=[]

localStorage.removeItem("chat")

}
