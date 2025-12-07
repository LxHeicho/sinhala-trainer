export const SENTENCES = [
  // ===========================
  // GREETINGS & POLITE SPEECH
  // ===========================
  {
    id: "s1",
    english: "How are you?",
    phonetic: "oyā kohomada?",
    tokens: ["oyā", "kohomada?"],
    distractors: ["mata", "koheda"],
  },
  {
    id: "s2",
    english: "I am fine.",
    phonetic: "mata hondayi",
    tokens: ["mata", "hondayi"],
    distractors: ["oyā", "kohomada"],
  },
  {
    id: "s3",
    english: "What is your name?",
    phonetic: "oyāge nama mokakda?",
    tokens: ["oyāge", "nama", "mokakda?"],
    distractors: ["mata", "kohomada"],
  },
  {
    id: "s4",
    english: "My name is Raees.",
    phonetic: "mage nama Raees",
    tokens: ["mage", "nama", "Raees"],
    distractors: ["oyāge", "mokakda"],
  },
  {
    id: "s5",
    english: "Nice to meet you.",
    phonetic: "oyāva hamuvē hithata santōshay",
    tokens: ["oyāva", "hamuvē", "hithata", "santōshay"],
    distractors: ["oyāge", "hondayi"],
  },

  // ===========================
  // DAILY LIFE
  // ===========================
  {
    id: "s6",
    english: "Where are you going?",
    phonetic: "oyā koheda yanē?",
    tokens: ["oyā", "koheda", "yanē?"],
    distractors: ["enne", "mokakda"],
  },
  {
    id: "s7",
    english: "I am going home.",
    phonetic: "mata gedara yanāva",
    tokens: ["mata", "gedara", "yanāva"],
    distractors: ["oyā", "balannā"],
  },
  {
    id: "s8",
    english: "I am coming now.",
    phonetic: "mata dan ennāva",
    tokens: ["mata", "dan", "ennāva"],
    distractors: ["oyāge", "mokakda"],
  },
  {
    id: "s9",
    english: "Please wait a moment.",
    phonetic: "karunakara tikak indaganna",
    tokens: ["karunakara", "tikak", "indaganna"],
    distractors: ["mata", "yanā"],
  },
  {
    id: "s10",
    english: "I understand.",
    phonetic: "mata terenna",
    tokens: ["mata", "terenna"],
    distractors: ["oyā", "koheda"],
  },

  // ===========================
  // FOOD & RESTAURANTS
  // ===========================
  {
    id: "s11",
    english: "I want rice.",
    phonetic: "mata bath one",
    tokens: ["mata", "bath", "one"],
    distractors: ["oyā", "udan"],
  },
  {
    id: "s12",
    english: "Can I have water?",
    phonetic: "mata watura puluwanda?",
    tokens: ["mata", "watura", "puluwanda?"],
    distractors: ["bath", "kiri"],
  },
  {
    id: "s13",
    english: "Is this spicy?",
    phonetic: "meeka miris tiyenawada?",
    tokens: ["meeka", "miris", "tiyenawada?"],
    distractors: ["oyā", "monawada"],
  },
  {
    id: "s14",
    english: "I like this food.",
    phonetic: "mata me kaema hondayi",
    tokens: ["mata", "me", "kaema", "hondayi"],
    distractors: ["oyāge", "podi"],
  },
  {
    id: "s15",
    english: "The food is very good.",
    phonetic: "kaema hari hondayi",
    tokens: ["kaema", "hari", "hondayi"],
    distractors: ["miris", "podi"],
  },

  // ===========================
  // TRAVEL & DIRECTIONS
  // ===========================
  {
    id: "s16",
    english: "Where is the bus stop?",
    phonetic: "bus nævæṭa koheda?",
    tokens: ["bus", "nævæṭa", "koheda?"],
    distractors: ["gedara", "kawadā"],
  },
  {
    id: "s17",
    english: "Please go straight.",
    phonetic: "karunakara heta paṭa yanna",
    tokens: ["karunakara", "heta", "paṭa", "yanna"],
    distractors: ["vamata", "dakunaṭa"],
  },
  {
    id: "s18",
    english: "Turn left.",
    phonetic: "vamata yanna",
    tokens: ["vamata", "yanna"],
    distractors: ["dakunaṭa", "para"],
  },
  {
    id: "s19",
    english: "Turn right.",
    phonetic: "dakunaṭa yanna",
    tokens: ["dakunaṭa", "yanna"],
    distractors: ["vamata", "batt"],
  },
  {
    id: "s20",
    english: "How much is the ticket?",
    phonetic: "ticket keeyada?",
    tokens: ["ticket", "keeyada?"],
    distractors: ["koheda", "mokakda"],
  },

  // ===========================
  // SHOPPING & MONEY
  // ===========================
  {
    id: "s21",
    english: "How much is this?",
    phonetic: "meeka keeyada?",
    tokens: ["meeka", "keeyada?"],
    distractors: ["mōka", "kohomada"],
  },
  {
    id: "s22",
    english: "It is too expensive.",
    phonetic: "meeka godak laagai",
    tokens: ["meeka", "godak", "laagai"],
    distractors: ["podi", "sītala"],
  },
  {
    id: "s23",
    english: "Do you have a cheaper one?",
    phonetic: "podiyak adu tiyenawada?",
    tokens: ["podiyak", "adu", "tiyenawada?"],
    distractors: ["hondayi", "miris"],
  },
  {
    id: "s24",
    english: "I will buy this.",
    phonetic: "mata meeka gannāva",
    tokens: ["mata", "meeka", "gannāva"],
    distractors: ["dennā", "podi"],
  },
  {
    id: "s25",
    english: "Can I pay by card?",
    phonetic: "card eka gen ge-dī karannada?",
    tokens: ["card", "eka", "gen", "ge-dī", "karannada?"],
    distractors: ["bath", "enna"],
  },

  // ===========================
  // SOCIAL INTERACTION
  // ===========================
  {
    id: "s26",
    english: "Where are you from?",
    phonetic: "oyā koheda enne?",
    tokens: ["oyā", "koheda", "enne?"],
    distractors: ["mata", "mokakda"],
  },
  {
    id: "s27",
    english: "I am from London.",
    phonetic: "mata London eken",
    tokens: ["mata", "London", "eken"],
    distractors: ["oyāge", "kawadā"],
  },
  {
    id: "s28",
    english: "Do you speak English?",
    phonetic: "oyā Ingrisi kiyanawada?",
    tokens: ["oyā", "Ingrisi", "kiyanawada?"],
    distractors: ["kanā", "biththara"],
  },
  {
    id: "s29",
    english: "I speak a little.",
    phonetic: "mata tikak kiyanawa",
    tokens: ["mata", "tikak", "kiyanawa"],
    distractors: ["oyā", "bath"],
  },
  {
    id: "s30",
    english: "Please speak slowly.",
    phonetic: "karunakara slow widihata kiyanaw",
    tokens: ["karunakara", "slow", "widihata", "kiyanaw"],
    distractors: ["podi", "miris"],
  },

  // ===========================
  // FEELINGS / STATE
  // ===========================
  {
    id: "s31",
    english: "I am very tired.",
    phonetic: "mata godak nindae",
    tokens: ["mata", "godak", "nindae"],
    distractors: ["hondayi", "podi"],
  },
  {
    id: "s32",
    english: "I am hungry.",
    phonetic: "mata badagini",
    tokens: ["mata", "badagini"],
    distractors: ["batt", "kiri"],
  },
  {
    id: "s33",
    english: "I am thirsty.",
    phonetic: "mata bēdi",
    tokens: ["mata", "bēdi"],
    distractors: ["miris", "sītala"],
  },
  {
    id: "s34",
    english: "I am happy.",
    phonetic: "mata satutu",
    tokens: ["mata", "satutu"],
    distractors: ["nindae", "baya"],
  },

  // ===========================
  // EMERGENCY / NEED HELP
  // ===========================
  {
    id: "s35",
    english: "I need help.",
    phonetic: "mata udau one",
    tokens: ["mata", "udau", "one"],
    distractors: ["tikak", "kawadā"],
  },
  {
    id: "s36",
    english: "Please call someone.",
    phonetic: "karunakara kisikenek call karanna",
    tokens: ["karunakara", "kisikenek", "call", "karanna"],
    distractors: ["miris", "batt"],
  },
  {
    id: "s37",
    english: "I lost my phone.",
    phonetic: "mata phone eka næti una",
    tokens: ["mata", "phone", "eka", "næti", "una"],
    distractors: ["oyā", "podi"],
  },

  // ===========================
  // HOUSEHOLD / LIVING
  // ===========================
  {
    id: "s38",
    english: "Where is the bathroom?",
    phonetic: "bathroom koheda?",
    tokens: ["bathroom", "koheda?"],
    distractors: ["batt", "raatre"],
  },
  {
    id: "s39",
    english: "I need a towel.",
    phonetic: "mata towel one",
    tokens: ["mata", "towel", "one"],
    distractors: ["bath", "miris"],
  },
  {
    id: "s40",
    english: "The water is hot.",
    phonetic: "watura hotai",
    tokens: ["watura", "hotai"],
    distractors: ["sītala", "kiri"],
  },
];
