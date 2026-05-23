// Configurar PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// ===== CONSTANTES =====
const ADMIN_UID  = "8qZG7egWbIeMy7HqtwkKEdLasMw2";
const TERMS_KEY  = "cutreal_terms_accepted";
const MODEL_KEY  = "cutreal_model_preference";

// ===== ESTADO GLOBAL =====
let attachedFile = null;
let selectedModel = localStorage.getItem(MODEL_KEY) || 'pro';

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

    // ===== SPLASH SCREEN =====
    setTimeout(() => {
        if (!splashScreen) return;
        splashScreen.style.opacity    = "0";
        splashScreen.style.transition = "opacity 0.6s ease";
        setTimeout(() => (splashScreen.style.display = "none"), 620);
    }, 1900);

    const systemPrompt = { role: "system", content: "Configurado en el servidor." };
    let currentUser = null;
    let historial   = [systemPrompt];

    // ===== SELECTOR DE MODELO =====
    function buildModelSelector() {
        const existing = document.getElementById("model-selector-wrap");
        if (existing) return;
        const wrap = document.createElement("div");
        wrap.id = "model-selector-wrap";
        wrap.innerHTML = `
            <div class="model-selector">
                <button class="model-btn ${selectedModel === 'basic' ? 'active' : ''}" onclick="setModel('basic')" title="Llama 3.1 8B — Rápido y liviano">
                    <span class="model-icon">⚡</span>
                    <span class="model-label">Básico</span>
                </button>
                <button class="model-btn ${selectedModel === 'pro' ? 'active' : ''}" onclick="setModel('pro')" title="Llama 3.3 70B — Más inteligente y capaz">
                    <span class="model-icon">🧠</span>
                    <span class="model-label">Pro</span>
                </button>
            </div>
        `;
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

    // ===== FORMATEO MARKDOWN =====
    const escapeHtml = (str) =>
        str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const formatearTexto = (texto) => {
        if (!texto) return "";
        texto = texto.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
            `<pre><code class="lang-${lang || 'code'}">${escapeHtml(code.trim())}</code></pre>`
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

    // ===== TOAST NOTIFICATION =====
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

    // ===== TÉRMINOS Y CONDICIONES =====
    window.acceptTerms = () => {
        localStorage.setItem(TERMS_KEY, "accepted");
        termsOverlay.style.display = "none";
        loginOverlay.style.display = "flex";
    };

    window.declineTerms = () => {
        termsOverlay.style.display = "none";
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

    // ===== PROCESAMIENTO DE IMAGEN =====
    const processImageFile = async (file) => {
        if (!file || !file.type.startsWith("image/")) return false;
        attachBtn.textContent = "⏳";
        attachBtn.style.color = "#ff3b3b";
        try {
            const base64 = await fileToBase64(file);
            attachedFile = {
                type:      "image",
                content:   base64,
                name:      file.name || "imagen.png",
                mediaType: file.type,
            };
            showFilePreview("🖼️ " + (file.name || "imagen pegada"));
            attachBtn.textContent = "✅";
            attachBtn.style.color = "#4caf50";
            return true;
        } catch (error) {
            console.error("Error procesando imagen:", error);
            resetAttachBtn();
            return false;
        }
    };

    // ===== LÓGICA DE ARCHIVOS ADJUNTOS =====
    const handleFileChange = async (file) => {
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
                    extractedText += content.items.map((item) => item.str).join(" ") + "\n";
                }
                attachedFile = { type: "pdf", content: extractedText.substring(0, 20000), name: fileName };
                showFilePreview("📄 " + fileName);
                attachBtn.textContent = "✅";
                attachBtn.style.color = "#4caf50";
            }
            else if (
                fileName.toLowerCase().endsWith(".docx") ||
                fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ) {
                if (typeof mammoth === "undefined") throw new Error("Mammoth.js no está disponible.");
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer });
                attachedFile = { type: "docx", content: result.value.substring(0, 20000), name: fileName };
                showFilePreview("📝 " + fileName);
                attachBtn.textContent = "✅";
                attachBtn.style.color = "#4caf50";
            }
            else if (fileType.startsWith("image/")) {
                await processImageFile(file);
            }
            else {
                alert("Formato no soportado.\nUsá PDF (.pdf), Word (.docx) o imagen (JPG, PNG, WEBP).");
                resetAttachBtn();
            }
        } catch (error) {
            console.error("Error al leer archivo:", error);
            alert("Error al procesar el archivo:\n" + error.message);
            resetAttachBtn();
            attachedFile = null;
            filePreviewBar.style.display = "none";
        }
    };

    if (fileInput) {
        fileInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (file) await handleFileChange(file);
        });
    }

    if (cameraInput) {
        cameraInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const ok = await processImageFile(file);
            if (ok) showToast("Foto lista para enviar", "#4caf50", "📷");
            cameraInput.value = "";
        });
    }

    document.addEventListener("paste", async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith("image/")) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) continue;
                if (attachedFile) {
                    const replace = confirm("Ya tenés un archivo adjunto. ¿Reemplazarlo con la imagen del portapapeles?");
                    if (!replace) return;
                }
                const ok = await processImageFile(file);
                if (ok) { showToast("Imagen pegada desde portapapeles", "#4caf50", "📋"); input.focus(); }
                break;
            }
        }
    });

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
                const textos = msg.content.filter((c) => c.type === "text").map((c) => c.text).join(" ");
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
        try {
            await window.signInWithPopup(window.auth, window.provider);
        } catch (error) {
            if (error.code === "auth/cancelled-popup-request" || error.code === "auth/popup-closed-by-user") return;
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
            const nombre = currentUser ? currentUser.displayName.split(" ")[0] : "";
            chat.innerHTML = `<div class="ai">Hola <b>${nombre}</b>, soy <b>Cut-real AI</b>. Tus mensajes están sincronizados en la nube. ¿En qué puedo ayudarte hoy?</div>`;
        } else {
            historial.forEach((msg) => {
                if (msg.role === "system") return;
                const div = document.createElement("div");
                div.className = msg.role === "user" ? "user" : "ai";
                if (msg.role === "user") {
                    if (Array.isArray(msg.content)) {
                        const textoBlock = msg.content.find((c) => c.type === "text");
                        const imgBlock   = msg.content.find((c) => c.type === "image_url");
                        const texto      = textoBlock ? textoBlock.text : "";
                        div.innerHTML    = `<b>Tú:</b> ${formatearTexto(texto)}`;
                        if (imgBlock) div.innerHTML += `<br><img src="${imgBlock.image_url.url}" class="attached-image" alt="Imagen adjunta">`;
                    } else {
                        let visible = msg.content;
                        if (visible.includes("[Documento")) {
                            const partes = visible.split("]\n\nUsuario: ");
                            const textoUsuario = partes.length > 1 ? partes[1] : "";
                            visible = (textoUsuario || "Analizar documento") + ' <span style="color:#ff8888;font-size:12px;">📎 Archivo adjunto</span>';
                        }
                        if (visible.startsWith("[IMAGEN_GENERADA:")) {
                            const src = visible.replace("[IMAGEN_GENERADA:", "").replace("]", "");
                            div.innerHTML = `<b>Tú:</b> <em style="color:#ff8888;font-size:12px;">🎨 Imagen generada</em><br><img src="${src}" class="attached-image">`;
                        } else {
                            div.innerHTML = `<b>Tú:</b> ${formatearTexto(visible)}`;
                        }
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
            window.auth.onAuthStateChanged(async (user) => {
                if (user) {
                    currentUser = user;
                    loginOverlay.style.display = "none";
                    if (logoutBtn) logoutBtn.style.display = "block";
                    const resetBtn = document.getElementById("resetChat");
                    if (resetBtn) resetBtn.style.display = "block";

                    const isAdmin = user.uid === ADMIN_UID || await checkAdminRole(user.uid);
                    if (isAdmin && adminBtn) {
                        adminBtn.style.display = "block";
                    }

                    cargarDeNube(user.uid);
                    buildModelSelector();
                    setTimeout(() => window._checkBroadcast && window._checkBroadcast(), 3000);
                    setTimeout(() => window._checkPrivateMessage && window._checkPrivateMessage(), 4000);
                } else {
                    currentUser = null;
                    loginOverlay.style.display = "none";
                    if (logoutBtn) logoutBtn.style.display = "none";
                    const resetBtn = document.getElementById("resetChat");
                    if (resetBtn) resetBtn.style.display = "none";
                    if (adminBtn)  adminBtn.style.display = "none";

                    const accepted = localStorage.getItem(TERMS_KEY);
                    if (!accepted) termsOverlay.style.display = "flex";
                    else loginOverlay.style.display = "flex";
                }
            });
        } else {
            setTimeout(checkUser, 500);
        }
    };

    async function checkAdminRole(uid) {
        try {
            const { doc, getDoc } = window.firestore;
            const snap = await getDoc(doc(window.db, "admins", uid));
            return snap.exists() && snap.data().isAdmin === true;
        } catch(e) { return false; }
    }

    checkUser();

    // ===================================================================
    //  DETECCIÓN DE INTENCIÓN — NLP MEJORADO
    //  Ya no activa por palabras sueltas sino por frases completas
    //  y contexto semántico.
    // ===================================================================
    function detectIntent(msg) {
        const lower = msg.toLowerCase().trim();

        // --- DOOM Easter Egg ---
        if (lower.replace(/\s+/g, " ") === "doom 1993") return "doom";

        // --- GENERAR IMAGEN: requiere verbo de creación + sustantivo visual JUNTOS ---
        // El usuario debe pedir explícitamente que se CREE algo visual
        const imgGenerateVerbs = /\b(genera|generá|generar|crea|creá|crear|dibuja|dibujá|dibujar|diseña|diseñá|diseñar|haz|hace|hacer|producí|producir)\b/;
        const imgGenerateNouns = /\b(imagen|imágen|foto|fotografía|ilustración|dibujo|arte|logo|banner|poster|póster|icono|portada|thumbnail)\b/;
        if (imgGenerateVerbs.test(lower) && imgGenerateNouns.test(lower)) return 'generate_image';

        // --- BUSCAR IMÁGENES: requiere verbo de búsqueda + sustantivo + "de" + tema ---
        // "muéstrame imágenes de...", "busca fotos de...", "quiero ver fotos de..."
        const imgSearchPattern = /\b(busca|buscá|buscar|muéstrame|mostrame|muestra|encontrá|encontrar|quiero ver)\b.{0,25}\b(imagen|imágenes|foto|fotos|fotografías)\b/;
        if (imgSearchPattern.test(lower)) return 'search_image';

        // --- YOUTUBE: requiere petición explícita de ver video en YouTube ---
        // "muéstrame un video de...", "busca en youtube...", "quiero ver el video de..."
        const ytPattern = /\b(youtube|busca.{0,15}video|muéstrame.{0,15}video|mostrame.{0,15}video|quiero ver.{0,15}video|tutorial en video|video de)\b/;
        if (ytPattern.test(lower)) return 'youtube';

        return 'chat';
    }

    // ===== GENERAR IMAGEN CON CANVAS — MEJORADO =====
    // Usa hash más robusto y mayor variedad visual
    function generateImageWithCanvas(prompt) {
        return new Promise((resolve) => {
            const canvas = document.createElement("canvas");
            canvas.width = 512; canvas.height = 512;
            const ctx = canvas.getContext("2d");
            const p = prompt.toLowerCase();

            // Paleta basada en el tema
            let palette = { bg: ['#1a0a2e','#0d0022'], accent: ['#ff3b3b','#cc0000'], fg: '#ffffff', shapes: 'abstract' };

            if (/naturaleza|árbol|bosque|campo|planta|flor|verde|selva|jardín|hierba/.test(p))
                palette = { bg: ['#0a1a0a','#001a00'], accent: ['#22cc44','#88ff44','#55dd22'], fg: '#ccffcc', shapes: 'organic' };
            else if (/mar|oceano|agua|playa|ola|azul|lago|río|piscina|nado/.test(p))
                palette = { bg: ['#000a1a','#001133'], accent: ['#0055ff','#22aaff','#44ddff'], fg: '#aaddff', shapes: 'fluid' };
            else if (/fuego|llama|calor|lava|volcán|incendio|explosión/.test(p))
                palette = { bg: ['#1a0000','#330000'], accent: ['#ff4400','#ffaa00','#ff2200'], fg: '#ffddaa', shapes: 'spiky' };
            else if (/galaxia|espacio|cosmos|estrellas|planeta|nebulosa|universo/.test(p))
                palette = { bg: ['#000005','#050020'], accent: ['#8844ff','#ff44ff','#4488ff'], fg: '#ddaaff', shapes: 'stars' };
            else if (/ciudad|urbano|noche|rascacielos|metro|arquitectura|edificio/.test(p))
                palette = { bg: ['#050510','#100a20'], accent: ['#4488ff','#ffcc00','#ff4488'], fg: '#aabbff', shapes: 'geometric' };
            else if (/robot|maquina|metal|tecnología|cyber|digital|inteligencia/.test(p))
                palette = { bg: ['#020a05','#0a1410'], accent: ['#00ffaa','#00cc88','#22ffdd'], fg: '#aaffdd', shapes: 'grid' };
            else if (/dorado|oro|sol|amarillo|luz|brillante/.test(p))
                palette = { bg: ['#1a1000','#201500'], accent: ['#ffcc00','#ffaa00','#ffee44'], fg: '#fff0aa', shapes: 'rays' };
            else if (/montaña|cerro|pico|nieve|glaciar|cumbre/.test(p))
                palette = { bg: ['#0a1020','#101520'], accent: ['#88aacc','#ccddee','#5577aa'], fg: '#ddeeff', shapes: 'triangles' };
            else if (/música|canción|nota|melodía|ritmo|audio|sonido/.test(p))
                palette = { bg: ['#0a000a','#150015'], accent: ['#cc44ff','#8822ff','#ff44cc'], fg: '#ddaaff', shapes: 'waves' };
            else if (/comida|pizza|burger|sandwich|cocina|gastronomía/.test(p))
                palette = { bg: ['#1a0a00','#200c00'], accent: ['#ff8800','#ffcc00','#ff4400'], fg: '#ffe0aa', shapes: 'circles' };
            else if (/perro|gato|animal|mascota|fauna|wildlife/.test(p))
                palette = { bg: ['#0a0800','#120e00'], accent: ['#cc8844','#ee9955','#ffbb66'], fg: '#ffe8cc', shapes: 'organic' };

            // Fondo degradado
            const bgGrd = ctx.createLinearGradient(0, 0, 512, 512);
            bgGrd.addColorStop(0, palette.bg[0]);
            bgGrd.addColorStop(1, palette.bg[1]);
            ctx.fillStyle = bgGrd;
            ctx.fillRect(0, 0, 512, 512);

            // RNG basada en hash del prompt (consistente por prompt, único por contenido)
            const hashCode = (str) => {
                let h = 5381;
                for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
                return h >>> 0;
            };
            const seed = hashCode(prompt);
            const rng = (i) => {
                let x = Math.sin(seed * 0.0001 + i * 1.618033) * 43758.5453123;
                return x - Math.floor(x);
            };

            // Partículas de fondo
            for (let i = 0; i < 1800; i++) {
                const x = rng(i * 7) * 512, y = rng(i * 7 + 1) * 512;
                ctx.fillStyle = `rgba(255,255,255,${rng(i * 7 + 2) * 0.05})`;
                ctx.fillRect(x, y, 1, 1);
            }

            // Formas según temática
            ctx.globalCompositeOperation = 'screen';

            if (palette.shapes === 'stars') {
                for (let i = 0; i < 200; i++) {
                    const x = rng(i * 5) * 512, y = rng(i * 5 + 1) * 512;
                    const r = 0.5 + rng(i * 5 + 2) * 2.5;
                    ctx.fillStyle = `rgba(255,255,255,${0.3 + rng(i * 5 + 3) * 0.7})`;
                    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
                }
            }

            if (palette.shapes === 'waves') {
                for (let i = 0; i < 8; i++) {
                    ctx.strokeStyle = palette.accent[i % palette.accent.length] + '66';
                    ctx.lineWidth = 1.5 + rng(i + 40) * 3;
                    ctx.beginPath();
                    for (let x = 0; x <= 512; x += 4) {
                        const y = 256 + Math.sin(x * 0.04 + i * 0.8 + rng(i) * 5) * (40 + rng(i + 1) * 60);
                        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                }
            }

            if (palette.shapes === 'geometric' || palette.shapes === 'grid') {
                for (let i = 0; i < 12; i++) {
                    const x = rng(i * 4) * 512, y = rng(i * 4 + 1) * 512;
                    const s = 20 + rng(i * 4 + 2) * 80;
                    ctx.strokeStyle = palette.accent[i % palette.accent.length] + '55';
                    ctx.lineWidth = 0.8;
                    ctx.strokeRect(x - s / 2, y - s / 2, s, s);
                }
            }

            if (palette.shapes === 'triangles') {
                for (let i = 0; i < 8; i++) {
                    const cx2 = rng(i * 6) * 512, cy2 = rng(i * 6 + 1) * 512;
                    const r2 = 30 + rng(i * 6 + 2) * 100;
                    ctx.fillStyle = palette.accent[i % palette.accent.length] + '33';
                    ctx.beginPath();
                    ctx.moveTo(cx2, cy2 - r2);
                    ctx.lineTo(cx2 - r2 * 0.866, cy2 + r2 * 0.5);
                    ctx.lineTo(cx2 + r2 * 0.866, cy2 + r2 * 0.5);
                    ctx.closePath(); ctx.fill();
                }
            }

            if (palette.shapes === 'rays') {
                const cx2 = 256, cy2 = 256;
                for (let i = 0; i < 24; i++) {
                    const angle = (i / 24) * Math.PI * 2;
                    const grd2 = ctx.createLinearGradient(cx2, cy2, cx2 + Math.cos(angle) * 260, cy2 + Math.sin(angle) * 260);
                    grd2.addColorStop(0, palette.accent[0] + 'aa');
                    grd2.addColorStop(1, palette.accent[0] + '00');
                    ctx.strokeStyle = grd2; ctx.lineWidth = 2 + rng(i + 100) * 4;
                    ctx.beginPath(); ctx.moveTo(cx2, cy2);
                    ctx.lineTo(cx2 + Math.cos(angle) * 260, cy2 + Math.sin(angle) * 260);
                    ctx.stroke();
                }
            }

            // Orbes de luz (todos los temas)
            for (let i = 0; i < 5; i++) {
                const cx2 = rng(i * 2 + 1) * 512, cy2 = rng(i * 2 + 2) * 512, r = 40 + rng(i + 10) * 130;
                const grd = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, r);
                const col = palette.accent[i % palette.accent.length];
                grd.addColorStop(0, col + '44'); grd.addColorStop(1, col + '00');
                ctx.fillStyle = grd;
                ctx.beginPath(); ctx.arc(cx2, cy2, r, 0, Math.PI * 2); ctx.fill();
            }

            // Líneas de luz
            for (let i = 0; i < 10; i++) {
                const x1 = rng(i * 4 + 1) * 512, y1 = rng(i * 4 + 2) * 512;
                const x2 = rng(i * 4 + 3) * 512, y2 = rng(i * 4 + 4) * 512;
                const col = palette.accent[i % palette.accent.length];
                const grd2 = ctx.createLinearGradient(x1, y1, x2, y2);
                grd2.addColorStop(0, col + '00');
                grd2.addColorStop(0.5, col + '88');
                grd2.addColorStop(1, col + '00');
                ctx.strokeStyle = grd2; ctx.lineWidth = 0.5 + rng(i + 20) * 1.5;
                ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            }

            ctx.globalCompositeOperation = 'source-over';

            // Forma central orgánica (logo/silueta abstracta del tema)
            const grdC = ctx.createRadialGradient(256, 220, 10, 256, 220, 110);
            grdC.addColorStop(0, palette.accent[0] + 'ff');
            grdC.addColorStop(0.5, palette.accent[palette.accent.length - 1] + '88');
            grdC.addColorStop(1, palette.bg[0] + '00');
            ctx.fillStyle = grdC;
            ctx.beginPath();
            const petalCount = 3 + (seed % 5);
            for (let a = 0; a < Math.PI * 2; a += 0.04) {
                const r = 65 + Math.sin(a * petalCount + rng(1) * 3) * 30 + Math.cos(a * 7 + rng(2) * 2) * 15;
                const x = 256 + Math.cos(a) * r, y = 220 + Math.sin(a) * r;
                a < 0.05 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.closePath(); ctx.fill();

            // Segunda forma de acento
            const grdC2 = ctx.createRadialGradient(256 + rng(10) * 80 - 40, 220 + rng(11) * 80 - 40, 5, 256, 220, 80);
            grdC2.addColorStop(0, (palette.accent[1] || palette.accent[0]) + 'cc');
            grdC2.addColorStop(1, palette.bg[1] + '00');
            ctx.fillStyle = grdC2;
            ctx.beginPath();
            for (let a = 0; a < Math.PI * 2; a += 0.06) {
                const r = 35 + Math.sin(a * (2 + seed % 3)) * 18;
                const x = 256 + rng(12) * 100 - 50 + Math.cos(a) * r;
                const y = 220 + rng(13) * 80 - 40 + Math.sin(a) * r;
                a < 0.07 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.closePath(); ctx.fill();

            // Viñeta
            const vignette = ctx.createRadialGradient(256, 256, 80, 256, 256, 360);
            vignette.addColorStop(0, 'rgba(0,0,0,0)');
            vignette.addColorStop(1, 'rgba(0,0,0,0.72)');
            ctx.fillStyle = vignette; ctx.fillRect(0, 0, 512, 512);

            // Texto del prompt
            ctx.fillStyle = 'rgba(255,255,255,0.22)';
            ctx.font = '11px monospace';
            ctx.textAlign = 'center';
            const sp = prompt.length > 50 ? prompt.substring(0, 50) + '…' : prompt;
            ctx.fillText(sp, 256, 500);
            ctx.textAlign = 'left';

            resolve(canvas.toDataURL("image/png"));
        });
    }

    function buildImageSearchHTML(query) {
        const q = encodeURIComponent(query);
        const imgs = Array.from({length:6},(_,i)=>i+1).map(i=>
            `<img src="https://source.unsplash.com/200x200/?${q}&sig=${i}" class="search-result-img" alt="${query}"
             onclick="window.open(this.src,'_blank')" onerror="this.style.display='none'">`
        ).join('');
        return `<div class="img-search-grid">
            <p style="color:#ff8888;font-size:13px;margin:0 0 8px;">🔍 Imágenes de: <b>${escapeHtml(query)}</b> (Unsplash)</p>
            <div class="img-grid-inner">${imgs}</div>
            <a href="https://unsplash.com/s/photos/${q}" target="_blank" style="font-size:11px;color:#ff6666;text-decoration:underline;">Ver más en Unsplash →</a>
        </div>`;
    }

    function buildYouTubeSearchHTML(query) {
        const q = encodeURIComponent(query);
        return `<div class="yt-search-container">
            <p style="color:#ff8888;font-size:13px;margin:0 0 8px;">▶️ Videos de YouTube relacionados con: <b>${escapeHtml(query)}</b></p>
            <div class="yt-cards-row">
                <a class="yt-card" href="https://www.youtube.com/results?search_query=${q}" target="_blank">
                    <div class="yt-thumb"><span class="yt-play-icon">▶</span></div>
                    <div class="yt-card-info">
                        <span class="yt-card-title">${escapeHtml(query)}</span>
                        <span class="yt-card-sub">Ver resultados en YouTube →</span>
                    </div>
                </a>
            </div>
            <a href="https://www.youtube.com/results?search_query=${q}" target="_blank" style="font-size:11px;color:#ff6666;text-decoration:underline;">Buscar "${query}" en YouTube →</a>
        </div>`;
    }

    // ===== ENVIAR MENSAJE =====
    async function sendMessage() {
        const rawMsg = input.value.trim();
        if (!rawMsg && !attachedFile) return;
        if (!currentUser) return;

        const intent = rawMsg ? detectIntent(rawMsg) : 'chat';

        // Easter Egg: DOOM
        if (intent === "doom") {
            input.value = "";
            input.style.height = "auto";
            const userDiv = document.createElement("div");
            userDiv.className = "user";
            userDiv.innerHTML = `<b>Tú:</b> doom 1993`;
            chat.appendChild(userDiv);
            scrollAbajo();
            setTimeout(() => openDoom(), 400);
            return;
        }

        let mensajeParaAPI, previewHTML, hasImage = false;

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
                previewHTML = `<b>Tú:</b> ${formatearTexto(rawMsg || "Describe esta imagen.")}<br><img src="${dataUrl}" class="attached-image" alt="Imagen adjunta">`;
            } else {
                const tipoLabel = attachedFile.type === "pdf" ? "PDF" : "Word (.docx)";
                const consulta  = rawMsg || `Analiza y haz un resumen completo de este documento ${tipoLabel}.`;
                const prompt    = `[Documento ${tipoLabel} adjunto - "${attachedFile.name}":\n${attachedFile.content}\n]\n\nUsuario: ${consulta}`;
                mensajeParaAPI  = { role: "user", content: prompt };
                previewHTML     = `<b>Tú:</b> ${formatearTexto(rawMsg || `Analizar ${tipoLabel}`)} <span style="color:#ff8888;font-size:12px;">📎 ${attachedFile.name}</span>`;
            }
            window.removeAttachment();
        } else {
            mensajeParaAPI = { role: "user", content: rawMsg };
            previewHTML    = `<b>Tú:</b> ${formatearTexto(rawMsg)}`;
        }

        historial.push(mensajeParaAPI);
        const userDiv = document.createElement("div");
        userDiv.className = "user"; userDiv.innerHTML = previewHTML;
        chat.appendChild(userDiv);
        input.value = ""; input.style.height = "auto";
        scrollAbajo();

        // GENERAR IMAGEN
        if (intent === 'generate_image' && !attachedFile) {
            const thinking = addThinking();
            try {
                // Extraer el tema de la imagen del mensaje
                const imgPrompt = rawMsg
                    .replace(/genera(r|me|nos|me una|me un)?|crea(r|me|nos|me una|me un)?|dibuja(r|me|me una|me un)?|hace(r|me|me una|me un)?|diseña(r|me|me una|me un)?/gi, '')
                    .replace(/\b(una?|el|la|los|las|de|del|un|unos?|unas?)\b/gi, ' ')
                    .replace(/\b(imagen|ilustración|foto|dibujo|arte|logo|banner|poster|póster|icono)\b/gi, ' ')
                    .replace(/\s+/g, ' ')
                    .trim() || rawMsg;
                const dataUrl = await generateImageWithCanvas(imgPrompt);
                thinking.remove();
                const bot = document.createElement("div");
                bot.className = "ai";
                bot.innerHTML = `🎨 <b>Imagen generada</b> para: <em>${escapeHtml(imgPrompt)}</em><br><br>
                    <img src="${dataUrl}" class="attached-image generated-image" alt="Imagen generada" style="max-height:320px;cursor:zoom-in;" onclick="window.open(this.src,'_blank')">
                    <br><span style="font-size:11px;color:#888;">Click para ver en grande · <a href="${dataUrl}" download="cutreal-imagen.png" style="color:#ff8888;">Descargar</a></span>`;
                chat.appendChild(bot); scrollAbajo();
                historial.push({ role: "assistant", content: `[Imagen generada para: "${imgPrompt}"]` });
                guardarEnNube(); return;
            } catch(e) { thinking.remove(); }
        }

        // BÚSQUEDA DE IMÁGENES
        if (intent === 'search_image' && !attachedFile) {
            const thinking = addThinking();
            // Extraer el tema de búsqueda
            const searchTerm = rawMsg
                .replace(/busca(r|me)?|muéstrame|mostrame|muestra|encontrá|encontrar|quiero ver/gi, '')
                .replace(/imagen(es)?|foto(s)?|fotografías?/gi, '')
                .replace(/\b(de|del|un|una|el|la|los|las)\b/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim() || rawMsg;
            setTimeout(() => {
                thinking.remove();
                const bot = document.createElement("div"); bot.className = "ai";
                bot.innerHTML = buildImageSearchHTML(searchTerm);
                chat.appendChild(bot); scrollAbajo();
                historial.push({role: "assistant", content: `[Búsqueda de imágenes: "${searchTerm}"]`});
                guardarEnNube();
            }, 600); return;
        }

        // YOUTUBE
        if (intent === 'youtube' && !attachedFile) {
            const thinking = addThinking();
            const searchTerm = rawMsg
                .replace(/busca(r|me)?|muéstrame|mostrame|mira(r)?|ver|encuentra/gi, '')
                .replace(/video(s)?|youtube|tutorial(es)?/gi, '')
                .replace(/\b(de|del|un|una|el|la|los|las|en)\b/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim() || rawMsg;
            setTimeout(() => {
                thinking.remove();
                const bot = document.createElement("div"); bot.className = "ai";
                bot.innerHTML = buildYouTubeSearchHTML(searchTerm);
                chat.appendChild(bot); scrollAbajo();
                historial.push({role: "assistant", content: `[YouTube: "${searchTerm}"]`});
                guardarEnNube();
            }, 500); return;
        }

        // CHAT NORMAL
        const thinking = addThinking();
        try {
            const res = await fetch("/api/chat", {
                method: "POST", headers: {"Content-Type": "application/json"},
                body: JSON.stringify({ mensajes: historial, hasImage, model: selectedModel }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error en el servidor");

            const respuestaIA = data.choices[0].message.content;
            historial.push({ role: "assistant", content: respuestaIA });
            guardarEnNube();
            thinking.remove();

            const bot = document.createElement("div"); bot.className = "ai"; chat.appendChild(bot); scrollAbajo();
            const words = respuestaIA.split(" "); let idx = 0, acc = "";
            const CHUNK = 4;
            const timer = setInterval(() => {
                for (let c = 0; c < CHUNK && idx < words.length; c++) acc += (acc ? " " : "") + words[idx++];
                bot.innerHTML = escapeHtml(acc).replace(/\n/g, "<br>") + '<span class="typing-cursor">▌</span>';
                scrollAbajo();
                if (idx >= words.length) {
                    clearInterval(timer);
                    bot.style.transition = "opacity 0.15s ease"; bot.style.opacity = "0.6";
                    requestAnimationFrame(() => { bot.innerHTML = formatearTexto(respuestaIA); bot.style.opacity = "1"; scrollAbajo(); });
                }
            }, 22);
        } catch(e) {
            console.error(e); thinking.remove();
            const errorDiv = document.createElement("div"); errorDiv.className = "ai";
            errorDiv.style.borderColor = "#ff4040"; errorDiv.style.color = "#ff8080";
            const esLimite = e.message.toLowerCase().includes("rate") || e.message.toLowerCase().includes("limit") || e.message.includes("429");
            errorDiv.innerHTML = esLimite
                ? `⚠️ <b>Límite alcanzado.</b><br>Groq tiene un límite diario gratuito. Esperá unos minutos.`
                : `⚠️ <b>Error:</b> ${e.message}`;
            chat.appendChild(errorDiv); scrollAbajo();
        }
    }

    function addThinking() {
        const t = document.createElement("div"); t.className = "ai"; t.id = "thinking-bubble";
        t.innerHTML = `<div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div>`;
        chat.appendChild(t); scrollAbajo(); return t;
    }

    input.addEventListener("input", function() { this.style.height = "auto"; this.style.height = Math.min(this.scrollHeight, 140) + "px"; });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    window.sendMessage = sendMessage;

    window.resetChat = async () => {
        if (!currentUser) return;
        if (confirm("¿Deseas borrar tu conversación?\nEsta acción no se puede deshacer.")) {
            historial = [systemPrompt]; renderizarChat(); await guardarEnNube();
        }
    };

    // ================================================================
    //  PANEL DE ADMINISTRACIÓN COMPLETO
    // ================================================================

    window.openAdminPanel = () => {
        if (!currentUser) return;
        const overlay = document.getElementById("admin-overlay");
        if (overlay) { overlay.style.display = "flex"; buildAdminPanel(); }
    };
    window.closeAdminPanel = () => {
        const overlay = document.getElementById("admin-overlay");
        if (overlay) overlay.style.display = "none";
    };

    function buildAdminPanel() {
        const myUidEl = document.getElementById("admin-my-uid");
        if (myUidEl) myUidEl.textContent = currentUser.uid;
    }

    function fmtDate(ts) {
        if (!ts) return "—";
        const d = new Date(ts);
        return d.toLocaleDateString('es-AR', {day:'2-digit',month:'2-digit',year:'2-digit'})
               + ' ' + d.toLocaleTimeString('es-AR', {hour:'2-digit',minute:'2-digit'});
    }

    window.adminLoadUsers = async () => {
        const output = document.getElementById("admin-users-list");
        output.innerHTML = '<div class="admin-loading"><span class="admin-spin">⟳</span> Cargando usuarios...</div>';
        try {
            const {collection, getDocs} = window.firestore;
            const snap = await getDocs(collection(window.db, "chats"));
            if (snap.empty) { output.innerHTML = '<p class="admin-empty">No hay usuarios registrados.</p>'; return; }

            const adminSnap = await getDocs(collection(window.db, "admins")).catch(() => ({docs:[]}));
            const adminUids = new Set((adminSnap.docs || []).map(d => d.id));
            adminUids.add(ADMIN_UID);

            let html = `<table class="admin-table">
                <thead><tr>
                    <th>UID</th><th>Email</th><th>Nombre</th><th>Msgs</th><th>Modelo</th><th>Última actividad</th><th>Rol</th><th>Acciones</th>
                </tr></thead><tbody>`;

            snap.forEach(d => {
                const data = d.data();
                const msgs = (data.mensajes || []).filter(m => m.role !== "system").length;
                const isAdm = adminUids.has(d.id);
                const lastAct = fmtDate(data.updatedAt);
                const modeloBadge = data.model === 'pro' ? '<span style="color:#ff8888;font-size:10px;">🧠 Pro</span>' : '<span style="color:#aaa;font-size:10px;">⚡ Básico</span>';
                html += `<tr id="row-${d.id}" class="admin-user-row user-row">
                    <td class="uid-full-cell">
                        <span class="uid-short" title="${d.id}">${d.id.substring(0,10)}…</span>
                        <button class="uid-copy-btn" onclick="adminCopyUID('${d.id}')" title="Copiar UID">📋</button>
                    </td>
                    <td>${escapeHtml(data.userEmail || "—")}</td>
                    <td>${escapeHtml(data.userName || "—")}</td>
                    <td style="text-align:center;">${msgs}</td>
                    <td style="text-align:center;">${modeloBadge}</td>
                    <td>${lastAct}</td>
                    <td>
                        <span class="role-badge ${isAdm ? 'role-admin' : 'role-user'}">
                            ${isAdm ? '⚙️ Admin' : '👤 User'}
                        </span>
                    </td>
                    <td class="action-cell">
                        <button class="admin-icon-btn" title="Ver chat" onclick="adminViewUserChat('${d.id}')">💬</button>
                        ${isAdm && d.id !== ADMIN_UID
                            ? `<button class="admin-icon-btn admin-warn-btn" title="Revocar admin" onclick="adminRevokeAdmin('${d.id}')">🔻</button>`
                            : d.id !== ADMIN_UID
                                ? `<button class="admin-icon-btn admin-ok-btn" title="Promover a admin" onclick="adminPromoteUser('${d.id}')">⬆️</button>`
                                : ''}
                        <button class="admin-icon-btn admin-danger-icon-btn" title="Borrar chat" onclick="adminDeleteChat('${d.id}')">🗑️</button>
                    </td>
                </tr>`;
            });
            html += "</tbody></table>";

            const wrapHtml = `
                <div class="admin-table-toolbar">
                    <input type="text" id="admin-user-search" placeholder="🔍 Buscar usuario..." class="admin-search-input" oninput="adminFilterUsers(this.value)">
                    <span class="admin-count-badge">${snap.size} usuarios</span>
                </div>
                <div class="admin-table-scroll">${html}</div>`;
            output.innerHTML = wrapHtml;
        } catch(e) {
            output.innerHTML = `<span class="admin-error">❌ Error: ${escapeHtml(e.message)}</span>`;
        }
    };

    window.adminFilterUsers = (query) => {
        const rows = document.querySelectorAll('.admin-user-row');
        const q = query.toLowerCase();
        rows.forEach(row => { row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none'; });
    };

    window.adminCopyUID = (uid) => {
        navigator.clipboard.writeText(uid).then(() => {
            showToast("UID copiado", "#4caf50", "📋");
        }).catch(() => {
            const ta = document.createElement("textarea"); ta.value = uid;
            document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
            showToast("UID copiado", "#4caf50", "📋");
        });
    };

    window.adminViewUserChat = (uid) => {
        const inp = document.getElementById("admin-uid-input");
        if (inp) { inp.value = uid; adminLoadChat(); }
        // Cambiar al tab de chats
        if (typeof switchTab === 'function') switchTab('chat');
        document.getElementById("admin-chat-output")?.scrollIntoView({behavior:'smooth'});
    };

    window.adminLoadChat = async () => {
        const uid = document.getElementById("admin-uid-input").value.trim();
        const output = document.getElementById("admin-chat-output");
        if (!uid) { output.innerHTML = '<p class="admin-empty">Ingresá un UID.</p>'; return; }
        output.innerHTML = '<div class="admin-loading"><span class="admin-spin">⟳</span> Cargando...</div>';
        try {
            const {doc, getDoc} = window.firestore;
            const snap = await getDoc(doc(window.db, "chats", uid));
            if (!snap.exists()) { output.innerHTML = '<p class="admin-empty">Usuario no encontrado.</p>'; return; }
            const msgs = (snap.data().mensajes || []).filter(m => m.role !== "system");
            const meta = snap.data();

            let html = `<div class="admin-chat-meta">
                <span>👤 <b>${escapeHtml(meta.userName || "Sin nombre")}</b></span>
                <span>📧 ${escapeHtml(meta.userEmail || "—")}</span>
                <span>💬 ${msgs.length} mensajes</span>
                <span>🕐 ${fmtDate(meta.updatedAt)}</span>
                <button class="admin-action-btn admin-sm-btn" onclick="adminExportChat('${uid}')">⬇️ Exportar</button>
            </div>`;
            msgs.forEach(m => {
                const content = Array.isArray(m.content)
                    ? m.content.map(c => c.text || "[imagen]").join(" ")
                    : (m.content || "").substring(0, 300);
                html += `<div class="admin-msg admin-msg-${m.role}">
                    <span class="admin-msg-role">${m.role === "user" ? "👤" : "🤖"}</span>
                    <span class="admin-msg-text">${escapeHtml(content)}${content.length >= 300 ? "…" : ""}</span>
                </div>`;
            });
            output.innerHTML = html || '<p class="admin-empty">Sin mensajes.</p>';
        } catch(e) { output.innerHTML = `<span class="admin-error">❌ ${escapeHtml(e.message)}</span>`; }
    };

    window.adminExportChat = async (uid) => {
        try {
            const {doc, getDoc} = window.firestore;
            const snap = await getDoc(doc(window.db, "chats", uid));
            if (!snap.exists()) return;
            const data = snap.data();
            const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `chat_${uid.substring(0,8)}.json`; a.click(); URL.revokeObjectURL(url);
            showToast("Chat exportado", "#4caf50", "⬇️");
        } catch(e) { showToast("Error al exportar", "#ff4444", "❌"); }
    };

    window.adminPromoteUser = async (uid) => {
        if (!confirm(`¿Promover ${uid.substring(0,12)}... a ADMINISTRADOR?`)) return;
        try {
            const {doc, setDoc} = window.firestore;
            await setDoc(doc(window.db, "admins", uid), {isAdmin: true, promotedAt: Date.now(), promotedBy: currentUser.uid});
            showToast("Usuario promovido a Admin", "#4caf50", "✅");
            adminLoadUsers();
        } catch(e) { showToast("Error: " + e.message, "#ff4444", "❌"); }
    };

    window.adminRevokeAdmin = async (uid) => {
        if (!confirm(`¿Revocar privilegios de admin para ${uid.substring(0,12)}...?`)) return;
        try {
            const {doc, deleteDoc} = window.firestore;
            await deleteDoc(doc(window.db, "admins", uid));
            showToast("Privilegios revocados", "#ffaa00", "⚠️");
            adminLoadUsers();
        } catch(e) { showToast("Error: " + e.message, "#ff4444", "❌"); }
    };

    window.adminDeleteChat = async (uidParam) => {
        const uid = uidParam || document.getElementById("admin-delete-uid")?.value.trim();
        const output = document.getElementById("admin-delete-output");
        if (!uid) { if (output) output.innerHTML = '<p class="admin-empty">Ingresá un UID.</p>'; return; }
        if (!confirm(`¿Eliminar el chat del UID ${uid.substring(0,16)}...? Esta acción es irreversible.`)) return;
        if (output) output.innerHTML = '<div class="admin-loading">Eliminando...</div>';
        try {
            const {doc, deleteDoc} = window.firestore;
            await deleteDoc(doc(window.db, "chats", uid));
            if (output) output.innerHTML = '<span class="admin-success">✅ Chat eliminado correctamente.</span>';
            showToast("Chat eliminado", "#4caf50", "🗑️");
            const row = document.getElementById(`row-${uid}`);
            if (row) { row.style.opacity = "0.25"; row.style.transition = "opacity 0.4s"; }
        } catch(e) { if (output) output.innerHTML = `<span class="admin-error">❌ ${escapeHtml(e.message)}</span>`; }
    };

    window.adminLoadStats = async () => {
        const output = document.getElementById("admin-stats-output");
        output.innerHTML = '<div class="admin-loading"><span class="admin-spin">⟳</span> Calculando...</div>';
        try {
            const {collection, getDocs} = window.firestore;
            const snap = await getDocs(collection(window.db, "chats"));
            let total = 0, totalMsgs = 0, active = 0, active24h = 0, proUsers = 0, basicUsers = 0;
            const now = Date.now();
            const topUsers = [];
            snap.forEach(d => {
                total++;
                const data = d.data();
                const msgs = (data.mensajes || []).filter(m => m.role !== "system");
                totalMsgs += msgs.length;
                if (data.updatedAt && (now - data.updatedAt) < 7 * 24 * 60 * 60 * 1000) active++;
                if (data.updatedAt && (now - data.updatedAt) < 24 * 60 * 60 * 1000) active24h++;
                if (data.model === 'basic') basicUsers++; else proUsers++;
                topUsers.push({name: data.userName || "Anónimo", email: data.userEmail || "—", msgs: msgs.length, last: data.updatedAt || 0});
            });
            topUsers.sort((a, b) => b.msgs - a.msgs);
            const top5 = topUsers.slice(0, 5);
            const avgMsgs = total ? +(totalMsgs / total).toFixed(1) : 0;
            const pctActive = total ? +((active / total) * 100).toFixed(1) : 0;

            output.innerHTML = `
                <div class="admin-stats-grid">
                    <div class="admin-stat-card"><div class="stat-icon">👥</div><div class="stat-val">${total}</div><div class="stat-lbl">Usuarios totales</div></div>
                    <div class="admin-stat-card"><div class="stat-icon">🟢</div><div class="stat-val">${active}</div><div class="stat-lbl">Activos (7d)</div></div>
                    <div class="admin-stat-card"><div class="stat-icon">⚡</div><div class="stat-val">${active24h}</div><div class="stat-lbl">Activos (24h)</div></div>
                    <div class="admin-stat-card"><div class="stat-icon">💬</div><div class="stat-val">${totalMsgs}</div><div class="stat-lbl">Mensajes totales</div></div>
                    <div class="admin-stat-card"><div class="stat-icon">📊</div><div class="stat-val">${avgMsgs}</div><div class="stat-lbl">Promedio msgs/user</div></div>
                    <div class="admin-stat-card"><div class="stat-icon">📈</div><div class="stat-val">${pctActive}%</div><div class="stat-lbl">Retención 7d</div></div>
                    <div class="admin-stat-card"><div class="stat-icon">🧠</div><div class="stat-val">${proUsers}</div><div class="stat-lbl">Usan modelo Pro</div></div>
                    <div class="admin-stat-card"><div class="stat-icon">⚡</div><div class="stat-val">${basicUsers}</div><div class="stat-lbl">Usan modelo Básico</div></div>
                </div>
                <div class="admin-top-users">
                    <h4 style="color:#ff8888;font-size:12px;margin:18px 0 10px;">🏆 Top usuarios por actividad</h4>
                    ${top5.map((u, i) => `
                        <div class="admin-top-user-row">
                            <span class="top-rank">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</span>
                            <span class="top-name">${escapeHtml(u.name)}</span>
                            <span class="top-email" style="color:#666;font-size:11px;">${escapeHtml(u.email)}</span>
                            <span class="top-msgs">${u.msgs} msgs</span>
                            <span class="top-date">${fmtDate(u.last)}</span>
                        </div>`).join('')}
                </div>`;
        } catch(e) { output.innerHTML = `<span class="admin-error">❌ ${escapeHtml(e.message)}</span>`; }
    };

    // ── Mensaje privado ──
    window.adminSendPrivateMessage = async () => {
        const uid = document.getElementById("admin-pm-uid")?.value.trim();
        const msg = document.getElementById("admin-pm-msg")?.value.trim();
        const output = document.getElementById("admin-pm-output");
        if (!uid || !msg) { output.innerHTML = '<p class="admin-empty">Completá UID y mensaje.</p>'; return; }
        output.innerHTML = '<div class="admin-loading">Enviando...</div>';
        try {
            const {doc, setDoc} = window.firestore;
            await setDoc(doc(window.db, "private_messages", uid), {
                message: msg, from: "admin", timestamp: Date.now(), read: false,
            });
            output.innerHTML = '<span class="admin-success">✅ Mensaje enviado.</span>';
            showToast("Mensaje privado enviado", "#4caf50", "✉️");
        } catch(e) { output.innerHTML = `<span class="admin-error">❌ ${escapeHtml(e.message)}</span>`; }
    };

    // ── Broadcast ──
    window.adminSendBroadcast = async () => {
        const msg = document.getElementById("admin-broadcast-msg").value.trim();
        const output = document.getElementById("admin-broadcast-output");
        if (!msg) { output.innerHTML = '<p class="admin-empty">Escribí un mensaje.</p>'; return; }
        output.innerHTML = '<div class="admin-loading">Guardando...</div>';
        try {
            const {doc, setDoc} = window.firestore;
            await setDoc(doc(window.db, "config", "broadcast"), {message: msg, timestamp: Date.now(), active: true, sentBy: currentUser.uid});
            output.innerHTML = '<span class="admin-success">✅ Broadcast activo.</span>';
            showToast("Broadcast enviado a todos", "#4caf50", "📢");
        } catch(e) { output.innerHTML = `<span class="admin-error">❌ ${escapeHtml(e.message)}</span>`; }
    };

    window.adminClearBroadcast = async () => {
        const output = document.getElementById("admin-broadcast-output");
        try {
            const {doc, setDoc} = window.firestore;
            await setDoc(doc(window.db, "config", "broadcast"), {active: false, message: "", timestamp: Date.now()});
            output.innerHTML = '<span class="admin-success">✅ Broadcast desactivado.</span>';
            showToast("Broadcast desactivado", "#ffaa00", "🔕");
        } catch(e) { showToast("Error", "#ff4444", "❌"); }
    };

    window._checkBroadcast = async () => {
        try {
            const {doc, getDoc} = window.firestore;
            const snap = await getDoc(doc(window.db, "config", "broadcast"));
            if (!snap.exists()) return;
            const data = snap.data();
            if (!data.active || !data.message) return;
            const key = "cutreal_broadcast_seen_" + data.timestamp;
            if (sessionStorage.getItem(key)) return;
            sessionStorage.setItem(key, "1");
            const banner = document.createElement("div"); banner.className = "broadcast-banner";
            banner.innerHTML = `<span>📢 ${escapeHtml(data.message)}</span><button onclick="this.parentElement.remove()">✕</button>`;
            document.body.insertBefore(banner, document.body.firstChild);
        } catch(e) {}
    };

    window._checkPrivateMessage = async () => {
        if (!currentUser) return;
        try {
            const {doc, getDoc, setDoc} = window.firestore;
            const snap = await getDoc(doc(window.db, "private_messages", currentUser.uid));
            if (!snap.exists()) return;
            const data = snap.data();
            if (!data.message || data.read) return;
            // Marcar como leído
            await setDoc(doc(window.db, "private_messages", currentUser.uid), {...data, read: true});
            showToast(`📩 Mensaje del admin: ${data.message.substring(0, 50)}${data.message.length > 50 ? '…' : ''}`, "#ff8888", "");
            // También mostrar en el chat
            const bot = document.createElement("div"); bot.className = "ai";
            bot.innerHTML = `📩 <b>Mensaje del administrador:</b><br>${escapeHtml(data.message)}`;
            bot.style.borderColor = "rgba(255, 200, 50, 0.4)";
            chat.appendChild(bot); scrollAbajo();
        } catch(e) {}
    };

    window.adminLoadAdmins = async () => {
        const out = document.getElementById("admin-admins-list");
        out.innerHTML = '<em>Cargando…</em>';
        try {
            const {collection, getDocs} = window.firestore;
            const snap = await getDocs(collection(window.db, "admins"));
            if (snap.empty) { out.innerHTML = 'No hay admins adicionales.'; return; }
            let html = '<ul style="padding:0;margin:0;list-style:none;">';
            snap.forEach(d => {
                html += `<li style="padding:8px 0;border-bottom:1px solid rgba(255,59,59,0.1);display:flex;align-items:center;gap:10px;justify-content:space-between;">
                    <span style="color:#ff8888;font-family:monospace;font-size:11px;">${d.id}</span>
                    <button onclick="adminRevokeAdmin('${d.id}')" class="admin-btn-danger" style="padding:4px 12px;font-size:11px;">Revocar</button>
                </li>`;
            });
            html += '</ul>';
            out.innerHTML = html;
        } catch(e) { out.innerHTML = `<span class="admin-error">❌ ${escapeHtml(e.message)}</span>`; }
    };

    // ── Buscar usuario por email ──
    window.adminSearchByEmail = async () => {
        const emailInput = document.getElementById("admin-email-search");
        const output = document.getElementById("admin-email-result");
        const query = (emailInput?.value || "").trim().toLowerCase();
        if (!query) { output.innerHTML = '<p class="admin-empty">Ingresá un email o nombre.</p>'; return; }
        output.innerHTML = '<div class="admin-loading"><span class="admin-spin">⟳</span> Buscando...</div>';
        try {
            const {collection, getDocs} = window.firestore;
            const snap = await getDocs(collection(window.db, "chats"));
            const results = [];
            snap.forEach(d => {
                const data = d.data();
                if ((data.userEmail || "").toLowerCase().includes(query) || (data.userName || "").toLowerCase().includes(query))
                    results.push({uid: d.id, ...data});
            });
            if (!results.length) { output.innerHTML = '<p class="admin-empty">No se encontraron resultados.</p>'; return; }
            output.innerHTML = results.map(r => `
                <div class="admin-search-result">
                    <div><b>${escapeHtml(r.userName || "Sin nombre")}</b> <span style="color:#888;font-size:11px;">${escapeHtml(r.userEmail || "—")}</span></div>
                    <div style="font-size:11px;color:#666;margin-top:3px;">UID: ${r.uid.substring(0, 16)}… · ${(r.mensajes || []).filter(m => m.role !== "system").length} mensajes · ${fmtDate(r.updatedAt)}</div>
                    <div style="margin-top:6px;display:flex;gap:6px;">
                        <button class="admin-action-btn admin-sm-btn" onclick="adminViewUserChat('${r.uid}')">💬 Ver chat</button>
                        <button class="admin-action-btn admin-sm-btn" onclick="adminCopyUID('${r.uid}')">📋 UID</button>
                        <button class="admin-action-btn admin-sm-btn" style="color:#ff6060;" onclick="adminDeleteChat('${r.uid}')">🗑️ Borrar</button>
                    </div>
                </div>`).join('');
        } catch(e) { output.innerHTML = `<span class="admin-error">❌ ${escapeHtml(e.message)}</span>`; }
    };

    window.adminToggleMaintenance = async () => {
        const output = document.getElementById("admin-tools-output");
        try {
            const {doc, getDoc, setDoc} = window.firestore;
            const snap = await getDoc(doc(window.db, "config", "maintenance"));
            const current = snap.exists() && snap.data().active;
            await setDoc(doc(window.db, "config", "maintenance"), {active: !current, timestamp: Date.now()});
            output.innerHTML = `<span class="admin-success">✅ Mantenimiento ${!current ? "activado" : "desactivado"}.</span>`;
            showToast(`Mantenimiento ${!current ? "ON" : "OFF"}`, !current ? "#ffaa00" : "#4caf50", "🔧");
        } catch(e) { output.innerHTML = `<span class="admin-error">❌ ${escapeHtml(e.message)}</span>`; }
    };

    window.adminCleanupInactive = async () => {
        const output = document.getElementById("admin-tools-output");
        if (!confirm("¿Eliminar todos los chats inactivos por más de 90 días?")) return;
        output.innerHTML = '<div class="admin-loading"><span class="admin-spin">⟳</span> Buscando...</div>';
        try {
            const {collection, getDocs, doc, deleteDoc} = window.firestore;
            const snap = await getDocs(collection(window.db, "chats"));
            const now = Date.now(); const limit90 = 90 * 24 * 60 * 60 * 1000;
            let count = 0;
            const promises = [];
            snap.forEach(d => {
                const data = d.data();
                if (!data.updatedAt || (now - data.updatedAt) > limit90) {
                    promises.push(deleteDoc(doc(window.db, "chats", d.id)));
                    count++;
                }
            });
            await Promise.all(promises);
            output.innerHTML = `<span class="admin-success">✅ ${count} chats eliminados.</span>`;
            showToast(`${count} chats limpiados`, "#4caf50", "🧹");
        } catch(e) { output.innerHTML = `<span class="admin-error">❌ ${escapeHtml(e.message)}</span>`; }
    };

    // ── Exportar todos los datos ──
    window.adminExportData = async () => {
        const out = document.getElementById("admin-tools-output");
        out.innerHTML = '<em>Exportando…</em>';
        try {
            const {collection, getDocs} = window.firestore;
            const snap = await getDocs(collection(window.db, "chats"));
            const data = [];
            snap.forEach(d => { data.push({uid: d.id, ...d.data()}); });
            const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = "cutreal-export-" + Date.now() + ".json"; a.click(); URL.revokeObjectURL(url);
            out.innerHTML = `<span class="admin-success">✅ Exportado (${data.length} usuarios).</span>`;
        } catch(e) { out.innerHTML = `<span class="admin-error">❌ ${escapeHtml(e.message)}</span>`; }
    };

    window.adminPurgeOldChats = async () => {
        if (!confirm("⚠️ Esto eliminará PERMANENTEMENTE los chats de usuarios inactivos por más de 30 días. ¿Continuar?")) return;
        const out = document.getElementById("admin-tools-output");
        out.innerHTML = '<em>Purgando…</em>';
        try {
            const {collection, getDocs, doc, deleteDoc} = window.firestore;
            const snap = await getDocs(collection(window.db, "chats"));
            const limit = Date.now() - 30 * 24 * 60 * 60 * 1000;
            let count = 0;
            for (const d of snap.docs) {
                const data = d.data();
                if (!data.updatedAt || data.updatedAt < limit) {
                    await deleteDoc(doc(window.db, "chats", d.id));
                    count++;
                }
            }
            out.innerHTML = `<span class="admin-success">✅ Purgados ${count} chats.</span>`;
        } catch(e) { out.innerHTML = `<span class="admin-error">❌ ${escapeHtml(e.message)}</span>`; }
    };

    // ── Estadísticas de uso de modelos ──
    window.adminLoadModelStats = async () => {
        const out = document.getElementById("admin-model-stats");
        if (!out) return;
        out.innerHTML = '<div class="admin-loading"><span class="admin-spin">⟳</span></div>';
        try {
            const {collection, getDocs} = window.firestore;
            const snap = await getDocs(collection(window.db, "chats"));
            let proCount = 0, basicCount = 0, totalMsgs = 0;
            snap.forEach(d => {
                const data = d.data();
                if (data.model === 'basic') basicCount++; else proCount++;
                totalMsgs += (data.mensajes || []).filter(m => m.role !== "system").length;
            });
            const total = proCount + basicCount;
            out.innerHTML = `
                <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;">
                    <div class="admin-stat-card" style="flex:1;min-width:130px;"><div class="stat-icon">🧠</div><div class="stat-val">${proCount}</div><div class="stat-lbl">Usan Pro (${total ? Math.round(proCount/total*100) : 0}%)</div></div>
                    <div class="admin-stat-card" style="flex:1;min-width:130px;"><div class="stat-icon">⚡</div><div class="stat-val">${basicCount}</div><div class="stat-lbl">Usan Básico (${total ? Math.round(basicCount/total*100) : 0}%)</div></div>
                    <div class="admin-stat-card" style="flex:1;min-width:130px;"><div class="stat-icon">💬</div><div class="stat-val">${totalMsgs}</div><div class="stat-lbl">Total mensajes</div></div>
                </div>`;
        } catch(e) { out.innerHTML = `<span class="admin-error">❌ ${escapeHtml(e.message)}</span>`; }
    };

});

// ===== DOOM — apertura/cierre =====
window.openDoom = function() {
    const overlay = document.getElementById("doom-overlay");
    if (overlay) {
        overlay.style.display = "block";
        // Forzar re-paint antes de iniciar el engine
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                    if (typeof startDoom === "function") startDoom();
                });
            });
        });
    }
};

window.closeDoom = function() {
    const overlay = document.getElementById("doom-overlay");
    if (overlay) overlay.style.display = "none";
    if (typeof stopDoom === "function") stopDoom();
};

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
        splashScreen.style.opacity = "1";
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
