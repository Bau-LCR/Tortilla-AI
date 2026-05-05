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

    const systemPrompt = { role: "system", content: "Configurado en el servidor." };
    let currentUser = null;
    let historial = [systemPrompt];
    
    const formatearTexto = (texto) => {
        return texto.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    };

    const scrollAbajo = () => { chat.scrollTop = chat.scrollHeight; };

    // --- NUEVO PANEL DE ADMINISTRACIÓN AVANZADO ---
    window.openAdmin = () => {
        const menu = `--- PANEL MAESTRO CUT-REAL ---
1. BACKUP: Descargar historial (JSON)
2. DEBUG: Alternar registros en consola
3. INTERFAZ: Cambiar color de fondo (Temporal)
4. INFO: Ver Metadatos del usuario
5. RECARGAR: Limpiar caché y refrescar
        
Elige una opción (1-5):`;

        const opcion = prompt(menu);

        switch(opcion) {
            case "1":
                const data = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(historial));
                const link = document.createElement('a');
                link.setAttribute("href", data);
                link.setAttribute("download", "cutreal_admin_backup.json");
                link.click();
                break;
            case "2":
                debugMode = !debugMode;
                alert("Modo Debug: " + (debugMode ? "ACTIVADO" : "DESACTIVADO"));
                break;
            case "3":
                const color = prompt("Introduce un color HEX o nombre (ej: #1a0000 o blue):");
                if(color) document.body.style.background = color;
                break;
            case "4":
                alert(`ID: ${currentUser.uid}\nNombre: ${currentUser.displayName}\nEmail: ${currentUser.email}\nTotal Historial: ${historial.length}`);
                break;
            case "5":
                if(confirm("¿Recargar aplicación?")) location.reload();
                break;
            default:
                if(opcion) alert("Opción no válida.");
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
        } catch (e) {
            console.error("Error guardando:", e);
        }
    }

    async function cargarDeNube(uid) {
        chat.innerHTML = "<div class='ai'>Sincronizando...</div>";
        const { doc, getDoc } = window.firestore;
        try {
            const docSnap = await getDoc(doc(window.db, "chats", uid));
            historial = docSnap.exists() ? docSnap.data().mensajes : [systemPrompt];
            renderizarChat();
        } catch (e) {
            chat.innerHTML = "<div class='ai' style='color: #ff4b4b;'>Error de red.</div>";
        }
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
        if (historial.length <= 1) {
            const nombre = currentUser ? currentUser.displayName.split(' ')[0] : "";
            chat.innerHTML = `<div class="ai">Hola <b>${nombre}</b>, soy Cut-real AI.</div>`;
        } else {
            historial.forEach(msg => {
                if (msg.role === "system") return;
                const div = document.createElement("div");
                div.className = msg.role === "user" ? "user" : "ai";
                div.innerHTML = msg.role === "user" ? `<b>Tú:</b> ${formatearTexto(msg.content)}` : formatearTexto(msg.content);
                chat.appendChild(div);
            });
        }
        scrollAbajo();
    };

    const checkUser = () => {
        if (window.auth) {
            window.auth.onAuthStateChanged((user) => {
                const logoutBtn = document.getElementById("logout-btn");
                const resetBtn = document.getElementById("resetChat");
                const adminBtn = document.getElementById("admin-btn");
                const loginOverlay = document.getElementById("login-overlay");

                if (user) {
                    currentUser = user;
                    loginOverlay.style.display = "none";
                    if (logoutBtn) logoutBtn.style.display = "block";
                    if (resetBtn) resetBtn.style.display = "block";
                    if (adminBtn) adminBtn.style.display = (user.uid === ADMIN_UID) ? "block" : "none";
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
        input.value = "";
        input.style.height = "auto";

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
        } catch (e) {
            if(debugMode) console.log("Error API:", e);
            document.getElementById("thinking-bubble").textContent = "Error.";
        }
    }

    input.addEventListener("input", function() {
        this.style.height = "auto";
        this.style.height = (this.scrollHeight) + "px";
    });

    input.addEventListener("keydown", (e) => { 
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    window.sendMessage = sendMessage;
    window.resetChat = async () => { 
        if (confirm("¿Borrar historial?")) {
            historial = [systemPrompt];
            renderizarChat();
            await guardarEnNube();
        }
    };
});
