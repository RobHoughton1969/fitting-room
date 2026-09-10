# Fitting Room

A wardrobe you can walk around. Scan your body from four photographs, catalogue
your clothes, dress the scan in 3D, turn it like a mirror, and get outfits
ranked for wherever you are going.

One HTML file. No framework, no bundler, no account. Everything you photograph
stays on your own machine.

## What it does

**Your figure.** Prop your phone at hip height, shoot the empty room once, then
step in and take four quarter turns from the same spot. The app mattes you out
of each frame against the empty plate and carves a 3D body from your outlines
(see [How the scan works](#how-the-scan-works)). Four close-up head shots are
wrapped onto the head so the face is yours as well.

**Wardrobe.** Photograph each garment flat. Every piece gets a category, one of
about eighty garment types, a colour read off the photo, a fabric, and marks
from 1 to 5 for formality and warmth. Sixteen sample garments load on first
open so nothing is empty; they disappear the moment you add a real one.

**Mirror.** The figure wears what you pick. Drag to turn, scroll or pinch to
move closer. A turntable ruler underneath reads the angle in degrees with
front, right, back and left anchored, and there is a left-right flip for a true
mirror view.

**Occasion.** Twelve event types, a temperature slider, rain, wind, sun and time
of day. Three outfits come back, ranked, each one saying why it earned the
place: formality distance, weather fit, colour agreement, and how recently you
wore the pieces.

## How the scan works

Shape from silhouette, the oldest trick in 3D reconstruction and the only one
that works honestly in a browser with no model weights to download.

1. **Matte.** Each frame is differenced against the empty-room plate. The
   result is opened to kill speckle, reduced to its largest blob, and its
   interior holes closed by flooding the true outside inward.
2. **Normalise.** Every silhouette is scaled so your height fills the same
   number of rows, and centred on the same turning axis, taken from the middle
   of the hips rather than the middle of the outline.
3. **Carve.** A voxel grid keeps only what falls inside all four silhouettes at
   once. Front and back constrain left to right, the two sides constrain front
   to back. The gap between your legs survives because the front view sees it.
4. **Mesh.** The occupancy grid is blurred into a scalar field, pulled into a
   surface with naive surface nets, and relaxed a few times so the voxel
   staircase comes off.
5. **Paint.** Each vertex samples the photographs whose view direction its
   normal faces, blended by how squarely it faces them.
6. **Measure.** Cross-sections give chest, waist, hip, shoulder and inseam.
   Girths are Ramanujan ellipse perimeters fitted to the width and depth at
   each landmark: good enough to size a shirt, not good enough for a tailor.

The build runs in well under a second on a laptop. The mesh is never stored; it
is rebuilt from your photographs each time the page opens.

**What it cannot do.** Four views give a visual hull, so concave places like
the small of the back read fuller than they are. The matte needs a plain wall
and even light; there is a sensitivity slider, and the capture cards show the
actual cut-out so you can judge it before building. Wear something close
fitting or you will scan the coat.

## Running it

Open `index.html` in a browser. That is the whole app.

For storage to work you want it served rather than opened from disk, because
browsers block IndexedDB on `file://`:

```bash
perl serve.pl        # http://localhost:8731
```

Any static server does the same job.

## Building

`index.html` is committed, so you only need this after editing `src/`:

```bash
./build.sh
```

It concatenates `src/head.html`, `src/body.html`, a pinned three.js tag, and
each file in `src/js/` wrapped in its own `<script>` block. That is the entire
build.

| File | What is in it |
| --- | --- |
| `src/head.html` | `<title>`, fonts, the whole stylesheet |
| `src/body.html` | Icon definitions and the markup for all four rooms |
| `src/js/01-catalogue.js` | Garment types, occasions, colour naming, utilities |
| `src/js/02-storage.js` | Storage backends, app state, the sample wardrobe |
| `src/js/03-scan.js` | Matte, carve, surface nets, landmarks, measurements |
| `src/js/04-figure.js` | three.js scene, both bodies, every garment |
| `src/js/05-wardrobe.js` | Capture, the item editor, dressing |
| `src/js/06-scan-ui.js` | The scan capture flow |
| `src/js/07-mirror.js` | Turntable, occasion engine, boot |

Garments read a small landmark interface rather than the body directly, which
is why the same code dresses both the scan and the fallback mannequin. Fitted
pieces are the body's own surface offset along its normals. Flared pieces are
turned from its measured radius.

## Where your photographs go

Two backends behind one interface, chosen at load:

- **This device.** IndexedDB for the images, alongside the garment records.
  Nothing leaves the browser.
- **Published as a Claude Artifact.** Images go to the artifact's asset store
  and the records to its document store, so the wardrobe follows you between
  devices.

There is no third option and no analytics. An export button writes the
inventory out as JSON where the runtime allows a download.

## Optional extras

Published on claude.ai, the page can also ask Claude to read a garment
photograph and fill in the item form: name, category, type, fabric, formality,
warmth. The button appears only where that is available, everything it fills in
is editable, and nothing depends on it.

## Third party

[three.js](https://threejs.org) r128, loaded from cdnjs. Typefaces are Bodoni
Moda, Archivo and IBM Plex Mono from Google Fonts. Nothing else.

## Licence

MIT. See [LICENSE](LICENSE).
