import datetime

LANGS = [
 # n, name, script, tags, card_is_special
 ("07","Gujarati","નમસ્તે","#gujarati #learngujarati #gujju #gujaratidiaspora",False),
 ("11","Punjabi","ਸਤ ਸ੍ਰੀ ਅਕਾਲ","#punjabi #learnpunjabi #gurmukhi #punjabidiaspora",False),
 ("03","Tamil","வணக்கம்","#tamil #learntamil #tamildiaspora #vanakkam",False),
 ("02","Bengali","নমস্কার","#bengali #bangla #learnbengali #bengalidiaspora",False),
 ("06","Urdu","سلام","#urdu #learnurdu #urdupoetry #urduzaban",False),
 ("04","Telugu","నమస్తే","#telugu #learntelugu #telugupeople",False),
 ("09","Malayalam","നമസ്കാരം","#malayalam #learnmalayalam #mallu #keralite",False),
 ("05","Marathi","नमस्कार","#marathi #learnmarathi #marathimulgi",False),
 ("08","Kannada","ನಮಸ್ಕಾರ","#kannada #learnkannada #nammakarnataka",False),
 ("10","Odia","ନମସ୍କାର","#odia #odisha #learnodia",False),
 ("01","Hindi","नमस्ते","#hindi #learnhindi #hindidiaspora",True),
 ("15","Nepali","नमस्ते","#nepali #nepal #learnnepali #nepalidiaspora",False),
 ("12","Assamese","নমস্কাৰ","#assamese #assam #axomiya",False),
 ("14","Sanskrit","नमस्ते","#sanskrit #samskritam #learnsanskrit",False),
 ("18","Konkani","नमस्कार","#konkani #goa #konkanilanguage",False),
 ("16","Sindhi","سلام","#sindhi #sindh #sindhiculture",False),
 ("17","Kashmiri","آداب","#kashmiri #kashmir #koshur",False),
 ("13","Maithili","नमस्कार","#maithili #mithila #bihar",False),
 ("21","Manipuri","ꯎꯏ","#manipuri #meitei #manipur #northeastindia",False),
 ("22","Santali","ᱡᱚᱦᱟᱨ","#santali #santal #olchiki #adivasi",False),
 ("19","Dogri","नमस्ते","#dogri #jammu #duggar",False),
 ("20","Bodo","जों","#bodo #bodoland #assam",False),
]


ISO = {"01":"hi","02":"bn","03":"ta","04":"te","05":"mr","06":"ur","07":"gu","08":"kn",
       "09":"ml","10":"or","11":"pa","12":"as","13":"mai","14":"sa","15":"ne","16":"sd",
       "17":"ks","18":"kok","19":"doi","20":"brx","21":"mni","22":"sat"}

PILLARS = [
 ("father-a1-they-answer-in-english-9x16","Reels + TikTok","The hook. Your strongest still, spent early.",
  "You have said it to that kid ten thousand times. You have never once heard it back.\n\nIt is not too late, and it is not their fault. Bolo teaches all 22 languages by speaking them out loud, and you can learn it together on one family plan. TryBolo.app\n\n#desiparents #diaspora #heritagelanguage #motherlanguage #indianparents #speakbolo #desikids #firstgen"),
 ("duo-b-scoreboard-1v22","Feed + Stories","The proof. People scan for their language and screenshot it.",
  "We checked. Of India's 22 official languages, Duolingo teaches one.\n\nBolo teaches 22.\n\nFind yours on the list. Then go speak it. TryBolo.app\n\n#duolingo #languagelearning #indianlanguages #desi #heritage #speakbolo #languageapp #southasian #motherlanguage #22languages"),
 ("ai-c-it-listens-9x16","Reels + X","The differentiator, and the strongest one in the AI set.",
  "Most speech practice compares your words to a transcript. If the right word comes out, you pass, accent and all.\n\nBolo sends your actual recording to an audio model, so it hears how you said it. TryBolo.app\n\n#ai #pronunciation #accent #languagelearning #speakbolo #edtech #voiceai #learnhindi"),
 ("father-b-every-single-time-9x16","Reels + TikTok","The funny one. Highest share rate in the set.",
  "Three languages go in. One comes out.\n\nIf you have lived this exact conversation, the app was built for your house. TryBolo.app\n\n#desitok #desiparents #diaspora #firstgen #browntok #heritagelanguage #speakbolo #relatable"),
 ("duo-a1-wall-of-22-9x16","Reels + Stories","Breadth. Lands harder once the count is established.",
  "22 official languages. Every single one, in its own script.\n\nDuo teaches 1 of them. Bolo teaches all 22.\n\nFind your family's language and start speaking it today. TryBolo.app\n\n#22languages #indianlanguages #desitok #heritagelanguage #motherlanguage #speakbolo #languagelearning #diaspora #southasian #learnyourlanguage"),
 ("father-f-made-by-a-father-9x16","Reels + Feed","The founder story. REWRITE THIS ONE IN YOUR OWN WORDS FIRST.",
  "American Born Confused Desis. I said કેમ છો? to my kids every day for years and every day I got \"I'm good.\"\n\nNo app taught our language, so I built the one I wanted: all 22, taught out loud, for the whole family. TryBolo.app\n\n#buildinpublic #desiparents #founder #diaspora #heritagelanguage #abcd #speakbolo #indieapp"),
 ("ai-a1-learning-your-pace-9x16","Reels + TikTok","The capability thesis.",
  "Say it out loud and Bolo hears it. Every attempt gets a real score and gets remembered against that exact phrase.\n\n22 languages, from the first one you try. TryBolo.app\n\n#ai #languagelearning #pronunciation #edtech #speakbolo #indianlanguages #aitools #languageapp"),
 ("father-c-not-just-your-house-1x1","Feed + Carousel","You are not alone in this. Widens the father angle past one language.",
  "Different language, same reply.\n\nEvery diaspora household is running the same script. 22 languages on Bolo, all taught out loud. TryBolo.app\n\n#diaspora #southasian #desitok #heritagelanguage #firstgen #speakbolo #indianlanguages"),
 ("duo-c-onramp-tamil-spanish","Reels + X","The sharpest fact you own. It needed the count established first.",
  "In April 2025 Duolingo added Tamil, Telugu, Bengali and Hindi.\n\nNot as languages you can learn. As menus. So a Tamil speaker could go learn Spanish.\n\nOur languages were the on-ramp to theirs. Bolo teaches all 22, out loud. TryBolo.app\n\n#tamil #languagelearning #edtech #desitok #heritagelanguage #speakbolo #southasian #indianlanguages #diaspora #learntamil"),
 ("ai-b-five-bands-9x16","Reels + Feed","Show your work. Converts skeptics.",
  "Perfect. Great. Good. Almost. Retry.\n\nEvery attempt lands on one of five bands with a real score behind it, not a green tick. And every one gets logged against that phrase, for you. TryBolo.app\n\n#languagelearning #pronunciation #ai #edtech #speakbolo #languageapp #learntamil"),
 ("father-d-family-plan-1x1","Feed","The commercial ask, once trust is built. Points at TryBolo.app.",
  "The kid is not going to learn it from an app on their own. They will learn it because you are doing it too.\n\nOne bill, up to four people, and everyone keeps their own progress. TryBolo.app\n\n#familygoals #desiparents #heritagelanguage #diaspora #speakbolo #learntogether #firstgen"),
 ("ai-d-remembers-1x1","Feed","The retention story.",
  "Every phrase gets its own review schedule, built from how well you actually said it.\n\nThe ones slipping away come back first. TryBolo.app\n\n#spacedrepetition #languagelearning #ai #memory #speakbolo #edtech #studytips"),
 ("duo-a2-wall-of-22-1x1","Feed + Carousel cover","Breadth again, cut for the grid.",
  "22 official languages. Every single one, in its own script.\n\nDuo teaches 1 of them. Bolo teaches all 22.\n\nFind your family's language and start speaking it today. TryBolo.app\n\n#22languages #indianlanguages #desitok #heritagelanguage #motherlanguage #speakbolo #languagelearning #diaspora #southasian #learnyourlanguage"),
 ("ai-e-talk-to-bolo-1x1","Feed","The feature people do not expect.",
  "A real back-and-forth conversation, out loud, in any of the 22 languages.\n\nHe talks, you talk back. No typing. TryBolo.app\n\n#ai #conversation #languagelearning #speakbolo #voiceai #learnhindi #edtech"),
 ("father-e-answer-back-1x1","Feed","The payoff. It only works after the setup has run for months.",
  "કેમ છો? into મજામાં!\n\nThat is the entire reason this app exists. Start them speaking today. TryBolo.app\n\n#desiparents #heritagelanguage #diaspora #motherlanguage #speakbolo #firstgen #gujarati"),
 ("ai-a2-learning-your-pace-1x1","Feed","Feed cut of the thesis. Closes the loop.",
  "Say it out loud and Bolo hears it. Every attempt gets a real score and gets remembered against that exact phrase.\n\n22 languages, from the first one you try. TryBolo.app\n\n#ai #languagelearning #pronunciation #edtech #speakbolo #indianlanguages #aitools #languageapp"),
 ("father-a2-they-answer-in-english-1x1","Feed","Held back on purpose so the back half is not all reruns.",
  "You have said it to that kid ten thousand times. You have never once heard it back.\n\nIt is not too late, and it is not their fault. 22 languages, all taught out loud. TryBolo.app\n\n#desiparents #diaspora #heritagelanguage #motherlanguage #indianparents #speakbolo #desikids #firstgen"),
]

def video_caption(name, script, tags):
    if name == "Gujarati":
        return ("કેમ છો? and all you ever get back is \"I'm good.\"\n\n"
                "She learned English for him. Nobody ever asked him to learn hers.\n\n"
                "22 South Asian languages, taught out loud. TryBolo.app\n\n"
                "What's the one thing your grandmother says that you only ever answer in English?\n\n"
                + tags + " #desitok #speakbolo")
    return (script + "\n\n"
            "That's how she starts every call. It's also where it ends.\n\n"
            "She learned English for him. Nobody ever asked him to learn hers.\n\n"
            "22 South Asian languages, taught out loud. TryBolo.app\n\n"
            "What's the one thing your grandmother says that you only ever answer in English?\n\n"
            + tags + " #desitok #speakbolo")

def card_caption(name, script, tags, special):
    if special:
        return ("Duolingo teaches Hindi. Fair enough.\n\n"
                "It's the only one of India's 22 official languages they teach. Bolo teaches all 22, "
                "and teaches them out loud with real pronunciation coaching.\n\n"
                "नमस्ते is where you start. TryBolo.app\n\n" + tags + " #speakbolo")
    return ("Duo forgot " + name + ". 😞\n\nBolo didn't.\n\n"
            + script + " is where you start. Say it out loud, get coached on the spot, "
            "and get your family's language back. TryBolo.app\n\n" + tags + " #speakbolo")

def build():
    """Week N, slot i -> day offset (N-1)*7 + i*2 from the launch day."""
    weeks = []
    for i,(num,name,script,tags,special) in enumerate(LANGS):
        wk = i+1
        base = (wk-1)*7
        slots = []
        slots.append(dict(off=base+0, kind="video",
            asset="Grandma d%s %s.mp4" % (num,name),
            where="TikTok + Reels",
            why=("Launch post. Gujarati leads because it is the network you can hand-deliver the "
                 "first fifty viewers from." if wk==1 else
                 "Video carries reach a still cannot buy. The script is on screen for the first 3 seconds."),
            cap=video_caption(name,script,tags)))
        slots.append(dict(off=base+2, kind="card",
            asset="duo-d%s-forgot-%s-%s.png" % (num,ISO[num],name.lower()),
            where="Feed + Stories",
            why="Second touch on the same community, different format.",
            cap=card_caption(name,script,tags,special)))
        pi = wk-1
        if pi < len(PILLARS):
            p = PILLARS[pi]
            slots.append(dict(off=base+4, kind="pillar", asset=p[0]+".png",
                              where=p[1], why=p[2], cap=p[3]))
        else:
            slots.append(dict(off=base+4, kind="repost",
                asset="Your best performer so far",
                where="Wherever it worked the first time",
                why=("The pillar set runs out here. This is a real cap, not a gap. Repost what already "
                     "earned reach, with the live Play badge if Android has shipped."),
                cap=""))
        weeks.append(dict(wk=wk,name=name,script=script,num=num,slots=slots,base=base))
    return weeks
