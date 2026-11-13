# Asset Manifest

Every file here was opened and checked by eye. Credits and source links are in `content/CREDITS.md`.

```
assets/
  art/          illustrations and paintings (originals)
  artifacts/    museum objects (Sutton Hoo, Staffordshire Hoard, Franks Casket)
  manuscripts/  Beowulf manuscript, Lindisfarne and Durrow carpet pages
  audio/        alarm-danger.mp3, dont-stop-the-party.mp3 (Pitbull ft. TJR, cut to start at 0:15.3; plays in the club)
  video/        wojak-singing-greenscreen.mp4, wojak-crowd-greenscreen.mp4
  web/          generated, web-ready copies (rebuild with: python -I tools/build_assets.py)
```

## art/
| File | Shows | Planned use |
|---|---|---|
| skelton-sailing-to-daneland.jpg | The Geats' ship under sail | Opening of the flight |
| skelton-grendel.jpg | Grendel at the edge of the sea | Stop 01 |
| bacon-grendel-1910.png | Grendel carrying off two thanes (engraving) | Not used now (was the stop 01 inset) |
| bacon-beowulf-and-grendel-1910.png | Beowulf over Grendel (engraving) | Stop 01 or 02 |
| skelton-wealhtheow-pours-mead.jpg | Wealhtheow serving at the feast | Stop 02 |
| skelton-grendels-mother.jpg | Grendel's mother attacks Beowulf | Before stop 03 |
| skelton-head-of-grendel.jpg | Grendel's head carried into Heorot | Stop 03 |
| dahl-megalith-grave-in-winter.jpg | Ancient grave mound under bare oaks, snow | Stop 04 ("fifty winters") |
| skelton-thief-steals-cup.jpg | The thief takes the cup from the sleeping dragon | Stop 05 |
| skelton-beowulf-fights-dragon.jpg | Old Beowulf, sword and shield, dragon fire | Stop 05 |
| skelton-wiglaf-and-dying-beowulf.jpg | Wiglaf beside the dying king | Stop 06 |
| dicksee-funeral-of-a-viking.jpg | A burning funeral ship | Stop 06 ending |
| aivazovsky-ninth-wave.jpg | Survivors in a storm at sea | Counter-reading (Breca) |
| bayeux-tapestry-death-of-harold.jpg | A shield wall and a fallen king | Counter-reading (an army, not one man) |

## artifacts/
| File | Shows |
|---|---|
| sutton-hoo-helmet-cutout.png | **Hero image.** The real helmet, transparent background |
| sutton-hoo-helmet-dancing-warriors.png | Line drawing of the helmet's dancing-warriors panel, transparent background |
| sutton-hoo-helmet-replica-armouries.jpg | Shiny working replica |
| sutton-hoo-helmet-replica-bm.jpg | Museum replica in its case |
| sutton-hoo-great-gold-buckle.jpg | Great gold buckle, front |
| sutton-hoo-great-gold-buckle-side.jpg | Great gold buckle, side |
| sutton-hoo-shoulder-clasp.jpg | One gold and garnet shoulder clasp |
| sutton-hoo-purse-lid.jpg / -blue.jpg | Purse lid, two photos |
| sutton-hoo-garnet-fitting.jpg | Gold and garnet fitting |
| sutton-hoo-sword-belt-reconstruction.jpg | Sword and belt reconstruction |
| sutton-hoo-sceptre-face.jpg / -drawing.jpg | Whetstone sceptre, photo and drawing |
| staffordshire-hoard-gold.jpg / -pommel.jpg / -fittings.jpg | Staffordshire Hoard gold |
| franks-casket-front.jpg / -back.jpg / -side-panel.jpg | Franks Casket panels |

## manuscripts/
| File | Shows |
|---|---|
| beowulf-manuscript-first-page.jpg | First page of the only Beowulf manuscript ("HWÆT") |
| lindisfarne-carpet-page.jpg | Lindisfarne Gospels carpet page (folio 26v) |
| lindisfarne-st-matthew-incipit.jpg | Lindisfarne Gospels, St. Matthew opening page |
| book-of-durrow-carpet-page.jpg | Book of Durrow carpet page |

## web/ (generated)
* `hero/helmet.webp`, `hero/helmet-800.webp`: trimmed helmet cutout
* `hero/helmet-depth.png`: height map that turns the helmet photo into a 3D shape (made from its silhouette and shading)
* `plates/gold-buckle-cutout.webp`: the gold buckle lifted off its black background (no longer used in the flight)
* `plates/*-xl.webp`: the flight paintings upscaled to 2400px for full-screen use
* `figures/beowulf.webp`, `figures/beowulf-depth.png`: Beowulf cut out of Bacon's engraving (with its depth), for the gold figure at stop 01. Made by `tools/build_figure.py`.
* `depth/*.png`: a depth map for each flight painting (white = near), made by `tools/build_depth.py` with Depth Anything V2 Small. The site lifts each painting by it so it moves in layers.
* `models/sword-estoc.glb`: Poly Haven's "Antique Estoc" (CC0), turned point-down, 1k textures.
* `models/dragon.glb`: the Stanford Dragon scan from the Khronos glTF samples (CC BY 4.0). No longer used by the site (round 9 builds the Enter screen dragon in code, `js/wyrm.js`); kept only in case we want it back.
* `env/venice-sunset-1k.hdr`: Poly Haven HDRI (CC0), the sky reflected in the metal.
* `../audio/alarm-danger.mp3`: the alarm sound our group picked.
* `hero/stone.webp`: marble for the ledge (generated)
* `graphics/dancing-warriors.webp`
* `plates/*.webp` and `plates/*-1000.webp`: every plate above, at 2000px and 1000px

## Made in code (no file)
* The woven hall-hanging with the gold and blue braided border (`js/shaders.js`)
* The tie-back cord (two twisted strands)
* The halftone dissolve and the stippled clouds

## Removed
* `assets/3d/`: all five models were placeholder shapes, plus untextured matcaps
* About 30 images that were duplicates, mislabeled, or not what they claimed (see `CLAUDE_REVIEW.md`, section 3)
* The duplicate Pear video (the original is still in `user submit/`)
