body{

font-family:Arial, Helvetica, sans-serif;

background:#0f0f0f;

color:white;

margin:0;
padding:0;

display:flex;
flex-direction:column;
align-items:center;

min-height:100vh;

overflow-x:hidden;

}

/* TITULO */

h1{

margin-top:40px;
font-size:60px;
letter-spacing:4px;
font-weight:bold;

text-align:center;

}

/* CHAT */

#chat{

width:60%;
height:420px;

margin-top:20px;

background:#111;

border-radius:18px;

padding:20px;

overflow-y:auto;

text-align:left;

box-shadow:0 10px 40px rgba(0,0,0,0.7);

}

/* SCROLL */

#chat::-webkit-scrollbar{
width:6px;
}

#chat::-webkit-scrollbar-thumb{
background:#444;
border-radius:10px;
}

/* MENSAJES */

.user{

background:#2a2a2a;

padding:10px 14px;

border-radius:12px;

margin:10px 0;

display:block;

width:fit-content;

max-width:70%;

color:white;

animation:aparecer 0.25s ease;

}

.ai{

background:#b00000;

padding:10px 14px;

border-radius:12px;

margin:10px 0;

display:block;

width:fit-content;

max-width:70%;

color:white;

animation:aparecer 0.25s ease;

}

/* ANIMACION */

@keyframes aparecer{

from{
opacity:0;
transform:translateY(10px);
}

to{
opacity:1;
transform:translateY(0);
}

}

/* INPUT */

.input-area{

margin-top:15px;
margin-bottom:30px;

}

input{

width:500px;

padding:12px;

border:none;

border-radius:10px;

background:#2a2a2a;

color:white;

outline:none;

font-size:15px;

}

/* BOTON */

button{

padding:12px 18px;

border:none;

border-radius:10px;

background:#ff3b3b;

color:white;

cursor:pointer;

font-weight:bold;

transition:0.2s;

}

button:hover{

transform:scale(1.05);

background:#ff2020;

}

/* PARTICULAS */

#particles{

position:fixed;
top:0;
left:0;

width:100%;
height:100%;

z-index:-1;

}

.particle{

position:absolute;

background:rgba(255,255,255,0.4);

border-radius:50%;

animation:float linear infinite;

}

@keyframes float{

from{
transform:translateY(0);
}

to{
transform:translateY(-120vh);
}

}
