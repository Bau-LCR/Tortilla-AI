async function enviar() {

const input = document.getElementById("mensaje");
const chat = document.getElementById("chat");

const mensaje = input.value.trim();
if (!mensaje) return;

chat.innerHTML += `<div class="user"><b>Tú:</b> ${mensaje}</div>`;
input.value = "";

chat.innerHTML += `<div class="ai" id="pensando"><b>Tortilla-AI:</b> pensando...</div>`;

try {

const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
method: "POST",
headers: {
"Content-Type": "application/json",
"Authorization": "Bearer TU_API_KEY_GROQ"
},
body: JSON.stringify({
model: "llama3-8b-8192",
messages: [
{
role: "system",
content: "Eres Tortilla-AI, una IA amigable creada por Bautista López. Explica todo simple."
},
{
role: "user",
content: mensaje
}
],
temperature: 0.7
})
});

const data = await response.json();

console.log(data);

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
