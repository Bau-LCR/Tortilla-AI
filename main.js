document.addEventListener("DOMContentLoaded", function() {
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");
    const loginOverlay = document.getElementById("login-overlay");
    const splashScreen = document.getElementById("splash-screen");

    const ADMIN_UID = "8qZG7egWbIeMy7HqtwkKEdLasMw2";
    let debugMode = false;
    let readOnlyMode = false;

    setTimeout(() => {
        if (splashScreen) {
            splashScreen.style.opacity = "0";
            splashScreen.style.transition = "opacity 0.8s ease";
            setTimeout(() => splashScreen.style.display = "none", 800);
        }
    }, 1500);

    let systemPrompt = { role: "system", content: "Configurado en el servidor." };
    let currentUser = null;
    let historial = [systemPrompt];
    
    const formatearTexto = (texto) => {
        return texto.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    };

    const scrollAbajo = () => { chat.scrollTop = chat.scrollHeight; };

    // --- PANEL ADMIN EXPANDIDO ---
    window.openAdmin = () => {
        const menu = `CENTRAL DE CONTROL CUT-REAL AI
1. BACKUP: Descargar historial (JSON)
2. PROMPT: Cambiar personalidad IA
3. INYECTAR: Forzar respuesta de IA
4. SEGURIDAD: Alternar Modo Lectura (Bloquea envíos)
5. DEBUG: Activar registros técnicos
6. ESTADÍSTICAS: Auditoría de usuario
7. UI: Cambiar color de acento
8. TEST: Simular error de servidor
        
Selecciona una opción:`;

        const opcion = prompt(menu);

        switch(opcion) {
            case "1":
                const blob = new Blob([JSON.stringify(historial, null, 2)], {type: "application/json"});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `backup_${currentUser.uid}.json`; a.click();
                break;
            case "2":
                const p = prompt("Nuevo System Prompt:", systemPrompt.content);
                if(p) { systemPrompt.content = p; historial[0] = systemPrompt; alert("Personalidad cambiada."); }
                break;
            case "3":
                const msg = prompt("Texto que la IA dirá ahora:");
                if(msg) { historial.push({ role: "assistant", content: msg }); renderizarChat(); }
                break;
            case "4":
                readOnlyMode = !readOnlyMode;
                input.disabled = readOnlyMode;
                alert("Modo Lectura: " + (readOnlyMode ? "ACTIVADO (Chat bloqueado)" : "DESACTIVADO"));
                break;
            case "5":
                debugMode = !debugMode;
                alert("Modo Debug: " + (debugMode ? "ON" : "OFF"));
                break;
            case "6":
                alert(`SESIÓN ACTIVA:\nUser: ${currentUser.displayName}\nUID: ${currentUser.uid}\nMensajes: ${historial.length - 1}\nEstado: ${window.navigator.onLine ? 'Online' : 'Offline'}`);
                break;
            case "7":
                const color = prompt("Color Hexadecimal (ej: #ff00ff):");
                if(color) document.documentElement.style.setProperty('--primary-red', color);
                break;
            case "8":
                chat.innerHTML += `<div class='ai' style='color: #ff4b4b; border: 1px solid #ff4b4b;'><b>TEST ERROR:</b> Fallo de simulación del servidor (500)</div>`;
                scrollAbajo();
                break;
            default:
                if(opcion) alert("Comando no reconocido.");
        }
    };

    async function guardarEnNube() {
        if (!currentUser || readOnlyMode) return;
        const { doc, setDoc } = window.firestore;
        try {
            await setDoc(doc(window.db, "chats", currentUser.uid), {
                mensajes: historial,
                updatedAt: Date.now()
            });
        } catch (e) { if(debugMode) console.error("Error Firestore:", e); }
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
                if (user) {
                    currentUser = user;
                    document.getElementById("login-overlay").style.display = "none";
                    document.getElementById("logout-btn").style.display = "block";
                    document.getElementById("resetChat").style.display = "block";
                    document.getElementById("admin-btn").style.display = (user.uid === ADMIN_UID) ? "block" : "none";
                    cargarDeNube(user.uid); 
                } else {
                    currentUser = null;
                    document.getElementById("login-overlay").style.display = "flex";
                }
            });
        } else { setTimeout(checkUser, 500); }
    };
    checkUser();

    async function sendMessage() {
        if (readOnlyMode) return;
        const msg = input.value.trim();
        if (!msg || !currentUser) return;

        historial.push({ role: "user", content: msg });
        renderizarChat();
        input.value = ""; input.style.height = "auto";
        
        const thinking = document.createElement("div");
        thinking.className = "ai";
        thinking.id = "thinking-bubble";
        thinking.textContent = "Procesando...";
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
            if(debugMode) console.log("API Error:", e);
            document.getElementById("thinking-bubble").textContent = "Error de conexión.";
        }
    }

    input.addEventListener("input", function() { this.style.height = "auto"; this.style.height = (this.scrollHeight) + "px"; });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    window.sendMessage = sendMessage;
    window.resetChat = async () => { 
        if (confirm("¿Limpiar historial?")) {
            historial = [systemPrompt];
            renderizarChat();
            await guardarEnNube();
        }
    };
});
