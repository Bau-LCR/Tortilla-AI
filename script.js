const chat = document.getElementById("chat");
const input = document.getElementById("input");

function enviarMensaje(){

let texto = input.value.trim();

if(texto === "") return;

agregarMensaje("Tú: " + texto,"user");

input.value="";

let typing = document.createElement("div");
typing.className="ai";
typing.id="typing";
typing.innerText="Tortilla-AI está escribiendo...";
chat.appendChild(typing);

chat.scrollTop = chat.scrollHeight;

setTimeout(()=>{

typing.remove();

let respuesta = generarRespuesta(texto);

escribirMensaje("Tortilla-AI: " + respuesta,"ai");

},800);

}

function agregarMensaje(texto,clase){

let msg=document.createElement("div");

msg.className=clase;

msg.innerText=texto;

chat.appendChild(msg);

chat.scrollTop=chat.scrollHeight;

}

function escribirMensaje(texto,clase){

let msg=document.createElement("div");

msg.className=clase;

chat.appendChild(msg);

let i=0;

let intervalo=setInterval(()=>{

msg.innerText+=texto.charAt(i);

i++;

chat.scrollTop=chat.scrollHeight;

if(i>=texto.length){

clearInterval(intervalo);

}

},18);

}

/* IA BASICA */

function generarRespuesta(texto){

texto=texto.toLowerCase();

/* SALUDOS */

if(texto.includes("hola")||texto.includes("buenas")){

return "Hola. ¿En qué estás pensando?";

}

/* COMO ESTAS */

if(texto.includes("como estas")||texto.includes("cómo estás")){

return "Estoy funcionando correctamente.";

}

/* NOMBRE */

if(texto.includes("tu nombre")){

return "Soy Tortilla-AI.";

}

/* PROGRAMACION */

if(texto.includes("programar")||texto.includes("codigo")){

return "Programar es resolver problemas usando lógica.";

}

/* QUIEN ERES */

if(texto.includes("quien eres")){

return "Soy una inteligencia artificial simple creada para conversar.";

}

/* EDAD */

if(texto.includes("edad")){

return "No tengo edad. Soy un programa.";

}

/* DEFAULT */

let respuestas=[

"Interesante.",
"Podrías explicar un poco más.",
"No estoy completamente seguro.",
"Tal vez tengas razón.",
"Eso suena lógico.",
"¿Por qué piensas eso?",
"Absolutamente.",
"Sí, creo que sí."

];

return respuestas[Math.floor(Math.random()*respuestas.length)];

}

/* NUEVO CHAT */

function nuevoChat(){

chat.innerHTML="";

}

/* ENTER PARA ENVIAR */

input.addEventListener("keydown",function(e){

if(e.key==="Enter"){

enviarMensaje();

}

});
