  // ===== BUSCAMINAS 1989 — CUT-REAL AI EASTER EGG =====
// Activar: escribir exactamente "buscaminas 1989" en el chat

var buscaminasRunning = false;
var buscaminasTimer   = null;
var buscaminasGame    = null;
var bmSessionStats    = { games: 0, wins: 0, bestTime: null };

const BM = { ROWS: 15, COLS: 15, MINES: 35 };

// ── ESTADO NUEVO ──
function newBMGame() {
    const g = {
        board:         [],
        revealed:      [],
        flagged:       [],
        mines:         [],
        started:       false,
        over:          false,
        won:           false,
        time:          0,
        minesLeft:     BM.MINES,
        revealedCount: 0,
        score:         0
    };
    for (let r = 0; r < BM.ROWS; r++) {
        g.board.push([]);    g.revealed.push([]);
        g.flagged.push([]); g.mines.push([]);
        for (let c = 0; c < BM.COLS; c++) {
            g.board[r].push(0);     g.revealed[r].push(false);
            g.flagged[r].push(false); g.mines[r].push(false);
        }
    }
    return g;
}

// ── HTML ──
function getBuscaminasHTML() {
    return `
    <div class="bm-container">
        <div class="bm-header">
            <div class="bm-logo-area">
                <span class="bm-bomb-icon">💣</span>
                <span class="bm-title-text">BUSCAMINAS</span>
                <span class="bm-year-badge">1989</span>
            </div>
            <button class="bm-close-btn" onclick="closeBuscaminas()">✕ Cerrar juego</button>
        </div>

        <div class="bm-main-layout">
            <!-- PANEL IZQUIERDO: Tablero -->
            <div class="bm-game-panel">
                <div class="bm-status-bar">
                    <div class="bm-lcd" id="bm-mines-lcd">035</div>
                    <button class="bm-face-btn" id="bm-face-btn" onclick="startNewBuscaminasGame()" title="Nueva partida">🙂</button>
                    <div class="bm-lcd" id="bm-time-lcd">000</div>
                </div>
                <div class="bm-board-wrap">
                    <div class="bm-grid" id="bm-grid"></div>
                </div>
                <div class="bm-bottom-bar">
                    <span class="bm-hint">🖱️ Click: revelar &nbsp;|&nbsp; Click derecho: 🚩 bandera</span>
                    <span class="bm-score-display">Puntaje: <b id="bm-current-score">0</b></span>
                </div>
            </div>

            <!-- PANEL DERECHO: Scores -->
            <div class="bm-side-panel">
                <div class="bm-panel-section">
                    <div class="bm-section-title">🏆 TOP SCORES</div>
                    <div class="bm-top-list" id="bm-top-list">
                        <div class="bm-no-scores">¡Ganá una partida<br>para aparecer aquí!</div>
                    </div>
                    <button class="bm-clear-btn" onclick="clearBmScores()">🗑️ Limpiar scores</button>
                </div>

                <div class="bm-panel-section">
                    <div class="bm-section-title">📊 Esta sesión</div>
                    <div class="bm-stat-row"><span>Partidas jugadas:</span><b id="bm-s-games">0</b></div>
                    <div class="bm-stat-row"><span>Victorias:</span><b id="bm-s-wins">0</b></div>
                    <div class="bm-stat-row"><span>Mejor tiempo:</span><b id="bm-s-best">—</b></div>
                    <div class="bm-stat-row"><span>Mayor puntaje:</span><b id="bm-s-score">0</b></div>
                </div>

                <div class="bm-panel-section">
                    <div class="bm-section-title">ℹ️ Puntuación</div>
                    <div class="bm-info-text">
                        Casillas × 10<br>
                        + Bonus de tiempo<br>
                        Máx. posible: ~4900 pts
                    </div>
                    <div class="bm-difficulty-row">
                        <span>15×15 · 35 minas</span>
                        <span class="bm-diff-badge">INTERMEDIO</span>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

// ── INICIALIZAR ──
window.initBuscaminas = function() {
    buscaminasRunning = true;
    let ov = document.getElementById('buscaminas-overlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'buscaminas-overlay';
        document.body.appendChild(ov);
    }
    ov.innerHTML = getBuscaminasHTML();
    ov.style.display = 'flex';
    requestAnimationFrame(() => {
        ov.classList.add('bm-visible');
        startNewBuscaminasGame();
        renderBmScores();
        document.getElementById('bm-grid').addEventListener('contextmenu', e => e.preventDefault());
    });
};

// ── NUEVA PARTIDA ──
window.startNewBuscaminasGame = function() {
    if (buscaminasTimer) clearInterval(buscaminasTimer);
    buscaminasGame = newBMGame();
    bmSetFace('🙂');
    bmSetLcd('bm-mines-lcd', BM.MINES);
    bmSetLcd('bm-time-lcd', 0);
    const sc = document.getElementById('bm-current-score');
    if (sc) sc.textContent = '0';
    renderBmGrid();
};

// ── COLOCAR MINAS ──
function bmPlaceMines(fr, fc) {
    const g = buscaminasGame;
    let placed = 0;
    while (placed < BM.MINES) {
        const r = Math.floor(Math.random() * BM.ROWS);
        const c = Math.floor(Math.random() * BM.COLS);
        if (Math.abs(r - fr) <= 1 && Math.abs(c - fc) <= 1) continue;
        if (g.mines[r][c]) continue;
        g.mines[r][c] = true;
        placed++;
    }
    for (let r = 0; r < BM.ROWS; r++)
        for (let c = 0; c < BM.COLS; c++)
            if (!g.mines[r][c])
                g.board[r][c] = bmCountAdjacent(r, c);
}

function bmCountAdjacent(row, col) {
    let n = 0;
    for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
            const nr = row + dr, nc = col + dc;
            if (nr >= 0 && nr < BM.ROWS && nc >= 0 && nc < BM.COLS && buscaminasGame.mines[nr][nc]) n++;
        }
    return n;
}

// ── RENDERIZAR GRID ──
function renderBmGrid() {
    const grid = document.getElementById('bm-grid');
    if (!grid) return;
    grid.style.gridTemplateColumns = `repeat(${BM.COLS}, 1fr)`;
    grid.innerHTML = '';
    const g = buscaminasGame;

    for (let r = 0; r < BM.ROWS; r++) {
        for (let c = 0; c < BM.COLS; c++) {
            const cell = document.createElement('div');
            cell.className = 'bm-cell';
            cell.dataset.r = r;
            cell.dataset.c = c;

            if (g.revealed[r][c]) {
                cell.classList.add('bm-revealed');
                if (g.mines[r][c]) {
                    cell.classList.add('bm-mine-cell');
                    cell.innerHTML = '<span class="bm-mine-emoji">💣</span>';
                } else if (g.board[r][c] > 0) {
                    cell.classList.add(`bm-n${g.board[r][c]}`);
                    cell.textContent = g.board[r][c];
                }
            } else if (g.flagged[r][c]) {
                cell.classList.add('bm-flagged');
                cell.innerHTML = '<span class="bm-flag-emoji">🚩</span>';
            } else {
                cell.classList.add('bm-hidden');
            }

            cell.addEventListener('click', () => bmReveal(r, c));
            cell.addEventListener('contextmenu', e => { e.preventDefault(); bmFlag(r, c); });

            // Táctil: long press = flag
            let longPressTimer = null;
            cell.addEventListener('touchstart', () => {
                longPressTimer = setTimeout(() => { bmFlag(r, c); }, 500);
            });
            cell.addEventListener('touchend', () => clearTimeout(longPressTimer));

            grid.appendChild(cell);
        }
    }
}

// ── REVELAR ──
window.bmReveal = function(row, col) {
    const g = buscaminasGame;
    if (!g || g.over || g.revealed[row][col] || g.flagged[row][col]) return;

    if (!g.started) {
        g.started = true;
        bmPlaceMines(row, col);
        buscaminasTimer = setInterval(() => {
            if (!buscaminasGame || buscaminasGame.over) return;
            buscaminasGame.time++;
            bmSetLcd('bm-time-lcd', buscaminasGame.time);
        }, 1000);
    }

    bmSetFace('😮');
    setTimeout(() => { if (buscaminasGame && !buscaminasGame.over) bmSetFace('🙂'); }, 150);

    if (g.mines[row][col]) {
        bmGameOver(row, col);
        return;
    }

    bmFloodReveal(row, col);
    renderBmGrid();
    bmCheckWin();
};

// ── FLOOD FILL ──
function bmFloodReveal(r, c) {
    const g = buscaminasGame;
    if (r < 0 || r >= BM.ROWS || c < 0 || c >= BM.COLS) return;
    if (g.revealed[r][c] || g.flagged[r][c] || g.mines[r][c]) return;
    g.revealed[r][c] = true;
    g.revealedCount++;
    if (g.board[r][c] === 0)
        for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++)
                bmFloodReveal(r + dr, c + dc);
}

// ── BANDERA ──
window.bmFlag = function(row, col) {
    const g = buscaminasGame;
    if (!g || g.over || g.revealed[row][col] || !g.started) return;
    g.flagged[row][col] = !g.flagged[row][col];
    g.minesLeft += g.flagged[row][col] ? -1 : 1;
    bmSetLcd('bm-mines-lcd', g.minesLeft);
    renderBmGrid();
};

// ── GAME OVER ──
function bmGameOver(hr, hc) {
    const g = buscaminasGame;
    g.over = true;
    clearInterval(buscaminasTimer);
    for (let r = 0; r < BM.ROWS; r++)
        for (let c = 0; c < BM.COLS; c++)
            if (g.mines[r][c]) g.revealed[r][c] = true;
    renderBmGrid();
    bmSetFace('😵');
    setTimeout(() => {
        const cells = document.querySelectorAll('.bm-cell');
        cells.forEach(cell => {
            if (+cell.dataset.r === hr && +cell.dataset.c === hc)
                cell.classList.add('bm-hit-mine');
        });
    }, 30);
    bmSessionStats.games++;
    bmUpdateSessionUI();
}

// ── VICTORIA ──
function bmCheckWin() {
    const g = buscaminasGame;
    if (g.revealedCount >= BM.ROWS * BM.COLS - BM.MINES) {
        g.over = true; g.won = true;
        clearInterval(buscaminasTimer);
        bmSetFace('😎');
        const timeBonus = Math.max(0, 3000 - g.time * 10);
        g.score = g.revealedCount * 10 + timeBonus;
        const sc = document.getElementById('bm-current-score');
        if (sc) { sc.textContent = g.score; sc.classList.add('bm-score-pop'); setTimeout(() => sc.classList.remove('bm-score-pop'), 500); }
        bmSessionStats.games++;
        bmSessionStats.wins++;
        if (!bmSessionStats.bestTime || g.time < bmSessionStats.bestTime) bmSessionStats.bestTime = g.time;
        if (g.score > (bmSessionStats.bestScore || 0)) bmSessionStats.bestScore = g.score;
        bmUpdateSessionUI();
        bmSaveScore(g.score, g.time);
        renderBmScores();
        // Efecto victoria
        const board = document.querySelector('.bm-board-wrap');
        if (board) { board.classList.add('bm-win-glow'); setTimeout(() => board.classList.remove('bm-win-glow'), 1500); }
    }
}

// ── HELPERS ──
function bmSetLcd(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(Math.max(-99, Math.min(999, Math.floor(val)))).padStart(3, '0');
}

function bmSetFace(emoji) {
    const el = document.getElementById('bm-face-btn');
    if (el) el.textContent = emoji;
}

function bmUpdateSessionUI() {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('bm-s-games', bmSessionStats.games);
    set('bm-s-wins',  bmSessionStats.wins);
    set('bm-s-best',  bmSessionStats.bestTime !== null ? bmSessionStats.bestTime + 's' : '—');
    set('bm-s-score', bmSessionStats.bestScore || 0);
}

// ── SCORES (localStorage) ──
function bmSaveScore(score, time) {
    try {
        let arr = JSON.parse(localStorage.getItem('cutreal_bm_scores') || '[]');
        arr.push({ score, time, date: new Date().toLocaleDateString('es-AR') });
        arr.sort((a, b) => b.score - a.score);
        arr = arr.slice(0, 5);
        localStorage.setItem('cutreal_bm_scores', JSON.stringify(arr));
    } catch(e) {}
}

function renderBmScores() {
    const list = document.getElementById('bm-top-list');
    if (!list) return;
    try {
        const arr = JSON.parse(localStorage.getItem('cutreal_bm_scores') || '[]');
        if (!arr.length) { list.innerHTML = '<div class="bm-no-scores">¡Aún no hay scores!</div>'; return; }
        const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
        list.innerHTML = arr.map((s, i) => `
            <div class="bm-top-row ${i === 0 ? 'bm-top-gold' : ''}">
                <span class="bm-medal">${medals[i]}</span>
                <span class="bm-top-score">${s.score}<small>pts</small></span>
                <span class="bm-top-time">⏱️ ${s.time}s</span>
                <span class="bm-top-date">${s.date}</span>
            </div>`).join('');
    } catch(e) { list.innerHTML = '<div class="bm-no-scores">Error al cargar.</div>'; }
}

window.clearBmScores = function() {
    if (!confirm('¿Borrar todos los puntajes de Buscaminas?')) return;
    localStorage.removeItem('cutreal_bm_scores');
    renderBmScores();
};

// ── CERRAR ──
window.closeBuscaminas = function() {
    buscaminasRunning = false;
    if (buscaminasTimer) { clearInterval(buscaminasTimer); buscaminasTimer = null; }
    buscaminasGame = null;
    const ov = document.getElementById('buscaminas-overlay');
    if (ov) { ov.classList.remove('bm-visible'); setTimeout(() => { ov.style.display = 'none'; }, 350); }
};
