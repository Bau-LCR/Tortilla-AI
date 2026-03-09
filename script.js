let generator;

async function cargarModelo() {

const { pipeline } = window.transformers;

generator = await pipeline(
"text-generation",
"Xenova/distilgpt2"
);

}

cargarModelo();

async function enviar() {

const input = document.getElementById("mensaje");
const chat = document.getElementById("chat");

const mensaje = input.value.trim();
if (!mensaje) return;

chat.innerHTML += `<div class="user"><b>Tú:</b> ${mensaje}</div>`;
input.value = "";

chat.innerHTML += `<div class="ai" id="pensando"><b>Tortilla-AI:</b> pensando...</div>`;

try {

const respuesta = await generator(mensaje, {
max_new_tokens: 50
});

document.getElementById("pensando").remove();

let texto = respuesta[0].generated_text;

chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> ${texto}</div>`;

} catch (error) {

document.getElementById("pensando").remove();
chat.innerHTML += `<div class="ai"><b>Tortilla-AI:</b> Error al generar respuesta.</div>`;

}

chat.scrollTop = chat.scrollHeight;

}
