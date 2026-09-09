
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, doc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
}[m]));

let items = [];
let editingId = null;

$("#loginForm").onsubmit = async e => {
  e.preventDefault();
  $("#loginMsg").textContent = "Giriş yapılıyor…";
  try {
    await signInWithEmailAndPassword(auth, $("#email").value, $("#password").value);
    $("#loginMsg").textContent = "";
  } catch (err) {
    $("#loginMsg").textContent = "Giriş başarısız: " + err.message;
  }
};

$("#logout").onclick = () => signOut(auth);

onAuthStateChanged(auth, u => {
  $("#loginView").classList.toggle("hidden", !!u);
  $("#appView").classList.toggle("hidden", !u);
  if (u) start();
});

function start() {
  const q = query(collection(db, "menu"), orderBy("category"), orderBy("sort"));
  onSnapshot(q, s => {
    items = s.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, err => {
    $("#status").textContent = "Veri yüklenemedi: " + err.message;
  });
}

function placeholder() {
  return "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23eaf1f4'/%3E%3Ctext x='50%25' y='56%25' text-anchor='middle' font-size='34'%3E☕%3C/text%3E%3C/svg%3E";
}

function render() {
  $("#items").innerHTML = items.map(x => `
    <div class="admin-item">
      <div class="admin-item-top">
        <img class="thumb" src="${x.imageUrl || placeholder()}">
        <div class="meta">
          <b>${esc(x.name)}</b>
          <div class="small">${esc(x.category)} • ${Number(x.price||0).toLocaleString("tr-TR")} ₺ ${x.active===false ? "• PASİF" : ""}</div>
        </div>
        <button class="btn ghost" data-edit="${x.id}">Düzenle</button>
      </div>
    </div>
  `).join("");

  document.querySelectorAll("[data-edit]").forEach(b => {
    b.onclick = () => edit(b.dataset.edit);
  });
}

function edit(id) {
  const x = items.find(i => i.id === id);
  if (!x) return;
  editingId = id;
  $("#name").value = x.name || "";
  $("#price").value = x.price ?? "";
  $("#category").value = x.category || "";
  $("#description").value = x.description || "";
  $("#sort").value = x.sort || 0;
  $("#active").checked = x.active !== false;
  $("#featured").checked = !!x.featured;
  $("#saveBtn").textContent = "Değişiklikleri Kaydet";
  $("#deleteBtn").classList.remove("hidden");
  $("#removeImageBtn").classList.toggle("hidden", !x.imageUrl);
  $("#imagePreview").src = x.imageUrl || placeholder();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("#newBtn").onclick = resetForm;

function resetForm() {
  editingId = null;
  $("#form").reset();
  $("#active").checked = true;
  $("#sort").value = 10;
  $("#saveBtn").textContent = "Ürünü Kaydet";
  $("#deleteBtn").classList.add("hidden");
  $("#removeImageBtn").classList.add("hidden");
  $("#imagePreview").src = placeholder();
  $("#status").textContent = "";
}

async function compressImage(file) {
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

  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);

    result = canvas.toDataURL("image/jpeg", quality);

    // Firestore document max is 1 MiB. Keep plenty of headroom.
    if (result.length < 650000) break;

    maxDim = Math.round(maxDim * 0.82);
    quality = Math.max(0.45, quality - 0.08);
  }

  if (result.length >= 850000) {
    throw new Error("Fotoğraf hâlâ çok büyük. Daha küçük bir fotoğraf seçin.");
  }
  return result;
}

$("#image").addEventListener("change", async e => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    $("#status").textContent = "Fotoğraf hazırlanıyor…";
    const data = await compressImage(f);
    $("#imagePreview").src = data;
    $("#status").textContent = "Fotoğraf hazır. Kaydet'e basın.";
  } catch (err) {
    $("#status").textContent = "Fotoğraf hatası: " + err.message;
  }
});

$("#form").onsubmit = async e => {
  e.preventDefault();
  $("#status").textContent = "Kaydediliyor…";

  try {
    let imageUrl = "";
    if (editingId) {
      const old = items.find(i => i.id === editingId);
      imageUrl = old?.imageUrl || "";
    }

    // Preview contains either old image or newly compressed image.
    if ($("#imagePreview").src && !$("#imagePreview").src.includes("svg+xml")) {
      imageUrl = $("#imagePreview").src;
    }

    const data = {
      name: $("#name").value.trim(),
      price: Number($("#price").value || 0),
      category: $("#category").value.trim(),
      description: $("#description").value.trim(),
      sort: Number($("#sort").value || 0),
      active: $("#active").checked,
      featured: $("#featured").checked,
      imageUrl
    };

    if (editingId) {
      await updateDoc(doc(db, "menu", editingId), data);
    } else {
      await addDoc(collection(db, "menu"), data);
    }

    $("#status").textContent = "Kaydedildi ✓";
    setTimeout(resetForm, 700);
  } catch (err) {
    $("#status").textContent = "Hata: " + err.message;
  }
};

$("#deleteBtn").onclick = async () => {
  if (!editingId) return;
  if (!confirm("Bu ürünü tamamen silmek istiyor musunuz?")) return;
  try {
    await deleteDoc(doc(db, "menu", editingId));
    resetForm();
  } catch (err) {
    $("#status").textContent = "Silme hatası: " + err.message;
  }
};

$("#removeImageBtn").onclick = () => {
  $("#imagePreview").src = placeholder();
  if (editingId) {
    const x = items.find(i => i.id === editingId);
    if (x) x.imageUrl = "";
  }
  $("#status").textContent = "Fotoğraf kaldırıldı. Kaydet'e basın.";
};

$("#seedBtn").onclick = async () => {
  if (!confirm("Başlangıç menüsünü Firestore'a ekleyelim mi? Bu işlem mevcut ürünleri silmez.")) return;
  try {
    const r = await fetch("../seed-menu.json");
    const data = await r.json();
    $("#status").textContent = "Ürünler ekleniyor…";
    for (const x of data) await addDoc(collection(db, "menu"), x);
    $("#status").textContent = "Başlangıç menüsü eklendi ✓";
  } catch (err) {
    $("#status").textContent = "Başlangıç menüsü hatası: " + err.message;
  }
};

resetForm();
