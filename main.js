document.addEventListener("DOMContentLoaded", function() {
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");
    const loginOverlay = document.getElementById("login-overlay");
    const splashScreen = document.getElementById("splash-screen");

    const ADMIN_UID = "8qZG7egWbIeMy7HqtwkKEdLasMw2";
    let debugMode = false;

    // --- SPLASH SCREEN ---
    setTimeout(() => {
        if (splashScreen) {
            splashScreen.style.opacity = "0";
            splashScreen.style.transition = "opacity 0.8s ease";
            setTimeout(() => splashScreen.style.display = "none", 800);
        }
    }, 1500);

    const systemPrompt = { role: "system", content: "Configurado en el servidor." };
    let currentUser = null;
    let historial = [systemPrompt];
    
    const formatearTexto = (texto) => {
        return texto.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    };

    const scrollAbajo = () => { chat.scrollTop = chat.scrollHeight; };

    // --- PANEL ADMIN MODERNO ---
    window.openAdmin = () => {
        const menu = `MENU ADMIN CUT-REAL AI:
1. Descargar copia de seguridad (JSON)
2. Ver ID de sesión actual
3. Alternar Modo Debug (Consola)
4. Forzar Sincronización Nube`;
        
        const res = prompt(menu);
        if (res === "1") {
            const blob = new Blob([JSON.stringify(historial)], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `admin_backup_${Date.now()}.json`;
            a.click();
        } else if (res === "3") {
            debugMode = !debugMode;
            alert("Modo Debug: " + (debugMode ? "ON" : "OFF"));
        }
    };

    // --- FIREBASE ---
    window.login = async () => {
        try { await window.signInWithPopup(window.auth, window.provider); } 
        catch (e) { console.error(e); }
    };

    window.logout = () => {
        document.body.style.opacity = "0.5";
        window.signOut(window.auth).then(() => location.reload());
    };

    const checkUser = () => {
        if (window.auth) {
            window.auth.onAuthStateChanged((user) => {
                const logoutBtn = document.getElementById("logout-btn");
                const resetBtn = document.getElementById("resetChat");
                const adminBtn = document.getElementById("admin-btn");

                if (user) {
                    currentUser = user;
                    loginOverlay.style.display = "none";
                    logoutBtn.style.display = "block";
                    resetBtn.style.display = "block";
                    adminBtn.style.display = (user.uid === ADMIN_UID) ? "block" : "none";
                    cargarDeNube(user.uid); 
                } else {
                    currentUser = null;
                    loginOverlay.style.display = "flex";
                }
            });
        } else { setTimeout(checkUser, 500); }
    };
    checkUser();

    // --- CHAT ---
    async function sendMessage() {
        const msg = input.value.trim();
        if (!msg || !currentUser) return;

        historial.push({ role: "user", content: msg });
        renderizarChat();
        
        input.value = "";
        input.style.height = "auto";

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
            document.getElementById("thinking-bubble").textContent = "Error de conexión.";
        }
    }

    async function guardarEnNube() {
        const { doc, setDoc } = window.firestore;
        await setDoc(doc(window.db, "chats", currentUser.uid), { mensajes: historial, updatedAt: Date.now() });
    }

    async function cargarDeNube(uid) {
        const { doc, getDoc } = window.firestore;
        const docSnap = await getDoc(doc(window.db, "chats", uid));
        if (docSnap.exists()) historial = docSnap.data().mensajes;
        renderizarChat();
    }

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

    input.addEventListener("input", function() { this.style.height = "auto"; this.style.height = (this.scrollHeight) + "px"; });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    window.sendMessage = sendMessage;
    window.resetChat = async () => { 
        if (confirm("¿Borrar historial?")) { historial = [systemPrompt]; renderizarChat(); await guardarEnNube(); }
    };
});
