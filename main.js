const API_KEY = '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'; 
    
    /* ENVIAR MENSAJE */
    async function sendMessage(){
    
        const msg = input.value.trim();
        if(!msg) return;
        
        chat.innerHTML += "<div class='user'><b>Tú:</b> " + msg + "</div>";
        input.value = "";
        
        const thinking = document.createElement("div");
        thinking.className = "ai";
        thinking.textContent = "Pensando...";
        chat.appendChild(thinking);
        
        scrollAbajo();
        
        let respuesta = "";
        
        try{
            // Conexión directa a la API gratuita de Groq usando el modelo Llama 3
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ 
                    model: "llama3-8b-8192", // Modelo rápido y gratuito
                    messages: [{ role: "user", content: msg }] 
                })
            });
    
            if(!res.ok){
                throw new Error("Error en la conexión con la API");
            }
    
            const data = await res.json();
            respuesta = data.choices[0].message.content;
    
        } catch(e) {
            console.error("Error:", e);
            respuesta = "Uy, parece que hubo un error de conexión.";
        }
        
        thinking.remove();
        
        const bot = document.createElement("div");
        bot.className = "ai";
        chat.appendChild(bot);
        
        let i = 0;
        
        const intervalo = setInterval(function(){
            bot.textContent += respuesta.charAt(i);
            i++;
            scrollAbajo();
            
            if(i >= respuesta.length){
                clearInterval(intervalo);
            }
        }, 15);
    }
