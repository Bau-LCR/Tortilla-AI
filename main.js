document.addEventListener("DOMContentLoaded", function() {
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");
    const splashScreen = document.getElementById("splash-screen");
    const MI_UID_ADMIN = "8qZG7egWbIeMy7HqtwkKEdLasMw2";

    // --- 1. LÓGICA DEL SPLASH SCREEN (SALIDA GARANTIZADA) ---
    const hideSplash = () => {
        if (splashScreen) {
            splashScreen.style.opacity = "0";
            splashScreen.style.transition = "opacity 0.8s ease";
            setTimeout(() => {
                splashScreen.style.display = "none";
            }, 800);
        }
    };
    // Se quita a los 2.5 segundos pase lo que pase
    setTimeout(hideSplash, 2500);

    let currentUser = null;
    const systemPrompt = { role: "system", content: "Configurado en el servidor." };
    let historial = [systemPrompt];
    
    const formatearTexto = (texto) => {
        return texto.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    };

    const scrollAbajo = () => {
        chat.scrollTop = chat.scrollHeight;
    };

    // --- 2. LÓGICA DE FIREBASE Y ADMIN ---
    const checkUser = () => {
        if (window.auth) {
            window.auth.onAuthStateChanged((user) => {
                const logoutBtn = document.getElementById("logout-btn");
                const resetBtn = document.getElementById("resetChat");
                const loginOverlay = document.getElementById("login-overlay");
                const adminBtn = document.getElementById('admin-access');

                if (user) {
                    currentUser = user;
                    loginOverlay.style.display = "none";
                    if (logoutBtn) logoutBtn.style.display = "block";
                    if (resetBtn) resetBtn.style.display = "block";
                    
                    // Verificación de Admin
                    if (user.uid === MI_UID_ADMIN) {
                        if (adminBtn) adminBtn.style.display = 'block';
                        console.log("Admin detectado");
                    }
                    
                    cargarDeNube(user.uid); 
                } else {
                    currentUser = null;
                    loginOverlay.style.display = "flex";
                    if (logoutBtn) logoutBtn.style.display = "none";
                    if (resetBtn) resetBtn.style.display = "none";
                    if (adminBtn) adminBtn.style.display = 'none';
                }
            });
        } else {
            setTimeout(checkUser, 500);
        }
    };
    checkUser();

    // --- 3. FUNCIONES DE CHAT ---
    async function sendMessage() {
        const msg = input.value.trim();
        if (!msg || !currentUser) return;

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
        scrollAbajo();

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
                    scrollAbajo();
                }
            }, 5);
        } catch (e) {
            document.getElementById("thinking-bubble")?.remove();
            chat.innerHTML += `<div class='ai' style='color: #ff4b4b;'><b>Error:</b> ${e.message}</div>`;
        }
    }

    // --- 4. PANEL DE ADMIN ---
    window.toggleAdminPanel = function() {
        const panel = document.getElementById('admin-panel');
        const isVisible = panel.style.display === 'flex';
        panel.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) {
            document.getElementById('user-count').innerText = "ROOT_ACTIVE";
        }
    };

    // --- 5. EVENTOS ---
    input.addEventListener("input", function() {
        this.style.height = "auto";
        this.style.height = (this.scrollHeight) + "px";
    });

    input.addEventListener("keydown", (e) => { 
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage(); 
        }
    });

    window.sendMessage = sendMessage;
    window.login = async () => await window.signInWithPopup(window.auth, window.provider);
    window.logout = () => window.signOut(window.auth).then(() => location.reload());
    
    // Funciones Firestore
    async function guardarEnNube() {
        if (!currentUser) return;
        await window.firestore.setDoc(window.firestore.doc(window.db, "chats", currentUser.uid), {
            mensajes: historial, updatedAt: Date.now()
        });
    }

    async function cargarDeNube(uid) {
        const docSnap = await window.firestore.getDoc(window.firestore.doc(window.db, "chats", uid));
        if (docSnap.exists()) {
            historial = docSnap.data().mensajes;
        }
        renderizarChat();
    }

    const renderizarChat = () => {
        chat.innerHTML = ""; 
        if (historial.length <= 1) {
            const nombre = currentUser ? currentUser.displayName.split(' ')[0] : "Bautista";
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
});
