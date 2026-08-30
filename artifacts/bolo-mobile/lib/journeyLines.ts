// Spec D1b-M: the 22 themed rail lines of the journey map — a verbatim port of
// the web table (gujarati-coach/src/lib/journeyLines.ts), which is the source
// of truth. Structured content, never hardcoded in components. Each language
// renders as one line; the six zones map positionally onto the six categories
// in DB sort_order. The id joins in JOURNEY_ZONES are authoritative; its title
// strings are a loading-state fallback only — live zone titles come from the
// categories listing the journey screen already fetches (Task #906), so a
// server-side rename needs no app release. Zone geographic names are
// category-independent: Z1-Z6 columns
// of the approved naming table apply in category order, the zone's name
// appears on its sign/postcard, and inner stations are numbered ("Stop N of
// M"). Labels are English-only for v1; the one native-script accent string is
// the "Bolo Rail" brand on the boarding-pass header (per-language via
// getRailBrand below), nowhere else.

/** The authoritative zone <-> category mapping (DB ids and titles, in order). */
export const JOURNEY_ZONES = [
  { id: 1, title: 'Greetings & Manners' },
  { id: 2, title: 'Family' },
  { id: 3, title: 'Numbers 1-10' },
  { id: 4, title: 'Food & Eating' },
  { id: 5, title: 'Everyday Words' },
  { id: 6, title: 'Feelings' }, // the festival-city finale
] as const;

export interface JourneyLine {
  /** Themed line name, e.g. "Gujarat Express". */
  lineName: string;
  /** Per-line rail accent color (postcards, markers, rail segments). */
  accent: string;
  /** Z1..Z6 geographic names, positionally matching JOURNEY_ZONES. */
  zones: readonly [string, string, string, string, string, string];
  /**
   * The same six names in the language's own script, for the station signs
   * on the one-pager map (owner, 2026-08-29: "I want native script on
   * station names as well"). Fetched from Wikidata's labels by
   * scripts/fetch-station-names (build 20), with a same-script sibling
   * language standing in where a label was missing (Dogri, Maithili, Bodo and
   * Sanskrit from Hindi; Konkani from Marathi; Kashmiri and Sindhi from Urdu)
   * and a few standard spellings entered by hand. null means Latin only on
   * the sign; the two Meetei Mayek blanks were left rather than guessed. The
   * suffix words (Junction, Central, City) stay Latin: the sign carries the
   * city's own name above its Latin station name.
   */
  zonesNative: readonly (string | null)[];
  /**
   * Journey 2's six stations, continuing ONWARD from where `zones` ends: the
   * same railway, further along. Ported from the web twin
   * (gujarati-coach/src/lib/journeyLines.ts) in build 25 for the iPad zone
   * rail's onward card; geography, not language content, and a local eye
   * should still check them before they are ridden.
   */
  zones2: readonly [string, string, string, string, string, string];
}

/** All 22 lines from the approved naming table, keyed by DB language code. */
export const JOURNEY_LINES: Record<string, JourneyLine> = {
  gu: {
    lineName: 'Gujarat Express',
    accent: '#ea580c',
    zones: ['Ahmedabad Junction', 'Anand', 'Vadodara', 'Surat', 'Rajkot', 'Dwarka'],
    zonesNative: ['અમદાવાદ', 'આણંદ', 'વડોદરા', 'સુરત', 'રાજકોટ', 'દ્વારકા'],
    zones2: ['Porbandar', 'Somnath', 'Junagadh', 'Bhavnagar', 'Palitana', 'Gir'],
  },
  bn: {
    lineName: 'Howrah Line',
    accent: '#16a34a',
    zones: ['Howrah Junction', 'Chandannagar', 'Bolpur Shantiniketan', 'Murshidabad', 'Malda Town', 'Kalighat'],
    zonesNative: ['হাওড়া', 'চন্দননগর', 'বোলপুর', 'মুর্শিদাবাদ', 'মালদা', 'কালীঘাট'],
    zones2: ['Sealdah', 'Barrackpore', 'Krishnanagar', 'Bishnupur', 'Digha', 'Sundarbans'],
  },
  mr: {
    lineName: 'Deccan Queen',
    accent: '#7c3aed',
    zones: ['CST Mumbai', 'Karjat', 'Lonavala', 'Shivajinagar', 'Pune Junction', 'Lalbaug'],
    zonesNative: ['छत्रपती शिवाजी महाराज टर्मिनस', 'कर्जत', 'लोणावळा', 'शिवाजीनगर', 'पुणे', 'लालबाग'],
    zones2: ['Panvel', 'Alibaug', 'Mahabaleshwar', 'Kolhapur', 'Nashik', 'Ajanta'],
  },
  ta: {
    lineName: 'Nilgiri Mountain Railway',
    accent: '#0284c7',
    zones: ['Chennai Egmore', 'Mettupalayam', 'Coonoor', 'Wellington', 'Lovedale', 'Ooty'],
    zonesNative: ['எழும்பூர்', 'மேட்டுப்பாளையம்', 'குன்னூர்', 'வெல்லிங்டன்', 'லவ்டேல்', 'ஊட்டி'],
    zones2: ['Coimbatore', 'Madurai', 'Rameswaram', 'Thanjavur', 'Chidambaram', 'Kanyakumari'],
  },
  kok: {
    lineName: 'Konkan Railway',
    accent: '#0d9488',
    zones: ['Madgaon Junction', 'Karmali', 'Thivim', 'Sawantwadi', 'Ratnagiri', 'Panjim Carnival'],
    zonesNative: ['मडगाव', 'करमळी', 'थिविम', 'सावंतवाडी', 'रत्नगिरी', 'पणजी'],
    zones2: ['Vasco da Gama', 'Canacona', 'Karwar', 'Gokarna', 'Udupi', 'Mangaluru'],
  },
  ne: {
    lineName: 'Darjeeling Himalayan Railway',
    accent: '#4f46e5',
    zones: ['New Jalpaiguri', 'Siliguri', 'Kurseong', 'Sonada', 'Ghum', 'Darjeeling'],
    zonesNative: ['न्यू जलपाईगुडी', 'सिलिगुडी', 'खर्साङ', 'सोनादा', 'घुम', 'दार्जीलिङ्ग'],
    zones2: ['Kalimpong', 'Gangtok', 'Pelling', 'Namchi', 'Rangpo', 'Lachung'],
  },
  ks: {
    lineName: 'Banihal Valley Line',
    accent: '#b45309',
    zones: ['Banihal', 'Anantnag', 'Awantipora', 'Srinagar', 'Sopore', 'Baramulla'],
    zonesNative: ['بانِہَل', 'اَنَنت ناگ', 'ووٗنٛتؠ پور', 'سِریٖنَگَر', 'سوپُر', 'وَرمُل'],
    zones2: ['Gulmarg', 'Pahalgam', 'Sonamarg', 'Kupwara', 'Kargil', 'Leh'],
  },
  pa: {
    lineName: 'Golden Temple Mail',
    accent: '#d97706',
    zones: ['Ludhiana', 'Phagwara', 'Jalandhar City', 'Beas', 'Amritsar Junction', 'Anandpur Sahib'],
    zonesNative: ['ਲੁਧਿਆਣਾ', 'ਫਗਵਾੜਾ', 'ਜਲੰਧਰ', 'ਬਿਆਸ', 'ਅੰਮ੍ਰਿਤਸਰ', 'ਅਨੰਦਪੁਰ ਸਾਹਿਬ'],
    zones2: ['Patiala', 'Bathinda', 'Kapurthala', 'Firozpur', 'Faridkot', 'Wagah'],
  },
  ml: {
    lineName: 'Kerala Coast Line',
    accent: '#059669',
    zones: ['Thiruvananthapuram Central', 'Kollam', 'Alappuzha', 'Ernakulam Junction', 'Kozhikode', 'Thrissur'],
    zonesNative: ['തിരുവനന്തപുരം', 'കൊല്ലം', 'ആലപ്പുഴ', 'എറണാകുളം', 'കോഴിക്കോട്', 'തൃശ്ശൂർ'],
    zones2: ['Palakkad', 'Guruvayur', 'Kannur', 'Kasaragod', 'Munnar', 'Varkala'],
  },
  te: {
    lineName: 'Godavari Express',
    accent: '#dc2626',
    zones: ['Secunderabad', 'Warangal', 'Vijayawada', 'Rajahmundry', 'Samalkot', 'Visakhapatnam'],
    zonesNative: ['సికింద్రాబాద్', 'వరంగల్', 'విజయవాడ', 'రాజమహేంద్రవరం', 'సామర్లకోట', 'విశాఖపట్నం'],
    zones2: ['Guntur', 'Tirupati', 'Nellore', 'Kurnool', 'Bhadrachalam', 'Araku'],
  },
  kn: {
    lineName: 'Mysuru Line',
    accent: '#9333ea',
    zones: ['Bengaluru City', 'Kengeri', 'Ramanagara', 'Mandya', 'Srirangapatna', 'Mysuru Palace'],
    zonesNative: ['ಬೆಂಗಳೂರು', 'ಕೆಂಗೇರಿ', 'ರಾಮನಗರ', 'ಮಂಡ್ಯ', 'ಶ್ರೀರಂಗಪಟ್ಟಣ', 'ಮೈಸೂರು'],
    zones2: ['Hassan', 'Chikkamagaluru', 'Belur', 'Badami', 'Hampi', 'Gokarna'],
  },
  or: {
    lineName: 'Puri Line',
    accent: '#0ea5e9',
    zones: ['Cuttack', 'Bhubaneswar', 'Khurda Road', 'Pipili', 'Sakhigopal', 'Puri'],
    zonesNative: ['କଟକ', 'ଭୁବନେଶ୍ୱର', 'ଖୋର୍ଦ୍ଧା', 'ପିପିଲି', 'ସାକ୍ଷୀଗୋପାଳ', 'ପୁରୀ'],
    zones2: ['Konark', 'Chilika', 'Sambalpur', 'Koraput', 'Rourkela', 'Gopalpur'],
  },
  as: {
    lineName: 'Kamrupa Express',
    accent: '#f43f5e',
    zones: ['Guwahati Junction', 'Tezpur', 'Kaziranga', 'Jorhat', 'Majuli', 'Dibrugarh'],
    zonesNative: ['গুৱাহাটী', 'তেজপুৰ', 'কাজিৰঙা', 'যোৰহাট', 'মাজুলী', 'ডিব্ৰুগড়'],
    zones2: ['Tinsukia', 'Sivasagar', 'Digboi', 'Margherita', 'Hailakandi', 'Silchar'],
  },
  hi: {
    lineName: 'Ganga Line',
    accent: '#65a30d',
    zones: ['New Delhi', 'Aligarh', 'Kanpur Central', 'Prayagraj', 'Mirzapur', 'Varanasi'],
    zonesNative: ['नई दिल्ली', 'अलीगढ़', 'कानपुर', 'प्रयागराज', 'मिर्ज़ापुर', 'वाराणसी'],
    zones2: ['Sarnath', 'Ayodhya', 'Lucknow', 'Mathura', 'Agra', 'Gorakhpur'],
  },
  ur: {
    lineName: 'Awadh Line',
    accent: '#047857',
    zones: ['Lucknow Charbagh', 'Malihabad', 'Kakori', 'Barabanki', 'Faizabad', 'Rampur'],
    zonesNative: ['لکھنؤ چارباغ', 'ملیح آباد', 'کاکوری', 'بارہ بنکی', 'فیض آباد', 'رام پور'],
    zones2: ['Bareilly', 'Moradabad', 'Amroha', 'Sambhal', 'Deva Sharif', 'Bahraich'],
  },
  mai: {
    lineName: 'Mithila Line',
    accent: '#c026d3',
    zones: ['Samastipur', 'Darbhanga', 'Madhubani', 'Sitamarhi', 'Jaynagar', 'Janakpur'],
    zonesNative: ['समस्तीपुर', 'दड़िभङ्गा', 'मधुबनी', 'सीतामढ़ी', 'जयनगर', 'जनकपुर'],
    zones2: ['Muzaffarpur', 'Rajnagar', 'Benipatti', 'Pupri', 'Laukaha', 'Nirmali'],
  },
  doi: {
    lineName: 'Jammu Tawi Line',
    accent: '#2563eb',
    zones: ['Pathankot', 'Kathua', 'Samba', 'Jammu Tawi', 'Udhampur', 'Katra'],
    zonesNative: ['पठानकोट', 'कठुआ', 'सांबा', 'जम्मू', 'उधमपुर', 'कटरा'],
    zones2: ['Patnitop', 'Reasi', 'Bhaderwah', 'Kishtwar', 'Akhnoor', 'Basohli'],
  },
  mni: {
    lineName: 'Imphal Valley Line',
    accent: '#db2777',
    zones: ['Jiribam', 'Noney', 'Khongsang', 'Bishnupur', 'Moirang', 'Imphal'],
    zonesNative: ['ꯖꯤꯔꯤꯕꯥꯝ', 'ꯅꯣꯅꯦ', null, null, 'ꯃꯣꯏꯔꯥꯡ', 'ꯏꯝꯐꯥꯜ'],
    zones2: ['Loktak', 'Ukhrul', 'Churachandpur', 'Kangla', 'Senapati', 'Thoubal'],
  },
  brx: {
    lineName: 'Bodoland Line',
    accent: '#15803d',
    zones: ['Fakiragram Junction', 'Gossaigaon', 'Kokrajhar', 'Bongaigaon', 'Udalguri', 'Tamulpur'],
    zonesNative: ['फकिराग्राम', 'गोसाईगाँव', 'कोकराझाड़', 'बोंगाइगांव', 'उदलगुड़ी', 'तामूलपुर'],
    zones2: ['Chirang', 'Baksa', 'Manas', 'Bhairabkunda', 'Salakati', 'Basugaon'],
  },
  sat: {
    lineName: 'Santhal Parganas Line',
    accent: '#a16207',
    zones: ['Jasidih Junction', 'Deoghar', 'Dumka', 'Godda', 'Pakur', 'Sahibganj'],
    zonesNative: ['ᱡᱟᱥᱤᱰᱤᱦ', 'ᱫᱮᱣᱜᱷᱚᱨ', 'ᱫᱩᱢᱠᱟᱹ', 'ᱜᱳᱰᱰᱟ', 'ᱯᱟᱠᱩᱲ', 'ᱥᱟᱦᱮᱵᱽᱜᱚᱸᱡᱽ'],
    zones2: ['Rajmahal', 'Massanjore', 'Barhait', 'Jamtara', 'Madhupur', 'Shikaripara'],
  },
  sa: {
    lineName: 'Heritage Line',
    accent: '#b91c1c',
    zones: ['Rishikesh', 'Haridwar', 'Ayodhya', 'Ujjain', 'Nashik', 'Kashi'],
    zonesNative: ['हृषीकेशः', 'हरिद्वार', 'अयोध्या', 'उज्जयिनी', 'नाशिक', 'काशी'],
    zones2: ['Nalanda', 'Kanchipuram', 'Pushkar', 'Badrinath', 'Rameswaram', 'Kurukshetra'],
  },
  sd: {
    lineName: 'Kutch Line',
    accent: '#0891b2',
    zones: ['Gandhidham', 'Adipur', 'Anjar', 'Bhachau', 'Bhuj', 'Lakhpat'],
    zonesNative: ['گانڌيڌام', 'ادیپور', 'انجر', 'بہاچاو', 'ڀڄ', 'لکپت'],
    zones2: ['Mandvi', 'Dholavira', 'Narayan Sarovar', 'Mundra', 'Nakhatrana', 'Khavda'],
  },
};

/**
 * "Bolo Rail" transliterated into each language's own script, for the
 * boarding-pass eyebrow ("BOARDING PASS · बोलो रेल"). Must be rendered with
 * the language's native font (nativeTextStyle) — the Latin UI font has no
 * glyphs for these scripts and renders tofu. Languages whose scripts we can't
 * confidently transliterate (Santali/Ol Chiki, Manipuri/Meetei Mayek) are
 * deliberately absent: a readable Latin fallback beats a wrong glyph sequence.
 */
const RAIL_BRAND: Record<string, string> = {
  hi: 'बोलो रेल',
  mr: 'बोलो रेल',
  ne: 'बोलो रेल',
  kok: 'बोलो रेल',
  mai: 'बोलो रेल',
  doi: 'बोलो रेल',
  sa: 'बोलो रेल',
  brx: 'बोलो रेल',
  gu: 'બોલો રેલ',
  bn: 'বলো রেল',
  as: 'বলো ৰেল',
  pa: 'ਬੋਲੋ ਰੇਲ',
  ta: 'போலோ ரயில்',
  te: 'బోలో రైలు',
  kn: 'ಬೋಲೋ ರೈಲು',
  ml: 'ബോലോ റെയിൽ',
  or: 'ବୋଲୋ ରେଲ',
  ur: 'بولو ریل',
  ks: 'بولو ریل',
  sd: 'بولو ريل',
};

/**
 * The boarding-pass brand for a language: its native-script "Bolo Rail" when
 * we have one (`native: true` — render with nativeTextStyle), otherwise the
 * Latin brand in the eyebrow's own font.
 */
export function getRailBrand(code: string): { text: string; native: boolean } {
  const text = RAIL_BRAND[code];
  return text ? { text, native: true } : { text: 'BOLO RAIL', native: false };
}

/**
 * The line for a language code. Every shipped language has an entry; a code
 * outside the table (future language before its naming lands) degrades to a
 * generic line rather than crashing the map.
 */
export function getJourneyLine(code: string): JourneyLine {
  return (
    JOURNEY_LINES[code] ?? {
      lineName: 'Bolo Line',
      accent: '#4F46E5',
      zones: ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5', 'Zone 6'],
      zonesNative: [null, null, null, null, null, null],
      zones2: ['Zone 7', 'Zone 8', 'Zone 9', 'Zone 10', 'Zone 11', 'Zone 12'],
    }
  );
}
