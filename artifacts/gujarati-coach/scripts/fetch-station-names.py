"""Native-script station names from Wikidata labels, per language (build 20).

Owner, 2026-08-29: "I want native script on station names as well." The
names did not exist in the repo and nobody should type 132 of them in nine
scripts from memory, so this reads Wikidata's per-language labels. Its
output was written by hand into `zonesNative` in the two journeyLines.ts
twins; re-run it only to refresh those, and then re-check the same-script
fallback rows (marked "<- xx" in the report) with a speaker.

Runs on a Mac with plain python3 (fetches through curl because the
python.org build has no certificate bundle). Not a repo dependency.

Usage: python3 scripts/fetch-station-names.py   (prints the report, writes
native-names.json beside the current directory)

For each line's six cities: search Wikidata for the CITY (the station
suffix, Junction/Central/City, is dropped and a few station names map to
their city), pick the first hit that reads as a place, then read its label
in the language's Wikidata code. Anything not found stays null (Latin only
on the sign) and is printed for the owner.
"""
import json, re, sys, time, urllib.parse, urllib.request
LINES = {
 "hi": ("hi", ["New Delhi","Aligarh","Kanpur Central","Prayagraj","Mirzapur","Varanasi"]),
 "gu": ("gu", ["Ahmedabad Junction","Anand","Vadodara","Surat","Rajkot","Dwarka"]),
 "bn": ("bn", ["Howrah Junction","Chandannagar","Bolpur Shantiniketan","Murshidabad","Malda Town","Kalighat"]),
 "mr": ("mr", ["CST Mumbai","Karjat","Lonavala","Shivajinagar","Pune Junction","Lalbaug"]),
 "ta": ("ta", ["Chennai Egmore","Mettupalayam","Coonoor","Wellington","Lovedale","Ooty"]),
 "te": ("te", ["Secunderabad","Warangal","Vijayawada","Rajahmundry","Samalkot","Visakhapatnam"]),
 "kn": ("kn", ["Bengaluru City","Kengeri","Ramanagara","Mandya","Srirangapatna","Mysuru Palace"]),
 "ml": ("ml", ["Thiruvananthapuram Central","Kollam","Alappuzha","Ernakulam Junction","Kozhikode","Thrissur"]),
 "pa": ("pa", ["Ludhiana","Phagwara","Jalandhar City","Beas","Amritsar Junction","Anandpur Sahib"]),
 "or": ("or", ["Cuttack","Bhubaneswar","Khurda Road","Pipili","Sakhigopal","Puri"]),
 "as": ("as", ["Guwahati Junction","Tezpur","Kaziranga","Jorhat","Majuli","Dibrugarh"]),
 "ur": ("ur", ["Lucknow Charbagh","Malihabad","Kakori","Barabanki","Faizabad","Rampur"]),
 "ne": ("ne", ["New Jalpaiguri","Siliguri","Kurseong","Sonada","Ghum","Darjeeling"]),
 "kok": ("gom-deva", ["Madgaon Junction","Karmali","Thivim","Sawantwadi","Ratnagiri","Panjim Carnival"]),
 "ks": ("ks", ["Banihal","Anantnag","Awantipora","Srinagar","Sopore","Baramulla"]),
 "mai": ("mai", ["Samastipur","Darbhanga","Madhubani","Sitamarhi","Jaynagar","Janakpur"]),
 "doi": ("doi", ["Pathankot","Kathua","Samba","Jammu Tawi","Udhampur","Katra"]),
 "mni": ("mni", ["Jiribam","Noney","Khongsang","Bishnupur","Moirang","Imphal"]),
 "brx": ("brx", ["Fakiragram Junction","Gossaigaon","Kokrajhar","Bongaigaon","Udalguri","Tamulpur"]),
 "sat": ("sat", ["Jasidih Junction","Deoghar","Dumka","Godda","Pakur","Sahibganj"]),
 "sa": ("sa", ["Rishikesh","Haridwar","Ayodhya","Ujjain","Nashik","Kashi"]),
 "sd": ("sd", ["Gandhidham","Adipur","Anjar","Bhachau","Bhuj","Lakhpat"]),
}
# Station names that are not the city's own name on Wikidata.
SEARCH = {"Surat": "Surat", "Puri": "Puri", "Anjar": "Anjar", "Karmali": "Karmali", "Kengeri": "Kengeri", "Beas": "Beas", "Anand": "Anand", "Shivajinagar": "Shivajinagar", "Lovedale": "Lovedale", "Pipili": "Pipili", "Sonada": "Sonada", "Ghum": "Ghum", "Thivim": "Thivim", "Sawantwadi": "Sawantwadi", "Ratnagiri": "Ratnagiri", "Bishnupur": "Bishnupur", "Khongsang": "Khongsang", "Jaynagar": "Jaynagar", "Samba": "Samba", "Ramanagara": "Ramanagara", "Kaziranga": "Kaziranga", "Adipur": "Adipur", "Bhachau": "Bhachau", "Mirzapur": "Mirzapur", "Srirangapatna": "Srirangapatna", "Deoghar": "Deoghar", "Samastipur": "Samastipur", "Coonoor": "Coonoor", "Phagwara": "Phagwara", "Warangal": "Warangal", "Barabanki": "Barabanki", "Madhubani": "Madhubani", "Kokrajhar": "Kokrajhar", "Udalguri": "Udalguri", "Tamulpur": "Tamulpur", "Gossaigaon": "Gossaigaon", "Fakiragram Junction": "Fakiragram", "Dibrugarh": "Dibrugarh", "Vadodara": "Vadodara", "Prayagraj": "Prayagraj", "Pune Junction": "Pune", "Darbhanga": "Darbhanga", "Godda": "Godda", "Sahibganj": "Sahibganj", "Noney": "Noney", "Jiribam": "Jiribam", "Banihal": "Banihal",
          "CST Mumbai": "Chhatrapati Shivaji Maharaj Terminus", "Bolpur Shantiniketan": "Bolpur", "Mysuru Palace": "Mysore",
          "Panjim Carnival": "Panaji", "Khurda Road": "Khordha", "Chennai Egmore": "Egmore", "Kashi": "Varanasi",
          "Madgaon Junction": "Margao", "Malda Town": "Malda", "Jammu Tawi": "Jammu", "Ghum": "Ghum, Darjeeling",
          "Beas": "Beas, Punjab", "Samba": "Samba, Jammu and Kashmir", "Wellington": "Wellington, Tamil Nadu",
          "Lovedale": "Lovedale, Tamil Nadu", "Anand": "Anand, Gujarat", "Kalighat": "Kalighat", "Lalbaug": "Lalbaug",
          "Shivajinagar": "Shivajinagar, Pune", "Kaziranga": "Kaziranga National Park", "Majuli": "Majuli",
          "Sonada": "Sonada", "Noney": "Noney", "Khongsang": "Khongsang", "Bishnupur": "Bishnupur, Manipur",
          "Jaynagar": "Jaynagar, Bihar", "Janakpur": "Janakpur", "Sakhigopal": "Sakhigopal", "Pipili": "Pipili"}
CURRENT = [None]
REGION = {"hi": "Uttar Pradesh|Delhi", "gu": "Gujarat", "bn": "West Bengal|Kolkata", "mr": "Maharashtra|Mumbai|Pune", "ta": "Tamil Nadu|Chennai|Nilgiris", "te": "Andhra|Telangana|Hyderabad", "kn": "Karnataka|Bengaluru", "ml": "Kerala|Kochi", "pa": "Punjab", "or": "Odisha", "as": "Assam", "ur": "Uttar Pradesh|Lucknow", "ne": "West Bengal|Darjeeling", "kok": "Goa|Maharashtra|Konkan", "ks": "Jammu and Kashmir|Kashmir", "mai": "Bihar|Nepal", "doi": "Jammu|Punjab", "mni": "Manipur", "brx": "Assam", "sat": "Jharkhand", "sa": "Uttar|Uttarakhand|Madhya|Maharashtra", "sd": "Gujarat|Kutch"}
PLACEY = re.compile(r"city|town|village|district|municipal|capital|station|neighbourhood|neighborhood|locality|temple|park|island|area|suburb|headquarters|taluka|tehsil|hill|junction|terminus", re.I)
UA = {"User-Agent": "bolo-station-names/1 (aakeshp@gmail.com)"}
import subprocess
def get(url):
    # curl, not urllib: this Mac's Python has no certificate bundle.
    out = subprocess.run(["curl", "-sS", "--max-time", "30", "-A", UA["User-Agent"], url], capture_output=True, text=True, check=True).stdout
    return json.loads(out)
def strip_suffix(name):
    return re.sub(r"\s+(Junction|Central|City|Cantt)$", "", name)
cache = {}
def find_item(name):
    q = SEARCH.get(name, strip_suffix(name))
    if q in cache: return cache[q]
    url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({"action":"wbsearchentities","search":q,"language":"en","format":"json","limit":8,"type":"item"})
    hits = get(url).get("search", [])
    region = REGION.get(CURRENT[0], "")
    local = [h for h in hits if region and re.search(region, h.get("description",""), re.I)]
    india = local or [h for h in hits if re.search(r"India|Nepal|Gujarat|Goa|Punjab|Bengal|Kerala|Odisha|Assam|Manipur|Jharkhand|Bihar|Jammu|Karnataka|Tamil|Andhra|Telangana|Maharashtra|Uttar|Uttarakhand|Madhya|Darjeeling|Kolkata|Chennai|Pune|Mumbai|Bengaluru", h.get("description",""))] or hits
    CITY = re.compile(r"\b(city|town|village|municipal|capital|neighbou?rhood|locality|suburb|hill station|census town|human settlement|temple city|twin city|island)\b", re.I)
    pick = next((h for h in india if CITY.search(h.get("description",""))), None) \
        or next((h for h in india if PLACEY.search(h.get("description",""))), india[0] if india else None)
    cache[q] = (pick["id"], pick.get("label"), pick.get("description","")) if pick else None
    time.sleep(0.15)
    return cache[q]
# Same-script fallbacks for languages Wikidata labels thinly. A city's name
# in Dogri or Bodo is written as in Hindi far more often than not; a speaker
# should still glance at the rows marked with the fallback.
FALLBACK = {"doi": ["hi"], "mai": ["hi"], "brx": ["hi", "as"], "sa": ["hi"], "kok": ["mr", "hi"], "ks": ["ur"], "sd": ["ur"], "ne": ["hi"], "mni": []}
# Words to strip off a label that names the district, the station or the
# park rather than the town.
STRIP = [" तொடர்வண்டி நிலையம்", " தொடர்வண்டி நிலையம்", " నగరం", " ਨਗਰ ਨਿਗਮ", "، اتر پردیش", ", भारत", " रेल्वे स्थानक", " जंक्शन रेलवे स्टेशन", " हाट रेलवे स्टेशन", " रेलवे स्टेशन", " जिला", " जिल्हा", " जिल्ला", " ज़िला", " જિલ્લો", " জেলা", " জিলা", " జిల్లా", " ಜಿಲ್ಲೆ", " ജില്ല", " ਜ਼ਿਲ੍ਹਾ", " ਜ਼ਿਲਾ", " ଜିଲ୍ଲା", " ضلع", " ضِلہٕ", " ᱦᱚᱱᱚᱛ", "मण्डलम्", " उपमहानगरपालिका", " ৰাষ্ট্ৰীয় উদ্যান", " ରେଳ ଷ୍ଟେସନ", " ریلوے اسٹیشن", " ꯔꯦꯜꯒꯥꯔꯤ ꯈꯥꯝꯐꯝ", " ꯄꯅꯥ", " railway station", " Junction railway station", " metro station"]
def clean(label):
    if not label: return label
    for suf in STRIP:
        if label.endswith(suf): label = label[: -len(suf)]
    return label.strip()
out = {}; report = []
for code, (wd, cities) in LINES.items():
    CURRENT[0] = code; cache.clear()
    items = [find_item(c) for c in cities]
    ids = [i[0] for i in items if i]
    langs = [wd] + FALLBACK.get(code, [])
    url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({"action":"wbgetentities","ids":"|".join(ids),"props":"labels","languages":"|".join(langs),"format":"json"})
    ents = get(url).get("entities", {}) if ids else {}
    natives = []; sources = []
    for city, it in zip(cities, items):
        label = None; src = None
        if it:
            labels = ents.get(it[0], {}).get("labels", {})
            for lang in langs:
                v = labels.get(lang, {}).get("value")
                if v: label, src = clean(v), lang; break
        natives.append(label); sources.append(src)
        report.append((code, city, it[1] if it else None, (it[2][:44] if it else ""), label, src if src != wd else ""))
    out[code] = {"names": natives, "sources": sources}
    time.sleep(0.15)
json.dump(out, open("native-names.json","w"), ensure_ascii=False, indent=1)
for r in report: print(f"{r[0]:4} {r[1]:28} -> {str(r[2])[:24]:24} [{r[3]}]  {r[4]}  {('<- ' + r[5]) if r[5] else ''}")
missing = [(c, city) for c, city, _, _, lab, _ in report if not lab]
fallbacks = sum(1 for r in report if r[5])
print(f"\nfound {len(report) - len(missing)} of {len(report)} ({fallbacks} via a same-script fallback); missing: {missing}")
