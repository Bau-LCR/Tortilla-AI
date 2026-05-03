document.addEventListener("DOMContentLoaded", function() {
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");
    const loginOverlay = document.getElementById("login-overlay");
    const logoutBtn = document.getElementById("logout-btn");

    const systemPrompt = { role: "system", content: "Configurado en el servidor." };
    let historial = JSON.parse(localStorage.getItem("chat_history")) || [systemPrompt];
    
    const formatearTexto = (texto) => {
        return texto.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    };

    // --- LÓGICA DE FIREBASE ---
    window.login = async () => {
        try {
            await window.signInWithPopup(window.auth, window.provider);
        } catch (error) {
            console.error("Error login:", error);
        }
    };

    window.logout = () => window.signOut(window.auth);

    // Monitor de estado de usuario
    window.auth.onAuthStateChanged((user) => {
        if (user) {
            loginOverlay.style.display = "none";
            logoutBtn.style.display = "inline-block";
            console.log("Bienvenido:", user.displayName);
        } else {
            loginOverlay.style.display = "flex";
            logoutBtn.style.display = "none";
        }
    });
    // --- FIN FIREBASE ---

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

        historial.push({ role: "user", content: msg });
        const userDiv = document.createElement("div");
        userDiv.className = "user";
        userDiv.innerHTML = `<b>Tú:</b> ${msg}`;
        chat.appendChild(userDiv);
        input.value = "";
        scrollAbajo();

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

            let i = 0;
            const intervalo = setInterval(() => {
                bot.textContent += respuestaIA.charAt(i);
                i++;
                scrollAbajo();
                if (i >= respuestaIA.length) {
                    clearInterval(intervalo);
                    bot.innerHTML = formatearTexto(bot.textContent);
                    scrollAbajo();
                }
            }, 5);

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
