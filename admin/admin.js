
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
const fallbackSVG = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="100%" height="100%" fill="#efe6d0"/><text x="50%" y="54%" text-anchor="middle" font-size="88">☕</text></svg>`);
const fallbackImage = `data:image/svg+xml;charset=UTF-8,${fallbackSVG}`;

let items = [];
let editingId = null;

$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  $("#loginMsg").textContent = "Giriş yapılıyor…";
  try{
    await signInWithEmailAndPassword(auth, $("#email").value, $("#password").value);
    $("#loginMsg").textContent = "";
  }catch(err){
    $("#loginMsg").textContent = "Giriş başarısız: " + err.message;
  }
};

$("#logout").onclick = () => signOut(auth);

onAuthStateChanged(auth, user => {
  $("#loginView").classList.toggle("hidden", !!user);
  $("#appView").classList.toggle("hidden", !user);
  if (user) start();
});

function start(){
  const q = query(collection(db, "menu"), orderBy("category"));
  onSnapshot(q, snap => {
    items = snap.docs
      .map(d => ({ id:d.id, ...d.data() }))
      .sort((a,b) => {
        const cat = String(a.category || "").localeCompare(String(b.category || ""), "tr");
        return cat !== 0 ? cat : Number(a.sort || 0) - Number(b.sort || 0);
      });
    renderList();
  }, err => {
    $("#status").textContent = "Veri yüklenemedi: " + err.message;
  });
}

function currentImage(){
  return $("#imagePreview").src && !$("#imagePreview").src.includes("svg+xml") ? $("#imagePreview").src : "";
}

function resetForm(){
  editingId = null;
  $("#form").reset();
  $("#active").checked = true;
  $("#sort").value = 10;
  $("#imagePreview").src = fallbackImage;
  $("#deleteBtn").classList.add("hidden");
  $("#removeImageBtn").classList.add("hidden");
  $("#saveBtn").textContent = "Ürünü Kaydet";
  $("#status").textContent = "";
}

$("#newBtn").onclick = resetForm;

function renderList(){
  $("#items").innerHTML = items.map(item => `
    <div class="item">
      <div class="item-top">
        <img class="item-thumb" src="${item.imageUrl || fallbackImage}" alt="">
        <div>
          <div class="item-title">${esc(item.name)}</div>
          <div class="item-meta">${esc(item.category)} • ${Number(item.price || 0).toLocaleString("tr-TR")} ₺ ${item.featured ? "• ÖNE ÇIKAN" : ""} ${item.active === false ? "• GİZLİ" : ""}</div>
        </div>
        <button class="btn ghost" data-edit="${item.id}">Düzenle</button>
      </div>
    </div>
  `).join("");

  document.querySelectorAll("[data-edit]").forEach(btn => {
    btn.onclick = () => editItem(btn.dataset.edit);
  });
}

function editItem(id){
  const item = items.find(x => x.id === id);
  if (!item) return;
  editingId = id;
  $("#name").value = item.name || "";
  $("#category").value = item.category || "";
  $("#price").value = item.price ?? "";
  $("#sort").value = item.sort ?? 10;
  $("#description").value = item.description || "";
  $("#active").checked = item.active !== false;
  $("#featured").checked = !!item.featured;
  $("#imagePreview").src = item.imageUrl || fallbackImage;
  $("#saveBtn").textContent = "Değişiklikleri Kaydet";
  $("#deleteBtn").classList.remove("hidden");
  $("#removeImageBtn").classList.toggle("hidden", !item.imageUrl);
  window.scrollTo({top:0, behavior:"smooth"});
}

async function compressImage(file){
  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  let maxDim = 720;
  let quality = 0.72;
  let result = "";

  for(let attempt = 0; attempt < 6; attempt++){
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    result = canvas.toDataURL("image/jpeg", quality);
    if (result.length < 650000) break;
    maxDim = Math.round(maxDim * 0.82);
    quality = Math.max(0.45, quality - 0.08);
  }
  if (result.length >= 850000){
    throw new Error("Fotoğraf çok büyük. Daha küçük bir görsel seçin.");
  }
  return result;
}

$("#image").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try{
    $("#status").textContent = "Fotoğraf hazırlanıyor…";
    const data = await compressImage(file);
    $("#imagePreview").src = data;
    $("#removeImageBtn").classList.remove("hidden");
    $("#status").textContent = "Fotoğraf hazır. Kaydet'e basın.";
  }catch(err){
    $("#status").textContent = "Fotoğraf hatası: " + err.message;
  }
});

$("#removeImageBtn").onclick = () => {
  $("#imagePreview").src = fallbackImage;
  $("#removeImageBtn").classList.add("hidden");
  $("#status").textContent = "Fotoğraf kaldırıldı. Kaydet'e basın.";
};

$("#form").onsubmit = async (e) => {
  e.preventDefault();
  $("#status").textContent = "Kaydediliyor…";

  const data = {
    name: $("#name").value.trim(),
    category: $("#category").value.trim(),
    price: Number($("#price").value || 0),
    sort: Number($("#sort").value || 0),
    description: $("#description").value.trim(),
    active: $("#active").checked,
    featured: $("#featured").checked,
    imageUrl: currentImage()
  };

  try{
    if (editingId){
      await updateDoc(doc(db, "menu", editingId), data);
    } else {
      await addDoc(collection(db, "menu"), data);
    }
    $("#status").textContent = "Kaydedildi ✓";
    setTimeout(resetForm, 600);
  }catch(err){
    $("#status").textContent = "Hata: " + err.message;
  }
};

$("#deleteBtn").onclick = async () => {
  if (!editingId) return;
  if (!confirm("Bu ürünü silmek istiyor musunuz?")) return;
  try{
    await deleteDoc(doc(db, "menu", editingId));
    resetForm();
  }catch(err){
    $("#status").textContent = "Silme hatası: " + err.message;
  }
};

$("#seedBtn").onclick = async () => {
  if (!confirm("Başlangıç menüsünü ekleyelim mi? Bu işlem mevcut ürünleri silmez.")) return;
  try{
    $("#status").textContent = "Ürünler yükleniyor…";
    const data = await fetch("../seed-menu.json").then(r => r.json());
    for (const item of data){
      await addDoc(collection(db, "menu"), item);
    }
    $("#status").textContent = "Başlangıç menüsü eklendi ✓";
  }catch(err){
    $("#status").textContent = "Yükleme hatası: " + err.message;
  }
};

resetForm();
