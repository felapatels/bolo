import type { Scene, StoryEndings } from "./types";

/**
 * The six storybooks, one per journey 1 fare zone.
 *
 * A SCENE IS SHOWN, THE LEARNER PICKS THE LINE THAT FITS IT, AND THE PICTURE
 * BECOMES WHAT HAPPENED BECAUSE THEY SAID IT. That last part is the whole
 * design: the graph converges on the next beat, so a five-scene book is five
 * setups plus fifteen consequences rather than 3^5 branches, but the choice is
 * visible instead of buried in the ledger.
 *
 * THE JOKE IS ALWAYS THE PICTURE, NEVER THE WORDS. Nothing in an image is
 * written down, so a line that does not fit is funny in every language at once
 * with nothing translated. That is the property that lets one Tier 1 still
 * serve all 22 languages, applied to comedy.
 *
 * WHY THE CHOICES ARE ORDINARY WORDS SAID AT THE WRONG MOMENT. Measured against
 * production 2026-08-24: the corpus has NO cow, dog, cat, bird or elephant in
 * any language, and "dance" exists in five. It is a phrasebook for visiting
 * family, so absurdity has to come from misapplication. "How much is this?"
 * said to a grandmother handing you free water is funnier than any noun the
 * corpus could have offered, and it is a phrase the learner will actually use.
 *
 * EVERY CONCEPT IS CHECKED AGAINST CONCEPT_COVERAGE. A book is only as wide as
 * its narrowest word: name one a language lacks and resolveScene() returns
 * null, the story stop vanishes there, and nothing fails. The floor is 18
 * languages, the owner's ruling, taken knowingly: the 36 concepts shared by all
 * 22 are numbers, greetings and relatives, and books built from those alone
 * cannot be funny.
 *
 *   greetings  19 languages      thali       18
 *   family     18                courtyard   18
 *   chai       19                photograph  18
 *
 * The media refs are placeholders. Tier 1 is a generated still, Tier 2 a silent
 * clip, Tier 3 a filmed speaker in one language. Nothing in the engine cares
 * which exists; it takes the richest it can use and falls back.
 */
/**
 * BOOK 1'S WORDS WERE REWRITTEN TO MATCH NEW ART on 2026-09-16, and ONLY the
 * words. The owner found the storybook boring ("it seems boring") and ruled
 * that it should play like a mad lib: pick a line that does not fit and
 * something funny happens, drawn big. The new stills were commissioned from
 * briefs in ~/bolo-supervisor/storybook-madlib/book1-door.json, and every
 * `situation` below is that file's `brief` verbatim, because the brief is also
 * the alt text and the narration, and alt text describing a different picture
 * is worse than none.
 *
 * NO concept, `fits` or `next` changed. The concepts were checked against every
 * language's corpus, and a rewrite that moved one would quietly shorten this
 * book somewhere nobody is looking.
 */
export const GREETINGS_SCENES: readonly Scene[] = [
  {
    id: "door-1",
    situation:
      "Early morning. She has opened her teal front door just a crack and peeks out at the viewer with one curious eye and raised eyebrows, one hand on the door edge, waiting to hear who it is. Soft low sunlight, milk pot on the step.",
    media: [{ tier: 1, ref: "scene/door-1/still", languageCode: null }],
    choices: [
      {
        concept: "good morning",
        next: "door-2",
        fits: true,
        outcome: {
          situation:
            "She flings the teal door wide open, beaming with her whole face, both arms out to wave the viewer inside, morning sunlight pouring past her into the hallway.",
        },
      },
      {
        concept: "goodbye",
        next: "door-2",
        fits: false,
        outcome: {
          situation:
            "Full melodrama: she stands on her own doorstep sobbing into a huge white handkerchief and waving it goodbye as if a ship is leaving, even though the viewer is right in front of her. Two neighbours lean out of their windows, baffled.",
        },
      },
      {
        concept: "how much is this?",
        next: "door-2",
        fits: false,
        outcome: {
          situation:
            "She has decided her house is for sale: a blank price tag on a string hangs from her front door knob, and she proudly lines up her belongings on the step for the viewer, a cooking pot, a chair, a birdcage with an indignant parrot, holding out her open palm for payment with a shrewd shopkeeper squint.",
        },
      },
    ],
  },
  {
    id: "door-2",
    situation:
      "She holds the teal door wide with one hand and gestures into the cool hallway with the other, eyebrows raised in a clear question: are you coming in?",
    media: [{ tier: 1, ref: "scene/door-2/still", languageCode: null }],
    choices: [
      {
        concept: "yes",
        next: "door-3",
        fits: true,
        outcome: {
          situation:
            "She bows like a grand hotel doorman, one arm sweeping towards the hallway, where a rolled-out red carpet runs inside. She is enormously pleased with herself.",
        },
      },
      {
        concept: "tomorrow",
        next: "door-3",
        fits: false,
        outcome: {
          situation:
            "The door is shut. Through the front window we see her in a nightcap, sitting bolt upright in a chair right behind the door beside an enormous alarm clock and a packed tiffin, determined to wait all night for the viewer to come back.",
        },
      },
      {
        concept: "congratulations",
        next: "door-3",
        fits: false,
        outcome: {
          situation:
            "Instant party: she wears a paper party hat and throws marigold petals into the air, while three neighbours burst into her hallway with a drum, a trumpet and a garland. She looks around wildly, thrilled, with no idea what they are celebrating.",
        },
      },
    ],
  },
  {
    id: "door-3",
    // NOT POURING YET, a requirement of the 2026-09-16 rewrite. The "water"
    // outcome IS the pour, so a setup that already shows one leaves that
    // punchline nothing to add, and the brief says so in capitals because an
    // image generator drifts towards the obvious next moment.
    situation:
      "Inside her sunny kitchen, she holds a heavy clay water jug up over an empty steel tumbler on the table, NOT pouring yet, jug perfectly still, looking at the viewer with raised eyebrows as if asking what they would like.",
    media: [{ tier: 1, ref: "scene/door-3/still", languageCode: null }],
    choices: [
      {
        concept: "water",
        next: "door-4",
        fits: true,
        outcome: {
          situation:
            "She pours a clear sparkling stream of water from the clay jug into the steel tumbler, which is filling up, smiling warmly, sunlight glinting in the water.",
        },
      },
      {
        concept: "how much is this?",
        next: "door-4",
        fits: false,
        outcome: {
          situation:
            "Deeply offended, she has slammed an old-fashioned brass cash register onto the kitchen table and is cranking its handle with a furious glare over her glasses, the clay jug tucked under her other arm, the tumbler still empty.",
        },
      },
      {
        concept: "fork",
        next: "door-4",
        fits: false,
        outcome: {
          situation:
            "She proudly presents the steel tumbler stuffed with dozens of forks sticking out like a bouquet of flowers, with more forks spilling across the table, beaming as if she has done exactly what was asked.",
        },
      },
    ],
  },
  {
    id: "door-4",
    situation:
      "She presses the full, cold steel tumbler of water into the viewer's two hands, visible at the bottom edge of the picture, and keeps her own hands wrapped around theirs for a moment, looking up warmly and expectantly.",
    media: [{ tier: 1, ref: "scene/door-4/still", languageCode: null }],
    choices: [
      {
        concept: "thank you",
        next: "door-5",
        fits: true,
        outcome: {
          situation:
            "She pats the viewer's hands around the tumbler, touched, one hand on her heart, eyes crinkled with happiness.",
        },
      },
      {
        concept: "sorry",
        next: "door-5",
        fits: false,
        outcome: {
          situation:
            "Total alarm: she is on her hands and knees under the kitchen table with a big magnifying glass hunting for whatever disaster happened, a mop and bucket beside her, while the viewer's hands hold the perfectly fine tumbler at the bottom edge.",
        },
      },
      {
        concept: "father-in-law",
        next: "door-5",
        fits: false,
        outcome: {
          situation:
            "She has spun round towards her hallway, and startled old men in white kurtas and dhotis are popping out of every doorway, cupboard and curtain, each one pointing at himself with a questioning face.",
        },
      },
    ],
  },
  {
    id: "door-5",
    situation:
      "Night. The brass lamp above her gate glows against a deep blue sky full of stars. She stands at the gate as the viewer leaves, one hand half raised, about to say something.",
    media: [{ tier: 1, ref: "scene/door-5/still", languageCode: null }],
    choices: [
      {
        concept: "good night",
        next: null,
        fits: true,
        outcome: {
          situation:
            "Under the glowing gate lamp she waves gently as the viewer walks away into the soft blue night, a cat curled asleep on the wall beside her, stars above.",
        },
      },
      {
        concept: "good morning",
        next: null,
        fits: false,
        outcome: {
          situation:
            "In the middle of the starry night she holds a rooster high over her head, crowing at the moon, while the whole street's windows light up and neighbours stumble out in pyjamas, rubbing their eyes and looking at the dark sky.",
        },
      },
      {
        concept: "welcome",
        next: null,
        fits: false,
        outcome: {
          situation:
            "She swings the gate wide open again and has dragged a rolled mattress, a pillow, a blanket and a steaming second dinner on a tray out to the gate, ready to host the viewer all over again at midnight, grinning.",
        },
      },
    ],
  },
];

/** Where the greetings book begins. */
export const GREETINGS_START_ID = "door-1";

/**
 * The three pictures book 1 can end on, chosen by how the read went (see
 * endingKind in engine.ts). Briefs from the same commissioned file as the
 * scenes above, 2026-09-16.
 *
 * THE ENDING IS WHERE THE MAD LIB PAYS OFF (owner, 2026-09-16, "it seems
 * boring"). Each wrong line already gets its own punchline picture; the ending
 * is the one picture that remembers ALL of them, so the disaster ending gathers
 * the rooster, the forks, the cash register and the confused old men from the
 * outcomes a learner can have caused.
 *
 * ONLY BOOK 1 HAS THESE. Endings are optional per book, and the other five
 * render no ending picture until their art exists.
 */
export const GREETINGS_ENDINGS: StoryEndings = {
  perfect: {
    situation:
      "The next morning: on the viewer's own doorstep sits a steel tiffin of sweets tied with a ribbon, and across the lane she waves happily from her window. Everything calm, sunny and kind.",
  },
  chaos: {
    situation:
      "The next morning she stands on her doorstep surrounded by laughing neighbours, acting out the viewer's visit with huge arm gestures, a fork in one hand and a party hat on her head. Everyone is laughing warmly.",
  },
  disaster: {
    situation:
      "The whole lane in joyful uproar: a rooster crowing on top of the gate lamp, forks scattered everywhere, the brass cash register on the doorstep, a line of confused old men in kurtas, a drummer and a trumpeter still playing, marigold petals in the air, and in the middle of it all she is laughing the hardest, arms thrown wide towards the viewer.",
  },
};

export const FAMILY_SCENES: readonly Scene[] = [
  {
    id: "table-1",
    situation:
      "A grandmother sets an empty steel tumbler in front of you at a family table and waits, smiling.",
    media: [{ tier: 1, ref: "scene/table-1/still", languageCode: null }],
    choices: [
      {
        concept: "water",
        next: "table-2",
        fits: true,
        outcome: {
          situation:
            "She fills the tumbler to the brim, beaming at you the whole time.",
        },
      },
      {
        concept: "how much is this?",
        next: "table-2",
        fits: false,
        outcome: {
          situation:
            "Scandalised, one hand at her chest, she pushes the tumbler further towards you to make quite sure it is free.",
        },
      },
      {
        concept: "grandson",
        next: "table-2",
        fits: false,
        outcome: {
          situation:
            "She scans the room for a boy, finds nobody, and pats your cheek anyway.",
        },
      },
    ],
  },
  {
    id: "table-2",
    situation:
      "She lifts the lid off a covered dish and steam climbs into the light.",
    media: [{ tier: 1, ref: "scene/table-2/still", languageCode: null }],
    choices: [
      {
        concept: "rice",
        next: "table-3",
        fits: true,
        outcome: {
          situation:
            "She spoons a mountain of rice onto your plate, then adds more to be safe.",
        },
      },
      {
        concept: "mother-in-law",
        next: "table-3",
        fits: false,
        outcome: {
          situation:
            "She straightens up very fast and stares at the doorway as though someone has just arrived.",
        },
      },
      {
        concept: "thursday",
        next: "table-3",
        fits: false,
        outcome: {
          situation:
            "She looks at the dish, then at you, then nods slowly as if that explains everything.",
        },
      },
    ],
  },
  {
    id: "table-3",
    situation:
      "A man carrying a stack of plates stops beside her and looks at you, waiting to be introduced.",
    media: [{ tier: 1, ref: "scene/table-3/still", languageCode: null }],
    choices: [
      {
        concept: "father",
        next: "table-4",
        fits: true,
        outcome: {
          situation:
            "He laughs, sets the plates down and shakes your hand with both of his.",
        },
      },
      {
        concept: "son-in-law",
        next: "table-4",
        fits: false,
        outcome: {
          situation:
            "His eyebrows go up and he turns to the grandmother, who is already thrilled by the idea.",
        },
      },
      {
        concept: "twenty",
        next: "table-4",
        fits: false,
        outcome: {
          situation:
            "He glances down at his stack of plates, counts them quickly, and looks back at you baffled.",
        },
      },
    ],
  },
  {
    id: "table-4",
    situation:
      "He sets the plates down and counts them out loud, then pauses on the last one and looks up.",
    media: [{ tier: 1, ref: "scene/table-4/still", languageCode: null }],
    choices: [
      {
        concept: "five",
        next: "table-5",
        fits: true,
        outcome: {
          situation:
            "He nods, satisfied, and slides the fifth plate across to you.",
        },
      },
      {
        concept: "one",
        next: "table-5",
        fits: false,
        outcome: {
          situation:
            "He gathers four plates back up and leaves a single one marooned in the middle of the table.",
        },
      },
      {
        concept: "yesterday",
        next: "table-5",
        fits: false,
        outcome: {
          situation:
            "He looks at the plates as though they might have gone off, and cautiously sniffs the top one.",
        },
      },
    ],
  },
  {
    id: "table-5",
    situation:
      "Everyone sits. The grandmother raises her tumbler at the full table and waits for you to name what you are all part of.",
    media: [{ tier: 1, ref: "scene/table-5/still", languageCode: null }],
    choices: [
      {
        concept: "family",
        next: null,
        fits: true,
        outcome: {
          situation:
            "The whole table raises their glasses back at you at once.",
        },
      },
      {
        concept: "goodbye",
        next: null,
        fits: false,
        outcome: {
          situation:
            "Every chair scrapes back and the entire family stands up to leave, the food untouched.",
        },
      },
      {
        concept: "saturday",
        next: null,
        fits: false,
        outcome: {
          situation:
            "They look at one another, shrug, and drink to Saturday anyway.",
        },
      },
    ],
  },
];

/** Where the family book begins. */
export const FAMILY_START_ID = "table-1";

export const CHAI_SCENES: readonly Scene[] = [
  {
    id: "chai-1",
    situation:
      "A chai stall uncle holds up an empty steel tray and waits to be told how many.",
    media: [{ tier: 1, ref: "scene/chai-1/still", languageCode: null }],
    choices: [
      {
        concept: "four",
        next: "chai-2",
        fits: true,
        outcome: {
          situation:
            "In one motion he sets four small glasses onto the tray.",
        },
      },
      {
        concept: "twenty",
        next: "chai-2",
        fits: false,
        outcome: {
          situation:
            "Unfazed, he begins covering every surface of the stall with glasses, and starts on the shelf behind him.",
        },
      },
      {
        concept: "how much is this?",
        next: "chai-2",
        fits: false,
        outcome: {
          situation:
            "He laughs, waves the question away, and holds the empty tray up again expectantly.",
        },
      },
    ],
  },
  {
    id: "chai-2",
    situation:
      "He has filled three glasses and looks up, kettle still tilted, waiting.",
    media: [{ tier: 1, ref: "scene/chai-2/still", languageCode: null }],
    choices: [
      {
        concept: "five",
        next: "chai-3",
        fits: true,
        outcome: {
          situation:
            "He pours two more, steam curling up between you.",
        },
      },
      {
        concept: "one",
        next: "chai-3",
        fits: false,
        outcome: {
          situation:
            "With enormous care he tips two of the poured glasses back into the kettle.",
        },
      },
      {
        concept: "sorry",
        next: "chai-3",
        fits: false,
        outcome: {
          situation:
            "He stops mid-pour, visibly hurt, and peers into the kettle to check whether the chai is all right.",
        },
      },
    ],
  },
  {
    id: "chai-3",
    situation:
      "A neat row of glasses stands along the counter, with one place left empty.",
    media: [{ tier: 1, ref: "scene/chai-3/still", languageCode: null }],
    choices: [
      {
        concept: "one",
        next: "chai-4",
        fits: true,
        outcome: {
          situation:
            "He fills the gap with a last glass and steps back to admire the finished row.",
        },
      },
      {
        concept: "nineteen",
        next: "chai-4",
        fits: false,
        outcome: {
          situation:
            "He looks at the single empty space, then at his own two hands, and shrugs helplessly.",
        },
      },
      {
        concept: "monday",
        next: "chai-4",
        fits: false,
        outcome: {
          situation:
            "He writes something on the wooden counter with his finger, nodding to himself.",
        },
      },
    ],
  },
  {
    id: "chai-4",
    situation:
      "He wipes his hands on a cloth and holds out an open palm to you.",
    media: [{ tier: 1, ref: "scene/chai-4/still", languageCode: null }],
    choices: [
      {
        concept: "how much is this?",
        next: "chai-5",
        fits: true,
        outcome: {
          situation:
            "He grins and holds up fingers, one at a time.",
        },
      },
      {
        concept: "twelve",
        next: "chai-5",
        fits: false,
        outcome: {
          situation:
            "He looks down at his own palm, counts his fingers twice, and comes up short.",
        },
      },
      {
        concept: "thank you",
        next: "chai-5",
        fits: false,
        outcome: {
          situation:
            "He beams, closes his hand entirely, and refuses to be paid at all.",
        },
      },
    ],
  },
  {
    id: "chai-5",
    situation:
      "He counts coins back into your hand, one at a time, watching your face.",
    media: [{ tier: 1, ref: "scene/chai-5/still", languageCode: null }],
    choices: [
      {
        concept: "thank you",
        next: null,
        fits: true,
        outcome: {
          situation:
            "He touches his heart and presses one more glass of chai on you.",
        },
      },
      {
        concept: "eight",
        next: null,
        fits: false,
        outcome: {
          situation:
            "He stops, tips the coins back into his palm, recounts them carefully, and begins again from the top.",
        },
      },
      {
        concept: "goodbye",
        next: null,
        fits: false,
        outcome: {
          situation:
            "He pours the change straight back into his own tin and waves you off very cheerfully.",
        },
      },
    ],
  },
];

/** Where the chai book begins. */
export const CHAI_START_ID = "chai-1";

export const THALI_SCENES: readonly Scene[] = [
  {
    id: "thali-1",
    situation:
      "A woman sets an empty steel thali down in front of you and waits, tea towel over her shoulder.",
    media: [{ tier: 1, ref: "scene/thali-1/still", languageCode: null }],
    choices: [
      {
        concept: "rice",
        next: "thali-2",
        fits: true,
        outcome: {
          situation:
            "She heaps rice into the middle of the thali and presses a dent into the top.",
        },
      },
      {
        concept: "knife",
        next: "thali-2",
        fits: false,
        outcome: {
          situation:
            "She fetches an enormous kitchen knife and lays it across the empty thali.",
        },
      },
      {
        concept: "congratulations",
        next: "thali-2",
        fits: false,
        outcome: {
          situation:
            "She looks at the empty plate, then at you, pleased and entirely lost.",
        },
      },
    ],
  },
  {
    id: "thali-2",
    situation:
      "She holds a small bowl over the thali, tipped and ready to pour.",
    media: [{ tier: 1, ref: "scene/thali-2/still", languageCode: null }],
    choices: [
      {
        concept: "bowl",
        next: "thali-3",
        fits: true,
        outcome: {
          situation:
            "She sets the little bowl neatly into the thali's ring.",
        },
      },
      {
        concept: "water",
        next: "thali-3",
        fits: false,
        outcome: {
          situation:
            "She pours water straight over the rice and watches it soak in, unbothered.",
        },
      },
      {
        concept: "father-in-law",
        next: "thali-3",
        fits: false,
        outcome: {
          situation:
            "She looks over her shoulder at the doorway, bowl still hovering in mid-air.",
        },
      },
    ],
  },
  {
    id: "thali-3",
    situation:
      "You have taken one mouthful and gone very still. She nudges a small covered pot towards you.",
    media: [{ tier: 1, ref: "scene/thali-3/still", languageCode: null }],
    choices: [
      {
        concept: "salt",
        next: "thali-4",
        fits: true,
        outcome: {
          situation:
            "She taps salt over your food and nods, satisfied.",
        },
      },
      {
        concept: "twenty",
        next: "thali-4",
        fits: false,
        outcome: {
          situation:
            "Without hesitating she upends the entire pot of salt onto the thali.",
        },
      },
      {
        concept: "goodbye",
        next: "thali-4",
        fits: false,
        outcome: {
          situation:
            "She lifts the thali away and starts washing it while you are still chewing.",
        },
      },
    ],
  },
  {
    id: "thali-4",
    situation:
      "There is nothing to eat with. She glances pointedly at a kitchen drawer.",
    media: [{ tier: 1, ref: "scene/thali-4/still", languageCode: null }],
    choices: [
      {
        concept: "spoon",
        next: "thali-5",
        fits: true,
        outcome: {
          situation:
            "She hands you a spoon, handle first, with a small nod.",
        },
      },
      {
        concept: "plate",
        next: "thali-5",
        fits: false,
        outcome: {
          situation:
            "She stacks a second empty thali on top of the first, food and all.",
        },
      },
      {
        concept: "monday",
        next: "thali-5",
        fits: false,
        outcome: {
          situation:
            "She opens the drawer, looks inside it for Monday, and closes it again.",
        },
      },
    ],
  },
  {
    id: "thali-5",
    situation:
      "You have finished. She is already reaching for the serving dish again.",
    media: [{ tier: 1, ref: "scene/thali-5/still", languageCode: null }],
    choices: [
      {
        concept: "no",
        next: null,
        fits: true,
        outcome: {
          situation:
            "She withdraws the dish, disappointed but entirely respectful about it.",
        },
      },
      {
        concept: "please",
        next: null,
        fits: false,
        outcome: {
          situation:
            "She piles on a second helping considerably larger than the first.",
        },
      },
      {
        concept: "welcome",
        next: null,
        fits: false,
        outcome: {
          situation:
            "She sits down opposite you, pulls the dish towards herself, and settles in to eat too.",
        },
      },
    ],
  },
];

/** Where the thali book begins. */
export const THALI_START_ID = "thali-1";

export const COURTYARD_SCENES: readonly Scene[] = [
  {
    id: "yard-1",
    situation:
      "An aunt looks up from a washing line in a sunlit courtyard and asks where you have come from.",
    media: [{ tier: 1, ref: "scene/yard-1/still", languageCode: null }],
    choices: [
      {
        concept: "here",
        next: "yard-2",
        fits: true,
        outcome: {
          situation:
            "She nods, pleased, and points at the house immediately next door.",
        },
      },
      {
        concept: "there",
        next: "yard-2",
        fits: false,
        outcome: {
          situation:
            "She shades her eyes and squints at the far horizon, searching a very long way off.",
        },
      },
      {
        concept: "grandfather",
        next: "yard-2",
        fits: false,
        outcome: {
          situation:
            "She puts the washing down and scans the whole courtyard for an old man who is not there.",
        },
      },
    ],
  },
  {
    id: "yard-2",
    situation:
      "She holds a peg between her teeth and asks when you arrived.",
    media: [{ tier: 1, ref: "scene/yard-2/still", languageCode: null }],
    choices: [
      {
        concept: "yesterday",
        next: "yard-3",
        fits: true,
        outcome: {
          situation:
            "She nods and pegs up another shirt without breaking rhythm.",
        },
      },
      {
        concept: "now",
        next: "yard-3",
        fits: false,
        outcome: {
          situation:
            "She looks startled and cranes past you for the luggage that is plainly not there.",
        },
      },
      {
        concept: "rice",
        next: "yard-3",
        fits: false,
        outcome: {
          situation:
            "She drops the peg, delighted, and heads straight for the kitchen.",
        },
      },
    ],
  },
  {
    id: "yard-3",
    situation:
      "She points at the courtyard gate and asks when you are leaving.",
    media: [{ tier: 1, ref: "scene/yard-3/still", languageCode: null }],
    choices: [
      {
        concept: "tomorrow",
        next: "yard-4",
        fits: true,
        outcome: {
          situation:
            "She looks sad and pegs the next shirt up very slowly.",
        },
      },
      {
        concept: "night",
        next: "yard-4",
        fits: false,
        outcome: {
          situation:
            "She immediately starts pulling the whole washing line down in a hurry.",
        },
      },
      {
        concept: "twenty",
        next: "yard-4",
        fits: false,
        outcome: {
          situation:
            "She looks at the gate, then at you, and tries to hold up twenty fingers she does not have.",
        },
      },
    ],
  },
  {
    id: "yard-4",
    situation:
      "She holds out her arm, offering to walk you to the road.",
    media: [{ tier: 1, ref: "scene/yard-4/still", languageCode: null }],
    choices: [
      {
        concept: "please",
        next: "yard-5",
        fits: true,
        outcome: {
          situation:
            "She takes your arm at once, thoroughly delighted.",
        },
      },
      {
        concept: "sorry",
        next: "yard-5",
        fits: false,
        outcome: {
          situation:
            "She withdraws her arm and pats your shoulder consolingly instead.",
        },
      },
      {
        concept: "congratulations",
        next: "yard-5",
        fits: false,
        outcome: {
          situation:
            "She throws both arms up in celebration in the middle of the courtyard, washing forgotten.",
        },
      },
    ],
  },
  {
    id: "yard-5",
    situation:
      "At the gate she stops and raises one hand.",
    media: [{ tier: 1, ref: "scene/yard-5/still", languageCode: null }],
    choices: [
      {
        concept: "goodbye",
        next: null,
        fits: true,
        outcome: {
          situation:
            "She waves steadily until you are out of sight.",
        },
      },
      {
        concept: "hello",
        next: null,
        fits: false,
        outcome: {
          situation:
            "She lowers her hand, takes your elbow, and walks you straight back into the courtyard.",
        },
      },
      {
        concept: "good news",
        next: null,
        fits: false,
        outcome: {
          situation:
            "She leans in close, eyes wide, waiting to hear it, and hears nothing at all.",
        },
      },
    ],
  },
];

/** Where the courtyard book begins. */
export const COURTYARD_START_ID = "yard-1";

export const PHOTOGRAPH_SCENES: readonly Scene[] = [
  {
    id: "photo-1",
    situation:
      "A boy stands frozen over a broken plate, looking up at you.",
    media: [{ tier: 1, ref: "scene/photo-1/still", languageCode: null }],
    choices: [
      {
        concept: "sorry",
        next: "photo-2",
        fits: true,
        outcome: {
          situation:
            "He lets out a breath, and the grandmother ruffles his hair on her way past.",
        },
      },
      {
        concept: "congratulations",
        next: "photo-2",
        fits: false,
        outcome: {
          situation:
            "He grins enormously and takes a low bow over the broken pieces.",
        },
      },
      {
        concept: "rice",
        next: "photo-2",
        fits: false,
        outcome: {
          situation:
            "He looks at the shards, then goes and fetches a bowl of rice, confused but willing.",
        },
      },
    ],
  },
  {
    id: "photo-2",
    situation:
      "A woman holds out an opened letter, beaming, her hands shaking slightly.",
    media: [{ tier: 1, ref: "scene/photo-2/still", languageCode: null }],
    choices: [
      {
        concept: "congratulations",
        next: "photo-3",
        fits: true,
        outcome: {
          situation:
            "She hugs the letter to her chest with both arms.",
        },
      },
      {
        concept: "sorry",
        next: "photo-3",
        fits: false,
        outcome: {
          situation:
            "Her face falls and she turns the letter over to read it again more carefully.",
        },
      },
      {
        concept: "how much is this?",
        next: "photo-3",
        fits: false,
        outcome: {
          situation:
            "She looks at the letter, then at you, and turns it round to show you there is no price on it.",
        },
      },
    ],
  },
  {
    id: "photo-3",
    situation:
      "A grandfather has fallen asleep bolt upright mid-sentence, one hand still raised.",
    media: [{ tier: 1, ref: "scene/photo-3/still", languageCode: null }],
    choices: [
      {
        concept: "good night",
        next: "photo-4",
        fits: true,
        outcome: {
          situation:
            "Someone drapes a shawl over his shoulders without waking him.",
        },
      },
      {
        concept: "good morning",
        next: "photo-4",
        fits: false,
        outcome: {
          situation:
            "He jolts awake and starts the entire sentence again from the very beginning.",
        },
      },
      {
        concept: "twenty",
        next: "photo-4",
        fits: false,
        outcome: {
          situation:
            "He mutters a number in his sleep and settles deeper into the chair.",
        },
      },
    ],
  },
  {
    id: "photo-4",
    situation:
      "Someone presses a wrapped parcel into your hands and steps back to watch.",
    media: [{ tier: 1, ref: "scene/photo-4/still", languageCode: null }],
    choices: [
      {
        concept: "thank you",
        next: "photo-5",
        fits: true,
        outcome: {
          situation:
            "They beam and wave your thanks away with both hands.",
        },
      },
      {
        concept: "how much is this?",
        next: "photo-5",
        fits: false,
        outcome: {
          situation:
            "Every single person in the room turns to look at you at once.",
        },
      },
      {
        concept: "goodbye",
        next: "photo-5",
        fits: false,
        outcome: {
          situation:
            "They take the parcel back gently and set it on the table for some other day.",
        },
      },
    ],
  },
  {
    id: "photo-5",
    situation:
      "The whole family crowds together for a photograph, leaving a gap in the middle for you.",
    media: [{ tier: 1, ref: "scene/photo-5/still", languageCode: null }],
    choices: [
      {
        concept: "family",
        next: null,
        fits: true,
        outcome: {
          situation:
            "Everyone squeezes in around you and the picture is taken.",
        },
      },
      {
        concept: "father-in-law",
        next: null,
        fits: false,
        outcome: {
          situation:
            "Three separate people turn to look at the same man, who shrugs.",
        },
      },
      {
        concept: "thursday",
        next: null,
        fits: false,
        outcome: {
          situation:
            "They all hold their smiles, frozen, waiting for you to explain.",
        },
      },
    ],
  },
];

/** Where the photograph book begins. */
export const PHOTOGRAPH_START_ID = "photo-1";

