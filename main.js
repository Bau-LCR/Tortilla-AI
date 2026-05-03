document.addEventListener("DOMContentLoaded", function(){

    const chat = document.getElementById("chat");
    const input = document.getElementById("input");
    
    // Pega tu clave de Google AI Studio aquí adentro de las comillas:
    const API_KEY = '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'; 
    
    /* SCROLL */
    function scrollAbajo(){
        if(chat){
            chat.scrollTop = chat.scrollHeight;
        }
    }
    
    /* ENVIAR MENSAJE */
    async function sendMessage(){
    
        const msg = input.value.trim();
        if(!msg) return;
        
        // Imprimir mensaje del usuario
        chat.innerHTML += "<div class='user'><b>Tú:</b> " + msg + "</div>";
        input.value = "";
        
        // Indicador de "Pensando..."
        const thinking = document.createElement("div");
        thinking.className = "ai";
        thinking.textContent = "Pensando...";
        chat.appendChild(thinking);
        
        scrollAbajo();
        
        let respuesta = "";
        
        try{
            // Conexión directa a la API gratuita de Gemini
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ 
                    contents: [{ parts: [{ text: msg }] }] 
                })
            });
    
            if(!res.ok){
                throw new Error("Error en la conexión con la API");
            }
    
            const data = await res.json();
            // Extraer la respuesta de la estructura de datos de Gemini
            respuesta = data.candidates[0].content.parts[0].text;
    
        } catch(e) {
            console.error("Error:", e);
            respuesta = "Uy, parece que hubo un error de conexión o la clave API no es válida.";
        }
        
        // Eliminar el mensaje de "Pensando..."
        thinking.remove();
        
        // Crear el contenedor de la respuesta del bot
        const bot = document.createElement("div");
        bot.className = "ai";
        chat.appendChild(bot);
        
        let i = 0;
        
        // Efecto de máquina de escribir
        const intervalo = setInterval(function(){
            bot.textContent += respuesta.charAt(i);
            i++;
            scrollAbajo();
            
            if(i >= respuesta.length){
                clearInterval(intervalo);
            }
        }, 15); // Velocidad ajustada para que se vea más fluido
    }
    
    /* ENTER */
    input.addEventListener("keypress", function(e){
        if(e.key === "Enter"){
            sendMessage();
        }
    });
    
    /* BOTONES */
    window.sendMessage = sendMessage;
    
    window.resetChat = function(){
        chat.innerHTML = "<div class='ai'>Hola, soy Tortilla-AI</div>";
    };
    
});
