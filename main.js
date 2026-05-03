document.addEventListener("DOMContentLoaded", function() {
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");
    const loginOverlay = document.getElementById("login-overlay");
    const logoutBtn = document.getElementById("logout-btn");

    const systemPrompt = { role: "system", content: "Configurado en el servidor." };
    let historial = JSON.parse(localStorage.getItem("chat_history")) || [systemPrompt];
    
    // Función para formatear negritas y saltos de línea
    const formatearTexto = (texto) => {
        return texto.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    };

    // --- LÓGICA DE FIREBASE ---

    // Función global de Login
    window.login = async () => {
        if (!window.auth) return console.error("Firebase no cargado");
        try {
            await window.signInWithPopup(window.auth, window.provider);
        } catch (error) {
            console.error("Error login:", error);
            alert("No se pudo iniciar sesión. Revisa los dominios autorizados en Firebase.");
        }
    };

    // Función global de Logout
    window.logout = () => {
        if (window.auth) {
            window.signOut(window.auth).then(() => {
                // Opcional: Limpiar historial al cerrar sesión por privacidad
                // localStorage.removeItem("chat_history");
                // location.reload(); 
            });
        }
    };

    // Monitor de estado de usuario (Se ejecuta automáticamente al cargar)
    const checkUser = () => {
        if (window.auth) {
            window.auth.onAuthStateChanged((user) => {
                if (user) {
                    loginOverlay.style.display = "none";
                    if (logoutBtn) logoutBtn.style.display = "inline-block";
                    console.log("Sesión activa:", user.displayName);
                } else {
                    loginOverlay.style.display = "flex";
                    if (logoutBtn) logoutBtn.style.display = "none";
                }
            });
        } else {
            // Reintentar en 500ms si el SDK de Firebase aún no carga
            setTimeout(checkUser, 500);
        }
    };
    
    checkUser();

    // --- LÓGICA DEL CHAT ---

    // Renderizar historial guardado
    if (historial.length > 1) {
        chat.innerHTML = ""; // Limpiar mensaje inicial si hay historial
        historial.forEach(msg => {
            if (msg.role === "system") return;
            const div = document.createElement("div");
            div.className = msg.role === "user" ? "user" : "ai";
            div.innerHTML = msg.role === "user" ? `<b>Tú:</b> ${msg.content}` : formatearTexto(msg.content);
            chat.appendChild(div);
        });
        scrollAbajo();
    }

    function scrollAbajo() {
        chat.scrollTop = chat.scrollHeight;
    }

    async function sendMessage() {
        const msg = input.value.trim();
        if (!msg) return;

        // Mostrar mensaje del usuario
        historial.push({ role: "user", content: msg });
        const userDiv = document.createElement("div");
        userDiv.className = "user";
        userDiv.innerHTML = `<b>Tú:</b> ${msg}`;
        chat.appendChild(userDiv);
        input.value = "";
        scrollAbajo();

        // Mostrar burbuja de carga
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

            // Quitar burbuja de carga
            const bubble = document.getElementById("thinking-bubble");
            if (bubble) bubble.remove();

            // Crear burbuja de respuesta final
            const bot = document.createElement("div");
            bot.className = "ai";
            chat.appendChild(bot);

            // Efecto de escritura
            let i = 0;
            const intervalo = setInterval(() => {
                bot.textContent += respuestaIA.charAt(i);
                i++;
                scrollAbajo();
                if (i >= respuestaIA.length) {
                    clearInterval(intervalo);
                    bot.innerHTML = formatearTexto(bot.textContent); // Aplicar negritas al final
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

    // Eventos de teclado y botones
    input.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });
    window.sendMessage = sendMessage;

    window.resetChat = () => { 
        if (confirm("¿Deseas borrar toda la conversación?")) {
            localStorage.removeItem("chat_history");
            historial = [systemPrompt];
            chat.innerHTML = "<div class='ai'>Hola, soy Cutreal - AI</div>"; 
        }
    };
});
