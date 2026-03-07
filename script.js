async function enviar(){

let input = document.getElementById("mensaje");
let chat = document.getElementById("chat");

let mensaje = input.value.trim();

if(mensaje === "") return;

chat.innerHTML += `<div class="user"><b>Tú:</b> ${mensaje}</div>`;

input.value = "";

chat.innerHTML += `<div class="ai" id="pensando"><b>Tortilla-AI:</b> pensando...</div>`;

let respuesta = await fetch("https://openrouter.ai/api/v1/chat/completions", {
method: "POST",
headers: {
"Authorization": "Bearer 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",
"Content-Type": "application/json"
},
body: JSON.stringify({
model: "mistralai/mistral-7b-instruct",
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

let texto = data.choices[0].message.content;

document.getElementById("pensando").innerHTML = `<b>Tortilla-AI:</b> ${texto}`;

chat.scrollTop = chat.scrollHeight;

}
