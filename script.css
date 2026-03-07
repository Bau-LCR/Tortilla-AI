function enviar(){

let input = document.getElementById("mensaje");
let chat = document.getElementById("chat");

let mensaje = input.value.trim();

if(mensaje === "") return;

chat.innerHTML += `<div class="user"><b>Tú:</b> ${mensaje}</div>`;

let respuesta = responder(mensaje);

setTimeout(() => {
chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> ${respuesta}</div>`;
chat.scrollTop = chat.scrollHeight;
}, 500);

input.value = "";

}

function responder(m){

m = m.toLowerCase();

if(m.includes("hola")) return "Hola 👋 Soy Tortilla-AI. ¿En qué puedo ayudarte?";

if(m.includes("quien eres")) return "Soy Tortilla-AI, una inteligencia artificial creada por Bautista.";

if(m.includes("minecraft")) return "Minecraft es uno de los mejores juegos para construir y explorar.";

if(m.includes("programar")) return "Programar es como darle instrucciones a una computadora para que haga cosas.";

return "Interesante... todavía estoy aprendiendo. 🤔";

}
