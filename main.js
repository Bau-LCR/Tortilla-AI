document.addEventListener("DOMContentLoaded", function() {
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");

    function scrollAbajo() {
        if (chat) chat.scrollTop = chat.scrollHeight;
    }

    async function sendMessage() {
        const msg = input.value.trim();
        if (!msg) return;

        chat.innerHTML += `<div class='user'><b>Tú:</b> ${msg}</div>`;
        input.value = "";

        const thinking = document.createElement("div");
        thinking.className = "ai";
        thinking.id = "thinking-bubble";
        thinking.textContent = "Pensando...";
        chat.appendChild(thinking);
        scrollAbajo();

        let respuesta = "";

        try {
            // IMPORTANTE: Esta ruta solo funciona en Vercel
            const res = await fetch("/api/chat", { 
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mensaje: msg })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Error en el servidor");
            }

            respuesta = data.choices[0].message.content;

        } catch (e) {
            console.error("Error:", e);
            respuesta = "Error de conexión. Asegúrate de estar en la URL de Vercel y tener configurada la API KEY.";
        } finally {
            const bubble = document.getElementById("thinking-bubble");
            if (bubble) bubble.remove();
        }

        const bot = document.createElement("div");
        bot.className = "ai";
        chat.appendChild(bot);

        let i = 0;
        const intervalo = setInterval(function() {
            bot.textContent += respuesta.charAt(i);
            i++;
            scrollAbajo();
            if (i >= respuesta.length) clearInterval(intervalo);
        }, 15);
    }

    input.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });
    window.sendMessage = sendMessage;
    window.resetChat = () => { chat.innerHTML = "<div class='ai'>Hola, soy Tortilla-AI</div>"; };
});
