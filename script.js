document.addEventListener("DOMContentLoaded", () => {

const chat = document.getElementById("chat");
const input = document.getElementById("input");
const container = document.getElementById("particles");

/* SCROLL */
function scrollAbajo(){
chat.scrollTop = chat.scrollHeight;
}

/* API */
const URL_API = "https://tortilla-ai.onrender.com/chat";

/* MENSAJE */
async function sendMessage(){

const msg = input.value.trim();
if(!msg) return;

chat.innerHTML += `<div class="user"><b>Tú:</b> ${msg}</div>`;
input.value = "";

const thinking = document.createElement("div");
thinking.className = "ai";
thinking.id = "pensando";
thinking.innerHTML = "<b>Tortilla-AI:</b> pensando...";
chat.appendChild(thinking);

scrollAbajo();

let respuesta = "";

try{
const res = await fetch(URL_API,{
  method:"POST",
  headers:{
    "Content-Type":"application/json"
  },
  body: JSON.stringify({mensaje: msg})
});

console.log("STATUS:", res.status);

if(!res.ok){
  throw new Error("Error HTTP " + res.status);
}

const data = await res.json();
console.log("RESPUESTA API:", data);
method:"POST",
headers:{"Content-Type":"application/json"},
body: JSON.stringify({mensaje: msg})
});

```
const data = await res.json();
respuesta = data.reply || "Sin respuesta";
```

}catch(e){
respuesta = generarRespuesta(msg.toLowerCase());
}

thinking.remove();

const mensajeBot = document.createElement("div");
mensajeBot.className = "ai";

const titulo = document.createElement("b");
titulo.textContent = "Tortilla-AI: ";

const texto = document.createElement("span");

mensajeBot.appendChild(titulo);
mensajeBot.appendChild(texto);
chat.appendChild(mensajeBot);

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

/* OFFLINE REAL */
function generarRespuesta(msg){

if(msg.includes("hola")) return "Hola.";
if(msg.includes("como estas")) return "Estoy funcionando correctamente.";
if(msg.includes("quien eres")) return "Soy Tortilla-AI sin conexión.";

const respuestas = [
"Interesante.",
"Cuéntame más.",
"No estoy seguro.",
"Podría ser.",
"Explícate mejor."
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
}

/* PARTICULAS (100% seguro) */
if(container){
for(let i=0;i<80;i++){
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
