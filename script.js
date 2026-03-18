document.addEventListener("DOMContentLoaded", () => {

const chat = document.getElementById("chat");
const input = document.getElementById("input");

/* SCROLL */
function scrollAbajo(){
chat.scrollTop = chat.scrollHeight;
}

/* MENSAJE */
async function sendMessage(){

const msg = input.value.trim();
if(!msg) return;

chat.innerHTML += `<div class="user"><b>Tú:</b> ${msg}</div>`;
input.value = "";

const thinking = document.createElement("div");
thinking.className = "ai";
thinking.textContent = "Pensando...";
chat.appendChild(thinking);

scrollAbajo();

let respuesta = "";

try{
const res = await fetch("https://tortilla-ai.onrender.com/chat",{
method:"POST",
headers:{"Content-Type":"application/json"},
body: JSON.stringify({mensaje: msg})
});

```
if(!res.ok) throw new Error();

const data = await res.json();
respuesta = data.reply;
```

}catch(e){
respuesta = generarRespuesta(msg.toLowerCase());
}

thinking.remove();

const bot = document.createElement("div");
bot.className = "ai";
chat.appendChild(bot);

let i = 0;

const intervalo = setInterval(()=>{
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

/* OFFLINE */
function generarRespuesta(msg){
if(msg.includes("hola")) return "Hola!";
return "No hay conexión.";
}

/* ENTER */
input.addEventListener("keypress",(e)=>{
if(e.key==="Enter") sendMessage();
});

window.sendMessage = sendMessage;

window.resetChat = ()=>{
chat.innerHTML="";
};

});
