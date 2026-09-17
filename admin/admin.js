
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy, writeBatch } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
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

let bulkRows = [];

function normalizeKey(value){
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ");
}

function normalizeHeader(value){
  return normalizeKey(value)
    .replace(/[ıİ]/g, "i")
    .replace(/[şŞ]/g, "s")
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
    .replace(/[^a-z0-9]/g, "");
}

function parsePrice(value){
  if (typeof value === "number") return value;
  let s = String(value ?? "").trim().replace(/\s/g, "").replace(/₺/g, "");
  if (!s) return NaN;
  if (s.includes(",") && s.includes(".")){
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else {
    s = s.replace(",", ".");
  }
  return Number(s);
}

function detectDelimiter(line){
  const options = ["\t", ";", ","];
  let best = "\t", count = -1;
  for (const d of options){
    const pattern = d === "\t" ? /\t/g : new RegExp("\\" + d, "g");
    const c = (line.match(pattern) || []).length;
    if (c > count){ best = d; count = c; }
  }
  return best;
}

function parseDelimitedLine(line, delimiter){
  const out = [];
  let cur = "", quoted = false;
  for (let i=0; i<line.length; i++){
    const ch = line[i];
    if (ch === '"'){
      if (quoted && line[i+1] === '"'){ cur += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === delimiter && !quoted){
      out.push(cur.trim()); cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function rowsFromMatrix(matrix){
  const clean = matrix
    .map(r => Array.from(r || []).map(v => String(v ?? "").trim()))
    .filter(r => r.some(Boolean));
  if (!clean.length) return [];

  const aliases = {
    category:["kategori","category","kat"],
    name:["urunadi","urun","name","product","productname","urunismi"],
    price:["fiyat","price","ucret","tutar"],
    sort:["sira","sort","order","sirano"]
  };
  const first = clean[0].map(normalizeHeader);
  const idx = {};
  for (const [key, list] of Object.entries(aliases)){
    idx[key] = first.findIndex(x => list.includes(x));
  }
  const hasHeader = idx.category >= 0 && idx.name >= 0 && idx.price >= 0;
  const dataRows = hasHeader ? clean.slice(1) : clean;
  if (!hasHeader){
    idx.category = 0; idx.name = 1; idx.price = 2; idx.sort = 3;
  }

  let autoSort = 1;
  return dataRows.map((r, i) => {
    const category = String(r[idx.category] ?? "").trim();
    const name = String(r[idx.name] ?? "").trim();
    const price = parsePrice(r[idx.price]);
    const sortRaw = idx.sort >= 0 ? String(r[idx.sort] ?? "").trim() : "";
    const sort = sortRaw === "" ? autoSort++ : Number(sortRaw);
    return {
      rowNo: i + (hasHeader ? 2 : 1),
      category, name, price,
      sort: Number.isFinite(sort) ? sort : autoSort++,
      active: true,
      featured: false,
      description: "",
      imageUrl: ""
    };
  });
}

function parseBulkText(text){
  const lines = String(text || "").replace(/\r/g, "").split("\n").filter(x => x.trim());
  if (!lines.length) return [];
  const delimiter = detectDelimiter(lines[0]);
  return rowsFromMatrix(lines.map(line => parseDelimitedLine(line, delimiter)));
}

function existingMap(){
  const map = new Map();
  for (const item of items){
    map.set(`${normalizeKey(item.category)}|||${normalizeKey(item.name)}`, item);
  }
  return map;
}

function validateBulkRows(rows){
  const existing = existingMap();
  const seen = new Map();
  const mode = $("#bulkMode").value;
  return rows.map((r, i) => {
    const errors = [];
    if (!r.category) errors.push("Kategori boş");
    if (!r.name) errors.push("Ürün adı boş");
    if (!Number.isFinite(r.price) || r.price < 0) errors.push("Fiyat geçersiz");
    const key = `${normalizeKey(r.category)}|||${normalizeKey(r.name)}`;
    const old = existing.get(key);
    if (seen.has(key)) errors.push(`Listede tekrar (satır ${seen.get(key)})`);
    else seen.set(key, r.rowNo || i+1);
    let action = old ? (mode === "skip" ? "Atlanacak" : "Güncellenecek") : "Eklenecek";
    if (errors.length) action = "Hatalı";
    return {
      ...r,
      key,
      existingId: old?.id || null,
      description: old ? (old.description || "") : (r.description || ""),
      imageUrl: old ? (old.imageUrl || "") : (r.imageUrl || ""),
      active: old ? (old.active !== false) : (r.active !== false),
      featured: old ? !!old.featured : !!r.featured,
      errors,
      action
    };
  });
}

function renderBulkPreview(){
  bulkRows = validateBulkRows(bulkRows);
  const valid = bulkRows.filter(r => !r.errors.length);
  const errors = bulkRows.length - valid.length;
  const addCount = valid.filter(r => r.action === "Eklenecek").length;
  const updCount = valid.filter(r => r.action === "Güncellenecek").length;
  const skipCount = valid.filter(r => r.action === "Atlanacak").length;

  $("#bulkPreviewBody").innerHTML = bulkRows.slice(0, 300).map((r, i) => `
    <tr class="${r.errors.length ? "bulk-error-row" : ""}">
      <td>${i+1}</td>
      <td>${esc(r.category)}</td>
      <td>${esc(r.name)}</td>
      <td>${Number.isFinite(r.price) ? Number(r.price).toLocaleString("tr-TR") + " ₺" : "—"}</td>
      <td>${esc(r.sort)}</td>
      <td>${r.errors.length ? esc(r.errors.join(", ")) : esc(r.action)}</td>
    </tr>
  `).join("");

  $("#bulkPreviewWrap").classList.toggle("hidden", !bulkRows.length);
  $("#bulkSummary").classList.toggle("hidden", !bulkRows.length);
  $("#bulkSummary").innerHTML = `<b>${bulkRows.length} satır</b> • ${addCount} eklenecek • ${updCount} güncellenecek • ${skipCount} atlanacak • ${errors} hatalı`;
  $("#bulkSaveBtn").disabled = !valid.length || errors > 0;
  $("#bulkStatus").textContent = errors ? "Hatalı satırları düzeltin; kayıt butonu hatalar giderilene kadar kapalıdır." : "Önizleme hazır ✓";
}

$("#bulkBtn").onclick = () => {
  $("#bulkPanel").classList.remove("hidden");
  $("#bulkPanel").scrollIntoView({behavior:"smooth", block:"start"});
};
$("#bulkCloseBtn").onclick = () => $("#bulkPanel").classList.add("hidden");
$("#bulkClearBtn").onclick = () => {
  $("#bulkFile").value = "";
  $("#bulkText").value = "";
  bulkRows = [];
  $("#bulkPreviewBody").innerHTML = "";
  $("#bulkPreviewWrap").classList.add("hidden");
  $("#bulkSummary").classList.add("hidden");
  $("#bulkSaveBtn").disabled = true;
  $("#bulkStatus").textContent = "";
};

$("#bulkMode").onchange = () => {
  if (bulkRows.length) renderBulkPreview();
};

$("#bulkFile").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try{
    $("#bulkStatus").textContent = "Dosya okunuyor…";
    const ext = file.name.split(".").pop().toLowerCase();
    let matrix = [];
    if (["xlsx","xls"].includes(ext)){
      if (!window.XLSX) throw new Error("Excel okuyucu yüklenemedi. İnternet bağlantısını kontrol edin veya CSV kullanın.");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, {type:"array"});
      const ws = wb.Sheets[wb.SheetNames[0]];
      matrix = XLSX.utils.sheet_to_json(ws, {header:1, raw:false, defval:""});
    } else {
      const text = await file.text();
      const lines = text.replace(/\r/g,"").split("\n").filter(x => x.trim());
      if (lines.length){
        const delimiter = detectDelimiter(lines[0]);
        matrix = lines.map(line => parseDelimitedLine(line, delimiter));
      }
    }
    bulkRows = rowsFromMatrix(matrix);
    renderBulkPreview();
  }catch(err){
    $("#bulkStatus").textContent = "Dosya hatası: " + err.message;
    $("#bulkSaveBtn").disabled = true;
  }
});

$("#bulkPreviewBtn").onclick = () => {
  try{
    const text = $("#bulkText").value.trim();
    if (text) bulkRows = parseBulkText(text);
    else if (!bulkRows.length) throw new Error("Önce dosya seçin veya tabloyu yapıştırın.");
    renderBulkPreview();
  }catch(err){
    $("#bulkStatus").textContent = "Önizleme hatası: " + err.message;
  }
};

$("#bulkSaveBtn").onclick = async () => {
  bulkRows = validateBulkRows(bulkRows);
  const errors = bulkRows.filter(r => r.errors.length);
  if (errors.length){
    renderBulkPreview();
    return;
  }

  const actionable = bulkRows.filter(r => r.action !== "Atlanacak");
  if (!actionable.length){
    $("#bulkStatus").textContent = "Kaydedilecek yeni veya güncellenecek ürün yok.";
    return;
  }
  if (!confirm(`${actionable.length} ürün Firestore'a kaydedilecek. Devam edilsin mi?`)) return;

  $("#bulkSaveBtn").disabled = true;
  try{
    let done = 0;
    for (let start = 0; start < actionable.length; start += 400){
      const chunk = actionable.slice(start, start + 400);
      const batch = writeBatch(db);
      for (const row of chunk){
        const data = {
          name: row.name,
          category: row.category,
          price: Number(row.price),
          sort: Number(row.sort || 0),
          description: row.description || "",
          active: row.active !== false,
          featured: !!row.featured,
          imageUrl: row.imageUrl || ""
        };
        if (row.existingId){
          batch.update(doc(db, "menu", row.existingId), data);
        } else {
          batch.set(doc(collection(db, "menu")), data);
        }
      }
      await batch.commit();
      done += chunk.length;
      $("#bulkStatus").textContent = `${done}/${actionable.length} ürün kaydedildi…`;
    }
    $("#bulkStatus").textContent = `${actionable.length} ürün başarıyla kaydedildi ✓`;
    $("#bulkText").value = "";
    $("#bulkFile").value = "";
    bulkRows = [];
    $("#bulkSaveBtn").disabled = true;
    $("#bulkPreviewWrap").classList.add("hidden");
    $("#bulkSummary").classList.add("hidden");
  }catch(err){
    $("#bulkStatus").textContent = "Toplu kayıt hatası: " + err.message;
    $("#bulkSaveBtn").disabled = false;
  }
};



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
