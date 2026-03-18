document.addEventListener("DOMContentLoaded", function(){

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

chat.innerHTML += "<div class='user'><b>Tú:</b> " + msg + "</div>";
input.value = "";

const thinking = document.createElement("div");
thinking.className = "ai";
thinking.textContent = "Pensando...";
chat.appendChild(thinking);

scrollAbajo();

let respuesta = "";

try{
const res = await fetch("https://tortilla-ai.onrender.com/chat",{
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

}catch(e){
console.log("Modo offline activado");
respuesta = generarRespuesta(msg.toLowerCase());
}

thinking.remove();

const bot = document.createElement("div");
bot.className = "ai";
chat.appendChild(bot);

let i = 0;

const intervalo = setInterval(function(){
bot.textContent += respuesta.charAt(i);
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
return "No hay conexión.";
}

/* ENTER */
input.addEventListener("keypress", function(e){
if(e.key === "Enter"){
sendMessage();
}
});

/* BOTONES */
window.sendMessage = sendMessage;

window.resetChat = function(){
chat.innerHTML = "";
};

});
