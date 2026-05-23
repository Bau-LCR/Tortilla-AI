// Configurar PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// ===== CONSTANTES =====
const ADMIN_UID = "8qZG7egWbIeMy7HqtwkKEdLasMw2";
const TERMS_KEY = "cutreal_terms_accepted";
const MODEL_KEY = "cutreal_model_preference";

// ===== ESTADO GLOBAL =====
let attachedFile  = null;
let selectedModel = localStorage.getItem(MODEL_KEY) || 'pro';
let voiceRecognition = null;
let isRecording = false;
let realtimeMonitorInterval = null;

document.addEventListener("DOMContentLoaded", function () {
    const chat            = document.getElementById("chat");
    const input           = document.getElementById("input");
    const loginOverlay    = document.getElementById("login-overlay");
    const termsOverlay    = document.getElementById("terms-overlay");
    const logoutBtn       = document.getElementById("logout-btn");
    const splashScreen    = document.getElementById("splash-screen");
    const fileInput       = document.getElementById("file-input");
    const cameraInput     = document.getElementById("camera-input");
    const attachBtn       = document.getElementById("attach-btn");
    const filePreviewBar  = document.getElementById("file-preview");
    const filePreviewName = document.getElementById("file-preview-name");
    const adminBtn        = document.getElementById("admin-btn");

    // ===== SPLASH =====
    setTimeout(() => {
        if (!splashScreen) return;
        splashScreen.style.opacity = "0";
        splashScreen.style.transition = "opacity 0.6s ease";
        setTimeout(() => (splashScreen.style.display = "none"), 620);
    }, 1900);

    const systemPrompt = { role: "system", content: "Configurado en el servidor." };
    let currentUser = null;
    let historial   = [systemPrompt];

    // ===== SELECTOR DE MODELO =====
    function buildModelSelector() {
        if (document.getElementById("model-selector-wrap")) return;
        const wrap = document.createElement("div");
        wrap.id = "model-selector-wrap";
        wrap.innerHTML = `
            <div class="model-selector">
                <button class="model-btn ripple-btn ${selectedModel === 'basic' ? 'active' : ''}" onclick="setModel('basic')" title="Llama 3.1 8B — Rápido y liviano">
                    <span class="model-icon">⚡</span><span class="model-label">Básico</span>
                </button>
                <button class="model-btn ripple-btn ${selectedModel === 'pro' ? 'active' : ''}" onclick="setModel('pro')" title="Llama 3.3 70B — Más inteligente y capaz">
                    <span class="model-icon">🧠</span><span class="model-label">Pro</span>
                </button>
            </div>`;
        const inputArea = document.querySelector(".input-area");
        if (inputArea) inputArea.parentNode.insertBefore(wrap, inputArea);
    }

    window.setModel = (model) => {
        selectedModel = model;
        localStorage.setItem(MODEL_KEY, model);
        document.querySelectorAll(".model-btn").forEach(b => b.classList.remove("active"));
        const btn = document.querySelector(`.model-btn[onclick="setModel('${model}')"]`);
        if (btn) btn.classList.add("active");
        const names = { basic: "⚡ Básico (rápido)", pro: "🧠 Pro (inteligente)" };
        showToast(`Modelo: ${names[model]}`, "#4caf50", "🔄");
    };

    // ===== VOICE INPUT =====
    window.toggleVoiceInput = function() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            showToast("Tu navegador no soporta voz a texto", "#ff4444", "🎤");
            return;
        }
        const voiceBtn = document.getElementById('voice-btn');
        if (isRecording) {
            if (voiceRecognition) voiceRecognition.stop();
            isRecording = false;
            voiceBtn.classList.remove('recording');
            voiceBtn.title = "Voz a texto";
            return;
        }
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        voiceRecognition = new SR();
        voiceRecognition.lang = 'es-AR';
        voiceRecognition.continuous = false;
        voiceRecognition.interimResults = true;
        const originalVal = input.value;
        voiceRecognition.onstart = () => {
            isRecording = true;
            voiceBtn.classList.add('recording');
            voiceBtn.title = "Grabando... (click para detener)";
            showToast("🎤 Escuchando…", "#4da6ff", "");
        };
        voiceRecognition.onresult = (e) => {
            const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
            input.value = originalVal + transcript;
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 140) + 'px';
        };
        voiceRecognition.onerror = () => {
            isRecording = false;
            voiceBtn.classList.remove('recording');
            showToast("Error al capturar voz", "#ff4444", "❌");
        };
        voiceRecognition.onend = () => {
            isRecording = false;
            voiceBtn.classList.remove('recording');
            voiceBtn.title = "Voz a texto";
        };
        voiceRecognition.start();
    };

    // ===== FORMATEO MARKDOWN =====
    const escapeHtml = (str) =>
        str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const formatearTexto = (texto) => {
        if (!texto) return "";
        texto = texto.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
            const escaped = escapeHtml(code.trim());
            return `<pre><button class="copy-code-btn" onclick="copiarCodigo(this)">📋 Copiar</button><code class="lang-${lang || 'code'}">${escaped}</code></pre>`;
        });
        texto = texto.replace(/`([^`\n]+)`/g, "<code>$1</code>");
        texto = texto.replace(/^### (.+)$/gm, "<h3>$1</h3>");
        texto = texto.replace(/^## (.+)$/gm,  "<h2>$1</h2>");
        texto = texto.replace(/^# (.+)$/gm,   "<h1>$1</h1>");
        texto = texto.replace(/\*\*\*(.+?)\*\*\*/g, "<b><em>$1</em></b>");
        texto = texto.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
        texto = texto.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
        texto = texto.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        texto = texto.replace(/(^|[^"=>])(https?:\/\/[^\s<>"]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
        texto = texto.replace(/^[\-\*] (.+)$/gm, "<li>$1</li>");
        texto = texto.replace(/((<li>.*<\/li>)\n?)+/g, m => `<ul>${m}</ul>`);
        texto = texto.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
        texto = texto.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid rgba(255,59,59,0.18);margin:12px 0;">');
        texto = texto.replace(/\n(?!<\/?(ul|ol|li|pre|code|h[123]|hr))/g, "<br>");
        return texto;
    };

    window.copiarCodigo = function(btn) {
        const code = btn.nextElementSibling?.textContent || '';
        navigator.clipboard.writeText(code).then(() => {
            btn.textContent = '✅ Copiado';
            btn.classList.add('copied');
            setTimeout(() => { btn.textContent = '📋 Copiar'; btn.classList.remove('copied'); }, 2000);
        }).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = code; document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); ta.remove();
            btn.textContent = '✅ Copiado'; btn.classList.add('copied');
            setTimeout(() => { btn.textContent = '📋 Copiar'; btn.classList.remove('copied'); }, 2000);
        });
    };

    const scrollAbajo = () =>
        requestAnimationFrame(() => (chat.scrollTop = chat.scrollHeight));

    // ===== TOAST =====
    const showToast = (msg, color = "#ff3b3b", icon = "") => {
        const existing = document.querySelector(".toast-notif");
        if (existing) existing.remove();
        const toast = document.createElement("div");
        toast.className = "toast-notif";
        toast.innerHTML = icon ? `${icon} ${msg}` : msg;
        toast.style.cssText = `
            position:fixed;bottom:100px;left:50%;transform:translateX(-50%) translateY(10px);
            background:rgba(12,12,12,0.97);color:${color};border:1px solid ${color}44;
            padding:9px 20px;border-radius:999px;font-size:13px;font-family:'Inter',sans-serif;
            font-weight:500;z-index:5000;pointer-events:none;
            animation:toastIn 0.25s ease forwards;
            box-shadow:0 4px 24px rgba(0,0,0,0.55);
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = "toastOut 0.25s ease forwards";
            setTimeout(() => toast.remove(), 260);
        }, 2400);
    };
    window.showToast = showToast;

    // ===== TÉRMINOS =====
    window.acceptTerms = () => {
        localStorage.setItem(TERMS_KEY, "accepted");
        termsOverlay.style.display = "none";
        loginOverlay.style.display = "flex";
    };
    window.declineTerms = () => {
        termsOverlay.style.display = "none";
        document.body.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                min-height:100vh;background:#080808;color:#888;font-family:Inter,sans-serif;
                text-align:center;padding:40px;gap:20px;">
                <div style="font-size:48px;">🚫</div>
                <h2 style="color:#ff3b3b;margin:0;">Acceso denegado</h2>
                <p style="max-width:400px;line-height:1.7;">Para usar Cut-real AI debés aceptar los Términos y Condiciones.<br>Si cambiás de opinión, recargá la página.</p>
                <button onclick="location.reload()" style="background:linear-gradient(140deg,#ff3b3b,#cc0000);color:white;border:none;padding:12px 28px;border-radius:999px;font-size:14px;cursor:pointer;font-family:Inter,sans-serif;font-weight:600;">Volver a intentar</button>
            </div>`;
    };

    // ===== PROCESAR IMAGEN =====
    const processImageFile = async (file) => {
        if (!file || !file.type.startsWith("image/")) return false;
        attachBtn.textContent = "⏳";
        attachBtn.style.color = "#ff3b3b";
        try {
            const base64 = await fileToBase64(file);
            attachedFile = { type: "image", content: base64, name: file.name || "imagen.png", mediaType: file.type };
            showFilePreview("🖼️ " + (file.name || "imagen pegada"));
            attachBtn.textContent = "✅"; attachBtn.style.color = "#4caf50";
            return true;
        } catch (error) { console.error(error); resetAttachBtn(); return false; }
    };

    // ===== ARCHIVOS ADJUNTOS =====
    const handleFileChange = async (file) => {
        if (!file) return;
        attachBtn.textContent = "⏳"; attachBtn.style.color = "#ff3b3b";
        try {
            if (file.type === "application/pdf") {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let extractedText = "";
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page    = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    extractedText += content.items.map(item => item.str).join(" ") + "\n";
                }
                attachedFile = { type: "pdf", content: extractedText.substring(0, 20000), name: file.name };
                showFilePreview("📄 " + file.name);
                attachBtn.textContent = "✅"; attachBtn.style.color = "#4caf50";
            } else if (file.name.toLowerCase().endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
                if (typeof mammoth === "undefined") throw new Error("Mammoth.js no está disponible.");
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer });
                attachedFile = { type: "docx", content: result.value.substring(0, 20000), name: file.name };
                showFilePreview("📝 " + file.name);
                attachBtn.textContent = "✅"; attachBtn.style.color = "#4caf50";
            } else if (file.type.startsWith("image/")) {
                await processImageFile(file);
            } else {
                alert("Formato no soportado.\nUsá PDF (.pdf), Word (.docx) o imagen (JPG, PNG, WEBP).");
                resetAttachBtn();
            }
        } catch (error) {
            console.error(error);
            alert("Error al procesar el archivo:\n" + error.message);
            resetAttachBtn(); attachedFile = null; filePreviewBar.style.display = "none";
        }
    };

    if (fileInput)   fileInput.addEventListener("change",   async (e) => { const f = e.target.files[0]; if (f) await handleFileChange(f); });
    if (cameraInput) cameraInput.addEventListener("change", async (e) => { const f = e.target.files[0]; if (!f) return; const ok = await processImageFile(f); if (ok) showToast("Foto lista para enviar", "#4caf50", "📷"); cameraInput.value = ""; });

    document.addEventListener("paste", async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith("image/")) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) continue;
                if (attachedFile) { if (!confirm("Ya hay un archivo adjunto. ¿Reemplazarlo?")) return; }
                const ok = await processImageFile(file);
                if (ok) { showToast("Imagen pegada desde portapapeles", "#4caf50", "📋"); input.focus(); }
                break;
            }
        }
    });

    const fileToBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    const showFilePreview = (label) => { filePreviewName.textContent = label; filePreviewBar.style.display = "flex"; };
    const resetAttachBtn  = () => { attachBtn.textContent = "📎"; attachBtn.style.color = ""; };
    window.removeAttachment = () => {
        attachedFile = null;
        if (fileInput)   fileInput.value   = "";
        if (cameraInput) cameraInput.value = "";
        filePreviewBar.style.display = "none";
        resetAttachBtn();
    };

    // ===== FIRESTORE =====
    async function guardarEnNube() {
        if (!currentUser) return;
        const { doc, setDoc } = window.firestore;
        const historialParaGuardar = historial.map((msg) => {
            if (Array.isArray(msg.content)) {
                const textos = msg.content.filter(c => c.type === "text").map(c => c.text).join(" ");
                return { role: msg.role, content: (textos || "Imagen") + " [📷 imagen adjunta]" };
            }
            return msg;
        });
        try {
            await setDoc(doc(window.db, "chats", currentUser.uid), {
                mensajes:  historialParaGuardar,
                updatedAt: Date.now(),
                userEmail: currentUser.email       || "",
                userName:  currentUser.displayName || "",
                model:     selectedModel,
            });
        } catch (e) { console.error("Error guardando en nube:", e); }
    }

    async function cargarDeNube(uid) {
        chat.innerHTML = "<div class='ai'>Sincronizando mensajes<span class='loading-dots'></span></div>";
        const { doc, getDoc } = window.firestore;
        try {
            const docRef  = doc(window.db, "chats", uid);
            const docSnap = await getDoc(docRef);
            historial = docSnap.exists() ? docSnap.data().mensajes : [systemPrompt];
            renderizarChat();
        } catch (e) {
            console.error("Error cargando de nube:", e);
            chat.innerHTML = "<div class='ai' style='color:#ff5555;'>⚠️ Error al sincronizar historial.</div>";
        }
    }

    // ===== FIREBASE AUTH =====
    window.login = async () => {
        if (!window.auth) return;
        try { await window.signInWithPopup(window.auth, window.provider); }
        catch (error) {
            if (error.code === "auth/cancelled-popup-request" || error.code === "auth/popup-closed-by-user") return;
            alert("Error al iniciar sesión: " + error.message);
        }
    };
    window.logout = () => { if (!window.auth) return; document.body.style.opacity = "0.5"; window.signOut(window.auth).then(() => location.reload()); };

    // ===== RENDERIZAR HISTORIAL =====
    const renderizarChat = () => {
        chat.innerHTML = "";
        if (historial.length <= 1) {
            const nombre = currentUser ? currentUser.displayName.split(" ")[0] : "";
            chat.innerHTML = `<div class="ai">Hola <b>${nombre}</b>, soy <b>Cut-real AI</b>. Tus mensajes están sincronizados en la nube. ¿En qué puedo ayudarte hoy?</div>`;
        } else {
            historial.forEach((msg) => {
                if (msg.role === "system") return;
                const div = document.createElement("div");
                div.className = msg.role === "user" ? "user" : "ai";
                if (msg.role === "user") {
                    if (Array.isArray(msg.content)) {
                        const textoBlock = msg.content.find(c => c.type === "text");
                        const imgBlock   = msg.content.find(c => c.type === "image_url");
                        const texto      = textoBlock ? textoBlock.text : "";
                        div.innerHTML    = `<b>Tú:</b> ${formatearTexto(texto)}`;
                        if (imgBlock) div.innerHTML += `<br><img src="${imgBlock.image_url.url}" class="attached-image" alt="Imagen adjunta" onclick="openImageZoom(this.src)">`;
                    } else {
                        let visible = msg.content;
                        if (visible.includes("[Documento")) {
                            const partes = visible.split("]\n\nUsuario: ");
                            const textoUsuario = partes.length > 1 ? partes[1] : "";
                            visible = (textoUsuario || "Analizar documento") + ' <span style="color:#ff8888;font-size:12px;">📎 Archivo adjunto</span>';
                        }
                        if (visible.startsWith("[IMAGEN_GENERADA:")) {
                            const src = visible.replace("[IMAGEN_GENERADA:", "").replace("]", "");
                            div.innerHTML = `<b>Tú:</b> <em style="color:#ff8888;font-size:12px;">🎨 Imagen generada</em><br><img src="${src}" class="attached-image generated-image" onclick="openImageZoom(this.src)">`;
                        } else { div.innerHTML = `<b>Tú:</b> ${formatearTexto(visible)}`; }
                    }
                } else {
                    div.innerHTML = formatearTexto(msg.content);
                }
                chat.appendChild(div);
            });
        }
        scrollAbajo();
        // Mostrar botón de búsqueda solo si hay historial
        const sb = document.getElementById('search-btn');
        if (sb) sb.style.display = historial.length > 2 ? 'block' : 'none';
    };

    // ===== INICIALIZACIÓN DE USUARIO =====
    const checkUser = () => {
        if (window.
