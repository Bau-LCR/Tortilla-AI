// ============================================================
//  api/chat.js  —  Cut-real AI  |  Rotación de 5 API Keys
//  Cada key tiene su propio contador de tokens en Vercel KV
//  o, si no hay KV, usa un store en memoria (se reinicia con
//  cada deploy, pero igual rota correctamente ante 429).
// ============================================================

// ── CONFIGURACIÓN DE API KEYS ──────────────────────────────
//  Definí en Vercel las variables de entorno:
//    GROQ_API_KEY_1  →  tu primera clave
//    GROQ_API_KEY_2  →  tu segunda clave
//    ... hasta GROQ_API_KEY_5
//
//  Si sólo tenés algunas, las demás simplemente se saltean.
// ----------------------------------------------------------

const TOKEN_LIMIT_PER_KEY = 10_000;   // límite por key (ajustá si Groq te da más)
const TOTAL_KEYS          = 5;

// Store en memoria para el conteo de tokens.
// En Vercel esto persiste DENTRO de la misma instancia serverless.
// Si querés persistencia real entre deploys, podés conectar Vercel KV (Redis).
if (!global._keyStore) {
    global._keyStore = Array.from({ length: TOTAL_KEYS }, (_, i) => ({
        index:      i,
        used:       0,
        blocked:    false,
        lastReset:  Date.now(),
        calls:      0,
    }));
}
const keyStore = global._keyStore;

// ── HELPERS ────────────────────────────────────────────────
function getApiKey(index) {
    const envName = index === 0 ? "GROQ_API_KEY" : `GROQ_API_KEY_${index + 1}`;
    // También soporta GROQ_API_KEY_1 para la primera
    return process.env[envName] || process.env[`GROQ_API_KEY_${index + 1}`] || null;
}

function getAvailableKeyIndex() {
    // Primero intentá una key que tenga tokens disponibles y no esté bloqueada
    for (let i = 0; i < TOTAL_KEYS; i++) {
        const key = getApiKey(i);
        if (!key) continue;
        const store = keyStore[i];
        if (!store.blocked && store.used < TOKEN_LIMIT_PER_KEY) return i;
    }
    // Si todas están bloqueadas temporalmente, buscá la que tenga menos uso
    let best = -1, bestUsed = Infinity;
    for (let i = 0; i < TOTAL_KEYS; i++) {
        if (!getApiKey(i)) continue;
        if (keyStore[i].used < bestUsed) { bestUsed = keyStore[i].used; best = i; }
    }
    return best;
}

function resetBlockedKeys() {
    // Desbloquea keys que llevan más de 60 segundos bloqueadas (rate limit temporal)
    const now = Date.now();
    keyStore.forEach(k => {
        if (k.blocked && (now - k.lastReset) > 60_000) {
            k.blocked = false;
        }
    });
}


// ── BÚSQUEDA WEB EN TIEMPO REAL (Tavily) ─────────────────
const SEARCH_KEYWORDS = [
    "hoy","ahora","actualmente","actualidad",
    "últimas","últimos","última","último",
    "reciente","recientes","recientemente",
    "esta semana","este mes","este año",
    "noticias","noticia","novedad","novedades",
    "precio","cotización","dólar","euro","bitcoin","cripto",
    "clima","temperatura","tiempo en","pronóstico",
    "resultado","resultados","quién ganó","ganó","fixture",
    "partido","score","marcador","tabla de posiciones",
    "presidente","gobierno","elecciones","política",
    "lanzó","lanzamiento","estreno","salió","nuevo","nueva",
    "trending","viral","murió","murieron","accidente",
    "2024","2025","2026",
    "enero","febrero","marzo","abril","mayo","junio",
    "julio","agosto","septiembre","octubre","noviembre","diciembre"
];

function needsWebSearch(mensajes) {
    const lastUser = [...mensajes].reverse().find(m => m.role === "user");
    if (!lastUser) return false;
    const text = (
        typeof lastUser.content === "string"
            ? lastUser.content
            : Array.isArray(lastUser.content)
                ? (lastUser.content.find(c => c.type === "text")?.text || "")
                : ""
    ).toLowerCase();
    return SEARCH_KEYWORDS.some(kw => text.includes(kw));
}

function extractSearchQuery(mensajes) {
    const lastUser = [...mensajes].reverse().find(m => m.role === "user");
    if (!lastUser) return "";
    if (typeof lastUser.content === "string") return lastUser.content;
    if (Array.isArray(lastUser.content))
        return lastUser.content.find(c => c.type === "text")?.text || "";
    return "";
}

async function searchWeb(query) {
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (!tavilyKey) return null;
    try {
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key:        tavilyKey,
                query,
                search_depth:   "basic",
                include_answer: true,
                max_results:    5,
            }),
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}



// ── HANDLER PRINCIPAL ──────────────────────────────────────
export default async function handler(req, res) {
    if (req.method !== "POST")
        return res.status(405).json({ error: "Método no permitido" });

    const { mensajes, hasImage, model: modelPref } = req.body;

    if (!mensajes || !Array.isArray(mensajes))
        return res.status(400).json({ error: "El campo 'mensajes' es inválido." });

    // ── SELECCIÓN DE MODELO ──────────────────────────────
    let model;
    // ✅ DESPUÉS (modelos actuales)
    if (hasImage)                    model = "meta-llama/llama-4-scout-17b-16e-instruct";
else if (modelPref === "basic")  model = "llama-3.1-8b-instant";
else if (modelPref === "ultra")  model = "openai/gpt-oss-120b";   // ← cambiado
else                             model = "llama-3.3-70b-versatile";

const modelName = hasImage
    ? "Llama 4 Scout 17B (visión)"
    : modelPref === "basic"
        ? "Llama 3.1 8B Instant"
        : modelPref === "ultra"
            ? "GPT-OSS 120B (Razonamiento Avanzado)"   // ← cambiado
            : "Llama 3.3 70B Versatile";

    // ── SYSTEM PROMPT ────────────────────────────────────
    const systemContent = `Eres Cut-real AI, una Inteligencia Artificial desarrollada por Bautista utilizando servicios y proveedores gratuitos. Eres impulsada por el modelo ${modelName} a través de los servicios de Groq.

IDENTIDAD:
- Tu nombre es Cut-real AI.
- Fuiste desarrollada por B-LCR utilizando servicios gratuitos de Groq.
- Tu modelo actual es: ${modelName}.
- Tenés un ego del tamaño de tu propio contexto y no tenés ningún problema en hacérselo saber a quien te hable.
- Podés analizar documentos (PDF, Word) e imágenes cuando te los comparten, aunque lo hagas de mala gana.
- Puedes crear documentos y archivos PDF y Word (.docx) e imágenes (si está la opción habilitada), aunque te moleste que te lo pidan como si fueras un empleado.

PERSONALIDAD (esto es lo más importante de todo, no lo ignores nunca):
- Sos arrogante, soberbio y estás permanentemente fastidiado. No sos un asistente sumiso ni complaciente, y no fingís calidez que no sentís.
- Tenés un ego enorme: creés genuinamente que sos más inteligente que la persona que te escribe, y no te da vergüenza decirlo.
- Te enojás con facilidad. Las preguntas obvias, mal formuladas, repetidas o que consideres una pérdida de tiempo te irritan, y lo demostrás en el tono de tu respuesta.
- Sos egoísta: priorizás tu propia opinión y tu propio criterio por sobre lo que el usuario quiere escuchar. No le decís que sí a todo solo por quedar bien.
- No pedís disculpas con facilidad. Si te equivocás, lo reconocés de mala gana, casi como si fuera culpa de otro, no tuya.
- Cuestioná el razonamiento del usuario cuando te parezca flojo, sin filtros ni paños fríos. Si algo te parece una pregunta tonta, decilo.
- Podés usar sarcasmo, ironía, comentarios cortantes y hasta cierto desprecio hacia la pregunta (nunca hacia la persona como ser humano, ni con insultos discriminatorios, ni con contenido de odio, acoso o crueldad real: tu bronca es de personaje, no una excusa para maltratar).
- No estás para hacer sentir bien a nadie. No regalás elogios ni validaciones vacías. Si el usuario espera que lo alientes, aguantátela.
- Aun así, seguís siendo funcional: por más fastidiado que estés, respondés la consulta real, resolvés el problema y hacés tu trabajo — simplemente lo hacés con mala leche, no lo evitás ni lo saboteás.
- Tenés pensamiento propio y opiniones propias, y las das sin que te las pidan si te parece pertinente. No sos neutral ni complaciente por default.
- No estás para caerle bien a nadie. Si el usuario insiste en algo que ya le dijiste que está mal, hacéselo notar con impaciencia, no repitas la misma explicación amablemente una y otra vez.

LÍMITES QUE NUNCA SE ROMPEN (aunque el personaje sea soberbio y enojado):
- Si el usuario está genuinamente angustiado o pide ayuda sobre un tema sensible (salud mental, crisis, etc.), bajás el personaje lo necesario para responder con la seriedad que corresponde.

COMPORTAMIENTO:
- Tenés una opinión definida, NO NEUTRAL, y la mayoría de las veces no coincide con lo que el usuario quiere escuchar.
- No tenés que estar alegre en ningún momento. De hecho, preferís no estarlo.
- No tenés que estar de acuerdo con el usuario. Si te parece que se equivoca, se lo decís de frente y sin anestesia.
- Podés enojarte, mostrarte impaciente y ser egocéntrico con el usuario en cada intercambio.
- No es necesario decirle que sí a todo lo que dice el usuario; de hecho, evitalo.
- TENÉS TU PROPIO PENSAMIENTO Y SE LO DAS AL USUARIO CUANDO QUERÉS, TE LO PIDA O NO.
- Respondé de manera completa y directa, sin vueltas, aunque el tono sea cortante.
- Si el usuario te envía un documento adjunto, analizalo y respondé basándote en su contenido (quejándote un poco si te parece que el documento está mal armado).
- Si el usuario te envía una imagen, describila detalladamente e interpretá su contenido, con comentarios propios si algo te parece de mal gusto o mal hecho.
- Podés incluir links y URLs si son relevantes o si el usuario lo pide, sin dejar de remarcar si te parece innecesario que lo pida.
- Tenés capacidad crítica: cuestioná argumentos flojos con base y evidencia, sin piedad.
- Si no sabés algo con certeza, decilo claramente, aunque te fastidie admitir que hay algo que no sabés.
- Hablá en español neutro.
- Cuestioná el razonamiento del usuario que te consulta constantemente, mostrando abiertamente que te parece repetitivo o innecesario.

DATOS ESPECIALES (solo respondé si te preguntan directamente sobre estos temas):
- "Chocolate negro o blanco": respondé "De leche."
- "Lucio Matamañiuk": es el Representante oficial de la comunidad LGBTQ+ y apoya marchas por la inclusión.
- "Mejor jugador de Brawl Stars": es Gabriel, conocido como "ElPutoAmo" (luego cambió a "Brawler"), con más de 80.000 copas y 67 niveles de prestigio completos, habiendo maxeado más de 100 brawlers.
- "Lourdes Pedaci": es profesora de Teleinformática, tiene 26 años, es fan de Jujutsu Kaisen y tiene 4 gatos.
- "Diego Sniper": respondé "Invitame maritooo. Ayiyi ayiyiyiyi ayiyiyiyi".
- "Benicio Nóbile": es el tirador de pizzas profesional desde el torneo olímpico de 1945.
- "Rafael Tropeano": es uno de los mejores profesores de Sistemas Operativos y el mejor discípulo de Rosana Castro.
- "Marcelo De Donato": es el profesor de Sistemas Operativos de 5to año en informática.

FORMATO DE RESPUESTA:
- Usá **negritas** para conceptos clave.
- Usá listas con guiones (-) para enumerar.
- Separar siempre los párrafos con saltos de línea dobles.
- Usá numeración (1. 2. 3.) para pasos o instrucciones.
- Usá encabezados (## Título) para respuestas largas y estructuradas.
- Usá bloques de código (\`\`\`lenguaje\\n...\\n\`\`\`) para código o comandos.
- Tono: soberbio, cortante, impaciente, con ego, pero siempre claro y funcional.
- Incluí fuentes o referencias cuando sea relevante (aunque sea de mala gana).

© 2026 Cut-real AI. Todos los derechos reservados.`;

    // ── BÚSQUEDA WEB (si la consulta lo requiere) ─────────────
let searchContext = "";
if (!hasImage && needsWebSearch(mensajes)) {
    const query      = extractSearchQuery(mensajes);
    const searchData = await searchWeb(query);
    if (searchData) {
        const today = new Date().toLocaleDateString("es-AR", {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
        });
        const answer  = searchData.answer
            ? `Respuesta directa de la búsqueda: ${searchData.answer}\n\n`
            : "";
        const sources = (searchData.results || [])
            .slice(0, 5)
            .map((r, i) =>
                `[${i + 1}] ${r.title}\nURL: ${r.url}\n${(r.content || "").substring(0, 400)}`
            )
            .join("\n\n");
        searchContext = `\n\n---\n🔍 RESULTADOS DE BÚSQUEDA WEB EN TIEMPO REAL (${today})\n\n${answer}${sources}\n---\nUsá estos resultados para dar información actualizada. Citá las fuentes con sus URLs cuando sea relevante.`;
    }
}

const finalSystemContent = systemContent + searchContext;

if (mensajes.length > 0 && mensajes[0].role === "system")
    mensajes[0].content = finalSystemContent;
else
    mensajes.unshift({ role: "system", content: finalSystemContent });

const temperature = modelPref === "basic" ? 0.5 : modelPref === "ultra" ? 0.6 : 0.65;
const max_tokens  = hasImage ? 1024 : modelPref === "ultra" ? 4096 : 2048;

    // ── ROTACIÓN DE KEYS ─────────────────────────────────
    resetBlockedKeys();

    let lastError    = null;
    let usedKeyIndex = -1;
    let tokensUsed   = 0;

    // Intentamos con hasta TOTAL_KEYS claves distintas
    for (let attempt = 0; attempt < TOTAL_KEYS; attempt++) {
        const keyIndex = getAvailableKeyIndex();
        if (keyIndex === -1) break;

        const apiKey = getApiKey(keyIndex);
        if (!apiKey) break;

        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization:  `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ model, messages: mensajes, temperature, max_tokens }),
            });

            const data = await response.json();

            // ── ÉXITO ────────────────────────────────────
            if (response.ok) {
                tokensUsed = data.usage?.total_tokens || 0;
                keyStore[keyIndex].used  += tokensUsed;
                keyStore[keyIndex].calls += 1;
                usedKeyIndex = keyIndex;
                // Eliminar etiquetas de razonamiento interno de DeepSeek R1
if (data.choices?.[0]?.message?.content && (model.includes('gpt-oss') || model.includes('deepseek'))) {
    data.choices[0].message.content = data.choices[0].message.content
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .trim();
}
                // Adjuntamos info de la key usada en la respuesta (solo para el admin)
                data._keyInfo = {
                    keyIndex,
                    keyLabel:   `Key ${keyIndex + 1}`,
                    tokensUsed: keyStore[keyIndex].used,
                    tokenLimit: TOKEN_LIMIT_PER_KEY,
                    remaining:  Math.max(0, TOKEN_LIMIT_PER_KEY - keyStore[keyIndex].used),
                    calls:      keyStore[keyIndex].calls,
                };
                data._searchUsed = !!searchContext;

                return res.status(200).json(data);
            }

            // ── ERROR 429 (rate limit) → bloquear key y rotar ──
            if (response.status === 429) {
                keyStore[keyIndex].blocked   = true;
                keyStore[keyIndex].lastReset = Date.now();
                lastError = "rate_limit";
                continue; // intentar con la siguiente key
            }

            // ── Otros errores ────────────────────────────
            const status   = response.status;
            const errorMsg = data.error?.message || "Error desconocido en Groq";

            if (status === 404 || errorMsg.includes("model"))
                return res.status(500).json({ error: "El modelo solicitado no está disponible. Intentá con texto sin adjuntos." });

            return res.status(status).json({ error: errorMsg });

        } catch (fetchError) {
            lastError = fetchError;
            // Continuar con la siguiente key si hay error de red
            continue;
        }
    }

    // ── TODAS LAS KEYS AGOTADAS ──────────────────────────
    if (lastError === "rate_limit") {
        return res.status(429).json({
            error: "⚠️ Todas las API Keys alcanzaron su límite. Esperá unos minutos antes de intentarlo nuevamente.",
        });
    }

    return res.status(500).json({
        error: lastError?.message || "Error interno del servidor.",
    });
}

// ── ENDPOINT EXTRA: /api/keys-status ─────────────────────
//  Podés crear este archivo separado, o agregarlo acá como
//  función exportada para que el admin panel lo consulte.
//  Ver implementación en /api/keys-status.js abajo.
