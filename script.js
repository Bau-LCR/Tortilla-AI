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

const respuesta = await fetch("https://api.groq.com/openai/v1/chat/completions", {
method: "POST",
headers: {
"Authorization": Bearer "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",
"Content-Type": "application/json"
},
body: JSON.stringify({
model: "llama3-8b-8192",
messages: [
{
role: "user",
content: mensaje
}
]
})
});

const data = await respuesta.json();

console.log(data);

document.getElementById("pensando").remove();

let texto = "No se recibió respuesta.";

if (data.choices && data.choices.length > 0) {
texto = data.choices[0].message.content;
}

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> ${texto}</div>`;

} catch (error) {

document.getElementById("pensando").remove();
chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> Error al conectar.</div>`;

}

chat.scrollTop = chat.scrollHeight;

}
