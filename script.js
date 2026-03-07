async function enviar() {

const input = document.getElementById("mensaje");
const chat = document.getElementById("chat");

const mensaje = input.value.trim();

if (mensaje === "") return;

// Mostrar mensaje del usuario
chat.innerHTML += `<div class="user"><b>Tú:</b> ${mensaje}</div>`;

input.value = "";

// Mensaje de pensando
chat.innerHTML += `<div class="ai" id="pensando"><b>Tortilla-AI:</b> pensando...</div>`;

chat.scrollTop = chat.scrollHeight;

try {

const respuesta = await fetch("https://openrouter.ai/api/v1/chat/completions", {
method: "POST",
headers: {
"Authorization": "Bearer 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",
"Content-Type": "application/json"
},
body: JSON.stringify({
model: "openchat/openchat-7b:free",
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

const data = await respuesta.json();

// quitar "pensando..."
document.getElementById("pensando").remove();

let texto = "No se recibió respuesta.";

if (data.choices && data.choices.length > 0) {
texto = data.choices[0].message.content;
}

// mostrar respuesta
chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> ${texto}</div>`;

} catch (error) {

document.getElementById("pensando").remove();

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> Error al conectar con la IA.</div>`;

}

chat.scrollTop = chat.scrollHeight;

}
