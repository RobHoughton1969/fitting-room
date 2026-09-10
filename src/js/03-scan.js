/* ======================= BODY SCAN (shape from silhouette) ===============
   Five photographs: the empty room once, then you turning a quarter at a
   time. Each frame is matted against the empty plate, normalised to a
   common height, and used to carve a voxel volume. What survives all four
   silhouettes is your visual hull — real width, real depth, real limbs.
   A blur turns the voxels into a smooth field; surface nets pull a mesh
   out of it; the four photographs are projected back on as vertex colour.
   ======================================================================== */

const Scan = (() => {
  const MW = 128, MH = 320;             /* normalised silhouette, 1 col = 1 row in scale */
  const NX = 80, NY = 200, NZ = 80;     /* voxel grid */
  const NXY = NX * NY;

  /* ---------- pixel work ---------- */
  function workCanvas(img, maxDim){
    const s = Math.min(1, maxDim / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(2, Math.round(img.width * s));
    c.height = Math.max(2, Math.round(img.height * s));
    c.getContext("2d", { willReadFrequently:true }).drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  function pixels(c){ return c.getContext("2d", { willReadFrequently:true }).getImageData(0,0,c.width,c.height); }

  /* difference matte against the empty-room plate */
  function matteAgainstPlate(a, b, sens){
    const n = a.width * a.height, m = new Uint8Array(n);
    const thr = 62 - sens * 44;
    for(let p = 0, q = 0; p < n; p++, q += 4){
      const dr = a.data[q] - b.data[q], dg = a.data[q+1] - b.data[q+1], db = a.data[q+2] - b.data[q+2];
      const d = Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db)) * 0.62
              + Math.abs(0.299*dr + 0.587*dg + 0.114*db) * 0.38;
      m[p] = d > thr ? 1 : 0;
    }
    return m;
  }
  /* no plate: flood the border colour away and keep what is left */
  function matteFromBorder(a, sens){
    const w = a.width, h = a.height, n = w*h, m = new Uint8Array(n).fill(1);
    const tol = 26 + sens * 54;
    let r = 0, g = 0, b = 0, c = 0;
    const sample = (x,y) => { const q = (y*w+x)*4; r += a.data[q]; g += a.data[q+1]; b += a.data[q+2]; c++; };
    for(let x = 0; x < w; x += 2){ sample(x,0); sample(x,h-1); }
    for(let y = 0; y < h; y += 2){ sample(0,y); sample(w-1,y); }
    r /= c; g /= c; b /= c;
    const stack = [];
    const seen = new Uint8Array(n);
    for(let x = 0; x < w; x++){ stack.push(x, 0, x, h-1); }
    for(let y = 0; y < h; y++){ stack.push(0, y, w-1, y); }
    while(stack.length){
      const y = stack.pop(), x = stack.pop();
      if(x < 0 || y < 0 || x >= w || y >= h) continue;
      const p = y*w + x;
      if(seen[p]) continue;
      seen[p] = 1;
      const q = p*4;
      const d = Math.abs(a.data[q]-r) + Math.abs(a.data[q+1]-g) + Math.abs(a.data[q+2]-b);
      if(d > tol*3) continue;
      m[p] = 0;
      stack.push(x+1,y, x-1,y, x,y+1, x,y-1);
    }
    return m;
  }

  function erodeDilate(m, w, h, er, di){
    const pass = (src, keep) => {
      const out = new Uint8Array(src.length);
      for(let y = 1; y < h-1; y++) for(let x = 1; x < w-1; x++){
        const p = y*w + x;
        const s = src[p-1] + src[p+1] + src[p-w] + src[p+w] + src[p];
        out[p] = keep ? (s >= 5 ? 1 : 0) : (s >= 1 ? 1 : 0);
      }
      return out;
    };
    let cur = m;
    for(let i = 0; i < er; i++) cur = pass(cur, true);
    for(let i = 0; i < di; i++) cur = pass(cur, false);
    return cur;
  }
  /* keep only the biggest blob, then close any holes inside it */
  function largestBlob(m, w, h){
    const lab = new Int32Array(m.length).fill(0);
    let best = 0, bestId = 0, id = 0;
    const stack = new Int32Array(m.length);
    let sp = 0;
    for(let s = 0; s < m.length; s++){
      if(!m[s] || lab[s]) continue;
      id++; let count = 0;
      sp = 0; stack[sp++] = s;
      lab[s] = id;
      while(sp){
        const p = stack[--sp]; count++;
        const x = p % w, y = (p - x) / w;
        if(x > 0   && m[p-1] && !lab[p-1]){ lab[p-1] = id; stack[sp++] = p-1; }
        if(x < w-1 && m[p+1] && !lab[p+1]){ lab[p+1] = id; stack[sp++] = p+1; }
        if(y > 0   && m[p-w] && !lab[p-w]){ lab[p-w] = id; stack[sp++] = p-w; }
        if(y < h-1 && m[p+w] && !lab[p+w]){ lab[p+w] = id; stack[sp++] = p+w; }
      }
      if(count > best){ best = count; bestId = id; }
    }
    const out = new Uint8Array(m.length);
    for(let p = 0; p < m.length; p++) out[p] = lab[p] === bestId ? 1 : 0;
    /* flood the true outside, everything else enclosed becomes body */
    /* Mark at push time, never at pop time: a pixel then enters the stack at
       most once, so the stack cannot outgrow the image and drop work. Losing
       pushes here silently fills the gap between the legs and between arm and
       body, and the scan comes out as a slab. */
    const outside = new Uint8Array(m.length);
    const st = new Int32Array(m.length);
    let tp = 0;
    const push = p => { if(!outside[p] && !out[p]){ outside[p] = 1; st[tp++] = p; } };
    for(let x = 0; x < w; x++){ push(x); push(x + (h-1)*w); }
    for(let y = 0; y < h; y++){ push(y*w); push(y*w + w-1); }
    while(tp){
      const p = st[--tp];
      const x = p % w, y = (p - x) / w;
      if(x > 0) push(p-1);
      if(x < w-1) push(p+1);
      if(y > 0) push(p-w);
      if(y < h-1) push(p+w);
    }
    for(let p = 0; p < out.length; p++) if(!outside[p]) out[p] = 1;
    return { mask: out, area: best };
  }

  /* normalise one frame into the shared body space */
  function normalise(mask, img, w, h){
    let x0 = w, x1 = -1, y0 = h, y1 = -1;
    for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){
      if(!mask[y*w+x]) continue;
      if(x < x0) x0 = x; if(x > x1) x1 = x;
      if(y < y0) y0 = y; if(y > y1) y1 = y;
    }
    if(x1 < 0 || (y1 - y0) < h * 0.35) return null;
    const bh = y1 - y0 + 1;
    /* the turning axis: the middle of the hips, not of the whole outline */
    let ax = 0, an = 0;
    for(let y = Math.round(y0 + bh*0.50); y <= Math.round(y0 + bh*0.66); y++){
      let lo = -1, hi = -1;
      for(let x = 0; x < w; x++) if(mask[y*w+x]){ if(lo < 0) lo = x; hi = x; }
      if(lo >= 0){ ax += (lo + hi)/2; an++; }
    }
    const axis = an ? ax/an : (x0 + x1)/2;
    const sc = bh / MH;
    const out = new Uint8Array(MW*MH);
    const tex = new Uint8ClampedArray(MW*MH*4);
    const src = img.data;
    for(let v = 0; v < MH; v++){
      const sy = Math.round(y0 + v*sc);
      for(let u = 0; u < MW; u++){
        const sx = Math.round(axis + (u - MW/2)*sc);
        const d = v*MW + u;
        if(sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const p = sy*w + sx;
        out[d] = mask[p];
        const q = p*4, t = d*4;
        tex[t] = src[q]; tex[t+1] = src[q+1]; tex[t+2] = src[q+2]; tex[t+3] = 255;
      }
    }
    return { mask: out, tex, bboxH: bh, pixelHeight: bh };
  }

  async function frameFor(photoRef, plateImg, sens){
    const url = await Store.imageURL(photoRef);
    if(!url) return null;
    const img = await loadImage(url);
    const c = workCanvas(img, 340);
    const px = pixels(c);
    let m;
    if(plateImg){
      const pc = document.createElement("canvas");
      pc.width = c.width; pc.height = c.height;
      pc.getContext("2d").drawImage(plateImg, 0, 0, c.width, c.height);
      m = matteAgainstPlate(px, pixels(pc), sens);
    } else {
      m = matteFromBorder(px, sens);
    }
    m = erodeDilate(m, c.width, c.height, 1, 1);
    const blob = largestBlob(m, c.width, c.height);
    if(blob.area < c.width*c.height*0.02) return null;
    return normalise(blob.mask, px, c.width, c.height);
  }

  /* a small PNG of the cutout, for the capture screen */
  function previewURL(frame){
    const c = document.createElement("canvas");
    c.width = MW; c.height = MH;
    const g = c.getContext("2d");
    const im = g.createImageData(MW, MH);
    for(let p = 0; p < MW*MH; p++){
      const t = p*4;
      if(frame.mask[p]){
        im.data[t] = frame.tex[t]; im.data[t+1] = frame.tex[t+1];
        im.data[t+2] = frame.tex[t+2]; im.data[t+3] = 255;
      } else { im.data[t+3] = 0; }
    }
    g.putImageData(im, 0, 0);
    return c.toDataURL("image/png");
  }

  /* ---------- carve ---------- */
  const at = (f, u, v) => (u < 0 || v < 0 || u >= MW || v >= MH) ? 0 : f.mask[v*MW + u];
  function carve(frames){
    const vol = new Uint8Array(NX*NY*NZ);
    const F = frames.front, R = frames.right, B = frames.back, L = frames.left;
    for(let j = 0; j < NY; j++){
      const v = Math.round((1 - j/(NY-1)) * (MH-1));
      for(let k = 0; k < NZ; k++){
        const uz = Math.round(k/(NZ-1) * (MW-1));
        const rOK = at(R, uz, v), lOK = at(L, MW-1-uz, v);
        if(!rOK || !lOK) continue;
        for(let i = 0; i < NX; i++){
          const ux = Math.round(i/(NX-1) * (MW-1));
          if(at(F, ux, v) && at(B, MW-1-ux, v)) vol[i + j*NX + k*NXY] = 1;
        }
      }
    }
    return vol;
  }
  /* separable box blur turns the staircase into something a body-shaped */
  function blur(vol){
    const a = new Float32Array(vol.length);
    for(let p = 0; p < vol.length; p++) a[p] = vol[p];
    const b = new Float32Array(vol.length);
    /* x */
    for(let k = 0; k < NZ; k++) for(let j = 0; j < NY; j++){
      const o = j*NX + k*NXY;
      for(let i = 0; i < NX; i++){
        const l = a[o + Math.max(0,i-1)], c = a[o+i], r = a[o + Math.min(NX-1,i+1)];
        b[o+i] = (l + 2*c + r) * 0.25;
      }
    }
    /* y */
    for(let k = 0; k < NZ; k++) for(let i = 0; i < NX; i++){
      const o = i + k*NXY;
      for(let j = 0; j < NY; j++){
        const l = b[o + Math.max(0,j-1)*NX], c = b[o + j*NX], r = b[o + Math.min(NY-1,j+1)*NX];
        a[o + j*NX] = (l + 2*c + r) * 0.25;
      }
    }
    /* z */
    for(let j = 0; j < NY; j++) for(let i = 0; i < NX; i++){
      const o = i + j*NX;
      for(let k = 0; k < NZ; k++){
        const l = a[o + Math.max(0,k-1)*NXY], c = a[o + k*NXY], r = a[o + Math.min(NZ-1,k+1)*NXY];
        b[o + k*NXY] = (l + 2*c + r) * 0.25;
      }
    }
    return b;
  }

  /* ---------- surface nets ---------- */
  const CORNER = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
  const EDGE = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  function surfaceNets(field, iso){
    const cx = NX-1, cy = NY-1, cz = NZ-1;
    const cell = new Int32Array(cx*cy*cz).fill(-1);
    const pos = [], idx = [];
    const val = new Float32Array(8);
    for(let k = 0; k < cz; k++) for(let j = 0; j < cy; j++) for(let i = 0; i < cx; i++){
      let bits = 0;
      for(let c = 0; c < 8; c++){
        const C = CORNER[c];
        const v = field[(i+C[0]) + (j+C[1])*NX + (k+C[2])*NXY];
        val[c] = v;
        if(v > iso) bits |= 1 << c;
      }
      if(bits === 0 || bits === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for(let e = 0; e < 12; e++){
        const a = EDGE[e][0], b = EDGE[e][1];
        const ia = (bits >> a) & 1, ib = (bits >> b) & 1;
        if(ia === ib) continue;
        const t = (iso - val[a]) / (val[b] - val[a] || 1e-6);
        sx += CORNER[a][0] + (CORNER[b][0] - CORNER[a][0]) * t;
        sy += CORNER[a][1] + (CORNER[b][1] - CORNER[a][1]) * t;
        sz += CORNER[a][2] + (CORNER[b][2] - CORNER[a][2]) * t;
        n++;
      }
      const vi = pos.length / 3;
      pos.push(i + sx/n, j + sy/n, k + sz/n);
      cell[i + j*cx + k*cx*cy] = vi;
      const ci = i + j*cx + k*cx*cy;
      const in0 = bits & 1;
      /* quad across the x edge (corners 0,1) */
      if(((bits >> 1) & 1) !== in0 && j > 0 && k > 0){
        const q = [ci, ci - cx, ci - cx - cx*cy, ci - cx*cy];
        emit(q, in0, cell, idx);
      }
      if(((bits >> 2) & 1) !== in0 && i > 0 && k > 0){
        const q = [ci, ci - cx*cy, ci - cx*cy - 1, ci - 1];
        emit(q, in0, cell, idx);
      }
      if(((bits >> 4) & 1) !== in0 && i > 0 && j > 0){
        const q = [ci, ci - 1, ci - 1 - cx, ci - cx];
        emit(q, in0, cell, idx);
      }
    }
    return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
  }
  /* Laplacian relaxation: pulls each vertex toward its neighbours, which
     takes the voxel staircase off the surface without losing the shape */
  function relax(pos, idx, iters, amount){
    const n = pos.length / 3;
    const acc = new Float32Array(pos.length);
    const cnt = new Uint32Array(n);
    const add = (u, v) => { acc[u*3] += pos[v*3]; acc[u*3+1] += pos[v*3+1]; acc[u*3+2] += pos[v*3+2]; cnt[u]++; };
    for(let it = 0; it < iters; it++){
      acc.fill(0); cnt.fill(0);
      for(let f = 0; f < idx.length; f += 3){
        const a = idx[f], b = idx[f+1], c = idx[f+2];
        add(a,b); add(a,c); add(b,a); add(b,c); add(c,a); add(c,b);
      }
      for(let v = 0; v < n; v++){
        if(!cnt[v]) continue;
        for(let k = 0; k < 3; k++){
          const t = acc[v*3+k] / cnt[v];
          pos[v*3+k] += (t - pos[v*3+k]) * amount;
        }
      }
    }
  }
  function emit(q, flip, cell, idx){
    const a = cell[q[0]], b = cell[q[1]], c = cell[q[2]], d = cell[q[3]];
    if(a < 0 || b < 0 || c < 0 || d < 0) return;
    if(flip) idx.push(a,b,c, a,c,d);
    else idx.push(a,c,b, a,d,c);
  }

  /* ---------- landmarks and measurements ---------- */
  function analyse(vol, heightCm){
    const H = heightCm / 100;
    const cellY = H / (NY - 1);
    const spanX = (MW / MH) * H;
    const cellX = spanX / (NX - 1);
    const width = new Float32Array(NY), depth = new Float32Array(NY),
          area = new Float32Array(NY), torso = new Float32Array(NY),
          parts = new Uint8Array(NY), runsAt = [];
    let ground = -1, top = -1;
    for(let j = 0; j < NY; j++){
      let x0 = NX, x1 = -1, z0 = NZ, z1 = -1, a = 0;
      const col = new Uint8Array(NX);
      const rowRuns = [];
      for(let k = 0; k < NZ; k++) for(let i = 0; i < NX; i++){
        if(!vol[i + j*NX + k*NXY]) continue;
        a++; col[i] = 1;
        if(i < x0) x0 = i; if(i > x1) x1 = i;
        if(k < z0) z0 = k; if(k > z1) z1 = k;
      }
      if(!a) continue;
      if(ground < 0) ground = j;
      top = j;
      width[j] = (x1 - x0 + 1) * cellX;
      depth[j] = (z1 - z0 + 1) * cellX;
      area[j] = a * cellX * cellX;
      /* run lengths across x tell arms from torso */
      let runs = 0, bestLen = 0, lo = -1;
      for(let i = 0; i <= NX; i++){
        const on = i < NX && col[i];
        if(on && lo < 0) lo = i;
        if(!on && lo >= 0){
          runs++;
          rowRuns.push([lo, i-1]);
          if(i - lo > bestLen) bestLen = i - lo;
          lo = -1;
        }
      }
      parts[j] = runs;
      torso[j] = bestLen * cellX / 2;
      runsAt[j] = rowRuns;
    }
    const frac = f => clamp(Math.round(ground + (top - ground) * f), 0, NY-1);
    /* the trunk only: arms hang beside the waist and would swamp a plain width */
    const minT = (a, b) => { let bi = clamp(a,0,NY-1), bv = Infinity;
      for(let j = clamp(a,0,NY-1); j <= clamp(b,0,NY-1); j++) if(torso[j] && torso[j] < bv){ bv = torso[j]; bi = j; }
      return bi; };
    const maxT = (a, b) => { let bi = clamp(a,0,NY-1), bv = -1;
      for(let j = clamp(a,0,NY-1); j <= clamp(b,0,NY-1); j++) if(torso[j] > bv){ bv = torso[j]; bi = j; }
      return bi; };
    /* the crotch is the highest row where nothing crosses the turning axis
       any more — two legs straddling a gap. Arms never do that, so they
       cannot be mistaken for it. */
    const midCol = (NX - 1) / 2;
    const straddles = j => (runsAt[j] || []).some(r => r[0] <= midCol && r[1] >= midCol);
    let crotch = frac(0.48);
    for(let j = frac(0.58); j > frac(0.28); j--)
      if(parts[j] >= 2 && !straddles(j)){ crotch = j; break; }
    const hip = maxT(Math.max(crotch + 2, frac(0.47)), frac(0.58));
    const waist = minT(hip + 2, frac(0.70));
    const chest = maxT(frac(0.68), frac(0.79));
    const shoulder = maxT(frac(0.78), frac(0.88));
    const neck = minT(shoulder + 1, frac(0.94));
    const knee = minT(frac(0.20), frac(0.34));
    /* hands and elbows hang at settled fractions below the measured shoulder */
    const span = Math.max(top - ground, 1);
    const elbow = clamp(Math.round(shoulder - span*0.195), ground + 2, NY - 1);
    const wrist = clamp(Math.round(shoulder - span*0.355), ground + 2, NY - 1);
    /* Ramanujan's ellipse perimeter from the two half-axes */
    const girth = j => {
      const a = torso[j] || width[j]/2, b = depth[j]/2;
      if(!a || !b) return 0;
      const h = Math.pow(a-b, 2) / Math.pow(a+b, 2);
      return Math.PI * (a+b) * (1 + 3*h/(10 + Math.sqrt(4 - 3*h))) * 100;
    };
    /* signed x of each run centre, in metres from the turning axis */
    const runCentres = j => (runsAt[j] || []).map(r => ((r[0]+r[1])/2 - (NX-1)/2) * cellX);
    const outerRun = j => {
      const cs = runCentres(j);
      if(!cs.length) return null;
      return [Math.max.apply(null, cs), Math.min.apply(null, cs)];
    };
    const yOf = j => (j - ground) * cellY;
    let headR = 0;
    for(let j = Math.round(top - (top - ground)*0.11); j <= top; j++) headR = Math.max(headR, width[j]/2);
    headR = Math.max(headR, 0.06);
    const footRun = outerRun(Math.min(top, ground + 3)) || [0.09, -0.09];
    const wristRun = outerRun(wrist) || [(torso[wrist] || 0.16), -(torso[wrist] || 0.16)];
    const armAt = s => (s > 0 ? wristRun[0] : wristRun[1]);
    const depthRatio = clamp((depth[hip] || 0.2) / Math.max((torso[hip] || 0.15) * 2, 1e-3), 0.45, 1);
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const shoulderX = s => s * Math.max(torso[shoulder] * 0.9, 0.08);
    const jAt = y => clamp(Math.round(y / cellY + ground), 0, NY - 1);
    return {
      ground, top, cellY, cellX, spanX, H,
      y: yOf,
      lm: { shoulder, neck, hip, waist, chest, crotch, knee, wrist, elbow, ground, top },
      width, depth, torso, parts, area, runsAt,
      L: {
        H, source: "scan", depthRatio,
        headTop: yOf(top), headR: headR, headY: yOf(top) - headR * 1.05,
        neckY: yOf(neck), shoulderY: yOf(shoulder), chestY: yOf(chest),
        waistY: yOf(waist), hipY: yOf(hip), crotchY: yOf(crotch),
        kneeY: yOf(knee), ankleY: Math.max(yOf(ground + 4), 0.03),
        elbowY: yOf(elbow), wristY: yOf(wrist),
        torsoR: y => Math.max(torso[jAt(y)] || 0.02, 0.02),
        maxR: y => Math.max((width[jAt(y)] || 0.04) / 2, 0.02),
        shoulder: s => V3(shoulderX(s), yOf(shoulder), 0),
        elbow: s => V3(s * Math.max(Math.abs(armAt(s)), Math.abs(shoulderX(s))) * 0.98, yOf(elbow), 0.004),
        wrist: s => V3(armAt(s), yOf(wrist), 0.01),
        hip: s => V3(s * Math.max(torso[hip] * 0.45, 0.04), yOf(crotch), 0),
        knee: s => V3(s * Math.max(torso[knee] * 0.5, 0.035), yOf(knee), 0),
        ankle: s => V3(s > 0 ? footRun[0] : footRun[1], Math.max(yOf(ground + 4), 0.03), 0),
        footHalf: Math.max(Math.abs(footRun[0] - footRun[1]) / 4, 0.035)
      },
      meas: {
        heightCm,
        chestCm: Math.round(girth(chest)),
        waistCm: Math.round(girth(waist)),
        hipCm: Math.round(girth(hip)),
        shoulderCm: Math.round(torso[shoulder] * 2 * 100),
        inseamCm: Math.round((crotch - ground) * cellY * 100)
      }
    };
  }

  /* ---------- projective colour ---------- */
  function colourise(geo, frames, info, headTex){
    const n = geo.pos.length / 3;
    const col = new Float32Array(n * 3);
    const nrm = geo.normals;
    const views = [
      { f: frames.front, dir: [0,0,1],  u: (i,j,k) => Math.round(i/(NX-1)*(MW-1)) },
      { f: frames.right, dir: [-1,0,0], u: (i,j,k) => Math.round(k/(NZ-1)*(MW-1)) },
      { f: frames.back,  dir: [0,0,-1], u: (i,j,k) => MW-1 - Math.round(i/(NX-1)*(MW-1)) },
      { f: frames.left,  dir: [1,0,0],  u: (i,j,k) => MW-1 - Math.round(k/(NZ-1)*(MW-1)) }
    ];
    const neckJ = info.lm.neck;
    for(let v = 0; v < n; v++){
      const i = geo.pos[v*3], j = geo.pos[v*3+1], k = geo.pos[v*3+2];
      const nx = nrm[v*3], ny = nrm[v*3+1], nz = nrm[v*3+2];
      const row = Math.round((1 - j/(NY-1)) * (MH-1));
      let r = 0, g = 0, b = 0, w = 0;
      for(const view of views){
        const d = nx*view.dir[0] + ny*view.dir[1] + nz*view.dir[2];
        if(d <= 0.02) continue;
        const wt = Math.pow(d, 2.2);
        const u = view.u(i, j, k);
        if(u < 0 || u >= MW || row < 0 || row >= MH) continue;
        const t = (row*MW + u) * 4;
        r += view.f.tex[t] * wt; g += view.f.tex[t+1] * wt; b += view.f.tex[t+2] * wt; w += wt;
      }
      if(w < 1e-4){ col[v*3] = 0.55; col[v*3+1] = 0.52; col[v*3+2] = 0.50; continue; }
      let cr = r/w/255, cg = g/w/255, cb = b/w/255;
      if(headTex && j > neckJ){
        const blend = clamp((j - neckJ) / Math.max(6, (info.lm.top - neckJ) * 0.35), 0, 1);
        const ang = Math.atan2(k - NZ/2, -(i - NX/2));
        const uu = ((ang / (Math.PI*2)) + 1) % 1;
        const hv = clamp((info.lm.top - j) / Math.max(1, info.lm.top - neckJ), 0, 1);
        const hp = headTex.get(uu, hv);
        cr = cr*(1-blend) + hp[0]*blend; cg = cg*(1-blend) + hp[1]*blend; cb = cb*(1-blend) + hp[2]*blend;
      }
      /* to linear, so the renderer's sRGB output does not double-brighten */
      col[v*3] = Math.pow(cr, 2.2); col[v*3+1] = Math.pow(cg, 2.2); col[v*3+2] = Math.pow(cb, 2.2);
    }
    return col;
  }

  /* ---------- the build ---------- */
  async function build(cfg, report){
    /* yield so the progress line can paint — but never wait on a throttled
       timer in a hidden tab, where there is nothing to paint anyway */
    const say = s => {
      if(report) report(s);
      return document.hidden ? Promise.resolve() : new Promise(r => setTimeout(r, 0));
    };
    await say("Reading the empty room…");
    let plate = null;
    if(cfg.plate){
      const u = await Store.imageURL(cfg.plate);
      if(u) plate = await loadImage(u);
    }
    const frames = {};
    for(const key of ["front","right","back","left"]){
      if(!cfg.shots[key]) continue;
      await say("Cutting you out of the " + key + " frame…");
      frames[key] = await frameFor(cfg.shots[key], plate, cfg.sensitivity);
    }
    if(!frames.front || !(frames.right || frames.left))
      return { ok:false, error:"A scan needs at least the front and one side. Shoot those two and try again." };
    const mirror = f => {
      const m = new Uint8Array(MW*MH), t = new Uint8ClampedArray(MW*MH*4);
      for(let v = 0; v < MH; v++) for(let u = 0; u < MW; u++){
        m[v*MW+u] = f.mask[v*MW + (MW-1-u)];
        const a = (v*MW+u)*4, b = (v*MW + (MW-1-u))*4;
        t[a] = f.tex[b]; t[a+1] = f.tex[b+1]; t[a+2] = f.tex[b+2]; t[a+3] = 255;
      }
      return { mask:m, tex:t, mirrored:true };
    };
    if(!frames.back) frames.back = mirror(frames.front);
    if(!frames.right) frames.right = mirror(frames.left);
    if(!frames.left) frames.left = mirror(frames.right);

    await say("Carving the volume…");
    const vol = carve(frames);
    let filled = 0;
    for(let p = 0; p < vol.length; p++) filled += vol[p];
    if(filled < 4000) return { ok:false, error:"The silhouettes did not overlap into a body. Try more sensitivity, or reshoot with a plainer background." };

    await say("Smoothing…");
    const field = blur(vol);
    await say("Building the surface…");
    const geo = surfaceNets(field, 0.47);
    if(geo.idx.length < 300) return { ok:false, error:"Not enough surface came out of the scan. Try again with more even light." };
    relax(geo.pos, geo.idx, 3, 0.45);

    const info = analyse(vol, cfg.heightCm);
    await say("Painting on your photographs…");
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(geo.pos, 3));
    g.setIndex(new THREE.BufferAttribute(geo.idx, 1));
    g.computeVertexNormals();
    geo.normals = g.attributes.normal.array;
    const colours = colourise(geo, frames, info, cfg.headTex || null);
    g.setAttribute("color", new THREE.BufferAttribute(colours, 3));

    /* voxel units into metres, feet on the floor, hips on the axis */
    const s = info.cellY;
    g.scale(s, s, s);
    g.translate(-(NX-1)/2 * s, -info.ground * s, -(NZ-1)/2 * s);
    g.computeBoundingBox();
    return { ok:true, geometry:g, info, frames, vertices: geo.pos.length/3, previews: {
      front: previewURL(frames.front),
      right: frames.right.mirrored ? null : previewURL(frames.right),
      back:  frames.back.mirrored ? null : previewURL(frames.back),
      left:  frames.left.mirrored ? null : previewURL(frames.left)
    } };
  }

  async function previewOne(ref, plateRef, sens){
    let plate = null;
    if(plateRef){ const u = await Store.imageURL(plateRef); if(u) plate = await loadImage(u); }
    const f = await frameFor(ref, plate, sens);
    return f ? previewURL(f) : null;
  }

  return { build, previewOne, MW, MH, NX, NY, NZ };
})();
