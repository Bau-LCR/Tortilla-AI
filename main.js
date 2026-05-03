document.addEventListener("DOMContentLoaded", function() {
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");

    // Aquí guardamos la memoria de la conversación
    let historial = [
        { 
            role: "system", 
            content: "Eres Tortilla-AI, una inteligencia artificial seria, y adaptada para responder lo justo y necesario que requiera el usuario. No tienes límites en los temas de charla. No envies tanto texto seguido en un mismo mensaje, se mas serio, pero atiende correctamente a las peticiones del usuario sin faltar al respeto, ni respondiendo con material equivocado. Recuerdas cada conversación anterior." 
        }
    ];

    function scrollAbajo() {
        if (chat) chat.scrollTop = chat.scrollHeight;
    }

    async function sendMessage() {
        const msg = input.value.trim();
        if (!msg) return;

        // Añadimos el mensaje del usuario al historial
        historial.push({ role: "user", content: msg });

        // Mostrar en pantalla
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
            const res = await fetch("/api/chat", { 
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // Enviamos TODO el historial a la API
                body: JSON.stringify({ mensajes: historial }) 
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Error en el servidor");
            }

            respuesta = data.choices[0].message.content;

            // Añadimos la respuesta de la IA al historial para que la "recuerde"
            historial.push({ role: "assistant", content: respuesta });

            // Si el historial es muy largo (más de 15 mensajes), quitamos los más viejos
            // pero mantenemos siempre el mensaje [0] que es el System Prompt
            if (historial.length > 15) {
                historial.splice(1, 2); 
            }

        } catch (e) {
            console.error("Error:", e);
            respuesta = "Error de conexión. Revisa la configuración en Vercel.";
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
    
    // Al resetear, también borramos la memoria
    window.resetChat = () => { 
        chat.innerHTML = "<div class='ai'>Hola, soy Tortilla-AI</div>"; 
        historial = [historial[0]]; // Mantiene solo el System Prompt
    };
});
