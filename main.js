document.addEventListener("DOMContentLoaded", function() {
    const splash = document.getElementById("splash-screen");
    const loginOverlay = document.getElementById("login-overlay");
    const chatBox = document.getElementById("chat");
    const inputField = document.getElementById("input");

    // --- EFECTO SPLASH SCREEN ---
    setTimeout(() => {
        if (splash) {
            splash.style.opacity = "0";
            setTimeout(() => splash.style.display = "none", 1000);
        }
    }, 2000);

    let historial = [{ role: "system", content: "Configurado en el servidor." }];
    let currentUser = null;

    // --- MANEJO DE USUARIO ---
    const checkUser = () => {
        if (window.auth) {
            window.auth.onAuthStateChanged((user) => {
                const logoutBtn = document.getElementById("logout-btn");
                const resetBtn = document.getElementById("resetChat");

                if (user) {
                    currentUser = user;
                    loginOverlay.style.display = "none";
                    logoutBtn.style.display = "block";
                    resetBtn.style.display = "block";
                    cargarDeNube(user.uid);
                } else {
                    currentUser = null;
                    loginOverlay.style.display = "flex";
                    logoutBtn.style.display = "none";
                    resetBtn.style.display = "none";
                }
            });
        } else { setTimeout(checkUser, 100); }
    };
    checkUser();

    // --- FUNCIONES CORE ---
    window.login = async () => { await window.signInWithPopup(window.auth, window.window.provider); };
    
    window.logout = () => {
        if (confirm("¿Cerrar sesión?")) {
            window.auth.signOut().then(() => location.reload());
        }
    };

    window.resetChat = async () => {
        if (confirm("¿Estás seguro de borrar toda la conversación?")) {
            historial = [{ role: "system", content: "Configurado." }];
            renderChat();
            await guardarEnNube();
        }
    };

    const renderChat = () => {
        chatBox.innerHTML = "";
        historial.forEach(m => {
            if (m.role === "system") return;
            const div = document.createElement("div");
            div.className = m.role === "user" ? "user" : "ai";
            div.innerHTML = m.content;
            chatBox.appendChild(div);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    };

    window.sendMessage = async () => {
        const text = inputField.value.trim();
        if (!text) return;
        historial.push({ role: "user", content: text });
        inputField.value = "";
        renderChat();
        // Aquí iría tu fetch a la API...
    };

    async function guardarEnNube() {
        if (!currentUser) return;
        await window.firestore.setDoc(window.firestore.doc(window.db, "chats", currentUser.uid), { mensajes: historial });
    }

    async function cargarDeNube(uid) {
        const docSnap = await window.firestore.getDoc(window.firestore.doc(window.db, "chats", uid));
        if (docSnap.exists()) {
            historial = docSnap.data().mensajes;
            renderChat();
        }
    }
});
