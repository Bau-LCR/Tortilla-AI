// Configurar PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// ===== ESTADO GLOBAL =====
// attachedFile guarda el archivo que el usuario adjuntó antes de enviar
// { type: 'pdf'|'docx'|'image', content: string|base64, name: string, mediaType?: string }
let attachedFile = null;

document.addEventListener("DOMContentLoaded", function () {
    const chat            = document.getElementById("chat");
    const input           = document.getElementById("input");
    const loginOverlay    = document.getElementById("login-overlay");
    const logoutBtn       = document.getElementById("logout-btn");
    const splashScreen    = document.getElementById("splash-screen");
    const fileInput       = document.getElementById("file-input");
    const attachBtn       = document.getElementById("attach-btn");
    const filePreviewBar  = document.getElementById("file-preview");
    const filePreviewName = document.getElementById("file-preview-name");

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

        // Bloques de código (``` ... ```)
        texto = texto.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
            `<pre><code>${escapeHtml(code.trim())}</code></pre>`
        );

        // Código inline (`código`)
        texto = texto.replace(/`([^`\n]+)`/g, "<code>$1</code>");

        // Encabezados
        texto = texto.replace(/^### (.+)$/gm, "<h3>$1</h3>");
        texto = texto.replace(/^## (.+)$/gm,  "<h2>$1</h2>");
        texto = texto.replace(/^# (.+)$/gm,   "<h1>$1</h1>");

        // Negrita + cursiva combinadas
        texto = texto.replace(/\*\*\*(.+?)\*\*\*/g, "<b><em>$1</em></b>");
        // Negrita
        texto = texto.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
        // Cursiva
        texto = texto.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");

        // Links en formato Markdown [texto](url)
        texto = texto.replace(
            /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
        );
        // URLs desnudas
        texto = texto.replace(
            /(^|[^"=>])(https?:\/\/[^\s<>"]+)/g,
            '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>'
        );

        // Listas con guiones o asteriscos
        texto = texto.replace(/^[\-\*] (.+)$/gm, "<li>$1</li>");
        texto = texto.replace(/((<li>.*<\/li>)\n?)+/g, (m) => `<ul>${m}</ul>`);
        // Listas numeradas
        texto = texto.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

        // Líneas horizontales
        texto = texto.replace(/^---$/gm,
            '<hr style="border:none;border-top:1px solid rgba(255,59,59,0.18);margin:12px 0;">');

        // Saltos de línea (que no estén dentro de etiquetas de bloque)
        texto = texto.replace(/\n(?!<\/?(ul|ol|li|pre|code|h[123]|hr))/g, "<br>");

        return texto;
    };

    const scrollAbajo = () =>
        requestAnimationFrame(() => (chat.scrollTop = chat.scrollHeight));

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
                // ---- PDF ----
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
                // ---- WORD (.docx) ----
                else if (
                    fileName.toLowerCase().endsWith(".docx") ||
                    fileType ===
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                ) {
                    if (typeof mammoth === "undefined") {
                        throw new Error(
                            "Mammoth.js no está disponible. Recarga la página."
                        );
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
                // ---- IMAGEN (JPG, PNG, WEBP, GIF) ----
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
                // ---- Formato no soportado ----
                else {
                    alert(
                        "Formato no soportado.\nUsa PDF (.pdf), Word (.docx) o imagen (JPG, PNG, WEBP)."
                    );
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

    // Convierte un File a base64 (sin el prefijo data:...)
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

    // Expuesta globalmente para el botón "✕" del HTML
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

        // No guardamos imágenes base64 en Firestore (muy pesadas); las reemplazamos
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
                    // Mensajes con imagen (content es array)
                    if (Array.isArray(msg.content)) {
                        const textoBlock = msg.content.find((c) => c.type === "text");
                        const imgBlock   = msg.content.find((c) => c.type === "image_url");
                        const texto      = textoBlock ? textoBlock.text : "";
                        div.innerHTML    = `<b>Tú:</b> ${formatearTexto(texto)}`;
                        if (imgBlock) {
                            // Mostrar miniatura de la imagen enviada
                            div.innerHTML += `<br><img src="${imgBlock.image_url.url}" class="attached-image" alt="Imagen adjunta">`;
                        }
                    } else {
                        // Mensajes de texto o documentos
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
                    cargarDeNube(user.uid);
                } else {
                    currentUser = null;
                    loginOverlay.style.display = "flex";
                    if (logoutBtn) logoutBtn.style.display = "none";
                    const resetBtn = document.getElementById("resetChat");
                    if (resetBtn) resetBtn.style.display = "none";
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

        let mensajeParaAPI;
        let previewHTML;
        let hasImage = false;

        // --- Construir el mensaje según el tipo de archivo adjunto ---
        if (attachedFile) {
            if (attachedFile.type === "image") {
                // Mensaje multimodal con imagen para el modelo de visión
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
                // PDF o DOCX: insertar el texto extraído en el prompt
                const tipoLabel = attachedFile.type === "pdf" ? "PDF" : "Word (.docx)";
                const consulta  =
                    rawMsg ||
                    `Analiza y haz un resumen completo de este documento ${tipoLabel}.`;
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

        // Mostrar mensaje del usuario
        const userDiv     = document.createElement("div");
        userDiv.className = "user";
        userDiv.innerHTML = previewHTML;
        chat.appendChild(userDiv);

        input.value       = "";
        input.style.height = "auto";
        scrollAbajo();

        // Mostrar animación "pensando"
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

            // Animación de escritura palabra por palabra
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
                    // Aplicar formato completo al terminar
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

    // Auto-ajuste de altura del textarea
    input.addEventListener("input", function () {
        this.style.height = "auto";
        this.style.height = Math.min(this.scrollHeight, 140) + "px";
    });

    // Enter = enviar | Shift+Enter = nueva línea
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Exponer funciones globales necesarias desde el HTML
    window.sendMessage = sendMessage;

    window.resetChat = async () => {
        if (!currentUser) return;
        if (
            confirm(
                "¿Deseas borrar tu conversación de la nube?\nEsta acción no se puede deshacer."
            )
        ) {
            historial = [systemPrompt];
            renderizarChat();
            await guardarEnNube();
        }
    };
});
