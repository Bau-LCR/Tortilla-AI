document.addEventListener("DOMContentLoaded", () => {

const chat = document.getElementById("chat");
const input = document.getElementById("input");

/* SCROLL */
function scrollAbajo(){
if(chat){
chat.scrollTop = chat.scrollHeight;
}
}

/* ENVIAR MENSAJE */
async function sendMessage(){

const msg = input.value.trim();
if(!msg) return;

chat.innerHTML += `<div class="user"><b>Tú:</b> ${msg}</div>`;
input.value = "";

// mensaje "pensando"
const thinking = document.createElement("div");
thinking.className = "ai";
thinking.id = "pensando";
thinking.innerHTML = "<b>Tortilla-AI:</b> pensando...";
chat.appendChild(thinking);

scrollAbajo();

let respuesta = "";

try {
const res = await fetch("https://tortilla-ai.onrender.com/chat", {
method: "POST",
headers: {
"Content-Type": "application/json"
},
body: JSON.stringify({ mensaje: msg })
});

```
if(!res.ok){
  throw new Error("Error HTTP");
}

const data = await res.json();

respuesta = data.reply || "Sin respuesta";
```

} catch (error) {
console.log("Modo offline activado");
respuesta = generarRespuesta(msg.toLowerCase());
}

// eliminar "pensando"
const pensando = document.getElementById("pensando");
if(pensando) pensando.remove();

// mensaje bot
const botMsg = document.createElement("div");
botMsg.className = "ai";

const texto = document.createElement("span");
botMsg.appendChild(texto);

chat.appendChild(botMsg);

let i = 0;

const intervalo = setInterval(()=>{
texto.textContent += respuesta.charAt(i);
i++;
scrollAbajo();

```
if(i >= respuesta.length){
  clearInterval(intervalo);
}
```

},20);
}

/* IA OFFLINE */
function generarRespuesta(msg){

if(msg.includes("hola")) return "Hola!";
if(msg.includes("como estas")) return "Estoy bien.";
if(msg.includes("quien eres")) return "Soy Tortilla-AI offline.";

const respuestas = [
"Interesante.",
"Contame más.",
"No entiendo del todo.",
"Puede ser."
];

return respuestas[Math.floor(Math.random()*respuestas.length)];
}

/* ENTER */
input.addEventListener("keypress", (e)=>{
if(e.key === "Enter") sendMessage();
});

/* BOTONES */
window.sendMessage = sendMessage;

window.resetChat = function(){
chat.innerHTML = "";
};

/* PARTICULAS (SEGURO) */
const container = document.getElementById("particles");

if(container){
for(let i=0;i<70;i++){
const p = document.createElement("div");

```
p.className = "particle";
p.style.left = Math.random()*100 + "%";
p.style.bottom = Math.random()*100 + "%";

const size = 2 + Math.random()*4;
p.style.width = size + "px";
p.style.height = size + "px";

p.style.animationDuration = (5 + Math.random()*10) + "s";

container.appendChild(p);
```

}
}

});
