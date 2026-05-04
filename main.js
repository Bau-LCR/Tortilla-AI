document.addEventListener("DOMContentLoaded", function() {
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");
    const loginOverlay = document.getElementById("login-overlay");
    const logoutBtn = document.getElementById("logout-btn");

    const systemPrompt = { role: "system", content: "Configurado en el servidor." };
    
    let currentUser = null;
    let historial = [systemPrompt];
    
    const formatearTexto = (texto) => {
        return texto.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    };

    const scrollAbajo = () => {
        chat.scrollTop = chat.scrollHeight;
    };

    // --- FUNCIONES DE NUBE (FIRESTORE) ---

    async function guardarEnNube() {
        if (!currentUser) return;
        const { doc, setDoc } = window.firestore;
        try {
            await setDoc(doc(window.db, "chats", currentUser.uid), {
                mensajes: historial,
                updatedAt: Date.now()
            });
        } catch (e) {
            console.error("Error guardando en nube:", e);
        }
    }

    async function cargarDeNube(uid) {
        // Feedback visual de carga
        chat.innerHTML = "<div class='ai'>Sincronizando tus mensajes con la nube...</div>";
        
        const { doc, getDoc } = window.firestore;
        try {
            const docRef = doc(window.db, "chats", uid);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                historial = docSnap.data().mensajes;
            } else {
                historial = [systemPrompt];
            }
            renderizarChat();
        } catch (e) {
            console.error("Error cargando de nube:", e);
            chat.innerHTML = "<div class='ai' style='color: #ff4b4b;'>Error al sincronizar historial.</div>";
        }
    }

    // --- LÓGICA DE FIREBASE ---

    window.login = async () => {
        if (!window.auth) return;
        try {
            await window.signInWithPopup(window.auth, window.provider);
        } catch (error) {
            console.error("Error login:", error);
        }
    };

    window.logout = () => {
        if (window.auth) {
            // Animación sutil antes de salir
            document.body.style.opacity = "0.5";
            window.signOut(window.auth).then(() => {
                location.reload(); // Recargamos para limpiar todo el estado
            });
        }
    };

    const renderizarChat = () => {
        chat.innerHTML = ""; 
        if (historial.length <= 1) {
            const nombre = currentUser ? currentUser.displayName.split(' ')[0] : "";
            chat.innerHTML = `<div class="ai">Hola <b>${nombre}</b>, soy Cut-real AI. Tus mensajes están sincronizados.</div>`;
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
                    loginOverlay.style.opacity = "0";
                    setTimeout(() => loginOverlay.style.display = "none", 300);
                    
                    if (logoutBtn) logoutBtn.style.display = "block";
                    cargarDeNube(user.uid); 
                } else {
                    currentUser = null;
                    loginOverlay.style.display = "flex";
                    setTimeout(() => loginOverlay.style.opacity = "1", 10);
                    if (logoutBtn) logoutBtn.style.display = "none";
                    chat.innerHTML = "";
                    historial = [systemPrompt];
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

            guardarEnNube();

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

    window.resetChat = async () => { 
        if (!currentUser) return;
        if (confirm("¿Deseas borrar tu conversación de la nube?")) {
            historial = [systemPrompt];
            renderizarChat();
            await guardarEnNube();
        }
    };
});
