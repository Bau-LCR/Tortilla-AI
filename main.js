document.addEventListener("DOMContentLoaded", function() {



    const chat = document.getElementById("chat");



    const input = document.getElementById("input");



    const loginOverlay = document.getElementById("login-overlay");



    const logoutBtn = document.getElementById("logout-btn");



    const splashScreen = document.getElementById("splash-screen");







    // --- LÓGICA DEL SPLASH SCREEN ---



    // Oculta el splash screen después de 1.5 segundos con un fade out



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



        // Feedback visual de carga



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



            // Animación sutil antes de salir



            document.body.style.opacity = "0.5";



            window.signOut(window.auth).then(() => {



                location.reload(); // Recargamos para limpiar todo el estado



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



                div.innerHTML = msg.role === "user" ? `<b>Tú:</b> ${formatearTexto(msg.content)}` : formatearTexto(msg.content);



                chat.appendChild(div);



            });



        }



        scrollAbajo();



    };







    const checkUser = () => {



        if (window.auth) {



            window.auth.onAuthStateChanged((user) => {



                const logoutBtn = document.getElementById("logout-btn");



                const resetBtn = document.getElementById("resetChat");



                const loginOverlay = document.getElementById("login-overlay");







                if (user) {



                    currentUser = user;



                    // Ocultar el login



                    loginOverlay.style.display = "none";



                    



                    // MOSTRAR BOTONES (Forzamos el display block)



                    if (logoutBtn) logoutBtn.style.display = "block";



                    if (resetBtn) resetBtn.style.display = "block";



                    



                    cargarDeNube(user.uid); 



                } else {



                    currentUser = null;



                    loginOverlay.style.display = "flex";



                    



                    // OCULTAR BOTONES si no hay usuario



                    if (logoutBtn) logoutBtn.style.display = "none";



                    if (resetBtn) resetBtn.style.display = "none";



                }



            });



        } else {



            setTimeout(checkUser, 500);



        }



    };



    



    checkUser();







    // --- LÓGICA DEL CHAT ---







    async function sendMessage() {



        const msg = input.value.trim();



        if (!msg || !currentUser) return;







        historial.push({ role: "user", content: msg });



        const userDiv = document.createElement("div");



        userDiv.className = "user";



        // CAMBIO AQUÍ: Usamos formatearTexto para que los saltos de línea se vean en el HTML



        userDiv.innerHTML = `<b>Tú:</b> ${formatearTexto(msg)}`;



        chat.appendChild(userDiv);



        



        // CAMBIO AQUÍ: Limpiamos el valor y reseteamos la altura



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







    // --- CAMBIO AQUÍ: Lógica para textarea y Shift+Enter ---



    



    // Auto-ajustar altura al escribir



    input.addEventListener("input", function() {



        this.style.height = "auto";



        this.style.height = (this.scrollHeight) + "px";



    });







    // Detectar teclas (Enter para enviar, Shift+Enter para salto de línea)



    input.addEventListener("keydown", (e) => { 



        if (e.key === "Enter" && !e.shiftKey) {



            e.preventDefault(); // Evita que se haga un salto de línea al enviar



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
