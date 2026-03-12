const chat = document.getElementById("chat")
const input = document.getElementById("input")

let nombreUsuario = null
let historial = []

function sendMessage(){

const msg = input.value.trim()

if(!msg) return

historial.push(msg)

chat.innerHTML += `<div class="user"><b>Tú:</b> ${msg}</div>`

input.value=""

/* mensaje pensando */

const pensando = document.createElement("div")
pensando.className = "ai"
pensando.id = "pensando"
pensando.innerHTML = "<b>Tortilla-AI:</b> pensando..."
chat.appendChild(pensando)

chat.scrollTop = chat.scrollHeight

let respuesta = generarRespuesta(msg.toLowerCase())

setTimeout(()=>{

document.getElementById("pensando").remove()

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> ${respuesta}</div>`

chat.scrollTop = chat.scrollHeight

},700)

}

function generarRespuesta(msg){

/* memoria nombre */

if(msg.startsWith("me llamo")){

nombreUsuario = msg.replace("me llamo","").trim()

return `Encantada de conocerte ${nombreUsuario}.`

}

/* recordar mensajes */

if(msg.includes("que dije antes") || msg.includes("que dije recien")){

if(historial.length > 1){
return `Antes dijiste: "${historial[historial.length-2]}"`
}

return "Aún no dijiste mucho."

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

return "HTML se usa para estructurar páginas web."

}

if(msg.includes("css")){

return "CSS sirve para diseñar y dar estilo a una página web."

}

/* juegos */

if(msg.includes("minecraft")){

return "Minecraft es uno de los juegos más creativos que existen."

}

if(msg.includes("fortnite")){

return "Fortnite es un juego muy popular de batalla real."

}

/* despedidas */

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

"Eso suena curioso.",

"Me gustaría saber más sobre eso.",

"Eso suena interesante."

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
