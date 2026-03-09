async function enviar() {

const input = document.getElementById("mensaje");
const chat = document.getElementById("chat");

const mensaje = input.value.trim();
if (!mensaje) return;

chat.innerHTML += `<div class="user"><b>Tú:</b> ${mensaje}</div>`;
input.value = "";

chat.innerHTML += `<div class="ai" id="pensando"><b>Tortilla-AI:</b> pensando...</div>`;
chat.scrollTop = chat.scrollHeight;

try {

const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
method: "POST",
headers: {
"Content-Type": "application/json",
"Authorization": "Bearer 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"
},
body: JSON.stringify({
model: "llama3-8b-8192",
messages: [
{
role: "system",
content: "Tu nombre es Tortilla-AI. Eres una IA amigable creada por Bautista López. Responde claro y simple."
},
{
role: "user",
content: mensaje
}
],
temperature: 0.7,
max_tokens: 512
})
});

const data = await response.json();

document.getElementById("pensando").remove();

let texto = "No se recibió respuesta.";

if (data.choices && data.choices.length > 0) {
texto = data.choices[0].message.content;
}

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> ${texto}</div>`;

} catch (error) {

document.getElementById("pensando").remove();
chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> Error al conectar con la IA.</div>`;

}

chat.scrollTop = chat.scrollHeight;

}
