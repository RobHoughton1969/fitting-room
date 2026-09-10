/* ---------------------- BODY SCAN: capture and build --------------------- */

const BODY_ANGLES = [
  { id:"front", label:"Front",      deg:"0°",   hint:"Face the camera. Arms a hand's width clear of your sides, feet apart." },
  { id:"right", label:"Right side", deg:"90°",  hint:"Turn a quarter to your left. Same spot, same stance." },
  { id:"back",  label:"Back",       deg:"180°", hint:"Another quarter turn. Back to the camera." },
  { id:"left",  label:"Left side",  deg:"270°", hint:"One more quarter. Left side to the camera." }
];
const BODY_GUIDE =
  '<rect x="96" y="14" width="108" height="372" rx="52" fill="none" stroke="rgba(224,164,88,.55)" stroke-width="2" stroke-dasharray="9 8"/>' +
  '<circle cx="150" cy="52" r="26" fill="none" stroke="rgba(224,164,88,.8)" stroke-width="2"/>' +
  '<path d="M40 380h220" stroke="rgba(224,164,88,.8)" stroke-width="2"/>' +
  '<path d="M40 20h220" stroke="rgba(224,164,88,.35)" stroke-width="2"/>';

let scanPreviews = {}, scanBusy = false, scanError = "";

function scanCfg(){
  if(!State.profile.scan) State.profile.scan = { plate:null, shots:{}, sensitivity:0.5, started:false };
  if(!State.profile.scan.shots) State.profile.scan.shots = {};
  return State.profile.scan;
}
const scanShotCount = () => Object.keys(scanCfg().shots).length;

function renderScanCard(){
  const host = $("#scanCard");
  if(!host) return;
  const cfg = scanCfg();
  const built = Figure.hasScan();
  const meas = built ? Figure.scan.info.meas : null;
  const on = built && State.profile.useScan !== false;

  if(!cfg.started && !built){
    host.innerHTML = `
      <div class="card">
        <div class="row" style="justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap">
          <div><h3>Body scan</h3>
          <p style="color:var(--muted);font-size:13.5px;margin:3px 0 0;max-width:56ch">
          Five photographs turn into a 3D body. The app cuts you out of each frame and
          carves the volume that fits all four outlines at once, so the figure has your
          width, your depth and your posture instead of a slider's guess.</p></div>
          <button class="btn pri" id="scanStart">Start a body scan</button>
        </div>
        <ol class="mono" style="margin:14px 0 0;padding-left:20px;font-size:11.5px;color:var(--muted);line-height:1.9">
          <li>PROP THE PHONE AT HIP HEIGHT, THREE PACES BACK, PLAIN WALL BEHIND YOU</li>
          <li>SHOOT THE EMPTY ROOM ONCE, THEN DO NOT MOVE THE PHONE</li>
          <li>STEP IN AND SHOOT FOUR QUARTER TURNS ON THE SAME SPOT</li>
          <li>WEAR SOMETHING CLOSE-FITTING SO THE OUTLINE IS YOURS, NOT THE COAT'S</li>
        </ol>
      </div>`;
    $("#scanStart").onclick = () => { cfg.started = true; persistProfile(); renderScanCard(); };
    return;
  }

  const plateURL = cfg.plate ? "pending" : null;
  host.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap">
        <div><h3>Body scan</h3>
          <p style="color:var(--muted);font-size:13.5px;margin:3px 0 0;max-width:56ch">
          ${built ? "Your scan is built. The mirror is using " + (on ? "it" : "the mannequin") + "."
                  : "Shoot the empty room first, then four quarter turns from the same spot."}</p></div>
        ${built ? `<div class="chips">
          <button class="chip" data-src="scan" aria-pressed="${on}">Use the scan</button>
          <button class="chip" data-src="mannequin" aria-pressed="${!on}">Use the mannequin</button>
        </div>` : ""}
      </div>

      ${meas ? `<div class="measgrid">
        ${[["Height", meas.heightCm],["Chest", meas.chestCm],["Waist", meas.waistCm],
           ["Hip", meas.hipCm],["Shoulder", meas.shoulderCm],["Inseam", meas.inseamCm]]
          .map(([k,v]) => `<div class="meas"><span class="k">${k}</span><span class="v mono">${v}<i>cm</i></span></div>`).join("")}
      </div>
      <p class="mono" style="font-size:10.5px;color:var(--muted);margin:9px 0 0">
        GIRTHS ARE ELLIPSE ESTIMATES FROM THE HULL — GOOD FOR SIZING, NOT FOR A TAILOR'S CHALK.
        <button class="btn ghost sm" id="scanToMannequin" style="margin-left:6px">Copy into the mannequin</button>
      </p>` : ""}

      <div class="angles scanrow">
        <div class="angle ${cfg.plate ? "has" : ""}">
          <div class="ph" id="platePh">${cfg.plate ? "" : '<svg class="glyph" viewBox="0 0 24 24"><use href="#i-home"/></svg>'}</div>
          <div class="cap"><span class="nm">Empty room</span><span class="deg mono">PLATE</span></div>
          <div class="acts"><button class="btn sm grow" id="shootPlate">${cfg.plate ? "Reshoot" : "Shoot"}</button></div>
        </div>
        ${BODY_ANGLES.map(a => {
          const have = !!cfg.shots[a.id];
          return `<div class="angle ${have ? "has" : ""}">
            <div class="ph" data-ph="${a.id}">${have ? "" : '<svg class="glyph" viewBox="0 0 24 24"><use href="#i-selfie"/></svg>'}</div>
            <div class="cap"><span class="nm">${a.label}</span><span class="deg mono">${a.deg}</span></div>
            <div class="acts"><button class="btn sm grow" data-bshoot="${a.id}">${have ? "Retake" : "Shoot"}</button></div>
          </div>`;
        }).join("")}
      </div>

      <div class="field" style="margin-top:14px;max-width:340px">
        <span class="flabel">Cut-out sensitivity</span>
        <div class="scaleRow">
          <input type="range" id="scanSens" min="0" max="1" step="0.02" value="${cfg.sensitivity}">
          <span class="val mono" id="scanSensV">${Math.round(cfg.sensitivity*100)}%</span>
        </div>
      </div>
      ${cfg.plate ? "" : `<p class="mono" style="font-size:10.5px;color:var(--accent);margin:8px 0 0">
        NO EMPTY-ROOM PLATE — THE CUT-OUT FALLS BACK TO EDGE MATTING AND NEEDS A PLAIN WALL.</p>`}
      ${scanError ? `<div class="notice" style="margin:14px 0 0;background:var(--bad-soft);border-color:var(--bad)">
        <svg class="ico" viewBox="0 0 24 24" style="color:var(--bad)"><use href="#i-info"/></svg><div>${esc(scanError)}</div></div>` : ""}
      <div class="row" style="margin-top:14px;gap:8px;flex-wrap:wrap">
        <button class="btn pri" id="scanBuild" ${scanBusy || scanShotCount() < 2 ? "disabled" : ""}>
          ${built ? "Rebuild the scan" : "Build the scan"}</button>
        <span class="mono" id="scanProgress" style="font-size:11px;color:var(--muted)"></span>
        ${built || scanShotCount() ? '<button class="btn ghost sm" id="scanReset" style="margin-left:auto">Discard the scan</button>' : ""}
      </div>
    </div>`;
  void plateURL;

  /* thumbnails: the cut-out where we have one, else the raw frame */
  const fill = async (el, ref, key) => {
    if(!el || !ref) return;
    const src = scanPreviews[key] || await Store.imageURL(ref);
    if(src) el.innerHTML = `<img src="${src}" alt="">`;
  };
  fill($("#platePh"), cfg.plate, "plate");
  BODY_ANGLES.forEach(a => fill(host.querySelector(`[data-ph="${a.id}"]`), cfg.shots[a.id], a.id));

  $("#shootPlate").onclick = async () => {
    const blob = await cameraSheet({
      title:"The empty room", facing:"environment", timer:true, guide:BODY_GUIDE,
      hint:"Frame the space you will stand in, head to floor. Then leave the phone exactly where it is."
    });
    if(!blob) return;
    if(cfg.plate) await Store.dropImage(cfg.plate);
    cfg.plate = await Store.putImage(blob);
    delete scanPreviews.plate;
    await persistProfile(); refreshPreviews(); renderScanCard();
  };
  host.querySelectorAll("[data-bshoot]").forEach(b => b.onclick = async () => {
    const a = BODY_ANGLES.find(x => x.id === b.dataset.bshoot);
    const blob = await cameraSheet({
      title:a.label + " — " + a.deg, facing:"environment", timer:true, guide:BODY_GUIDE, hint:a.hint });
    if(!blob) return;
    if(cfg.shots[a.id]) await Store.dropImage(cfg.shots[a.id]);
    cfg.shots[a.id] = await Store.putImage(blob);
    delete scanPreviews[a.id];
    await persistProfile(); refreshPreviews(); renderScanCard();
  });
  const sens = $("#scanSens");
  sens.oninput = () => { $("#scanSensV").textContent = Math.round(sens.value*100) + "%"; };
  sens.onchange = () => { cfg.sensitivity = +sens.value; persistProfile(); refreshPreviews(); };
  $("#scanBuild").onclick = buildScan;
  const reset = $("#scanReset");
  if(reset) reset.onclick = discardScan;
  host.querySelectorAll("[data-src]").forEach(b => b.onclick = () => {
    State.profile.useScan = b.dataset.src === "scan";
    persistProfile(); Figure.rebuildBody(); Figure.rebuildWear(); renderScanCard(); updateCounts();
  });
  const copy = $("#scanToMannequin");
  if(copy) copy.onclick = () => {
    const m = Figure.scan.info.meas;
    State.profile.heightCm = clamp(m.heightCm, 140, 205);
    State.profile.shoulderCm = clamp(m.shoulderCm, 32, 58);
    State.profile.waistCm = clamp(m.waistCm, 55, 135);
    State.profile.hipCm = clamp(m.hipCm, 65, 145);
    persistProfile(); renderBodyControls(); renderTune();
    toast("Measurements copied to the mannequin");
  };
}

/* cut-outs for the capture cards, so bad mattes are visible before building */
let previewJob = 0;
async function refreshPreviews(){
  const cfg = scanCfg(), job = ++previewJob;
  for(const a of BODY_ANGLES){
    if(!cfg.shots[a.id]) continue;
    try{
      const url = await Scan.previewOne(cfg.shots[a.id], cfg.plate, cfg.sensitivity);
      if(job !== previewJob) return;
      if(url){
        scanPreviews[a.id] = url;
        const el = document.querySelector(`[data-ph="${a.id}"]`);
        if(el) el.innerHTML = `<img src="${url}" alt="Cut-out of the ${a.label} frame">`;
      }
    }catch(e){}
  }
}

async function buildScan(){
  const cfg = scanCfg();
  scanBusy = true; scanError = "";
  const btn = $("#scanBuild"), prog = $("#scanProgress");
  if(btn) btn.disabled = true;
  const say = m => { if(prog) prog.textContent = m.toUpperCase(); };
  try{
    const headTex = await Figure.headSampler(State.profile);
    const res = await Scan.build({
      plate: cfg.plate, shots: cfg.shots, sensitivity: cfg.sensitivity,
      heightCm: State.profile.heightCm, headTex
    }, say);
    scanBusy = false;
    if(!res.ok){ scanError = res.error; renderScanCard(); return; }
    Figure.setScan(res);
    State.profile.useScan = true;
    Object.assign(scanPreviews, res.previews || {});
    await persistProfile();
    say("");
    renderScanCard(); updateCounts();
    toast("Scan built from " + res.vertices.toLocaleString() + " points");
    go("mirror");
  }catch(e){
    scanBusy = false;
    scanError = "The scan could not be built here. " + (e && e.message ? e.message : "");
    renderScanCard();
  }
}
async function discardScan(){
  const cfg = scanCfg();
  for(const k of Object.keys(cfg.shots)) await Store.dropImage(cfg.shots[k]);
  if(cfg.plate) await Store.dropImage(cfg.plate);
  State.profile.scan = { plate:null, shots:{}, sensitivity:0.5, started:false };
  State.profile.useScan = false;
  scanPreviews = {}; scanError = "";
  Figure.setScan(null);
  await persistProfile();
  renderScanCard(); renderTune(); updateCounts();
}
/* rebuilt from the stored photographs on every load — the mesh itself is not kept */
async function restoreScan(){
  const cfg = State.profile.scan;
  if(!cfg || !cfg.shots || Object.keys(cfg.shots).length < 2) return;
  const host = $("#scanCard");
  if(host) host.innerHTML = `<div class="card"><h3>Body scan</h3>
    <p class="mono" style="font-size:11px;color:var(--muted);margin:8px 0 0">REBUILDING FROM YOUR PHOTOGRAPHS…</p></div>`;
  try{
    const headTex = await Figure.headSampler(State.profile);
    const res = await Scan.build({
      plate: cfg.plate, shots: cfg.shots, sensitivity: cfg.sensitivity,
      heightCm: State.profile.heightCm, headTex
    }, () => {});
    if(res.ok){
      Figure.setScan(res);
      Object.assign(scanPreviews, res.previews || {});
    } else { scanError = res.error; }
  }catch(e){ scanError = "The stored scan could not be rebuilt."; }
  renderScanCard(); renderTune(); updateCounts();
}
