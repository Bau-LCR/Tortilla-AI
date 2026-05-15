// Configurar el worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
let pdfContextText = ""; // Variable para guardar el texto del PDF temporalmente

document.addEventListener("DOMContentLoaded", function() {
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");
    const loginOverlay = document.getElementById("login-overlay");
    const logoutBtn = document.getElementById("logout-btn");
    const splashScreen = document.getElementById("splash-screen");
    const fileInput = document.getElementById("file-input");
    const attachBtn = document.getElementById("attach-btn");

    // --- LÓGICA DEL SPLASH SCREEN ---
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

    const scrollAbajo = () => {
        chat.scrollTop = chat.scrollHeight;
    };

    // --- LECTURA DE PDF ---
    if(fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file || file.type !== "application/pdf") return;

            attachBtn.innerText = "⏳";
            attachBtn.style.color = "#ff3b3b";

            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let extractedText = "";

                // Extraer texto página por página
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    extractedText += content.items.map(item => item.str).join(" ") + "\n";
                }

                // Limitamos a 15,000 caracteres para no saturar la API gratuita de Groq
                pdfContextText = extractedText.substring(0, 15000); 
                attachBtn.innerText = "📄";
                attachBtn.title = "PDF cargado: " + file.name;
            } catch (error) {
                console.error("Error al leer PDF:", error);
                alert("Hubo un error al intentar leer el PDF.");
                attachBtn.innerText = "📎";
                attachBtn.style.color = "#888";
            }
        });
    }

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
            document.body.style.opacity = "0.5";
            window.signOut(window.auth).then(() => {
                location.reload(); 
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
                
                // Limpiar la vista si es un mensaje que contiene el inyector del PDF
                let contenidoVisible = msg.content;
                if(msg.role === "user" && msg.content.includes("[Documento adjunto:")) {
                    const partes = msg.content.split("]\n\nUsuario: ");
                    contenidoVisible = (partes.length > 1 ? partes[1] : "<i>📎 PDF adjunto</i>") + "<br><br><i>📎 PDF adjunto</i>";
                }

                div.innerHTML = msg.role === "user" ? `<b>Tú:</b> ${formatearTexto(contenidoVisible)}` : formatearTexto(msg.content);
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
                    loginOverlay.style.display = "none";
                    if (logoutBtn) logoutBtn.style.display = "block";
                    if (document.getElementById("resetChat")) document.getElementById("resetChat").style.display = "block";
                    cargarDeNube(user.uid); 
                } else {
                    currentUser = null;
                    loginOverlay.style.display = "flex";
                    if (logoutBtn) logoutBtn.style.display = "none";
                    if (document.getElementById("resetChat")) document.getElementById("resetChat").style.display = "none";
                }
            });
        } else {
            setTimeout(checkUser, 500);
        }
    };
    
    checkUser();

    // --- LÓGICA DEL CHAT ---
    async function sendMessage() {
        const rawMsg = input.value.trim();
        // Si no hay mensaje y tampoco hay PDF cargado, no hacer nada
        if (!rawMsg && !pdfContextText) return;
        if (!currentUser) return;

        let textoParaEnviar = rawMsg;
        let textoParaMostrar = rawMsg;

        // Si el usuario adjuntó un PDF, estructuramos el prompt para Groq
        if (pdfContextText) {
            textoParaEnviar = `[Documento adjunto:\n${pdfContextText}\n]\n\nUsuario: ${rawMsg || 'Por favor, haz un resumen de este documento.'}`;
            textoParaMostrar = rawMsg ? rawMsg + "<br><br><span style='color:#ff3b3b; font-size: 12px;'>📎 PDF procesado</span>" : "<span style='color:#ff3b3b; font-size: 12px;'>📎 PDF procesado</span>";
            
            // Limpiamos los estados
            pdfContextText = "";
            attachBtn.innerText = "📎";
            attachBtn.style.color = "#888";
            fileInput.value = ""; 
        }

        historial.push({ role: "user", content: textoParaEnviar });
        
        const userDiv = document.createElement("div");
        userDiv.className = "user";
        userDiv.innerHTML = `<b>Tú:</b> ${formatearTexto(textoParaMostrar)}`;
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

    // Auto-ajustar altura al escribir
    input.addEventListener("input", function() {
        this.style.height = "auto";
        this.style.height = (this.scrollHeight) + "px";
    });

    // Detectar teclas (Enter para enviar, Shift+Enter para salto de línea)
    input.addEventListener("keydown", (e) => { 
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage(); 
        }
    });

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
