async function enviar() {

const input = document.getElementById("mensaje");
const chat = document.getElementById("chat");

const mensaje = input.value.trim();
if (!mensaje) return;

chat.innerHTML += `<div><b>Tú:</b> ${mensaje}</div>`;
input.value = "";

chat.innerHTML += `<div id="pensando"><b>Tortilla-AI:</b> pensando...</div>`;

try {

const res = await fetch("https://api.affiliateplus.xyz/api/chatbot?message=" + encodeURIComponent(mensaje) + "&botname=Tortilla-AI&ownername=Tu");

const data = await res.json();

document.getElementById("pensando").remove();

chat.innerHTML += `<div><b>Tortilla-AI:</b> ${data.message}</div>`;

} catch (error) {

document.getElementById("pensando").remove();
chat.innerHTML += `<div><b>Tortilla-AI:</b> Error al responder.</div>`;

}

chat.scrollTop = chat.scrollHeight;

}
