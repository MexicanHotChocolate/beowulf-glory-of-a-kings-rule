# The Glory of a King's Rule

**A digital exhibit on *Beowulf*.** Honors English group project by Sonny Rosas, Elam Browen, Liam Daugherty and Blake Sheppach.

You scroll through it like a film. You fly through six passages from Seamus Heaney's translation, each one on a painting of that moment, and then a braided map shows how they connect. After that come the full text evidence, John Leyerle's "The Interlace Structure of *Beowulf*," a counter-reading with our answer to it, our Works Cited and our curatorial statement.

## Our question and thesis

**Driving question:** How does Beowulf's role as a leader change throughout the text?

**Sub-question:** How does Beowulf's maturity develop him as a leader to his people?

**Thesis:** Beowulf matures as a leader as he learns to use his strength effectively, apply his wisdom, and make sacrifices for the good of his people, becoming a better leader.

## Who did what

- **Sonny Rosas** (project lead): planned the whole visual project and built this website, including the club scene at the end.
- **Elam Browen**: the driving question, the thesis, the exhibit's name and the Leyerle paragraph.
- **Liam Daugherty**: the text evidence and the close readings.
- **Blake Sheppach**: the counter-reading and our answer to it.

## How it is built

It is a static site with no build step and nothing to install:

- **3D:** Three.js
- **Scroll animation:** GSAP with ScrollTrigger
- **Smooth scrolling:** Lenis

The paintings, museum objects and skies are listed in the Works Cited at the bottom of the site and in [content/CREDITS.md](content/CREDITS.md). Every quote and line number comes from [content/EXHIBIT_TEXT.md](content/EXHIBIT_TEXT.md).

The site is built for a desktop browser. On a slower computer it lowers its own detail.

## Running it

To run it on your own computer:

```
python tools/serve.py
```

Then open http://localhost:5173. Add `?nogate` to the address to skip the Enter screen.

To put it online with Vercel, import this repository as a static site. It needs no settings, because `index.html` is at the root.

If you change the site's text, edit `tools/build_page.py` and run `python tools/build_page.py`, which rewrites `index.html`.

## Folders

```
index.html            the page
css/, js/             styles and code (js/main.js starts everything)
assets/               paintings, museum objects, skies, models, audio, video
content/              exhibit text and credits
tools/                the page builder, asset scripts, local server
```
