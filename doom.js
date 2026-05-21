// ===== CUT-REAL DOOM ENGINE — RAYCASTER CLÁSICO 1993 =====
// Motor de raycasting inspirado en el Doom original.
// BUGFIX: canvas ahora espera a tener dimensiones reales antes de renderizar.

'use strict';

let doomRunning   = false;
let doomAnimFrame = null;
let doomKeys      = {};
let doomAudioCtx  = null;

// ─── AUDIO ───────────────────────────────────────────────────────────────────
function getDoomAudio() {
    if (!doomAudioCtx) {
        try { doomAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    return doomAudioCtx;
}
function playSound(type) {
    const ac = getDoomAudio();
    if (!ac) return;
    try {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        const t = ac.currentTime;
        if (type === 'shoot') {
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(380, t);
            o.frequency.exponentialRampToValueAtTime(35, t + 0.22);
            g.gain.setValueAtTime(0.32, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
            o.start(t); o.stop(t + 0.22);
        } else if (type === 'hit') {
            o.type = 'square';
            o.frequency.setValueAtTime(220, t);
            o.frequency.exponentialRampToValueAtTime(55, t + 0.15);
            g.gain.setValueAtTime(0.22, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            o.start(t); o.stop(t + 0.15);
        } else if (type === 'death') {
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(450, t);
            o.frequency.exponentialRampToValueAtTime(18, t + 0.7);
            g.gain.setValueAtTime(0.38, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
            o.start(t); o.stop(t + 0.7);
        } else if (type === 'step') {
            o.type = 'sine';
            o.frequency.setValueAtTime(90, t);
            o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
            g.gain.setValueAtTime(0.09, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
            o.start(t); o.stop(t + 0.09);
        } else if (type === 'pickup') {
            o.type = 'sine';
            o.frequency.setValueAtTime(660, t);
            o.frequency.setValueAtTime(880, t + 0.08);
            o.frequency.setValueAtTime(1100, t + 0.16);
            g.gain.setValueAtTime(0.22, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
            o.start(t); o.stop(t + 0.28);
        } else if (type === 'door') {
            o.type = 'square';
            o.frequency.setValueAtTime(120, t);
            o.frequency.exponentialRampToValueAtTime(60, t + 0.3);
            g.gain.setValueAtTime(0.15, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            o.start(t); o.stop(t + 0.3);
        }
    } catch(e) {}
}

// ─── TEXTURAS PROCEDURALES ────────────────────────────────────────────────────
function buildTextures() {
    const S = 64;
    function makeTex(fn) {
        const d = new Uint8Array(S * S * 4);
        for (let y = 0; y < S; y++)
            for (let x = 0; x < S; x++) {
                const i = (y * S + x) * 4;
                const [r, g, b] = fn(x, y);
                d[i]=r; d[i+1]=g; d[i+2]=b; d[i+3]=255;
            }
        return { data: d, size: S };
    }

    // Ladrillo rojo
    const wall1 = makeTex((x, y) => {
        const row = Math.floor(y / 10);
        const ox  = (row & 1) ? 16 : 0;
        const lx  = (x + ox) % 32;
        const ly  = y % 10;
        if (lx < 2 || ly < 2) return [55, 44, 33];
        const n   = (Math.sin(x * 6.1 + y * 3.7) * 0.5 + 0.5) * 22;
        const e   = Math.min(lx, 30-lx, ly, 8-ly) < 2 ? 0.72 : 1;
        return [Math.min(255, (148+n)*e)|0, Math.min(255, (38+n*0.3)*e)|0, Math.min(255, (22+n*0.2)*e)|0];
    });

    // Piedra gris
    const wall2 = makeTex((x, y) => {
        const n = Math.sin(x*0.9+y*1.3)*18 + Math.cos(x*2.8-y*2.1)*10 + Math.sin(x*5.1+y*4.3)*5;
        const v = 82 + n | 0;
        return [v, v, v+8];
    });

    // Metal oxidado
    const wall3 = makeTex((x, y) => {
        const stripe = (y%8 < 2) ? 0.55 : 1;
        const rust   = Math.sin(x*2.3+y*1.9) > 0.65 ? 45 : 0;
        const b      = 72*stripe | 0;
        return [b+rust, (b*0.7)|0, (b*0.45)|0];
    });

    // Puerta madera
    const door = makeTex((x, y) => {
        const panel = Math.floor(x/21)%3;
        const grain = Math.sin(y*0.8+x*0.2)*12;
        const base  = panel===1 ? 90 : 110;
        return [(base+grain)|0, ((base+grain)*0.55)|0, ((base+grain)*0.22)|0];
    });

    // Suelo
    const floor = makeTex((x, y) => {
        const n = Math.sin(x*1.5+y*0.8)*Math.cos(x*0.6-y*1.3)*18;
        const v = 52+n | 0;
        return [(v*0.75)|0, (v*0.65)|0, (v*0.45)|0];
    });

    // Techo
    const ceil = makeTex((x, y) => {
        const n = Math.sin(x*2.2+y*1.9)*10;
        const v = 28+n | 0;
        return [v, (v*0.5)|0, (v*0.28)|0];
    });

    return { wall1, wall2, wall3, door, floor, ceil };
}

function sampleTex(tex, tx, ty) {
    const xi = Math.floor(((tx%1)+1)%1 * tex.size) % tex.size;
    const yi = Math.floor(((ty%1)+1)%1 * tex.size) % tex.size;
    const i  = (yi * tex.size + xi) * 4;
    return [tex.data[i], tex.data[i+1], tex.data[i+2]];
}

// ─── MOTOR PRINCIPAL ──────────────────────────────────────────────────────────
function startDoom() {
    doomRunning = true;
    doomKeys    = {};

    const canvas = document.getElementById('doom-canvas');
    if (!canvas) return;

    // BUGFIX: forzar tamaño real antes del primer frame
    function forceSize() {
        const parent = canvas.parentElement;
        const w = parent ? parent.clientWidth  : window.innerWidth;
        const h = parent ? parent.clientHeight : window.innerHeight;
        canvas.width  = Math.max(320, w);
        canvas.height = Math.max(240, h);
    }
    forceSize();

    const ctx2d = canvas.getContext('2d');

    // ── MAPA ──
    // 0=vacío 1=ladrillo 2=piedra 3=metal 9=puerta (bloqueante)
    const MAP = [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,2,2,2,0,0,0,2,2,0,0,0,2,2,2,0,0,0,0,0,0,0,1],
        [1,0,2,0,0,0,0,0,2,0,0,0,0,0,2,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,3,3,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,1],
        [1,0,2,0,3,0,0,0,0,0,0,2,2,0,0,0,2,0,0,0,0,0,0,1],
        [1,0,2,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,1,1,1,0,0,1,1,1,0,0,0,0,0,1,1,1,1,0,1],
        [1,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,1,0,0,1,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,0,1],
        [1,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,1,1,1,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,3,0,0,0,0,0,0,0,0,0,0,0,0,0,3,3,0,0,0,0,0,1],
        [1,0,3,3,3,0,0,0,0,0,0,0,0,0,0,0,3,3,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,2,2,2,0,0,2,2,2,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,2,0,2,0,0,2,0,2,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ];
    const MW = MAP[0].length, MH = MAP.length;
    const TEXTURES = buildTextures();
    const WALL_TEX = [null, TEXTURES.wall1, TEXTURES.wall2, TEXTURES.wall3, TEXTURES.door];

    // ── JUGADOR ──
    const player = {
        x: 1.5, y: 1.5,
        angle: Math.PI/4,
        speed: 0.07,
        rotSpeed: 0.05,
        health: 100,
        armor: 0,
        ammo: { pistol:50, shotgun:20, rocket:5 },
        weapon: 'pistol',
        score: 0,
        kills: 0,
        bobPhase: 0,
        stepTimer: 0,
        dead: false,
        invincible: 0,
    };

    const WEAPONS = {
        pistol:  { name:'PISTOLA',       damage:20, spread:0.04, fireRate:15, ammoKey:'pistol',  perShot:1 },
        shotgun: { name:'ESCOPETA',      damage:15, spread:0.20, fireRate:38, ammoKey:'shotgun', perShot:1, pellets:7 },
        rocket:  { name:'LANZACOHETES',  damage:80, spread:0.01, fireRate:52, ammoKey:'rocket',  perShot:1, splash:true },
    };

    let items = [
        {x:3.5,  y:3.5,  type:'health',  value:25, alive:true, bob:0},
        {x:10.5, y:5.5,  type:'ammo',    value:10, ammoKey:'pistol',  alive:true, bob:0.5},
        {x:6.5,  y:10.5, type:'armor',   value:25, alive:true, bob:1.0},
        {x:15.5, y:8.5,  type:'shotgun', value:1,  alive:true, bob:1.5},
        {x:8.5,  y:18.5, type:'ammo',    value:5,  ammoKey:'shotgun', alive:true, bob:0.2},
        {x:20.5, y:3.5,  type:'rocket',  value:1,  alive:true, bob:0.7},
        {x:20.5, y:11.5, type:'ammo',    value:3,  ammoKey:'rocket',  alive:true, bob:0.3},
        {x:12.5, y:20.5, type:'health',  value:50, alive:true, bob:0.9},
        {x:16.5, y:4.5,  type:'health',  value:10, alive:true, bob:0.4},
        {x:3.5,  y:14.5, type:'ammo',    value:15, ammoKey:'pistol', alive:true, bob:1.2},
    ];

    const EDATA = {
        zombie: {speed:0.013,atkRange:1.1,sight:8, dmg:5, rate:60,  col:[185,55,55],  hcol:[205,140,105], pts:100},
        imp:    {speed:0.020,atkRange:6.5,sight:11,dmg:10,rate:80,  col:[125,65,20],  hcol:[155,105,60],  pts:200},
        demon:  {speed:0.024,atkRange:1.0,sight:7, dmg:22,rate:40,  col:[210,28,28],  hcol:[230,75,75],   pts:500},
        cacodemon:{speed:0.016,atkRange:7,sight:12,dmg:15,rate:70,  col:[160,30,130], hcol:[200,80,180],  pts:350},
    };

    let enemies = [
        {x:8.5,  y:4.5,  type:'imp',      alive:true, hp:40,  maxHp:40,  state:'idle', stTimer:0, atkTimer:0, anim:0, alert:0},
        {x:4.5,  y:8.5,  type:'zombie',   alive:true, hp:25,  maxHp:25,  state:'idle', stTimer:0, atkTimer:0, anim:0, alert:0},
        {x:15.5, y:8.5,  type:'imp',      alive:true, hp:40,  maxHp:40,  state:'idle', stTimer:0, atkTimer:0, anim:0, alert:0},
        {x:8.5,  y:15.5, type:'demon',    alive:true, hp:150, maxHp:150, state:'idle', stTimer:0, atkTimer:0, anim:0, alert:0},
        {x:3.5,  y:17.5, type:'zombie',   alive:true, hp:25,  maxHp:25,  state:'idle', stTimer:0, atkTimer:0, anim:0, alert:0},
        {x:20.5, y:5.5,  type:'imp',      alive:true, hp:40,  maxHp:40,  state:'idle', stTimer:0, atkTimer:0, anim:0, alert:0},
        {x:18.5, y:18.5, type:'demon',    alive:true, hp:150, maxHp:150, state:'idle', stTimer:0, atkTimer:0, anim:0, alert:0},
        {x:20.5, y:15.5, type:'zombie',   alive:true, hp:25,  maxHp:25,  state:'idle', stTimer:0, atkTimer:0, anim:0, alert:0},
        {x:12.5, y:12.5, type:'cacodemon',alive:true, hp:80,  maxHp:80,  state:'idle', stTimer:0, atkTimer:0, anim:0, alert:0},
        {x:6.5,  y:20.5, type:'imp',      alive:true, hp:40,  maxHp:40,  state:'idle', stTimer:0, atkTimer:0, anim:0, alert:0},
    ];
    const totalEnemies = enemies.length;

    let projectiles = [];
    let explosions  = [];
    let bloodSplats = [];
    let messages    = [];

    let shootTimer = 0, flashTimer = 0, deathTimer = 0;
    let screenFlash = {r:0,g:0,b:0,a:0,t:0};

    // ── HELPERS ──
    function canMove(x, y) {
        const mx = x|0, my = y|0;
        if (my<0||my>=MH||mx<0||mx>=MW) return false;
        return MAP[my][mx] === 0;
    }

    function addMsg(text, color='#ffdd44', dur=90) {
        messages.push({text, color, t:dur});
    }

    function flashScreen(r,g,b,a,t=12) {
        screenFlash.r=r; screenFlash.g=g; screenFlash.b=b; screenFlash.a=a; screenFlash.t=t;
    }

    function spawnExplosion(x,y,scale=1) {
        explosions.push({x,y,t:32*scale,max:32*scale});
        flashScreen(255,140,0,0.45,12);
    }

    function spawnBlood(x,y) {
        bloodSplats.push({x,y,size:0.25+Math.random()*0.3,a:0.9,decay:0.006});
    }

    function damagePlayer(dmg) {
        if (player.invincible>0) return;
        const absorb = Math.min(player.armor, dmg*0.5);
        player.armor = Math.max(0, player.armor-absorb);
        player.health -= (dmg-absorb);
        player.invincible = 22;
        flashScreen(255,0,0,0.45,14);
        if (player.health<=0) { player.health=0; player.dead=true; playSound('death'); }
    }

    function pickupItem(item) {
        item.alive = false;
        playSound('pickup');
        switch(item.type) {
            case 'health':
                player.health = Math.min(100, player.health+item.value);
                addMsg(`+${item.value} SALUD`, '#44ff88');
                flashScreen(0,200,0,0.18,8);
                break;
            case 'armor':
                player.armor = Math.min(100, player.armor+item.value);
                addMsg(`+${item.value} ARMOR`, '#4488ff');
                break;
            case 'ammo':
                player.ammo[item.ammoKey] += item.value;
                addMsg(`+${item.value} MUNICIÓN`, '#ffdd00');
                break;
            case 'shotgun':
                player.weapon='shotgun';
                player.ammo.shotgun += 8;
                addMsg('¡ESCOPETA OBTENIDA!', '#ffaa22');
                break;
            case 'rocket':
                player.weapon='rocket';
                player.ammo.rocket += 3;
                addMsg('¡LANZACOHETES!', '#ff6600');
                break;
        }
    }

    function fireRay(angle, damage) {
        let best=Infinity, target=null;
        for (const e of enemies) {
            if (!e.alive) continue;
            const dx=e.x-player.x, dy=e.y-player.y;
            const dist=Math.sqrt(dx*dx+dy*dy);
            if (dist>18) continue;
            let diff = Math.atan2(dy,dx)-angle;
            while(diff> Math.PI) diff-=Math.PI*2;
            while(diff<-Math.PI) diff+=Math.PI*2;
            if (Math.abs(diff)<0.18 && dist<best) { best=dist; target=e; }
        }
        if (!target) return;
        target.hp -= damage;
        target.state='pain'; target.stTimer=14;
        playSound('hit');
        spawnBlood(target.x+(Math.random()-.5)*.4, target.y+(Math.random()-.5)*.4);
        if (target.hp<=0) {
            target.alive=false;
            player.score += EDATA[target.type].pts;
            player.kills++;
            playSound('death');
            spawnExplosion(target.x, target.y, 0.4);
            addMsg(`+${EDATA[target.type].pts} pts`, '#ffee44');
        }
    }

    function shoot() {
        if (player.dead||shootTimer>0) return;
        const wpn = WEAPONS[player.weapon];
        if (player.ammo[wpn.ammoKey]<=0) { addMsg('SIN MUNICIÓN!','#ff4444'); return; }
        player.ammo[wpn.ammoKey]--;
        shootTimer=wpn.fireRate; flashTimer=10;
        playSound('shoot');
        if (wpn.pellets) {
            for (let i=0;i<wpn.pellets;i++)
                fireRay(player.angle+(Math.random()-.5)*wpn.spread, wpn.damage);
        } else if (wpn.splash) {
            const sp=0.19;
            projectiles.push({x:player.x,y:player.y,dx:Math.cos(player.angle)*sp,dy:Math.sin(player.angle)*sp,type:'rocket',dmg:wpn.damage,enemy:false,alive:true});
        } else {
            fireRay(player.angle+(Math.random()-.5)*wpn.spread, wpn.damage);
        }
    }

    // ── RAYCASTING CON TEXTURAS ──
    function castRays(W, H) {
        const FOV   = 1.1;  // ~63° como Doom original
        const halfH = H/2;
        const buf   = new Uint8ClampedArray(W*H*4);
        const zBuf  = new Float32Array(W);

        // Suelo y techo
        for (let y=0; y<H; y++) {
            const isFloor = y>halfH;
            const p = y-halfH;
            if (p===0) continue;
            const rowDist = halfH/Math.abs(p);
            const cosA = Math.cos(player.angle-FOV/2);
            const sinA = Math.sin(player.angle-FOV/2);
            const cosB = Math.cos(player.angle+FOV/2);
            const sinB = Math.sin(player.angle+FOV/2);
            const fx0 = (isFloor?1:-1)*rowDist*(Math.cos(player.angle)-(cosA+cosB)/2)+player.x;
            const fy0 = (isFloor?1:-1)*rowDist*(Math.sin(player.angle)-(sinA+sinB)/2)+player.y;
            const floorStepX = (cosB-cosA)*rowDist/W;
            const floorStepY = (sinB-sinA)*rowDist/W;
            let fx=player.x+cosA*rowDist*(isFloor?1:-1), fy=player.y+sinA*rowDist*(isFloor?1:-1);

            const tex = isFloor ? TEXTURES.floor : TEXTURES.ceil;
            const dark = isFloor ? 0.42 : 0.20;
            const fog  = Math.max(0, 1-rowDist/12);

            for (let x=0; x<W; x++) {
                const xi = Math.floor(((fx%1)+1)%1*tex.size)%tex.size;
                const yi = Math.floor(((fy%1)+1)%1*tex.size)%tex.size;
                const ti = (yi*tex.size+xi)*4;
                const bi = (y*W+x)*4;
                buf[bi]   = tex.data[ti  ]*dark*fog;
                buf[bi+1] = tex.data[ti+1]*dark*fog;
                buf[bi+2] = tex.data[ti+2]*dark*fog;
                buf[bi+3] = 255;
                fx+=floorStepX; fy+=floorStepY;
            }
        }

        // Paredes — DDA clásico
        for (let col=0; col<W; col++) {
            const rayAngle = player.angle - FOV/2 + (col/W)*FOV;
            const cosR=Math.cos(rayAngle), sinR=Math.sin(rayAngle);
            const ddx=Math.abs(1/cosR), ddy=Math.abs(1/sinR);
            let mx=player.x|0, my=player.y|0;
            let stepX=(cosR<0)?-1:1, stepY=(sinR<0)?-1:1;
            let sdx=(cosR<0)?(player.x-mx)*ddx:(mx+1-player.x)*ddx;
            let sdy=(sinR<0)?(player.y-my)*ddy:(my+1-player.y)*ddy;
            let hit=false, side=0, wtype=1;

            for (let d=0;d<48;d++) {
                if (sdx<sdy){sdx+=ddx;mx+=stepX;side=0;}
                else         {sdy+=ddy;my+=stepY;side=1;}
                if (my>=0&&my<MH&&mx>=0&&mx<MW&&MAP[my][mx]>0){
                    hit=true; wtype=MAP[my][mx]; break;
                }
            }
            if (!hit) { zBuf[col]=999; continue; }

            const dist = side===0 ? (mx-player.x+(1-stepX)/2)/cosR : (my-player.y+(1-stepY)/2)/sinR;
            if (dist<=0) { zBuf[col]=999; continue; }
            zBuf[col]=dist;

            const wallH = H/dist;
            const top   = Math.max(0, (halfH-wallH/2)|0);
            const bot   = Math.min(H-1, (halfH+wallH/2)|0);

            let wallX = side===0 ? player.y+dist*sinR : player.x+dist*cosR;
            wallX -= Math.floor(wallX);

            const tex = WALL_TEX[Math.min(wtype, WALL_TEX.length-1)] || TEXTURES.wall1;
            const texX = Math.floor(wallX*tex.size) & (tex.size-1);
            const fogW = Math.max(0.05, 1-dist/16);
            const shade = side===1 ? 0.58 : 1.0;

            for (let y=top; y<=bot; y++) {
                const d2 = ((y*2-H+wallH)*tex.size/2/wallH)|0;
                const tyy = Math.max(0, Math.min(tex.size-1, d2));
                const ti  = (tyy*tex.size+texX)*4;
                const bi  = (y*W+col)*4;
                buf[bi]   = tex.data[ti  ]*shade*fogW;
                buf[bi+1] = tex.data[ti+1]*shade*fogW;
                buf[bi+2] = tex.data[ti+2]*shade*fogW;
                buf[bi+3] = 255;
            }
        }

        const img = new ImageData(buf, W, H);
        ctx2d.putImageData(img, 0, 0);
        return zBuf;
    }

    // ── SPRITES ──
    function renderSprites(zBuf, W, H) {
        const FOV   = 1.1;
        const halfH = H/2;
        const sprites=[];

        for (const e of enemies) {
            if (!e.alive) continue;
            const dx=e.x-player.x, dy=e.y-player.y;
            sprites.push({dx,dy,dist:dx*dx+dy*dy,type:'enemy',ref:e});
        }
        for (const it of items) {
            if (!it.alive) continue;
            const dx=it.x-player.x, dy=it.y-player.y;
            sprites.push({dx,dy,dist:dx*dx+dy*dy,type:'item',ref:it});
        }
        for (const ex of explosions) {
            const dx=ex.x-player.x, dy=ex.y-player.y;
            sprites.push({dx,dy,dist:dx*dx+dy*dy,type:'expl',ref:ex});
        }
        for (const p of projectiles) {
            if (!p.enemy) continue;
            const dx=p.x-player.x, dy=p.y-player.y;
            sprites.push({dx,dy,dist:dx*dx+dy*dy,type:'proj',ref:p});
        }

        sprites.sort((a,b)=>b.dist-a.dist);

        for (const sp of sprites) {
            const dist=Math.sqrt(sp.dist);
            if (dist<0.3) continue;
            const spAngle=Math.atan2(sp.dy,sp.dx);
            let diff=spAngle-player.angle;
            while(diff> Math.PI) diff-=Math.PI*2;
            while(diff<-Math.PI) diff+=Math.PI*2;
            if (Math.abs(diff)>FOV*0.72) continue;

            const screenX=(0.5+diff/FOV)*W|0;
            const fog=Math.max(0, Math.min(1,1-dist/13));

            if      (sp.type==='enemy') drawEnemy(sp.ref,screenX,dist,W,H,halfH,zBuf,fog);
            else if (sp.type==='item')  drawItem (sp.ref,screenX,dist,W,H,halfH,zBuf,fog);
            else if (sp.type==='expl')  drawExpl (sp.ref,screenX,dist,W,H,halfH,zBuf,fog);
            else if (sp.type==='proj')  drawProj (sp.ref,screenX,dist,W,H,halfH,zBuf,fog);
        }
    }

    function drawEnemy(e, sx, dist, W, H, halfH, zBuf, fog) {
        const ed=EDATA[e.type];
        const sc=e.type==='demon'?1.35:e.type==='cacodemon'?1.1:1;
        const sh=Math.min(H*1.7,H/dist)*sc;
        const sw=sh*(e.type==='cacodemon'?0.9:0.58);
        const st=halfH-sh*0.52;
        const x0=Math.floor(sx-sw/2), x1=Math.ceil(sx+sw/2);
        const alpha=fog*0.97;
        if(alpha<0.05)return;

        const pain=(e.state==='pain'&&e.stTimer%4<2)?80:0;
        const [cr,cg,cb]=ed.col;
        const [hr,hg,hb]=ed.hcol;

        for(let x=x0;x<x1;x++){
            if(x<0||x>=W||zBuf[x]<dist)continue;
            const tx=(x-x0)/sw;
            // cuerpo
            if(tx>0.1&&tx<0.9){
                const by0=st+sh*0.28, by1=st+sh*0.88;
                const sh2=tx<0.2||tx>0.8?0.5:1;
                ctx2d.fillStyle=`rgba(${(cr+pain)*sh2|0},${cg*sh2|0},${cb*sh2|0},${alpha})`;
                for(let y=Math.max(0,by0|0);y<Math.min(H,by1|0);y++)
                    ctx2d.fillRect(x,y,1,1);
            }
            // cabeza
            if(tx>0.25&&tx<0.75){
                const hy0=st+sh*0.04, hy1=st+sh*0.28;
                ctx2d.fillStyle=`rgba(${hr+pain},${hg},${hb},${alpha})`;
                for(let y=Math.max(0,hy0|0);y<Math.min(H,hy1|0);y++)
                    ctx2d.fillRect(x,y,1,1);
                // ojos
                const ey=st+sh*0.10;
                if((tx>0.30&&tx<0.42)||(tx>0.58&&tx<0.70)){
                    ctx2d.fillStyle=`rgba(255,0,0,${alpha})`;
                    ctx2d.fillRect(x,ey|0,1,Math.max(1,sh*0.07|0));
                }
            }
            // piernas
            if(tx>0.18&&tx<0.82){
                const loff=Math.sin(e.anim*0.28)*sh*0.06;
                const ly=st+sh*0.88+(tx<0.5?loff:-loff);
                ctx2d.fillStyle=`rgba(${cr*0.65|0},${cg*0.65|0},${cb*0.65|0},${alpha})`;
                ctx2d.fillRect(x,ly|0,1,Math.max(1,sh*0.13|0));
            }
        }

        // barra HP
        if(e.hp<e.maxHp){
            const bw=Math.max(22,sw);
            const bx=sx-bw/2, by2=st-9;
            ctx2d.fillStyle='rgba(0,0,0,0.75)';
            ctx2d.fillRect(bx,by2,bw,5);
            const r2=e.hp/e.maxHp;
            ctx2d.fillStyle=r2>0.5?'#44ff44':r2>0.25?'#ffaa00':'#ff2222';
            ctx2d.fillRect(bx,by2,bw*r2,5);
        }
    }

    function drawItem(it, sx, dist, W, H, halfH, zBuf, fog) {
        const sh=Math.min(H*0.65,H/dist*0.48);
        const bob=Math.sin(Date.now()*0.003+it.bob*Math.PI*2)*sh*0.06;
        const st=halfH-sh*0.5+bob;
        const x0=Math.floor(sx-sh/2), x1=Math.ceil(sx+sh/2);
        const alpha=fog*0.92;
        const C={health:[220,30,30],armor:[40,40,220],ammo:[220,220,40],shotgun:[190,130,60],rocket:[230,80,20]};
        const [r,g,b]=C[it.type]||[200,200,200];
        const grd=ctx2d.createRadialGradient(sx,halfH,0,sx,halfH,sh*0.6);
        grd.addColorStop(0,`rgba(${r},${g},${b},${alpha*0.45})`);
        grd.addColorStop(1,'rgba(0,0,0,0)');
        ctx2d.fillStyle=grd;
        ctx2d.fillRect(x0-sh,st-sh*0.2,sh*3,sh*1.4);
        for(let x=x0;x<x1;x++){
            if(x<0||x>=W||zBuf[x]<dist)continue;
            const tx=x-x0; const cx2=(tx/sh-.5); 
            for(let y=Math.max(0,st|0);y<Math.min(H,(st+sh)|0);y++){
                const cy2=(y-st)/sh-.45;
                if(cx2*cx2*4+cy2*cy2*4>1)continue;
                const shade=1-cy2*0.5;
                ctx2d.fillStyle=`rgba(${r*shade|0},${g*shade|0},${b*shade|0},${alpha})`;
                ctx2d.fillRect(x,y,1,1);
            }
        }
    }

    function drawExpl(ex, sx, dist, W, H, halfH, zBuf, fog) {
        const prog=ex.t/ex.max;
        const rad=H/dist*0.65*(1-prog*0.25);
        const a=fog*prog;
        const grd=ctx2d.createRadialGradient(sx,halfH,0,sx,halfH,rad);
        grd.addColorStop(0,`rgba(255,255,180,${a})`);
        grd.addColorStop(0.35,`rgba(255,140,0,${a*0.75})`);
        grd.addColorStop(0.75,`rgba(190,45,0,${a*0.35})`);
        grd.addColorStop(1,'rgba(0,0,0,0)');
        ctx2d.fillStyle=grd;
        ctx2d.fillRect(sx-rad,halfH-rad,rad*2,rad*2);
    }

    function drawProj(p, sx, dist, W, H, halfH, zBuf, fog) {
        const r=Math.min(28,H/dist*0.14);
        const grd=ctx2d.createRadialGradient(sx,halfH,0,sx,halfH,r);
        grd.addColorStop(0,`rgba(255,210,55,${fog*0.95})`);
        grd.addColorStop(0.6,`rgba(255,70,0,${fog*0.5})`);
        grd.addColorStop(1,'rgba(0,0,0,0)');
        ctx2d.fillStyle=grd;
        ctx2d.fillRect(sx-r,halfH-r,r*2,r*2);
    }

    // ── WEAPON DRAWABLE ──
    function drawWeapon(W, H) {
        const bob  = Math.sin(player.bobPhase)*5;
        const bobX = Math.cos(player.bobPhase*0.5)*3;
        const kick = flashTimer>0?(flashTimer/10)*18:0;
        const cx   = W/2+bobX|0, by=(H)+kick-bob|0;
        ctx2d.save();

        if (player.weapon==='pistol') {
            ctx2d.fillStyle='#2a2a2a';
            ctx2d.fillRect(cx+28,by-118,8,30);
            ctx2d.fillStyle='#3d3d3d';
            ctx2d.fillRect(cx+10,by-92,54,32);
            ctx2d.fillStyle='#2a2a2a';
            ctx2d.fillRect(cx+24,by-64,24,28);
            ctx2d.fillStyle='#505050';
            ctx2d.fillRect(cx+14,by-86,38,7);
            ctx2d.fillRect(cx+30,by-112,5,8);
        } else if (player.weapon==='shotgun') {
            ctx2d.fillStyle='#222';
            ctx2d.fillRect(cx+12,by-126,10,38); ctx2d.fillRect(cx+28,by-126,10,38);
            ctx2d.fillStyle='#5a3010';
            ctx2d.fillRect(cx+2,by-96,72,28);
            ctx2d.fillStyle='#3a1e06';
            ctx2d.fillRect(cx+52,by-90,20,22);
            ctx2d.fillStyle='#777';
            ctx2d.fillRect(cx+6,by-90,46,9);
        } else {
            ctx2d.fillStyle='#2e5c2e';
            ctx2d.fillRect(cx-8,by-106,92,18);
            ctx2d.fillStyle='#111';
            ctx2d.beginPath(); ctx2d.arc(cx-8,by-97,11,0,Math.PI*2); ctx2d.fill();
            ctx2d.fillStyle='#1e3c1e';
            ctx2d.fillRect(cx+22,by-90,22,26);
            ctx2d.fillStyle='#80a880';
            ctx2d.fillRect(cx+32,by-118,5,14);
        }

        if (flashTimer>0) {
            const fa=flashTimer/12;
            const bx=player.weapon==='shotgun'?cx+20:cx+32;
            const grd=ctx2d.createRadialGradient(bx,by-128,0,bx,by-128,28*fa);
            grd.addColorStop(0,`rgba(255,230,110,${fa})`);
            grd.addColorStop(0.5,`rgba(255,110,0,${fa*0.55})`);
            grd.addColorStop(1,'rgba(0,0,0,0)');
            ctx2d.fillStyle=grd;
            ctx2d.fillRect(bx-38,by-170,76,55);
        }
        ctx2d.restore();
    }

    // ── HUD ──
    function drawHUD(W, H) {
        const hudH=72;
        const grd=ctx2d.createLinearGradient(0,H-hudH,0,H);
        grd.addColorStop(0,'rgba(0,0,0,0.88)');
        grd.addColorStop(1,'rgba(10,0,0,0.97)');
        ctx2d.fillStyle=grd;
        ctx2d.fillRect(0,H-hudH,W,hudH);
        ctx2d.fillStyle='#7a0000';
        ctx2d.fillRect(0,H-hudH,W,2);

        // FACE
        drawFace(W/2-23|0, H-hudH+5|0, 46, 54);

        // SALUD
        const hcol=player.health>50?'#ff2222':player.health>25?'#ff8800':'#ff0000';
        ctx2d.font='bold 9px "Courier New"'; ctx2d.fillStyle='#777';
        ctx2d.fillText('SALUD',14,H-hudH+16);
        ctx2d.font='bold 26px "Courier New"'; ctx2d.fillStyle=hcol;
        ctx2d.fillText(player.health+'%',10,H-hudH+50);

        // ARMOR
        ctx2d.font='bold 9px "Courier New"'; ctx2d.fillStyle='#777';
        ctx2d.fillText('ARMOR',82,H-hudH+16);
        ctx2d.font='bold 26px "Courier New"'; ctx2d.fillStyle='#4488ff';
        ctx2d.fillText(player.armor+'%',78,H-hudH+50);

        // ARMA
        const wpn=WEAPONS[player.weapon];
        ctx2d.font='bold 9px "Courier New"'; ctx2d.fillStyle='#777';
        ctx2d.fillText('ARMA',W-145,H-hudH+16);
        ctx2d.font='bold 10px "Courier New"'; ctx2d.fillStyle='#ffaa22';
        ctx2d.fillText(wpn.name,W-147,H-hudH+30);
        ctx2d.font='bold 9px "Courier New"'; ctx2d.fillStyle='#777';
        ctx2d.fillText('AMMO',W-145,H-hudH+45);
        ctx2d.font='bold 22px "Courier New"'; ctx2d.fillStyle='#ffdd00';
        ctx2d.fillText(String(player.ammo[wpn.ammoKey]).padStart(3,' '),W-145,H-hudH+64);

        // SCORE / KILLS
        ctx2d.font='bold 9px "Courier New"'; ctx2d.fillStyle='#777';
        ctx2d.fillText('SCORE',W/2+42|0,H-hudH+16);
        ctx2d.font='bold 13px "Courier New"'; ctx2d.fillStyle='#ff9090';
        ctx2d.fillText(player.score,W/2+40|0,H-hudH+32);
        ctx2d.font='bold 9px "Courier New"'; ctx2d.fillStyle='#777';
        ctx2d.fillText('KILLS',W/2+42|0,H-hudH+48);
        ctx2d.font='bold 13px "Courier New"'; ctx2d.fillStyle='#ff6060';
        ctx2d.fillText(player.kills+'/'+totalEnemies,W/2+40|0,H-hudH+62);

        // Mira
        const cx2=W/2, cy2=(H-hudH)/2;
        ctx2d.strokeStyle='rgba(255,59,59,0.92)'; ctx2d.lineWidth=1.5;
        const ms=15,mg=6;
        ctx2d.beginPath();
        ctx2d.moveTo(cx2-ms,cy2);ctx2d.lineTo(cx2-mg,cy2);
        ctx2d.moveTo(cx2+mg,cy2);ctx2d.lineTo(cx2+ms,cy2);
        ctx2d.moveTo(cx2,cy2-ms);ctx2d.lineTo(cx2,cy2-mg);
        ctx2d.moveTo(cx2,cy2+mg);ctx2d.lineTo(cx2,cy2+ms);
        ctx2d.stroke();
        ctx2d.fillStyle='rgba(255,59,59,0.75)';
        ctx2d.beginPath();ctx2d.arc(cx2,cy2,2,0,Math.PI*2);ctx2d.fill();

        // Arma dibujada
        drawWeapon(W, H-hudH);

        // Screen flash
        if (screenFlash.t>0) {
            const fa=screenFlash.a*(screenFlash.t/14);
            ctx2d.fillStyle=`rgba(${screenFlash.r},${screenFlash.g},${screenFlash.b},${fa})`;
            ctx2d.fillRect(0,0,W,H-hudH);
        }

        // Mensajes
        messages=messages.filter(m=>m.t>0);
        messages.forEach((m,i)=>{
            const a=Math.min(1,m.t/30);
            ctx2d.font='bold 14px "Courier New"';
            ctx2d.globalAlpha=a;
            ctx2d.fillStyle=m.color;
            const tw=ctx2d.measureText(m.text).width;
            ctx2d.fillText(m.text,(W-tw)/2,50+i*22);
            ctx2d.globalAlpha=1;
            m.t--;
        });

        // Minimap
        drawMinimap(W, H, hudH);

        // Teclas rápidas
        ctx2d.font='10px "Courier New"'; ctx2d.fillStyle='rgba(255,200,100,0.45)';
        ctx2d.fillText('[1]Pistola [2]Escopeta [3]Cohetes | WASD=Mover ←→=Girar ESPACIO=Disparar',10,H-hudH-7);

        // Pantalla victoria
        const alive=enemies.filter(e=>e.alive).length;
        if (alive===0) {
            ctx2d.fillStyle='rgba(0,0,0,0.68)';
            ctx2d.fillRect(0,0,W,H-hudH);
            ctx2d.textAlign='center';
            ctx2d.fillStyle='#ffdd00'; ctx2d.font='bold 46px "Courier New"';
            ctx2d.fillText('¡NIVEL COMPLETADO!',W/2,(H-hudH)/2-22);
            ctx2d.fillStyle='#ff9090'; ctx2d.font='bold 18px "Courier New"';
            ctx2d.fillText(`Kills: ${player.kills}  Score: ${player.score}`,W/2,(H-hudH)/2+18);
            ctx2d.fillStyle='#aaa'; ctx2d.font='14px "Courier New"';
            ctx2d.fillText('ESC para volver al chat',W/2,(H-hudH)/2+48);
            ctx2d.textAlign='left';
        }

        // Pantalla muerte
        if (player.dead) {
            deathTimer++;
            const da=Math.min(0.82,deathTimer/65);
            ctx2d.fillStyle=`rgba(150,0,0,${da})`;
            ctx2d.fillRect(0,0,W,H-hudH);
            if (deathTimer>35) {
                ctx2d.textAlign='center';
                ctx2d.fillStyle='#ff0000'; ctx2d.font='bold 52px "Courier New"';
                ctx2d.fillText('HAS MUERTO',W/2,(H-hudH)/2-18);
                ctx2d.fillStyle='#ccc'; ctx2d.font='16px "Courier New"';
                ctx2d.fillText('[R] Reiniciar · [ESC] Salir',W/2,(H-hudH)/2+32);
                ctx2d.textAlign='left';
            }
        }
    }

    function drawFace(fx, fy, fw, fh) {
        const pain=screenFlash.t>0&&screenFlash.r>100;
        const shoot=flashTimer>0;
        ctx2d.fillStyle='#c0905e'; ctx2d.fillRect(fx,fy,fw,fh);
        ctx2d.fillStyle='#d4a070'; ctx2d.fillRect(fx+2,fy+2,fw-4,fh*0.62);
        // ojos
        if (player.dead) {
            ctx2d.fillStyle='#ff0000';
            ctx2d.fillRect(fx+8,fy+14,8,8); ctx2d.fillRect(fx+fw-16,fy+14,8,8);
            ctx2d.strokeStyle='#000'; ctx2d.lineWidth=2;
            ctx2d.beginPath();
            ctx2d.moveTo(fx+8,fy+14);ctx2d.lineTo(fx+16,fy+22);
            ctx2d.moveTo(fx+16,fy+14);ctx2d.lineTo(fx+8,fy+22);
            ctx2d.moveTo(fx+fw-16,fy+14);ctx2d.lineTo(fx+fw-8,fy+22);
            ctx2d.moveTo(fx+fw-8,fy+14);ctx2d.lineTo(fx+fw-16,fy+22);
            ctx2d.stroke();
        } else {
            ctx2d.fillStyle=pain?'#ff5555':shoot?'#fff':'#eee';
            ctx2d.fillRect(fx+7,fy+13,10,10); ctx2d.fillRect(fx+fw-17,fy+13,10,10);
            ctx2d.fillStyle='#111';
            ctx2d.fillRect(fx+10,fy+16,5,5); ctx2d.fillRect(fx+fw-14,fy+16,5,5);
        }
        // boca
        if (player.dead) {
            ctx2d.fillStyle='#660000'; ctx2d.fillRect(fx+9,fy+fh*0.68,fw-18,6);
        } else if (shoot) {
            ctx2d.fillStyle='#000';
            ctx2d.beginPath(); ctx2d.arc(fx+fw/2,fy+fh*0.74,7,0,Math.PI*2); ctx2d.fill();
        } else if (pain) {
            ctx2d.fillStyle='#111'; ctx2d.fillRect(fx+12,fy+fh*0.68,fw-24,5);
        } else {
            ctx2d.fillStyle='#111'; ctx2d.fillRect(fx+11,fy+fh*0.70,fw-22,4);
        }
        // hp bar
        ctx2d.fillStyle='#330000'; ctx2d.fillRect(fx+2,fy+fh-8,fw-4,6);
        const rr=player.health/100;
        ctx2d.fillStyle=rr>0.5?'#00ff00':rr>0.25?'#ffaa00':'#ff0000';
        ctx2d.fillRect(fx+2,fy+fh-8,(fw-4)*rr,6);
    }

    function drawMinimap(W, H, hudH) {
        const sc=4.5, ox=W-MW*sc-8, oy=8;
        ctx2d.globalAlpha=0.72;
        for (let y=0;y<MH;y++) for (let x=0;x<MW;x++) {
            const v=MAP[y][x];
            ctx2d.fillStyle=v?(['','#8B2020','#446688','#557744','#885520'][v]||'#555'):'rgba(0,0,0,0.45)';
            ctx2d.fillRect(ox+x*sc,oy+y*sc,sc-1,sc-1);
        }
        ctx2d.fillStyle='#ffff00';
        ctx2d.fillRect(ox+player.x*sc-2.5,oy+player.y*sc-2.5,5,5);
        ctx2d.strokeStyle='#ffff00'; ctx2d.lineWidth=1;
        ctx2d.beginPath();
        ctx2d.moveTo(ox+player.x*sc,oy+player.y*sc);
        ctx2d.lineTo(ox+(player.x+Math.cos(player.angle)*2.2)*sc, oy+(player.y+Math.sin(player.angle)*2.2)*sc);
        ctx2d.stroke();
        for (const e of enemies) {
            if (!e.alive) continue;
            ctx2d.fillStyle='#ff3333';
            ctx2d.fillRect(ox+e.x*sc-1.5,oy+e.y*sc-1.5,3,3);
        }
        ctx2d.globalAlpha=1;
    }

    // ── UPDATE ──
    function update() {
        if (player.dead) {
            if (doomKeys['KeyR']||doomKeys['Numpad0']) restartGame();
            return;
        }

        const cos=Math.cos(player.angle), sin=Math.sin(player.angle);
        const sp=player.speed;
        let moving=false;

        if (doomKeys['ArrowUp']||doomKeys['KeyW']) {
            const nx=player.x+cos*sp, ny=player.y+sin*sp;
            if(canMove(nx,player.y))player.x=nx;
            if(canMove(player.x,ny))player.y=ny;
            moving=true;
        }
        if (doomKeys['ArrowDown']||doomKeys['KeyS']) {
            const nx=player.x-cos*sp, ny=player.y-sin*sp;
            if(canMove(nx,player.y))player.x=nx;
            if(canMove(player.x,ny))player.y=ny;
            moving=true;
        }
        if (doomKeys['KeyA']) {
            const nx=player.x+sin*sp, ny=player.y-cos*sp;
            if(canMove(nx,player.y))player.x=nx;
            if(canMove(player.x,ny))player.y=ny;
            moving=true;
        }
        if (doomKeys['KeyD']) {
            const nx=player.x-sin*sp, ny=player.y+cos*sp;
            if(canMove(nx,player.y))player.x=nx;
            if(canMove(player.x,ny))player.y=ny;
            moving=true;
        }
        if (doomKeys['ArrowLeft'])  player.angle-=player.rotSpeed;
        if (doomKeys['ArrowRight']) player.angle+=player.rotSpeed;

        if (moving) {
            player.bobPhase+=0.16;
            player.stepTimer++;
            if(player.stepTimer%26===0) playSound('step');
        } else {
            player.bobPhase*=0.88;
        }

        if (doomKeys['Space']||doomKeys['ShiftLeft']||doomKeys['ControlLeft']) shoot();

        if (doomKeys['Digit1']){player.weapon='pistol'; addMsg('PISTOLA','#ffaa22'); doomKeys['Digit1']=false;}
        if (doomKeys['Digit2']){player.weapon='shotgun';addMsg('ESCOPETA','#ffaa22');doomKeys['Digit2']=false;}
        if (doomKeys['Digit3']){player.weapon='rocket'; addMsg('COHETES','#ff6600'); doomKeys['Digit3']=false;}

        if(shootTimer>0)shootTimer--;
        if(flashTimer>0)flashTimer--;
        if(screenFlash.t>0)screenFlash.t--;
        if(player.invincible>0)player.invincible--;

        // Proyectiles
        for (const p of projectiles) {
            if(!p.alive)continue;
            p.x+=p.dx; p.y+=p.dy;
            if(!canMove(p.x,p.y)){
                p.alive=false;
                if(p.type==='rocket'){
                    spawnExplosion(p.x,p.y,1.3);
                    for(const e of enemies){
                        if(!e.alive)continue;
                        const dx=e.x-p.x,dy=e.y-p.y,d=Math.sqrt(dx*dx+dy*dy);
                        if(d<2.2){e.hp-=p.dmg*(1-d/2.2);if(e.hp<=0){e.alive=false;player.score+=EDATA[e.type].pts;player.kills++;playSound('death');}}
                    }
                }
                continue;
            }
            if(p.enemy){
                const dx=player.x-p.x,dy=player.y-p.y;
                if(Math.sqrt(dx*dx+dy*dy)<0.65){p.alive=false;damagePlayer(p.dmg);}
            }
            if(!p.enemy&&p.type==='rocket'){
                for(const e of enemies){
                    if(!e.alive)continue;
                    const dx=e.x-p.x,dy=e.y-p.y;
                    if(Math.sqrt(dx*dx+dy*dy)<0.55){
                        p.alive=false; spawnExplosion(p.x,p.y);
                        e.hp-=p.dmg; if(e.hp<=0){e.alive=false;player.score+=EDATA[e.type].pts;player.kills++;playSound('death');}
                        break;
                    }
                }
            }
        }
        projectiles=projectiles.filter(p=>p.alive);
        for(const ex of explosions)ex.t--;
        explosions=explosions.filter(e=>e.t>0);

        // Items
        for(const it of items){
            if(!it.alive)continue;
            const dx=player.x-it.x,dy=player.y-it.y;
            if(Math.sqrt(dx*dx+dy*dy)<0.72)pickupItem(it);
        }

        // IA enemigos
        for(const e of enemies){
            if(!e.alive)continue;
            e.anim++;
            const dx=player.x-e.x,dy=player.y-e.y;
            const dist=Math.sqrt(dx*dx+dy*dy);
            const ed=EDATA[e.type];

            if(e.state==='pain'){e.stTimer--;if(e.stTimer<=0)e.state='chase';}
            if(dist<ed.sight&&e.state==='idle'){e.state='alert';e.alert=32;}
            if(e.state==='alert'){e.alert--;if(e.alert<=0)e.state='chase';}

            if(e.state==='chase'||e.state==='attack'){
                if(dist>ed.atkRange*0.75&&dist>0.75){
                    const spd=ed.speed;
                    const nx=e.x+(dx/dist)*spd, ny=e.y+(dy/dist)*spd;
                    if(canMove(nx,e.y))e.x=nx;
                    if(canMove(e.x,ny))e.y=ny;
                }
                e.atkTimer++;
                if(e.atkTimer>=ed.rate){
                    e.atkTimer=0;
                    if(dist<=ed.atkRange){
                        if(e.type==='zombie'||e.type==='demon'){
                            if(dist<1.3)damagePlayer(ed.dmg);
                        } else {
                            if(dist<ed.sight){
                                const sp2=0.10;
                                projectiles.push({x:e.x,y:e.y,dx:(dx/dist)*sp2+(Math.random()-.5)*0.022,dy:(dy/dist)*sp2+(Math.random()-.5)*0.022,type:'fireball',dmg:ed.dmg,enemy:true,alive:true});
                            }
                        }
                    }
                }
            }
        }
    }

    function restartGame(){
        player.health=100;player.armor=0;
        player.ammo={pistol:50,shotgun:20,rocket:5};
        player.x=1.5;player.y=1.5;player.angle=Math.PI/4;
        player.score=0;player.kills=0;player.dead=false;player.weapon='pistol';
        player.invincible=60;deathTimer=0;
        enemies.forEach(e=>{e.alive=true;e.hp=e.maxHp;e.state='idle';e.stTimer=0;e.atkTimer=0;});
        items.forEach(i=>i.alive=true);
        projectiles=[];explosions=[];bloodSplats=[];
        addMsg('¡DE NUEVO!','#ffff00');
    }

    // ── LOOP ──
    function loop(){
        if(!doomRunning)return;
        // redimensionar si cambió el tamaño
        const parent=canvas.parentElement;
        if(parent){
            const pw=parent.clientWidth||window.innerWidth;
            const ph=parent.clientHeight||window.innerHeight;
            if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
        }
        const W=canvas.width, H=canvas.height;
        if(W<10||H<10){doomAnimFrame=requestAnimationFrame(loop);return;}

        update();
        const zBuf=castRays(W,H);
        renderSprites(zBuf,W,H);
        drawHUD(W,H);
        doomAnimFrame=requestAnimationFrame(loop);
    }

    // ── CONTROLES ──
    function onKD(e){
        doomKeys[e.code]=true;
        if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
        if(e.code==='Escape'){window.closeDoom();return;}
    }
    function onKU(e){doomKeys[e.code]=false;}
    document.addEventListener('keydown',onKD);
    document.addEventListener('keyup',onKU);
    canvas.addEventListener('click',()=>{doomKeys['Space']=true;setTimeout(()=>doomKeys['Space']=false,60);});
    canvas.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas)player.angle+=e.movementX*0.003;});
    canvas.addEventListener('click',()=>{if(canvas.requestPointerLock)canvas.requestPointerLock();});

    window._doomCleanup=()=>{
        document.removeEventListener('keydown',onKD);
        document.removeEventListener('keyup',onKU);
        if(document.exitPointerLock)document.exitPointerLock();
    };

    // ── CONTROLES TÁCTILES ──
    const overlay=document.getElementById('doom-overlay');
    let tb=document.getElementById('doom-touch-controls');
    if(tb)tb.remove();
    tb=document.createElement('div');
    tb.id='doom-touch-controls';
    tb.style.cssText='position:absolute;bottom:12px;left:0;right:0;display:flex;justify-content:space-between;padding:0 18px;z-index:99200;pointer-events:auto;';
    tb.innerHTML=`
        <div style="display:flex;flex-direction:column;gap:6px;align-items:center;">
            <button class="dtb" data-key="ArrowUp">▲</button>
            <div style="display:flex;gap:6px;">
                <button class="dtb" data-key="KeyA">◄</button>
                <button class="dtb" data-key="ArrowDown">▼</button>
                <button class="dtb" data-key="KeyD">►</button>
            </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:center;">
            <div style="display:flex;gap:6px;">
                <button class="dtb" data-key="ArrowLeft">↺</button>
                <button class="dtb" data-key="ArrowRight">↻</button>
            </div>
            <button class="dtb" data-key="Space" style="width:72px;height:72px;font-size:26px;border-color:rgba(255,59,59,0.65);background:rgba(255,59,59,0.14);">💥</button>
        </div>
    `;
    overlay.appendChild(tb);
    // estilos inline para los botones
    const style=document.createElement('style');
    style.id='doom-btn-style';
    style.textContent='.dtb{background:rgba(0,0,0,0.72);border:1px solid rgba(255,59,59,0.38);color:#ff8888;width:54px;height:54px;border-radius:10px;font-size:19px;cursor:pointer;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;user-select:none;touch-action:manipulation;}.dtb:active{background:rgba(255,59,59,0.28);}';
    document.head.appendChild(style);
    tb.querySelectorAll('.dtb').forEach(btn=>{
        const k=btn.dataset.key;
        btn.addEventListener('touchstart',e=>{e.preventDefault();doomKeys[k]=true;},{passive:false});
        btn.addEventListener('touchend',  e=>{e.preventDefault();doomKeys[k]=false;},{passive:false});
        btn.addEventListener('mousedown', ()=>doomKeys[k]=true);
        btn.addEventListener('mouseup',   ()=>doomKeys[k]=false);
    });

    addMsg('¡¡DOOM 1993!!','#ff3b3b',120);
    addMsg('[1]Pistola [2]Escopeta [3]Cohetes','#ffaa00',100);
    loop();
}

function stopDoom(){
    doomRunning=false;
    if(doomAnimFrame){cancelAnimationFrame(doomAnimFrame);doomAnimFrame=null;}
    doomKeys={};
    if(typeof window._doomCleanup==='function'){window._doomCleanup();window._doomCleanup=null;}
    const tb=document.getElementById('doom-touch-controls');if(tb)tb.remove();
    const st=document.getElementById('doom-btn-style');if(st)st.remove();
    const canvas=document.getElementById('doom-canvas');
    if(canvas){const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);}
    if(doomAudioCtx){try{doomAudioCtx.close();}catch(e){} doomAudioCtx=null;}
}

window.openDoom=()=>{
    const overlay=document.getElementById('doom-overlay');
    if(overlay)overlay.style.display='flex';
    // BUGFIX: esperar 2 frames para que el overlay tenga tamaño real
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(typeof startDoom==='function')startDoom();
    }));
};
window.closeDoom=()=>{
    const overlay=document.getElementById('doom-overlay');
    if(overlay)overlay.style.display='none';
    if(typeof stopDoom==='function')stopDoom();
};
