const chat = document.getElementById("chat")
const input = document.getElementById("input")

let nombreUsuario = null

function sendMessage(){

const msg = input.value.trim()

if(!msg) return

chat.innerHTML += `<div class="user"><b>Tú:</b> ${msg}</div>`

input.value=""

let respuesta = generarRespuesta(msg.toLowerCase())

setTimeout(()=>{

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> ${respuesta}</div>`

chat.scrollTop = chat.scrollHeight

},500)

}

function generarRespuesta(msg){

/* memoria simple */

if(msg.startsWith("me llamo")){

nombreUsuario = msg.replace("me llamo","").trim()

return `Encantada de conocerte ${nombreUsuario}.`

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

if(msg.includes("programar")){

return "La programación es una habilidad muy poderosa. Aprender JavaScript es un gran comienzo."

}

if(msg.includes("minecraft")){

return "Minecraft es uno de los juegos más creativos que existen."

}

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

let historial = []

function sendMessage(){

const msg = input.value.trim()

historial.push(msg)

}
