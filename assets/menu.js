
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const searchEl = document.querySelector("#search");
const catsEl = document.querySelector("#cats");
const featuredWrap = document.querySelector("#featuredWrap");
const featuredList = document.querySelector("#featuredList");
const sectionsEl = document.querySelector("#sections");
const itemCountEl = document.querySelector("#itemCount");

let allItems = [];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
const slug = (s) => String(s || "").toLocaleLowerCase("tr-TR")
  .replaceAll("ı","i").replaceAll("ğ","g").replaceAll("ü","u").replaceAll("ş","s").replaceAll("ö","o").replaceAll("ç","c")
  .replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");

const emojiForCategory = (cat) => {
  const c = String(cat || "").toLocaleLowerCase("tr-TR");
  if (c.includes("kahve")) return "☕";
  if (c.includes("frozen")) return "🧊";
  if (c.includes("milkshake")) return "🥤";
  if (c.includes("limonata")) return "🍋";
  if (c.includes("çay")) return "🍵";
  if (c.includes("özel")) return "✨";
  if (c.includes("su")) return "💧";
  if (c.includes("atıştır")) return "🍿";
  return "•";
};

const fallbackSVG = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="100%" height="100%" fill="#efe6d0"/><text x="50%" y="54%" text-anchor="middle" font-size="88">☕</text></svg>`);
const fallbackImage = `data:image/svg+xml;charset=UTF-8,${fallbackSVG}`;

function card(item, featured=false){
  const img = item.imageUrl
    ? `<img src="${esc(item.imageUrl)}" alt="${esc(item.name)}" loading="lazy">`
    : `<img src="${fallbackImage}" alt="">`;
  const cls = featured ? "featured-card" : "product-card";
  return `
    <article class="card ${cls}">
      <div class="thumb">${img}</div>
      <div class="content">
        <div class="badges">
          ${item.featured ? `<span class="badge featured">★ Öne Çıkan</span>` : ``}
          ${featured ? `<span class="badge category">${esc(item.category)}</span>` : ``}
        </div>
        <div class="name">${esc(item.name)}</div>
        ${item.description ? `<div class="desc">${esc(item.description)}</div>` : ``}
        <div class="price-row">
          <div class="price">${Number(item.price || 0).toLocaleString("tr-TR")} ₺</div>
          <div class="cta">Afiyet olsun</div>
        </div>
      </div>
    </article>
  `;
}

function render(filter=""){
  const q = filter.trim().toLocaleLowerCase("tr-TR");
  const items = allItems.filter(x => x.active !== false && (!q || `${x.name} ${x.category} ${x.description || ""}`.toLocaleLowerCase("tr-TR").includes(q)));

  itemCountEl.textContent = `${items.length} ürün`;
  const categories = [...new Set(items.map(x => x.category))];

  catsEl.innerHTML = categories.map(cat => `
    <button data-target="${slug(cat)}">${emojiForCategory(cat)} ${esc(cat)}</button>
  `).join("");

  catsEl.querySelectorAll("button").forEach(btn => {
    btn.onclick = () => {
      const target = document.getElementById(btn.dataset.target);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  });

  const featured = items.filter(x => x.featured);
  if (featured.length){
    featuredWrap.classList.remove("hidden");
    featuredList.innerHTML = featured.map(x => card(x, true)).join("");
  } else {
    featuredWrap.classList.add("hidden");
    featuredList.innerHTML = "";
  }

  sectionsEl.innerHTML = categories.map(cat => {
    const list = items.filter(x => x.category === cat);
    return `
      <section class="section" id="${slug(cat)}">
        <div class="section-head">
          <h3>${emojiForCategory(cat)} ${esc(cat)}</h3>
          <div class="muted">${list.length} ürün</div>
        </div>
        <div class="product-grid">
          ${list.map(x => card(x)).join("")}
        </div>
      </section>
    `;
  }).join("");

  if (!items.length){
    featuredWrap.classList.add("hidden");
    sectionsEl.innerHTML = `<div class="empty">Aradığınız ürün bulunamadı.</div>`;
  }
}

searchEl.addEventListener("input", e => render(e.target.value));

const q = query(collection(db, "menu"), orderBy("category"));
onSnapshot(q, snap => {
  allItems = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a,b) => {
      const cat = String(a.category || "").localeCompare(String(b.category || ""), "tr");
      return cat !== 0 ? cat : Number(a.sort || 0) - Number(b.sort || 0);
    });
  render(searchEl.value);
}, err => {
  console.error(err);
  featuredWrap.classList.add("hidden");
  sectionsEl.innerHTML = `<div class="empty">Menü yüklenemedi. Lütfen tekrar deneyin.</div>`;
});
