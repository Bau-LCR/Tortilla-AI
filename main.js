document.addEventListener("DOMContentLoaded", function() {
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");
    const loginOverlay = document.getElementById("login-overlay");
    const logoutBtn = document.getElementById("logout-btn");

    const systemPrompt = { role: "system", content: "Configurado en el servidor." };
    
    // Variables de estado global
    let currentUser = null;
    let historial = [systemPrompt];
    
    const formatearTexto = (texto) => {
        return texto.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    };

    const scrollAbajo = () => {
        chat.scrollTop = chat.scrollHeight;
    };

    // --- LÓGICA DE FIREBASE ---

    window.login = async () => {
        if (!window.auth) return console.error("Firebase no cargado");
        try {
            await window.signInWithPopup(window.auth, window.provider);
        } catch (error) {
            console.error("Error login:", error);
            alert("No se pudo iniciar sesión.");
        }
    };

    window.logout = () => {
        if (window.auth) window.signOut(window.auth);
    };

    // Función para renderizar el chat en pantalla
    const renderizarChat = () => {
        chat.innerHTML = ""; 
        if (historial.length <= 1) {
            const nombre = currentUser ? currentUser.displayName.split(' ')[0] : "";
            chat.innerHTML = `<div class="ai">Hola ${nombre}, soy Cutreal - AI.</div>`;
        } else {
            historial.forEach(msg => {
                if (msg.role === "system") return;
                const div = document.createElement("div");
                div.className = msg.role === "user" ? "user" : "ai";
                div.innerHTML = msg.role === "user" ? `<b>Tú:</b> ${msg.content}` : formatearTexto(msg.content);
                chat.appendChild(div);
            });
        }
        scrollAbajo();
    };

    const checkUser = () => {
        if (window.auth) {
            window.auth.onAuthStateChanged((user) => {
                if (user) {
                    currentUser = user;
                    loginOverlay.style.display = "none";
                    if (logoutBtn) logoutBtn.style.display = "inline-block";

                    // CARGAR HISTORIAL ESPECÍFICO DEL USUARIO
                    const key = `chat_history_${user.uid}`;
                    const saved = localStorage.getItem(key);
                    historial = saved ? JSON.parse(saved) : [systemPrompt];
                    
                    renderizarChat();
                    console.log("Sesión de:", user.displayName);
                } else {
                    currentUser = null;
                    loginOverlay.style.display = "flex";
                    if (logoutBtn) logoutBtn.style.display = "none";
                    chat.innerHTML = ""; // Limpiar por seguridad
                }
            });
        } else {
            setTimeout(checkUser, 500);
        }
    };
    
    checkUser();

    // --- LÓGICA DEL CHAT ---

    async function sendMessage() {
        const msg = input.value.trim();
        if (!msg || !currentUser) return;

        // Agregar y mostrar mensaje del usuario
        historial.push({ role: "user", content: msg });
        const userDiv = document.createElement("div");
        userDiv.className = "user";
        userDiv.innerHTML = `<b>Tú:</b> ${msg}`;
        chat.appendChild(userDiv);
        input.value = "";
        scrollAbajo();

        // Burbuja de "Pensando"
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

            // GUARDAR CON LLAVE DE USUARIO
            localStorage.setItem(`chat_history_${currentUser.uid}`, JSON.stringify(historial));

            const bubble = document.getElementById("thinking-bubble");
            if (bubble) bubble.remove();

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
            const bubble = document.getElementById("thinking-bubble");
            if (bubble) bubble.remove();
            chat.innerHTML += `<div class='ai' style='color: #ff4b4b; border: 1px solid #ff4b4b;'><b>Error:</b> ${e.message}</div>`;
            scrollAbajo();
        }
    }

    input.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });
    window.sendMessage = sendMessage;

    window.resetChat = () => { 
        if (!currentUser) return;
        if (confirm("¿Deseas borrar tu conversación?")) {
            localStorage.removeItem(`chat_history_${currentUser.uid}`);
            historial = [systemPrompt];
            renderizarChat();
        }
    };
});
