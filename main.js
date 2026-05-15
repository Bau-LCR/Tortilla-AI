pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
let pdfContextText = ""; 
let imageBase64 = ""; // Nueva variable para imágenes

document.addEventListener("DOMContentLoaded", function() {
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");
    const loginOverlay = document.getElementById("login-overlay");
    const logoutBtn = document.getElementById("logout-btn");
    const splashScreen = document.getElementById("splash-screen");
    const fileInput = document.getElementById("file-input");
    const attachBtn = document.getElementById("attach-btn");
    const previewContainer = document.getElementById("preview-container");
    const imagePreview = document.getElementById("image-preview");

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
    
    // Formateador mejorado para incluir imágenes Markdown
    const formatearTexto = (texto) => {
        return texto
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" class="chat-image">') // Renderizar imágenes
            .replace(/\n/g, '<br>');
    };

    const scrollAbajo = () => { chat.scrollTop = chat.scrollHeight; };

    // --- LÓGICA DE ARCHIVOS (PDF E IMAGEN) ---
    window.clearFile = () => {
        pdfContextText = "";
        imageBase64 = "";
        fileInput.value = "";
        previewContainer.style.display = "none";
        attachBtn.innerText = "📎";
        attachBtn.style.color = "#888";
    };

    if(fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.type.startsWith("image/")) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    imageBase64 = event.target.result;
                    imagePreview.src = imageBase64;
                    previewContainer.style.display = "block";
                    attachBtn.innerText = "🖼️";
                };
                reader.readAsDataURL(file);
            } else if (file.type === "application/pdf") {
                attachBtn.innerText = "⏳";
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                    let extractedText = "";
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const content = await page.getTextContent();
                        extractedText += content.items.map(item => item.str).join(" ") + "\n";
                    }
                    pdfContextText = extractedText.substring(0, 12000); 
                    attachBtn.innerText = "📄";
                } catch (error) {
                    alert("Error al leer PDF");
                    clearFile();
                }
            }
        });
    }

    async function sendMessage() {
        const rawMsg = input.value.trim();
        if (!rawMsg && !pdfContextText && !imageBase64) return;
        if (!currentUser) return;

        let userMsgObj = { role: "user", content: [] };
        let textoParaMostrar = rawMsg;

        // Caso PDF
        if (pdfContextText) {
            userMsgObj.content = `[Documento adjunto:\n${pdfContextText}\n]\n\nUsuario: ${rawMsg || 'Resume este PDF'}`;
            textoParaMostrar = (rawMsg || "Resumen de PDF") + "<br><small>📎 PDF procesado</small>";
        } 
        // Caso Imagen (Visión)
        else if (imageBase64) {
            userMsgObj.content = [
                { type: "text", text: rawMsg || "Describe esta imagen" },
                { type: "image_url", image_url: { url: imageBase64 } }
            ];
            textoParaMostrar = (rawMsg || "Analizando imagen...") + `<br><img src="${imageBase64}" class="chat-image">`;
        } 
        // Caso Texto normal
        else {
            userMsgObj.content = rawMsg;
        }

        historial.push(userMsgObj);
        
        const userDiv = document.createElement("div");
        userDiv.className = "user";
        userDiv.innerHTML = `<b>Tú:</b> ${formatearTexto(textoParaMostrar)}`;
        chat.appendChild(userDiv);
        
        input.value = "";
        clearFile();
        scrollAbajo();

        const thinking = document.createElement("div");
        thinking.className = "ai";
        thinking.id = "thinking-bubble";
        thinking.textContent = "Analizando...";
        chat.appendChild(thinking);
        scrollAbajo();

        try {
            const res = await fetch("/api/chat", { 
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mensajes: historial }) 
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            const respuestaIA = data.choices[0].message.content;
            historial.push({ role: "assistant", content: respuestaIA });

            document.getElementById("thinking-bubble")?.remove();

            const bot = document.createElement("div");
            bot.className = "ai";
            chat.appendChild(bot);

            // Efecto de escritura (solo si no es una imagen generada directa)
            if (respuestaIA.includes("![")) {
                bot.innerHTML = formatearTexto(respuestaIA);
            } else {
                let i = 0;
                const intervalo = setInterval(() => {
                    bot.textContent += respuestaIA.charAt(i);
                    i++;
                    if (i >= respuestaIA.length) {
                        clearInterval(intervalo);
                        bot.innerHTML = formatearTexto(bot.textContent);
                        scrollAbajo();
                    }
                }, 5);
            }
            guardarEnNube();
            scrollAbajo();
        } catch (e) {
            document.getElementById("thinking-bubble")?.remove();
            chat.innerHTML += `<div class='ai' style='color: #ff4b4b;'><b>Error:</b> ${e.message}</div>`;
        }
    }

    // Funciones de Firebase y UI (Se mantienen iguales que tu código original)
    window.sendMessage = sendMessage;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    
    // ... resto de funciones (checkUser, login, logout, etc) se mantienen igual ...
    async function guardarEnNube() {
        if (!currentUser) return;
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
        historial.forEach(msg => {
            if (msg.role === "system") return;
            const div = document.createElement("div");
            div.className = msg.role === "user" ? "user" : "ai";
            let contenido = typeof msg.content === 'string' ? msg.content : (Array.isArray(msg.content) ? msg.content[0].text : "Imagen enviada");
            div.innerHTML = formatearTexto(contenido);
            chat.appendChild(div);
        });
        scrollAbajo();
    };

    window.auth.onAuthStateChanged((user) => {
        if (user) { currentUser = user; loginOverlay.style.display = "none"; cargarDeNube(user.uid); }
    });
});
