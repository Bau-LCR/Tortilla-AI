cat > /mnt/user-data/outputs/cutreal-ai/doom.js << 'DOOMEOF'
// ===== DOOM 1993 — RAYCASTER ENGINE =====
// FIX DEFINITIVO: canvas usa position:absolute + window.innerWidth/Height directamente

var doomRunning = false;
var doomAnimFrame = null;
var doomKeys = {};
var doomAudioCtx = null;

function getDoomAudio() {
    if (!doomAudioCtx) {
        try { doomAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    return doomAudioCtx;
}
function playSound(type) {
    var ac = getDoomAudio(); if (!ac) return;
    try {
        var o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        var t = ac.currentTime;
        if (type==='shoot') {
            o.type='sawtooth';
            o.frequency.setValueAtTime(300,t); o.frequency.exponentialRampToValueAtTime(40,t+0.18);
            g.gain.setValueAtTime(0.22,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.18);
            o.start(t); o.stop(t+0.18);
        } else if (type==='hit') {
            o.type='square';
            o.frequency.setValueAtTime(180,t); o.frequency.exponentialRampToValueAtTime(50,t+0.1);
            g.gain.setValueAtTime(0.15,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.1);
            o.start(t); o.stop(t+0.1);
        } else if (type==='death') {
            o.type='sawtooth';
            o.frequency.setValueAtTime(350,t); o.frequency.exponentialRampToValueAtTime(15,t+0.6);
            g.gain.setValueAtTime(0.28,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.6);
            o.start(t); o.stop(t+0.6);
        } else if (type==='pickup') {
            o.type='sine';
            o.frequency.setValueAtTime(660,t); o.frequency.setValueAtTime(880,t+0.08);
            g.gain.setValueAtTime(0.14,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.22);
            o.start(t); o.stop(t+0.22);
        } else if (type==='step') {
            o.type='sine';
            o.frequency.setValueAtTime(90,t); o.frequency.exponentialRampToValueAtTime(30,t+0.07);
            g.gain.setValueAtTime(0.05,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.07);
            o.start(t); o.stop(t+0.07);
        }
    } catch(e) {}
}

function makeTextures() {
    var SZ = 64;
    function mkTex(fn) {
        var d = new Uint8Array(SZ*SZ*4);
        for (var y=0;y<SZ;y++) for (var x=0;x<SZ;x++) {
            var i=(y*SZ+x)*4, c=fn(x,y);
            d[i]=c[0]; d[i+1]=c[1]; d[i+2]=c[2]; d[i+3]=255;
        }
        return {data:d,size:SZ};
    }
    var wall1 = mkTex(function(x,y){
        var by=Math.floor(y/10), ox=(by%2)*16;
        var lx=(x+ox)%28, ly=y%10;
        if (lx<2||ly<2) return [50,40,32];
        var n=(Math.sin(x*5.1+y*2.3)*14)|0;
        var e=Math.min(lx,26-lx,ly,8-ly)<2?0.68:1;
        return [((138+n)*e)|0, ((32+n*0.2)*e)|0, ((18+n*0.1)*e)|0];
    });
    var wall2 = mkTex(function(x,y){
        var n=(Math.sin(x*0.9+y*1.7)*18+Math.cos(x*2.3-y*1.1)*12)|0;
        var v=78+n; return [v,v,v+10];
    });
    var wall3 = mkTex(function(x,y){
        var s=(y%6<1)?0.45:1, r=Math.sin(x*1.8+y*2.4)>0.65?38:0;
        var v=(68*s)|0; return [v+r,(v*0.72)|0,(v*0.48)|0];
    });
    var floor = mkTex(function(x,y){
        var n=(Math.sin(x*1.3+y*0.8)*14+Math.cos(x*0.7-y*1.5)*10)|0;
        var v=55+n; return [(v*0.78)|0,(v*0.68)|0,(v*0.48)|0];
    });
    var ceil = mkTex(function(x,y){
        var n=(Math.sin(x*2.2)*Math.cos(y*1.9)*10)|0;
        var v=30+n; return [v,(v*0.45)|0,(v*0.28)|0];
    });
    return {wall1:wall1,wall2:wall2,wall3:wall3,floor:floor,ceil:ceil};
}

function sampleTex(tex,tx,ty) {
    var xi=(((tx%1)+1)%1*tex.size|0)%tex.size;
    var yi=(((ty%1)+1)%1*tex.size|0)%tex.size;
    var i=(yi*tex.size+xi)*4;
    return [tex.data[i],tex.data[i+1],tex.data[i+2]];
}

// ============================================================
// ENGINE PRINCIPAL
// ============================================================
function startDoom() {
    doomRunning = true;
    doomKeys    = {};

    var canvas = document.getElementById('doom-canvas');
    if (!canvas) { console.error('DOOM: canvas not found'); return; }
    var ctx = canvas.getContext('2d');

    // ── CRÍTICO: fijar dimensiones desde window, no desde CSS ──
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    var MAP = [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,2,2,0,0,0,0,2,2,0,0,0,0,2,2,0,0,0,1],
        [1,0,2,0,0,0,0,0,2,0,0,0,0,0,2,0,0,0,0,1],
        [1,0,0,0,3,3,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,2,0,3,0,0,0,0,0,2,2,0,0,0,0,0,0,0,1],
        [1,0,2,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,1,1,1,0,0,1,1,0,0,1,1,0,0,0,0,0,1],
        [1,0,0,1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,1],
        [1,0,0,1,1,1,0,0,1,1,0,0,1,1,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,3,0,0,0,0,0,0,0,0,0,0,0,3,3,0,0,0,1],
        [1,0,3,3,0,0,0,0,0,0,0,0,0,0,3,3,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,2,2,2,0,0,2,2,2,0,0,0,0,0,0,0,1],
        [1,0,0,0,2,0,2,0,0,2,0,2,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
    ];
    var MW=MAP[0].length, MH=MAP.length;
    var TEX=makeTextures();
    var WTEX=[null,TEX.wall1,TEX.wall2,TEX.wall3];

    var player={x:1.5,y:1.5,angle:Math.PI*0.25,speed:0.062,rotSpeed:0.048,
                health:100,armor:0,ammo:{pistol:50,shotgun:20,rocket:5},
                weapon:'pistol',score:0,kills:0,dead:false,invincible:0,
                bobPhase:0,stepTimer:0};
    var WEAPONS={
        pistol: {name:'PISTOLA',  dmg:20,spread:0.04,rate:16,ammoKey:'pistol', pellets:1,splash:false},
        shotgun:{name:'ESCOPETA', dmg:14,spread:0.20,rate:36,ammoKey:'shotgun',pellets:7,splash:false},
        rocket: {name:'COHETES',  dmg:80,spread:0.01,rate:52,ammoKey:'rocket', pellets:1,splash:true}
    };
    var items=[
        {x:3.5, y:3.5, type:'health', val:25,ammoKey:'',       alive:true},
        {x:10.5,y:5.5, type:'ammo',   val:10,ammoKey:'pistol', alive:true},
        {x:6.5, y:10.5,type:'armor',  val:25,ammoKey:'',       alive:true},
        {x:14.5,y:8.5, type:'shotgun',val:8, ammoKey:'shotgun',alive:true},
        {x:8.5, y:17.5,type:'health', val:50,ammoKey:'',       alive:true},
        {x:17.5,y:3.5, type:'rocket', val:3, ammoKey:'rocket', alive:true}
    ];
    var enemies=[
        {x:7.5, y:4.5, type:'zombie',hp:25, maxHp:25, alive:true,state:'idle',atk:0,anim:0,alert:0},
        {x:4.5, y:8.5, type:'imp',   hp:40, maxHp:40, alive:true,state:'idle',atk:0,anim:0,alert:0},
        {x:14.5,y:7.5, type:'imp',   hp:40, maxHp:40, alive:true,state:'idle',atk:0,anim:0,alert:0},
        {x:8.5, y:14.5,type:'demon', hp:150,maxHp:150,alive:true,state:'idle',atk:0,anim:0,alert:0},
        {x:3.5, y:16.5,type:'zombie',hp:25, maxHp:25, alive:true,state:'idle',atk:0,anim:0,alert:0},
        {x:17.5,y:5.5, type:'imp',   hp:40, maxHp:40, alive:true,state:'idle',atk:0,anim:0,alert:0},
        {x:16.5,y:16.5,type:'demon', hp:150,maxHp:150,alive:true,state:'idle',atk:0,anim:0,alert:0}
    ];
    var EDATA={
        zombie:{spd:0.013,atkRange:1.1,sight:8, atkDmg:5, fire:55,col:[175,55,55],hcol:[195,135,95],pts:100},
        imp:   {spd:0.017,atkRange:6.0,sight:10,atkDmg:10,fire:75,col:[115,55,18],hcol:[145,95,55], pts:200},
        demon: {spd:0.021,atkRange:1.0,sight:7, atkDmg:20,fire:38,col:[195,28,28],hcol:[215,75,75], pts:500}
    };

    var projs=[],explosions=[];
    var shootTimer=0,flashTimer=0;
    var screenFlash={r:0,g:0,b:0,a:0,t:0};
    var deathTimer=0;
    var msgs=[];

    function addMsg(txt,col){msgs.push({txt:txt,col:col||'#ffdd00',t:100});}
    function flashScreen(r,g,b,a){screenFlash.r=r;screenFlash.g=g;screenFlash.b=b;screenFlash.a=a;screenFlash.t=14;}

    // ── RESIZE: siempre usa window.innerWidth/Height ──
    function resize(){
        var w=window.innerWidth, h=window.innerHeight;
        if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    }
    window.addEventListener('resize',resize);

    function passable(x,y){
        var mx=x|0,my=y|0;
        return my>=0&&my<MH&&mx>=0&&mx<MW&&MAP[my][mx]===0;
    }

    // ── RAYCASTING ──
    function castRays(){
        var W=canvas.width, H=canvas.height;
        var FOV=Math.PI/3, halfH=H/2;
        var zBuf=new Float32Array(W);
        var img=ctx.createImageData(W,H);
        var buf=img.data;

        // Techo
        for(var y=0;y<halfH;y++){
            var rv=((y/halfH)*12+5)|0;
            for(var x=0;x<W;x++){var bi=(y*W+x)*4;buf[bi]=rv;buf[bi+1]=0;buf[bi+2]=0;buf[bi+3]=255;}
        }
        // Suelo
        for(var y=halfH;y<H;y++){
            var d=1-(y-halfH)/halfH*0.55, fv=(48*d)|0;
            for(var x=0;x<W;x++){var bi=(y*W+x)*4;buf[bi]=(fv*0.78)|0;buf[bi+1]=(fv*0.68)|0;buf[bi+2]=(fv*0.48)|0;buf[bi+3]=255;}
        }
        // Paredes
        for(var col=0;col<W;col++){
            var ra=player.angle-FOV/2+(col/W)*FOV;
            var rC=Math.cos(ra),rS=Math.sin(ra);
            var ddx=Math.abs(1/(rC||1e-10)), ddy=Math.abs(1/(rS||1e-10));
            var mx=player.x|0, my=player.y|0;
            var sx,sy,sdx,sdy;
            if(rC<0){sx=-1;sdx=(player.x-mx)*ddx;}else{sx=1;sdx=(mx+1-player.x)*ddx;}
            if(rS<0){sy=-1;sdy=(player.y-my)*ddy;}else{sy=1;sdy=(my+1-player.y)*ddy;}
            var hit=false,side=0,wt=1,dist=0;
            for(var step=0;step<48&&!hit;step++){
                if(sdx<sdy){sdx+=ddx;mx+=sx;side=0;}
                else{sdy+=ddy;my+=sy;side=1;}
                if(my>=0&&my<MH&&mx>=0&&mx<MW&&MAP[my][mx]>0){
                    hit=true;wt=MAP[my][mx];
                    dist=side===0?(mx-player.x+(1-sx)/2)/rC:(my-player.y+(1-sy)/2)/rS;
                }
            }
            if(!hit||dist<=0.05){zBuf[col]=999;continue;}
            zBuf[col]=dist;
            var wallH=(H/dist)|0;
            var wallTop=Math.max(0,(halfH-wallH/2)|0);
            var wallBot=Math.min(H-1,(halfH+wallH/2)|0);
            var wx=side===0?player.y+dist*rS:player.x+dist*rC;
            wx-=Math.floor(wx);
            var tex=WTEX[Math.min(wt,WTEX.length-1)]||TEX.wall1;
            var txi=Math.min(tex.size-1,(wx*tex.size)|0);
            var shade=side===1?0.52:1.0;
            var fog=Math.max(0,1-dist/14);
            for(var py=wallTop;py<=wallBot;py++){
                var d2=(py*2-H+wallH)*tex.size/(2*wallH);
                var tyi=Math.max(0,Math.min(tex.size-1,d2|0));
                var ti=(tyi*tex.size+txi)*4;
                var bi=(py*W+col)*4;
                buf[bi  ]=(tex.data[ti  ]*shade*fog)|0;
                buf[bi+1]=(tex.data[ti+1]*shade*fog)|0;
                buf[bi+2]=(tex.data[ti+2]*shade*fog)|0;
                buf[bi+3]=255;
            }
        }
        ctx.putImageData(img,0,0);
        return zBuf;
    }

    // ── SPRITES ──
    function renderSprites(zBuf){
        var W=canvas.width,H=canvas.height,FOV=Math.PI/3,halfH=H/2;
        var sps=[];
        enemies.forEach(function(e){if(e.alive){var dx=e.x-player.x,dy=e.y-player.y;sps.push({dx:dx,dy:dy,dist:dx*dx+dy*dy,kind:'enemy',ref:e});}});
        items.forEach(function(it){if(it.alive){var dx=it.x-player.x,dy=it.y-player.y;sps.push({dx:dx,dy:dy,dist:dx*dx+dy*dy,kind:'item',ref:it});}});
        explosions.forEach(function(ex){var dx=ex.x-player.x,dy=ex.y-player.y;sps.push({dx:dx,dy:dy,dist:dx*dx+dy*dy,kind:'exp',ref:ex});});
        projs.filter(function(p){return p.fromEnemy&&p.alive;}).forEach(function(p){var dx=p.x-player.x,dy=p.y-player.y;sps.push({dx:dx,dy:dy,dist:dx*dx+dy*dy,kind:'proj',ref:p});});
        sps.sort(function(a,b){return b.dist-a.dist;});
        sps.forEach(function(sp){
            var dist=Math.sqrt(sp.dist);if(dist<0.25)return;
            var angle=Math.atan2(sp.dy,sp.dx);
            var diff=angle-player.angle;
            while(diff>Math.PI)diff-=2*Math.PI;while(diff<-Math.PI)diff+=2*Math.PI;
            if(Math.abs(diff)>FOV*0.65)return;
            var sx=((0.5+diff/FOV)*W)|0;
            var fog=Math.max(0,Math.min(1,1-dist/13));
            if(sp.kind==='enemy')drawEnemy(sp.ref,sx,dist,W,H,halfH,zBuf,fog*0.92);
            else if(sp.kind==='item')drawItem(sp.ref,sx,dist,W,H,halfH,zBuf,fog*0.9);
            else if(sp.kind==='exp')drawExp(sp.ref,sx,dist,W,H,halfH,fog*0.9);
            else if(sp.kind==='proj')drawProj(sp.ref,sx,dist,W,H,halfH,zBuf,fog*0.9);
        });
    }

    function drawEnemy(e,sx,dist,W,H,halfH,zBuf,alpha){
        var ed=EDATA[e.type],sc=e.type==='demon'?1.4:1.0;
        var sprH=Math.min(H*1.8,H/dist)*sc, sprW=sprH*(e.type==='demon'?0.75:0.58);
        var top=halfH-sprH*0.55;
        var x0=(sx-sprW/2)|0,x1=(sx+sprW/2)|0;
        var pain=(e.state==='pain'&&e.anim%4<2)?60:0;
        for(var x=x0;x<x1;x++){
            if(x<0||x>=W||zBuf[x]<dist)continue;
            var tx=(x-x0)/sprW;
            if(tx>0.08&&tx<0.92){
                var bT=(top+sprH*0.28)|0,bB=(top+sprH*0.90)|0;
                for(var py=bT;py<bB;py++){
                    if(py<0||py>=H)continue;
                    var sh=(tx<0.18||tx>0.82)?0.5:1.0;
                    ctx.fillStyle='rgba('+((ed.col[0]+pain)*sh|0)+','+((ed.col[1]*sh)|0)+','+((ed.col[2]*sh)|0)+','+alpha+')';
                    ctx.fillRect(x,py,1,1);
                }
            }
            if(tx>0.22&&tx<0.78){
                var hT=(top+sprH*0.04)|0,hB=(top+sprH*0.28)|0;
                for(var py=hT;py<hB;py++){
                    if(py<0||py>=H)continue;
                    ctx.fillStyle='rgba('+(ed.hcol[0]+pain)+','+ed.hcol[1]+','+ed.hcol[2]+','+alpha+')';
                    ctx.fillRect(x,py,1,1);
                }
                var eyeY=(top+sprH*0.09)|0,eyeH=(sprH*0.065)|0;
                if((tx>0.28&&tx<0.42)||(tx>0.58&&tx<0.72)){
                    ctx.fillStyle='rgba(255,0,0,'+alpha+')';ctx.fillRect(x,eyeY,1,eyeH);
                }
            }
        }
        if(e.hp<e.maxHp){
            var bw=Math.max(22,sprW),bx=sx-bw/2,by=top-7;
            ctx.globalAlpha=0.8;ctx.fillStyle='#300';ctx.fillRect(bx,by,bw,4);
            var hpr=e.hp/e.maxHp;ctx.fillStyle=hpr>0.5?'#0f0':hpr>0.25?'#fa0':'#f00';
            ctx.fillRect(bx,by,bw*hpr,4);ctx.globalAlpha=1;
        }
    }

    function drawItem(it,sx,dist,W,H,halfH,zBuf,alpha){
        var sprH=Math.min(H*0.65,H/dist*0.48);
        var bob=Math.sin(Date.now()*0.003)*sprH*0.06;
        var top=halfH-sprH*0.5+bob;
        var x0=(sx-sprH/2)|0,x1=(sx+sprH/2)|0;
        var cols={health:[220,30,30],armor:[30,80,220],ammo:[220,200,30],shotgun:[180,120,50],rocket:[220,80,20]};
        var c=cols[it.type]||[180,180,180];
        var grd=ctx.createRadialGradient(sx,halfH,0,sx,halfH,sprH*0.7);
        grd.addColorStop(0,'rgba('+c[0]+','+c[1]+','+c[2]+',0.35)');grd.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=grd;ctx.fillRect(x0-sprH,top-sprH*0.3,sprH*3,sprH*1.6);
        for(var x=x0;x<x1;x++){
            if(x<0||x>=W||zBuf[x]<dist)continue;
            var tx=(x-x0)/sprH;
            for(var py=(top|0);py<(top+sprH*0.9)|0;py++){
                if(py<0||py>=H)continue;
                var ty=(py-top)/sprH,cx2=tx-0.5,cy2=ty-0.45;
                if(cx2*cx2*4+cy2*cy2*4>1)continue;
                var sh=1-cy2*0.4;
                ctx.fillStyle='rgba('+((c[0]*sh)|0)+','+((c[1]*sh)|0)+','+((c[2]*sh)|0)+','+alpha+')';
                ctx.fillRect(x,py,1,1);
            }
        }
    }

    function drawExp(ex,sx,dist,W,H,halfH,alpha){
        var p=ex.t/ex.max,r=H/dist*0.65*(0.7+p*0.3),a=alpha*p;
        var grd=ctx.createRadialGradient(sx,halfH,0,sx,halfH,r);
        grd.addColorStop(0,'rgba(255,240,100,'+a+')');grd.addColorStop(0.4,'rgba(255,120,0,'+(a*0.7)+')');grd.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=grd;ctx.fillRect(sx-r,halfH-r,r*2,r*2);
    }

    function drawProj(p,sx,dist,W,H,halfH,zBuf,alpha){
        var r=Math.min(20,H/dist*0.12);
        var grd=ctx.createRadialGradient(sx,halfH,0,sx,halfH,r);
        grd.addColorStop(0,'rgba(255,200,50,'+alpha+')');grd.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=grd;ctx.fillRect(sx-r,halfH-r,r*2,r*2);
    }

    // ── HUD ──
    function drawHUD(){
        var W=canvas.width,H=canvas.height,hudH=72,hudY=H-hudH,cx=W/2;
        ctx.fillStyle='rgba(0,0,0,0.9)';ctx.fillRect(0,hudY,W,hudH);
        ctx.fillStyle='#6B0000';ctx.fillRect(0,hudY,W,2);
        // Salud
        var hc=player.health>50?'#ff2222':player.health>25?'#ff8800':'#ff0000';
        ctx.font='bold 10px "Courier New"';ctx.fillStyle='#555';ctx.fillText('SALUD',14,hudY+15);
        ctx.font='bold 26px "Courier New"';ctx.fillStyle=hc;ctx.fillText(player.health+'%',10,hudY+50);
        // Armor
        ctx.font='bold 10px "Courier New"';ctx.fillStyle='#555';ctx.fillText('ARMOR',85,hudY+15);
        ctx.font='bold 26px "Courier New"';ctx.fillStyle='#4488ff';ctx.fillText(player.armor+'%',80,hudY+50);
        // Cara
        drawFace(ctx,cx-24,hudY+4,48,58);
        // Arma+Ammo
        var wpn=WEAPONS[player.weapon];
        ctx.font='bold 10px "Courier New"';ctx.fillStyle='#555';ctx.fillText('ARMA',W-145,hudY+15);
        ctx.font='bold 11px "Courier New"';ctx.fillStyle='#ffaa22';ctx.fillText(wpn.name,W-148,hudY+30);
        ctx.font='bold 10px "Courier New"';ctx.fillStyle='#555';ctx.fillText('AMMO',W-145,hudY+44);
        ctx.font='bold 24px "Courier New"';ctx.fillStyle='#ffdd00';ctx.fillText(String(player.ammo[wpn.ammoKey]).padStart(3,' '),W-148,hudY+65);
        // Score/Kills
        ctx.font='bold 10px "Courier New"';ctx.fillStyle='#555';ctx.fillText('SCORE',cx+40,hudY+15);
        ctx.font='bold 13px "Courier New"';ctx.fillStyle='#ff9090';ctx.fillText(player.score,cx+38,hudY+30);
        ctx.font='bold 10px "Courier New"';ctx.fillStyle='#555';ctx.fillText('KILLS',cx+40,hudY+46);
        ctx.font='bold 13px "Courier New"';ctx.fillStyle='#ff6060';ctx.fillText(player.kills+'/'+enemies.length,cx+38,hudY+62);
        // Mira
        ctx.strokeStyle='rgba(255,59,59,0.9)';ctx.lineWidth=1.5;
        var cy2=hudY/2,s=13,g=5;
        ctx.beginPath();ctx.moveTo(cx-s,cy2);ctx.lineTo(cx-g,cy2);ctx.moveTo(cx+g,cy2);ctx.lineTo(cx+s,cy2);
        ctx.moveTo(cx,cy2-s);ctx.lineTo(cx,cy2-g);ctx.moveTo(cx,cy2+g);ctx.lineTo(cx,cy2+s);ctx.stroke();
        ctx.fillStyle='rgba(255,59,59,0.75)';ctx.beginPath();ctx.arc(cx,cy2,2,0,Math.PI*2);ctx.fill();
        // Arma 3D
        drawWeapon(ctx,W,hudY);
        // Flash pantalla
        if(screenFlash.t>0){var fa=screenFlash.a*(screenFlash.t/14);ctx.fillStyle='rgba('+screenFlash.r+','+screenFlash.g+','+screenFlash.b+','+fa+')';ctx.fillRect(0,0,W,hudY);screenFlash.t--;}
        // Mensajes
        msgs=msgs.filter(function(m){return m.t>0;});
        msgs.forEach(function(m,i){var a=Math.min(1,m.t/35);ctx.globalAlpha=a;ctx.font='bold 15px "Courier New"';ctx.fillStyle=m.col;var tw=ctx.measureText(m.txt).width;ctx.fillText(m.txt,cx-tw/2,48+i*24);ctx.globalAlpha=1;m.t--;});
        // Minimap
        drawMinimap(W,H);
        // Teclas (pequeño, semitransparente)
        ctx.font='9px "Courier New"';ctx.fillStyle='rgba(255,200,80,0.38)';
        ctx.fillText('WASD/Flechas=Mover  A/D=Strafe  ESPACIO=Disparar  1/2/3=Armas  R=Reiniciar  ESC=Salir',10,hudY-6);
        // Victoria
        var vivos=enemies.filter(function(e){return e.alive;}).length;
        if(vivos===0&&!player.dead){ctx.fillStyle='rgba(0,0,0,0.65)';ctx.fillRect(0,0,W,hudY);ctx.font='bold 50px "Courier New"';ctx.fillStyle='#ffdd00';ctx.textAlign='center';ctx.fillText('¡NIVEL COMPLETADO!',cx,hudY/2-10);ctx.font='18px "Courier New"';ctx.fillStyle='#ff9090';ctx.fillText('Score: '+player.score+' · Kills: '+player.kills,cx,hudY/2+28);ctx.font='13px "Courier New"';ctx.fillStyle='#aaa';ctx.fillText('ESC para volver',cx,hudY/2+56);ctx.textAlign='left';}
        // Muerte
        if(player.dead){deathTimer++;var da=Math.min(0.85,deathTimer/70);ctx.fillStyle='rgba(130,0,0,'+da+')';ctx.fillRect(0,0,W,hudY);if(deathTimer>25){ctx.font='bold 56px "Courier New"';ctx.fillStyle='#ff0000';ctx.textAlign='center';ctx.fillText('HAS MUERTO',cx,hudY/2);ctx.font='15px "Courier New"';ctx.fillStyle='#ccc';ctx.fillText('[ R ] Reiniciar  ·  [ ESC ] Salir',cx,hudY/2+42);ctx.textAlign='left';}}
    }

    function drawFace(ctx,fx,fy,fw,fh){
        ctx.fillStyle='#c88858';ctx.fillRect(fx,fy,fw,fh);
        ctx.fillStyle='#d8a070';ctx.fillRect(fx+2,fy+2,fw-4,fh*0.62);
        var dead=player.dead,hurt=screenFlash.t>0&&screenFlash.r>100,shoot=flashTimer>0;
        if(dead){ctx.fillStyle='#ff0000';ctx.fillRect(fx+7,fy+13,9,9);ctx.fillRect(fx+fw-16,fy+13,9,9);ctx.strokeStyle='#000';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(fx+7,fy+13);ctx.lineTo(fx+16,fy+22);ctx.moveTo(fx+16,fy+13);ctx.lineTo(fx+7,fy+22);ctx.moveTo(fx+fw-16,fy+13);ctx.lineTo(fx+fw-7,fy+22);ctx.moveTo(fx+fw-7,fy+13);ctx.lineTo(fx+fw-16,fy+22);ctx.stroke();}
        else{ctx.fillStyle=shoot?'#ffffff':hurt?'#ff6666':'#ffffff';ctx.fillRect(fx+7,fy+13,10,10);ctx.fillRect(fx+fw-17,fy+13,10,10);ctx.fillStyle='#000';ctx.fillRect(fx+9,fy+15,6,6);ctx.fillRect(fx+fw-15,fy+15,6,6);}
        if(dead){ctx.fillStyle='#550000';ctx.fillRect(fx+10,fy+33,fw-20,7);}
        else if(shoot){ctx.fillStyle='#000';ctx.beginPath();ctx.arc(fx+fw/2,fy+37,6,0,Math.PI*2);ctx.fill();}
        else if(hurt){ctx.fillStyle='#000';ctx.fillRect(fx+14,fy+33,fw-28,5);}
        else{ctx.fillStyle='#000';ctx.fillRect(fx+12,fy+34,fw-24,4);}
        var bw=fw-4;ctx.fillStyle='#1a0000';ctx.fillRect(fx+2,fy+fh-7,bw,5);
        ctx.fillStyle=player.health>50?'#00cc00':player.health>25?'#ff8800':'#ff0000';ctx.fillRect(fx+2,fy+fh-7,bw*(player.health/100),5);
    }

    function drawWeapon(ctx,W,groundY){
        var kick=flashTimer>0?(flashTimer/10)*22:0,bob=Math.sin(player.bobPhase)*5;
        var cx=W/2,by=groundY-5+kick-bob;
        ctx.save();
        if(player.weapon==='pistol'){ctx.fillStyle='#1e1e1e';ctx.fillRect(cx+22,by-32,9,30);ctx.fillStyle='#363636';ctx.fillRect(cx+6,by-16,54,30);ctx.fillStyle='#1e1e1e';ctx.fillRect(cx+20,by+8,24,22);ctx.fillStyle='#555';ctx.fillRect(cx+10,by-12,38,6);}
        else if(player.weapon==='shotgun'){ctx.fillStyle='#181818';ctx.fillRect(cx+8,by-42,10,40);ctx.fillRect(cx+24,by-42,10,40);ctx.fillStyle='#5a2e0c';ctx.fillRect(cx-2,by-14,72,26);ctx.fillStyle='#3a1e06';ctx.fillRect(cx+50,by-10,20,20);ctx.fillStyle='#888';ctx.fillRect(cx+2,by-10,46,7);}
        else{ctx.fillStyle='#2a5520';ctx.fillRect(cx-14,by-22,92,16);ctx.fillStyle='#111';ctx.beginPath();ctx.arc(cx-14,by-14,11,0,Math.PI*2);ctx.fill();ctx.fillStyle='#1e4018';ctx.fillRect(cx+18,by-4,22,24);}
        if(flashTimer>0){var a=flashTimer/12,bx2=player.weapon==='shotgun'?cx+16:cx+26;var grd=ctx.createRadialGradient(bx2,by-40,0,bx2,by-40,28*a);grd.addColorStop(0,'rgba(255,230,100,'+a+')');grd.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=grd;ctx.fillRect(bx2-36,by-76,72,58);}
        ctx.restore();
    }

    function drawMinimap(W,H){
        var sc=5,ox=W-MW*sc-8,oy=8;
        ctx.globalAlpha=0.65;
        for(var my=0;my<MH;my++)for(var mx=0;mx<MW;mx++){
            ctx.fillStyle=MAP[my][mx]>0?['','#8B2020','#446688','#557744'][MAP[my][mx]]||'#555':'rgba(0,0,0,0.4)';
            ctx.fillRect(ox+mx*sc,oy+my*sc,sc-1,sc-1);
        }
        ctx.fillStyle='#ff0';ctx.fillRect(ox+player.x*sc-2,oy+player.y*sc-2,4,4);
        ctx.strokeStyle='#ff0';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(ox+player.x*sc,oy+player.y*sc);ctx.lineTo(ox+(player.x+Math.cos(player.angle)*2.2)*sc,oy+(player.y+Math.sin(player.angle)*2.2)*sc);ctx.stroke();
        enemies.forEach(function(e){if(e.alive){ctx.fillStyle='#f44';ctx.fillRect(ox+e.x*sc-1.5,oy+e.y*sc-1.5,3,3);}});
        ctx.globalAlpha=1;
    }

    // ── DISPARO ──
    function shoot(){
        if(player.dead)return;
        var wpn=WEAPONS[player.weapon];
        if(shootTimer>0)return;
        if(player.ammo[wpn.ammoKey]<=0){addMsg('SIN MUNICIÓN','#ff4444');return;}
        player.ammo[wpn.ammoKey]--;shootTimer=wpn.rate;flashTimer=10;playSound('shoot');
        if(wpn.splash){projs.push({x:player.x,y:player.y,dx:Math.cos(player.angle)*0.16,dy:Math.sin(player.angle)*0.16,dmg:wpn.dmg,fromEnemy:false,alive:true,type:'rocket'});}
        else{for(var p=0;p<wpn.pellets;p++)fireRay(player.angle+(Math.random()-0.5)*wpn.spread,wpn.dmg);}
    }

    function fireRay(angle,dmg){
        var best=null,bestD=999;
        enemies.forEach(function(e){
            if(!e.alive)return;var dx=e.x-player.x,dy=e.y-player.y,d=Math.sqrt(dx*dx+dy*dy);if(d>14)return;
            var ea=Math.atan2(dy,dx),diff=ea-angle;
            while(diff>Math.PI)diff-=2*Math.PI;while(diff<-Math.PI)diff+=2*Math.PI;
            if(Math.abs(diff)<0.20&&d<bestD){bestD=d;best=e;}
        });
        if(best){
            best.hp-=dmg;best.state='pain';best.anim=0;playSound('hit');
            if(best.hp<=0){best.alive=false;player.score+=EDATA[best.type].pts;player.kills++;playSound('death');addMsg('+'+EDATA[best.type].pts+' pts','#ffdd00');explosions.push({x:best.x,y:best.y,t:1,max:1});flashScreen(255,100,0,0.25);}
        }
    }

    function damagePlayer(dmg){
        if(player.invincible>0)return;
        var abs=Math.min(player.armor,dmg*0.45);player.armor-=abs;player.health-=(dmg-abs)|0;player.invincible=22;flashScreen(220,0,0,0.4);
        if(player.health<=0){player.health=0;player.dead=true;playSound('death');}
    }

    function pickupItem(it){
        it.alive=false;playSound('pickup');
        if(it.type==='health'){player.health=Math.min(100,player.health+it.val);addMsg('+'+it.val+' SALUD','#44ff44');flashScreen(0,180,0,0.1);}
        else if(it.type==='armor'){player.armor=Math.min(100,player.armor+it.val);addMsg('+'+it.val+' ARMOR','#4488ff');}
        else if(it.type==='ammo'){player.ammo[it.ammoKey]+=it.val;addMsg('+'+it.val+' AMMO','#ffdd00');}
        else if(it.type==='shotgun'){player.weapon='shotgun';player.ammo.shotgun+=it.val;addMsg('¡ESCOPETA!','#ffaa22');}
        else if(it.type==='rocket'){player.weapon='rocket';player.ammo.rocket+=it.val;addMsg('¡COHETES!','#ff6600');}
    }

    function restart(){
        player.health=100;player.armor=0;player.ammo={pistol:50,shotgun:20,rocket:5};
        player.x=1.5;player.y=1.5;player.angle=Math.PI*0.25;
        player.score=0;player.kills=0;player.dead=false;player.weapon='pistol';player.invincible=80;deathTimer=0;
        enemies.forEach(function(e){e.alive=true;e.hp=e.maxHp;e.state='idle';e.atk=0;e.anim=0;e.alert=0;});
        items.forEach(function(i){i.alive=true;});projs=[];explosions=[];msgs=[];addMsg('¡REINICIO!','#ffff00');
    }

    // ── UPDATE ──
    function update(){
        if(player.dead){if(doomKeys['KeyR'])restart();return;}
        var cos=Math.cos(player.angle),sin=Math.sin(player.angle),sp=player.speed,moving=false;
        if(doomKeys['ArrowUp']||doomKeys['KeyW']){var nx=player.x+cos*sp,ny=player.y+sin*sp;if(passable(nx,player.y))player.x=nx;if(passable(player.x,ny))player.y=ny;moving=true;}
        if(doomKeys['ArrowDown']||doomKeys['KeyS']){var nx=player.x-cos*sp,ny=player.y-sin*sp;if(passable(nx,player.y))player.x=nx;if(passable(player.x,ny))player.y=ny;moving=true;}
        if(doomKeys['KeyA']){var nx=player.x+sin*sp,ny=player.y-cos*sp;if(passable(nx,player.y))player.x=nx;if(passable(player.x,ny))player.y=ny;moving=true;}
        if(doomKeys['KeyD']){var nx=player.x-sin*sp,ny=player.y+cos*sp;if(passable(nx,player.y))player.x=nx;if(passable(player.x,ny))player.y=ny;moving=true;}
        if(doomKeys['ArrowLeft'])player.angle-=player.rotSpeed;
        if(doomKeys['ArrowRight'])player.angle+=player.rotSpeed;
        if(moving){player.bobPhase+=0.14;player.stepTimer++;if(player.stepTimer%28===0)playSound('step');}else player.bobPhase*=0.88;
        if(doomKeys['Space']||doomKeys['ShiftLeft'])shoot();
        if(doomKeys['Digit1']){player.weapon='pistol';addMsg('PISTOLA','#ffaa22');doomKeys['Digit1']=false;}
        if(doomKeys['Digit2']){player.weapon='shotgun';addMsg('ESCOPETA','#ffaa22');doomKeys['Digit2']=false;}
        if(doomKeys['Digit3']){player.weapon='rocket';addMsg('COHETES','#ff6600');doomKeys['Digit3']=false;}
        if(shootTimer>0)shootTimer--;if(flashTimer>0)flashTimer--;if(player.invincible>0)player.invincible--;
        // Proyectiles
        projs.forEach(function(p){
            if(!p.alive)return;p.x+=p.dx;p.y+=p.dy;
            if(!passable(p.x,p.y)){p.alive=false;if(p.type==='rocket'){explosions.push({x:p.x,y:p.y,t:1,max:1});flashScreen(255,120,0,0.3);}return;}
            if(p.fromEnemy){var dx=player.x-p.x,dy=player.y-p.y;if(Math.sqrt(dx*dx+dy*dy)<0.55){p.alive=false;damagePlayer(p.dmg);}}
            enemies.forEach(function(e){if(!e.alive||p.fromEnemy)return;var dx=e.x-p.x,dy=e.y-p.y;if(Math.sqrt(dx*dx+dy*dy)<0.5){p.alive=false;if(p.type==='rocket'){explosions.push({x:p.x,y:p.y,t:1,max:1});e.hp-=p.dmg;if(e.hp<=0){e.alive=false;player.score+=EDATA[e.type].pts;player.kills++;playSound('death');}}}});
        });
        projs=projs.filter(function(p){return p.alive;});
        explosions.forEach(function(ex){ex.t+=0.045;});explosions=explosions.filter(function(ex){return ex.t<ex.max+1;});
        items.forEach(function(it){if(!it.alive)return;var dx=player.x-it.x,dy=player.y-it.y;if(Math.sqrt(dx*dx+dy*dy)<0.68)pickupItem(it);});
        // IA
        enemies.forEach(function(e){
            if(!e.alive)return;e.anim++;
            var dx=player.x-e.x,dy=player.y-e.y,dist=Math.sqrt(dx*dx+dy*dy),ed=EDATA[e.type];
            if(e.state==='pain'){e.atk--;if(e.atk<=0)e.state='chase';return;}
            if(e.state==='idle'&&dist<ed.sight){e.state='alert';e.alert=25;}
            if(e.state==='alert'){e.alert--;if(e.alert<=0)e.state='chase';}
            if(e.state==='chase'||e.state==='attack'){
                if(dist>ed.atkRange*0.75&&dist>0.7){var nx=e.x+(dx/dist)*ed.spd,ny=e.y+(dy/dist)*ed.spd;if(passable(nx,e.y))e.x=nx;if(passable(e.x,ny))e.y=ny;}
                e.atk++;
                if(e.atk>=ed.fire){e.atk=0;
                    if(e.type==='imp'&&dist<ed.sight){projs.push({x:e.x,y:e.y,dx:(dx/dist)*0.08+(Math.random()-0.5)*0.018,dy:(dy/dist)*0.08+(Math.random()-0.5)*0.018,dmg:ed.atkDmg,fromEnemy:true,alive:true,type:'fireball'});}
                    else if(dist<ed.atkRange)damagePlayer(ed.atkDmg);
                }
            }
        });
    }

    // ── LOOP ──
    function loop(){
        if(!doomRunning)return;
        resize();update();
        var zBuf=castRays();renderSprites(zBuf);drawHUD();
        doomAnimFrame=requestAnimationFrame(loop);
    }

    // ── CONTROLES ──
    function onDown(e){
        doomKeys[e.code]=true;
        if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
        if(e.code==='Escape')window.closeDoom();
    }
    function onUp(e){doomKeys[e.code]=false;}
    document.addEventListener('keydown',onDown);
    document.addEventListener('keyup',onUp);
    window._doomCleanup=function(){document.removeEventListener('keydown',onDown);document.removeEventListener('keyup',onUp);window.removeEventListener('resize',resize);};

    // ── TÁCTILES ──
    var ov=document.getElementById('doom-overlay');
    var tb=document.getElementById('doom-touch-controls');if(tb)tb.remove();
    tb=document.createElement('div');tb.id='doom-touch-controls';
    tb.innerHTML='<div class="doom-touch-left"><div class="doom-touch-row"><div></div><button class="doom-touch-btn" data-key="ArrowUp">▲</button><div></div></div><div class="doom-touch-row"><button class="doom-touch-btn" data-key="KeyA">◄</button><button class="doom-touch-btn" data-key="ArrowDown">▼</button><button class="doom-touch-btn" data-key="KeyD">►</button></div></div><div class="doom-touch-right"><div class="doom-touch-row"><button class="doom-touch-btn" data-key="ArrowLeft">↺</button><button class="doom-touch-btn doom-fire-btn" data-key="Space">💥</button><button class="doom-touch-btn" data-key="ArrowRight">↻</button></div></div>';
    ov.appendChild(tb);
    tb.querySelectorAll('.doom-touch-btn').forEach(function(btn){
        var key=btn.dataset.key;
        btn.addEventListener('touchstart',function(e){e.preventDefault();doomKeys[key]=true;},{passive:false});
        btn.addEventListener('touchend',function(e){e.preventDefault();doomKeys[key]=false;},{passive:false});
        btn.addEventListener('mousedown',function(){doomKeys[key]=true;});
        btn.addEventListener('mouseup',function(){doomKeys[key]=false;});
    });

    addMsg('¡DOOM 1993!','#ff3b3b');addMsg('[1]Pistola [2]Escopeta [3]Cohetes','#ffaa00');
    loop();
}

function stopDoom(){
    doomRunning=false;
    if(doomAnimFrame){cancelAnimationFrame(doomAnimFrame);doomAnimFrame=null;}
    doomKeys={};
    if(typeof window._doomCleanup==='function'){window._doomCleanup();window._doomCleanup=null;}
    var tc=document.getElementById('doom-touch-controls');if(tc)tc.remove();
    var c=document.getElementById('doom-canvas');if(c){var ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);}
}

window.openDoom=function(){
    var ov=document.getElementById('doom-overlay');
    if(ov)ov.style.display='block'; // block, NO flex — el canvas es position:absolute
    // 3 frames para asegurar que el DOM está pintado
    requestAnimationFrame(function(){requestAnimationFrame(function(){requestAnimationFrame(function(){
        if(typeof startDoom==='function')startDoom();
    });});});
};
window.closeDoom=function(){
    var ov=document.getElementById('doom-overlay');if(ov)ov.style.display='none';
    if(typeof stopDoom==='function')stopDoom();
};
DOOMEOF
echo "doom.js: $(wc -l < /mnt/user-data/outputs/cutreal-ai/doom.js) líneas"
