
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const menuEl = document.querySelector("#menu");
const catsEl = document.querySelector("#cats");
const featuredEl = document.querySelector("#featured");
const searchEl = document.querySelector("#search");
let allItems = [];

const esc = s => String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
function card(x){
  const img = x.imageUrl ? `<img src="${esc(x.imageUrl)}" alt="${esc(x.name)}" loading="lazy">` : `<img alt="" src="data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Crect width='160' height='160' fill='%23eaf1f4'/%3E%3Ctext x='50%25' y='54%25' text-anchor='middle' font-size='48'%3E☕%3C/text%3E%3C/svg%3E">`;
  return `<div class="card">${img}<div class="info"><div class="name">${esc(x.name)}</div>${x.description?`<div class="desc">${esc(x.description)}</div>`:""}${x.featured?`<span class="badge">ÖNE ÇIKAN</span>`:""}</div><div class="price">${Number(x.price||0).toLocaleString("tr-TR")} ₺</div></div>`;
}
function render(filter=""){
  const f = filter.toLocaleLowerCase("tr-TR").trim();
  const items = allItems.filter(x=>x.active!==false && (!f || `${x.name} ${x.category} ${x.description||""}`.toLocaleLowerCase("tr-TR").includes(f)));
  const cats = [...new Set(items.map(x=>x.category))];
  catsEl.innerHTML = cats.map(c=>`<button data-cat="${esc(c)}">${esc(c)}</button>`).join("");
  catsEl.querySelectorAll("button").forEach(b=>b.onclick=()=>{
    const el=document.getElementById("cat-"+b.dataset.cat.replace(/[^a-zA-Z0-9ğüşöçıİĞÜŞÖÇ]+/g,"-"));
    if(el) el.scrollIntoView({behavior:"smooth",block:"start"});
  });

  const featured = items.filter(x=>x.featured);
  featuredEl.innerHTML = featured.length ? `<div class="featured-title">Öne Çıkanlar</div><div class="grid">${featured.map(card).join("")}</div>` : "";

  menuEl.innerHTML = cats.map(c=>{
    const ci=items.filter(x=>x.category===c).sort((a,b)=>(a.sort||0)-(b.sort||0));
    const id="cat-"+c.replace(/[^a-zA-Z0-9ğüşöçıİĞÜŞÖÇ]+/g,"-");
    return `<section id="${id}"><div class="section-title">${esc(c)}</div><div class="grid">${ci.map(card).join("")}</div></section>`;
  }).join("") || `<div class="empty">Ürün bulunamadı.</div>`;
}
searchEl.addEventListener("input",e=>render(e.target.value));
const q=query(collection(db,"menu"),orderBy("category"),orderBy("sort"));
onSnapshot(q,s=>{
  allItems=s.docs.map(d=>({id:d.id,...d.data()}));
  render(searchEl.value);
},e=>{
  menuEl.innerHTML=`<div class="empty">Menü yüklenemedi. Firebase ayarlarını kontrol edin.</div>`;
  console.error(e);
});
