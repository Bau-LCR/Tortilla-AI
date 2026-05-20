// Configurar PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// ===== CONSTANTES =====
const ADMIN_UID = "8qZG7egWbIeMy7HqtwkKEdLasMw2";
const TERMS_KEY = "cutreal_terms_accepted";

// ===== ESTADO GLOBAL =====
let attachedFile = null;

document.addEventListener("DOMContentLoaded", function () {
    const chat            = document.getElementById("chat");
    const input           = document.getElementById("input");
    const loginOverlay    = document.getElementById("login-overlay");
    const termsOverlay    = document.getElementById("terms-overlay");
    const logoutBtn       = document.getElementById("logout-btn");
    const splashScreen    = document.getElementById("splash-screen");
    const fileInput       = document.getElementById("file-input");
    const attachBtn       = document.getElementById("attach-btn");
    const filePreviewBar  = document.getElementById("file-preview");
    const filePreviewName = document.getElementById("file-preview-name");
    const adminBtn        = document.getElementById("admin-btn");

    // ===== SPLASH SCREEN =====
    setTimeout(() => {
        if (!splashScreen) return;
        splashScreen.style.opacity = "0";
        splashScreen.style.transition = "opacity 0.6s ease";
        setTimeout(() => (splashScreen.style.display = "none"), 620);
    }, 1900);

    const systemPrompt = { role: "system", content: "Configurado en el servidor." };
    let currentUser = null;
    let historial   = [systemPrompt];

    // ===== FORMATEO MARKDOWN =====
    const escapeHtml = (str) =>
        str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const formatearTexto = (texto) => {
        if (!texto) return "";
        texto = texto.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
            `<pre><code>${escapeHtml(code.trim())}</code></pre>`
        );
        texto = texto.replace(/`([^`\n]+)`/g, "<code>$1</code>");
        texto = texto.replace(/^### (.+)$/gm, "<h3>$1</h3>");
        texto = texto.replace(/^## (.+)$/gm,  "<h2>$1</h2>");
        texto = texto.replace(/^# (.+)$/gm,   "<h1>$1</h1>");
        texto = texto.replace(/\*\*\*(.+?)\*\*\*/g, "<b><em>$1</em></b>");
        texto = texto.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
        texto = texto.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
        texto = texto.replace(
            /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
        );
        texto = texto.replace(
            /(^|[^"=>])(https?:\/\/[^\s<>"]+)/g,
            '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>'
        );
        texto = texto.replace(/^[\-\*] (.+)$/gm, "<li>$1</li>");
        texto = texto.replace(/((<li>.*<\/li>)\n?)+/g, (m) => `<ul>${m}</ul>`);
        texto = texto.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
        texto = texto.replace(/^---$/gm,
            '<hr style="border:none;border-top:1px solid rgba(255,59,59,0.18);margin:12px 0;">');
        texto = texto.replace(/\n(?!<\/?(ul|ol|li|pre|code|h[123]|hr))/g, "<br>");
        return texto;
    };

    const scrollAbajo = () =>
        requestAnimationFrame(() => (chat.scrollTop = chat.scrollHeight));

    // ===== TÉRMINOS Y CONDICIONES =====
    window.acceptTerms = () => {
        localStorage.setItem(TERMS_KEY, "accepted");
        termsOverlay.style.display = "none";
        // Mostrar login después de aceptar términos
        loginOverlay.style.display = "flex";
    };

    window.declineTerms = () => {
        termsOverlay.style.display = "none";
        // Mostrar mensaje de rechazo y mantener pantalla bloqueada
        document.body.innerHTML = `
            <div style="
                display:flex;flex-direction:column;align-items:center;justify-content:center;
                min-height:100vh;background:#080808;color:#888;font-family:Inter,sans-serif;
                text-align:center;padding:40px;gap:20px;
            ">
                <div style="font-size:48px;">🚫</div>
                <h2 style="color:#ff3b3b;margin:0;">Acceso denegado</h2>
                <p style="max-width:400px;line-height:1.7;">
                    Para usar Cut-real AI debés aceptar los Términos y Condiciones.<br>
                    Si cambiás de opinión, recargá la página.
                </p>
                <button onclick="location.reload()" style="
                    background:linear-gradient(140deg,#ff3b3b,#cc0000);color:white;border:none;
                    padding:12px 28px;border-radius:999px;font-size:14px;cursor:pointer;
                    font-family:Inter,sans-serif;font-weight:600;
                ">Volver a intentar</button>
            </div>
        `;
    };

    // ===== LÓGICA DE ARCHIVOS ADJUNTOS =====
    if (fileInput) {
        fileInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const fileName = file.name;
            const fileType = file.type;

            attachBtn.textContent = "⏳";
            attachBtn.style.color = "#ff3b3b";

            try {
                if (fileType === "application/pdf") {
                    const arrayBuffer = await file.arrayBuffer();
                    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                    let extractedText = "";
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page    = await pdf.getPage(i);
                        const content = await page.getTextContent();
                        extractedText +=
                            content.items.map((item) => item.str).join(" ") + "\n";
                    }
                    attachedFile = {
                        type: "pdf",
                        content: extractedText.substring(0, 20000),
                        name: fileName,
                    };
                    showFilePreview("📄 " + fileName);
                }
                else if (
                    fileName.toLowerCase().endsWith(".docx") ||
                    fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                ) {
                    if (typeof mammoth === "undefined") {
                        throw new Error("Mammoth.js no está disponible. Recarga la página.");
                    }
                    const arrayBuffer = await file.arrayBuffer();
                    const result = await mammoth.extractRawText({ arrayBuffer });
                    attachedFile = {
                        type: "docx",
                        content: result.value.substring(0, 20000),
                        name: fileName,
                    };
                    showFilePreview("📝 " + fileName);
                }
                else if (fileType.startsWith("image/")) {
                    const base64 = await fileToBase64(file);
                    attachedFile = {
                        type: "image",
                        content: base64,
                        name: fileName,
                        mediaType: fileType,
                    };
                    showFilePreview("🖼️ " + fileName);
                }
                else {
                    alert("Formato no soportado.\nUsa PDF (.pdf), Word (.docx) o imagen (JPG, PNG, WEBP).");
                    resetAttachBtn();
                    return;
                }

                attachBtn.textContent = "✅";
                attachBtn.style.color = "#4caf50";

            } catch (error) {
                console.error("Error al leer archivo:", error);
                alert("Error al procesar el archivo:\n" + error.message);
                resetAttachBtn();
                attachedFile = null;
                filePreviewBar.style.display = "none";
            }
        });
    }

    const fileToBase64 = (file) =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result.split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

    const showFilePreview = (label) => {
        filePreviewName.textContent = label;
        filePreviewBar.style.display = "flex";
    };

    const resetAttachBtn = () => {
        attachBtn.textContent = "📎";
        attachBtn.style.color = "";
    };

    window.removeAttachment = () => {
        attachedFile         = null;
        fileInput.value      = "";
        filePreviewBar.style.display = "none";
        resetAttachBtn();
    };

    // ===== FIRESTORE =====
    async function guardarEnNube() {
        if (!currentUser) return;
        const { doc, setDoc } = window.firestore;

        const historialParaGuardar = historial.map((msg) => {
            if (Array.isArray(msg.content)) {
                const textos = msg.content
                    .filter((c) => c.type === "text")
                    .map((c) => c.text)
                    .join(" ");
                return { role: msg.role, content: (textos || "Imagen") + " [📷 imagen adjunta]" };
            }
            return msg;
        });

        try {
            await setDoc(doc(window.db, "chats", currentUser.uid), {
                mensajes: historialParaGuardar,
                updatedAt: Date.now(),
                userEmail: currentUser.email || "",
                userName: currentUser.displayName || "",
            });
        } catch (e) {
            console.error("Error guardando en nube:", e);
        }
    }

    async function cargarDeNube(uid) {
        chat.innerHTML =
            "<div class='ai'>Sincronizando mensajes<span class='loading-dots'></span></div>";
        const { doc, getDoc } = window.firestore;
        try {
            const docRef  = doc(window.db, "chats", uid);
            const docSnap = await getDoc(docRef);
            historial = docSnap.exists() ? docSnap.data().mensajes : [systemPrompt];
            renderizarChat();
        } catch (e) {
            console.error("Error cargando de nube:", e);
            chat.innerHTML =
                "<div class='ai' style='color:#ff5555;'>⚠️ Error al sincronizar historial.</div>";
        }
    }

    // ===== FIREBASE AUTH =====
    window.login = async () => {
        if (!window.auth) return;
        try {
            await window.signInWithPopup(window.auth, window.provider);
        } catch (error) {
            // Ignorar silenciosamente el error de popup cancelado por el usuario
            if (
                error.code === "auth/cancelled-popup-request" ||
                error.code === "auth/popup-closed-by-user"
            ) {
                // El usuario simplemente cerró el popup — no mostrar alerta
                return;
            }
            // Para otros errores sí mostramos la alerta
            console.error("Error login:", error);
            alert("Error al iniciar sesión: " + error.message);
        }
    };

    window.logout = () => {
        if (!window.auth) return;
        document.body.style.opacity = "0.5";
        window.signOut(window.auth).then(() => location.reload());
    };

    // ===== RENDERIZAR HISTORIAL =====
    const renderizarChat = () => {
        chat.innerHTML = "";
        if (historial.length <= 1) {
            const nombre = currentUser
                ? currentUser.displayName.split(" ")[0]
                : "";
            chat.innerHTML = `<div class="ai">Hola <b>${nombre}</b>, soy <b>Cut-real AI</b>. Tus mensajes están sincronizados en la nube. ¿En qué puedo ayudarte hoy?</div>`;
        } else {
            historial.forEach((msg) => {
                if (msg.role === "system") return;
                const div       = document.createElement("div");
                div.className   = msg.role === "user" ? "user" : "ai";

                if (msg.role === "user") {
                    if (Array.isArray(msg.content)) {
                        const textoBlock = msg.content.find((c) => c.type === "text");
                        const imgBlock   = msg.content.find((c) => c.type === "image_url");
                        const texto      = textoBlock ? textoBlock.text : "";
                        div.innerHTML    = `<b>Tú:</b> ${formatearTexto(texto)}`;
                        if (imgBlock) {
                            div.innerHTML += `<br><img src="${imgBlock.image_url.url}" class="attached-image" alt="Imagen adjunta">`;
                        }
                    } else {
                        let visible = msg.content;
                        if (visible.includes("[Documento")) {
                            const partes = visible.split("]\n\nUsuario: ");
                            const textoUsuario = partes.length > 1 ? partes[1] : "";
                            visible =
                                (textoUsuario || "Analizar documento") +
                                ' <span style="color:#ff8888;font-size:12px;">📎 Archivo adjunto</span>';
                        }
                        div.innerHTML = `<b>Tú:</b> ${formatearTexto(visible)}`;
                    }
                } else {
                    div.innerHTML = formatearTexto(msg.content);
                }
                chat.appendChild(div);
            });
        }
        scrollAbajo();
    };

    // ===== INICIALIZACIÓN DE USUARIO =====
    const checkUser = () => {
        if (window.auth) {
            window.auth.onAuthStateChanged((user) => {
                if (user) {
                    currentUser = user;
                    loginOverlay.style.display = "none";
                    if (logoutBtn) logoutBtn.style.display = "block";
                    const resetBtn = document.getElementById("resetChat");
                    if (resetBtn) resetBtn.style.display = "block";

                    // Mostrar botón admin solo al admin
                    if (user.uid === ADMIN_UID && adminBtn) {
                        adminBtn.style.display = "block";
                        const myUidEl = document.getElementById("admin-my-uid");
                        if (myUidEl) myUidEl.textContent = "UID: " + user.uid;
                    }

                    cargarDeNube(user.uid);
                } else {
                    currentUser = null;
                    loginOverlay.style.display = "none";
                    if (logoutBtn) logoutBtn.style.display = "none";
                    const resetBtn = document.getElementById("resetChat");
                    if (resetBtn) resetBtn.style.display = "none";
                    if (adminBtn) adminBtn.style.display = "none";

                    // Mostrar términos si no los aceptó, sino ir directo al login
                    const accepted = localStorage.getItem(TERMS_KEY);
                    if (!accepted) {
                        termsOverlay.style.display = "flex";
                    } else {
                        loginOverlay.style.display = "flex";
                    }
                }
            });
        } else {
            setTimeout(checkUser, 500);
        }
    };

    checkUser();

    // ===== ENVIAR MENSAJE =====
    async function sendMessage() {
        const rawMsg = input.value.trim();
        if (!rawMsg && !attachedFile) return;
        if (!currentUser) return;

        // ===== EASTER EGG: DOOM =====
        if (rawMsg.toLowerCase().replace(/\s+/g, " ").trim() === "doom 1993") {
            input.value = "";
            input.style.height = "auto";
            openDoom();
            return;
        }

        let mensajeParaAPI;
        let previewHTML;
        let hasImage = false;

        if (attachedFile) {
            if (attachedFile.type === "image") {
                hasImage = true;
                const dataUrl = `data:${attachedFile.mediaType};base64,${attachedFile.content}`;
                mensajeParaAPI = {
                    role: "user",
                    content: [
                        { type: "image_url", image_url: { url: dataUrl } },
                        { type: "text", text: rawMsg || "Describe detalladamente esta imagen." },
                    ],
                };
                previewHTML =
                    `<b>Tú:</b> ${formatearTexto(rawMsg || "Describe esta imagen.")}` +
                    `<br><img src="${dataUrl}" class="attached-image" alt="Imagen adjunta">`;
            } else {
                const tipoLabel = attachedFile.type === "pdf" ? "PDF" : "Word (.docx)";
                const consulta  = rawMsg || `Analiza y haz un resumen completo de este documento ${tipoLabel}.`;
                const prompt =
                    `[Documento ${tipoLabel} adjunto - "${attachedFile.name}":\n${attachedFile.content}\n]\n\nUsuario: ${consulta}`;
                mensajeParaAPI = { role: "user", content: prompt };
                previewHTML =
                    `<b>Tú:</b> ${formatearTexto(rawMsg || `Analizar ${tipoLabel}`)} ` +
                    `<span style="color:#ff8888;font-size:12px;">📎 ${attachedFile.name}</span>`;
            }
            window.removeAttachment();
        } else {
            mensajeParaAPI = { role: "user", content: rawMsg };
            previewHTML    = `<b>Tú:</b> ${formatearTexto(rawMsg)}`;
        }

        historial.push(mensajeParaAPI);

        const userDiv     = document.createElement("div");
        userDiv.className = "user";
        userDiv.innerHTML = previewHTML;
        chat.appendChild(userDiv);

        input.value       = "";
        input.style.height = "auto";
        scrollAbajo();

        const thinking     = document.createElement("div");
        thinking.className = "ai";
        thinking.id        = "thinking-bubble";
        thinking.innerHTML =
            `<div class="thinking-dot"></div>` +
            `<div class="thinking-dot"></div>` +
            `<div class="thinking-dot"></div>`;
        chat.appendChild(thinking);
        scrollAbajo();

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mensajes: historial, hasImage }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error en el servidor");

            const respuestaIA = data.choices[0].message.content;
            historial.push({ role: "assistant", content: respuestaIA });

            guardarEnNube();

            document.getElementById("thinking-bubble")?.remove();

            const bot     = document.createElement("div");
            bot.className = "ai";
            chat.appendChild(bot);
            scrollAbajo();

            const palabras = respuestaIA.split(" ");
            let idx = 0;
            let acumulado = "";

            const intervalo = setInterval(() => {
                acumulado += (idx > 0 ? " " : "") + palabras[idx];
                bot.textContent = acumulado;
                idx++;
                scrollAbajo();

                if (idx >= palabras.length) {
                    clearInterval(intervalo);
                    bot.innerHTML = formatearTexto(respuestaIA);
                    scrollAbajo();
                }
            }, 22);

        } catch (e) {
            console.error(e);
            document.getElementById("thinking-bubble")?.remove();

            const errorDiv     = document.createElement("div");
            errorDiv.className = "ai";
            errorDiv.style.borderColor = "#ff4040";
            errorDiv.style.color       = "#ff8080";

            const esLimite =
                e.message.toLowerCase().includes("rate") ||
                e.message.toLowerCase().includes("limit") ||
                e.message.includes("429");

            errorDiv.innerHTML = esLimite
                ? `⚠️ <b>Límite de consultas alcanzado.</b><br>
                   Groq tiene un límite diario gratuito. Espera unos minutos y vuelve a intentarlo.`
                : `⚠️ <b>Error:</b> ${e.message}`;

            chat.appendChild(errorDiv);
            scrollAbajo();
        }
    }

    input.addEventListener("input", function () {
        this.style.height = "auto";
        this.style.height = Math.min(this.scrollHeight, 140) + "px";
    });

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    window.sendMessage = sendMessage;

    window.resetChat = async () => {
        if (!currentUser) return;
        if (confirm("¿Deseas borrar tu conversación de la nube?\nEsta acción no se puede deshacer.")) {
            historial = [systemPrompt];
            renderizarChat();
            await guardarEnNube();
        }
    };

    // ===== PANEL ADMIN =====
    window.openAdminPanel = () => {
        if (!currentUser || currentUser.uid !== ADMIN_UID) return;
        document.getElementById("admin-overlay").style.display = "flex";
    };

    window.closeAdminPanel = () => {
        document.getElementById("admin-overlay").style.display = "none";
    };

    window.adminLoadUsers = async () => {
        const output = document.getElementById("admin-users-list");
        output.innerHTML = "<em>Cargando...</em>";
        try {
            const { collection, getDocs } = window.firestore;
            const snap = await getDocs(collection(window.db, "chats"));
            if (snap.empty) { output.innerHTML = "No hay usuarios registrados."; return; }
            let html = `<table class="admin-table"><tr><th>UID</th><th>Email</th><th>Nombre</th><th>Msgs</th></tr>`;
            snap.forEach(d => {
                const data = d.data();
                const msgs = (data.mensajes || []).filter(m => m.role !== "system").length;
                html += `<tr>
                    <td class="uid-cell" title="${d.id}">${d.id.substring(0,12)}...</td>
                    <td>${data.userEmail || "-"}</td>
                    <td>${data.userName || "-"}</td>
                    <td>${msgs}</td>
                </tr>`;
            });
            html += "</table>";
            output.innerHTML = html;
        } catch(e) {
            output.innerHTML = `<span style="color:#ff5555;">Error: ${e.message}</span>`;
        }
    };

    window.adminLoadChat = async () => {
        const uid = document.getElementById("admin-uid-input").value.trim();
        const output = document.getElementById("admin-chat-output");
        if (!uid) { output.innerHTML = "<em>Ingresá un UID.</em>"; return; }
        output.innerHTML = "<em>Cargando...</em>";
        try {
            const { doc, getDoc } = window.firestore;
            const snap = await getDoc(doc(window.db, "chats", uid));
            if (!snap.exists()) { output.innerHTML = "Usuario no encontrado."; return; }
            const msgs = (snap.data().mensajes || []).filter(m => m.role !== "system");
            let html = "";
            msgs.forEach(m => {
                const content = Array.isArray(m.content)
                    ? m.content.map(c => c.text || "[imagen]").join(" ")
                    : (m.content || "").substring(0, 200);
                html += `<div class="admin-msg admin-msg-${m.role}"><b>${m.role}:</b> ${escapeHtml(content)}${content.length >= 200 ? "..." : ""}</div>`;
            });
            output.innerHTML = html || "Sin mensajes.";
        } catch(e) {
            output.innerHTML = `<span style="color:#ff5555;">Error: ${e.message}</span>`;
        }
    };

    window.adminDeleteChat = async () => {
        const uid = document.getElementById("admin-delete-uid").value.trim();
        const output = document.getElementById("admin-delete-output");
        if (!uid) { output.innerHTML = "<em>Ingresá un UID.</em>"; return; }
        if (!confirm(`¿Eliminar el chat del UID ${uid}? Esta acción no se puede deshacer.`)) return;
        output.innerHTML = "<em>Eliminando...</em>";
        try {
            const { doc, deleteDoc } = window.firestore;
            await deleteDoc(doc(window.db, "chats", uid));
            output.innerHTML = `<span style="color:#4caf50;">✅ Chat de ${uid} eliminado correctamente.</span>`;
        } catch(e) {
            output.innerHTML = `<span style="color:#ff5555;">Error: ${e.message}</span>`;
        }
    };

    window.adminLoadStats = async () => {
        const output = document.getElementById("admin-stats-output");
        output.innerHTML = "<em>Calculando...</em>";
        try {
            const { collection, getDocs } = window.firestore;
            const snap = await getDocs(collection(window.db, "chats"));
            let totalUsers = 0, totalMsgs = 0;
            snap.forEach(d => {
                totalUsers++;
                const msgs = (d.data().mensajes || []).filter(m => m.role !== "system");
                totalMsgs += msgs.length;
            });
            output.innerHTML = `
                <div class="admin-stat"><span>👥 Usuarios totales</span><b>${totalUsers}</b></div>
                <div class="admin-stat"><span>💬 Mensajes totales</span><b>${totalMsgs}</b></div>
                <div class="admin-stat"><span>📊 Promedio msgs/usuario</span><b>${totalUsers ? (totalMsgs/totalUsers).toFixed(1) : 0}</b></div>
            `;
        } catch(e) {
            output.innerHTML = `<span style="color:#ff5555;">Error: ${e.message}</span>`;
        }
    };

    window.adminSendBroadcast = async () => {
        const msg = document.getElementById("admin-broadcast-msg").value.trim();
        const output = document.getElementById("admin-broadcast-output");
        if (!msg) { output.innerHTML = "<em>Escribí un mensaje.</em>"; return; }
        output.innerHTML = "<em>Guardando...</em>";
        try {
            const { doc, setDoc } = window.firestore;
            await setDoc(doc(window.db, "config", "broadcast"), {
                message: msg,
                timestamp: Date.now(),
                active: true,
            });
            output.innerHTML = `<span style="color:#4caf50;">✅ Broadcast guardado. Los usuarios lo verán en su próxima sesión.</span>`;
        } catch(e) {
            output.innerHTML = `<span style="color:#ff5555;">Error: ${e.message}</span>`;
        }
    };

    // Verificar broadcast al iniciar sesión
    window._checkBroadcast = async () => {
        try {
            const { doc, getDoc } = window.firestore;
            const snap = await getDoc(doc(window.db, "config", "broadcast"));
            if (!snap.exists()) return;
            const data = snap.data();
            if (!data.active || !data.message) return;
            // Mostrar solo si no fue visto en esta sesión
            const seenKey = "cutreal_broadcast_seen_" + data.timestamp;
            if (sessionStorage.getItem(seenKey)) return;
            sessionStorage.setItem(seenKey, "1");

            const banner = document.createElement("div");
            banner.className = "broadcast-banner";
            banner.innerHTML = `<span>📢 ${escapeHtml(data.message)}</span><button onclick="this.parentElement.remove()">✕</button>`;
            document.body.insertBefore(banner, document.body.firstChild);
        } catch(e) { /* silencioso */ }
    };

    // Llamar broadcast check cuando el usuario se loguea (se invoca desde checkUser arriba)
    const origCheckUser = checkUser;
    window.auth && window.auth.onAuthStateChanged && setTimeout(() => {
        if (currentUser) window._checkBroadcast();
    }, 3000);
});

// ===== DOOM =====
window.openDoom = () => {
    const overlay = document.getElementById("doom-overlay");
    if (overlay) overlay.style.display = "flex";
    if (typeof startDoom === "function") startDoom();
};

window.closeDoom = () => {
    const overlay = document.getElementById("doom-overlay");
    if (overlay) overlay.style.display = "none";
    if (typeof stopDoom === "function") stopDoom();
};
