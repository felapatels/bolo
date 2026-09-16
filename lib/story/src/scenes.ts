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
/**
 * BOOK 1'S WORDS ARE READ ALOUD, SO THEY ARE STORY PROSE, NOT ART PROMPTS
 * (2026-09-16, the mad-lib rewrite). The narrator speaks `situation`, and the
 * first pass put the illustrator's prompts here ("the viewer", "NOT pouring
 * yet"), which a learner would have heard. The prompts that drew these pictures
 * live outside the repo in ~/bolo-supervisor/storybook-madlib/book1-door.json;
 * these lines describe the same pictures in the voice of the book.
 */
export const GREETINGS_SCENES: readonly Scene[] = [
  {
    id: "door-1",
    situation:
      "You knock next door. Your neighbour opens the door just a crack and peeks out at you with one curious eye.",
    media: [{ tier: 1, ref: "scene/door-1/still", languageCode: null }],
    choices: [
      {
        concept: "good morning",
        next: "door-2",
        fits: true,
        outcome: {
          situation:
            "She flings the door wide open and waves you inside with both arms.",
        },
      },
      {
        concept: "goodbye",
        next: "door-2",
        fits: false,
        outcome: {
          situation:
            "She bursts into tears and waves her hanky goodbye, even though you have not gone anywhere. The neighbours stare.",
        },
      },
      {
        concept: "how much is this?",
        next: "door-2",
        fits: false,
        outcome: {
          situation:
            "She decides her house is for sale, lines up her pot, her chair and a very cross parrot on the step, and holds out her hand.",
        },
      },
    ],
  },
  {
    id: "door-2",
    situation:
      "She holds the door open and points down the hallway. Coming in?",
    media: [{ tier: 1, ref: "scene/door-2/still", languageCode: null }],
    choices: [
      {
        concept: "yes",
        next: "door-3",
        fits: true,
        outcome: {
          situation:
            "She bows like a hotel doorman. There is a red carpet. Nobody knows where it came from.",
        },
      },
      {
        concept: "tomorrow",
        next: "door-3",
        fits: false,
        outcome: {
          situation:
            "She shuts the door, puts on her nightcap, and sits beside a giant alarm clock to wait for you until tomorrow.",
        },
      },
      {
        concept: "congratulations",
        next: "door-3",
        fits: false,
        outcome: {
          situation:
            "Party hat on, petals in the air, and a drummer and a trumpeter burst in. She has no idea what everyone is celebrating.",
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
      "In her kitchen she hugs a big clay jug and looks at your empty tumbler, then at you. What would you like?",
    media: [{ tier: 1, ref: "scene/door-3/still", languageCode: null }],
    choices: [
      {
        concept: "water",
        next: "door-4",
        fits: true,
        outcome: {
          situation:
            "She lifts the jug high and pours. Not a drop is spilled. Well, almost.",
        },
      },
      {
        concept: "how much is this?",
        next: "door-4",
        fits: false,
        outcome: {
          situation:
            "Deeply offended, she slams an old cash register onto the table and starts ringing you up.",
        },
      },
      {
        concept: "fork",
        next: "door-4",
        fits: false,
        outcome: {
          situation:
            "She proudly hands you a tumbler full of forks. A lot of forks.",
        },
      },
    ],
  },
  {
    id: "door-4",
    situation:
      "She presses the cold tumbler into your hands and holds on for a moment, waiting.",
    media: [{ tier: 1, ref: "scene/door-4/still", languageCode: null }],
    choices: [
      {
        concept: "thank you",
        next: "door-5",
        fits: true,
        outcome: {
          situation:
            "She puts a hand on her heart, very pleased with you.",
        },
      },
      {
        concept: "sorry",
        next: "door-5",
        fits: false,
        outcome: {
          situation:
            "Something terrible must have happened. She crawls under the table with a magnifying glass to find it.",
        },
      },
      {
        concept: "father-in-law",
        next: "door-5",
        fits: false,
        outcome: {
          situation:
            "She turns to the hallway, and old men pop out of every door and cupboard, each one asking if you meant him.",
        },
      },
    ],
  },
  {
    id: "door-5",
    situation:
      "It is night. At her gate, under the lamp, she raises a hand as you leave.",
    media: [{ tier: 1, ref: "scene/door-5/still", languageCode: null }],
    choices: [
      {
        concept: "good night",
        next: null,
        fits: true,
        outcome: {
          situation:
            "She waves you off into the quiet night. The cat is already asleep.",
        },
      },
      {
        concept: "good morning",
        next: null,
        fits: false,
        outcome: {
          situation:
            "It is midnight, and she holds up a rooster. It crows. The whole street wakes up.",
        },
      },
      {
        concept: "welcome",
        next: null,
        fits: false,
        outcome: {
          situation:
            "She drags out a mattress, a pillow and a second dinner. Apparently you are staying.",
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
 * EVERY BOOK HAS THESE SINCE 2026-09-16, when books 2 to 6 got their mad-lib
 * art the same day. Endings stay optional in the type, so a future book can
 * ship before its ending art does and render no ending picture meanwhile.
 */
export const GREETINGS_ENDINGS: StoryEndings = {
  perfect: {
    situation:
      "The next morning, a tiffin of sweets is waiting on your step, and she waves from across the lane.",
  },
  chaos: {
    situation:
      "By morning she is telling the whole lane about your visit, fork in hand, and everyone is laughing.",
  },
  disaster: {
    situation:
      "The rooster is on the lamp, the band is still playing, and there are forks everywhere. She has never had a better day.",
  },
};

/**
 * BOOKS 2 TO 6 WERE REWRITTEN AS WILDER STORIES WITH NEW ART on 2026-09-16,
 * the owner's approval after book 1's mad-lib pass, and ONLY the words moved.
 * Every setup `situation` and every outcome `situation` below, and each book's
 * three endings, is the `prose` field of
 * ~/bolo-supervisor/storybook-madlib/india-<table|chai|thali|yard|photo>.json,
 * copied in by script. Prose, not the `brief` beside it, for the reason book 1
 * learned in 6f891ef0: the narrator reads this aloud and the brief talks to an
 * illustrator. NO concept, `fits` or `next` changed, and the story-books test
 * pins every book's graph so that stays deliberate.
 */
export const FAMILY_SCENES: readonly Scene[] = [
  {
    id: "table-1",
    situation:
      "A cow has taken your seat at the family table. Grandmother holds up a jug and waits for you to say what goes in the tumbler.",
    media: [{ tier: 1, ref: "scene/table-1/still", languageCode: null }],
    choices: [
      {
        concept: "water",
        next: "table-2",
        fits: true,
        outcome: {
          situation:
            "She pours water. The cow drinks it very politely.",
        },
      },
      {
        concept: "how much is this?",
        next: "table-2",
        fits: false,
        outcome: {
          situation:
            "Grandmother decides you want to buy the cow, and starts the sale.",
        },
      },
      {
        concept: "grandson",
        next: "table-2",
        fits: false,
        outcome: {
          situation:
            "Grandmother adopts the cow as her grandson. Bonnet and all.",
        },
      },
    ],
  },
  {
    id: "table-2",
    situation:
      "Grandmother lifts the lid off a pot as big as a bathtub. What would you like?",
    media: [{ tier: 1, ref: "scene/table-2/still", languageCode: null }],
    choices: [
      {
        concept: "rice",
        next: "table-3",
        fits: true,
        outcome: {
          situation:
            "Rice. She serves it with a garden spade. It is a lot of rice.",
        },
      },
      {
        concept: "mother-in-law",
        next: "table-3",
        fits: false,
        outcome: {
          situation:
            "A very old, very strict great-grandmother bursts out of the pot. Everyone hides.",
        },
      },
      {
        concept: "thursday",
        next: "table-3",
        fits: false,
        outcome: {
          situation:
            "Apparently it is Thursday Rice Day. Nobody has heard of it, but everyone is celebrating.",
        },
      },
    ],
  },
  {
    id: "table-3",
    situation:
      "A man rides a scooter straight into the dining room and waits to be introduced. Who is he?",
    media: [{ tier: 1, ref: "scene/table-3/still", languageCode: null }],
    choices: [
      {
        concept: "father",
        next: "table-4",
        fits: true,
        outcome: {
          situation:
            "It is your father. He hugs you with his helmet still on.",
        },
      },
      {
        concept: "son-in-law",
        next: "table-4",
        fits: false,
        outcome: {
          situation:
            "Grandmother thinks you said he is marrying into the family. The band arrives. So does the veil.",
        },
      },
      {
        concept: "twenty",
        next: "table-4",
        fits: false,
        outcome: {
          situation:
            "Twenty of him ride in. Nobody knows which one is the real one.",
        },
      },
    ],
  },
  {
    id: "table-4",
    situation:
      "He juggles the plates, catches four, and holds up the next one. How many?",
    media: [{ tier: 1, ref: "scene/table-4/still", languageCode: null }],
    choices: [
      {
        concept: "five",
        next: "table-5",
        fits: true,
        outcome: {
          situation:
            "Five. He lands them perfectly. The cow applauds.",
        },
      },
      {
        concept: "one",
        next: "table-5",
        fits: false,
        outcome: {
          situation:
            "One. He throws all the other plates out of the window.",
        },
      },
      {
        concept: "yesterday",
        next: "table-5",
        fits: false,
        outcome: {
          situation:
            "He hands you yesterday's plates. Nobody has washed them since. A bat lives there now.",
        },
      },
    ],
  },
  {
    id: "table-5",
    situation:
      "Everyone raises a tumbler, even the cow. They wait for you to make the toast.",
    media: [{ tier: 1, ref: "scene/table-5/still", languageCode: null }],
    choices: [
      {
        concept: "family",
        next: null,
        fits: true,
        outcome: {
          situation:
            "Family. Everyone cheers, and the cow gets hugged the hardest.",
        },
      },
      {
        concept: "goodbye",
        next: null,
        fits: false,
        outcome: {
          situation:
            "Goodbye. Everyone leaves at once, through every exit, including the chimney.",
        },
      },
      {
        concept: "saturday",
        next: null,
        fits: false,
        outcome: {
          situation:
            "Saturday! The dinner becomes a dance party. The cow can dance.",
        },
      },
    ],
  },
];

/** Where the family book begins. */
export const FAMILY_START_ID = "table-1";

/** The three pictures the family book can end on (see GREETINGS_ENDINGS). */
export const FAMILY_ENDINGS: StoryEndings = {
  perfect: {
    situation:
      "A perfect dinner. The cow is now officially part of the family.",
  },
  chaos: {
    situation:
      "Dinner was loud, messy, and everyone had a wonderful time. The cow fell asleep on the table.",
  },
  disaster: {
    situation:
      "Scooters, a wedding band, and a great-grandmother on the ceiling fan. Grandmother says it was the best dinner in years.",
  },
};

export const CHAI_SCENES: readonly Scene[] = [
  {
    id: "chai-1",
    situation:
      "Your friends today are an elephant, a monkey and a goat. The chai uncle holds up an empty tray. How many glasses?",
    media: [{ tier: 1, ref: "scene/chai-1/still", languageCode: null }],
    choices: [
      {
        concept: "four",
        next: "chai-2",
        fits: true,
        outcome: {
          situation:
            "Four. One each, and one for you.",
        },
      },
      {
        concept: "twenty",
        next: "chai-2",
        fits: false,
        outcome: {
          situation:
            "Twenty. A whole zoo shows up to drink them.",
        },
      },
      {
        concept: "how much is this?",
        next: "chai-2",
        fits: false,
        outcome: {
          situation:
            "You ask the price, and the monkey runs off with all the money.",
        },
      },
    ],
  },
  {
    id: "chai-2",
    situation:
      "A peacock lands and wants chai too. He has poured three. How many altogether?",
    media: [{ tier: 1, ref: "scene/chai-2/still", languageCode: null }],
    choices: [
      {
        concept: "five",
        next: "chai-3",
        fits: true,
        outcome: {
          situation:
            "Five. He pours from a great height and does not spill a drop.",
        },
      },
      {
        concept: "one",
        next: "chai-3",
        fits: false,
        outcome: {
          situation:
            "One. So he drinks all the others himself.",
        },
      },
      {
        concept: "sorry",
        next: "chai-3",
        fits: false,
        outcome: {
          situation:
            "He is so sad you said sorry that his tears fill the kettle. The elephant brings a hanky.",
        },
      },
    ],
  },
  {
    id: "chai-3",
    situation:
      "A row of glasses, with one gap. The monkey is sitting in it, waiting.",
    media: [{ tier: 1, ref: "scene/chai-3/still", languageCode: null }],
    choices: [
      {
        concept: "one",
        next: "chai-4",
        fits: true,
        outcome: {
          situation:
            "One more glass. The monkey is very civilised about it.",
        },
      },
      {
        concept: "nineteen",
        next: "chai-4",
        fits: false,
        outcome: {
          situation:
            "He stacks nineteen more glasses. The elephant holds the top one.",
        },
      },
      {
        concept: "monday",
        next: "chai-4",
        fits: false,
        outcome: {
          situation:
            "He closes the stall and goes to sleep until Monday.",
        },
      },
    ],
  },
  {
    id: "chai-4",
    situation:
      "He wipes his hands and holds out his palm. Time to pay.",
    media: [{ tier: 1, ref: "scene/chai-4/still", languageCode: null }],
    choices: [
      {
        concept: "how much is this?",
        next: "chai-5",
        fits: true,
        outcome: {
          situation:
            "He shows you the price on his fingers. The monkey helps.",
        },
      },
      {
        concept: "twelve",
        next: "chai-5",
        fits: false,
        outcome: {
          situation:
            "Twelve? He runs out of fingers and borrows the elephant's toes.",
        },
      },
      {
        concept: "thank you",
        next: "chai-5",
        fits: false,
        outcome: {
          situation:
            "He is so touched that he gives you the whole chai stall and goes home.",
        },
      },
    ],
  },
  {
    id: "chai-5",
    situation:
      "He counts your change into your hand, one coin at a time.",
    media: [{ tier: 1, ref: "scene/chai-5/still", languageCode: null }],
    choices: [
      {
        concept: "thank you",
        next: null,
        fits: true,
        outcome: {
          situation:
            "He touches his heart and gives you one more chai for the road.",
        },
      },
      {
        concept: "eight",
        next: null,
        fits: false,
        outcome: {
          situation:
            "Eight? The tin explodes into a shower of coins.",
        },
      },
      {
        concept: "goodbye",
        next: null,
        fits: false,
        outcome: {
          situation:
            "Goodbye! The whole stall climbs onto the elephant and leaves.",
        },
      },
    ],
  },
];

/** Where the chai book begins. */
export const CHAI_START_ID = "chai-1";

/** The three pictures the chai book can end on (see GREETINGS_ENDINGS). */
export const CHAI_ENDINGS: StoryEndings = {
  perfect: {
    situation:
      "Sunset, a warm glass of chai, and the best customers in town.",
  },
  chaos: {
    situation:
      "The stall is a mess, the monkey has the towel, and the uncle cannot stop laughing.",
  },
  disaster: {
    situation:
      "The stall is on the elephant, the money is in the sky, and a camel wants chai. Best day of business ever.",
  },
};

export const THALI_SCENES: readonly Scene[] = [
  {
    id: "thali-1",
    situation:
      "You brought a jar of crunchy bugs as a gift. Aunty looks at it, then at your empty plate. What would you like?",
    media: [{ tier: 1, ref: "scene/thali-1/still", languageCode: null }],
    choices: [
      {
        concept: "rice",
        next: "thali-2",
        fits: true,
        outcome: {
          situation:
            "Rice. She serves it, and very politely moves your bugs away.",
        },
      },
      {
        concept: "knife",
        next: "thali-2",
        fits: false,
        outcome: {
          situation:
            "A knife? She takes a sword off the wall and deals with the bugs herself.",
        },
      },
      {
        concept: "congratulations",
        next: "thali-2",
        fits: false,
        outcome: {
          situation:
            "Congratulations? She throws your bugs in the air like confetti and dances.",
        },
      },
    ],
  },
  {
    id: "thali-2",
    situation:
      "She holds up a pot of dal, but there is nowhere to put it. One of your bugs is swimming in it.",
    media: [{ tier: 1, ref: "scene/thali-2/still", languageCode: null }],
    choices: [
      {
        concept: "bowl",
        next: "thali-3",
        fits: true,
        outcome: {
          situation:
            "A bowl. She pours the dal and rescues the swimming bug.",
        },
      },
      {
        concept: "water",
        next: "thali-3",
        fits: false,
        outcome: {
          situation:
            "Water? She uses a fire hose. The rice sails away.",
        },
      },
      {
        concept: "father-in-law",
        next: "thali-3",
        fits: false,
        outcome: {
          situation:
            "A strict grandfather arrives. Aunty tries very hard to hide the bugs.",
        },
      },
    ],
  },
  {
    id: "thali-3",
    situation:
      "You take one bite and go quiet. Aunty slides a little pot towards you.",
    media: [{ tier: 1, ref: "scene/thali-3/still", languageCode: null }],
    choices: [
      {
        concept: "salt",
        next: "thali-4",
        fits: true,
        outcome: {
          situation:
            "Salt. Much better. Even the bug agrees.",
        },
      },
      {
        concept: "twenty",
        next: "thali-4",
        fits: false,
        outcome: {
          situation:
            "Twenty? A truck delivers twenty sacks of salt. The bugs go skiing.",
        },
      },
      {
        concept: "goodbye",
        next: "thali-4",
        fits: false,
        outcome: {
          situation:
            "Goodbye? She whips the tablecloth away and the whole meal flies out of the window.",
        },
      },
    ],
  },
  {
    id: "thali-4",
    situation:
      "There is nothing to eat with. She opens a drawer and bugs fly out. What do you need?",
    media: [{ tier: 1, ref: "scene/thali-4/still", languageCode: null }],
    choices: [
      {
        concept: "spoon",
        next: "thali-5",
        fits: true,
        outcome: {
          situation:
            "A spoon. She hands it over with great dignity.",
        },
      },
      {
        concept: "plate",
        next: "thali-5",
        fits: false,
        outcome: {
          situation:
            "A plate? She stacks plates until they go through the ceiling.",
        },
      },
      {
        concept: "monday",
        next: "thali-5",
        fits: false,
        outcome: {
          situation:
            "Monday? She climbs into the drawer to look for it.",
        },
      },
    ],
  },
  {
    id: "thali-5",
    situation:
      "You have finished. Aunty is already coming with more, and the goat has a second pot.",
    media: [{ tier: 1, ref: "scene/thali-5/still", languageCode: null }],
    choices: [
      {
        concept: "no",
        next: null,
        fits: true,
        outcome: {
          situation:
            "No, thank you. The goat is delighted and eats it instead.",
        },
      },
      {
        concept: "please",
        next: null,
        fits: false,
        outcome: {
          situation:
            "Please? They pour until the table disappears under food.",
        },
      },
      {
        concept: "welcome",
        next: null,
        fits: false,
        outcome: {
          situation:
            "Welcome? Aunty, the goat, twenty neighbours and a buffalo sit down to eat too.",
        },
      },
    ],
  },
];

/** Where the thali book begins. */
export const THALI_START_ID = "thali-1";

/** The three pictures the thali book can end on (see GREETINGS_ENDINGS). */
export const THALI_ENDINGS: StoryEndings = {
  perfect: {
    situation:
      "A perfect meal. Aunty keeps your bugs as a souvenir. She will never eat them.",
  },
  chaos: {
    situation:
      "The kitchen is a mess, the bugs are dancing, and aunty is laughing.",
  },
  disaster: {
    situation:
      "Salt mountains, floods, a truck in the kitchen. Aunty says you must come every week.",
  },
};

export const COURTYARD_SCENES: readonly Scene[] = [
  {
    id: "yard-1",
    situation:
      "You arrive on a camel. It starts eating the washing. Aunty asks where you have come from.",
    media: [{ tier: 1, ref: "scene/yard-1/still", languageCode: null }],
    choices: [
      {
        concept: "here",
        next: "yard-2",
        fits: true,
        outcome: {
          situation:
            "From here, next door. She laughs. The camel is the neighbour's.",
        },
      },
      {
        concept: "there",
        next: "yard-2",
        fits: false,
        outcome: {
          situation:
            "From there? She climbs on the camel with a telescope to look for it.",
        },
      },
      {
        concept: "grandfather",
        next: "yard-2",
        fits: false,
        outcome: {
          situation:
            "Grandfather? He jumps out of the laundry basket, flexing.",
        },
      },
    ],
  },
  {
    id: "yard-2",
    situation:
      "Aunty, with a peg in her teeth, asks when you arrived. A monkey is sitting on your suitcase.",
    media: [{ tier: 1, ref: "scene/yard-2/still", languageCode: null }],
    choices: [
      {
        concept: "yesterday",
        next: "yard-3",
        fits: true,
        outcome: {
          situation:
            "Yesterday. She nods and gets on with the washing. The monkey helps.",
        },
      },
      {
        concept: "now",
        next: "yard-3",
        fits: false,
        outcome: {
          situation:
            "Now? She panics and a whole welcome parade appears out of nowhere.",
        },
      },
      {
        concept: "rice",
        next: "yard-3",
        fits: false,
        outcome: {
          situation:
            "Rice? The rice pot erupts like a volcano.",
        },
      },
    ],
  },
  {
    id: "yard-3",
    situation:
      "Aunty points at the gate and asks when you are leaving. The camel is already packed.",
    media: [{ tier: 1, ref: "scene/yard-3/still", languageCode: null }],
    choices: [
      {
        concept: "tomorrow",
        next: "yard-4",
        fits: true,
        outcome: {
          situation:
            "Tomorrow. She is a little sad, and gives the camel a long hug.",
        },
      },
      {
        concept: "night",
        next: "yard-4",
        fits: false,
        outcome: {
          situation:
            "Night? She pulls a curtain across the sky to make it night right now.",
        },
      },
      {
        concept: "twenty",
        next: "yard-4",
        fits: false,
        outcome: {
          situation:
            "Twenty? Twenty camels line up to carry your socks.",
        },
      },
    ],
  },
  {
    id: "yard-4",
    situation:
      "She holds out her arm to walk you to the road. So does the camel.",
    media: [{ tier: 1, ref: "scene/yard-4/still", languageCode: null }],
    choices: [
      {
        concept: "please",
        next: "yard-5",
        fits: true,
        outcome: {
          situation:
            "Please. She takes your arm, and the camel follows along proudly.",
        },
      },
      {
        concept: "sorry",
        next: "yard-5",
        fits: false,
        outcome: {
          situation:
            "Sorry? Everyone cries so much that ducks move in.",
        },
      },
      {
        concept: "congratulations",
        next: "yard-5",
        fits: false,
        outcome: {
          situation:
            "Congratulations? Fireworks! The camel dances.",
        },
      },
    ],
  },
  {
    id: "yard-5",
    situation:
      "At the gate, Aunty raises a hand. So does the camel.",
    media: [{ tier: 1, ref: "scene/yard-5/still", languageCode: null }],
    choices: [
      {
        concept: "goodbye",
        next: null,
        fits: true,
        outcome: {
          situation:
            "Goodbye. She and the camel wave until you are out of sight.",
        },
      },
      {
        concept: "hello",
        next: null,
        fits: false,
        outcome: {
          situation:
            "Hello? She hooks you back in with a cane. The visit starts again.",
        },
      },
      {
        concept: "good news",
        next: null,
        fits: false,
        outcome: {
          situation:
            "Good news? The whole village leans in to hear it. You have no news.",
        },
      },
    ],
  },
];

/** Where the courtyard book begins. */
export const COURTYARD_START_ID = "yard-1";

/** The three pictures the courtyard book can end on (see GREETINGS_ENDINGS). */
export const COURTYARD_ENDINGS: StoryEndings = {
  perfect: {
    situation:
      "A lovely visit. The camel wants to come again.",
  },
  chaos: {
    situation:
      "The washing is on the camel, the monkey is in a shirt, and everyone is laughing.",
  },
  disaster: {
    situation:
      "Twenty camels, a rice volcano and fireworks. The neighbours will talk about this for years.",
  },
};

export const PHOTOGRAPH_SCENES: readonly Scene[] = [
  {
    id: "photo-1",
    situation:
      "You bump the table. The best plate smashes. Everyone, including the peacock, looks at you.",
    media: [{ tier: 1, ref: "scene/photo-1/still", languageCode: null }],
    choices: [
      {
        concept: "sorry",
        next: "photo-2",
        fits: true,
        outcome: {
          situation:
            "Sorry. Grandmother smiles. The peacock forgives you too.",
        },
      },
      {
        concept: "congratulations",
        next: "photo-2",
        fits: false,
        outcome: {
          situation:
            "Congratulations? The family celebrates the broken plate like a trophy.",
        },
      },
      {
        concept: "rice",
        next: "photo-2",
        fits: false,
        outcome: {
          situation:
            "Rice? They glue the plate back together with rice. It is now a sculpture.",
        },
      },
    ],
  },
  {
    id: "photo-2",
    situation:
      "Your cousin holds an opened letter. She is beaming and shaking. Something wonderful has happened.",
    media: [{ tier: 1, ref: "scene/photo-2/still", languageCode: null }],
    choices: [
      {
        concept: "congratulations",
        next: "photo-3",
        fits: true,
        outcome: {
          situation:
            "Congratulations! She got in. Everyone cheers.",
        },
      },
      {
        concept: "sorry",
        next: "photo-3",
        fits: false,
        outcome: {
          situation:
            "Sorry? The whole family starts crying. It rains indoors.",
        },
      },
      {
        concept: "how much is this?",
        next: "photo-3",
        fits: false,
        outcome: {
          situation:
            "How much? The family starts an auction for her letter.",
        },
      },
    ],
  },
  {
    id: "photo-3",
    situation:
      "Grandfather has fallen asleep standing up, in the middle of the photo. The peacock too.",
    media: [{ tier: 1, ref: "scene/photo-3/still", languageCode: null }],
    choices: [
      {
        concept: "good night",
        next: "photo-4",
        fits: true,
        outcome: {
          situation:
            "Good night. They tuck him in, standing up.",
        },
      },
      {
        concept: "good morning",
        next: "photo-4",
        fits: false,
        outcome: {
          situation:
            "Good morning! He wakes up so fast he goes through the ceiling.",
        },
      },
      {
        concept: "twenty",
        next: "photo-4",
        fits: false,
        outcome: {
          situation:
            "Twenty? Grandfather counts sheep in his sleep. Twenty of them float into the room.",
        },
      },
    ],
  },
  {
    id: "photo-4",
    situation:
      "An aunty hands you a present. It is wiggling.",
    media: [{ tier: 1, ref: "scene/photo-4/still", languageCode: null }],
    choices: [
      {
        concept: "thank you",
        next: "photo-5",
        fits: true,
        outcome: {
          situation:
            "Thank you. It is a chicken in a party hat. Everyone cheers.",
        },
      },
      {
        concept: "how much is this?",
        next: "photo-5",
        fits: false,
        outcome: {
          situation:
            "How much? The whole room goes silent and stares at you.",
        },
      },
      {
        concept: "goodbye",
        next: "photo-5",
        fits: false,
        outcome: {
          situation:
            "Goodbye? The present flies out of the window.",
        },
      },
    ],
  },
  {
    id: "photo-5",
    situation:
      "Everyone crowds in for the photo, leaving a space for you. What do you say?",
    media: [{ tier: 1, ref: "scene/photo-5/still", languageCode: null }],
    choices: [
      {
        concept: "family",
        next: null,
        fits: true,
        outcome: {
          situation:
            "Family. Everyone squeezes in, and the photo is perfect.",
        },
      },
      {
        concept: "father-in-law",
        next: null,
        fits: false,
        outcome: {
          situation:
            "Father-in-law? Everyone points at somebody else. Nobody knows.",
        },
      },
      {
        concept: "thursday",
        next: null,
        fits: false,
        outcome: {
          situation:
            "Thursday? They hold the pose until Thursday. The grandfather grows a beard.",
        },
      },
    ],
  },
];

/** Where the photograph book begins. */
export const PHOTOGRAPH_START_ID = "photo-1";

/** The three pictures the photograph book can end on (see GREETINGS_ENDINGS). */
export const PHOTOGRAPH_ENDINGS: StoryEndings = {
  perfect: {
    situation:
      "The perfect family photo, framed on the wall.",
  },
  chaos: {
    situation:
      "The photo is blurry and everyone is laughing. It is their favourite one.",
  },
  disaster: {
    situation:
      "A hole in the ceiling, sheep, a chicken and a rain cloud. They make copies for everyone.",
  },
};

