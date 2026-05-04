document.addEventListener("DOMContentLoaded", function() {
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");
    const loginOverlay = document.getElementById("login-overlay");
    const logoutBtn = document.getElementById("logout-btn");
    const resetBtn = document.getElementById("resetChat");
    const splashScreen = document.getElementById("splash-screen");

    // --- LÓGICA DEL SPLASH SCREEN ---
    setTimeout(() => {
        if (splashScreen) {
            splashScreen.style.opacity = "0";
            splashScreen.style.transition = "opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1)";
            setTimeout(() => {
                splashScreen.style.display = "none";
            }, 800);
        }
    }, 2000);

    const systemPrompt = { role: "system", content: "Configurado en el servidor." };
    let currentUser = null;
    let historial = [systemPrompt];
    
    const formatearTexto = (texto) => {
        return texto.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    };

    const scrollAbajo = () => { chat.scrollTop = chat.scrollHeight; };

    // --- FIREBASE LOGIC ---
    window.login = async () => {
        if (!window.auth) return;
        try { await window.signInWithPopup(window.auth, window.provider); } 
        catch (error) { console.error("Error login:", error); }
    };

    window.logout = () => {
        if (window.auth) {
            document.body.style.opacity = "0.5";
            window.signOut(window.auth).then(() => { location.reload(); });
        }
    };

    const checkUser = () => {
        if (window.auth) {
            window.auth.onAuthStateChanged((user) => {
                if (user) {
                    currentUser = user;
                    loginOverlay.style.opacity = "0";
                    setTimeout(() => loginOverlay.style.display = "none", 300);
                    // Mostrar ambos botones
                    if (logoutBtn) logoutBtn.style.display = "block";
                    if (resetBtn) resetBtn.style.display = "block";
                    cargarDeNube(user.uid); 
                } else {
                    currentUser = null;
                    loginOverlay.style.display = "flex";
                    if (logoutBtn) logoutBtn.style.display = "none";
                    if (resetBtn) resetBtn.style.display = "none";
                    historial = [systemPrompt];
                }
            });
        } else { setTimeout(checkUser, 500); }
    };
    
    checkUser();

    // --- CHAT LOGIC ---
    async function sendMessage() {
        const msg = input.value.trim();
        if (!msg || !currentUser) return;

        historial.push({ role: "user", content: msg });
        renderizarChat();
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
            const respuestaIA = data.choices[0].message.content;
            
            document.getElementById("thinking-bubble").remove();
            historial.push({ role: "assistant", content: respuestaIA });
            guardarEnNube();
            renderizarChat();
        } catch (e) { console.error(e); }
    }

    const renderizarChat = () => {
        chat.innerHTML = ""; 
        historial.forEach(msg => {
            if (msg.role === "system") return;
            const div = document.createElement("div");
            div.className = msg.role === "user" ? "user" : "ai";
            div.innerHTML = msg.role === "user" ? `<b>Tú:</b> ${msg.content}` : formatearTexto(msg.content);
            chat.appendChild(div);
        });
        scrollAbajo();
    };

    window.resetChat = async () => { 
        if (confirm("¿Borrar historial?")) {
            historial = [systemPrompt];
            renderizarChat();
            await guardarEnNube();
        }
    };

    input.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });
    window.sendMessage = sendMessage;
});
