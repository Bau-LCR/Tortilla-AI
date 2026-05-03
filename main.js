document.addEventListener("DOMContentLoaded", function() {
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");

    function scrollAbajo() {
        if (chat) chat.scrollTop = chat.scrollHeight;
    }

    async function sendMessage() {
        const msg = input.value.trim();
        if (!msg) return;

        // 1. Mostrar mensaje del usuario
        chat.innerHTML += `<div class='user'><b>Tú:</b> ${msg}</div>`;
        input.value = "";

        // 2. Crear burbuja de "Pensando..."
        const thinking = document.createElement("div");
        thinking.className = "ai";
        thinking.id = "thinking-bubble";
        thinking.textContent = "Pensando...";
        chat.appendChild(thinking);
        scrollAbajo();

        let respuesta = "";

        try {
            // 3. Llamada al intermediario (Vercel)
            const res = await fetch("/api/chat", { 
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mensaje: msg }) // Enviamos el texto a api/chat.js
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Error en el servidor");
            }

            const data = await res.json();
            // Extraemos el texto de la respuesta de Groq
            respuesta = data.choices[0].message.content;

        } catch (e) {
            console.error("Error detectado:", e);
            respuesta = "Error de conexión: " + e.message;
        } finally {
            // 4. Quitar el "Pensando..." pase lo que pase
            const bubble = document.getElementById("thinking-bubble");
            if (bubble) bubble.remove();
        }

        // 5. Mostrar respuesta de Tortilla-AI
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

    // Configuración de eventos
    input.addEventListener("keypress", (e) => { 
        if (e.key === "Enter") sendMessage(); 
    });

    window.sendMessage = sendMessage;
    
    window.resetChat = () => { 
        chat.innerHTML = "<div class='ai'>Hola, soy Tortilla-AI</div>"; 
    };
});
