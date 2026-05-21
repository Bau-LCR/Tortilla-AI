// Configurar PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// ===== CONSTANTES =====
const ADMIN_UID  = "8qZG7egWbIeMy7HqtwkKEdLasMw2";
const TERMS_KEY  = "cutreal_terms_accepted";

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
    const showToast = (msg, color = "#ff3b3b") => {
        const existing = document.querySelector(".toast-notif");
        if (existing) existing.remove();
        const toast = document.createElement("div");
        toast.className = "toast-notif";
        toast.textContent = msg;
        toast.style.cssText = `
            position:fixed;bottom:100px;left:50%;transform:translateX(-50%) translateY(10px);
            background:rgba(12,12,12,0.95);color:${color};border:1px solid ${color}44;
            padding:8px 18px;border-radius:999px;font-size:13px;font-family:'Inter',sans-serif;
            font-weight:500;z-index:5000;pointer-events:none;
            animation:toastIn 0.25s ease forwards;
            box-shadow:0 4px 20px rgba(0,0,0,0.5);
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = "toastOut 0.25s ease forwards";
            setTimeout(() => toast.remove(), 260);
        }, 2200);
    };

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

    // ===== FUNCIÓN COMPARTIDA DE PROCESAMIENTO DE IMAGEN =====
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
            if (ok) showToast("📷 Foto lista para enviar", "#4caf50");
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
                if (ok) { showToast("📋 Imagen pegada desde portapapeles", "#4caf50"); input.focus(); }
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
                        // Mostrar imágenes generadas guardadas en historial
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

                    // Verificar si el usuario tiene rol admin en Firestore
                    const isAdmin = user.uid === ADMIN_UID || await checkAdminRole(user.uid);
                    if (isAdmin && adminBtn) {
                        adminBtn.style.display = "block";
                        const myUidEl = document.getElementById("admin-my-uid");
                        if (myUidEl) myUidEl.textContent = "UID: " + user.uid;
                    }

                    cargarDeNube(user.uid);
                    setTimeout(() => window._checkBroadcast && window._checkBroadcast(), 3000);
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

    // ===== DETECTAR INTENCIÓN DEL MENSAJE =====
    function detectIntent(msg) {
        const lower = msg.toLowerCase();
        // Generación de imagen
        if (/genera(r|me|nos)?|crea(r|me|nos)?|dibuja(r|me)?|hace(r|me)?|diseña(r|me)?/.test(lower) &&
            /imagen|foto|ilustración|dibujo|arte|logo|banner|poster|icono/.test(lower)) {
            return 'generate_image';
        }
        // Búsqueda de imagen
        if (/busca(r|me)?|muestra(me)?|encuentra|enséña(me)?/.test(lower) &&
            /imagen(es)?|foto(s)?|imagen de|fotos de/.test(lower)) {
            return 'search_image';
        }
        // YouTube
        if (/video(s)?|youtube|ver|mira(r)?|tutorial(es)?|explicación en video/.test(lower)) {
            return 'youtube';
        }
        return 'chat';
    }

    // ===== GENERAR IMAGEN CON CANVAS (IA de dibujo sintético) =====
    function generateImageWithCanvas(prompt) {
        return new Promise((resolve) => {
            const canvas = document.createElement("canvas");
            canvas.width = 512; canvas.height = 512;
            const ctx = canvas.getContext("2d");
            const p = prompt.toLowerCase();

            // Paleta semántica según palabras clave
            let palette = { bg: ['#1a0a2e','#0d0022'], accent: ['#ff3b3b','#cc0000'], fg: '#ffffff' };
            if (/naturaleza|árbol|bosque|campo|planta|flor|verde/.test(p))
                palette = { bg: ['#0a1a0a','#002200'], accent: ['#22cc44','#88ff88'], fg: '#ccffcc' };
            else if (/mar|ocean|agua|playa|ola|azul/.test(p))
                palette = { bg: ['#000a1a','#001133'], accent: ['#2244ff','#44aaff'], fg: '#aaddff' };
            else if (/fuego|llama|calor|rojo|lava/.test(p))
                palette = { bg: ['#1a0000','#330000'], accent: ['#ff4400','#ffaa00'], fg: '#ffddaa' };
            else if (/galaxia|espacio|cosmos|estrellas|planeta/.test(p))
                palette = { bg: ['#000005','#05000f'], accent: ['#8844ff','#ff44ff'], fg: '#ddaaff' };
            else if (/ciudad|urbano|noche|rascacielos|metro/.test(p))
                palette = { bg: ['#050510','#100a20'], accent: ['#4488ff','#ffcc00'], fg: '#aabbff' };
            else if (/robot|maquina|metal|tecnología|cyber/.test(p))
                palette = { bg: ['#050a05','#0a1410'], accent: ['#00ffaa','#00cc88'], fg: '#aaffdd' };
            else if (/dorado|oro|sol|amarillo|luz/.test(p))
                palette = { bg: ['#1a1000','#201500'], accent: ['#ffcc00','#ffaa00'], fg: '#fff0aa' };

            // Fondo con degradado
            const bgGrd = ctx.createLinearGradient(0, 0, 512, 512);
            bgGrd.addColorStop(0, palette.bg[0]);
            bgGrd.addColorStop(1, palette.bg[1]);
            ctx.fillStyle = bgGrd;
            ctx.fillRect(0, 0, 512, 512);

            // Capa de ruido / textura
            for (let i = 0; i < 3000; i++) {
                const x = Math.random() * 512, y = Math.random() * 512;
                const a = Math.random() * 0.06;
                ctx.fillStyle = `rgba(255,255,255,${a})`;
                ctx.fillRect(x, y, 1, 1);
            }

            // Capas de formas abstractas
            const seed = prompt.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
            const rng  = (n) => Math.abs(Math.sin(seed * n * 7.3 + n * 3.14)) ;

            // Círculos / esferas de fondo
            for (let i = 0; i < 6; i++) {
                const cx = rng(i * 2 + 1) * 512;
                const cy = rng(i * 2 + 2) * 512;
                const r  = 30 + rng(i + 10) * 140;
                const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
                const col = palette.accent[i % palette.accent.length];
                grd.addColorStop(0, col + '33');
                grd.addColorStop(1, col + '00');
                ctx.fillStyle = grd;
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
            }

            // Líneas de energía
            ctx.globalCompositeOperation = 'screen';
            for (let i = 0; i < 14; i++) {
                const x1 = rng(i*4+1)*512, y1 = rng(i*4+2)*512;
                const x2 = rng(i*4+3)*512, y2 = rng(i*4+4)*512;
                const col = palette.accent[i % palette.accent.length];
                const grd2 = ctx.createLinearGradient(x1, y1, x2, y2);
                grd2.addColorStop(0, col + '00');
                grd2.addColorStop(0.5, col + 'aa');
                grd2.addColorStop(1, col + '00');
                ctx.strokeStyle = grd2;
                ctx.lineWidth = 0.5 + rng(i+20) * 2;
                ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            }
            ctx.globalCompositeOperation = 'source-over';

            // Forma central destacada según tema
            const cx = 256, cy = 220;
            if (/estrella|sol|luz/.test(p)) {
                // Estrella
                drawStar(ctx, cx, cy, 80, 40, 8, palette.accent[0]);
            } else if (/corazon|amor|love/.test(p)) {
                drawHeart(ctx, cx, cy, 90, palette.accent[0]);
            } else if (/casa|hogar|home/.test(p)) {
                drawHouse(ctx, cx, cy + 30, 130, palette.accent[0]);
            } else if (/robot|android/.test(p)) {
                drawRobot(ctx, cx, cy, 80, palette.accent[0]);
            } else {
                // Forma abstracta por defecto
                const grdC = ctx.createRadialGradient(cx, cy, 10, cx, cy, 100);
                grdC.addColorStop(0, palette.accent[0] + 'ff');
                grdC.addColorStop(0.5, palette.accent[1 % palette.accent.length] + '88');
                grdC.addColorStop(1, palette.bg[0] + '00');
                ctx.fillStyle = grdC;
                ctx.beginPath();
                for (let a = 0; a < Math.PI * 2; a += 0.05) {
                    const r = 60 + Math.sin(a * (3 + (seed % 4))) * 30 + Math.cos(a * 7) * 15;
                    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
                    a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                }
                ctx.closePath(); ctx.fill();
            }

            // Partículas decorativas
            for (let i = 0; i < 40; i++) {
                const px = rng(i*5+1)*512, py = rng(i*5+2)*512;
                const pr = rng(i+50)*3 + 0.5;
                const pa = 0.4 + rng(i+60)*0.6;
                ctx.fillStyle = palette.accent[i%palette.accent.length] + Math.floor(pa*255).toString(16).padStart(2,'0');
                ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI*2); ctx.fill();
            }

            // Viñeta
            const vignette = ctx.createRadialGradient(256, 256, 100, 256, 256, 380);
            vignette.addColorStop(0, 'rgba(0,0,0,0)');
            vignette.addColorStop(1, 'rgba(0,0,0,0.65)');
            ctx.fillStyle = vignette;
            ctx.fillRect(0, 0, 512, 512);

            // Texto del prompt (pequeño, en la parte inferior)
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.font = '11px monospace';
            ctx.textAlign = 'center';
            const shortPrompt = prompt.length > 48 ? prompt.substring(0, 48) + '…' : prompt;
            ctx.fillText(shortPrompt, 256, 498);
            ctx.textAlign = 'left';

            resolve(canvas.toDataURL("image/png"));
        });
    }

    // Funciones auxiliares de dibujo
    function drawStar(ctx, cx, cy, outerR, innerR, points, color) {
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerR);
        grd.addColorStop(0, color); grd.addColorStop(1, color + '44');
        ctx.fillStyle = grd;
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const r = i % 2 === 0 ? outerR : innerR;
            const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
            i === 0 ? ctx.moveTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r)
                    : ctx.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r);
        }
        ctx.closePath(); ctx.fill();
    }

    function drawHeart(ctx, cx, cy, size, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(cx, cy + size * 0.3);
        ctx.bezierCurveTo(cx, cy - size * 0.3, cx - size, cy - size * 0.3, cx - size, cy);
        ctx.bezierCurveTo(cx - size, cy + size * 0.55, cx, cy + size * 0.8, cx, cy + size);
        ctx.bezierCurveTo(cx, cy + size * 0.8, cx + size, cy + size * 0.55, cx + size, cy);
        ctx.bezierCurveTo(cx + size, cy - size * 0.3, cx, cy - size * 0.3, cx, cy + size * 0.3);
        ctx.fill();
    }

    function drawHouse(ctx, cx, cy, size, color) {
        ctx.fillStyle = color + '88';
        ctx.fillRect(cx - size/2, cy - size*0.4, size, size*0.5);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(cx - size*0.6, cy - size*0.4);
        ctx.lineTo(cx, cy - size*0.85);
        ctx.lineTo(cx + size*0.6, cy - size*0.4);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = color + '44';
        ctx.fillRect(cx - size*0.12, cy - size*0.1, size*0.24, size*0.2);
    }

    function drawRobot(ctx, cx, cy, size, color) {
        ctx.fillStyle = color + '88';
        ctx.fillRect(cx - size*0.35, cy - size*0.6, size*0.7, size*0.5);
        ctx.fillRect(cx - size*0.25, cy - size*0.85, size*0.5, size*0.3);
        ctx.fillStyle = color;
        ctx.fillRect(cx - size*0.15, cy - size*0.78, size*0.1, size*0.14);
        ctx.fillRect(cx + size*0.05, cy - size*0.78, size*0.1, size*0.14);
        ctx.fillStyle = color + '66';
        ctx.fillRect(cx - size*0.25, cy - size*0.1, size*0.5, size*0.5);
        ctx.fillRect(cx - size*0.52, cy - size*0.05, size*0.15, size*0.4);
        ctx.fillRect(cx + size*0.37, cy - size*0.05, size*0.15, size*0.4);
    }

    // ===== BUSCAR IMÁGENES EN GOOGLE (embed) =====
    function buildImageSearchHTML(query) {
        const q = encodeURIComponent(query);
        // Usamos una cuadrícula de imágenes de Unsplash (libre de derechos, API pública)
        const unsplashQ = encodeURIComponent(query);
        const imgs = Array.from({length:6}, (_,i) => i + 1).map(i =>
            `<img
                src="https://source.unsplash.com/200x200/?${unsplashQ}&sig=${i}"
                class="search-result-img"
                alt="${query}"
                onclick="window.open(this.src,'_blank')"
                onerror="this.style.display='none'"
            >`
        ).join('');
        return `
            <div class="img-search-grid">
                <p style="color:#ff8888;font-size:13px;margin:0 0 8px;">
                    🔍 Imágenes de: <b>${escapeHtml(query)}</b> (Unsplash)
                </p>
                <div class="img-grid-inner">${imgs}</div>
                <a href="https://unsplash.com/s/photos/${unsplashQ}" target="_blank"
                   style="font-size:11px;color:#ff6666;text-decoration:underline;">
                   Ver más en Unsplash →
                </a>
            </div>
        `;
    }

    // ===== BUSCAR VIDEOS DE YOUTUBE =====
    function buildYouTubeSearchHTML(query) {
        const q = encodeURIComponent(query);
        // Embed de búsqueda de YouTube (no requiere API key)
        return `
            <div class="yt-search-container">
                <p style="color:#ff8888;font-size:13px;margin:0 0 8px;">
                    ▶️ Videos de YouTube relacionados con: <b>${escapeHtml(query)}</b>
                </p>
                <div class="yt-cards-row">
                    <a class="yt-card" href="https://www.youtube.com/results?search_query=${q}" target="_blank">
                        <div class="yt-thumb">
                            <img src="https://i.ytimg.com/vi/default/hqdefault.jpg" alt="youtube"
                                 onerror="this.src=''" style="width:100%;height:100%;object-fit:cover;opacity:0.3">
                            <span class="yt-play-icon">▶</span>
                        </div>
                        <div class="yt-card-info">
                            <span class="yt-card-title">${escapeHtml(query)}</span>
                            <span class="yt-card-sub">Ver resultados en YouTube →</span>
                        </div>
                    </a>
                </div>
                <a href="https://www.youtube.com/results?search_query=${q}" target="_blank"
                   style="font-size:11px;color:#ff6666;text-decoration:underline;">
                   Buscar "${query}" en YouTube →
                </a>
            </div>
        `;
    }

    // ===== ENVIAR MENSAJE PRINCIPAL =====
    async function sendMessage() {
        const rawMsg = input.value.trim();
        if (!rawMsg && !attachedFile) return;
        if (!currentUser) return;

        // Easter Egg: DOOM
        if (rawMsg.toLowerCase().replace(/\s+/g, " ").trim() === "doom 1993") {
            input.value = "";
            input.style.height = "auto";
            openDoom();
            return;
        }

        // Detectar intención
        const intent = rawMsg ? detectIntent(rawMsg) : 'chat';

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

        const userDiv     = document.createElement("div");
        userDiv.className = "user";
        userDiv.innerHTML = previewHTML;
        chat.appendChild(userDiv);

        input.value        = "";
        input.style.height = "auto";
        scrollAbajo();

        // ===== MANEJO DE INTENCIONES ESPECIALES =====

        // 1) GENERAR IMAGEN
        if (intent === 'generate_image' && !attachedFile) {
            const thinking = addThinking();
            try {
                // Extraer descripción para la imagen
                const imgPrompt = rawMsg
                    .replace(/genera(r|me|nos)?|crea(r|me|nos)?|dibuja(r|me)?|hace(r|me)?|diseña(r|me)?/gi, '')
                    .replace(/una?|el|la|los|las|imagen|ilustración|foto|dibujo|arte|logo|banner|poster|de|del|un|una/gi, '')
                    .trim() || rawMsg;

                const dataUrl = await generateImageWithCanvas(imgPrompt);

                thinking.remove();

                const bot     = document.createElement("div");
                bot.className = "ai";
                bot.innerHTML = `
                    🎨 <b>Imagen generada</b> para: <em>${escapeHtml(imgPrompt)}</em><br><br>
                    <img src="${dataUrl}" class="attached-image generated-image" alt="Imagen generada" style="max-height:320px;cursor:zoom-in;" onclick="window.open(this.src,'_blank')">
                    <br><span style="font-size:11px;color:#888;">Haz click en la imagen para verla en tamaño completo · <a href="${dataUrl}" download="cutreal-imagen.png" style="color:#ff8888;">Descargar</a></span>
                `;
                chat.appendChild(bot);
                scrollAbajo();

                historial.push({ role: "assistant", content: `[Imagen generada para: "${imgPrompt}"]` });
                guardarEnNube();
                return;
            } catch(e) {
                thinking.remove();
            }
        }

        // 2) BÚSQUEDA DE IMÁGENES
        if (intent === 'search_image' && !attachedFile) {
            const thinking = addThinking();
            // Extraer término de búsqueda
            const searchTerm = rawMsg
                .replace(/busca(r|me)?|muestra(me)?|encuentra|enséña(me)?/gi, '')
                .replace(/imagen(es)?|foto(s)?/gi, '')
                .trim() || rawMsg;

            setTimeout(() => {
                thinking.remove();
                const bot = document.createElement("div");
                bot.className = "ai";
                bot.innerHTML = buildImageSearchHTML(searchTerm);
                chat.appendChild(bot);
                scrollAbajo();
                historial.push({ role: "assistant", content: `[Búsqueda de imágenes: "${searchTerm}"]` });
                guardarEnNube();
            }, 600);
            return;
        }

        // 3) BÚSQUEDA DE YOUTUBE
        if (intent === 'youtube' && !attachedFile) {
            const thinking = addThinking();
            const searchTerm = rawMsg
                .replace(/busca(r|me)?|muestra(me)?|mira(r)?|ver|encuentra/gi, '')
                .replace(/video(s)?|youtube|tutorial(es)?/gi, '')
                .trim() || rawMsg;

            setTimeout(() => {
                thinking.remove();
                const bot = document.createElement("div");
                bot.className = "ai";
                bot.innerHTML = buildYouTubeSearchHTML(searchTerm);
                chat.appendChild(bot);
                scrollAbajo();
                historial.push({ role: "assistant", content: `[Búsqueda de YouTube: "${searchTerm}"]` });
                guardarEnNube();
            }, 500);
            return;
        }

        // 4) CHAT NORMAL
        const thinking = addThinking();

        try {
            const res = await fetch("/api/chat", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ mensajes: historial, hasImage }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error en el servidor");

            const respuestaIA = data.choices[0].message.content;
            historial.push({ role: "assistant", content: respuestaIA });
            guardarEnNube();

            thinking.remove();

            const bot     = document.createElement("div");
            bot.className = "ai";
            chat.appendChild(bot);
            scrollAbajo();

            // Animación de escritura
            const words = respuestaIA.split(" ");
            let idx = 0, acc = "";
            const CHUNK = 4;
            const timer = setInterval(() => {
                for (let c = 0; c < CHUNK && idx < words.length; c++) {
                    acc += (acc ? " " : "") + words[idx++];
                }
                bot.innerHTML = escapeHtml(acc).replace(/\n/g, "<br>") + '<span class="typing-cursor">▌</span>';
                scrollAbajo();
                if (idx >= words.length) {
                    clearInterval(timer);
                    bot.style.transition = "opacity 0.15s ease";
                    bot.style.opacity    = "0.6";
                    requestAnimationFrame(() => {
                        bot.innerHTML    = formatearTexto(respuestaIA);
                        bot.style.opacity = "1";
                        scrollAbajo();
                    });
                }
            }, 22);

        } catch (e) {
            console.error(e);
            thinking.remove();

            const errorDiv     = document.createElement("div");
            errorDiv.className = "ai";
            errorDiv.style.borderColor = "#ff4040";
            errorDiv.style.color       = "#ff8080";

            const esLimite = e.message.toLowerCase().includes("rate") ||
                             e.message.toLowerCase().includes("limit") ||
                             e.message.includes("429");

            errorDiv.innerHTML = esLimite
                ? `⚠️ <b>Límite de consultas alcanzado.</b><br>Groq tiene un límite diario gratuito. Esperá unos minutos y volvé a intentarlo.`
                : `⚠️ <b>Error:</b> ${e.message}`;

            chat.appendChild(errorDiv);
            scrollAbajo();
        }
    }

    function addThinking() {
        const thinking     = document.createElement("div");
        thinking.className = "ai";
        thinking.id        = "thinking-bubble";
        thinking.innerHTML = `<div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div>`;
        chat.appendChild(thinking);
        scrollAbajo();
        return thinking;
    }

    input.addEventListener("input", function () {
        this.style.height = "auto";
        this.style.height = Math.min(this.scrollHeight, 140) + "px";
    });

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
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

    // ===== PANEL ADMIN MEJORADO =====
    window.openAdminPanel = () => {
        if (!currentUser) return;
        document.getElementById("admin-overlay").style.display = "flex";
        const myUidEl = document.getElementById("admin-my-uid");
        if (myUidEl) myUidEl.textContent = currentUser.uid;
    };

    window.closeAdminPanel = () => {
        document.getElementById("admin-overlay").style.display = "none";
    };

    // Ver todos los usuarios (UID completo + botón copiar + botón promover)
    window.adminLoadUsers = async () => {
        const output = document.getElementById("admin-users-list");
        output.innerHTML = "<em>Cargando...</em>";
        try {
            const { collection, getDocs, doc, getDoc } = window.firestore;
            const snap = await getDocs(collection(window.db, "chats"));
            if (snap.empty) { output.innerHTML = "No hay usuarios registrados."; return; }

            // Obtener lista de admins
            const adminSnap = await getDocs(collection(window.db, "admins")).catch(() => ({ docs: [] }));
            const adminUids = new Set(adminSnap.docs?.map(d => d.id) || []);
            adminUids.add(ADMIN_UID);

            let html = `
                <table class="admin-table">
                    <thead><tr>
                        <th>UID completo</th>
                        <th>Email</th>
                        <th>Nombre</th>
                        <th>Msgs</th>
                        <th>Rol</th>
                        <th>Acciones</th>
                    </tr></thead><tbody>
            `;
            snap.forEach(d => {
                const data = d.data();
                const msgs = (data.mensajes || []).filter(m => m.role !== "system").length;
                const isAdm = adminUids.has(d.id);
                html += `
                    <tr id="row-${d.id}">
                        <td class="uid-full-cell">
                            <span class="uid-full">${d.id}</span>
                            <button class="uid-copy-btn" onclick="adminCopyUID('${d.id}')" title="Copiar UID">📋</button>
                        </td>
                        <td>${data.userEmail || "-"}</td>
                        <td>${data.userName  || "-"}</td>
                        <td>${msgs}</td>
                        <td>
                            <span class="role-badge ${isAdm ? 'role-admin' : 'role-user'}">
                                ${isAdm ? '⚙️ Admin' : '👤 User'}
                            </span>
                        </td>
                        <td class="action-cell">
                            ${isAdm && d.id !== ADMIN_UID
                                ? `<button class="admin-action-btn admin-sm-btn" onclick="adminRevokeAdmin('${d.id}')">❌ Revocar</button>`
                                : d.id !== ADMIN_UID
                                    ? `<button class="admin-action-btn admin-sm-btn" onclick="adminPromoteUser('${d.id}')">⬆️ Promover</button>`
                                    : '<span style="color:#888;font-size:11px;">Superadmin</span>'
                            }
                            <button class="admin-action-btn admin-sm-btn admin-danger-btn" onclick="adminDeleteChat('${d.id}')">🗑️</button>
                        </td>
                    </tr>
                `;
            });
            html += "</tbody></table>";
            output.innerHTML = html;
        } catch(e) {
            output.innerHTML = `<span style="color:#ff5555;">Error: ${e.message}</span>`;
        }
    };

    // Copiar UID al portapapeles
    window.adminCopyUID = (uid) => {
        navigator.clipboard.writeText(uid).then(() => {
            showToast("UID copiado: " + uid.substring(0, 12) + "...", "#4caf50");
        }).catch(() => {
            // Fallback
            const ta = document.createElement("textarea");
            ta.value = uid;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
            showToast("UID copiado al portapapeles", "#4caf50");
        });
    };

    // Promover usuario a admin
    window.adminPromoteUser = async (uid) => {
        if (!confirm(`¿Promover el usuario ${uid.substring(0,12)}... a ADMINISTRADOR?\nTendrá acceso al panel de admin.`)) return;
        try {
            const { doc, setDoc } = window.firestore;
            await setDoc(doc(window.db, "admins", uid), {
                isAdmin:    true,
                promotedAt: Date.now(),
                promotedBy: currentUser.uid,
            });
            showToast("✅ Usuario promovido a Admin", "#4caf50");
            adminLoadUsers(); // Recargar lista
        } catch(e) {
            showToast("Error: " + e.message, "#ff4444");
        }
    };

    // Revocar admin
    window.adminRevokeAdmin = async (uid) => {
        if (!confirm(`¿Revocar privilegios de admin para ${uid.substring(0,12)}...?`)) return;
        try {
            const { doc, deleteDoc } = window.firestore;
            await deleteDoc(doc(window.db, "admins", uid));
            showToast("✅ Privilegios revocados", "#ffaa00");
            adminLoadUsers();
        } catch(e) {
            showToast("Error: " + e.message, "#ff4444");
        }
    };

    window.adminLoadChat = async () => {
        const uid    = document.getElementById("admin-uid-input").value.trim();
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

    window.adminDeleteChat = async (uidParam) => {
        const uid    = uidParam || document.getElementById("admin-delete-uid")?.value.trim();
        const output = document.getElementById("admin-delete-output");
        if (!uid) { if(output) output.innerHTML = "<em>Ingresá un UID.</em>"; return; }
        if (!confirm(`¿Eliminar el chat del UID ${uid.substring(0,16)}...? Esta acción no se puede deshacer.`)) return;
        if (output) output.innerHTML = "<em>Eliminando...</em>";
        try {
            const { doc, deleteDoc } = window.firestore;
            await deleteDoc(doc(window.db, "chats", uid));
            if (output) output.innerHTML = `<span style="color:#4caf50;">✅ Chat eliminado correctamente.</span>`;
            showToast("Chat eliminado", "#4caf50");
            // Actualizar tabla
            const row = document.getElementById(`row-${uid}`);
            if (row) row.style.opacity = "0.3";
        } catch(e) {
            if (output) output.innerHTML = `<span style="color:#ff5555;">Error: ${e.message}</span>`;
        }
    };

    window.adminLoadStats = async () => {
        const output = document.getElementById("admin-stats-output");
        output.innerHTML = "<em>Calculando...</em>";
        try {
            const { collection, getDocs } = window.firestore;
            const snap = await getDocs(collection(window.db, "chats"));
            let totalUsers = 0, totalMsgs = 0, activeUsers = 0;
            const now = Date.now();
            snap.forEach(d => {
                totalUsers++;
                const data = d.data();
                const msgs = (data.mensajes || []).filter(m => m.role !== "system");
                totalMsgs += msgs.length;
                if (data.updatedAt && (now - data.updatedAt) < 7 * 24 * 60 * 60 * 1000) activeUsers++;
            });
            output.innerHTML = `
                <div class="admin-stat"><span>👥 Usuarios totales</span><b>${totalUsers}</b></div>
                <div class="admin-stat"><span>🟢 Activos (7 días)</span><b>${activeUsers}</b></div>
                <div class="admin-stat"><span>💬 Mensajes totales</span><b>${totalMsgs}</b></div>
                <div class="admin-stat"><span>📊 Promedio msgs/usuario</span><b>${totalUsers ? (totalMsgs/totalUsers).toFixed(1) : 0}</b></div>
            `;
        } catch(e) {
            output.innerHTML = `<span style="color:#ff5555;">Error: ${e.message}</span>`;
        }
    };

    window.adminSendBroadcast = async () => {
        const msg    = document.getElementById("admin-broadcast-msg").value.trim();
        const output = document.getElementById("admin-broadcast-output");
        if (!msg) { output.innerHTML = "<em>Escribí un mensaje.</em>"; return; }
        output.innerHTML = "<em>Guardando...</em>";
        try {
            const { doc, setDoc } = window.firestore;
            await setDoc(doc(window.db, "config", "broadcast"), {
                message:   msg,
                timestamp: Date.now(),
                active:    true,
            });
            output.innerHTML = `<span style="color:#4caf50;">✅ Broadcast guardado.</span>`;
        } catch(e) {
            output.innerHTML = `<span style="color:#ff5555;">Error: ${e.message}</span>`;
        }
    };

    window._checkBroadcast = async () => {
        try {
            const { doc, getDoc } = window.firestore;
            const snap = await getDoc(doc(window.db, "config", "broadcast"));
            if (!snap.exists()) return;
            const data = snap.data();
            if (!data.active || !data.message) return;
            const seenKey = "cutreal_broadcast_seen_" + data.timestamp;
            if (sessionStorage.getItem(seenKey)) return;
            sessionStorage.setItem(seenKey, "1");

            const banner = document.createElement("div");
            banner.className = "broadcast-banner";
            banner.innerHTML = `<span>📢 ${escapeHtml(data.message)}</span><button onclick="this.parentElement.remove()">✕</button>`;
            document.body.insertBefore(banner, document.body.firstChild);
        } catch(e) { /* silencioso */ }
    };
});

// ===== DOOM =====
window.openDoom = () => {
    const overlay = document.getElementById("doom-overlay");
    if (overlay) overlay.style.display = "flex";
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (typeof startDoom === "function") startDoom();
    }));
};

window.closeDoom = () => {
    const overlay = document.getElementById("doom-overlay");
    if (overlay) overlay.style.display = "none";
    if (typeof stopDoom === "function") stopDoom();
};
