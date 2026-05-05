document.addEventListener("DOMContentLoaded", function() {
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");
    const loginOverlay = document.getElementById("login-overlay");
    const splashScreen = document.getElementById("splash-screen");

    const ADMIN_UID = "8qZG7egWbIeMy7HqtwkKEdLasMw2";
    let mensajesSesion = 0;
    let debugMode = false;

    // --- LÓGICA SPLASH ---
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

    // --- PANEL ADMIN AVANZADO ---
    window.openAdmin = () => {
        const info = `
--- CONTROL MAESTRO CUT-REAL AI ---
Admin: ${currentUser.displayName}
UID: ${currentUser.uid}
Msgs Sesión: ${mensajesSesion}
Total Historial: ${historial.length - 1}
Modo Debug: ${debugMode ? "ACTIVADO" : "DESACTIVADO"}

OPCIONES DISPONIBLES:
1. DESCARGAR BACKUP (JSON)
2. LIMPIAR CACHÉ LOCAL
3. ALTERNAR MODO DEBUG
4. VER LOGS TÉCNICOS
        `;
        
        const res = prompt(info + "\nEscribe el número de la opción:");

        switch(res) {
            case "1":
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(historial));
                const dl = document.createElement('a');
                dl.setAttribute("href", dataStr);
                dl.setAttribute("download", `cutreal_backup_${Date.now()}.json`);
                dl.click();
                break;
            case "2":
                if(confirm("¿Limpiar caché? Esto recargará la app.")) location.reload();
                break;
            case "3":
                debugMode = !debugMode;
                alert("Modo Debug: " + (debugMode ? "ON. Ahora verás errores detallados en consola." : "OFF"));
                break;
            case "4":
                alert("Último historial registrado:\n" + JSON.stringify(historial.slice(-2), null, 2));
                break;
            default:
                if (res !== null) alert("Opción no válida");
        }
    };

    // --- FIREBASE LOGIC ---
    window.login = async () => {
        try { await window.signInWithPopup(window.auth, window.provider); } 
        catch (e) { console.error("Error login:", e); }
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

    // --- CHAT LOGIC ---
    async function sendMessage() {
        const msg = input.value.trim();
        if (!msg || !currentUser) return;

        mensajesSesion++; // Contador para el admin
        historial.push({ role: "user", content: msg });
        
        const userDiv = document.createElement("div");
        userDiv.className = "user";
        userDiv.innerHTML = `<b>Tú:</b> ${formatearTexto(msg)}`;
        chat.appendChild(userDiv);
        input.value = "";
        input.style.height = "auto";
        scrollAbajo();

        const thinking = document.createElement("div");
        thinking.className = "ai";
        thinking.id = "thinking-bubble";
        thinking.textContent = "Pensando...";
        chat.appendChild(thinking);

        try {
            const res = await fetch("/api/chat", { 
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mensajes: historial }) 
            });
            const data = await res.json();
            
            const respuestaIA = data.choices[0].message.content;
            historial.push({ role: "assistant", content: respuestaIA });
            guardarEnNube();

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
                }
            }, 5);
        } catch (e) {
            if(debugMode) console.error("DEBUG:", e);
            document.getElementById("thinking-bubble").remove();
            chat.innerHTML += `<div class='ai' style='color: #ff4b4b;'><b>Error:</b> ${e.message}</div>`;
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
        const nombre = currentUser ? currentUser.displayName.split(' ')[0] : "";
        if (historial.length <= 1) {
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

    input.addEventListener("input", function() { this.style.height = "auto"; this.style.height = (this.scrollHeight) + "px"; });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    window.sendMessage = sendMessage;
    window.resetChat = async () => { 
        if (confirm("¿Borrar conversación?")) { historial = [systemPrompt]; renderizarChat(); await guardarEnNube(); }
    };
});
