@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

:root {
    --primary-red: #ff3b3b;
    --dark-red: #cc0000;
    --bg-black: #0a0a0a;
    --card-bg: rgba(18, 18, 18, 0.75);
    --border-white: rgba(255, 255, 255, 0.08);
}

body {
    font-family: 'Inter', sans-serif;
    background: var(--bg-black);
    color: #ffffff;
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100vh;
    overflow-x: hidden;
}

/* HEADER */
.main-header {
    display: flex;
    padding: 15px 40px;
    position: fixed;
    top: 0;
    width: 100%;
    z-index: 100;
    background: linear-gradient(to bottom, rgba(10,10,10,0.9) 0%, rgba(10,10,10,0) 100%);
    pointer-events: none;
}

.header-logo { display: flex; align-items: center; text-decoration: none; pointer-events: auto; }
.nav-logo-small { height: 60px; margin-right: 10px; filter: drop-shadow(0 0 10px rgba(255, 59, 59, 0.2)); }
.nav-title { font-size: 24px; font-weight: 800; margin: 0; }
.red-text { color: var(--primary-red); }

/* CONTROLES (Cerrar sesión y borrar) */
.side-controls {
    position: fixed;
    top: 20px;
    right: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    z-index: 10001; /* Más alto que el login overlay */
}

#logout-btn, #resetChat {
    background: rgba(255, 255, 255, 0.05);
    color: #aaa;
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 8px 15px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    backdrop-filter: blur(5px);
    transition: 0.3s;
}

#logout-btn:hover, #resetChat:hover {
    color: var(--primary-red);
    border-color: var(--primary-red);
}

/* CHAT */
#chat {
    width: 85%;
    max-width: 900px;
    height: 60vh;
    margin-top: 100px;
    background: var(--card-bg);
    backdrop-filter: blur(12px);
    border: 1px solid var(--border-white);
    border-radius: 20px;
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    z-index: 10;
}

.user, .ai { padding: 12px 18px; margin: 8px 0; border-radius: 15px; max-width: 80%; animation: aparecer 0.3s ease; }
.user { background: #252525; margin-left: auto; border-bottom-right-radius: 4px; }
.ai { background: linear-gradient(160deg, #2a0000 0%, #121212 100%); border-bottom-left-radius: 4px; border: 1px solid rgba(255, 0, 0, 0.1); line-height: 1.6; }

/* INPUT AREA */
.input-area {
    margin: 20px 0;
    display: flex;
    background: #161616;
    padding: 10px 15px;
    border-radius: 50px;
    border: 1px solid #252525;
    width: 700px;
    max-width: 90%;
    z-index: 100;
    gap: 10px;
}

#input { flex: 1; background: transparent; border: none; color: white; outline: none; resize: none; font-family: inherit; }
#send-btn { background: var(--primary-red); color: white; border: none; padding: 8px 20px; border-radius: 25px; font-weight: 700; cursor: pointer; }

/* AUTH CARD */
#login-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.9); backdrop-filter: blur(15px); z-index: 10000; display: flex; align-items: center; justify-content: center; }
.auth-card { background: #111; padding: 40px; border-radius: 25px; border: 1px solid #222; text-align: center; width: 320px; }
.auth-logo-small { width: 120px; margin-bottom: 15px; }
.google-btn { background: white; color: black; width: 100%; padding: 12px; border-radius: 10px; display: flex; align-items: center; justify-content: center; gap: 10px; font-weight: 700; border: none; cursor: pointer; }
.google-btn img { width: 20px; }

/* SPLASH */
#splash-screen { position: fixed; inset: 0; background: #0a0a0a; z-index: 20000; display: flex; justify-content: center; align-items: center; }
.splash-logo { width: 200px; animation: pulse 2s infinite; }

@keyframes pulse { 0%, 100% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.1); opacity: 1; } }
@keyframes aparecer { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

.chat-image { max-width: 100%; border-radius: 10px; margin-top: 10px; }
.copyright { padding: 20px; text-align: center; font-size: 10px; color: #444; }
