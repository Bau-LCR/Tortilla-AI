const chat = document.getElementById("chat")
const input = document.getElementById("input")

/* seguridad */
if(!chat || !input){
console.error("Error: no se encontró #chat o #input")
}

/* función segura de scroll */
function scrollAbajo(){
if(chat && typeof chat.scrollHeight === "number"){
chat.scrollTop = chat.scrollHeight
}
}

/* memoria */
let nombreUsuario = localStorage.getItem("nombreUsuario")
let historial = JSON.parse(localStorage.getItem("historial")) || []

/* restaurar chat */
const chatGuardado = localStorage.getItem("chat")
if(chatGuardado){
chat.innerHTML = chatGuardado
}

/* API */
const URL_API = window.location.hostname === "localhost"
? "http://localhost:3000/chat"
: "https://tortilla-ai.onrender.com/chat"

/* ENVIAR MENSAJE */
async function sendMessage(){

const msg = input.value.trim()
if(!msg) return

historial.push(msg)
localStorage.setItem("historial", JSON.stringify(historial))

chat.innerHTML += `<div class="user"><b>Tú:</b> ${msg}</div>`
input.value=""

chat.innerHTML += `<div class="ai" id="pensando"><b>Tortilla-AI:</b> pensando...</div>`
scrollAbajo()

let respuesta = ""

try{
const res = await fetch(URL_API,{
method:"POST",
headers:{"Content-Type":"application/json"},
body: JSON.stringify({mensaje: msg})
})

```
if(!res.ok) throw new Error("error servidor")

const data = await res.json()
respuesta = data.reply || "Sin respuesta"
```

}catch(e){
console.log("Modo offline activado")
respuesta = generarRespuesta(msg.toLowerCase())
}

const pensando = document.getElementById("pensando")
if(pensando) pensando.remove()

const mensajeBot = document.createElement("div")
mensajeBot.className = "ai"

const titulo = document.createElement("b")
titulo.textContent = "Tortilla-AI: "

const texto = document.createElement("span")

mensajeBot.appendChild(titulo)
mensajeBot.appendChild(texto)
chat.appendChild(mensajeBot)

scrollAbajo()

let i = 0

let intervalo = setInterval(()=>{
texto.textContent += respuesta.charAt(i)
i++
scrollAbajo()

```
if(i >= respuesta.length){
  clearInterval(intervalo)
  localStorage.setItem("chat", chat.innerHTML)
}
```

},20)
}

/* IA LOCAL */
function generarRespuesta(msg){

if(msg.includes("hola")){
return nombreUsuario ? `Hola ${nombreUsuario}` : "Hola."
}

if(msg.includes("como estas")){
return "Estoy funcionando correctamente."
}

if(msg.includes("quien eres")){
return "Soy Tortilla-AI sin conexión."
}

if(msg.startsWith("me llamo")){
nombreUsuario = msg.replace("me llamo","").trim()
localStorage.setItem("nombreUsuario", nombreUsuario)
return `Encantada de conocerte ${nombreUsuario}`
}

const respuestas = [
"Interesante.",
"Cuéntame más.",
"No estoy seguro.",
"Podría ser.",
"Explícate mejor."
]

return respuestas[Math.floor(Math.random()*respuestas.length)]
}

/* ENTER */
input.addEventListener("keypress",function(e){
if(e.key==="Enter"){
sendMessage()
}
})

/* RESET */
function resetChat(){
chat.innerHTML=""
historial=[]
localStorage.removeItem("chat")
}

/* PARTICULAS */
const container = document.getElementById("particles")

if(container){
for(let i=0;i<90;i++){
let p=document.createElement("div")
p.className="particle"

```
p.style.left=Math.random()*100+"%"

let size = 2 + Math.random()*4
p.style.width=size+"px"
p.style.height=size+"px"

p.style.bottom=Math.random()*100+"%"
p.style.animationDuration=(5+Math.random()*10)+"s"

container.appendChild(p)
```

}
}
