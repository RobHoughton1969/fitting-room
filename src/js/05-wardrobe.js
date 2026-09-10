/* ---------------------------- 5. INTERFACE ------------------------------- */

const VIEWS = ["selfie","wardrobe","mirror","occasion"];
function go(v){
  State.view = v;
  VIEWS.forEach(x => $("#v-" + x).classList.toggle("on", x === v));
  $$("[data-go]").forEach(b => b.setAttribute("aria-current", String(b.dataset.go === v)));
  if(v === "mirror"){
    Figure.mount($("#stage"));
    requestAnimationFrame(() => Figure.resize($("#stage")));
  }
  window.scrollTo(0, 0);
}
$$("[data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));

/* --------------------------- sheet plumbing ------------------------------ */
let sheetClose = null;
function openSheet(html, onMount){
  const box = $("#sheetBox");
  box.innerHTML = html;
  $("#sheet").classList.add("on");
  document.body.style.overflow = "hidden";
  sheetClose = () => {};
  if(onMount) onMount(box);
  const first = box.querySelector("input,select,button");
  if(first) first.focus({ preventScroll:true });
}
function closeSheet(){
  $("#sheet").classList.remove("on");
  $("#sheetBox").innerHTML = "";
  document.body.style.overflow = "";
  if(sheetClose) sheetClose();
  sheetClose = null;
}
$("#sheet").addEventListener("click", e => { if(e.target.id === "sheet") closeSheet(); });
document.addEventListener("keydown", e => { if(e.key === "Escape" && $("#sheet").classList.contains("on")) closeSheet(); });

/* ------------------------------ photo input ------------------------------ */
function pickFile(capture){
  return new Promise(res => {
    const inp = $("#filePick");
    inp.value = "";
    if(capture) inp.setAttribute("capture", capture); else inp.removeAttribute("capture");
    let done = false;
    const finish = f => { if(done) return; done = true; window.removeEventListener("focus", onFocus); res(f); };
    const onFocus = () => setTimeout(() => { if(!inp.files.length) finish(null); }, 900);
    inp.addEventListener("change", () => finish(inp.files[0] || null), { once:true });
    window.addEventListener("focus", onFocus);
    inp.click();
  });
}

function cameraSheet(opts){
  return new Promise(resolve => {
    let stream = null, settled = false;
    const finish = blob => {
      if(settled) return; settled = true;
      if(stream) stream.getTracks().forEach(t => t.stop());
      closeSheet(); resolve(blob);
    };
    openSheet(`
      <div class="sheethead">
        <h3 id="sheetTitle">${esc(opts.title)}</h3>
        <button class="btn ghost sm" id="camCancel">Close</button>
      </div>
      <div id="camHolder"></div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn pri grow" id="camShoot" disabled>Take the photo</button>
        ${opts.timer ? '<button class="btn" id="camTimer" disabled>10-second timer</button>' : ""}
        <button class="btn" id="camUpload">Choose a file</button>
      </div>
      <p class="mono" style="font-size:10.5px;color:var(--muted);margin:0">${esc(opts.hint)}</p>
    `, box => {
      sheetClose = () => { if(stream) stream.getTracks().forEach(t => t.stop()); if(!settled){ settled = true; resolve(null); } };
      const holder = box.querySelector("#camHolder");
      const shoot = box.querySelector("#camShoot");
      box.querySelector("#camCancel").onclick = () => finish(null);
      box.querySelector("#camUpload").onclick = async () => {
        const f = await pickFile(opts.facing === "user" ? "user" : "environment");
        if(f) finish(await fileToJpeg(f));
      };
      const fallback = msg => {
        holder.innerHTML = `<div class="empty" style="padding:26px 18px"><h3>No camera here</h3><p style="margin:0">${esc(msg)}</p></div>`;
        shoot.disabled = true;
      };
      if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
        fallback("This browser won't hand over a camera. Choose a file instead — on a phone that opens the camera anyway.");
        return;
      }
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: opts.facing, width:{ ideal:1440 }, height:{ ideal:1920 } }, audio:false
      }).then(s => {
        if(settled){ s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        holder.innerHTML = `<div class="camwrap"><video playsinline muted autoplay></video>
          <svg class="camguide" viewBox="0 0 300 400" preserveAspectRatio="none">${opts.guide}</svg>
          <div class="camhint">${esc(opts.hint)}</div></div>`;
        const v = holder.querySelector("video");
        v.srcObject = s; v.play().catch(()=>{});
        const grab = async () => {
          const c = document.createElement("canvas");
          const w = v.videoWidth || 720, h = v.videoHeight || 960;
          const sc = Math.min(1, 1280 / Math.max(w,h));
          c.width = Math.round(w*sc); c.height = Math.round(h*sc);
          c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
          finish(await canvasToBlob(c));
        };
        shoot.disabled = false;
        shoot.onclick = grab;
        const timer = box.querySelector("#camTimer");
        if(timer){
          timer.disabled = false;
          timer.onclick = () => {
            timer.disabled = true; shoot.disabled = true;
            let n = 10;
            const hint = holder.querySelector(".camhint");
            const tickDown = () => {
              if(settled) return;
              if(hint) hint.textContent = n > 0 ? "Get into position — " + n : "Hold still";
              if(n-- <= 0){ grab(); return; }
              setTimeout(tickDown, 1000);
            };
            tickDown();
          };
        }
      }).catch(() => fallback("The camera was blocked or is in use. Choose a file instead — on a phone that opens the camera anyway."));
    });
  });
}

const FACE_GUIDE = '<ellipse cx="150" cy="165" rx="76" ry="100" fill="none" stroke="rgba(224,164,88,.85)" stroke-width="2" stroke-dasharray="7 6"/><path d="M150 265v70" stroke="rgba(224,164,88,.5)" stroke-width="2"/>';
const FLAT_GUIDE = '<rect x="34" y="70" width="232" height="260" rx="10" fill="none" stroke="rgba(224,164,88,.85)" stroke-width="2" stroke-dasharray="8 7"/>';

/* ------------------------------- selfie view ----------------------------- */
async function renderAngles(){
  const wrap = $("#angles");
  wrap.innerHTML = "";
  for(const a of ANGLES){
    const ref = State.profile.selfies && State.profile.selfies[a.id];
    const url = ref ? await Store.imageURL(ref) : null;
    const card = document.createElement("div");
    card.className = "angle" + (url ? " has" : "");
    card.innerHTML = `
      <div class="ph">${url ? `<img src="${url}" alt="${esc(a.label)} selfie">` :
        `<svg class="glyph" viewBox="0 0 24 24"><use href="#i-selfie"/></svg>`}</div>
      <div class="cap"><span class="nm">${esc(a.label)}</span><span class="deg mono">${a.deg}</span></div>
      <div class="acts">
        <button class="btn sm grow" data-shoot="${a.id}"><svg class="ico" viewBox="0 0 24 24"><use href="#i-cam"/></svg> ${url ? "Retake" : "Shoot"}</button>
        ${url ? `<button class="btn sm ghost" data-clear="${a.id}" aria-label="Remove ${esc(a.label)} photo"><svg class="ico" viewBox="0 0 24 24"><use href="#i-trash"/></svg></button>` : ""}
      </div>`;
    wrap.appendChild(card);
  }
  wrap.querySelectorAll("[data-shoot]").forEach(b => b.onclick = () => shootAngle(b.dataset.shoot));
  wrap.querySelectorAll("[data-clear]").forEach(b => b.onclick = async () => {
    const id = b.dataset.clear;
    await Store.dropImage(State.profile.selfies[id]);
    delete State.profile.selfies[id];
    await persistProfile(); renderAngles(); Figure.rebuildBody(); updateCounts();
  });
  const n = Object.keys(State.profile.selfies || {}).length;
  const note = $("#selfieNotice");
  note.innerHTML = n === 0
    ? `<div class="notice"><svg class="ico" viewBox="0 0 24 24"><use href="#i-info"/></svg><div><b>No photos yet.</b> The mannequin wears a plain head until you shoot at least the front. Four angles give the smoothest turn.</div></div>`
    : n < 4
    ? `<div class="notice"><svg class="ico" viewBox="0 0 24 24"><use href="#i-info"/></svg><div><b>${n} of 4 angles.</b> Missing angles are blended from the ones you have, so the far side goes soft. Shoot the rest when you can.</div></div>`
    : "";
  updateCounts();
}
async function shootAngle(id){
  const a = ANGLES.find(x => x.id === id);
  const blob = await cameraSheet({ title:a.label + " — " + a.deg, hint:a.hint, facing:"user", guide:FACE_GUIDE });
  if(!blob) return;
  if(State.profile.selfies[id]) await Store.dropImage(State.profile.selfies[id]);
  State.profile.selfies[id] = await Store.putImage(blob);
  if(id === "front" && !State.profile.skinPicked) await sampleSkin();
  await persistProfile();
  renderAngles(); Figure.rebuildBody();
  toast(a.label + " captured");
}
async function sampleSkin(){
  const ref = State.profile.selfies && (State.profile.selfies.front || State.profile.selfies.left || State.profile.selfies.right);
  if(!ref) return false;
  const url = await Store.imageURL(ref);
  if(!url) return false;
  try{
    const img = await loadImage(url);
    State.profile.skin = averageColour(img, [0.36, 0.40, 0.28, 0.22]);
    State.profile.skinPicked = true;
    return true;
  }catch(e){ return false; }
}

const BODY_FIELDS = [
  { k:"heightCm",   label:"Height",         min:140, max:205, unit:"cm" },
  { k:"shoulderCm", label:"Shoulder width", min:32,  max:58,  unit:"cm" },
  { k:"waistCm",    label:"Waist",          min:55,  max:135, unit:"cm" },
  { k:"hipCm",      label:"Hip",            min:65,  max:145, unit:"cm" }
];
function renderBodyControls(){
  const host = $("#bodyControls");
  host.innerHTML = BODY_FIELDS.map(f => `
    <div class="field">
      <span class="flabel">${f.label}</span>
      <div class="scaleRow">
        <input type="range" data-bk="${f.k}" min="${f.min}" max="${f.max}" step="1" value="${State.profile[f.k]}">
        <span class="val mono" data-bv="${f.k}">${State.profile[f.k]} ${f.unit}</span>
      </div>
    </div>`).join("");
  host.querySelectorAll("[data-bk]").forEach(r => {
    r.addEventListener("input", () => {
      const k = r.dataset.bk;
      State.profile[k] = +r.value;
      host.querySelector(`[data-bv="${k}"]`).textContent = r.value + " " + BODY_FIELDS.find(f => f.k === k).unit;
      syncOther("t", k, r.value); queueBody();
    });
  });
  $("#skinInput").value = State.profile.skin;
  $("#skinHex").textContent = State.profile.skin.toUpperCase();
}
/* the same measurement appears in two panels — keep them reading alike */
function syncOther(prefix, key, value){
  const slider = document.querySelector("[data-" + prefix + "k=\"" + key + "\"]");
  if(!slider) return;
  slider.value = value;
  const out = document.querySelector("[data-" + prefix + "v=\"" + key + "\"]");
  if(!out) return;
  if(prefix === "t"){
    const f = TUNE.find(x => x.k === key);
    if(f) out.textContent = f.fmt(+value);
  } else {
    const f = BODY_FIELDS.find(x => x.k === key);
    if(f) out.textContent = value + " " + f.unit;
  }
}
let bodyTimer = null;
function queueBody(){
  clearTimeout(bodyTimer);
  bodyTimer = setTimeout(() => { Figure.rebuildBody(); Figure.rebuildWear(); persistProfile(); }, 180);
}
async function persistProfile(){ try{ await Store.saveProfile(State.profile); }catch(e){} }

$("#skinInput").addEventListener("input", e => {
  State.profile.skin = e.target.value; State.profile.skinPicked = true;
  $("#skinHex").textContent = e.target.value.toUpperCase(); queueBody();
});
$("#skinFromPhoto").addEventListener("click", async () => {
  const ok = await sampleSkin();
  if(!ok){ toast("Shoot a front photo first"); return; }
  $("#skinInput").value = State.profile.skin;
  $("#skinHex").textContent = State.profile.skin.toUpperCase();
  queueBody(); toast("Skin tone taken from your photo");
});

/* ------------------------------ wardrobe view ---------------------------- */
function renderFilters(){
  const host = $("#catFilter");
  const all = [{ id:"all", label:"Everything" }].concat(CATS);
  host.innerHTML = all.map(c =>
    `<button class="chip" data-cat="${c.id}" aria-pressed="${State.filter === c.id}">${esc(c.label)}</button>`).join("");
  host.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => { State.filter = b.dataset.cat; renderFilters(); renderWardrobe(); });
}
$("#search").addEventListener("input", e => { State.query = e.target.value.toLowerCase(); renderWardrobe(); });

function visibleItems(){
  return State.items.filter(i => {
    if(State.filter !== "all" && i.cat !== State.filter) return false;
    if(!State.query) return true;
    return [i.name, i.sub, i.colourName, i.fabric, i.brand].join(" ").toLowerCase().includes(State.query);
  }).sort((a,b) => (b.added||0) - (a.added||0) || a.name.localeCompare(b.name));
}
async function renderWardrobe(){
  const grid = $("#wardrobeGrid");
  const list = visibleItems();
  if(!list.length){
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>Nothing here yet</h3>
      <p style="margin:0">Photograph a garment on a plain floor or bed. Front on, whole piece in frame.</p></div>`;
    updateCounts(); return;
  }
  grid.innerHTML = list.map(i => `
    <button class="tag" data-item="${i.id}" aria-pressed="${isWorn(i.id)}">
      <div class="sw"><span class="hole"></span>
        ${i.timesWorn ? `<span class="worn mono">${i.timesWorn}×</span>` : ""}
        <img data-src="${esc(i.photo || "")}" alt="">
      </div>
      <div class="body">
        <span class="nm">${esc(i.name)}</span>
        <span class="spec"><i class="swatchdot" style="background:${esc(i.colour)}"></i>${esc(i.sub)} · F${i.formality} · W${i.warmth}</span>
      </div>
      ${isWorn(i.id) ? '<span class="onbody"></span>' : ""}
    </button>`).join("");
  grid.querySelectorAll("[data-item]").forEach(b => b.onclick = () => itemSheet(itemById(b.dataset.item)));
  for(const img of grid.querySelectorAll("img[data-src]")){
    const u = await Store.imageURL(img.dataset.src);
    if(u) img.src = u;
  }
  updateCounts();
}
function renderSampleNotice(){
  $("#sampleNotice").innerHTML = State.usingSamples
    ? `<div class="notice"><svg class="ico" viewBox="0 0 24 24"><use href="#i-info"/></svg>
        <div><b>These are examples.</b> Sixteen stand-in garments so the mirror and the occasion picker have something to work with. They disappear the moment you add a real one.
        <button class="btn sm ghost" id="clearSamples" style="margin-top:6px">Clear the examples</button></div></div>`
    : "";
  const b = $("#clearSamples");
  if(b) b.onclick = () => { State.items = []; State.outfit = {}; State.usingSamples = false;
    renderSampleNotice(); renderWardrobe(); renderWearing(); Figure.rebuildWear(); };
}

/* -------------------------- item editor / capture ------------------------ */
let sampleCap = null;      /* resolved Claude sampling, if this viewer has it */
async function addItemFlow(){
  const blob = await cameraSheet({
    title:"Photograph the garment", facing:"environment", guide:FLAT_GUIDE,
    hint:"Lay it flat on a plain surface. Whole piece in frame, even light."
  });
  if(!blob) return;
  const draft = {
    id: uid(), name:"", cat:"top", sub:"T-shirt", colour:"#8A8A8A", colourName:"grey",
    fabric:"", brand:"", formality:1, warmth:1, notes:"", timesWorn:0, lastWorn:0,
    added: Date.now(), _blob: blob
  };
  try{
    const url = URL.createObjectURL(blob);
    const img = await loadImage(url);
    draft.colour = averageColour(img, [0.28,0.28,0.44,0.44]);
    draft.colourName = colourName(draft.colour);
    URL.revokeObjectURL(url);
  }catch(e){}
  itemSheet(draft, true);
}

function itemSheet(item, isNew){
  if(!item) return;
  const cats = CATS.map(c => `<option value="${c.id}"${c.id === item.cat ? " selected" : ""}>${esc(c.one)}</option>`).join("");
  openSheet(`
    <div class="sheethead">
      <h3 id="sheetTitle">${isNew ? "New garment" : esc(item.name || "Garment")}</h3>
      <button class="btn ghost sm" id="itClose">Close</button>
    </div>
    <img class="previewimg" id="itPhoto" alt="">
    <div id="autoRow"></div>
    <div class="field"><label for="itName">Name</label>
      <input type="text" id="itName" value="${esc(item.name)}" placeholder="Navy wool blazer"></div>
    <div class="f2">
      <div class="field"><label for="itCat">Category</label><select id="itCat">${cats}</select></div>
      <div class="field"><label for="itSub">Type</label><select id="itSub"></select></div>
    </div>
    <div class="f2">
      <div class="field"><label for="itColour">Colour</label>
        <div class="row"><input type="color" id="itColour" value="${esc(item.colour)}" style="width:44px;height:34px;padding:2px;border:1px solid var(--line);border-radius:7px;background:var(--bg)">
        <span class="mono" id="itColourName" style="font-size:11.5px;color:var(--muted)">${esc(item.colourName)}</span></div></div>
      <div class="field"><label for="itFabric">Fabric</label>
        <input type="text" id="itFabric" value="${esc(item.fabric)}" placeholder="wool, linen, denim…"></div>
    </div>
    <div class="field"><span class="flabel">Formality</span>
      <div class="scaleRow"><input type="range" id="itForm" min="1" max="5" step="1" value="${item.formality}">
      <span class="val mono" id="itFormV"></span></div></div>
    <div class="field"><span class="flabel">Warmth</span>
      <div class="scaleRow"><input type="range" id="itWarm" min="1" max="5" step="1" value="${item.warmth}">
      <span class="val mono" id="itWarmV"></span></div></div>
    <div class="field"><label for="itNotes">Notes</label>
      <textarea id="itNotes" placeholder="Needs a press. Runs small.">${esc(item.notes)}</textarea></div>
    <div class="row" style="gap:8px;flex-wrap:wrap">
      <button class="btn pri grow" id="itSave">${isNew ? "Add to wardrobe" : "Save"}</button>
      ${isNew ? "" : `<button class="btn" id="itWear">${isWorn(item.id) ? "Take off" : "Put it on"}</button>
                      <button class="btn danger" id="itDel" aria-label="Delete"><svg class="ico" viewBox="0 0 24 24"><use href="#i-trash"/></svg></button>`}
    </div>
  `, box => {
    const FORM_WORDS = ["","Knockabout","Casual","Smart casual","Business","Formal"];
    const WARM_WORDS = ["","Hot weather","Mild","Cool","Cold","Deep winter"];
    const subSel = box.querySelector("#itSub");
    const fillSubs = () => {
      const cat = box.querySelector("#itCat").value;
      subSel.innerHTML = (SUBTYPES[cat] || []).map(([n]) =>
        `<option value="${esc(n)}"${n === item.sub ? " selected" : ""}>${esc(n)}</option>`).join("");
      if(!subSel.value && subSel.options.length) subSel.selectedIndex = 0;
    };
    fillSubs();
    const showScales = () => {
      box.querySelector("#itFormV").textContent = box.querySelector("#itForm").value + " " + FORM_WORDS[+box.querySelector("#itForm").value];
      box.querySelector("#itWarmV").textContent = box.querySelector("#itWarm").value + " " + WARM_WORDS[+box.querySelector("#itWarm").value];
    };
    showScales();
    box.querySelector("#itForm").oninput = showScales;
    box.querySelector("#itWarm").oninput = showScales;
    box.querySelector("#itCat").onchange = () => {
      item.sub = ""; fillSubs();
      const inf = subtypeInfo(box.querySelector("#itCat").value, subSel.value);
      box.querySelector("#itForm").value = inf.f; box.querySelector("#itWarm").value = Math.max(1, inf.w || 1);
      showScales();
    };
    subSel.onchange = () => {
      const inf = subtypeInfo(box.querySelector("#itCat").value, subSel.value);
      box.querySelector("#itForm").value = inf.f; box.querySelector("#itWarm").value = Math.max(1, inf.w || 1);
      showScales();
      if(!box.querySelector("#itName").value) box.querySelector("#itName").value = item.colourName + " " + subSel.value.toLowerCase();
    };
    box.querySelector("#itColour").oninput = e => {
      item.colourName = colourName(e.target.value);
      box.querySelector("#itColourName").textContent = item.colourName;
    };
    box.querySelector("#itClose").onclick = closeSheet;

    const img = box.querySelector("#itPhoto");
    if(item._blob) img.src = URL.createObjectURL(item._blob);
    else Store.imageURL(item.photo).then(u => { if(u) img.src = u; });

    /* optional: let the viewer's own Claude read the photo and fill the form */
    if(sampleCap && item._blob){
      const row = box.querySelector("#autoRow");
      row.innerHTML = `<button class="btn sm" id="autoTag">Identify this with Claude</button>
        <span class="mono" id="autoMsg" style="font-size:11px;color:var(--muted);margin-left:8px"></span>`;
      row.querySelector("#autoTag").onclick = async () => {
        const btn = row.querySelector("#autoTag"), msg = row.querySelector("#autoMsg");
        btn.disabled = true; msg.textContent = "Looking…";
        try{
          const names = Object.entries(SUBTYPES).map(([c,l]) => c + ": " + l.map(x => x[0]).join(", ")).join("\n");
          const data = await sampleCap.json(
            "You are cataloguing one garment for a wardrobe app. The image shows a single item of clothing or an accessory.\n" +
            "Reply with only a JSON object: {\"name\":string,\"cat\":string,\"sub\":string,\"fabric\":string,\"formality\":1-5,\"warmth\":1-5}\n" +
            "Example: {\"name\":\"navy wool blazer\",\"cat\":\"outerwear\",\"sub\":\"Blazer\",\"fabric\":\"wool\",\"formality\":5,\"warmth\":3}\n" +
            "cat must be one of: top, bottom, dress, outerwear, shoes, headwear, bag, accessory.\n" +
            "sub must be copied exactly from the list for that category:\n" + names + "\n" +
            "formality: 1 knockabout, 3 smart casual, 5 formal. warmth: 1 hot weather, 5 deep winter.\n" +
            "name: three or four plain words, no brand guesses.",
            { images: item._blob, modelTier:"quick" });
          if(data && data.cat && SUBTYPES[data.cat]){
            box.querySelector("#itCat").value = data.cat;
            item.sub = data.sub; fillSubs();
            if(data.name) box.querySelector("#itName").value = String(data.name);
            if(data.fabric) box.querySelector("#itFabric").value = String(data.fabric);
            if(data.formality) box.querySelector("#itForm").value = clamp(+data.formality,1,5);
            if(data.warmth) box.querySelector("#itWarm").value = clamp(+data.warmth,1,5);
            showScales(); msg.textContent = "Filled in — check it over.";
          } else { msg.textContent = "Couldn't read that one."; }
        }catch(e){
          msg.textContent = e && e.code === "not_granted" ? "Not allowed on this account." : "Didn't work. Fill it in by hand.";
        }
        btn.disabled = false;
      };
    }

    box.querySelector("#itSave").onclick = async () => {
      const rec = {
        id:item.id,
        name: box.querySelector("#itName").value.trim() || (item.colourName + " " + subSel.value.toLowerCase()),
        cat: box.querySelector("#itCat").value, sub: subSel.value,
        colour: box.querySelector("#itColour").value,
        colourName: colourName(box.querySelector("#itColour").value),
        fabric: box.querySelector("#itFabric").value.trim(),
        brand: item.brand || "",
        formality: +box.querySelector("#itForm").value,
        warmth: +box.querySelector("#itWarm").value,
        notes: box.querySelector("#itNotes").value.trim(),
        timesWorn: item.timesWorn || 0, lastWorn: item.lastWorn || 0,
        added: item.added || Date.now(),
        photo: item.photo || null
      };
      const btn = box.querySelector("#itSave");
      btn.disabled = true; btn.textContent = "Saving…";
      try{
        if(item._blob) rec.photo = await Store.putImage(item._blob);
        if(State.usingSamples){ State.items = []; State.usingSamples = false; State.outfit = {}; renderSampleNotice(); }
        const ix = State.items.findIndex(i => i.id === rec.id);
        if(ix >= 0) State.items[ix] = rec; else State.items.push(rec);
        await Store.saveItem(rec);
        Figure.clearSwatch(rec.id);
        closeSheet();
        renderWardrobe(); renderWearing(); Figure.rebuildWear();
        toast(isNew ? "Added to the wardrobe" : "Saved");
      }catch(e){
        btn.disabled = false; btn.textContent = "Try again";
        toast("Couldn't save that. " + (Store.mode === "none" ? "This browser is blocking storage." : "Try once more."));
      }
    };
    const wearBtn = box.querySelector("#itWear");
    if(wearBtn) wearBtn.onclick = () => { toggleWear(item); closeSheet(); };
    const delBtn = box.querySelector("#itDel");
    if(delBtn) delBtn.onclick = async () => {
      if(delBtn.dataset.armed !== "1"){
        delBtn.dataset.armed = "1";
        delBtn.innerHTML = "Remove for good?";
        setTimeout(() => { if(delBtn.isConnected){ delBtn.dataset.armed = "0";
          delBtn.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><use href="#i-trash"/></svg>'; } }, 4000);
        return;
      }
      await Store.dropImage(item.photo);
      await Store.removeItem(item.id);
      State.items = State.items.filter(i => i.id !== item.id);
      for(const k in State.outfit){
        if(Array.isArray(State.outfit[k])) State.outfit[k] = State.outfit[k].filter(x => x !== item.id);
        else if(State.outfit[k] === item.id) delete State.outfit[k];
      }
      closeSheet(); renderWardrobe(); renderWearing(); Figure.rebuildWear(); toast("Removed");
    };
  });
}
$("#addItemBtn").addEventListener("click", addItemFlow);

/* -------------------------------- dressing ------------------------------- */
function slotOf(item){ return CAT_BY_ID[item.cat] ? CAT_BY_ID[item.cat].slot : "accessory"; }
function toggleWear(item){
  const slot = slotOf(item);
  if(slot === "accessory"){
    const list = State.outfit.accessory || [];
    State.outfit.accessory = list.includes(item.id) ? list.filter(x => x !== item.id) : list.concat(item.id);
  } else {
    State.outfit[slot] = State.outfit[slot] === item.id ? null : item.id;
    if(slot === "dress" && State.outfit[slot]){ State.outfit.top = null; State.outfit.bottom = null; }
    if((slot === "top" || slot === "bottom") && State.outfit[slot]) State.outfit.dress = null;
  }
  renderWearing(); renderWardrobe(); Figure.rebuildWear();
}
async function renderWearing(){
  const host = $("#wearing");
  const ids = wornIds();
  if(!ids.length){
    host.innerHTML = `<span class="mono" style="font-size:11px;color:var(--muted)">Nothing on. Tap Dress.</span>`;
    updateCounts(); return;
  }
  host.innerHTML = ids.map(id => {
    const it = itemById(id); if(!it) return "";
    return `<span class="wchip"><img data-src="${esc(it.photo||"")}" alt="">${esc(it.name)}
      <button class="x" data-off="${id}" aria-label="Take off ${esc(it.name)}">×</button></span>`;
  }).join("");
  host.querySelectorAll("[data-off]").forEach(b => b.onclick = () => toggleWear(itemById(b.dataset.off)));
  for(const img of host.querySelectorAll("img[data-src]")){
    const u = await Store.imageURL(img.dataset.src); if(u) img.src = u;
  }
  updateCounts();
}
function dressSheet(){
  const groups = CATS.map(c => {
    const list = State.items.filter(i => i.cat === c.id);
    if(!list.length) return "";
    return `<div class="field"><span class="flabel">${esc(c.label)}</span>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:9px">
      ${list.map(i => `<button class="tag" data-pick="${i.id}" aria-pressed="${isWorn(i.id)}">
        <div class="sw"><img data-src="${esc(i.photo||"")}" alt=""></div>
        <div class="body"><span class="nm" style="font-size:12px">${esc(i.name)}</span></div>
        ${isWorn(i.id) ? '<span class="onbody"></span>' : ""}</button>`).join("")}
      </div></div>`;
  }).join("");
  openSheet(`
    <div class="sheethead"><h3 id="sheetTitle">Dress</h3>
      <button class="btn ghost sm" id="dsClose">Done</button></div>
    ${groups || '<div class="empty"><h3>Empty wardrobe</h3><p style="margin:0">Add a garment first.</p></div>'}
  `, box => {
    box.querySelector("#dsClose").onclick = closeSheet;
    box.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => {
      toggleWear(itemById(b.dataset.pick));
      b.setAttribute("aria-pressed", String(isWorn(b.dataset.pick)));
      const bar = b.querySelector(".onbody");
      if(isWorn(b.dataset.pick)){ if(!bar){ const s = document.createElement("span"); s.className = "onbody"; b.appendChild(s); } }
      else if(bar) bar.remove();
    });
    box.querySelectorAll("img[data-src]").forEach(async img => {
      const u = await Store.imageURL(img.dataset.src); if(u) img.src = u;
    });
  });
}
$("#dressBtn").addEventListener("click", dressSheet);
$("#undressBtn").addEventListener("click", () => {
  State.outfit = {}; renderWearing(); renderWardrobe(); Figure.rebuildWear();
});
