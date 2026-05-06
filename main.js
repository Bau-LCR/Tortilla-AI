// Configuración de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

let extraContent = ""; // Variable para guardar el texto del archivo

document.getElementById('file-input').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const attachBtn = document.getElementById('attach-btn');
    attachBtn.textContent = "⏳"; // Indicador de carga

    try {
        if (file.type === "application/pdf") {
            extraContent = await readPDF(file);
        } else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
            extraContent = await readWord(file);
        }
        
        attachBtn.textContent = "✅";
        alert("Archivo analizado: " + file.name + ". Ahora puedes hacer preguntas sobre él.");
    } catch (error) {
        console.error(error);
        alert("Error al leer el archivo.");
        attachBtn.textContent = "📎";
    }
});

// Función para leer PDFs
async function readPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(" ") + "\n";
    }
    return text;
}

// Función para leer Word (.docx)
async function readWord(file) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return result.value;
}

// Modificar la función sendMessage para incluir el texto del archivo
async function sendMessage() {
    const textInput = document.getElementById("input");
    let userMsg = textInput.value.trim();
    if (!userMsg && !extraContent) return;

    // Si hay contenido de archivo, lo adjuntamos al mensaje de forma invisible para el usuario
    let fullPrompt = userMsg;
    if (extraContent) {
        fullPrompt = `Contexto del archivo subido: "${extraContent}"\n\nPregunta del usuario: ${userMsg}`;
        // Limpiamos el contenido extra después de enviarlo o lo mantenemos según prefieras
    }

    historial.push({ role: "user", content: fullPrompt });
    
    // Renderizamos en pantalla solo lo que el usuario escribió (para que no se vea el texto gigante del PDF)
    const displayMsg = userMsg || "Analiza este documento";
    renderizarSoloTexto(displayMsg); 

    // ... resto de tu lógica de fetch a la API ...
    
    // Limpiar después de enviar
    extraContent = ""; 
    document.getElementById('attach-btn').textContent = "📎";
}
