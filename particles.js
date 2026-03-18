document.addEventListener("DOMContentLoaded", () => {

const container = document.getElementById("particles");

if(!container) return;

for(let i=0;i<80;i++){
const p = document.createElement("div");

p.className = "particle";
p.style.left = Math.random()*100 + "%";
p.style.bottom = Math.random()*100 + "%";

const size = 2 + Math.random()*4;
p.style.width = size + "px";
p.style.height = size + "px";

p.style.animationDuration = (5 + Math.random()*10) + "s";

container.appendChild(p);
}

});
