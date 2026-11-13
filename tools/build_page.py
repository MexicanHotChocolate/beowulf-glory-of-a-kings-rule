"""Writes index.html.

All the exhibit's words live in this one file (plus content/EXHIBIT_TEXT.md,
which says where each line came from). The words come from our group's final
document ("The Glory of a King's Rule"). Edit the text here and re-run:

    python -I tools/build_page.py

Every picture is used once on the whole site.
"""
import html
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
esc = lambda s: html.escape(s, quote=False)

# ------------------------------------------------------------------ from the top of our document
TITLE = "The Glory of a King's Rule"
QUESTION = "How does Beowulf's role as a leader change throughout the text?"
SUBQUESTION = "How does Beowulf's maturity develop him as a leader to his people?"
THESIS = ("Beowulf matures as a leader as he learns to use his strength effectively, apply his wisdom, "
          "and make sacrifices for the good of his people, becoming a better leader.")
# our explanation of the thesis, from the document
ARGUMENT = ("Beowulf changes from a confident, proud warrior into a responsible king. When he fights Grendel, he seeks to "
            "prove his strength and glory by fighting without any weapons. After ruling for fifty years, he becomes more "
            "wise. He fights the dragon because he feels it is his duty to protect his people. His courage and self-pride "
            "remain, since he does not want to line up a huge army before the fight, but his leadership shifts from "
            "personal fame to sacrifice and defending his people.")

# ------------------------------------------------------------------ the flight: seven scenes
# Six passages from our document, then the funeral. strand: gold, blue, both, snap.
FLIGHT = [
    dict(num="Passage 01", strand="gold", title="Fighting Grendel without weapons.",
         quote=["to heighten Hygelac's fame", "and gladden his heart, I hereby renounce", "sword and the shelter of the broad shield"],
         cite="Heaney, lines 435 to 437",
         happens="Beowulf has just arrived in Denmark. He tells King Hrothgar he will fight Grendel the way the monster fights, with no weapons at all.",
         shows="Beowulf demonstrates courage and fearlessness as he goes to fight Grendel. He seeks to prove his strength and glory by fighting without any weapons.",
         label="Strength, used to win glory."),
    dict(num="Passage 02", strand="gold", title="Beowulf's confidence and desire for glory.",
         quote=["When it comes to fighting, I count myself", "as dangerous any day as Grendel."],
         cite="Heaney, lines 677 to 678",
         happens="It is the night Grendel attacks Heorot. Before he lies down to wait, Beowulf boasts in front of the warriors.",
         shows="Beowulf demonstrates self-pride and his reputation. The narrator calls him “that prince of goodness” and says he “proudly asserted” in the same breath, so the poem praises him and shows his pride at once.",
         label="Pride in his own strength."),
    dict(num="Passage 03", strand="blue", title="Strong in body, mature in mind.",
         quote=["I have never heard", "so young a man make truer observations.", "You are strong in body and mature in mind"],
         cite="Heaney, lines 1842 to 1844",
         happens="Grendel and his mother are dead. Before Beowulf sails home, King Hrothgar thanks him.",
         shows="Beowulf never loses his strength or reputation, yet he matures and becomes a leader respected for his wisdom. Hrothgar's thanks forebode his next fifty years as a peaceful, strong ruler whose wisdom only grows.",
         label="Here the leader strand begins."),
    dict(num="Passage 04", strand="blue", title="Beowulf as an older peaceful king.",
         quote=["He ruled it well", "for fifty winters, grew old and wise", "as warden of the land"],
         cite="Heaney, lines 2208 to 2210",
         happens="Back home, Hygelac is killed in battle, and then his son Heardred. The kingdom of the Geats passes to Beowulf.",
         shows="Beowulf demonstrates his growth as a leader and a ruler for fifty years. After ruling that long he becomes more wise, a “warden of the land,” a guardian and not only a fighter.",
         label="Fifty years of peace."),
    dict(num="Passage 05", strand="both", title="His responsibility as king before fighting the dragon.",
         quote=["as king of the people I shall pursue this fight", "for the glory of winning"],
         cite="Heaney, lines 2513 to 2514",
         happens="A thief steals a cup from a dragon's hoard. The dragon burns the Geats' homes, Beowulf's own hall too. Old Beowulf makes one last formal boast.",
         shows="Beowulf demonstrates his logical thinking of fighting for the protection of his people. He fights because he feels it is his duty to protect them, and his courage and self-pride remain: he will not line up a huge army.",
         label="The leader and the warrior in one sentence."),
    dict(num="Passage 06", strand="snap", title="Fifty years, in his own words.",
         quote=["For fifty years I ruled this nation. No king of any neighbouring clan would dare face me with troops, none had the power to intimidate me."],
         cite="Heaney, lines 2732 to 2736",
         happens="The dragon is dead, and Beowulf is dying from its bite. Ten of his men ran into the woods. Only Wiglaf stayed. Dying, Beowulf looks back on his reign.",
         shows="This disproves that Beowulf is only a warrior brute. He used his strength and his reputation to keep the kingdom at peace.",
         label="Here the gold strand snaps."),
    dict(num="The end of the poem", strand="blue", title="He dies for his people.",
         quote=["Beowulf matures as a leader as he learns", "to use his strength effectively, apply his wisdom,", "and make sacrifices for the good of his people."],
         cite="Our thesis",
         happens="The Geats burn his body on a pyre and build his barrow on the headland, high enough for sailors to see.",
         shows="Beowulf changes most in his selflessness and sacrifice for his people, culminating in his final fight and death against the dragon.",
         label="Sacrifice, for the good of his people."),
]

# What happens in the story while the camera travels between two scenes (and at the end).
BEATS = [
    "That night, Grendel comes to Heorot.",
    "He tears off Grendel's arm. Then he kills Grendel's mother.",
    "He sails home a hero. Years later, the kingdom is his.",
    "Fifty winters later, a thief sneaks into a dragon's barrow.",
    "He goes after the dragon. Only Wiglaf stays with him.",
    "Beowulf dies. The Geats build his funeral pyre.",
    "That is the whole braid. Next, how the passages connect.",
]
STRANDS = {"gold": "Gold strand, the warrior", "blue": "Blue strand, the leader", "both": "Both strands", "snap": "The gold strand snaps"}

# ------------------------------------------------------------------ text evidence (the four passages in our document)
LABELS = [
    dict(img="grendel", alt="J. R. Skelton's painting of Grendel standing at the edge of the sea",
         title="Fighting Grendel without weapons.",
         quotes=[(["I have heard moreover that the monster scorns", "in his reckless way to use weapons;",
                   "therefore, to heighten Hygelac's fame", "and gladden his heart, I hereby renounce",
                   "sword and the shelter of the broad shield,", "the heavy war-board: hand to hand",
                   "is how it will be, a life-and-death", "fight with the fiend."],
                  "lines 433 to 440", ["reckless way", "to heighten Hygelac's fame", "I hereby renounce", "the heavy war-board"])],
         notes=["Beowulf demonstrates courage and fearlessness as he goes to fight Grendel.",
                "He has just arrived in Denmark and is telling King Hrothgar why he should be the one to face the monster. He gives up his weapons “to heighten Hygelac's fame,” so he is out to prove his strength and win glory, for his king and for himself.",
                "This is where our thesis starts: a young warrior using his strength for glory. Fifty years later he will use the same strength for his people."]),
    dict(img="wealhtheow", alt="J. R. Skelton's painting of Queen Wealhtheow serving mead in Heorot",
         title="Beowulf's confidence and desire for glory.",
         quotes=[(["And before he bedded down, Beowulf,", "that prince of goodness, proudly asserted:",
                   "“When it comes to fighting, I count myself", "as dangerous any day as Grendel.",
                   "So it won't be a cutting edge I'll wield", "to mow him down, easily as I might.”"],
                  "lines 675 to 680", ["that prince of goodness, proudly asserted", "as dangerous any day as Grendel", "easily as I might"])],
         notes=["Beowulf demonstrates self-pride and his reputation.",
                "On the night Grendel attacks, he boasts in front of the warriors in Heorot. He calls himself “as dangerous any day as Grendel,” which puts him on the same level as the monster, and “easily as I might” shows he knows a sword would be the smart choice.",
                "The narrator calls him “that prince of goodness” in the same sentence that says he “proudly asserted,” so the poem praises him and points out his pride at the same time."]),
    dict(img="gold-buckle", alt="The great gold buckle from the Sutton Hoo ship burial, covered in interlaced snakes",
         title="Beowulf as an older peaceful king.",
         quotes=[(["the wide kingdom", "reverted to Beowulf. He ruled it well",
                   "for fifty winters, grew old and wise", "as warden of the land"],
                  "lines 2207 to 2210", ["reverted", "fifty winters", "warden of the land"])],
         notes=["Beowulf demonstrates his growth as a leader and a ruler for fifty years.",
                "After Hygelac and then his son Heardred are killed, the kingdom of the Geats passes to Beowulf. “Warden of the land” is a word for a guardian, not a fighter, and after ruling that long he has grown “old and wise.”",
                "Next to these lines we put the great gold buckle from the Sutton Hoo ship burial, the grave of a real Anglo-Saxon king. Its thirteen ribbon snakes are woven together without a break, the way fifty years of political stability hold a kingdom together."]),
    dict(img="purse-lid", alt="The gold and garnet purse lid from the Sutton Hoo ship burial, with a man standing between two beasts",
         title="His responsibility as king before fighting the dragon.",
         quotes=[(["Beowulf spoke, made a formal boast", "for the last time: “I risked my life",
                   "often when I was young. Now I am old,", "but as king of the people I shall pursue this fight",
                   "for the glory of winning, if the evil one will only", "abandon his earth-fort and face me in the open.”"],
                  "lines 2510 to 2515", ["for the last time", "Now I am old", "as king of the people", "for the glory of winning"])],
         notes=["Beowulf demonstrates his logical thinking of fighting for the protection of his people.",
                "The dragon has burned the Geats' homes. Beowulf fights it because he feels it is his duty to protect them, and “king of the people” comes before “the glory of winning.” His courage and self-pride remain, though: he does not want to line up a huge army.",
                "The purse lid from the same royal grave shows a man standing alone between two beasts, which is how Beowulf goes to the dragon."]),
]

# ------------------------------------------------------------------ the braided map
MAP_NODES = [
    (1, 436, "433 to 440"), (2, 677, "675 to 680"), (3, 1843, "1842 to 1844"),
    (4, 2208, "2207 to 2210"), (5, 2512, "2510 to 2515"), (6, 2734, "2732 to 2736"),
]
MAP_CONNS = [
    ("A", 1, 5, "Repetition", 1, 0.24, "Same courage, a new reason.",
     "Young Beowulf gives up his weapons to make Hygelac famous. Old Beowulf will not line up a huge army against the dragon. His courage and self-pride stay the same, but his leadership shifts from personal fame to defending his people."),
    ("B", 2, 5, "Contrast", 1, 0.55, "Glory, then duty.",
     "At Heorot he boasts that he is as dangerous as Grendel, to prove his strength and glory. Before the dragon he speaks “as king of the people.” He fights the dragon because he feels it is his duty to protect them."),
    ("C", 3, 4, "Foreshadowing", -1, 0.5, "Hrothgar saw it coming.",
     "Hrothgar tells the young Beowulf he is “strong in body and mature in mind.” Those thanks forebode his next fifty years as a peaceful, strong ruler whose wisdom only grows."),
    ("D", 4, 6, "Development", -1, 0.35, "Fifty years of peace.",
     "The narrator says he “ruled it well for fifty winters.” Dying, Beowulf says it himself: no neighbouring king dared to face him. He used his strength and reputation to keep the kingdom at peace."),
    ("E", 5, 6, "Sacrifice", -1, 0.75, "He dies for his people.",
     "He goes to the dragon “as king of the people” and dies from the fight. His selflessness and sacrifice for his people is where he changes most."),
    ("F", 1, 2, "Repetition", 1, 0.8, "Proving himself.",
     "On his first night in Denmark he gives up his weapons and boasts that he is as dangerous as Grendel. Both moments are about proving his strength and building his reputation."),
]

# ------------------------------------------------------------------ critical source, counter-reading, curatorial statement
LEY_P8 = ("The fatal contradiction at the heart of heroic society was the tension between the heroic code, which demanded "
          "single-minded personal courage and individual prowess in battle, and the needs of a society that required "
          "prudence, foresight, and political wisdom in its leaders.")
LEY_P14 = ("By seeking personal glory in solitary combat, Beowulf wins the dragon's hoard but leaves his people leaderless "
           "and exposed to total destruction.")
CRITICAL = [
    "Leyerle, in his article “The Interlace Structure of Beowulf,” addresses many parts of Beowulf's character, "
    "including his heroic representation and how it clashed with his role as king. Leyerle acknowledges what it meant to be "
    "a hero in Anglo-Saxon culture and what it meant to be a king:",
    "However, despite Leyerle's claim that an Anglo-Saxon hero and a gracious ruler cannot be one and the same, Beowulf's "
    "evolution as a leader disputes this. Early in the poem, Beowulf displays a great ego. While Leyerle claims he never "
    "learns sacrifice, he mislabels Beowulf's ultimate sacrifice as selfishness:",
    "Beowulf died for his people after they abandoned him at the sight of a dragon. In doing so, Beowulf represents both "
    "the Anglo-Saxon image of a hero and of a leader, having the wisdom to bring an army to defend the kingdom and the "
    "courage to fight alone after abandonment, both of which display the raw individual strength of a hero and the "
    "political wisdom required of a leader.",
]
COUNTER = [
    dict(claim="Some may think Beowulf's leadership never changes throughout the poem, claiming he is a constant warrior brute who never puts his people's lives and interests first.",
         quote="This fight is not yours, nor is it up to any man except me to measure his strength against the monster or to prove his worth. I shall win the gold by my courage…",
         cite="lines 2532 to 2536",
         after="This points to his selfish desire for gold and personal victory, and since it is the last fight of his life, he never gets to repent or reflect on his selfish actions.",
         answer="When put in context, this quote loses its force. Beowulf is speaking directly to the small army he brought with him. He reveres the lives of his followers too much to risk them, and he reassures them with his statement of confidence, the belief and skill a warrior commander on the battlefield should lead with."),
    dict(claim="Another counterargument is that Beowulf's leadership is stagnant: despite his people's trust, he never grows beyond an egotistical individual fighter who leads through strength rather than wisdom.",
         quote="For fifty years I ruled this nation. No king of any neighbouring clan would dare face me with troops, none had the power to intimidate me.",
         cite="lines 2732 to 2736",
         after="",
         answer="While Beowulf always was a strong warrior, he uses his strength to become a strong king as well. This quote disproves that Beowulf is only a warrior brute, showing he uses his reputation to keep the kingdom at peace."),
]
CURATORIAL = [
    "Throughout the text, Beowulf is portrayed as a strong character and a leader among the Geats; however, despite his "
    "constant presence and praise as a leader, the way he rules his people changes over time. At the beginning of the "
    "poem, Beowulf rules through sheer power and bloodline, using his ego to keep others in check, as he does with Unferth.",
    "Throughout the poem, Beowulf never loses his strength or reputation, yet despite no physical difference, he still "
    "matures and becomes a leader respected for his wisdom and cunning. This sentiment is addressed in Hrothgar's thanks "
    "to Beowulf: “I have never heard so young a man make truer observations. You are strong in body and mature in "
    "mind” (1842 to 1844). Hrothgar's thanks forebode Beowulf's next fifty years as a peaceful, strong ruler whose "
    "wisdom only grows.",
    "A direct comparison of Beowulf's wisdom in applying his strength appears in the fights against Grendel and the "
    "dragon, especially in how he prepares for each. Beowulf changes most throughout the poem in his selflessness and "
    "sacrifice for his people, culminating in his final fight and death against the dragon. Beowulf addresses his change "
    "in ego in a formal boast as he and his army prepare to face the dragon: “I risked my life often when I was young. "
    "Now I am old, but as king of the people I shall pursue this fight” (2511 to 2513).",
    "Beowulf represents an intriguing model of leadership throughout history. Throughout his life, Beowulf has earned the "
    "trust and respect of the Geats as a leader; however, despite having no criticism to change his arrogant warrior ways, "
    "he does, becoming in the process a greater leader for his people, eventually sacrificing himself for them.",
]

# ------------------------------------------------------------------ the club credits (Sonny first: Sonny made the club)
LINKEDIN = "https://www.linkedin.com/in/sonny-rosas-bjugstad-b5180b40a/"
LEAD = dict(name="Sonny Rosas", role="Project lead. Planned the whole visual project, built this website and made this club.",
            statement=("I planned the entire visual project, helped write our main team brainstorm document, helped create our "
                       "main interpretive question, and added historical research on Sutton Hoo and Anglo-Saxon objects to the "
                       "project. For the written and historical evidence, I read lines 2207 to 2210, where Beowulf rules as the "
                       "“warden of the land,” along with the Sutton Hoo gold buckle. I showed how its 13 connected ribbon "
                       "snakes represent fifty years of political stability. I created the main connection in our exhibit by using "
                       "John Leyerle's idea of interwoven storytelling to design our two-strand braided map. This showed that "
                       "Beowulf's roles as a warrior and a leader develop at the same time instead of following a simple timeline. "
                       "To support our argument, I explained why we chose the Awwwards website design structure, which uses a "
                       "“scrollytelling” format, artwork that fills the whole screen, and an interactive design using "
                       "JavaScript. This design helps viewers follow the connected themes instead of reading a basic plot summary. "
                       "It also supports our group's argument that Beowulf's focus on fighting alone eventually weakened his "
                       "responsibility as king."))
CREW = [
    ("Elam Browen", "Driving question, thesis, our exhibit's name, the Leyerle paragraph."),
    ("Liam Daugherty", "Text evidence and the close readings."),
    ("Blake Sheppach", "The counter-reading and our answer to it."),
]


def marked(line, marks):
    t = esc(line)
    for m in marks:
        if esc(m) in t:
            t = t.replace(esc(m), f"<mark>{esc(m)}</mark>", 1)
    return t


def stop_html(k, s):
    q = "<br>".join(esc(l) for l in s["quote"])
    return f'''
        <div class="stop-layer" data-stop="{k}">
          <article class="stop" aria-labelledby="stop-{k + 1}-title">
            <p class="stop__meta mono"><span class="stop__num">{esc(s["num"])}</span><span class="thread thread--{s["strand"]}">{STRANDS[s["strand"]]}</span></p>
            <h2 class="stop__title" id="stop-{k + 1}-title">{esc(s["title"])}</h2>
            <blockquote class="stop__quote"><p>{q}</p></blockquote>
            <p class="stop__cite mono">{esc(s["cite"])}</p>
            <div class="stop__body">
              <p class="stop__para"><span class="stop__k mono">What happens</span>{esc(s["happens"])}</p>
              <p class="stop__para"><span class="stop__k mono">What it shows</span>{esc(s["shows"])}</p>
            </div>
            <p class="stop__label"><span class="stop__k mono">The connection</span>{esc(s["label"])}</p>
          </article>
        </div>'''


def label_html(n, L):
    from PIL import Image  # the image's real size, so the page never jumps when it loads
    iw, ih = Image.open(os.path.join(ROOT, "assets", "web", "plates", L["img"] + "-1000.webp")).size
    quotes = "\n".join(f'''            <blockquote class="ev__quote"><p>{"<br>".join(marked(l, marks) for l in lines)}</p></blockquote>
            <p class="ev__cite mono">Heaney, {cite}</p>''' for lines, cite, marks in L["quotes"])
    claim, *rest = L["notes"]
    notes = "\n".join(f"              <p>{esc(p)}</p>" for p in rest)
    return f'''
        <article class="ev" id="label-{n}" aria-labelledby="ev-{n}-title">
          <figure class="ev__fig">
            <div class="ev__frame"><img src="assets/web/plates/{L["img"]}-1000.webp" srcset="assets/web/plates/{L["img"]}-1000.webp 1000w, assets/web/plates/{L["img"]}.webp 2000w" sizes="(max-width: 900px) 92vw, 40vw" width="{iw}" height="{ih}" alt="{esc(L["alt"])}" loading="lazy" decoding="async"></div>
          </figure>
          <div class="ev__body">
            <p class="ev__num mono">Text evidence {n:02d}</p>
            <h3 class="ev__title" id="ev-{n}-title">{esc(L["title"])}</h3>
{quotes}
            <p class="ev__claim">{esc(claim)}</p>
            <div class="ev__notes">
{notes}
            </div>
          </div>
        </article>'''


def critical_html():
    a, b, c = CRITICAL
    return f'''
    <section id="critical" class="crit" aria-labelledby="crit-title">
      <div class="crit__col">
        <p class="sec__eyebrow mono">Critical source</p>
        <h2 class="sec__title" id="crit-title">Leyerle says a hero cannot also be a good king.</h2>
        <p class="crit__src mono">John Leyerle, &ldquo;The Interlace Structure of <i>Beowulf</i>&rdquo; (1967)</p>
        <div class="crit__body">
          <p>{esc(a)}</p>
          <blockquote class="crit__quote"><p>&ldquo;{esc(LEY_P8)}&rdquo;</p><cite class="mono">Leyerle, page 8</cite></blockquote>
          <p>{esc(b)}</p>
          <blockquote class="crit__quote"><p>&ldquo;{esc(LEY_P14)}&rdquo;</p><cite class="mono">Leyerle, page 14</cite></blockquote>
          <p>{esc(c)}</p>
        </div>
        <p class="crit__stance"><span class="mono">Our position</span>Beowulf's growth as a leader disputes Leyerle: he is both the hero and the leader.</p>
      </div>
    </section>'''


def counter_html():
    blocks = "".join(f'''
        <div class="ctr__pair">
          <div class="ctr__side ctr__side--them">
            <p class="ctr__k mono">{"The counter-reading" if i == 0 else "Another counter-reading"}</p>
            <p class="ctr__claim">{esc(c["claim"])}</p>
            <blockquote class="ctr__quote"><p>&ldquo;{esc(c["quote"])}&rdquo;</p><cite class="mono">Heaney, {c["cite"]}</cite></blockquote>
            {f'<p class="ctr__after">{esc(c["after"])}</p>' if c["after"] else ""}
          </div>
          <div class="ctr__side ctr__side--us">
            <p class="ctr__k mono">Our response</p>
            <p class="ctr__answer">{esc(c["answer"])}</p>
          </div>
        </div>''' for i, c in enumerate(COUNTER))
    return f'''
    <section id="counter" class="ctr" aria-labelledby="ctr-title">
      <div class="ctr__head">
        <p class="sec__eyebrow mono">Counter-reading</p>
        <h2 class="sec__title" id="ctr-title">Some say Beowulf never changes.</h2>
      </div>{blocks}
    </section>'''


def curatorial_html():
    paras = "\n".join(f"          <p>{esc(p)}</p>" for p in CURATORIAL)
    return f'''
    <section id="curatorial" class="cur" aria-labelledby="cur-title">
      <div class="cur__col">
        <p class="sec__eyebrow mono">Curatorial statement</p>
        <h2 class="sec__title" id="cur-title">Why this exhibit.</h2>
        <div class="cur__body">
{paras}
        </div>
      </div>
    </section>'''


def club_credits():
    crew = "".join(f'''
          <p class="club__credit"><span class="club__name">{esc(n)}</span><span class="club__role mono">{esc(r)}</span></p>''' for n, r in CREW)
    return f'''
        <aside class="club__lead" aria-label="Made by {esc(LEAD["name"])}">
          <p class="club__lead-k mono">Built by</p>
          <p class="club__lead-name">{esc(LEAD["name"])}</p>
          <p class="club__lead-role mono">{esc(LEAD["role"])}</p>
          <p class="club__lead-statement">{esc(LEAD["statement"])}</p>
          <a class="club__li" href="{LINKEDIN}" target="_blank" rel="noopener noreferrer" aria-label="{esc(LEAD["name"])} on LinkedIn (opens in a new tab)">
            <svg class="club__li-arrow" viewBox="0 0 46 20" aria-hidden="true"><path d="M44 10H5M12 3 4 10l8 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span class="club__li-logo"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45z"/></svg></span>
            <span class="club__li-k mono">My LinkedIn</span>
          </a>
        </aside>
        <div class="club__credits" aria-label="With">{crew}
        </div>'''


def version():
    """Short hash of the code, added to file URLs so browsers never run stale copies."""
    import hashlib
    h = hashlib.sha1()
    for d in ("js", "css"):
        for f in sorted(os.listdir(os.path.join(ROOT, d))):
            h.update(open(os.path.join(ROOT, d, f), "rb").read())
    return h.hexdigest()[:8]


def page():
    v = version()
    modules = sorted(f[:-3] for f in os.listdir(os.path.join(ROOT, "js")) if f.endswith(".js"))
    module_map = ",\n      ".join(f'"./js/{m}.js": "./js/{m}.js?v={v}"' for m in modules)
    stops = "".join(stop_html(k, s) for k, s in enumerate(FLIGHT))
    beats = "".join(f'''
        <p class="beat" data-beat="{k}">{esc(b)}</p>''' for k, b in enumerate(BEATS))
    labels = "".join(label_html(n, L) for n, L in enumerate(LABELS, 1))
    passages = "\n".join(
        f'          <li data-node="{i}" data-line="{line}" data-lines="{lines}"><strong>{i:02d}. {esc(FLIGHT[i - 1]["title"])}</strong> {esc(FLIGHT[i - 1]["label"])}</li>'
        for i, line, lines in MAP_NODES)
    conns = "\n".join(
        f'''          <li data-conn="{c}" data-from="{a}" data-to="{b}" data-type="{t}" data-side="{side}" data-t="{tt}">
            <h3>{esc(title)}</h3>
            <p>{esc(text)}</p>
          </li>''' for c, a, b, t, side, tt, title, text in MAP_CONNS)
    names = " &middot; ".join([esc(LEAD["name"])] + [esc(n) for n, _ in CREW])
    return f'''<!doctype html>
<html lang="en" class="no-js">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(TITLE)}</title>
  <meta name="description" content="{esc(QUESTION)} An interlaced exhibit on Beowulf.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;1,6..72,300;1,6..72,400&family=Geist:wght@400;500&family=Geist+Mono:wght@400;500&family=Unbounded:wght@500;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/main.css?v={v}">
  <script>document.documentElement.classList.replace('no-js', 'js');</script>
</head>
<body>
  <div id="gate" class="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title">
    <canvas class="gate__canvas" aria-hidden="true"></canvas>
    <div class="gate__ui">
      <p class="gate__eyebrow mono">An interlaced exhibit on Beowulf</p>
      <p class="gate__title" id="gate-title"><em>The Glory of</em> a King's Rule</p>
      <p class="gate__status mono" aria-live="polite">Loading the hall <span class="gate__pct">0%</span></p>
      <button class="gate__enter mono" type="button" disabled>Enter</button>
      <ol class="gate__checks mono" aria-live="polite"></ol>
    </div>
  </div>
  <canvas id="stage" aria-hidden="true"></canvas>

  <header class="nav" role="banner">
    <a class="pill pill--dark mono nav__map" href="#map">The map <span aria-hidden="true">&darr;</span></a>
  </header>

  <main>
    <section id="hero" class="hero" aria-labelledby="hero-title">
      <div class="hero__inner">
        <div class="hero__copy">
          <p class="hero__eyebrow mono">An interlaced exhibit on <i>Beowulf</i></p>
          <h1 id="hero-title" class="hero__title">
            <span class="line"><em>The Glory of</em></span>
            <span class="line">a King's Rule</span>
          </h1>
          <p class="hero__lede">{esc(QUESTION)}</p>
          <p class="hero__sub">{esc(SUBQUESTION)}</p>
          <a class="pill pill--light mono hero__cta" href="#guide">Start <span aria-hidden="true">&rarr;</span></a>
        </div>
        <div class="hero__lower">
          <p class="hero__k mono">Our thesis</p>
          <p class="claim__text">{esc(THESIS)}</p>
        </div>
        <figure class="hero__object">
          <img class="hero__fallback" src="assets/web/hero/helmet-800.webp" width="560" height="800"
               alt="The Sutton Hoo helmet, an Anglo-Saxon royal helmet with a bronze face mask and a dragon crest">
        </figure>
      </div>
    </section>

    <section id="guide" class="guide" aria-labelledby="guide-title">
      <div class="guide__col">
        <h2 id="guide-title" class="guide__title">Follow both strands at the same time.</h2>
        <p class="guide__body">The poem jumps between different times instead of telling the story in order, like the knotwork on Anglo-Saxon gold where strands go over and under each other. John Leyerle calls this interlace. We pulled out two strands:</p>
        <ul class="guide__key">
          <li class="guide__strand guide__strand--gold"><span class="guide__rope" aria-hidden="true"></span><p><strong>Gold</strong> is Beowulf as a warrior: courage, strength, glory.</p></li>
          <li class="guide__strand guide__strand--blue"><span class="guide__rope" aria-hidden="true"></span><p><strong>Blue</strong> is Beowulf as a leader: wisdom, protection, sacrifice.</p></li>
        </ul>
        <p class="guide__body guide__go">Scroll through the passages in the order they happen, then see how they connect.</p>
      </div>
    </section>

    <section id="flight" class="flight" aria-label="The passages">
      <div class="flight__sticky">{stops}{beats}
      </div>
    </section>

    <section id="map" class="map" aria-labelledby="map-title">
      <div class="map__sticky">
        <header class="map__head">
          <h2 id="map-title" class="map__title">How the passages connect.</h2>
          <p class="map__how">The line is the whole poem, from line 1 to line 3182, with the six passages where they really are. Each arch connects two of them. Click a word to read the connection.</p>
        </header>
        <div class="map__overlay" aria-hidden="true">
          <div class="map__ticks"></div>
          <div class="map__nodes"></div>
        </div>
        <div class="map__chips" role="group" aria-label="Connections"></div>
        <aside class="map__card" aria-live="polite">
          <p class="map__card-meta mono"></p>
          <h3 class="map__card-title"></h3>
          <p class="map__card-text"></p>
        </aside>
      </div>
      <div class="map__text">
        <ol class="map__passages">
{passages}
        </ol>
        <ol class="map__connections">
{conns}
        </ol>
      </div>
    </section>

    <section class="design-test" aria-labelledby="dt-title">
      <div class="design-test__col">
        <h2 id="dt-title" class="design-test__title">Why a braid and not a timeline.</h2>
        <p class="design-test__body">A normal timeline puts Grendel at the start and the dragon at the end, with fifty years in between, so it just looks like Beowulf grew up and got old. Using John Leyerle's idea of interlaced storytelling, our braid shows Beowulf's roles as a warrior and a leader developing at the same time, instead of one after the other.</p>
      </div>
    </section>

    <section id="evidence" class="evidence" aria-labelledby="evidence-title">
      <header class="evidence__head">
        <p class="sec__eyebrow mono">Text evidence</p>
        <h2 id="evidence-title" class="evidence__title">The four passages, in full.</h2>
        <p class="evidence__intro">{esc(ARGUMENT)}</p>
      </header>{labels}
    </section>
{critical_html()}
{counter_html()}

    <section id="works-cited" class="cited" aria-labelledby="cited-title">
      <div class="cited__col">
        <h2 class="cited__title" id="cited-title">Works Cited</h2>
        <ul class="cited__list">
          <li>Heaney, Seamus, translator. <i>Beowulf: A New Verse Translation</i>. Farrar, Straus and Giroux, 2000.</li>
          <li>Leyerle, John. &ldquo;The Interlace Structure of <i>Beowulf</i>.&rdquo; <i>University of Toronto Quarterly</i>, vol. 37, no. 1, 1967, pp. 1-17.</li>
        </ul>
        <h3 class="cited__sub mono">Images</h3>
        <ul class="cited__list">
          <li>Bacon, J. H. F. &ldquo;Beowulf Decapitates Grendel.&rdquo; <i>Hero-Myths and Legends of the British Race</i>, by M. I. Ebbutt, George G. Harrap, 1910. <i>Wikimedia Commons</i>.</li>
          <li>Dahl, Johan Christian. <i>Megalithic Grave near Vordingborg in Winter</i>. 1824-25, Museum der bildenden K&uuml;nste, Leipzig. <i>Wikimedia Commons</i>.</li>
          <li>Dicksee, Frank. <i>The Funeral of a Viking</i>. 1893, Manchester Art Gallery. <i>Wikimedia Commons</i>.</li>
          <li>Skelton, J. R., illustrator. <i>Stories of Beowulf Told to the Children</i>, by H. E. Marshall, T. C. and E. C. Jack, 1908. <i>Wikimedia Commons</i>.</li>
          <li><i>Sutton Hoo Helmet</i>. Early 7th century, British Museum, London. <i>Wikimedia Commons</i>.</li>
          <li><i>Great Gold Buckle</i>. Sutton Hoo ship burial, early 7th century, British Museum, London. <i>Wikimedia Commons</i>.</li>
          <li><i>Purse Lid</i>. Sutton Hoo ship burial, early 7th century, British Museum, London. <i>Wikimedia Commons</i>.</li>
        </ul>
        <h3 class="cited__sub mono">Skies, models and tools</h3>
        <ul class="cited__list">
          <li>Zaal, Greg, and Jarod Guest. <i>Kloppenheim 06 (Pure Sky)</i>. Photographed sky, <i>Poly Haven</i>, 2022, CC0. The dusk sky over the sea.</li>
          <li>Zaal, Greg. <i>Rogland Clear Night</i>. Photographed sky, <i>Poly Haven</i>, 2024, CC0. The Milky Way at the end, behind the map and on the first screen.</li>
          <li>Cock, James Ray, and Ulan Cabanilla. <i>Antique Estoc</i>. 3D model, <i>Poly Haven</i>, 2024, CC0. The sword on the first screen and at passage 01.</li>
          <li>Zaal, Greg. <i>Venice Sunset</i>. HDRI, <i>Poly Haven</i>, 2018, CC0. The light reflected in the metal.</li>
          <li>Yang, Lihe, et al. &ldquo;Depth Anything V2.&rdquo; 2024. Used to give the paintings depth.</li>
          <li>Pitbull, featuring TJR. &ldquo;Don&rsquo;t Stop the Party.&rdquo; <i>Global Warming</i>, Mr. 305 and RCA Records, 2012. The song in the club, from 0:15.</li>
          <li>The alarm sound and the Wojak green-screen videos in the ending, supplied by our group.</li>
        </ul>
      </div>
    </section>
{curatorial_html()}

    <section id="ending" class="ending" aria-label="End of the exhibit">
      <p class="ending__line"><em>The Glory of</em> a King's Rule</p>
      <p class="ending__names mono">{names}</p>
    </section>

    <section id="club" class="club" hidden aria-label="The Wojak club">
      <div class="club__stage">
        <canvas class="club__canvas" aria-hidden="true"></canvas>
        <h2 class="club__marquee">PLS GIVE US<span class="sr-only"> 100</span></h2>{club_credits()}
        <div class="club__controls">
          <button class="club__btn mono" type="button" data-act="mute">Mute</button>
          <button class="club__btn mono" type="button" data-act="confetti">More confetti</button>
          <button class="club__btn mono" type="button" data-act="top">Start over</button>
        </div>
      </div>
    </section>
  </main>

  <div class="nudge" aria-hidden="true">
    <span class="nudge__label mono">Keep scrolling</span>
    <span class="nudge__mouse"><i></i></span>
    <span class="nudge__chev"><i></i><i></i><i></i></span>
  </div>

  <div id="alarm" class="alarm" hidden>
    <div class="alarm__red" aria-hidden="true"></div>
    <div class="alarm__beams" aria-hidden="true"><i></i><i></i></div>
    <div class="alarm__edge" aria-hidden="true"></div>
    <div class="alarm__scan" aria-hidden="true"></div>
    <div class="alarm__panel" role="alert">
      <p class="alarm__head mono"><span class="alarm__dot"></span>Warning<span class="alarm__dot"></span></p>
      <p class="alarm__msg"><span class="alarm__type" data-text="You stopped scrolling.">You stopped scrolling.</span><span class="alarm__caret"></span></p>
      <p class="alarm__timer mono" aria-label="Time left"><span class="alarm__t">00:05.00</span></p>
      <p class="alarm__go mono">Keep scrolling <span class="alarm__arrow" aria-hidden="true">&darr;</span></p>
    </div>
    <div class="alarm__flash" aria-hidden="true"></div>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
  <script src="https://unpkg.com/lenis@1.1.18/dist/lenis.min.js"></script>
  <script type="importmap">
    {{ "imports": {{
      "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/",
      {module_map}
    }} }}
  </script>
  <script type="module" src="./js/main.js"></script>
</body>
</html>
'''


if __name__ == "__main__":
    out = os.path.join(ROOT, "index.html")
    open(out, "w", encoding="utf8").write(page())
    print("wrote", out)
