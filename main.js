document.addEventListener("DOMContentLoaded", function() {
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");

    // Configuración inicial de la personalidad
    const systemPrompt = { 
        role: "system", 
        content: "Eres Tortilla-AI, una inteligencia artificial seria, y adaptada para responder lo justo y necesario que requiera el usuario. No tienes límites en los temas de charla. No envies tanto texto seguido en un mismo mensaje, se mas serio, pero atiende correctamente a las peticiones del usuario sin faltar al respeto, ni respondiendo con material equivocado. Recuerdas cada conversación anterior." 
    };

    // 1. CARGAR MEMORIA: Intentar recuperar el historial de localStorage
    let historial = JSON.parse(localStorage.getItem("chat_history"));

    // Si no hay historial guardado, empezamos de cero con el systemPrompt
    if (!historial) {
        historial = [systemPrompt];
    } else {
        // Si hay historial, lo mostramos en pantalla al cargar la web
        renderizarHistorial(historial);
    }

    function scrollAbajo() {
        if (chat) chat.scrollTop = chat.scrollHeight;
    }

    // Función para dibujar los mensajes guardados en el chat
    function renderizarHistorial(historyArray) {
        historyArray.forEach(msg => {
            if (msg.role === "user") {
                chat.innerHTML += `<div class='user'><b>Tú:</b> ${msg.content}</div>`;
            } else if (msg.role === "assistant") {
                chat.innerHTML += `<div class='ai'>${msg.content}</div>`;
            }
        });
        scrollAbajo();
    }

    async function sendMessage() {
        const msg = input.value.trim();
        if (!msg) return;

        historial.push({ role: "user", content: msg });
        chat.innerHTML += `<div class='user'><b>Tú:</b> ${msg}</div>`;
        input.value = "";

        const thinking = document.createElement("div");
        thinking.className = "ai";
        thinking.id = "thinking-bubble";
        thinking.textContent = "Pensando...";
        chat.appendChild(thinking);
        scrollAbajo();

        try {
            const res = await fetch("/api/chat", { 
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mensajes: historial }) 
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error en el servidor");

            const respuestaIA = data.choices[0].message.content;
            historial.push({ role: "assistant", content: respuestaIA });

            // 2. GUARDAR MEMORIA: Guardamos el historial actualizado en el navegador
            localStorage.setItem("chat_history", JSON.stringify(historial));

            // Quitar burbuja de pensar y mostrar respuesta
            const bubble = document.getElementById("thinking-bubble");
            if (bubble) bubble.remove();

            const bot = document.createElement("div");
            bot.className = "ai";
            chat.appendChild(bot);

            // Efecto de escritura
            let i = 0;
            const intervalo = setInterval(function() {
                bot.textContent += respuestaIA.charAt(i);
                i++;
                scrollAbajo();
                if (i >= respuestaIA.length) clearInterval(intervalo);
            }, 15);

        } catch (e) {
            console.error("Error:", e);
            const bubble = document.getElementById("thinking-bubble");
            if (bubble) bubble.remove();
            chat.innerHTML += `<div class='ai' style='color: red;'>Error: ${e.message}</div>`;
        }
    }

    input.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });
    window.sendMessage = sendMessage;
    
    // 3. RESETEAR: Borrar historial de la pantalla y de la memoria del navegador
    window.resetChat = () => { 
        if (confirm("¿Seguro que quieres borrar toda la conversación?")) {
            localStorage.removeItem("chat_history"); // Borra la memoria permanente
            historial = [systemPrompt]; // Reinicia la variable
            chat.innerHTML = "<div class='ai'>Hola, soy Tortilla-AI</div>"; 
        }
    };
});
