const chat = document.getElementById("chat");
const input = document.getElementById("input");

/* SCROLL */
function scrollAbajo() {
if (chat) {
chat.scrollTop = chat.scrollHeight;
}
}

/* HISTORIAL */
let historial = JSON.parse(localStorage.getItem("historial")) || [];

/* RESTAURAR CHAT */
const chatGuardado = localStorage.getItem("chat");
if (chatGuardado) {
chat.innerHTML = chatGuardado;
}

/* API */
const URL_API = "https://tortilla-ai.onrender.com/chat";

/* ENVIAR MENSAJE */
async function sendMessage() {
const msg = input.value.trim();
if (!msg) return;

historial.push(msg);
localStorage.setItem("historial", JSON.stringify(historial));

chat.innerHTML += `<div class="user"><b>Tú:</b> ${msg}</div>`;
input.value = "";

chat.innerHTML += `<div class="ai" id="pensando"><b>Tortilla-AI:</b> pensando...</div>`;
scrollAbajo();

let respuesta = "";

try {
const res = await fetch(URL_API, {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ mensaje: msg })
});

```
const data = await res.json();
respuesta = data.reply || "Sin respuesta";
```

} catch (error) {
console.log("Modo offline activado");
respuesta = generarRespuesta(msg.toLowerCase());
}

const pensando = document.getElementById("pensando");
if (pensando) pensando.remove();

const mensajeBot = document.createElement("div");
mensajeBot.className = "ai";

const titulo = document.createElement("b");
titulo.textContent = "Tortilla-AI: ";

const texto = document.createElement("span");

mensajeBot.appendChild(titulo);
mensajeBot.appendChild(texto);
chat.appendChild(mensajeBot);

let i = 0;

const intervalo = setInterval(() => {
texto.textContent += respuesta.charAt(i);
i++;
scrollAbajo();

```
if (i >= respuesta.length) {
  clearInterval(intervalo);
  localStorage.setItem("chat", chat.innerHTML);
}
```

}, 20);
}

/* IA OFFLINE REAL */
function generarRespuesta(msg) {
if (msg.includes("hola")) return "Hola.";
if (msg.includes("como estas")) return "Estoy bien.";
if (msg.includes("quien eres")) return "Soy Tortilla-AI sin conexión.";

const respuestas = [
"Interesante.",
"Contame más.",
"No estoy seguro.",
"Podría ser."
];

return respuestas[Math.floor(Math.random() * respuestas.length)];
}

/* ENTER */
input.addEventListener("keypress", function (e) {
if (e.key === "Enter") sendMessage();
});

/* RESET */
function resetChat() {
chat.innerHTML = "";
historial = [];
localStorage.removeItem("chat");
}

/* PARTICULAS (100% CORRECTO) */
const container = document.getElementById("particles");

if (container) {
for (let i = 0; i < 80; i++) {
const p = document.createElement("div");
p.className = "particle";

```
p.style.left = Math.random() * 100 + "%";
p.style.bottom = Math.random() * 100 + "%";

const size = 2 + Math.random() * 4;
p.style.width = size + "px";
p.style.height = size + "px";

p.style.animationDuration = (5 + Math.random() * 10) + "s";

container.appendChild(p);
```

}
}
