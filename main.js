document.addEventListener("DOMContentLoaded", function() {
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");

    const systemPrompt = { role: "system", content: "Configurado en el servidor." };

    // Cargar historial
    let historial = JSON.parse(localStorage.getItem("chat_history")) || [systemPrompt];
    
    // Función para limpiar y procesar negritas
    const formatearTexto = (texto) => {
        return texto.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    };

    // Renderizar al iniciar
    if (historial.length > 1) {
        historial.forEach(msg => {
            if (msg.role === "system") return;
            const div = document.createElement("div");
            div.className = msg.role === "user" ? "user" : "ai";
            div.innerHTML = msg.role === "user" ? `<b>Tú:</b> ${msg.content}` : formatearTexto(msg.content);
            chat.appendChild(div);
        });
    }

    function scrollAbajo() {
        chat.scrollTop = chat.scrollHeight;
    }

    async function sendMessage() {
        const msg = input.value.trim();
        if (!msg) return;

        // Usuario
        historial.push({ role: "user", content: msg });
        const userDiv = document.createElement("div");
        userDiv.className = "user";
        userDiv.innerHTML = `<b>Tú:</b> ${msg}`;
        chat.appendChild(userDiv);
        input.value = "";
        scrollAbajo();

        // Pensando
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
            localStorage.setItem("chat_history", JSON.stringify(historial));

            document.getElementById("thinking-bubble").remove();

            const bot = document.createElement("div");
            bot.className = "ai";
            chat.appendChild(bot);

            // EFECTO DE ESCRITURA CORREGIDO
            let i = 0;
            const intervalo = setInterval(() => {
                // Escribimos letra por letra
                bot.textContent += respuestaIA.charAt(i);
                i++;
                scrollAbajo();
                if (i >= respuestaIA.length) {
                    clearInterval(intervalo);
                    // AL FINAL, aplicamos el formato (negritas y saltos de línea)
                    bot.innerHTML = formatearTexto(bot.textContent);
                    scrollAbajo();
                }
            }, 5); // Un poco más rápido para que no sea pesado

        } catch (e) {
            console.error(e);
            if (document.getElementById("thinking-bubble")) document.getElementById("thinking-bubble").remove();
            chat.innerHTML += `<div class='ai' style='color: #ff4b4b;'>Error: ${e.message}</div>`;
        }
    }

    input.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });
    window.sendMessage = sendMessage;
    window.resetChat = () => { 
        if (confirm("¿Borrar conversación?")) {
            localStorage.removeItem("chat_history");
            historial = [systemPrompt];
            chat.innerHTML = "<div class='ai'>Hola, soy Cutreal - AI</div>"; 
        }
    };
});
