document.addEventListener("DOMContentLoaded", function() {
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");
    const loginOverlay = document.getElementById("login-overlay");
    const splashScreen = document.getElementById("splash-screen");

    const ADMIN_UID = "8qZG7egWbIeMy7HqtwkKEdLasMw2";
    let debugMode = false;

    setTimeout(() => {
        if (splashScreen) {
            splashScreen.style.opacity = "0";
            splashScreen.style.transition = "opacity 0.8s ease";
            setTimeout(() => splashScreen.style.display = "none", 800);
        }
    }, 1500);

    let systemPrompt = { role: "system", content: "Eres Cut-real AI, una inteligencia avanzada y servicial." };
    let currentUser = null;
    let historial = [systemPrompt];
    
    const formatearTexto = (texto) => {
        return texto.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    };

    const scrollAbajo = () => { chat.scrollTop = chat.scrollHeight; };

    // --- PANEL ADMIN PRO ---
    window.openAdmin = () => {
        const menu = `MENU ADMIN CUT-REAL AI
1. Backup JSON (Descargar historial)
2. Cambiar Personalidad (System Prompt)
3. Inyectar mensaje de IA (Fake response)
4. Alternar Modo Debug
5. Ver estadísticas del usuario
6. Cambiar color de acento (UI)

Elige una opción:`;

        const res = prompt(menu);
        if (res === "1") {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(historial));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "cutreal_log.json");
            downloadAnchorNode.click();
        } else if (res === "2") {
            const newPrompt = prompt("Nueva personalidad para la IA:", systemPrompt.content);
            if(newPrompt) {
                systemPrompt.content = newPrompt;
                historial[0] = systemPrompt;
                alert("Personalidad actualizada.");
            }
        } else if (res === "3") {
            const fakeMsg = prompt("¿Qué quieres que diga la IA ahora mismo?");
            if(fakeMsg) {
                historial.push({ role: "assistant", content: fakeMsg });
                renderizarChat();
            }
        } else if (res === "4") {
            debugMode = !debugMode;
            alert("Modo Debug: " + (debugMode ? "ON" : "OFF"));
        } else if (res === "5") {
            alert(`USER: ${currentUser.displayName}\nUID: ${currentUser.uid}\nMSG_COUNT: ${historial.length - 1}`);
        } else if (res === "6") {
            const color = prompt("Color HEX (ej: #ff00ff):");
            if(color) document.documentElement.style.setProperty('--primary-red', color);
        }
    };

    async function guardarEnNube() {
        if (!currentUser) return;
        const { doc, setDoc } = window.firestore;
        try {
            await setDoc(doc(window.db, "chats", currentUser.uid), {
                mensajes: historial,
                updatedAt: Date.now()
            });
        } catch (e) { if(debugMode) console.error("Cloud Error:", e); }
    }

    async function cargarDeNube(uid) {
        const { doc, getDoc } = window.firestore;
        try {
            const docSnap = await getDoc(doc(window.db, "chats", uid));
            if (docSnap.exists()) historial = docSnap.data().mensajes;
            renderizarChat();
        } catch (e) { console.error(e); }
    }

    window.login = async () => {
        try { await window.signInWithPopup(window.auth, window.provider); } 
        catch (e) { console.error(e); }
    };

    window.logout = () => {
        document.body.style.opacity = "0.5";
        window.signOut(window.auth).then(() => location.reload());
    };

    const renderizarChat = () => {
        chat.innerHTML = ""; 
        historial.forEach(msg => {
            if (msg.role === "system") return;
            const div = document.createElement("div");
            div.className = msg.role === "user" ? "user" : "ai";
            div.innerHTML = msg.role === "user" ? `<b>Tú:</b> ${formatearTexto(msg.content)}` : formatearTexto(msg.content);
            chat.appendChild(div);
        });
        scrollAbajo();
    };

    const checkUser = () => {
        if (window.auth) {
            window.auth.onAuthStateChanged((user) => {
                const btns = ["logout-btn", "resetChat", "admin-btn"];
                if (user) {
                    currentUser = user;
                    loginOverlay.style.display = "none";
                    document.getElementById("logout-btn").style.display = "block";
                    document.getElementById("resetChat").style.display = "block";
                    document.getElementById("admin-btn").style.display = (user.uid === ADMIN_UID) ? "block" : "none";
                    cargarDeNube(user.uid); 
                } else {
                    currentUser = null;
                    loginOverlay.style.display = "flex";
                }
            });
        } else { setTimeout(checkUser, 500); }
    };
    checkUser();

    async function sendMessage() {
        const msg = input.value.trim();
        if (!msg || !currentUser) return;
        historial.push({ role: "user", content: msg });
        renderizarChat();
        input.value = ""; input.style.height = "auto";
        
        const thinking = document.createElement("div");
        thinking.className = "ai";
        thinking.id = "thinking-bubble";
        thinking.textContent = "Analizando...";
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
        } catch (e) {
            if(debugMode) console.log(e);
            document.getElementById("thinking-bubble").textContent = "Error de respuesta.";
        }
    }

    input.addEventListener("input", function() { this.style.height = "auto"; this.style.height = (this.scrollHeight) + "px"; });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    window.sendMessage = sendMessage;
    window.resetChat = async () => { 
        if (confirm("¿Borrar historial?")) {
            historial = [systemPrompt];
            renderizarChat();
            await guardarEnNube();
        }
    };
});
