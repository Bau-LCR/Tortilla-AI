document.addEventListener("DOMContentLoaded", function() {
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");

    function scrollAbajo() {
        if (chat) chat.scrollTop = chat.scrollHeight;
    }

    async function sendMessage() {
        const msg = input.value.trim();
        if (!msg) return;

        // Mostrar mensaje del usuario
        chat.innerHTML += `<div class='user'><b>Tú:</b> ${msg}</div>`;
        input.value = "";

        // Crear burbuja de "Pensando..."
        const thinking = document.createElement("div");
        thinking.className = "ai";
        thinking.id = "thinking-bubble";
        thinking.textContent = "Pensando...";
        chat.appendChild(thinking);
        scrollAbajo();

        let respuesta = "";

        try {
            // Llamamos a nuestra función oculta en Vercel
            const res = await fetch("/api/chat", { 
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mensaje: msg })
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Error en el servidor");
            }

            const data = await res.json();
            // Extraemos la respuesta que viene de Groq a través de nuestro intermediario
            respuesta = data.choices[0].message.content;

        } catch (e) {
            console.error("Error detallado:", e);
            respuesta = "Error: " + e.message;
        } finally {
            // Quitar el "Pensando..."
            const bubble = document.getElementById("thinking-bubble");
            if (bubble) bubble.remove();
        }

        // Crear la respuesta final con efecto de escritura
        const bot = document.createElement("div");
        bot.className = "ai";
        chat.appendChild(bot);

        let i = 0;
        const intervalo = setInterval(function() {
            bot.textContent += respuesta.charAt(i);
            i++;
            scrollAbajo();
            if (i >= respuesta.length) {
                clearInterval(intervalo);
            }
        }, 10);
    }

    // Eventos
    input.addEventListener("keypress", (e) => { 
        if (e.key === "Enter") sendMessage(); 
    });

    window.sendMessage = sendMessage;
    
    window.resetChat = () => {
