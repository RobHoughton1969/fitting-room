/* ----------------------------- 2. STORAGE -------------------------------- */
/* Two backends behind one door: the artifact's own store when the viewer can
   write to it, otherwise this browser. Photos go to assets/IndexedDB; the
   garment records that point at them go to db/IndexedDB. */

const Store = (() => {
  let mode = "pending", db = null, assets = null, idb = null;
  const urlCache = new Map();

  function openIDB(){
    return new Promise((res, rej) => {
      const rq = indexedDB.open("fitting-room", 1);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        if(!d.objectStoreNames.contains("images")) d.createObjectStore("images", { keyPath:"id" });
        if(!d.objectStoreNames.contains("items")) d.createObjectStore("items", { keyPath:"id" });
        if(!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath:"id" });
      };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  }
  const tx = (store, m, fn) => new Promise((res, rej) => {
    const t = idb.transaction(store, m), s = t.objectStore(store), r = fn(s);
    t.oncomplete = () => res(r && r.result);
    t.onerror = () => rej(t.error);
  });

  async function init(){
    if(window.claude && typeof window.claude.use === "function"){
      try{ db = await window.claude.use("db"); }catch(e){ db = null; }
      try{ assets = await window.claude.use("assets"); }catch(e){ assets = null; }
    }
    if(db && assets){ mode = "cloud"; return mode; }
    db = null; assets = null;
    try{ idb = await openIDB(); mode = "local"; }
    catch(e){ mode = "none"; }
    return mode;
  }

  async function putImage(blob){
    if(mode === "cloud"){
      const r = await assets.upload(blob, { type:"image/jpeg" });
      urlCache.set("asset:" + r.id, r.url);
      return "asset:" + r.id;
    }
    const id = uid();
    if(mode === "local") await tx("images","readwrite", s => s.put({ id, blob }));
    urlCache.set("local:" + id, URL.createObjectURL(blob));
    return "local:" + id;
  }
  async function imageURL(ref){
    if(!ref) return null;
    if(urlCache.has(ref)) return urlCache.get(ref);
    if(ref.startsWith("asset:")){ const u = "/_blob/" + ref.slice(6); urlCache.set(ref, u); return u; }
    if(ref.startsWith("data:")) return ref;
    if(mode !== "local") return null;
    const rec = await tx("images","readonly", s => s.get(ref.slice(6)));
    if(!rec) return null;
    const u = URL.createObjectURL(rec.blob); urlCache.set(ref, u); return u;
  }
  async function dropImage(ref){
    if(!ref) return;
    urlCache.delete(ref);
    try{
      if(ref.startsWith("asset:") && assets) await assets.delete(ref.slice(6));
      else if(ref.startsWith("local:") && mode === "local") await tx("images","readwrite", s => s.delete(ref.slice(6)));
    }catch(e){ /* an orphaned blob is harmless */ }
  }

  async function allItems(){
    if(mode === "cloud"){ const snap = await db.collection("wardrobe").get(); return snap.docs.map(d => d.data()); }
    if(mode === "local") return (await tx("items","readonly", s => s.getAll())) || [];
    return [];
  }
  async function saveItem(it){
    if(mode === "cloud") await db.collection("wardrobe").doc(it.id).set(it);
    else if(mode === "local") await tx("items","readwrite", s => s.put(it));
  }
  async function removeItem(id){
    if(mode === "cloud") await db.collection("wardrobe").doc(id).delete();
    else if(mode === "local") await tx("items","readwrite", s => s.delete(id));
  }
  async function getProfile(){
    if(mode === "cloud"){ const d = await db.doc("profile/main").get(); return d.exists ? d.data() : null; }
    if(mode === "local"){ const r = await tx("meta","readonly", s => s.get("profile")); return r ? r.value : null; }
    return null;
  }
  async function saveProfile(p){
    if(mode === "cloud") await db.doc("profile/main").set(p);
    else if(mode === "local") await tx("meta","readwrite", s => s.put({ id:"profile", value:p }));
  }

  return { init, putImage, imageURL, dropImage, allItems, saveItem, removeItem,
           getProfile, saveProfile, get mode(){ return mode; } };
})();

/* ------------------------------- 3. STATE -------------------------------- */
const ANGLES = [
  { id:"front", label:"Front",       deg:"0°",   hint:"Face the lens straight on, shoulders square." },
  { id:"right", label:"Right side",  deg:"90°",  hint:"Turn a quarter to your left so the lens sees your right cheek." },
  { id:"back",  label:"Back",        deg:"180°", hint:"Back of the head. Ask someone, or use a timer." },
  { id:"left",  label:"Left side",   deg:"270°", hint:"Turn a quarter to your right so the lens sees your left cheek." }
];

const DEFAULT_PROFILE = {
  heightCm: 175, shoulderCm: 44, waistCm: 84, hipCm: 98,
  skin: "#C6A182", faceZoom: 1, faceY: 0, selfies: {},
  useScan: false, scanPhotoSkin: true, scan: null
};

const State = {
  ready: false,
  usingSamples: false,
  items: [],
  profile: { ...DEFAULT_PROFILE },
  outfit: {},              /* slot -> item id (accessory holds an array) */
  view: "mirror",
  filter: "all",
  query: "",
  brief: { occasion:"dinner", tempC:19, cond:[], time:"day" },
  looks: []
};
const itemById = id => State.items.find(i => i.id === id);
function wornIds(){
  const out = [];
  for(const k in State.outfit){
    const v = State.outfit[k];
    if(Array.isArray(v)) out.push(...v); else if(v) out.push(v);
  }
  return out;
}
function isWorn(id){ return wornIds().includes(id); }

/* --------------------- sample wardrobe (memory only) ---------------------- */
/* Fifteen example garments drawn as fabric swatches, so the mirror has
   something on it the first time the page opens. Never written to storage. */
function weaveSwatch(hex, cat, pattern, withIcon){
  const c = document.createElement("canvas"); c.width = c.height = 320;
  const g = c.getContext("2d");
  const [h,s,l] = hexToHsl(hex);
  const shade = (dl,ds) => { const [r,gg,b] = hslToRgb(h, clamp(s+(ds||0),0,1), clamp(l+dl,0,1)); return rgbToHex(r,gg,b); };
  g.fillStyle = hex; g.fillRect(0,0,320,320);
  if(pattern === "denim" || pattern === "weave"){
    g.globalAlpha = .16;
    for(let i=-320;i<320;i+=3){ g.strokeStyle = i%6 ? shade(-.14) : shade(.12); g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(i,0); g.lineTo(i+320,320); g.stroke(); }
    g.globalAlpha = 1;
  } else if(pattern === "twill"){
    g.globalAlpha = .12;
    for(let i=-320;i<640;i+=7){ g.strokeStyle = shade(-.16); g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(i,0); g.lineTo(i-320,320); g.stroke(); }
    g.globalAlpha = 1;
  } else if(pattern === "grain"){
    g.globalAlpha = .10;
    for(let i=0;i<2400;i++){ g.fillStyle = Math.random()>.5 ? shade(.16) : shade(-.16);
      g.fillRect(Math.random()*320, Math.random()*320, 2.4, 1.4); }
    g.globalAlpha = 1;
  } else {
    g.globalAlpha = .07;
    for(let i=0;i<320;i+=2){ g.fillStyle = i%4 ? shade(-.1) : shade(.08); g.fillRect(0,i,320,1); }
    g.globalAlpha = 1;
  }
  if(!withIcon) return c.toDataURL("image/jpeg", .86);
  /* faint flat-lay silhouette so the grid reads as garments, not paint chips */
  g.save(); g.translate(160,160); g.scale(1.18,1.18);
  g.strokeStyle = l > .55 ? "rgba(20,22,30,.30)" : "rgba(255,255,255,.34)";
  g.lineWidth = 3.4; g.lineJoin = "round"; g.lineCap = "round";
  const P = new Path2D(SILHOUETTE[cat] || SILHOUETTE.top);
  g.stroke(P); g.restore();
  return c.toDataURL("image/jpeg", .88);
}
function hslToRgb(h,s,l){
  h = ((h%360)+360)%360/360;
  if(s===0){ const v = l*255; return [v,v,v]; }
  const q = l < .5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
  const f = t => { t = (t+1)%1;
    if(t < 1/6) return p + (q-p)*6*t;
    if(t < 1/2) return q;
    if(t < 2/3) return p + (q-p)*(2/3-t)*6;
    return p; };
  return [f(h+1/3)*255, f(h)*255, f(h-1/3)*255];
}
const SILHOUETTE = {
  top:"M-34-52 -62-38 -52-14 -34-22 -34 54 34 54 34-22 52-14 62-38 34-52a14 14 0 0 1-68 0Z",
  bottom:"M-30-56 30-56 36 8 30 58 6 58 0 6 -6 58 -30 58 -36 8Z",
  dress:"M-26-54 -48-40 -38-18 -24-26 -44 54 44 54 24-26 38-18 48-40 26-54a12 12 0 0 1-52 0Z",
  outerwear:"M-32-52 -62-36 -52-10 -34-20 -34 56 34 56 34-20 52-10 62-36 32-52 0-40Z M0-40 0 56",
  shoes:"M-52 26 -52-6c0-10 10-16 20-12L6 4c14 6 40 6 46 14 4 6 2 10-6 10Z",
  headwear:"M-46 22c0-6 8-10 18-12-6-8-8-18-8-26 0-20 16-32 36-32s36 12 36 32c0 8-2 18-8 26 10 2 18 6 18 12 0 6-40 10-46 10s-46-4-46-10Z",
  bag:"M-34-14 34-14 44 46 -44 46Z M-18-14c0-18 6-30 18-30s18 12 18 30",
  accessory:"M-8-46 8-46 14-30 0-16 -14-30Z M0-16 10 30 0 50 -10 30Z"
};
function sampleItem(name, cat, sub, hex, pattern, extra){
  const info = subtypeInfo(cat, sub);
  return Object.assign({
    id:"s_" + name.toLowerCase().replace(/\W+/g,"_"), name, cat, sub,
    colour:hex, colourName:colourName(hex), fabric:"", brand:"",
    formality:info.f, warmth:info.w,
    photo:weaveSwatch(hex, cat, pattern, true), swatch:weaveSwatch(hex, cat, pattern, false),
    notes:"", timesWorn:0, lastWorn:0, added:0, sample:true
  }, extra || {});
}
function buildSamples(){
  return [
    sampleItem("White oxford shirt","top","Oxford shirt","#F2F1EC","weave",{fabric:"cotton"}),
    sampleItem("Grey marl tee","top","T-shirt","#9A9DA4","grain",{fabric:"cotton"}),
    sampleItem("Navy merino crew","top","Knit jumper","#25324D","weave",{fabric:"merino wool"}),
    sampleItem("Cream linen shirt","top","Linen shirt","#E6DDC8","weave",{fabric:"linen"}),
    sampleItem("Black knit polo","top","Polo shirt","#1B1B1F","weave",{fabric:"cotton knit"}),
    sampleItem("Charcoal wool trousers","bottom","Wool trousers","#3A3D45","twill",{fabric:"wool"}),
    sampleItem("Indigo jeans","bottom","Jeans","#2E4468","denim",{fabric:"denim"}),
    sampleItem("Stone chino shorts","bottom","Chino shorts","#C4B295","twill",{fabric:"cotton"}),
    sampleItem("Olive chinos","bottom","Chinos","#5C5C3C","twill",{fabric:"cotton"}),
    sampleItem("Navy blazer","outerwear","Blazer","#22304C","twill",{fabric:"wool"}),
    sampleItem("Olive chore jacket","outerwear","Chore jacket","#4E5340","twill",{fabric:"cotton canvas"}),
    sampleItem("Charcoal overcoat","outerwear","Overcoat","#33363E","grain",{fabric:"wool"}),
    sampleItem("Black derby shoes","shoes","Derby shoes","#17161A","grain",{fabric:"leather"}),
    sampleItem("White leather sneakers","shoes","Leather sneakers","#EDECE8","grain",{fabric:"leather"}),
    sampleItem("Tan chukka boots","shoes","Chukka boots","#9A6B42","grain",{fabric:"suede"}),
    sampleItem("Burgundy silk tie","accessory","Tie","#6B1F2E","weave",{fabric:"silk"})
  ];
}
