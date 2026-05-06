// Configuración PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

document.addEventListener("DOMContentLoaded", () => {
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");
    const fileInput = document.getElementById("file-input");
    const attachBtn = document.getElementById("attach-btn");
    const sendBtn = document.getElementById("send-btn");

    const ADMIN_UID = "8qZG7egWbIeMy7HqtwkKEdLasMw2";
    let currentUser = null;
    let extraContext = ""; // Aquí guardamos el texto del PDF/Word
    let historial = [{ role: "system", content: "Eres Cut-real AI. Si el usuario sube un archivo, analiza el contenido proporcionado." }];

    // --- MANEJO DE ARCHIVOS ---
    attachBtn.onclick = () => fileInput.click();

    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        attachBtn.textContent = "⌛";
        attachBtn.style.color = "#ff3b3b";

        try {
            if (file.type === "application/pdf") {
                extraContext = await readPDF(file);
            } else {
                extraContext = await readWord(file);
            }
            attachBtn.textContent = "✅";
            attachBtn.style.color = "#4aff4a";
            alert(`Archivo "${file.name}" cargado. La IA ahora conoce su contenido.`);
        } catch (err) {
            alert("Error al procesar archivo");
            attachBtn.textContent = "📎";
        }
    };

    async function readPDF(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(s => s.str).join(" ") + "\n";
        }
        return text;
    }

    async function readWord(file) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
    }

    // --- LÓGICA DE ENVÍO ---
    const sendMessage = async () => {
        const userText = input.value.trim();
        if (!userText && !extraContext) return;

        // Construir el prompt con contexto de archivo si existe
        let finalPrompt = userText;
        if (extraContext) {
            finalPrompt = `[CONTEXTO DEL ARCHIVO]: ${extraContext}\n\n[PREGUNTA]: ${userText || "Resume este archivo"}`;
        }

        historial.push({ role: "user", content: finalPrompt });
        
        // Mostrar solo el texto del usuario en el chat para no ensuciar
        renderMessage("user", userText || "Analizando archivo...");
        input.value = "";
        input.style.height = "auto";

        const thinking = renderMessage("ai", "Analizando datos...");
        
        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mensajes: historial })
            });
            const data = await res.json();
            thinking.remove();
            
            const aiRes = data.choices[0].message.content;
            historial.push({ role: "assistant", content: aiRes });
            renderMessage("ai", aiRes);
            
            // Limpiar contexto tras la respuesta para no saturar memoria
            extraContext = "";
            attachBtn.textContent = "📎";
            attachBtn.style.color = "#888";
        } catch (e) {
            thinking.textContent = "Error al conectar con la IA.";
        }
    };

    function renderMessage(role, text) {
        const div = document.createElement("div");
        div.className = role;
        div.innerHTML = text.replace(/\n/g, '<br>');
        chat.appendChild(div);
        chat.scrollTop = chat.scrollHeight;
        return div;
    }

    sendBtn.onclick = sendMessage;
    input.onkeydown = (e) => { if(e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

    // ... (Mantén aquí tus funciones de Login/Admin anteriores pero asegúrate de que usen estas variables) ...
});
