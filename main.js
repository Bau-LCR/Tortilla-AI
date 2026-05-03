document.addEventListener("DOMContentLoaded", function() {
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");

    // Tu clave de Groq (Mantenla segura, no la compartas mucho)
    const API_KEY = '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'; 

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
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { 
                            role: "system", 
                            content: "Eres Tortilla-AI, una IA experta que responde en español de forma clara, muy detallada y amigable. Siempre saludas con entusiasmo." 
                        },
                        { role: "user", content: msg }
                    ],
                    temperature: 0.8
                })
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error?.message || "Error desconocido");
            }

            const data = await res.json();
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

    // Configuración de eventos para el botón y la tecla Enter
    input.addEventListener("keypress", (e) => { 
        if (e.key === "Enter") sendMessage(); 
    });

    window.sendMessage = sendMessage;
    
    window.resetChat = () => { 
        chat.innerHTML = "<div class='ai'>Hola, soy Tortilla-AI</div>"; 
    };
});
