/* --------------------------- mirror interaction -------------------------- */
const stage = $("#stage");
let dragging = false, lastX = 0, lastY = 0, pid = null;
stage.addEventListener("pointerdown", e => {
  if(e.target.closest(".stagetools")) return;
  dragging = true; pid = e.pointerId; lastX = e.clientX; lastY = e.clientY;
  stage.classList.add("drag"); stage.setPointerCapture(pid);
});
stage.addEventListener("pointermove", e => {
  if(!dragging || e.pointerId !== pid) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  Figure.nudge(stage.classList.contains("mirrored") ? -dx : dx, dy);
});
const endDrag = e => {
  if(!dragging) return;
  dragging = false; stage.classList.remove("drag");
  try{ stage.releasePointerCapture(pid); }catch(err){}
};
stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", endDrag);
stage.addEventListener("wheel", e => { e.preventDefault(); Figure.zoom(e.deltaY > 0 ? 1.06 : 0.94); }, { passive:false });

let pinchStart = 0;
stage.addEventListener("touchstart", e => {
  if(e.touches.length === 2) pinchStart = Math.hypot(
    e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
}, { passive:true });
stage.addEventListener("touchmove", e => {
  if(e.touches.length !== 2 || !pinchStart) return;
  const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  Figure.zoom(pinchStart / d); pinchStart = d;
}, { passive:true });

/* the turntable ruler — real degrees, anchored to the four faces */
const RULER_ANCHORS = { 0:"FRONT", 90:"RIGHT", 180:"BACK", 270:"LEFT" };
(function buildRuler(){
  const t = $("#rtrack");
  let h = "";
  for(let d = 0; d < 360; d += 5){
    const maj = d % 45 === 0;
    h += `<i class="rtick${maj ? " maj" : ""}" style="left:${d/360*100}%;height:${maj ? 15 : 7}px"></i>`;
    if(d % 45 === 0){
      const lab = RULER_ANCHORS[d] || (d + "°");
      const pos = d === 0 ? "left:3px;transform:none" : `left:${d/360*100}%`;
      h += `<span class="rlab" style="${pos}">${lab}</span>`;
    }
  }
  t.innerHTML = h;
})();
function paintRuler(d){
  const pct = d/360*100;
  $("#rhead").style.left = pct + "%";
  const read = $("#rread");
  read.style.left = clamp(pct, 12, 88) + "%";
  const near = Object.keys(RULER_ANCHORS).find(k => Math.abs(((d - +k + 540) % 360) - 180) < 8);
  read.textContent = Math.round(d) + "°" + (near !== undefined ? " " + RULER_ANCHORS[near] : "");
  const r = $("#ruler");
  r.setAttribute("aria-valuenow", Math.round(d));
  r.setAttribute("aria-valuetext", Math.round(d) + " degrees" + (near !== undefined ? ", " + RULER_ANCHORS[near].toLowerCase() : ""));
}
Figure.onYaw = paintRuler;
const ruler = $("#ruler");
function rulerFromEvent(e){
  const r = ruler.getBoundingClientRect();
  Figure.setDeg(clamp((e.clientX - r.left)/r.width, 0, .9999) * 360);
}
let rDrag = false;
ruler.addEventListener("pointerdown", e => { rDrag = true; ruler.setPointerCapture(e.pointerId); rulerFromEvent(e); });
ruler.addEventListener("pointermove", e => { if(rDrag) rulerFromEvent(e); });
ruler.addEventListener("pointerup", e => { rDrag = false; try{ ruler.releasePointerCapture(e.pointerId); }catch(err){} });
ruler.addEventListener("keydown", e => {
  const step = e.shiftKey ? 45 : 5;
  if(e.key === "ArrowRight"){ Figure.setDeg((Figure.deg() + step) % 360); e.preventDefault(); }
  if(e.key === "ArrowLeft"){ Figure.setDeg((Figure.deg() - step + 360) % 360); e.preventDefault(); }
  if(e.key === "Home"){ Figure.setDeg(0); e.preventDefault(); }
});

$("#spinBtn").addEventListener("click", e => {
  Figure.spin = !Figure.spin;
  e.currentTarget.setAttribute("aria-pressed", String(Figure.spin));
});
$("#flipBtn").addEventListener("click", e => {
  const on = !stage.classList.contains("mirrored");
  stage.classList.toggle("mirrored", on);
  e.currentTarget.setAttribute("aria-pressed", String(on));
  $("#mirrorBadge").hidden = !on;
});
$("#frontBtn").addEventListener("click", () => Figure.setDeg(0));
$("#tuneBtn").addEventListener("click", e => {
  const on = !$("#tunePanel").classList.contains("on");
  $("#tunePanel").classList.toggle("on", on);
  e.currentTarget.setAttribute("aria-pressed", String(on));
  Figure.resize(stage);
});

const TUNE = [
  { k:"faceZoom", label:"Face size",     min:0.75, max:1.6,  step:0.01, fmt:v => "×" + (+v).toFixed(2) },
  { k:"faceY",    label:"Face position", min:-0.16, max:0.16, step:0.005, fmt:v => (v > 0 ? "+" : "") + Math.round(v*100) + "%" },
  { k:"heightCm", label:"Height",        min:140, max:205,  step:1,    fmt:v => v + " cm" }
];
function scanTuneHTML(){
  if(!Figure.hasScan()) return "";
  const on = State.profile.useScan !== false;
  const photo = State.profile.scanPhotoSkin !== false;
  return `<div class="field"><span class="flabel">Body</span><div class="chips">
      <button class="chip" data-tsrc="scan" aria-pressed="${on}">Your scan</button>
      <button class="chip" data-tsrc="mannequin" aria-pressed="${!on}">Mannequin</button></div></div>
    <div class="field"><span class="flabel">Scan surface</span><div class="chips">
      <button class="chip" data-tskin="photo" aria-pressed="${photo}">Photographs</button>
      <button class="chip" data-tskin="plain" aria-pressed="${!photo}">Plain</button></div></div>`;
}
function renderTune(){
  const host = $("#tuneControls");
  host.innerHTML = TUNE.map(f => `
    <div class="field"><span class="flabel">${f.label}</span>
      <div class="scaleRow"><input type="range" data-tk="${f.k}" min="${f.min}" max="${f.max}" step="${f.step}" value="${State.profile[f.k]}">
      <span class="val mono" data-tv="${f.k}">${f.fmt(State.profile[f.k])}</span></div></div>`).join("")
    + scanTuneHTML();
  host.querySelectorAll("[data-tk]").forEach(r => r.addEventListener("input", () => {
    const f = TUNE.find(x => x.k === r.dataset.tk);
    State.profile[f.k] = +r.value;
    host.querySelector(`[data-tv="${f.k}"]`).textContent = f.fmt(+r.value);
    syncOther("b", f.k, r.value); queueBody();
  }));
  host.querySelectorAll("[data-tsrc]").forEach(b => b.onclick = () => {
    State.profile.useScan = b.dataset.tsrc === "scan";
    persistProfile(); Figure.rebuildBody(); Figure.rebuildWear();
    renderTune(); renderScanCard(); updateCounts();
  });
  host.querySelectorAll("[data-tskin]").forEach(b => b.onclick = () => {
    State.profile.scanPhotoSkin = b.dataset.tskin === "photo";
    persistProfile(); Figure.rebuildBody(); renderTune();
  });
}
function updateStageNote(){
  const n = Object.keys(State.profile.selfies || {}).length;
  const el = $("#stageNote");
  const scanned = Figure.hasScan() && State.profile.useScan !== false;
  if(!scanned && n === 0){
    el.hidden = false;
    el.innerHTML = 'This is a mannequin, not you yet. <button class="btn sm" style="margin-top:6px" data-go="selfie">Scan your body</button>';
    el.querySelector("[data-go]").onclick = () => go("selfie");
  } else if(!scanned){
    el.hidden = false;
    el.innerHTML = 'Your face, a mannequin’s body. <button class="btn sm" style="margin-top:6px" data-go="selfie">Scan your body</button>';
    el.querySelector("[data-go]").onclick = () => go("selfie");
  } else if(!wornIds().length){
    el.hidden = false;
    el.innerHTML = 'Drag to turn. Pinch or scroll to move closer.';
  } else { el.hidden = true; }
}
function updateCounts(){
  const n = Object.keys(State.profile.selfies || {}).length;
  const set = (k, v) => $$(`[data-count="${k}"]`).forEach(e => e.textContent = v);
  set("angles", n + "/4");
  set("items", String(State.items.length));
  set("worn", String(wornIds().length));
  updateStageNote();
}

/* ------------------------- 6. THE OCCASION ENGINE ------------------------ */
const CONDITIONS = [{ id:"rain", label:"Rain" }, { id:"wind", label:"Wind" }, { id:"sun", label:"Strong sun" }];
const TIMES = [{ id:"day", label:"Daytime" }, { id:"evening", label:"Evening" }];

function desiredWarmth(t){
  if(t >= 27) return 1; if(t >= 21) return 2; if(t >= 15) return 3; if(t >= 8) return 4; return 5;
}
function scoreItem(it, occ, b){
  let s = 6 - 2.3 * Math.abs((it.formality || 3) - occ.target);
  if(occ.prefer.includes(it.sub)) s += 3.2;
  if(occ.avoid.includes(it.sub)) s -= 7;
  if(occ.banColours && occ.banColours.includes(it.colourName)) s -= 9;
  if(occ.preferColours && occ.preferColours.includes(it.colourName)) s += 1.6;
  if(["top","bottom","dress","outerwear"].includes(it.cat)){
    const dw = desiredWarmth(b.tempC);
    s -= 1.15 * Math.abs((it.warmth || 2) - dw) * (it.cat === "outerwear" ? 1.25 : 1);
  }
  const info = subtypeInfo(it.cat, it.sub);
  const fab = (it.fabric || "").toLowerCase();
  if(b.cond.includes("rain")){
    if(info.rain) s += 2.2;
    if(fab.includes("suede") || fab.includes("silk")) s -= 2.4;
  }
  if(b.cond.includes("wind") && it.cat === "outerwear") s += 0.7;
  if(b.cond.includes("sun") && it.cat === "headwear" && info.brim) s += 2.6;
  if(b.time === "evening" && (it.formality || 3) >= 4) s += 0.7;
  if(b.time === "evening" && it.sub === "Sunglasses") s -= 3;
  const since = it.lastWorn ? (Date.now() - it.lastWorn) / DAY : 999;
  if(since < 3) s -= 1.9; else if(since > 21) s += 0.7;
  return s;
}
function harmony(a, b){
  if(!a || !b) return 0;
  const aN = NEUTRALS.has(a.colourName), bN = NEUTRALS.has(b.colourName);
  if(aN && bN) return 1.0;
  if(aN || bN) return 1.4;
  const A = hexToHsl(a.colour), B = hexToHsl(b.colour);
  let d = Math.abs(A[0] - B[0]); if(d > 180) d = 360 - d;
  if(d < 26) return 0.9;
  if(d > 142) return 0.3;
  return -1.3;
}
function ranked(cat, occ, b){
  return State.items.filter(i => i.cat === cat)
    .map(it => ({ it, s: scoreItem(it, occ, b) }))
    .sort((x, y) => y.s - x.s);
}
function recommend(){
  const b = State.brief;
  const occ = OCCASIONS.find(o => o.id === b.occasion) || OCCASIONS[2];
  const tops = ranked("top", occ, b), bottoms = ranked("bottom", occ, b),
        dresses = ranked("dress", occ, b), shoes = ranked("shoes", occ, b),
        outers = ranked("outerwear", occ, b), accs = ranked("accessory", occ, b),
        hats = ranked("headwear", occ, b), bags = ranked("bag", occ, b);
  const bases = [];
  for(const t of tops.slice(0,6))
    for(const bt of bottoms.slice(0,6))
      bases.push({ top:t, bottom:bt, s: t.s + bt.s + harmony(t.it, bt.it) });
  for(const d of dresses.slice(0,4)) bases.push({ dress:d, s: d.s*2 + 1.1 });
  if(!bases.length) return { occ, looks:[], missing:true };

  const cands = [];
  for(const base of bases){
    const anchor = (base.dress || base.top).it;
    if(shoes.length){
      for(const sh of shoes.slice(0,4))
        cands.push(Object.assign({}, base, { shoes:sh, s: base.s + sh.s + harmony(sh.it, anchor)*0.6 }));
    } else cands.push(Object.assign({}, base, { s: base.s - 1 }));
  }
  cands.sort((x,y) => y.s - x.s);

  const dw = desiredWarmth(b.tempC);
  const wantOuter = !occ.noJacket && (dw >= 3 || occ.wantsJacket || b.cond.includes("rain") || b.cond.includes("wind"));
  const chosen = [];
  for(const c of cands){
    const ids = [c.top && c.top.it.id, c.bottom && c.bottom.it.id, c.dress && c.dress.it.id, c.shoes && c.shoes.it.id].filter(Boolean);
    if(chosen.some(p => p.ids.filter(x => ids.includes(x)).length >= 2)) continue;
    c.ids = ids;
    if(wantOuter && outers.length && outers[0].s > -3){
      const pick = outers.find(o => !chosen.some(p => p.outer && p.outer.it.id === o.it.id)) || outers[0];
      if(pick.s > -3){ c.outer = pick; c.ids.push(pick.it.id); }
    }
    const wantAcc = occ.target >= 3.5 ? 2 : 1;
    c.accs = accs.filter(a => a.s > 1.6).slice(0, wantAcc);
    if(b.cond.includes("sun") || dw >= 4){
      const hat = hats.find(h => h.s > 1.4);
      if(hat) c.hat = hat;
    }
    const bag = bags.find(g => g.s > 1.8);
    if(bag && occ.target >= 3) c.bag = bag;
    chosen.push(c);
    if(chosen.length === 3) break;
  }
  return { occ, looks: chosen.map(c => decorate(c, occ, b)), missing:false };
}
function decorate(c, occ, b){
  const pieces = [];
  const push = (role, e) => { if(e) pieces.push({ role, it:e.it, s:e.s }); };
  push("Dress", c.dress); push("Top", c.top); push("Bottom", c.bottom);
  push("Outer", c.outer); push("Shoes", c.shoes); push("Hat", c.hat); push("Bag", c.bag);
  (c.accs || []).forEach(a => push("Accessory", a));
  const core = pieces.filter(p => ["Dress","Top","Bottom","Outer","Shoes"].includes(p.role));
  const f = core.reduce((n,p) => n + (p.it.formality || 3), 0) / Math.max(core.length,1);
  const reasons = [];
  const dw = desiredWarmth(b.tempC);

  reasons.push({ t:"Formality", s:`Averages ${f.toFixed(1)} out of 5. ${occ.label} sits around ${occ.target}.` });
  const hits = pieces.filter(p => occ.prefer.includes(p.it.sub)).map(p => p.it.name);
  if(hits.length) reasons.push({ t:"Fit", s:`${hits.slice(0,2).join(" and ")} ${hits.length > 1 ? "are" : "is"} squarely what this asks for.` });
  const warm = c.outer ? c.outer.it : null;
  reasons.push({ t:"Weather", s: warm
    ? `${b.tempC} °C, so the ${warm.name} goes over the top.`
    : (dw <= 2 ? `${b.tempC} °C — nothing heavier than it needs.` : `${b.tempC} °C, and nothing you own layers over this well.`) });
  const two = core.filter(p => p.role !== "Shoes").slice(0,2);
  if(two.length === 2){
    const h = harmony(two[0].it, two[1].it);
    const same = two[0].it.colourName === two[1].it.colourName;
    reasons.push({ t:"Colour", s: same
      ? `${two[0].it.colourName} on ${two[0].it.colourName} — tonal, so let the shoes carry the contrast.`
      : h >= 1.0 ? `${two[0].it.colourName} with ${two[1].it.colourName} — neither is trying to win.`
      : h > 0 ? `${two[0].it.colourName} against ${two[1].it.colourName} reads as a deliberate pairing.`
      : `${two[0].it.colourName} and ${two[1].it.colourName} fight a little. Swap one if it bothers you.`,
      warn: h < 0 });
  }
  if(occ.banColours){
    const slip = pieces.find(p => occ.banColours.includes(p.it.colourName));
    reasons.push(slip
      ? { t:"Rule", s:`The ${slip.it.name} is ${slip.it.colourName}. ${occ.banReason} Swap it if you can.`, warn:true }
      : { t:"Rule", s:`Nothing ${occ.banColours[0]} in it. ${occ.banReason}` });
  }
  if(b.cond.includes("rain")){
    const dry = pieces.find(p => subtypeInfo(p.it.cat, p.it.sub).rain);
    reasons.push({ t:"Rain", s: dry ? `The ${dry.it.name} handles the wet.` : `Nothing here is properly waterproof. Take an umbrella.`, warn: !dry });
  }
  const rested = pieces.filter(p => !p.it.lastWorn || (Date.now() - p.it.lastWorn) > 21*DAY);
  if(rested.length >= 2) reasons.push({ t:"Rotation", s:`${rested.length} of these have been sitting unworn.` });
  const weak = pieces.find(p => p.s < -2);
  if(weak) reasons.push({ t:"Caution", s:`The ${weak.it.name} is the weak link — it's the only ${CAT_BY_ID[weak.it.cat].one.toLowerCase()} you have that fits.`, warn:true });
  /* the same divisor for every look, so the meter agrees with the ranking */
  const fit = clamp(Math.round(48 + (c.s / 3) * 5.4), 10, 97);
  return { pieces, reasons, fit, formality:f, ids:c.ids || [] };
}

function renderOccasionForm(){
  $("#occChips").innerHTML = OCCASIONS.map(o =>
    `<button class="chip" data-occ="${o.id}" aria-pressed="${State.brief.occasion === o.id}">${esc(o.label)}</button>`).join("");
  $("#occChips").querySelectorAll("[data-occ]").forEach(b => b.onclick = () => {
    State.brief.occasion = b.dataset.occ; renderOccasionForm(); renderLooks();
  });
  $("#condChips").innerHTML = CONDITIONS.map(c =>
    `<button class="chip" data-cond="${c.id}" aria-pressed="${State.brief.cond.includes(c.id)}">${esc(c.label)}</button>`).join("");
  $("#condChips").querySelectorAll("[data-cond]").forEach(b => b.onclick = () => {
    const id = b.dataset.cond;
    State.brief.cond = State.brief.cond.includes(id) ? State.brief.cond.filter(x => x !== id) : State.brief.cond.concat(id);
    renderOccasionForm(); renderLooks();
  });
  $("#timeChips").innerHTML = TIMES.map(t =>
    `<button class="chip" data-time="${t.id}" aria-pressed="${State.brief.time === t.id}">${esc(t.label)}</button>`).join("");
  $("#timeChips").querySelectorAll("[data-time]").forEach(b => b.onclick = () => {
    State.brief.time = b.dataset.time; renderOccasionForm(); renderLooks();
  });
  $("#tempRange").value = State.brief.tempC;
  $("#tempVal").textContent = State.brief.tempC + " °C";
}
$("#tempRange").addEventListener("input", e => {
  State.brief.tempC = +e.target.value;
  $("#tempVal").textContent = e.target.value + " °C";
});
$("#tempRange").addEventListener("change", renderLooks);
$("#recBtn").addEventListener("click", renderLooks);

const ORDINAL = ["First choice","Second choice","Third choice"];
async function renderLooks(){
  const host = $("#looks");
  const out = recommend();
  State.looks = out.looks;
  if(out.missing || !out.looks.length){
    host.innerHTML = `<div class="empty"><h3>Not enough to work with</h3>
      <p style="margin:0">Add at least one top and one bottom, or a dress, and the picker has something to rank.</p></div>`;
    return;
  }
  host.innerHTML = out.looks.map((L, i) => `
    <article class="look">
      <div class="lookhead">
        <div><div class="rank mono">${ORDINAL[i].toUpperCase()}</div>
        <h3>${esc(L.pieces.map(p => p.it.name).slice(0,2).join(" + "))}</h3></div>
        <div style="text-align:right">
          <div class="lookfit">${L.fit}% match</div>
          <div class="meter" style="margin-top:4px"><i style="width:${L.fit}%"></i></div>
        </div>
      </div>
      <div class="lookpieces">
        ${L.pieces.map(p => `<div class="piece">
          <div class="sw"><img data-src="${esc(p.it.photo||"")}" alt=""></div>
          <div class="role">${esc(p.role)}</div>
          <div class="nm">${esc(p.it.name)}</div></div>`).join("")}
      </div>
      <div class="why"><ul>${L.reasons.map(r =>
        `<li><span class="mk${r.warn ? " warn" : ""}">${esc(r.t.toUpperCase())}</span><span>${esc(r.s)}</span></li>`).join("")}</ul></div>
      <div class="lookacts">
        <button class="btn pri sm" data-try="${i}">Try it in the mirror</button>
        <button class="btn sm" data-wore="${i}">Mark as worn today</button>
      </div>
    </article>`).join("");
  host.querySelectorAll("[data-try]").forEach(b => b.onclick = () => {
    const L = State.looks[+b.dataset.try];
    State.outfit = { accessory: [] };
    for(const p of L.pieces){
      const slot = slotOf(p.it);
      if(slot === "accessory") State.outfit.accessory.push(p.it.id);
      else State.outfit[slot] = p.it.id;
    }
    renderWearing(); renderWardrobe(); Figure.rebuildWear(); go("mirror");
  });
  host.querySelectorAll("[data-wore]").forEach(b => b.onclick = async () => {
    const L = State.looks[+b.dataset.wore];
    for(const p of L.pieces){
      const it = itemById(p.it.id); if(!it) continue;
      it.timesWorn = (it.timesWorn || 0) + 1; it.lastWorn = Date.now();
      if(!it.sample) await Store.saveItem(it);
    }
    toast("Logged. These drop down the list for a couple of weeks.");
    renderLooks(); renderWardrobe();
  });
  for(const img of host.querySelectorAll("img[data-src]")){
    const u = await Store.imageURL(img.dataset.src); if(u) img.src = u;
  }
}

/* -------------------------------- export --------------------------------- */
(async () => {
  if(!(window.claude && window.claude.use)) return;
  let dl = null;
  try{ dl = await window.claude.use("downloads"); }catch(e){}
  if(!dl) return;
  const btn = $("#exportBtn");
  btn.hidden = false;
  btn.onclick = async () => {
    const rows = State.items.map(i => ({
      name:i.name, category:i.cat, type:i.sub, colour:i.colourName, hex:i.colour,
      fabric:i.fabric, formality:i.formality, warmth:i.warmth, timesWorn:i.timesWorn || 0,
      lastWorn: i.lastWorn ? new Date(i.lastWorn).toISOString().slice(0,10) : null, notes:i.notes
    }));
    try{
      await dl.save({ filename:"wardrobe-inventory.json",
        data: JSON.stringify({ exported:new Date().toISOString(), count:rows.length, items:rows }, null, 2) });
    }catch(e){ toast("Export was declined."); }
  };
})();

/* --------------------------------- boot ---------------------------------- */
function setStorageChip(){
  const map = {
    pending: ["", "Opening wardrobe…"],
    cloud:   ["on", "Saved to this artifact"],
    local:   ["local", "Saved on this device"],
    none:    ["local", "Storage blocked"]
  };
  const [cls, txt] = map[Store.mode] || map.pending;
  for(const id of ["storechip","storechip2"]){
    const chip = $("#" + id); if(!chip) continue;
    chip.querySelector(".dot").className = "dot " + cls;
  }
  $("#storetext").textContent = txt;
  $("#storetext2").textContent = txt;
}

function firstOutfitFromSamples(){
  const pick = n => (State.items.find(i => i.name === n) || {}).id;
  return { top: pick("White oxford shirt"), bottom: pick("Charcoal wool trousers"),
           outerwear: pick("Navy blazer"), shoes: pick("Black derby shoes"),
           accessory: [pick("Burgundy silk tie")].filter(Boolean) };
}

(function boot(){
  State.items = buildSamples();
  State.usingSamples = true;
  State.outfit = firstOutfitFromSamples();
  renderFilters(); renderOccasionForm(); renderBodyControls(); renderTune();
  renderAngles(); renderScanCard(); renderSampleNotice(); renderWardrobe(); renderWearing(); renderLooks();
  paintRuler(0);
  go("mirror");
  setStorageChip();

  Store.init().then(async () => {
    setStorageChip();
    try{
      const p = await Store.getProfile();
      if(p) State.profile = Object.assign({}, DEFAULT_PROFILE, p, { selfies: p.selfies || {} });
      const items = await Store.allItems();
      if(items && items.length){
        State.items = items;
        State.usingSamples = false;
        State.outfit = {};
      }
    }catch(e){}
    renderBodyControls(); renderTune(); renderAngles(); renderScanCard();
    renderSampleNotice(); renderWardrobe(); renderWearing(); renderLooks();
    Figure.rebuildBody(); Figure.rebuildWear();
    updateCounts();
    restoreScan();
  });

  if(window.claude && window.claude.use){
    window.claude.use("sample").then(async s => {
      if(!s) return;
      try{ const lim = await s.limits(); if(lim && lim.images) sampleCap = s; }catch(e){}
    }).catch(() => {});
  }
})();
