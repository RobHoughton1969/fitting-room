"use strict";
/* ==========================================================
   Fitting Room
   1. Catalogue   2. Storage   3. Figure (three.js)
   4. Interface   5. Occasion engine
   ========================================================== */

/* ----------------------------- 1. CATALOGUE ----------------------------- */

const CATS = [
  { id:"top",       label:"Tops",      one:"Top",       slot:"top" },
  { id:"bottom",    label:"Bottoms",   one:"Bottom",    slot:"bottom" },
  { id:"dress",     label:"Dresses",   one:"Dress",     slot:"dress" },
  { id:"outerwear", label:"Outerwear", one:"Outerwear", slot:"outerwear" },
  { id:"shoes",     label:"Shoes",     one:"Shoes",     slot:"shoes" },
  { id:"headwear",  label:"Headwear",  one:"Headwear",  slot:"headwear" },
  { id:"bag",       label:"Bags",      one:"Bag",       slot:"bag" },
  { id:"accessory", label:"Accessories", one:"Accessory", slot:"accessory" }
];
const CAT_BY_ID = Object.fromEntries(CATS.map(c => [c.id, c]));

/* f = formality 1..5, w = warmth 1..5, plus the shape hints the mannequin needs */
const SUBTYPES = {
  top: [
    ["T-shirt",{f:1,w:1,sleeve:"short",hem:"hip"}],
    ["Polo shirt",{f:2,w:1,sleeve:"short",hem:"hip"}],
    ["Oxford shirt",{f:4,w:2,sleeve:"long",hem:"hip",collar:true}],
    ["Linen shirt",{f:3,w:1,sleeve:"long",hem:"hip",collar:true}],
    ["Blouse",{f:4,w:1,sleeve:"long",hem:"hip"}],
    ["Knit jumper",{f:3,w:4,sleeve:"long",hem:"hip",thick:1.6}],
    ["Cardigan",{f:3,w:3,sleeve:"long",hem:"hip",thick:1.8,open:true}],
    ["Hoodie",{f:1,w:3,sleeve:"long",hem:"hip",thick:2}],
    ["Sweatshirt",{f:1,w:3,sleeve:"long",hem:"hip",thick:1.8}],
    ["Tank top",{f:1,w:1,sleeve:"none",hem:"hip"}],
    ["Waistcoat",{f:5,w:2,sleeve:"none",hem:"waist"}],
    ["Silk top",{f:4,w:1,sleeve:"short",hem:"hip"}]
  ],
  bottom: [
    ["Jeans",{f:2,w:3,len:"ankle"}],
    ["Chinos",{f:3,w:2,len:"ankle"}],
    ["Wool trousers",{f:5,w:3,len:"ankle"}],
    ["Suit trousers",{f:5,w:3,len:"ankle"}],
    ["Linen trousers",{f:3,w:1,len:"ankle"}],
    ["Shorts",{f:1,w:1,len:"knee"}],
    ["Chino shorts",{f:2,w:1,len:"knee"}],
    ["Skirt",{f:3,w:1,len:"knee",flare:1.5}],
    ["Pencil skirt",{f:4,w:2,len:"knee",flare:1}],
    ["Maxi skirt",{f:3,w:2,len:"floor",flare:1.6}],
    ["Track pants",{f:1,w:3,len:"ankle"}],
    ["Leggings",{f:1,w:2,len:"ankle",slim:true}]
  ],
  dress: [
    ["Day dress",{f:3,w:1,len:"knee",flare:1.4,sleeve:"short"}],
    ["Sundress",{f:2,w:1,len:"knee",flare:1.5,sleeve:"none"}],
    ["Shirt dress",{f:3,w:2,len:"knee",flare:1.2,sleeve:"long"}],
    ["Cocktail dress",{f:4,w:1,len:"knee",flare:1.2,sleeve:"none"}],
    ["Evening gown",{f:5,w:1,len:"floor",flare:1.7,sleeve:"none"}],
    ["Jumpsuit",{f:3,w:2,len:"ankle",flare:1,sleeve:"none",trousers:true}]
  ],
  outerwear: [
    ["Blazer",{f:5,w:3,sleeve:"long",hem:"hip",thick:2.4,open:true}],
    ["Suit jacket",{f:5,w:3,sleeve:"long",hem:"hip",thick:2.4,open:true}],
    ["Overcoat",{f:5,w:5,sleeve:"long",hem:"thigh",thick:3.4,open:true}],
    ["Trench coat",{f:4,w:4,sleeve:"long",hem:"thigh",thick:3,open:true,rain:true}],
    ["Raincoat",{f:2,w:3,sleeve:"long",hem:"thigh",thick:2.8,rain:true}],
    ["Leather jacket",{f:2,w:3,sleeve:"long",hem:"waist",thick:2.6,open:true}],
    ["Denim jacket",{f:1,w:2,sleeve:"long",hem:"waist",thick:2.4,open:true}],
    ["Chore jacket",{f:2,w:3,sleeve:"long",hem:"hip",thick:2.6,open:true}],
    ["Puffer jacket",{f:1,w:5,sleeve:"long",hem:"hip",thick:4.6}],
    ["Parka",{f:1,w:5,sleeve:"long",hem:"thigh",thick:4.2,rain:true}],
    ["Gilet",{f:2,w:3,sleeve:"none",hem:"hip",thick:3.4}]
  ],
  shoes: [
    ["Oxford shoes",{f:5,w:2}],["Derby shoes",{f:5,w:2}],["Loafers",{f:4,w:2}],
    ["Court heels",{f:5,w:1,heel:1}],["Block heels",{f:4,w:1,heel:1}],
    ["Chelsea boots",{f:4,w:3,boot:1}],["Ankle boots",{f:3,w:3,boot:1}],
    ["Chukka boots",{f:3,w:3,boot:1}],["Leather sneakers",{f:2,w:1}],
    ["Trainers",{f:1,w:1}],["Canvas sneakers",{f:1,w:1}],["Sandals",{f:1,w:1,open:true}],
    ["Wellington boots",{f:1,w:3,boot:2,rain:true}]
  ],
  headwear: [["Baseball cap",{f:1,w:1}],["Beanie",{f:1,w:4}],["Fedora",{f:4,w:2,brim:1}],["Sun hat",{f:2,w:1,brim:1.5}],["Flat cap",{f:3,w:2}]],
  bag: [["Tote bag",{f:2,w:0}],["Shoulder bag",{f:3,w:0}],["Clutch",{f:5,w:0}],["Backpack",{f:1,w:0}],["Briefcase",{f:5,w:0}],["Weekender",{f:2,w:0}]],
  accessory: [
    ["Tie",{f:5,w:0,shape:"tie"}],["Bow tie",{f:5,w:0,shape:"bow"}],
    ["Pocket square",{f:5,w:0,shape:"pocket"}],["Scarf",{f:2,w:3,shape:"scarf"}],
    ["Belt",{f:3,w:0,shape:"belt"}],["Necklace",{f:4,w:0,shape:"neck"}],
    ["Watch",{f:3,w:0,shape:"wrist"}],["Sunglasses",{f:2,w:0,shape:"glasses"}],
    ["Gloves",{f:2,w:4,shape:"gloves"}]
  ]
};
function subtypeInfo(cat, sub){
  const row = (SUBTYPES[cat] || []).find(r => r[0] === sub);
  return row ? row[1] : {f:3,w:2};
}

const OCCASIONS = [
  { id:"wedding", label:"Wedding guest", target:4.4, note:"Formal but not upstaging.",
    prefer:["Blazer","Suit jacket","Oxford shirt","Blouse","Cocktail dress","Day dress","Silk top","Wool trousers","Suit trousers","Oxford shoes","Derby shoes","Court heels","Block heels","Loafers","Tie","Pocket square","Clutch"],
    avoid:["Hoodie","Track pants","Trainers","Shorts","Chino shorts","Sweatshirt","Baseball cap","Backpack","Wellington boots"],
    banColours:["white","ivory","cream"], banReason:"White belongs to the couple.",
    wantsJacket:true },
  { id:"blacktie", label:"Black tie", target:5, note:"Evening dress, no compromises.",
    prefer:["Suit jacket","Blazer","Oxford shirt","Evening gown","Cocktail dress","Suit trousers","Wool trousers","Oxford shoes","Court heels","Bow tie","Clutch","Pocket square"],
    avoid:["Jeans","T-shirt","Hoodie","Trainers","Sneakers","Leather sneakers","Canvas sneakers","Shorts","Chino shorts","Denim jacket","Baseball cap","Backpack","Track pants"],
    preferColours:["black","navy","charcoal","burgundy"], wantsJacket:true },
  { id:"dinner", label:"Dinner party", target:3.6, note:"Smart, comfortable, someone's home.",
    prefer:["Knit jumper","Oxford shirt","Linen shirt","Blouse","Silk top","Chinos","Wool trousers","Day dress","Loafers","Chelsea boots","Leather sneakers","Ankle boots"],
    avoid:["Track pants","Wellington boots","Sweatshirt","Baseball cap","Backpack"] },
  { id:"cocktail", label:"Cocktail party", target:4.2, note:"A bit of shine after dark.",
    prefer:["Cocktail dress","Silk top","Blouse","Blazer","Wool trousers","Court heels","Block heels","Loafers","Oxford shoes","Necklace","Clutch"],
    avoid:["Hoodie","Track pants","Trainers","Shorts","Wellington boots","Baseball cap","Backpack"] },
  { id:"work", label:"Work / office", target:3.8, note:"Reliable, repeatable, unremarkable in the right way.",
    prefer:["Oxford shirt","Blouse","Knit jumper","Chinos","Wool trousers","Pencil skirt","Blazer","Loafers","Derby shoes","Chelsea boots","Leather sneakers","Watch","Briefcase","Tote bag"],
    avoid:["Track pants","Shorts","Chino shorts","Wellington boots","Sun hat"] },
  { id:"interview", label:"Job interview", target:4.6, note:"One notch above the room.",
    prefer:["Blazer","Suit jacket","Oxford shirt","Blouse","Suit trousers","Wool trousers","Pencil skirt","Oxford shoes","Derby shoes","Court heels","Loafers","Watch","Briefcase"],
    avoid:["T-shirt","Hoodie","Jeans","Trainers","Canvas sneakers","Shorts","Track pants","Baseball cap","Sunglasses","Backpack","Sweatshirt"],
    preferColours:["navy","charcoal","grey","black","white"], wantsJacket:true },
  { id:"casual", label:"Casual weekend", target:1.8, note:"Nothing to prove.",
    prefer:["T-shirt","Polo shirt","Sweatshirt","Hoodie","Jeans","Chinos","Chino shorts","Leather sneakers","Canvas sneakers","Trainers","Denim jacket","Chore jacket","Baseball cap","Backpack","Tote bag"],
    avoid:["Evening gown","Bow tie","Court heels","Suit jacket","Pocket square"] },
  { id:"date", label:"Date night", target:3.4, note:"Considered, not costumed.",
    prefer:["Knit jumper","Oxford shirt","Silk top","Blouse","Jeans","Chinos","Wool trousers","Day dress","Cocktail dress","Chelsea boots","Ankle boots","Leather sneakers","Loafers","Leather jacket","Blazer"],
    avoid:["Track pants","Wellington boots","Baseball cap","Backpack","Sweatshirt"] },
  { id:"beach", label:"Beach / holiday", target:1.4, note:"Heat first, everything else second.",
    prefer:["T-shirt","Linen shirt","Tank top","Sundress","Shorts","Chino shorts","Linen trousers","Sandals","Canvas sneakers","Sun hat","Sunglasses","Tote bag"],
    avoid:["Overcoat","Suit jacket","Wool trousers","Oxford shoes","Court heels","Knit jumper","Puffer jacket","Parka","Beanie"],
    banColours:["black"], banReason:"Black soaks up sun.", noJacket:true },
  { id:"funeral", label:"Funeral", target:4.6, note:"Sober and quiet.",
    prefer:["Suit jacket","Blazer","Overcoat","Oxford shirt","Wool trousers","Suit trousers","Pencil skirt","Oxford shoes","Derby shoes","Court heels","Tie"],
    avoid:["Shorts","T-shirt","Trainers","Hoodie","Sunglasses","Baseball cap","Track pants","Sundress"],
    preferColours:["black","charcoal","navy"], banColours:["red","orange","yellow","pink"],
    banReason:"Bright colour reads as loud here.", wantsJacket:true },
  { id:"active", label:"Gym / active", target:1, note:"Move in it.",
    prefer:["T-shirt","Tank top","Sweatshirt","Hoodie","Track pants","Leggings","Shorts","Trainers","Gilet","Baseball cap","Backpack"],
    avoid:["Oxford shirt","Blazer","Suit jacket","Wool trousers","Oxford shoes","Court heels","Loafers","Evening gown","Tie"] },
  { id:"outdoors", label:"Outdoors / walk", target:1.6, note:"Weather is the brief.",
    prefer:["T-shirt","Knit jumper","Sweatshirt","Jeans","Chinos","Chukka boots","Ankle boots","Chelsea boots","Trainers","Parka","Raincoat","Chore jacket","Gilet","Beanie","Backpack","Wellington boots"],
    avoid:["Court heels","Evening gown","Oxford shoes","Cocktail dress","Silk top","Clutch"] }
];

/* ------------------------------ small utils ------------------------------ */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const DAY = 86400000;

function toast(msg){
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2600);
}

/* colour ------------------------------------------------------------------ */
function hexToRgb(h){ h = h.replace("#",""); if(h.length===3) h = h.split("").map(c=>c+c).join("");
  const n = parseInt(h,16); return [n>>16 & 255, n>>8 & 255, n & 255]; }
function rgbToHex(r,g,b){ return "#" + [r,g,b].map(v => clamp(Math.round(v),0,255).toString(16).padStart(2,"0")).join(""); }
function rgbToHsl(r,g,b){
  r/=255; g/=255; b/=255;
  const mx = Math.max(r,g,b), mn = Math.min(r,g,b), l = (mx+mn)/2;
  let h = 0, s = 0;
  if(mx !== mn){
    const d = mx - mn;
    s = l > .5 ? d/(2-mx-mn) : d/(mx+mn);
    if(mx===r) h = ((g-b)/d + (g<b?6:0));
    else if(mx===g) h = (b-r)/d + 2;
    else h = (r-g)/d + 4;
    h *= 60;
  }
  return [h, s, l];
}
const hexToHsl = h => rgbToHsl(...hexToRgb(h));

/* A small, opinionated colour vocabulary — the words a wardrobe actually uses. */
function colourName(hex){
  const [h,s,l] = hexToHsl(hex);
  if(l < .10) return "black";
  if(l > .93 && s < .10) return "white";
  if(s < .09){
    if(l > .80) return "ivory";
    if(l > .60) return "light grey";
    if(l > .34) return "grey";
    return "charcoal";
  }
  if(l > .86 && s < .30) return h < 60 ? "cream" : "ivory";
  if(h < 15 || h >= 345) return l < .28 ? "burgundy" : (s < .45 ? "brick" : "red");
  if(h < 32) return l < .30 ? "chocolate" : (s < .40 ? "taupe" : (l > .70 ? "peach" : "rust"));
  if(h < 45) return l < .34 ? "brown" : (l > .72 ? "sand" : (s > .55 ? "amber" : "camel"));
  if(h < 62) return l < .38 ? "olive" : (s > .60 ? "mustard" : "khaki");
  if(h < 88) return l < .34 ? "olive" : "lime";
  if(h < 155) return l < .30 ? "forest" : (s < .35 ? "sage" : "green");
  if(h < 190) return l < .32 ? "teal" : "aqua";
  if(h < 215) return l < .30 ? "navy" : (l > .72 ? "sky" : "blue");
  if(h < 250) return l < .34 ? "navy" : (s < .35 ? "slate" : "cobalt");
  if(h < 285) return l < .34 ? "aubergine" : (l > .72 ? "lavender" : "purple");
  if(h < 320) return l < .32 ? "plum" : (s < .45 ? "mauve" : "magenta");
  return l > .74 ? "blush" : (l < .32 ? "burgundy" : "pink");
}
const NEUTRALS = new Set(["black","white","ivory","cream","light grey","grey","charcoal","navy","camel","sand","taupe","brown","chocolate","khaki","slate","stone"]);

function averageColour(img, box){
  const c = document.createElement("canvas"), n = 40;
  c.width = n; c.height = n;
  const ctx = c.getContext("2d", { willReadFrequently:true });
  const sx = box ? box[0]*img.width : 0, sy = box ? box[1]*img.height : 0;
  const sw = box ? box[2]*img.width : img.width, sh = box ? box[3]*img.height : img.height;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, n, n);
  const d = ctx.getImageData(0,0,n,n).data;
  /* Weight toward mid-tone, saturated pixels: backgrounds are usually pale and flat. */
  let r=0,g=0,b=0,wt=0;
  for(let i=0;i<d.length;i+=4){
    const [hh,ss,ll] = rgbToHsl(d[i],d[i+1],d[i+2]);
    const w = (ll>.96||ll<.04) ? .05 : (0.35 + ss*1.6 + (1-Math.abs(ll-.5)*2)*.5);
    r += d[i]*w; g += d[i+1]*w; b += d[i+2]*w; wt += w;
  }
  return rgbToHex(r/wt, g/wt, b/wt);
}

/* image handling ---------------------------------------------------------- */
function loadImage(src){
  return new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("image"));
    im.src = src;
  });
}
async function fileToJpeg(file, max = 1100, quality = .86){
  const url = URL.createObjectURL(file);
  try{
    const im = await loadImage(url);
    const sc = Math.min(1, max / Math.max(im.width, im.height));
    const c = document.createElement("canvas");
    c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc);
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, "image/jpeg", quality));
  } finally { URL.revokeObjectURL(url); }
}
function canvasToBlob(c, q = .88){ return new Promise(r => c.toBlob(r, "image/jpeg", q)); }
