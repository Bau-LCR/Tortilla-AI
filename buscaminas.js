// ===== BUSCAMINAS 1989 — EASTER EGG =====
// Activado con: "buscaminas 1989"
// 15x15 casilleros, minas, puntaje, top scores, tema retro-rojo

var minesweeper = {
    overlay: null,
    running: false,
    ROWS: 15,
    COLS: 15,
    MINES: 35,
    board: [],        // {mine, revealed, flagged, adj}
    gameState: 'idle', // idle, playing, won, lost
    startTime: null,
    timerInterval: null,
    score: 0,
    topScores: [],

    init: function() {
        this.topScores = JSON.parse(localStorage.getItem('cutreal_mines_top') || '[]');
        this.buildOverlay();
    },

    buildOverlay: function() {
        var self = this;
        var existing = document.getElementById('mines-overlay');
        if (existing) existing.remove();

        var ov = document.createElement('div');
        ov.id = 'mines-overlay';
        ov.style.cssText = [
            'position:fixed;inset:0;background:rgba(0,0,0,0.97);z-index:98000;',
            'display:flex;flex-direction:column;align-items:center;justify-content:flex-start;',
            'overflow-y:auto;padding:20px 10px 40px;',
            'font-family:"Courier New",monospace;',
            'animation:minesIn 0.35s cubic-bezier(0.4,0,0.2,1) both;'
        ].join('');
        ov.innerHTML = this.buildHTML();
        document.body.appendChild(ov);
        this.overlay = ov;

        // Estilos globales del juego
        if (!document.getElementById('mines-styles')) {
            var style = document.createElement('style');
            style.id = 'mines-styles';
            style.textContent = this.getStyles();
            document.head.appendChild(style);
        }

        this.bindEvents();
        this.newGame();
    },

    buildHTML: function() {
        return `
        <div id="mines-wrap">
            <!-- Header -->
            <div id="mines-header">
                <div id="mines-logo">💣</div>
                <div id="mines-title">
                    <span class="mines-title-main">BUSCAMINAS</span>
                    <span class="mines-title-year">1989</span>
                </div>
                <button id="mines-close-btn" onclick="closeMinesweeper()">✕ Cerrar</button>
            </div>

            <!-- Panel de estado -->
            <div id="mines-status-bar">
                <div class="mines-stat-box" id="mines-mines-left">
                    <span class="mines-stat-icon">💣</span>
                    <span class="mines-stat-val" id="mines-counter">35</span>
                    <span class="mines-stat-lbl">Minas</span>
                </div>
                <div class="mines-stat-box mines-center-stat">
                    <button id="mines-new-btn" onclick="minesweeper.newGame()" title="Nueva partida">
                        <span id="mines-face">🙂</span>
                    </button>
                    <div id="mines-timer-wrap">
                        <span class="mines-stat-icon">⏱</span>
                        <span class="mines-stat-val" id="mines-timer">000</span>
                    </div>
                </div>
                <div class="mines-stat-box" id="mines-score-box">
                    <span class="mines-stat-icon">🏆</span>
                    <span class="mines-stat-val" id="mines-score">0</span>
                    <span class="mines-stat-lbl">Puntos</span>
                </div>
            </div>

            <!-- Tablero -->
            <div id="mines-board-wrap">
                <div id="mines-board"></div>
            </div>

            <!-- Panel lateral: info + top scores -->
            <div id="mines-side-panel">
                <div id="mines-legend">
                    <h4>🎮 Controles</h4>
                    <div class="mines-legend-row"><span class="mines-key">Click</span> Revelar</div>
                    <div class="mines-legend-row"><span class="mines-key">Clic Der.</span> Bandera</div>
                    <div class="mines-legend-row"><span class="mines-key">F</span> Nueva partida</div>
                </div>
                <div id="mines-top-panel">
                    <h4>🏅 Top Scores</h4>
                    <div id="mines-top-list"></div>
                </div>
                <div id="mines-diff-panel">
                    <h4>⚡ Dificultad</h4>
                    <button class="mines-diff-btn active" onclick="minesweeper.setDiff('facil',this)">Fácil (20💣)</button>
                    <button class="mines-diff-btn" onclick="minesweeper.setDiff('normal',this)">Normal (35💣)</button>
                    <button class="mines-diff-btn" onclick="minesweeper.setDiff('dificil',this)">Difícil (50💣)</button>
                </div>
            </div>

            <!-- Mensaje fin de juego -->
            <div id="mines-end-msg" style="display:none;"></div>
        </div>`;
    },

    getStyles: function() {
        return `
@keyframes minesIn { from{opacity:0;transform:scale(0.94)} to{opacity:1;transform:scale(1)} }
@keyframes mineExplode { 0%{transform:scale(1)} 20%{transform:scale(1.5)} 100%{transform:scale(1)} }
@keyframes mineReveal { from{transform:scale(0.8);opacity:0} to{transform:scale(1);opacity:1} }
@keyframes minesWin { 0%,100%{box-shadow:0 0 0 rgba(255,200,0,0)} 50%{box-shadow:0 0 40px rgba(255,200,0,0.6)} }
@keyframes flagPop { 0%{transform:scale(0)} 60%{transform:scale(1.3)} 100%{transform:scale(1)} }
@keyframes cellPulse { 0%,100%{background:rgba(255,59,59,0.1)} 50%{background:rgba(255,59,59,0.28)} }

#mines-overlay { color:#f0f0f0; }

#mines-wrap {
    width:100%;max-width:900px;
    display:grid;
    grid-template-areas:
        "header header"
        "status status"
        "board side"
        "end end";
    grid-template-columns:auto 1fr;
    gap:14px;
    padding:10px;
}

#mines-header {
    grid-area:header;
    display:flex;align-items:center;gap:14px;
    padding:14px 18px;
    background:linear-gradient(135deg,rgba(180,0,0,0.22) 0%,rgba(0,0,0,0.5) 100%);
    border:1px solid rgba(255,59,59,0.3);
    border-radius:16px;
}
#mines-logo { font-size:36px; animation:mineExplode 3s ease-in-out infinite; }
#mines-title { flex:1; display:flex;flex-direction:column; }
.mines-title-main { font-size:26px;font-weight:900;color:#ff3b3b;letter-spacing:3px;text-transform:uppercase;text-shadow:0 0 20px rgba(255,59,59,0.6); }
.mines-title-year { font-size:13px;color:#888;letter-spacing:4px; }
#mines-close-btn {
    background:rgba(255,59,59,0.12);border:1px solid rgba(255,59,59,0.35);
    color:#ff8888;padding:9px 18px;border-radius:999px;font-family:"Courier New",monospace;
    font-size:13px;font-weight:700;cursor:pointer;transition:all 0.2s;letter-spacing:1px;
}
#mines-close-btn:hover { background:rgba(255,59,59,0.28);color:white;transform:scale(1.04); }

#mines-status-bar {
    grid-area:status;
    display:flex;align-items:center;justify-content:space-between;gap:12px;
    padding:10px 16px;
    background:rgba(15,0,0,0.8);
    border:2px solid rgba(255,59,59,0.25);
    border-radius:12px;
}
.mines-stat-box {
    display:flex;flex-direction:column;align-items:center;gap:2px;
    min-width:80px;
}
.mines-stat-icon { font-size:16px; }
.mines-stat-val { font-size:24px;font-weight:900;color:#ff3b3b;letter-spacing:2px; }
.mines-stat-lbl { font-size:10px;color:#666;text-transform:uppercase;letter-spacing:1px; }
.mines-center-stat { flex:1;align-items:center; }
#mines-timer-wrap { display:flex;align-items:center;gap:5px;margin-top:4px; }
#mines-timer { font-size:22px;color:#ffdd00;font-weight:900;letter-spacing:2px; }
#mines-new-btn {
    background:rgba(255,255,255,0.07);border:2px solid rgba(255,59,59,0.3);
    border-radius:50%;width:52px;height:52px;font-size:26px;cursor:pointer;
    transition:all 0.2s;display:flex;align-items:center;justify-content:center;
}
#mines-new-btn:hover { background:rgba(255,59,59,0.18);transform:scale(1.1); }

#mines-board-wrap {
    grid-area:board;
    background:rgba(10,0,0,0.9);
    border:2px solid rgba(255,59,59,0.25);
    border-radius:14px;
    padding:12px;
    display:inline-flex;
    align-self:start;
}
#mines-board {
    display:grid;
    gap:2px;
}
.mine-cell {
    width:36px;height:36px;
    display:flex;align-items:center;justify-content:center;
    font-size:14px;font-weight:900;font-family:"Courier New",monospace;
    border-radius:6px;cursor:pointer;
    border:1px solid rgba(255,59,59,0.12);
    background:rgba(255,255,255,0.05);
    transition:all 0.12s;user-select:none;
    -webkit-user-select:none;
}
.mine-cell:hover:not(.revealed):not(.exploded) {
    background:rgba(255,59,59,0.18);
    border-color:rgba(255,59,59,0.45);
    transform:scale(1.08);
}
.mine-cell.revealed {
    background:rgba(0,0,0,0.6);
    border-color:rgba(255,255,255,0.06);
    cursor:default;
    animation:mineReveal 0.15s ease both;
}
.mine-cell.flagged { background:rgba(255,150,0,0.12);border-color:rgba(255,150,0,0.4); }
.mine-cell.flagged .flag-anim { animation:flagPop 0.2s ease both; }
.mine-cell.exploded { background:rgba(255,0,0,0.5);border-color:#ff0000;animation:mineExplode 0.4s ease; }
.mine-cell.won-cell { animation:minesWin 1s ease infinite; }
.mine-cell.questioned { background:rgba(180,100,0,0.18);border-color:rgba(255,180,0,0.4); }

/* Colores de números clásicos */
.adj-1 { color:#4499ff; }
.adj-2 { color:#44ff44; }
.adj-3 { color:#ff4444; }
.adj-4 { color:#8844ff; }
.adj-5 { color:#ff8844; }
.adj-6 { color:#44ffff; }
.adj-7 { color:#ff44ff; }
.adj-8 { color:#ffff44; }

/* Panel lateral */
#mines-side-panel {
    grid-area:side;
    display:flex;flex-direction:column;gap:12px;
    padding-left:4px;
}
#mines-legend, #mines-top-panel, #mines-diff-panel {
    background:rgba(15,0,0,0.85);
    border:1px solid rgba(255,59,59,0.2);
    border-radius:12px;
    padding:14px 16px;
}
#mines-legend h4, #mines-top-panel h4, #mines-diff-panel h4 {
    margin:0 0 10px;font-size:13px;color:#ff8888;
    text-transform:uppercase;letter-spacing:1px;
}
.mines-legend-row { display:flex;align-items:center;gap:10px;margin:6px 0;font-size:12px;color:#999; }
.mines-key {
    background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);
    padding:2px 8px;border-radius:5px;font-size:11px;color:#ccc;
}
.mines-top-entry {
    display:flex;align-items:center;gap:8px;padding:5px 0;
    border-bottom:1px solid rgba(255,59,59,0.08);font-size:12px;
}
.mines-top-rank { font-size:14px;flex-shrink:0; }
.mines-top-pts { color:#ff3b3b;font-weight:700;flex:1; }
.mines-top-time { color:#888;font-size:11px; }
.mines-no-scores { color:#555;font-size:12px;text-align:center;padding:10px 0; }

.mines-diff-btn {
    width:100%;margin:3px 0;padding:8px 12px;
    background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);
    color:#888;border-radius:8px;cursor:pointer;font-family:"Courier New",monospace;
    font-size:12px;transition:all 0.2s;text-align:left;
}
.mines-diff-btn:hover { background:rgba(255,59,59,0.1);color:#ff9090;border-color:rgba(255,59,59,0.3); }
.mines-diff-btn.active { background:rgba(255,59,59,0.15);color:#ff8888;border-color:rgba(255,59,59,0.4);font-weight:700; }

/* Mensaje fin */
#mines-end-msg {
    grid-area:end;
    padding:18px 22px;border-radius:14px;
    font-size:16px;font-weight:700;text-align:center;
    animation:minesIn 0.3s ease both;
}
#mines-end-msg.won {
    background:rgba(0,120,0,0.2);border:2px solid rgba(0,200,0,0.4);color:#66ff66;
}
#mines-end-msg.lost {
    background:rgba(180,0,0,0.2);border:2px solid rgba(255,0,0,0.4);color:#ff6666;
}

/* Mobile */
@media (max-width:600px) {
    #mines-wrap { grid-template-areas:"header" "status" "board" "side" "end"; grid-template-columns:1fr; }
    .mine-cell { width:28px;height:28px;font-size:11px; }
    #mines-side-panel { padding-left:0; }
}
        `;
    },

    bindEvents: function() {
        // Keyboard: F = nueva partida, ESC = cerrar
        this._keyHandler = function(e) {
            if(e.key==='f'||e.key==='F') minesweeper.newGame();
            if(e.key==='Escape') closeMinesweeper();
        };
        document.addEventListener('keydown', this._keyHandler);
    },

    setDiff: function(diff, btn) {
        document.querySelectorAll('.mines-diff-btn').forEach(function(b){ b.classList.remove('active'); });
        if(btn) btn.classList.add('active');
        if(diff==='facil')   { this.MINES=20; }
        if(diff==='normal')  { this.MINES=35; }
        if(diff==='dificil') { this.MINES=50; }
        this.newGame();
    },

    newGame: function() {
        this.gameState = 'idle';
        this.score = 0;
        this.startTime = null;
        clearInterval(this.timerInterval);
        this.board = [];
        this.buildBoard();
        this.renderBoard();
        this.updateUI();
        document.getElementById('mines-face').textContent = '🙂';
        document.getElementById('mines-timer').textContent = '000';
        document.getElementById('mines-score').textContent = '0';
        var endMsg = document.getElementById('mines-end-msg');
        if(endMsg) endMsg.style.display='none';
    },

    buildBoard: function() {
        var R=this.ROWS, C=this.COLS;
        this.board=[];
        for(var r=0;r<R;r++){
            this.board[r]=[];
            for(var c=0;c<C;c++) this.board[r][c]={mine:false,revealed:false,flagged:false,questioned:false,adj:0};
        }
        // Colocar minas aleatorias
        var placed=0;
        while(placed<this.MINES){
            var r=Math.floor(Math.random()*R), c=Math.floor(Math.random()*C);
            if(!this.board[r][c].mine){ this.board[r][c].mine=true; placed++; }
        }
        // Calcular adyacentes
        for(var r=0;r<R;r++) for(var c=0;c<C;c++){
            if(!this.board[r][c].mine) this.board[r][c].adj=this.countAdj(r,c);
        }
    },

    countAdj: function(r,c){
        var count=0;
        for(var dr=-1;dr<=1;dr++) for(var dc=-1;dc<=1;dc++){
            var nr=r+dr, nc=c+dc;
            if(nr>=0&&nr<this.ROWS&&nc>=0&&nc<this.COLS&&this.board[nr][nc].mine) count++;
        }
        return count;
    },

    renderBoard: function() {
        var boardEl=document.getElementById('mines-board');
        if(!boardEl) return;
        boardEl.style.gridTemplateColumns='repeat('+this.COLS+',36px)';
        boardEl.innerHTML='';
        var self=this;
        for(var r=0;r<this.ROWS;r++) for(var c=0;c<this.COLS;c++){
            (function(row,col){
                var cell=document.createElement('div');
                cell.className='mine-cell';
                cell.dataset.r=row; cell.dataset.c=col;
                cell.id='mc-'+row+'-'+col;
                var cellData=self.board[row][col];
                if(cellData.revealed){
                    cell.classList.add('revealed');
                    if(cellData.mine){
                        cell.textContent='💣';
                        cell.classList.add('exploded');
                    } else if(cellData.adj>0){
                        cell.textContent=cellData.adj;
                        cell.classList.add('adj-'+cellData.adj);
                    }
                } else if(cellData.flagged){
                    cell.classList.add('flagged');
                    cell.innerHTML='<span class="flag-anim">🚩</span>';
                } else if(cellData.questioned){
                    cell.classList.add('questioned');
                    cell.textContent='?';
                }
                cell.addEventListener('click',function(e){ e.preventDefault(); self.reveal(row,col); });
                cell.addEventListener('contextmenu',function(e){ e.preventDefault(); self.toggleFlag(row,col); });
                cell.addEventListener('touchstart',function(e){
                    self._touchTimer=setTimeout(function(){
                        self.toggleFlag(row,col);
                        self._touchHeld=true;
                    },400);
                },{passive:true});
                cell.addEventListener('touchend',function(e){
                    clearTimeout(self._touchTimer);
                    if(!self._touchHeld) self.reveal(row,col);
                    self._touchHeld=false;
                });
                boardEl.appendChild(cell);
            })(r,c);
        }
        this.updateTopList();
    },

    updateCell: function(r,c){
        var cell=document.getElementById('mc-'+r+'-'+c);
        if(!cell) return;
        var cellData=this.board[r][c];
        cell.className='mine-cell';
        cell.innerHTML='';
        if(cellData.revealed){
            cell.classList.add('revealed');
            if(cellData.mine){ cell.textContent='💣'; cell.classList.add('exploded'); }
            else if(cellData.adj>0){ cell.textContent=cellData.adj; cell.classList.add('adj-'+cellData.adj); }
        } else if(cellData.flagged){
            cell.classList.add('flagged');
            cell.innerHTML='<span class="flag-anim">🚩</span>';
        } else if(cellData.questioned){
            cell.classList.add('questioned');
            cell.textContent='?';
        }
    },

    reveal: function(r,c){
        if(this.gameState==='won'||this.gameState==='lost') return;
        var cell=this.board[r][c];
        if(cell.revealed||cell.flagged) return;

        // Primera revelación: iniciar timer
        if(this.gameState==='idle'){
            this.gameState='playing';
            this.startTime=Date.now();
            this.runTimer();
        }

        cell.revealed=true;
        this.updateCell(r,c);

        if(cell.mine){
            this.explode(r,c);
            return;
        }

        this.score+=10;
        document.getElementById('mines-score').textContent=this.score;

        // Flood fill si adj===0
        if(cell.adj===0){
            for(var dr=-1;dr<=1;dr++) for(var dc=-1;dc<=1;dc++){
                var nr=r+dr, nc=c+dc;
                if(nr>=0&&nr<this.ROWS&&nc>=0&&nc<this.COLS&&!this.board[nr][nc].revealed&&!this.board[nr][nc].flagged)
                    this.reveal(nr,nc);
            }
        }

        this.checkWin();
    },

    toggleFlag: function(r,c){
        if(this.gameState==='won'||this.gameState==='lost') return;
        var cell=this.board[r][c];
        if(cell.revealed) return;
        if(!cell.flagged&&!cell.questioned){ cell.flagged=true; }
        else if(cell.flagged){ cell.flagged=false; cell.questioned=true; }
        else { cell.questioned=false; }
        this.updateCell(r,c);
        this.updateUI();
    },

    explode: function(r,c){
        this.gameState='lost';
        clearInterval(this.timerInterval);
        document.getElementById('mines-face').textContent='😵';
        // Revelar todas las minas con delay escalonado
        var mineList=[];
        for(var mr=0;mr<this.ROWS;mr++) for(var mc=0;mc<this.COLS;mc++)
            if(this.board[mr][mc].mine&&!this.board[mr][mc].flagged) mineList.push([mr,mc]);
        mineList.sort(function(a,b){ return Math.abs(a[0]-r)+Math.abs(a[1]-c)-Math.abs(b[0]-r)-Math.abs(b[1]-c); });
        var self=this;
        mineList.forEach(function(pos,i){
            setTimeout(function(){
                self.board[pos[0]][pos[1]].revealed=true;
                self.updateCell(pos[0],pos[1]);
            }, i*40);
        });
        setTimeout(function(){
            self.showEndMsg(false, 0);
        }, mineList.length*40+200);
    },

    checkWin: function(){
        var unrevealed=0;
        for(var r=0;r<this.ROWS;r++) for(var c=0;c<this.COLS;c++)
            if(!this.board[r][c].revealed&&!this.board[r][c].mine) unrevealed++;
        if(unrevealed>0) return;
        this.gameState='won';
        clearInterval(this.timerInterval);
        document.getElementById('mines-face').textContent='😎';
        // Banderas en todas las minas
        for(var r=0;r<this.ROWS;r++) for(var c=0;c<this.COLS;c++){
            if(this.board[r][c].mine){ this.board[r][c].flagged=true; this.updateCell(r,c); }
        }
        var elapsed=Math.floor((Date.now()-this.startTime)/1000);
        var timeBonus=Math.max(0,500-elapsed*2);
        var diffBonus=this.MINES===50?300:this.MINES===35?150:0;
        var finalScore=this.score+timeBonus+diffBonus;
        this.score=finalScore;
        document.getElementById('mines-score').textContent=finalScore;
        this.saveScore(finalScore,elapsed);
        this.showEndMsg(true,finalScore,elapsed);
    },

    saveScore: function(score,time){
        this.topScores.push({score:score,time:time,date:new Date().toLocaleDateString('es-AR')});
        this.topScores.sort(function(a,b){return b.score-a.score;});
        this.topScores=this.topScores.slice(0,10);
        localStorage.setItem('cutreal_mines_top',JSON.stringify(this.topScores));
        this.updateTopList();
    },

    updateTopList: function(){
        var el=document.getElementById('mines-top-list');
        if(!el) return;
        if(!this.topScores.length){ el.innerHTML='<div class="mines-no-scores">Sin partidas aún</div>'; return; }
        var medals=['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
        el.innerHTML=this.topScores.map(function(s,i){
            return '<div class="mines-top-entry">'
                +'<span class="mines-top-rank">'+(medals[i]||'·')+'</span>'
                +'<span class="mines-top-pts">'+s.score+' pts</span>'
                +'<span class="mines-top-time">'+s.time+'s · '+s.date+'</span>'
                +'</div>';
        }).join('');
    },

    showEndMsg: function(won,score,time){
        var el=document.getElementById('mines-end-msg');
        if(!el) return;
        el.style.display='block';
        if(won){
            el.className='won';
            el.innerHTML='🎉 <b>¡GANASTE!</b>  Score: '+score+' pts · Tiempo: '+time+'s<br>'
                +'<small style="opacity:0.7;font-size:12px;">Presioná F o el botón para jugar de nuevo</small>';
        } else {
            el.className='lost';
            el.innerHTML='💥 <b>¡BOOM!</b> Pisaste una mina. Score: '+score+' pts<br>'
                +'<small style="opacity:0.7;font-size:12px;">Presioná F o el botón para reintentar</small>';
        }
        el.scrollIntoView({behavior:'smooth',block:'nearest'});
    },

    runTimer: function(){
        var self=this;
        clearInterval(this.timerInterval);
        this.timerInterval=setInterval(function(){
            if(!self.startTime) return;
            var elapsed=Math.floor((Date.now()-self.startTime)/1000);
            var el=document.getElementById('mines-timer');
            if(el) el.textContent=String(Math.min(elapsed,999)).padStart(3,'0');
        },1000);
    },

    updateUI: function(){
        var flags=0;
        for(var r=0;r<this.ROWS;r++) for(var c=0;c<this.COLS;c++) if(this.board[r][c].flagged) flags++;
        var el=document.getElementById('mines-counter');
        if(el) el.textContent=Math.max(0,this.MINES-flags);
    },

    destroy: function(){
        clearInterval(this.timerInterval);
        if(this._keyHandler) document.removeEventListener('keydown',this._keyHandler);
        var ov=document.getElementById('mines-overlay');
        if(ov) ov.remove();
        this.running=false;
    }
};

// ── API pública ──
window.openMinesweeper = function() {
    minesweeper.running = true;
    minesweeper.init();
};

window.closeMinesweeper = function() {
    minesweeper.destroy();
    // Mostrar toast de regreso
    if(typeof showToast === 'function') showToast('🎮 Buscaminas cerrado', '#ff8888', '');
};
