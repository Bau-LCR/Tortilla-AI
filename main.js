pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

let pdfContextText = ""; 
let imageBase64 = ""; 
let currentUser = null;
let historial = [{ role: "system", content: "Eres Cut-real AI." }];

document.addEventListener("DOMContentLoaded", function() {
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");
    const loginOverlay = document.getElementById("login-overlay");
    const logoutBtn = document.getElementById("logout-btn");
    const resetBtn = document.getElementById("resetChat");
    const splashScreen = document.getElementById("splash-screen");
    const fileInput = document.getElementById("file-input");
    const previewContainer = document.getElementById("preview-container");
    const imagePreview = document.getElementById("image-preview");
    const sendBtn = document.getElementById("send-btn");
    const loginGoogleBtn = document.getElementById("btn-google-login");

    // Splash screen logic
    setTimeout(() => {
        if (splashScreen) {
            splashScreen.style.opacity = "0";
            setTimeout(() => splashScreen.style.display = "none", 800);
        }
    }, 1500);

    const scrollAbajo = () => { chat.scrollTop = chat.scrollHeight; };

    const formatearTexto = (texto) => {
        return texto
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" class="chat-image">')
            .replace(/\n/g, '<br>');
    };

    window.clearFile = () => {
        pdfContextText = "";
        imageBase64 = "";
        if(fileInput) fileInput.value = "";
        previewContainer.style.display = "none";
        document.getElementById("attach-btn").innerText = "📎";
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
                    document.getElementById("attach-btn").innerText = "🖼️";
                };
                reader.readAsDataURL(file);
            } else if (file.type === "application/pdf") {
                document.getElementById("attach-btn").innerText = "⏳";
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let text = "";
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    text += content.items.map(item => item.str).join(" ") + "\n";
                }
                pdfContextText = text.substring(0, 10000);
                document.getElementById("attach-btn").innerText = "📄";
            }
        });
    }

    async function sendMessage() {
        const rawMsg = input.value.trim();
        if (!rawMsg && !pdfContextText && !imageBase64) return;
        if (!currentUser) return;

        let userMsgObj = { role: "user", content: "" };
        let visualMsg = rawMsg;

        if (imageBase64) {
            userMsgObj.content = [
                { type: "text", text: rawMsg || "Analiza esta imagen" },
                { type: "image_url", image_url: { url: imageBase64 } }
            ];
            visualMsg = (rawMsg || "Analizando imagen...") + `<br><img src="${imageBase64}" class="chat-image">`;
        } else if (pdfContextText) {
            userMsgObj.content = `[Documento adjunto: ${pdfContextText}]\n\nPregunta: ${rawMsg}`;
            visualMsg = rawMsg + "<br><small>📎 PDF cargado</small>";
        } else {
            userMsgObj.content = rawMsg;
        }

        historial.push(userMsgObj);
        const div = document.createElement("div");
        div.className = "user";
        div.innerHTML = `<b>Tú:</b> ${formatearTexto(visualMsg)}`;
        chat.appendChild(div);
        
        input.value = "";
        clearFile();
        scrollAbajo();

        const thinking = document.createElement("div");
        thinking.className = "ai";
        thinking.id = "thinking";
        thinking.textContent = "Cut-real está pensando...";
        chat.appendChild(thinking);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mensajes: historial })
            });
            const data = await res.json();
            document.getElementById("thinking").remove();

            if (data.error) throw new Error(data.error);

            const respuesta = data.choices[0].message.content;
            historial.push({ role: "assistant", content: respuesta });

            const botDiv = document.createElement("div");
            botDiv.className = "ai";
            botDiv.innerHTML = formatearTexto(respuesta);
            chat.appendChild(botDiv);
            
            guardarEnNube();
            scrollAbajo();
        } catch (e) {
            if(document.getElementById("thinking")) document.getElementById("thinking").remove();
            chat.innerHTML += `<div class="ai" style="color:red">Error: ${e.message}</div>`;
        }
    }

    // AUTH FUNCTIONS
    window.auth.onAuthStateChanged((user) => {
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

    loginGoogleBtn.onclick = () => window.signInWithPopup(window.auth, window.provider);
    logoutBtn.onclick = () => window.signOut(window.auth);
    resetBtn.onclick = async () => {
        if(confirm("¿Borrar todo el historial?")) {
            historial = [{ role: "system", content: "Eres Cut-real AI." }];
            chat.innerHTML = `<div class="ai">Chat borrado correctamente.</div>`;
            await guardarEnNube();
        }
    };
    sendBtn.onclick = sendMessage;
    input.onkeydown = (e) => { if(e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

    async function guardarEnNube() {
        if (!currentUser) return;
        await window.firestore.setDoc(window.firestore.doc(window.db, "chats", currentUser.uid), { mensajes: historial });
    }

    async function cargarDeNube(uid) {
        const docSnap = await window.firestore.getDoc(window.firestore.doc(window.db, "chats", uid));
        if (docSnap.exists()) {
            historial = docSnap.data().mensajes;
            chat.innerHTML = "";
            historial.forEach(m => {
                if(m.role === "system") return;
                const d = document.createElement("div");
                d.className = m.role === "user" ? "user" : "ai";
                let c = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content[0].text : "Imagen");
                d.innerHTML = formatearTexto(c);
                chat.appendChild(d);
            });
            scrollAbajo();
        }
    }
});
