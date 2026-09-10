/* ------------------------- 4. THE FIGURE (three.js) ---------------------- */
/* Two bodies behind one set of landmarks. Without a scan it is a mannequin
   built to your measurements. With a scan it is the mesh carved out of your
   own silhouettes. Garments read the landmarks, so they fit either one:
   fitted pieces are the body's own surface pushed outward, flared pieces
   are turned from its measured radius. */

const Figure = (() => {
  let renderer, scene, camera, root, bodyG, wearG, headMesh, floorMesh;
  let yaw = 0, elev = 0.10, zoomF = 1.03, need = 3, spin = false, dirty = true, mounted = false;
  let reduceMotion = false;
  let SCAN = null;                       /* {geometry, info, meas} once built */
  const swatchCache = new Map();
  let onYaw = () => {};

  const V = (x,y,z) => new THREE.Vector3(x,y,z);
  const useScan = () => !!(SCAN && State.profile.useScan !== false);

  /* ---------------- mannequin proportions ---------------- */
  function props(pf){
    const H = pf.heightCm / 100;
    const depth = 0.68, k = 2 / (1 + depth);
    const shoulderHalf = (pf.shoulderCm / 100) / 2;
    const waistR = (pf.waistCm / 100) / (2 * Math.PI) * k;
    const hipR   = (pf.hipCm  / 100) / (2 * Math.PI) * k;
    const chestR = Math.max(waistR * 1.12, shoulderHalf * 0.80);
    return { H, depth, sh: shoulderHalf / H, ch: chestR / H, wa: waistR / H, hp: hipR / H,
             headR: 0.063, headY: 0.934 };
  }
  function profileCurve(P){
    return [[0.014,0.900],[0.033,0.862],[0.038,0.844],
            [P.sh,0.818],[P.sh*0.94,0.786],[P.ch,0.748],[P.ch*0.94,0.700],
            [P.wa,0.630],[P.wa*1.07,0.584],[P.hp,0.526],[P.hp*0.95,0.490],[0.052,0.472]];
  }
  function curveRadius(P, yf){
    const c = profileCurve(P);
    if(yf >= c[0][1]) return c[0][0];
    if(yf <= c[c.length-1][1]) return c[c.length-1][0];
    for(let i = 0; i < c.length-1; i++){
      const a = c[i], b = c[i+1];
      if(yf <= a[1] && yf >= b[1]){ const t = (a[1]-yf)/(a[1]-b[1]); return a[0] + (b[0]-a[0])*t; }
    }
    return c[0][0];
  }

  /* ---------------- the landmark set both bodies answer to ---------------- */
  function paramLandmarks(pf){
    const P = props(pf), H = P.H;
    const sx = P.sh * H * 0.92, hx = P.hp * H * 0.44;
    return {
      H, source:"mannequin", depthRatio:P.depth, P,
      headR: P.headR*H, headY: P.headY*H, headTop: P.headY*H + P.headR*H*1.17,
      neckY: 0.836*H, shoulderY: 0.812*H, chestY: 0.748*H, waistY: 0.628*H,
      hipY: 0.520*H, crotchY: 0.486*H, kneeY: 0.276*H, ankleY: 0.050*H,
      elbowY: 0.612*H, wristY: 0.462*H, footHalf: 0.026*H,
      torsoR: y => curveRadius(P, y/H) * H,
      maxR:   y => curveRadius(P, y/H) * H,
      shoulder: s => V(sx*s, 0.812*H, 0),
      elbow:    s => V((sx + 0.014*H)*s, 0.612*H, 0.005*H),
      wrist:    s => V((sx + 0.026*H)*s, 0.462*H, 0.012*H),
      hip:      s => V(hx*s, 0.486*H, 0),
      knee:     s => V(hx*0.94*s, 0.276*H, 0.004*H),
      ankle:    s => V(hx*0.90*s, 0.050*H, 0)
    };
  }
  function marks(){ return useScan() ? SCAN.info.L : paramLandmarks(State.profile); }
  function hemAt(L, name){
    const map = {
      waist: L.waistY, hip: L.hipY,
      thigh: L.crotchY - (L.crotchY - L.kneeY) * 0.45,
      knee:  L.kneeY, ankle: L.ankleY, floor: L.ankleY * 0.45
    };
    return map[name] !== undefined ? map[name] : L.hipY;
  }

  /* ---------------- mesh helpers ---------------- */
  function tube(a, b, rA, rB, mat, seg){
    const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
    if(len < 1e-5) return new THREE.Object3D();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rB, rA, len, seg || 20, 1, false), mat);
    m.position.copy(a).lerp(b, 0.5);
    m.quaternion.setFromUnitVectors(V(0,1,0), dir.clone().normalize());
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  function ball(p, r, mat, sc){
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 22, 16), mat);
    m.position.copy(p); if(sc) m.scale.set(sc[0], sc[1], sc[2]);
    m.castShadow = true; m.receiveShadow = true; return m;
  }
  function box(w,h,d,mat){ const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    m.castShadow = true; m.receiveShadow = true; return m; }
  function ring(R, r, mat){ const m = new THREE.Mesh(new THREE.TorusGeometry(R, r, 10, 34), mat);
    m.rotation.x = Math.PI/2; m.castShadow = true; return m; }

  /* a surface of revolution from the body's own measured radius */
  function lathe(L, yLo, yHi, t, flare, mat, cap){
    const N = 26, pts = [];
    if(yHi - yLo < 0.005) return new THREE.Object3D();
    if(cap) pts.push(new THREE.Vector2(0.004, yLo));
    const floorR = y => L.torsoR(Math.max(y, L.crotchY + 0.02));
    for(let i = 0; i <= N; i++){
      const y = yLo + (yHi - yLo) * i/N;
      let r = (y < L.crotchY ? floorR(y) : L.torsoR(y)) + t;
      if(flare > 1){
        const k = 1 - (y - yLo) / (yHi - yLo);
        r *= 1 + (flare - 1) * Math.pow(k, 1.8);
      }
      pts.push(new THREE.Vector2(Math.max(r, 0.012), y));
    }
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), mat);
    m.scale.z = L.depthRatio;
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  /* the scan's own surface, pushed out along its normals */
  function scanShell(L, yLo, yHi, t, sleeve){
    const src = SCAN.geometry;
    const pos = src.attributes.position.array, nrm = src.attributes.normal.array;
    const index = src.index.array;
    const map = new Int32Array(pos.length/3).fill(-1);
    const P = [], N = [], U = [], I = [];
    const armLimit = sleeve === "none" ? L.shoulderY - 0.03
                   : sleeve === "short" ? L.elbowY
                   : L.wristY;
    const ok = v => {
      const x = pos[v*3], y = pos[v*3+1];
      if(y < yLo || y > yHi) return false;
      if(sleeve !== "all" && Math.abs(x) > L.torsoR(y) * 1.05 && y < armLimit) return false;
      return true;
    };
    for(let f = 0; f < index.length; f += 3){
      const tri = [index[f], index[f+1], index[f+2]];
      if(!ok(tri[0]) || !ok(tri[1]) || !ok(tri[2])) continue;
      for(let m = 0; m < 3; m++){
        const v = tri[m];
        if(map[v] < 0){
          map[v] = P.length / 3;
          const x = pos[v*3], y = pos[v*3+1], z = pos[v*3+2];
          const nx = nrm[v*3], ny = nrm[v*3+1], nz = nrm[v*3+2];
          P.push(x + nx*t, y + ny*t, z + nz*t);
          N.push(nx, ny, nz);
          U.push((x*0.7071 + z*0.7071) / 0.26, y / 0.26);
        }
        I.push(map[v]);
      }
    }
    if(I.length < 3) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    return g;
  }
  /* fitted above the crotch, hanging as a tube below it */
  function drape(L, yLo, yHi, t, flare, sleeve, mat){
    const g = new THREE.Group();
    const split = L.crotchY + 0.012;
    const shellLo = Math.max(yLo, split);
    if(yHi > shellLo + 0.012){
      const geo = scanShell(L, shellLo, yHi, t, sleeve);
      if(geo){ const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; g.add(m); }
    }
    if(yLo < split - 0.005) g.add(lathe(L, yLo, Math.min(split + 0.03, yHi), t, flare, mat));
    return g;
  }

  /* ---------------- fabric ---------------- */
  function swatchOf(item){
    if(swatchCache.has(item.id)) return swatchCache.get(item.id);
    const p = (async () => {
      const src = item.swatch || item.photo;
      if(!src) return null;
      const url = await Store.imageURL(src);
      if(!url) return null;
      try{
        const img = await loadImage(url);
        const c = document.createElement("canvas"); c.width = c.height = 256;
        const s = Math.min(img.width, img.height) * 0.46;
        c.getContext("2d").drawImage(img, (img.width-s)/2, (img.height-s)/2, s, s, 0, 0, 256, 256);
        return c;
      }catch(e){ return null; }
    })();
    swatchCache.set(item.id, p); return p;
  }
  const ROUGH = { leather:.42, silk:.30, satin:.28, denim:.86, wool:.82, linen:.88,
                  cotton:.84, suede:.95, knit:.90, nylon:.55, velvet:.75 };
  function roughnessOf(item){
    const f = (item.fabric || "").toLowerCase();
    for(const k in ROUGH) if(f.includes(k)) return ROUGH[k];
    return item.cat === "shoes" ? .48 : .84;
  }
  function garmentMat(item, rep){
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(item.colour || "#8A8A8A"),
      roughness: roughnessOf(item), metalness: item.cat === "shoes" ? .12 : .02,
      side: THREE.DoubleSide
    });
    swatchOf(item).then(c => {
      if(!c) return;
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep || 2.6, rep || 2.6);
      t.encoding = THREE.sRGBEncoding;
      m.map = t; m.color.set("#ffffff"); m.needsUpdate = true; invalidate();
    });
    return m;
  }

  /* ---------------- selfie panorama for the mannequin head ---------------- */
  function stripAverage(img, y0, y1){
    const c = document.createElement("canvas"); c.width = 24; c.height = 8;
    const g = c.getContext("2d", { willReadFrequently:true });
    g.drawImage(img, 0, img.height*y0, img.width, img.height*(y1-y0), 0, 0, 24, 8);
    const d = g.getImageData(0,0,24,8).data;
    let r=0,gg=0,b=0;
    for(let i=0;i<d.length;i+=4){ r+=d[i]; gg+=d[i+1]; b+=d[i+2]; }
    const n = d.length/4;
    return rgbToHex(r/n, gg/n, b/n);
  }
  function featherDraw(g, img, cx, w, top, h){
    const W = g.canvas.width;
    const t = document.createElement("canvas");
    t.width = Math.ceil(w); t.height = Math.ceil(h);
    const tg = t.getContext("2d");
    const s = Math.max(w/img.width, h/img.height);
    tg.drawImage(img, (w - img.width*s)/2, (h - img.height*s)/2, img.width*s, img.height*s);
    tg.globalCompositeOperation = "destination-in";
    const gh = tg.createLinearGradient(0,0,w,0);
    gh.addColorStop(0,"rgba(0,0,0,0)"); gh.addColorStop(.20,"rgba(0,0,0,1)");
    gh.addColorStop(.80,"rgba(0,0,0,1)"); gh.addColorStop(1,"rgba(0,0,0,0)");
    tg.fillStyle = gh; tg.fillRect(0,0,w,h);
    const gv = tg.createLinearGradient(0,0,0,h);
    gv.addColorStop(0,"rgba(0,0,0,0)"); gv.addColorStop(.16,"rgba(0,0,0,1)");
    gv.addColorStop(.84,"rgba(0,0,0,1)"); gv.addColorStop(1,"rgba(0,0,0,0)");
    tg.fillStyle = gv; tg.fillRect(0,0,w,h);
    tg.globalCompositeOperation = "source-over";
    g.drawImage(t, cx - w/2, top);
    if(cx - w/2 < 0) g.drawImage(t, cx - w/2 + W, top);
    if(cx + w/2 > W) g.drawImage(t, cx - w/2 - W, top);
  }
  /* u: 0 right, 0.25 front, 0.5 left, 0.75 back */
  async function headCanvas(pf){
    const W = 1024, H = 512;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = pf.skin || "#C6A182"; g.fillRect(0,0,W,H);
    const slots = [["right",0],["front",.25],["left",.5],["back",.75]];
    const imgs = [];
    for(const [key,u] of slots){
      const ref = pf.selfies && pf.selfies[key];
      if(!ref) continue;
      const url = await Store.imageURL(ref);
      if(!url) continue;
      try{ imgs.push([key, u, await loadImage(url)]); }catch(e){}
    }
    if(!imgs.length) return null;
    const src = imgs.find(i => i[0] === "front") || imgs[0];
    g.fillStyle = stripAverage(src[2], 0.02, 0.13); g.fillRect(0, 0, W, H*0.20);
    g.fillStyle = stripAverage(src[2], 0.86, 0.99); g.fillRect(0, H*0.86, W, H*0.14);
    const zoom = pf.faceZoom || 1, off = pf.faceY || 0;
    const bandH = H * 0.74 / zoom;
    const top = H * (0.145 - off) + (H*0.74 - bandH)/2;
    for(const [, u, img] of imgs) featherDraw(g, img, u*W, W/4*1.34, top, bandH);
    return c;
  }
  /* the same panorama as a sampler, for painting a scanned head */
  async function headSampler(pf){
    const c = await headCanvas(pf);
    if(!c) return null;
    const d = c.getContext("2d", { willReadFrequently:true }).getImageData(0,0,c.width,c.height);
    return { get(u, v){
      const x = clamp(Math.round(u * (c.width-1)), 0, c.width-1);
      const y = clamp(Math.round(v * (c.height-1)), 0, c.height-1);
      const q = (y*c.width + x) * 4;
      return [d.data[q]/255, d.data[q+1]/255, d.data[q+2]/255];
    } };
  }

  /* ---------------- the body ---------------- */
  function buildScanBody(pf){
    const g = new THREE.Group();
    const flat = pf.scanPhotoSkin === false;
    const m = new THREE.Mesh(SCAN.geometry, new THREE.MeshStandardMaterial({
      color: flat ? new THREE.Color(pf.skin || "#C6A182") : new THREE.Color("#ffffff"),
      vertexColors: !flat, roughness: .88, metalness: 0, side: THREE.DoubleSide
    }));
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    return g;
  }
  function buildMannequin(pf){
    const P = props(pf), H = P.H, L = paramLandmarks(pf);
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({
      color: new THREE.Color(pf.skin || "#C6A182"), roughness:.78, metalness:0 });
    const pts = [new THREE.Vector2(0.004, 0.472*H)];
    for(let i = 0; i <= 26; i++){
      const yf = 0.472 + (0.900-0.472)*i/26;
      pts.push(new THREE.Vector2(Math.max(curveRadius(P, yf)*H, 0.006), yf*H));
    }
    const torso = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), skin);
    torso.scale.z = P.depth; torso.castShadow = true; torso.receiveShadow = true;
    g.add(torso);
    g.add(tube(V(0,0.836*H,0), V(0,0.886*H,0), 0.037*H, 0.034*H, skin));
    for(const s of [1,-1]){
      g.add(tube(L.shoulder(s), L.elbow(s), 0.032*H, 0.026*H, skin));
      g.add(tube(L.elbow(s), L.wrist(s), 0.026*H, 0.020*H, skin));
      g.add(ball(L.shoulder(s), 0.034*H, skin));
      g.add(ball(L.elbow(s), 0.026*H, skin));
      g.add(ball(L.wrist(s).add(V(0,-0.022*H,0)), 0.025*H, skin, [1,1.25,.7]));
      g.add(tube(L.hip(s), L.knee(s), 0.055*H, 0.038*H, skin));
      g.add(tube(L.knee(s), L.ankle(s), 0.038*H, 0.025*H, skin));
      g.add(ball(L.knee(s), 0.037*H, skin));
      const f = box(0.050*H, 0.030*H, 0.135*H, skin);
      f.position.set(L.ankle(s).x, 0.026*H, 0.034*H);
      g.add(f);
    }
    const head = new THREE.Mesh(new THREE.SphereGeometry(P.headR*H, 48, 34),
      new THREE.MeshStandardMaterial({ color:new THREE.Color(pf.skin||"#C6A182"), roughness:.72 }));
    head.position.y = P.headY * H;
    head.scale.set(0.96, 1.17, 0.90);
    head.castShadow = true;
    g.add(head); headMesh = head;
    headCanvas(pf).then(c => {
      if(!c || !headMesh) return;
      const t = new THREE.CanvasTexture(c);
      t.encoding = THREE.sRGBEncoding;
      t.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
      headMesh.material.map = t; headMesh.material.color.set("#ffffff");
      headMesh.material.needsUpdate = true; invalidate();
    });
    return g;
  }

  /* ---------------- garments ---------------- */
  function sleeves(g, L, info, t, mat){
    if(info.sleeve === "none") return;
    const H = L.H, short = info.sleeve === "short";
    for(const s of [1,-1]){
      const a = L.shoulder(s), b = L.elbow(s);
      const mid = short ? a.clone().lerp(b, 0.72) : b;
      g.add(tube(a.clone().add(V(0,0.010*H,0)), mid, 0.034*H + t, (short?0.028*H:0.027*H) + t, mat));
      if(!short) g.add(tube(b, L.wrist(s), 0.027*H + t, 0.022*H + t, mat));
    }
  }
  function buildTop(L, item, extraT){
    const info = subtypeInfo(item.cat, item.sub), H = L.H;
    const t = (extraT || 0) + (info.thick || 1) * 0.0055;
    const mat = garmentMat(item, 2.8);
    const g = new THREE.Group();
    const hem = hemAt(L, info.hem || "hip");
    if(useScan()){
      g.add(drape(L, hem, L.neckY, t, info.flare || 1, info.sleeve || "long", mat));
    } else {
      g.add(lathe(L, hem, L.neckY, t, 1, mat, false));
      sleeves(g, L, info, t, mat);
    }
    if(info.collar){
      const r = ring(L.torsoR(L.neckY) + t + 0.008, 0.011*H, mat);
      r.position.y = L.neckY + 0.006*H; r.scale.z = 0.9; g.add(r);
    }
    if(info.open){
      const mid = (L.neckY + Math.max(hem, L.crotchY)) / 2;
      const seam = box(0.010*H, (L.neckY - Math.max(hem, L.crotchY)) * 0.92, 0.006*H,
        new THREE.MeshStandardMaterial({ color:new THREE.Color(item.colour||"#888").multiplyScalar(0.72), roughness:.9 }));
      seam.position.set(0, mid, (L.torsoR(mid) + t) * L.depthRatio + 0.004);
      g.add(seam);
    }
    return g;
  }
  function buildBottom(L, item){
    const info = subtypeInfo(item.cat, item.sub), H = L.H;
    const t = 0.007, mat = garmentMat(item, 2.4);
    const g = new THREE.Group();
    const top = L.waistY + 0.012, hem = hemAt(L, info.len);
    if(info.flare){
      g.add(lathe(L, hem, top, t, info.flare, mat, false));
    } else if(useScan()){
      const geo = scanShell(L, hem, top, t, "all");
      if(geo){ const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; g.add(m); }
    } else {
      g.add(lathe(L, L.crotchY - 0.01, top, t, 1, mat, false));
      const k = clamp((L.kneeY - hem) / Math.max(L.kneeY - L.ankleY, 1e-4), 0, 1.18);
      for(const s of [1,-1]){
        const hip = L.hip(s), knee = L.knee(s), ank = L.ankle(s);
        const slim = info.slim ? 0.004 : 0.011;
        g.add(tube(hip.clone().add(V(0,0.02*H,0)), knee, 0.058*H + slim, 0.041*H + slim, mat));
        if(k > 0.05) g.add(tube(knee, knee.clone().lerp(ank, k), 0.041*H + slim, 0.031*H + slim, mat));
      }
    }
    const band = ring(L.torsoR(L.waistY) + t + 0.005, 0.010*H, mat);
    band.position.y = L.waistY + 0.004; band.scale.z = L.depthRatio; g.add(band);
    return g;
  }
  function buildDress(L, item){
    const info = subtypeInfo(item.cat, item.sub), H = L.H;
    const t = 0.0065, mat = garmentMat(item, 2.6);
    const g = new THREE.Group();
    const top = info.sleeve === "none" ? L.chestY + 0.04 : L.neckY;
    const hem = hemAt(L, info.len);
    if(info.trousers){
      if(useScan()){
        const geo = scanShell(L, hem, top, t, "all");
        if(geo) g.add(new THREE.Mesh(geo, mat));
      } else {
        g.add(lathe(L, L.crotchY - 0.01, top, t, 1, mat, false));
        for(const s of [1,-1]){
          g.add(tube(L.hip(s).clone().add(V(0,0.02*H,0)), L.knee(s), 0.058*H+0.011, 0.041*H+0.011, mat));
          g.add(tube(L.knee(s), L.ankle(s), 0.041*H+0.011, 0.031*H+0.011, mat));
        }
      }
    } else if(useScan()){
      g.add(drape(L, hem, top, t, info.flare || 1.3, info.sleeve || "none", mat));
    } else {
      g.add(lathe(L, hem, top, t, info.flare || 1.3, mat, false));
    }
    if(!useScan()) sleeves(g, L, info, t, mat);
    return g;
  }
  function buildShoes(L, item){
    const info = subtypeInfo(item.cat, item.sub), H = L.H;
    const mat = garmentMat(item, 1.6);
    const g = new THREE.Group();
    const fh = L.footHalf;
    for(const s of [1,-1]){
      const x = L.ankle(s).x;
      const sh = box(fh*2.2, 0.038*H, 0.150*H, mat);
      sh.position.set(x, 0.028*H, 0.036*H); g.add(sh);
      g.add(ball(V(x, 0.030*H, 0.104*H), fh*1.05, mat, [1, .85, 1.1]));
      if(info.boot){
        const topY = (info.boot > 1 ? 0.185 : 0.108) * H;
        g.add(tube(V(x, 0.046*H, 0.006*H), V(x, topY, 0), fh*1.5, fh*1.42, mat));
      }
      if(info.heel){
        const hl = box(fh*1.2, 0.046*H, 0.030*H, mat);
        hl.position.set(x, 0.024*H, -0.026*H); g.add(hl);
      }
    }
    return g;
  }
  function buildHead(L, item){
    const info = subtypeInfo(item.cat, item.sub);
    const mat = garmentMat(item, 2.0);
    const g = new THREE.Group();
    const hr = L.headR, cy = L.headTop - hr * 0.42;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(hr*1.02, hr*1.12, hr*(info.brim?1.4:1.1), 30), mat);
    crown.position.y = cy; crown.castShadow = true; g.add(crown);
    const capTop = new THREE.Mesh(new THREE.SphereGeometry(hr*1.02, 26, 14, 0, Math.PI*2, 0, Math.PI/2), mat);
    capTop.position.y = cy + hr*(info.brim?0.70:0.55); capTop.castShadow = true; g.add(capTop);
    if(info.brim){
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(hr*(1.6+info.brim*0.5), hr*(1.6+info.brim*0.5), hr*0.09, 34), mat);
      brim.position.y = cy - hr*0.70; brim.castShadow = true; g.add(brim);
    } else if(item.sub === "Baseball cap" || item.sub === "Flat cap"){
      const peak = new THREE.Mesh(new THREE.CylinderGeometry(hr*1.35, hr*1.35, hr*0.08, 26, 1, false, -0.9, 1.8), mat);
      peak.position.set(0, cy - hr*0.50, hr*0.30); peak.castShadow = true; g.add(peak);
    }
    return g;
  }
  function buildBag(L, item){
    const H = L.H, mat = garmentMat(item, 1.8), g = new THREE.Group();
    const w = L.wrist(-1);
    if(item.sub === "Clutch"){
      const b = box(0.16*H, 0.075*H, 0.022*H, mat);
      b.position.set(w.x - 0.02*H, w.y - 0.03*H, 0.05*H); b.rotation.z = 0.15; g.add(b);
    } else if(item.sub === "Backpack"){
      const b = box(0.20*H, 0.26*H, 0.085*H, mat);
      b.position.set(0, L.chestY - 0.02*H, -(L.torsoR(L.chestY)*L.depthRatio + 0.055*H)); g.add(b);
      for(const s of [1,-1]) g.add(tube(L.shoulder(s), V(s*0.06*H, L.waistY, -0.06*H), 0.010*H, 0.010*H, mat));
    } else {
      const b = box(0.17*H, 0.20*H, 0.070*H, mat);
      b.position.set(w.x - 0.045*H, w.y - 0.045*H, 0.015*H); g.add(b);
      g.add(tube(L.shoulder(-1), V(b.position.x, b.position.y + 0.10*H, b.position.z), 0.009*H, 0.009*H, mat));
    }
    return g;
  }
  /* how far out the layers already worn push the front of the chest */
  function layerZ(){
    let z = 0.006;
    if(State.outfit.top || State.outfit.dress) z += 0.008;
    if(State.outfit.outerwear){
      const it = itemById(State.outfit.outerwear);
      const info = it ? subtypeInfo(it.cat, it.sub) : null;
      z += 0.016 + ((info && info.thick) ? info.thick : 2) * 0.0055;
    }
    return z;
  }
  function buildAccessory(L, item){
    const info = subtypeInfo(item.cat, item.sub), H = L.H;
    const mat = garmentMat(item, 1.4), g = new THREE.Group();
    const lz = layerZ();
    const frontZ = y => L.torsoR(y) * L.depthRatio + 0.010 + lz;
    const chest = L.chestY - 0.02*H, neck = L.neckY;
    switch(info.shape){
      case "tie": {
        const t1 = box(0.035*H, 0.20*H, 0.008*H, mat);
        t1.position.set(0, chest - 0.03*H, frontZ(chest)); t1.rotation.x = -0.06; g.add(t1);
        const knot = box(0.030*H, 0.032*H, 0.014*H, mat);
        knot.position.set(0, neck - 0.005*H, frontZ(neck)); g.add(knot);
        const t2 = box(0.030*H, 0.075*H, 0.008*H, mat);
        t2.position.set(0, (neck + chest)/2 + 0.02*H, frontZ(neck - 0.03*H)); g.add(t2); break;
      }
      case "bow": {
        for(const s of [1,-1]){ const b = box(0.036*H, 0.026*H, 0.012*H, mat);
          b.position.set(s*0.026*H, neck, frontZ(neck)); b.rotation.z = s*0.25; g.add(b); }
        const c = box(0.014*H, 0.020*H, 0.014*H, mat); c.position.set(0, neck, frontZ(neck)); g.add(c); break;
      }
      case "pocket": { const p = box(0.045*H, 0.020*H, 0.006*H, mat);
        p.position.set(0.075*H, chest + 0.01*H, frontZ(chest)); g.add(p); break; }
      case "scarf": { const r = ring(L.torsoR(neck) + 0.016*H + lz, 0.020*H, mat);
        r.position.y = neck; r.scale.z = 0.95; g.add(r);
        const tail = box(0.055*H, 0.16*H, 0.020*H, mat);
        tail.position.set(0.03*H, chest - 0.02*H, frontZ(chest)); tail.rotation.z = 0.10; g.add(tail); break; }
      case "belt": { const r = ring(L.torsoR(L.waistY) + 0.016, 0.013*H, mat);
        r.position.y = L.waistY; r.scale.z = L.depthRatio; g.add(r);
        const bk = box(0.040*H, 0.030*H, 0.012*H,
          new THREE.MeshStandardMaterial({ color:0xd9c9a3, roughness:.35, metalness:.7 }));
        bk.position.set(0, L.waistY, L.torsoR(L.waistY) * L.depthRatio + 0.020); g.add(bk); break; }
      case "neck": { const r = ring(L.torsoR(neck) + 0.010*H + lz, 0.006*H, mat);
        r.position.y = neck - 0.025*H; r.scale.z = 0.95; r.rotation.x = Math.PI/2 - 0.35; g.add(r); break; }
      case "wrist": { const w = L.wrist(-1);
        const r = ring(0.026*H, 0.007*H, mat); r.position.copy(w); r.rotation.x = 0.25; g.add(r); break; }
      case "glasses": {
        const hr = L.headR, hy = L.headY + hr*0.10, hz = hr*0.88;
        for(const s of [1,-1]){ const l = ring(hr*0.30, hr*0.045, mat);
          l.rotation.x = 0; l.position.set(s*hr*0.34, hy, hz); g.add(l); }
        const br = box(hr*0.24, hr*0.05, hr*0.05, mat); br.position.set(0, hy + hr*0.04, hz); g.add(br);
        for(const s of [1,-1]) g.add(tube(V(s*hr*0.62, hy, hz*0.86), V(s*hr*0.90, hy, -hr*0.5), hr*0.03, hr*0.03, mat, 8));
        break; }
      case "gloves": { for(const s of [1,-1]){
          const w = L.wrist(s); g.add(ball(w.clone().add(V(0,-0.024*H,0)), 0.028*H, mat, [1,1.25,.75])); } break; }
      default: { const r = ring(L.torsoR(chest) + 0.012, 0.008*H, mat); r.position.y = chest; g.add(r); }
    }
    return g;
  }

  /* ---------------- assembly ---------------- */
  function disposeTree(o, keepGeom){
    o.traverse(n => {
      if(n.geometry && n.geometry !== keepGeom) n.geometry.dispose();
      if(n.material){ if(n.material.map) n.material.map.dispose(); n.material.dispose(); }
    });
  }
  function rebuildWear(){
    if(!scene) return;
    if(wearG){ root.remove(wearG); disposeTree(wearG); }
    wearG = new THREE.Group();
    const L = marks();
    const order = ["bottom","dress","top","outerwear","shoes","headwear","bag"];
    for(const slot of order){
      const id = State.outfit[slot]; if(!id) continue;
      const it = itemById(id); if(!it) continue;
      let g = null;
      try{
        if(slot === "top") g = buildTop(L, it, 0);
        else if(slot === "outerwear") g = buildTop(L, it, 0.014);
        else if(slot === "bottom") g = buildBottom(L, it);
        else if(slot === "dress") g = buildDress(L, it);
        else if(slot === "shoes") g = buildShoes(L, it);
        else if(slot === "headwear") g = buildHead(L, it);
        else if(slot === "bag") g = buildBag(L, it);
      }catch(e){ g = null; }
      if(g) wearG.add(g);
    }
    for(const id of (State.outfit.accessory || [])){
      const it = itemById(id); if(!it) continue;
      try{ wearG.add(buildAccessory(L, it)); }catch(e){}
    }
    root.add(wearG);
    invalidate();
  }
  function rebuildBody(){
    if(!scene) return;
    if(bodyG){ root.remove(bodyG); disposeTree(bodyG, SCAN ? SCAN.geometry : null); }
    headMesh = null;
    bodyG = useScan() ? buildScanBody(State.profile) : buildMannequin(State.profile);
    root.add(bodyG);
    frame();
    invalidate();
  }

  /* ---------------- scene ---------------- */
  function mount(container){
    if(mounted) return;
    if(typeof THREE === "undefined"){
      container.innerHTML = '<div style="display:grid;place-items:center;height:100%;padding:24px;text-align:center;color:var(--muted)">The 3D library did not load. Reload the page to try again.</div>';
      return;
    }
    reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:"high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearAlpha(0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.insertBefore(renderer.domElement, container.firstChild);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    root = new THREE.Group(); scene.add(root);

    scene.add(new THREE.HemisphereLight(0xd8e4f7, 0x36302a, 0.62));
    const key = new THREE.DirectionalLight(0xffe9c9, 1.25);
    key.position.set(1.7, 3.2, 2.6); key.castShadow = true;
    key.shadow.mapSize.set(1024,1024);
    const cam = key.shadow.camera;
    cam.left = -1.3; cam.right = 1.3; cam.top = 2.4; cam.bottom = -0.4; cam.near = .5; cam.far = 9;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbed4ff, 0.38); fill.position.set(-2.4, 1.5, 1.8); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.5); rim.position.set(-0.4, 2.0, -3.2); scene.add(rim);

    floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(6,6), new THREE.ShadowMaterial({ opacity:.30 }));
    floorMesh.rotation.x = -Math.PI/2; floorMesh.receiveShadow = true; scene.add(floorMesh);

    mounted = true;
    rebuildBody();
    rebuildWear();
    new ResizeObserver(() => resize(container)).observe(container);
    resize(container);
    tick();
  }
  function resize(container){
    if(!renderer) return;
    const w = container.clientWidth || 600, h = container.clientHeight || 600;
    renderer.setSize(w, h, false);
    camera.aspect = w/h; camera.updateProjectionMatrix();
    frame(); invalidate();
  }
  function bodyHeight(){ return useScan() ? SCAN.info.H : State.profile.heightCm/100; }
  function frame(){
    if(!camera) return;
    const H = bodyHeight();
    const vFov = camera.fov * Math.PI/180;
    const hFov = 2*Math.atan(Math.tan(vFov/2) * (camera.aspect || 1));
    need = Math.max((H*1.14) / (2*Math.tan(vFov/2)), (H*0.46) / (2*Math.tan(hFov/2)));
    place();
  }
  function place(){
    const H = bodyHeight(), ty = H*0.52, d = need * zoomF;
    camera.position.set(0, ty + d*Math.sin(elev), d*Math.cos(elev));
    camera.lookAt(0, ty, 0);
  }
  const invalidate = () => { dirty = true; };
  function tick(){
    requestAnimationFrame(tick);
    if(spin && !reduceMotion){ yaw = (yaw + 0.006) % (Math.PI*2); onYaw(deg()); dirty = true; }
    if(!dirty || !renderer) return;
    dirty = false;
    root.rotation.y = yaw;
    place();
    renderer.render(scene, camera);
  }
  const deg = () => ((yaw*180/Math.PI) % 360 + 360) % 360;
  function setDeg(d){ yaw = (d*Math.PI/180) % (Math.PI*2); onYaw(deg()); invalidate(); }
  function nudge(dx, dy){
    yaw += dx * 0.0085;
    elev = clamp(elev + dy*0.004, -0.22, 0.42);
    onYaw(deg()); invalidate();
  }
  function zoom(f){ zoomF = clamp(zoomF * f, 0.55, 2.3); invalidate(); }

  return { mount, resize, rebuildBody, rebuildWear, setDeg, nudge, zoom, invalidate, deg,
    get spin(){ return spin; }, set spin(v){ spin = v; invalidate(); },
    set onYaw(fn){ onYaw = fn; }, get mounted(){ return mounted; },
    clearSwatch(id){ swatchCache.delete(id); },
    headSampler,
    setScan(res){
      if(SCAN && SCAN.geometry && res !== SCAN) SCAN.geometry.dispose();
      SCAN = res;
      if(scene){ rebuildBody(); rebuildWear(); }
    },
    get scan(){ return SCAN; },
    hasScan(){ return !!SCAN; }
  };
})();
