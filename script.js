async function enviar(){

let input = document.getElementById("mensaje");
let chat = document.getElementById("chat");

let mensaje = input.value.trim();

if(mensaje === "") return;

chat.innerHTML += `<div class="user"><b>Tú:</b> ${mensaje}</div>`;

input.value = "";

chat.innerHTML += `<div class="ai" id="pensando"><b>Tortilla-AI:</b> pensando...</div>`;

try{

let respuesta = await fetch("https://openrouter.ai/api/v1/chat/completions", {
method: "POST",
headers: {
"Authorization": "Bearer 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",
"Content-Type": "application/json"
},
body: JSON.stringify({
model: "mistralai/mistral-7b-instruct:free",
messages: [
{
role: "system",
content: "Tu nombre es Tortilla-AI. Eres una inteligencia artificial amigable creada por Bautista López. Explicas las cosas de forma simple y clara."
},
{
role: "user",
content: mensaje
}
]
})
});

let data = await respuesta.json();

let texto = data.choices?.[0]?.message?.content || "Hubo un error al responder.";

document.getElementById("pensando").innerHTML = `<b>Tortilla-AI:</b> ${texto}`;

}catch(error){

document.getElementById("pensando").innerHTML = `<b>Tortilla-AI:</b> Error al conectar con la IA.`;

}

chat.scrollTop = chat.scrollHeight;

}
