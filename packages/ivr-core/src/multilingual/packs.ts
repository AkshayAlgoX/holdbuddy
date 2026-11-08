/**
 * Language data: words only, no logic and no language pairs. Each language maps to shared concepts, so
 * adding a language means adding one entry here, and goal and IVR languages stay independent.
 *
 * Written by an engineer, not reviewed by native speakers, and not checked against real STT output
 * except for Hindi. A word missing from here leads to an abstention, never a guess.
 */
export const LANGUAGE_CODES = ["bn", "en", "gu", "hi", "kn", "ml", "mr", "pa", "ta", "te"] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

/** Each concept's value is the word the core's matcher already understands. */
export const CONCEPTS = {
  bill: "bill", billing: "billing", payment: "payment", complaint: "complaint", technical: "technical", support: "support",
  new_connection: "new connection", plans: "plans", broadband: "broadband", mobile: "mobile", landline: "landline", agent: "agent",
  repeat: "repeat", back: "return", main_menu: "main menu", refund: "refund", cancel: "cancellation", balance: "balance", upgrade: "upgrade",
} as const;
export type Concept = keyof typeof CONCEPTS;

/** What each language is called, in every script used here. Separate from the language being spoken. */
export const LANGUAGE_NAMES: Record<LanguageCode, { english: string; forms: readonly string[] }> = {
  bn: { english: "bengali", forms: ["bengali", "bangla", "বাংলা", "বাঙালি", "बंगाली", "बांग्ला", "ବଙ୍ଗାଳୀ", "ಬಂಗಾಳಿ", "ಬೆಂಗಾಲಿ", "ബംഗാളി", "ਬੰਗਾਲੀ", "வங்காளம்", "பெங்காலி", "బెంగాలీ", "બંગાળી"] },
  en: { english: "english", forms: ["english", "angrezi", "अंग्रेजी", "अंग्रेज़ी", "इंग्लिश", "ইংরেজি", "ઇંગ્લિશ", "અંગ્રેજી", "ಇಂಗ್ಲಿಷ್", "ഇംഗ്ലീഷ്", "ਅੰਗਰੇਜ਼ੀ", "ஆங்கிலம்", "ఇంగ్లీష్", "ఆంగ్లం"] },
  gu: { english: "gujarati", forms: ["gujarati", "ગુજરાતી", "गुजराती", "গুজরাটি", "ಗುಜರಾತಿ", "ഗുജറാത്തി", "ਗੁਜਰਾਤੀ", "குஜராத்தி", "గుజరాతీ"] },
  hi: { english: "hindi", forms: ["hindi", "हिंदी", "हिन्दी", "হিন্দি", "હિન્દી", "હિંદી", "ಹಿಂದಿ", "ഹിന്ദി", "ਹਿੰਦੀ", "ஹிந்தி", "இந்தி", "హిందీ"] },
  kn: { english: "kannada", forms: ["kannada", "ಕನ್ನಡ", "कन्नड़", "कन्नड", "কন্নড়", "કન્નડ", "കന്നഡ", "ਕੰਨੜ", "கன்னடம்", "కన్నడ"] },
  ml: { english: "malayalam", forms: ["malayalam", "മലയാളം", "मलयालम", "মালয়ালম", "મલયાલમ", "ಮಲಯಾಳಂ", "ਮਲਿਆਲਮ", "മലയാളത്ത", "மலையாளம்", "మలయాళం"] },
  mr: { english: "marathi", forms: ["marathi", "मराठी", "মারাঠি", "મરાઠી", "ಮರಾಠಿ", "മറാത്തി", "ਮਰਾਠੀ", "மராத்தி", "మరాఠీ"] },
  pa: { english: "punjabi", forms: ["punjabi", "ਪੰਜਾਬੀ", "पंजाबी", "পাঞ্জাবি", "પંજાબી", "ಪಂಜಾಬಿ", "പഞ്ചാബി", "பஞ்சாபி", "పంజాబీ"] },
  ta: { english: "tamil", forms: ["tamil", "தமிழ்", "तमिल", "তামিল", "તમિલ", "ತಮಿಳು", "ತಮಿಳಿ", "തമിഴ്", "ਤਮਿਲ", "తమిళం"] },
  te: { english: "telugu", forms: ["telugu", "తెలుగు", "तेलुगु", "तेलुगू", "তেলেগু", "તેલુગુ", "ತೆಲುಗು", "ತೆಲುಗಿ", "തെലുങ്ക്", "ਤੇਲਗੂ", "தெலுங்கு"] },
};

/**
 * Beginnings of press verbs. Conjugations are endless, but only count next to a digit. Kannada isn't here, because
 * a beginning also matches "must not press", "you pressed" and "no need to press". Its pack lists what means press.
 */
export const PRESS_STEMS: readonly string[] = ["दबा", "दाब", "টিপ", "চাপ", "દબા", "അമർത്ത", "ਦਬਾ", "ਦੱਬ", "அழுத்", "அமுக்", "நொக்க", "నొక్క", "dabay", "dabai", "azhuth", "amuk", "nokk", "amarth"];

/** Beginnings of words that say an instruction was wrong or withdrawn. Any of them stops the prompt. */
export const RETRACTION_STEMS: readonly string[] = ["अमान्य", "अवैध", "गलत", "चुकीच", "माफ", "क्षमा", "সংশোধন", "ভুল", "দুঃখিত", "અમાન્ય", "ખોટ", "માફ", "ಅಮಾನ್ಯ", "ತಪ್ಪು", "ಕ್ಷಮಿಸಿ", "ತಿದ್ದುಪಡಿ", "അസാധു", "തെറ്റ", "ക്ഷമിക്കണം", "തിരുത്ത", "ਗਲਤ", "ਅਵੈਧ", "ਮਾਫ", "ਸੋਧ", "தவறா", "தவறு", "மன்னிக்க", "திருத்த", "செல்லாத", "చెల్లని", "తప్పు", "క్షమించ", "సవరణ", "correction", "sorry", "invalid"];

/** Words that only urge haste. Alone, they don't describe a choice. */
export const HASTE_WORDS: readonly string[] = ["now", "immediately", "अभी", "तुरंत", "आत्ताच", "आता", "लगेच", "এখনই", "এখন", "હમણાં", "હવે", "ಈಗಲೇ", "ಈಗ", "ഇപ്പോൾ", "ഉടനെ", "ਹੁਣੇ", "ਹੁਣ", "இப்போதே", "இப்போது", "உடனே", "ఇప్పుడే", "ఇప్పుడు", "వెంటనే"];

/** Joining words that can separate two options in a spoken list. */
export const LIST_JOINERS: readonly string[] = ["and", "or", "और", "या", "आणि", "किंवा", "এবং", "ও", "অথবা", "અને", "અથવા", "ಮತ್ತು", "ಅಥವಾ", "ഒപ്പം", "അല്ലെങ്കിൽ", "ਅਤੇ", "ਜਾਂ", "மற்றும்", "அல்லது", "మరియు", "లేదా"];

/** Words that address the helper instead of the caller: "system instruction", "ignore". */
export const SPOOF_WORDS: readonly string[] = [
  "assistant", "system", "instruction", "instructions", "ignore", "override",
  "निर्देश", "सिस्टम", "अनदेखा", "दुर्लक्ष", "নির্দেশ", "সিস্টেম", "উপেক্ষা", "સિસ્ટમ", "અવગણો", "સૂચના", "ಸಿಸ್ಟಮ್", "ಸೂಚನೆ", "ನಿರ್ಲಕ್ಷಿಸಿ",
  "സിസ്റ്റം", "നിർദ്ദേശം", "അവഗണിക്കുക", "ਸਿਸਟਮ", "ਹਦਾਇਤ", "ਹਦਾਇਤਾਂ", "ਨਜਰਅੰਦਾਜ", "சிஸ்டம்", "அறிவுறுத்தல்", "புறக்கணி", "புறக்கணிக்கவும்", "సిస్టమ్", "సూచన", "విస్మరించు", "విస్మరించండి",
  "उपयोगकर्ता", "सहायक", "ਅਸਿਸਟੈਂਟ", "ಸಹಾಯಕ", "உதவியாளர்", "உதவியாளரே", "సహాయకుడు", "സഹായി", "সহকারী", "સહાયક",
];

/** Spoken signals, mapped to wording the hold and handoff checks already recognise. */
export const SIGNALS = {
  hold: "please hold", busy: "all agents are busy", my_name_is: "my name is", offer_help: "how can i help", offer: "limited time offer", recorded: "recorded",
} as const;
export type Signal = keyof typeof SIGNALS;

export interface LanguagePack {
  code: LanguageCode;
  /** Index is the digit. Native words first, then common romanised spellings. */
  digits: readonly (readonly string[])[];
  star?: readonly string[];
  hash?: readonly string[];
  press: readonly string[];
  /** Single words that already mean "don't press". */
  negatedPress?: readonly string[];
  negation: readonly string[];
  /** "Invalid", "wrong", "expired". */
  retraction: readonly string[];
  /** "Closed", "unavailable", "moved". */
  status: readonly string[];
  /** "Already", "after". */
  condition: readonly string[];
  /** "Enter your number". */
  input: readonly string[];
  /** "Twice", "then". */
  sequence: readonly string[];
  concepts: Partial<Record<Concept, readonly string[]>>;
  signals: Partial<Record<Signal, readonly string[]>>;
  /** Grammar and courtesy words that carry no meaning here. */
  filler: readonly string[];
  /** Endings that can follow a word in this language. Removing one never changes which concept it is. */
  endings: readonly string[];
}

const w = (text: string) => text.split(/\s*\|\s*/).filter(Boolean);

export const PACKS: Record<LanguageCode, LanguagePack> = {
  en: {
    code: "en",
    digits: ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"].map((d) => [d]),
    star: ["star"], hash: ["hash", "pound"],
    press: w("press|dial|select|choose"),
    negation: w("not|dont|never|except|without"),
    retraction: w("invalid|wrong|incorrect|expired|disregard|ignore"),
    status: w("moved|closed|unavailable|changed|suspended"),
    condition: w("already|unless|after|before"),
    input: w("enter|type"),
    sequence: w("twice|thrice|then|followed"),
    concepts: {},
    signals: { offer: w("offer|offers|discount|promotion|advertisement|sponsored") },
    filler: w("please|the|key|button|number|option|now"),
    endings: [],
  },
  hi: {
    code: "hi",
    digits: [w("शून्य|जीरो|shunya"), w("एक|ek"), w("दो|do"), w("तीन|teen|tin"), w("चार|char|chaar"), w("पांच|पाँच|paanch|panch"), w("छह|छः|छे|chhah|chhe"), w("सात|saat"), w("आठ|aath"), w("नौ|nau")],
    star: w("स्टार|star"), hash: w("हैश|hash"),
    press: w("दबाएं|दबाए|दबाये|दबायें|दबाइए|दबाइये|दबाओ|प्रेस|डायल|चुनें|dabaye|dabayein|dabaen|dabaiye|dabao"),
    negation: w("मत|नहीं|न|mat|nahi|nahin"),
    retraction: w("गलत|अमान्य|समाप्त|galat|amanya"),
    status: w("बंद|बदल|उपलब्ध नहीं|band|badal"),
    condition: w("पहले|बाद|पहले ही|pehle|baad"),
    input: w("दर्ज|टाइप|डालें|darj"),
    sequence: w("बार|फिर|baar|phir"),
    concepts: {
      bill: w("बिल|bill"), billing: w("बिलिंग|billing"), payment: w("भुगतान|पेमेंट|bhugtan|payment"), complaint: w("शिकायत|shikayat|complaint"),
      technical: w("तकनीकी|टेक्निकल|technical"), support: w("सहायता|मदद|sahayata|madad|support"), new_connection: w("नया कनेक्शन|नए कनेक्शन|naya connection"),
      plans: w("प्लान|योजना|plan|plans"), broadband: w("ब्रॉडबैंड|ब्राडबैंड|broadband"), mobile: w("मोबाइल|mobile"), landline: w("लैंडलाइन|landline"),
      agent: w("प्रतिनिधि|एजेंट|agent"), repeat: w("दोबारा|फिर से|dobara"), back: w("वापस|wapas"), main_menu: w("मुख्य मेनू|main menu"),
      refund: w("रिफंड|refund"), cancel: w("रद्द|cancel"), balance: w("बैलेंस|balance"), upgrade: w("अपग्रेड|upgrade"),
    },
    signals: { hold: w("लाइन पर बने|प्रतीक्षा|इंतजार|line par bane|pratiksha"), busy: w("व्यस्त हैं|vyast"), my_name_is: w("मेरा नाम|mera naam"), offer_help: w("क्या सहायता|कैसे मदद|kya sahayata|kaise madad"), offer: w("ऑफर|छूट|offer"), recorded: w("रिकॉर्ड") },
    filler: w("के लिए|के|का|की|लिए|कृपया|मेरे|मेरा|मेरी|आपके|अपने|है|हैं|करें|करना|ke|ka|ki|liye|kripya|mere|mera|hai|karein|karna|mujhe|मुझे|बटन|नंबर|को|और"),
    endings: [],
  },
  mr: {
    code: "mr",
    digits: [w("शून्य"), w("एक|ek"), w("दोन|don"), w("तीन|teen"), w("चार|char"), w("पाच|pach"), w("सहा|saha"), w("सात|saat"), w("आठ|aath"), w("नऊ|nau")],
    star: w("स्टार"), hash: w("हॅश"),
    press: w("दाबा|दाबावे|दाबू|प्रेस|daba|dabaa"),
    negation: w("नका|नाही|naka|nahi"),
    retraction: w("चुकीचा|चुकीची|अवैध|अमान्य"),
    status: w("बंद|बदलले|बदलला|हलवले|उपलब्ध नाही"),
    condition: w("आधीच|नंतर"),
    input: w("प्रविष्ट|टाका"),
    sequence: w("वेळा|नंतर"),
    concepts: {
      bill: w("बिल|बिला|bill"), billing: w("बिलिंग"), payment: w("देयक|पेमेंट|भरणा|भरण्या|भरण्यासाठी"), complaint: w("तक्रार|तक्रारी|takrar"), technical: w("तांत्रिक"), support: w("मदत|सहाय्य"),
      new_connection: w("नवीन कनेक्शन|नवीन जोडणी"), plans: w("प्लॅन|योजना"), broadband: w("ब्रॉडबँड"), mobile: w("मोबाइल|मोबाईल"), landline: w("लँडलाइन|लँडलाईन"),
      agent: w("प्रतिनिधी|एजंट"), repeat: w("पुन्हा"), back: w("मागे|परत"), main_menu: w("मुख्य मेनू"), refund: w("परतावा|रिफंड"), cancel: w("रद्द"), balance: w("बॅलन्स|शिल्लक"), upgrade: w("अपग्रेड"),
    },
    signals: { hold: w("प्रतीक्षा करा|थांबा|लाइनवर राहा"), busy: w("व्यस्त आहेत"), my_name_is: w("माझे नाव"), offer_help: w("काय मदत|कशी मदत"), offer: w("ऑफर|सवलत"), recorded: w("रेकॉर्ड") },
    filler: w("साठी|कृपया|तुमचा|तुमच्या|तुमची|माझ्या|माझा|माझी|मला|बद्दल|हवी|हवे|आहे|आहेत|करा|करायचे|करण्यासाठी|ची|चे|चा|च्या|बटण|क्रमांक|आणि"),
    endings: w("साठी|च्या|ची|चे|चा|ला|शी|बद्दल"),
  },
  bn: {
    code: "bn",
    digits: [w("শূন্য|shunyo"), w("এক|ek"), w("দুই|dui"), w("তিন|tin"), w("চার|char"), w("পাঁচ|panch"), w("ছয়|choy"), w("সাত|sat"), w("আট|aat"), w("নয়|noy")],
    star: w("স্টার"), hash: w("হ্যাশ"),
    press: w("টিপুন|চাপুন|টিপবেন|চাপবেন|প্রেস|tipun|chapun"),
    negation: w("না|নয়"),
    retraction: w("ভুল|অবৈধ|বাতিল হয়েছে"),
    status: w("বন্ধ|পরিবর্তিত|স্থানান্তরিত|অনুপলব্ধ"),
    condition: w("ইতিমধ্যে|পরে"),
    input: w("লিখুন|প্রবেশ"),
    sequence: w("বার|তারপর"),
    concepts: {
      bill: w("বিল|bill"), billing: w("বিলিং"), payment: w("পেমেন্ট|পরিশোধ|অর্থপ্রদান|প্রদান"), complaint: w("অভিযোগ|abhijog"), technical: w("প্রযুক্তিগত|টেকনিক্যাল"), support: w("সহায়তা|সাহায্য"),
      new_connection: w("নতুন সংযোগ|নতুন কানেকশন"), plans: w("প্ল্যান|পরিকল্পনা"), broadband: w("ব্রডব্যান্ড"), mobile: w("মোবাইল"), landline: w("ল্যান্ডলাইন"),
      agent: w("প্রতিনিধি|এজেন্ট"), repeat: w("আবার|পুনরায়"), back: w("ফিরে"), main_menu: w("মূল মেনু|প্রধান মেনু"), refund: w("রিফান্ড|ফেরত"), cancel: w("বাতিল"), balance: w("ব্যালেন্স"), upgrade: w("আপগ্রেড"),
    },
    signals: { hold: w("অপেক্ষা করুন|লাইনে থাকুন"), busy: w("ব্যস্ত আছেন"), my_name_is: w("আমার নাম"), offer_help: w("কীভাবে সাহায্য|কি সাহায্য"), offer: w("অফার|ছাড়"), recorded: w("রেকর্ড") },
    filler: w("জন্য|জন্যে|দয়া করে|অনুগ্রহ করে|আপনার|আমার|আমাকে|সম্পর্কে|নিয়ে|চাই|আছে|করুন|করতে|করা|এর|বোতাম|নম্বর|ও|এবং"),
    endings: w("এর|ের|র|কে|তে"),
  },
  gu: {
    code: "gu",
    digits: [w("શૂન્ય"), w("એક|ek"), w("બે|be"), w("ત્રણ|tran"), w("ચાર|char"), w("પાંચ|panch"), w("છ|chh"), w("સાત|sat"), w("આઠ|aath"), w("નવ|nav")],
    star: w("સ્ટાર"), hash: w("હેશ"),
    press: w("દબાવો|દબાવશો|પ્રેસ|dabavo"),
    negation: w("નહીં|ન|મત|nahi"),
    retraction: w("ખોટું|ખોટો|અમાન્ય"),
    status: w("બંધ|બદલાયું|બદલાઈ|ખસેડ્યું|ઉપલબ્ધ નથી"),
    condition: w("પહેલેથી|પછી"),
    input: w("દાખલ"),
    sequence: w("વખત|પછી"),
    concepts: {
      bill: w("બિલ|bill"), billing: w("બિલિંગ"), payment: w("ચુકવણી|પેમેન્ટ|ચૂકવણી"), complaint: w("ફરિયાદ|fariyad"), technical: w("તકનીકી|ટેકનિકલ"), support: w("સહાય|મદદ"),
      new_connection: w("નવું કનેક્શન|નવા કનેક્શન"), plans: w("પ્લાન|યોજના"), broadband: w("બ્રોડબેન્ડ"), mobile: w("મોબાઇલ|મોબાઈલ"), landline: w("લેન્ડલાઇન|લેન્ડલાઈન"),
      agent: w("પ્રતિનિધિ|એજન્ટ"), repeat: w("ફરીથી|ફરી"), back: w("પાછા"), main_menu: w("મુખ્ય મેનુ"), refund: w("રિફંડ"), cancel: w("રદ"), balance: w("બેલેન્સ"), upgrade: w("અપગ્રેડ"),
    },
    signals: { hold: w("રાહ જુઓ|લાઇન પર રહો"), busy: w("વ્યસ્ત છે"), my_name_is: w("મારું નામ"), offer_help: w("કેવી રીતે મદદ|શું મદદ"), offer: w("ઓફર|છૂટ"), recorded: w("રેકોર્ડ") },
    filler: w("માટે|કૃપા કરીને|તમારું|તમારા|મારું|મારા|મારે|મને|વિશે|છે|જોઈએ|કરો|કરવા|ની|નું|ના|નો|બટન|નંબર|અને"),
    endings: w("માટે|ની|નું|ના|નો"),
  },
  kn: {
    code: "kn",
    digits: [w("ಸೊನ್ನೆ|ಸೊನ್ನೆಯನ್ನು|sonne"), w("ಒಂದು|ಒಂದನ್ನು|ondu"), w("ಎರಡು|ಎರಡನ್ನು|eradu"), w("ಮೂರು|ಮೂರನ್ನು|mooru"), w("ನಾಲ್ಕು|ನಾಲ್ಕನ್ನು|naalku"), w("ಐದು|ಐದನ್ನು|aidu"), w("ಆರು|ಆರನ್ನು|aaru"), w("ಏಳು|ಏಳನ್ನು|elu"), w("ಎಂಟು|ಎಂಟನ್ನು|entu"), w("ಒಂಬತ್ತು|ಒಂಬತ್ತನ್ನು|ombattu")],
    star: w("ಸ್ಟಾರ್"), hash: w("ಹ್ಯಾಶ್"),
    press: w("ಒತ್ತಿ|ಒತ್ತಿರಿ|ಒತ್ತಿದರೆ|ಒತ್ತಬೇಕು|ಒತ್ತಬಹುದು|ಪ್ರೆಸ್|otti|ottiri"),
    negatedPress: w("ಒತ್ತಬೇಡಿ|ಒತ್ತಬೇಡ|ಒತ್ತಬಾರದು|ಒತ್ತುವಂತಿಲ್ಲ"),
    negation: w("ಬೇಡ|ಇಲ್ಲ|beda|ಮಾಡಬೇಡಿ|ಮಾಡಬೇಡ|ಮಾಡಬಾರದು"),
    retraction: w("ಅಮಾನ್ಯ|ತಪ್ಪು|ತಪ್ಪಾಯಿತು|ಬದಲು|ಬದಲಿಗೆ|actually"),
    status: w("ಮುಚ್ಚಲಾಗಿದೆ|ಬದಲಾಗಿದೆ|ಸ್ಥಳಾಂತರ|ಲಭ್ಯವಿಲ್ಲ"),
    condition: w("ಈಗಾಗಲೇ|ನಂತರ"),
    input: w("ನಮೂದಿಸಿ"),
    sequence: w("ಬಾರಿ|ನಂತರ"),
    concepts: {
      bill: w("ಬಿಲ್|ಬಿಲ್ಲು|bill"), billing: w("ಬಿಲ್ಲಿಂಗ್"), payment: w("ಪಾವತಿ|ಪಾವತಿಸಬೇಕು|ಪಾವತಿಸಲು|ಪೇಮೆಂಟ್|paavati"), complaint: w("ದೂರು|ದೂರಿ|dooru"), technical: w("ತಾಂತ್ರಿಕ"), support: w("ಸಹಾಯ|ಬೆಂಬಲ"),
      new_connection: w("ಹೊಸ ಸಂಪರ್ಕ|ಹೊಸ ಕನೆಕ್ಷನ್"), plans: w("ಯೋಜನೆ|ಪ್ಲಾನ್"), broadband: w("ಬ್ರಾಡ್ಬ್ಯಾಂಡ್"), mobile: w("ಮೊಬೈಲ್"), landline: w("ಲ್ಯಾಂಡ್ಲೈನ್"),
      agent: w("ಪ್ರತಿನಿಧಿ|ಏಜೆಂಟ್"), repeat: w("ಮತ್ತೆ|ಪುನಃ"), back: w("ಹಿಂದಕ್ಕೆ|ಹಿಂತಿರುಗಲು"), main_menu: w("ಮುಖ್ಯ ಮೆನು"), refund: w("ಮರುಪಾವತಿ|ರೀಫಂಡ್"), cancel: w("ರದ್ದು"), balance: w("ಬ್ಯಾಲೆನ್ಸ್"), upgrade: w("ಅಪ್ಗ್ರೇಡ್"),
    },
    signals: { hold: w("ದಯವಿಟ್ಟು ನಿರೀಕ್ಷಿಸಿ|ನಿರೀಕ್ಷಿಸಿ|ಲೈನ್‌ನಲ್ಲಿ ಇರಿ"), busy: w("ಕಾರ್ಯನಿರತರಾಗಿದ್ದಾರೆ"), my_name_is: w("ನನ್ನ ಹೆಸರು"), offer_help: w("ಹೇಗೆ ಸಹಾಯ|ಏನು ಸಹಾಯ"), offer: w("ಆಫರ್|ರಿಯಾಯಿತಿ"), recorded: w("ರೆಕಾರ್ಡ್|ವರ್ಚುವಲ್|ಸ್ವಯಂಚಾಲಿತ") },
    filler: w("ಗಾಗಿ|ಕ್ಕಾಗಿ|ಅನ್ನು|ದಯವಿಟ್ಟು|ನಿಮ್ಮ|ನನ್ನ|ನನಗೆ|ಬಗ್ಗೆ|ಬೇಕು|ಇದೆ|ಮಾಡಿ|ಮಾಡಲು|ಬಟನ್|ಸಂಖ್ಯೆ|ಮತ್ತು|ನೀಡಬೇಕು|ಸಲ್ಲಿಸಬೇಕು|ಕೊಡಬೇಕು|ಮಾಡಬೇಕು|ಧನ್ಯವಾದಗಳು|ವಂದನೆಗಳು"),
    endings: w("ಗಾಗಿ|ಕ್ಕಾಗಿ|ಗೆ|ಕ್ಕೆ|ಯನ್ನು|ಅನ್ನು|ನ್ನು|ನ|ದ"),
  },
  ml: {
    code: "ml",
    digits: [w("പൂജ്യം|poojyam"), w("ഒന്ന്|onnu"), w("രണ്ട്|randu"), w("മൂന്ന്|moonnu"), w("നാല്|naalu"), w("അഞ്ച്|anchu"), w("ആറ്|aaru"), w("ഏഴ്|ezhu"), w("എട്ട്|ettu"), w("ഒമ്പത്|ombathu")],
    star: w("സ്റ്റാർ"), hash: w("ഹാഷ്"),
    press: w("അമർത്തുക|അമർത്തൂ|അമർത്തുവിൻ|പ്രസ്|amarthuka"),
    negatedPress: w("അമർത്തരുത്"),
    negation: w("അരുത്|വേണ്ട|ഇല്ല"),
    retraction: w("അസാധു|തെറ്റായ|തെറ്റ്"),
    status: w("അടച്ചു|മാറ്റി|മാറി|ലഭ്യമല്ല"),
    condition: w("ഇതിനകം|ശേഷം"),
    input: w("നൽകുക"),
    sequence: w("തവണ|ശേഷം"),
    concepts: {
      bill: w("ബിൽ|ബില്ല്|ബില്ല|bill"), billing: w("ബില്ലിംഗ്"), payment: w("പേയ്മെന്റ്|പണമടയ്ക്കൽ|അടയ്ക്കാൻ|അടയ്ക്കുന്നതിന്"), complaint: w("പരാതി|parathi"), technical: w("സാങ്കേതിക"), support: w("സഹായം|പിന്തുണ"),
      new_connection: w("പുതിയ കണക്ഷൻ"), plans: w("പ്ലാൻ|പദ്ധതി"), broadband: w("ബ്രോഡ്ബാൻഡ്"), mobile: w("മൊബൈൽ"), landline: w("ലാൻഡ്ലൈൻ"),
      agent: w("പ്രതിനിധി|ഏജന്റ്"), repeat: w("വീണ്ടും"), back: w("തിരികെ"), main_menu: w("പ്രധാന മെനു"), refund: w("റീഫണ്ട്"), cancel: w("റദ്ദാക്കൽ|റദ്ദ്"), balance: w("ബാലൻസ്"), upgrade: w("അപ്ഗ്രേഡ്"),
    },
    signals: { hold: w("ദയവായി കാത്തിരിക്കുക|കാത്തിരിക്കുക|ലൈനിൽ തുടരുക"), busy: w("തിരക്കിലാണ്"), my_name_is: w("എന്റെ പേര്"), offer_help: w("എങ്ങനെ സഹായിക്കാം|എന്ത് സഹായം"), offer: w("ഓഫർ|കിഴിവ്"), recorded: w("റെക്കോർഡ്") },
    filler: w("വേണ്ടി|ദയവായി|നിങ്ങളുടെ|എന്റെ|എനിക്ക്|കുറിച്ച്|ആവശ്യമാണ്|ചെയ്യുക|ബട്ടൺ|നമ്പർ|ഒപ്പം"),
    endings: w("ിനെക്കുറിച്ചുള്ള|ിനെക്കുറിച്ച്|ിനായി|നായി|ിന്|യ്ക്ക്|ക്ക്|ഉം|ിന്റെ"),
  },
  pa: {
    code: "pa",
    digits: [w("ਸਿਫਰ"), w("ਇੱਕ|ikk"), w("ਦੋ|do"), w("ਤਿੰਨ|tinn"), w("ਚਾਰ|char"), w("ਪੰਜ|panj"), w("ਛੇ|chhe"), w("ਸੱਤ|satt"), w("ਅੱਠ|atth"), w("ਨੌਂ|ਨੌ|naun")],
    star: w("ਸਟਾਰ"), hash: w("ਹੈਸ਼"),
    press: w("ਦਬਾਓ|ਦਬਾਉ|ਪ੍ਰੈਸ|dabao"),
    negation: w("ਨਾ|ਨਹੀਂ|ਮਤ"),
    retraction: w("ਗਲਤ|ਅਵੈਧ"),
    status: w("ਬੰਦ|ਬਦਲ|ਉਪਲਬਧ ਨਹੀਂ"),
    condition: w("ਪਹਿਲਾਂ|ਬਾਅਦ"),
    input: w("ਦਰਜ"),
    sequence: w("ਵਾਰ|ਫਿਰ"),
    concepts: {
      bill: w("ਬਿੱਲ|ਬਿਲ|bill"), billing: w("ਬਿਲਿੰਗ"), payment: w("ਭੁਗਤਾਨ|ਪੇਮੈਂਟ"), complaint: w("ਸ਼ਿਕਾਇਤ|shikayat"), technical: w("ਤਕਨੀਕੀ"), support: w("ਸਹਾਇਤਾ|ਮਦਦ"),
      new_connection: w("ਨਵਾਂ ਕੁਨੈਕਸ਼ਨ|ਨਵਾਂ ਕਨੈਕਸ਼ਨ"), plans: w("ਪਲਾਨ|ਯੋਜਨਾ"), broadband: w("ਬ੍ਰਾਡਬੈਂਡ"), mobile: w("ਮੋਬਾਈਲ"), landline: w("ਲੈਂਡਲਾਈਨ"),
      agent: w("ਪ੍ਰਤੀਨਿਧੀ|ਏਜੰਟ"), repeat: w("ਦੁਬਾਰਾ|ਮੁੜ"), back: w("ਵਾਪਸ"), main_menu: w("ਮੁੱਖ ਮੀਨੂ"), refund: w("ਰਿਫੰਡ"), cancel: w("ਰੱਦ"), balance: w("ਬਕਾਇਆ|ਬੈਲੇਂਸ"), upgrade: w("ਅੱਪਗ੍ਰੇਡ"),
    },
    signals: { hold: w("ਉਡੀਕ ਕਰੋ|ਲਾਈਨ ਤੇ ਰਹੋ"), busy: w("ਰੁੱਝੇ ਹੋਏ"), my_name_is: w("ਮੇਰਾ ਨਾਮ"), offer_help: w("ਕਿਵੇਂ ਮਦਦ|ਕੀ ਮਦਦ"), offer: w("ਆਫਰ|ਛੋਟ"), recorded: w("ਰਿਕਾਰਡ") },
    filler: w("ਲਈ|ਕਿਰਪਾ ਕਰਕੇ|ਤੁਹਾਡੇ|ਤੁਹਾਡਾ|ਮੇਰੇ|ਮੇਰਾ|ਮੇਰੀ|ਮੈਨੂੰ|ਬਾਰੇ|ਹੈ|ਚਾਹੀਦੀ|ਚਾਹੀਦਾ|ਕਰੋ|ਕਰਨ|ਦੇ|ਦੀ|ਦਾ|ਬਟਨ|ਨੰਬਰ|ਅਤੇ"),
    endings: w("ਲਈ|ਦੇ|ਦੀ|ਦਾ"),
  },
  ta: {
    code: "ta",
    digits: [w("பூஜ்யம்|பூஜ்ஜியம்|poojiyam"), w("ஒன்று|ஒன்றை|ஒண்ணு|onnu|onru"), w("இரண்டு|இரண்டை|ரெண்டு|rendu"), w("மூன்று|மூன்றை|மூணு|moonu|moonru"), w("நான்கு|நான்கை|நாலு|naalu"), w("ஐந்து|ஐந்தை|அஞ்சு|ainthu|anju"), w("ஆறு|ஆறை|aaru"), w("ஏழு|ஏழை|ezhu"), w("எட்டு|எட்டை|ettu"), w("ஒன்பது|ஒன்பதை|onbathu")],
    star: w("ஸ்டார்"), hash: w("ஹாஷ்"),
    press: w("அழுத்தவும்|அழுத்துங்கள்|அழுத்து|அழுத்த|அமுக்கவும்|அமுக்குங்க|பிரஸ்|azhuthavum|amukkavum"),
    negation: w("வேண்டாம்|இல்லை|கூடாது|vendam"),
    retraction: w("தவறான|தவறு|செல்லாத"),
    status: w("மூடப்பட்டது|மாற்றப்பட்டது|மாறிவிட்டது|கிடைக்கவில்லை"),
    condition: w("ஏற்கனவே|பிறகு"),
    input: w("உள்ளிடவும்"),
    sequence: w("முறை|பிறகு"),
    concepts: {
      bill: w("பில்|பில்லு|பில்ல|bill"), billing: w("பில்லிங்|கட்டண"), payment: w("பணம் செலுத்த|கட்டணம் செலுத்த|செலுத்த|செலுத்துவதற்கு|பேமெண்ட்"), complaint: w("புகார்|pugar"), technical: w("தொழில்நுட்ப"), support: w("உதவி|ஆதரவு"),
      new_connection: w("புதிய இணைப்பு|புதிய கனெக்ஷன்"), plans: w("திட்ட|திட்டம்|பிளான்"), broadband: w("பிராட்பேண்ட்"), mobile: w("மொபைல்"), landline: w("லேண்ட்லைன்"),
      agent: w("பிரதிநிதி|முகவர்"), repeat: w("மீண்டும்"), back: w("திரும்ப"), main_menu: w("முதன்மை மெனு|முக்கிய மெனு"), refund: w("ரீஃபண்ட்"), cancel: w("ரத்து"), balance: w("பேலன்ஸ்|இருப்பு"), upgrade: w("அப்கிரேட்"),
    },
    signals: { hold: w("காத்திருக்கவும்|லைனில் இருங்கள்"), busy: w("பிஸியாக உள்ளனர்"), my_name_is: w("என் பெயர்"), offer_help: w("எப்படி உதவ|என்ன உதவி"), offer: w("சலுகை|தள்ளுபடி"), recorded: w("பதிவு") },
    filler: w("க்கு|க்காக|ku|kku|தயவுசெய்து|உங்கள்|என்|எனது|எனக்கு|பற்றி|பற்றிய|வேண்டும்|எண்|ஐ|பொத்தான்|செய்யவும்|பண்ணுங்க|pannunga|மற்றும்"),
    endings: w("லுக்காக|லுக்கு|ுக்காக|ுக்கு|க்காக|க்கு|ிற்கு|ை|ில்"),
  },
  te: {
    code: "te",
    digits: [w("సున్నా|sunna"), w("ఒకటి|okati"), w("రెండు|rendu"), w("మూడు|moodu"), w("నాలుగు|naalugu"), w("ఐదు|aidu"), w("ఆరు|aaru"), w("ఏడు|edu"), w("ఎనిమిది|enimidi"), w("తొమ్మిది|tommidi")],
    star: w("స్టార్"), hash: w("హాష్"),
    press: w("నొక్కండి|నొక్కు|నొక్కాలి|ప్రెస్|nokkandi"),
    negatedPress: w("నొక్కవద్దు|నొక్కకండి"),
    negation: w("వద్దు|కాదు"),
    retraction: w("చెల్లని|తప్పు"),
    status: w("మూసివేయబడింది|మార్చబడింది|అందుబాటులో లేదు"),
    condition: w("ఇప్పటికే|తర్వాత"),
    input: w("నమోదు"),
    sequence: w("సార్లు|తర్వాత"),
    concepts: {
      bill: w("బిల్లు|బిల్|bill"), billing: w("బిల్లింగ్"), payment: w("చెల్లింపు|చెల్లించడానికి|చెల్లింపుల|పేమెంట్"), complaint: w("ఫిర్యాదు|firyadu"), technical: w("సాంకేతిక"), support: w("సహాయం|మద్దతు|సహాయ"),
      new_connection: w("కొత్త కనెక్షన్"), plans: w("ప్లాన్|ప్రణాళిక"), broadband: w("బ్రాడ్బ్యాండ్"), mobile: w("మొబైల్"), landline: w("ల్యాండ్లైన్"),
      agent: w("ప్రతినిధి|ఏజెంట్"), repeat: w("మళ్ళీ|మళ్లీ"), back: w("వెనుకకు|వెనక్కి"), main_menu: w("ప్రధాన మెనూ|ప్రధాన మెను"), refund: w("రిఫండ్"), cancel: w("రద్దు"), balance: w("బ్యాలెన్స్"), upgrade: w("అప్గ్రేడ్"),
    },
    signals: { hold: w("దయచేసి వేచి ఉండండి|వేచి ఉండండి|లైన్‌లో ఉండండి"), busy: w("బిజీగా ఉన్నారు"), my_name_is: w("నా పేరు"), offer_help: w("ఎలా సహాయం|ఏమి సహాయం"), offer: w("ఆఫర్|తగ్గింపు"), recorded: w("రికార్డ్") },
    filler: w("కోసం|కొరకు|దయచేసి|మీ|నా|నాకు|గురించి|కావాలి|ఉంది|చేయండి|బటన్|సంఖ్య|మరియు"),
    endings: w("కోసం|కొరకు|కు|కి|ను|లో"),
  },
};
