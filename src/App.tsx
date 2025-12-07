import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { VOCAB } from "./data/vocab";
import { SENTENCES } from "./data/sentences"; 
import "./App.css";

/* =======================
   Types
======================= */

type VocabEntry = {
  id: string;
  category: string;
  english: string;
  phonetic: string;
};

type CardData = VocabEntry; 

// SM-2 Spaced Repetition System Card Data
type SRSCard = {
  id: string;
  reps: number;
  lapses: number;
  ease: number;
  interval: number; // in days
  due: number; // timestamp (ms)
  lastReviewed?: number;
  strength: number; // 0..100 (For UX display)
};

// Type for the Sentence Data from sentences.ts
type SentenceEntry = {
  id: string;
  english: string;
  phonetic: string; // The correct final Sinhala phonetic sentence
  tokens: string[]; // The words that form the phonetic sentence in order
  distractors?: string[]; // Distractors are ignored in the builder, but kept in type
};


type SessionSize = 5 | 10 | 20 | "unlimited";

type AppState = {
  srs: Record<string, SRSCard>;
  streak: number;
  lastStudyDay?: string;
  totalReviews: number;
  correctReviews: number;
  selectedCategory: string | "all"; 
  sessionSize: SessionSize;
};

type Session = {
    studyQueue: CardData[];
    index: number;
    active: boolean;
    totalCards: number;
    sessionCategory: string; // Track which category this session is for
};

// Sentence Practice Session state
type SentenceSession = {
    queue: SentenceEntry[];
    index: number;
    active: boolean;
    totalCards: number;
    sessionCategory: string; // Track the current sentence category
    isReview: boolean; 
};

type ScreenKey =
  | "home"
  | "categories"
  | "review" 
  | "learn" 
  | "practice" 
  | "stats"
  | "settings"
  | "practice-sentences"
  | "sentence-categories"; 

type Screen = {
  key: ScreenKey;
  category?: string; // Tracks the active study category
};

/* =======================
   Constants
======================= */

const MAX_NEW_CARDS_TO_LEARN = 5; 
const ANSWER_DELAY_MS = 800; 

const WEAK_CARD_MULTIPLIER = 3; 
const FULL_REVIEW_ID = "full-review-mode"; 

// --- Sentence Category Data Structure (UPDATED for 100 sentences) ---
const SENTENCE_CATEGORIES_DATA = [
    { id: "greetings", label: "Greetings & Polite Speech", sentenceIds: ["s1", "s2", "s3", "s4", "s5"] },
    { id: "daily_life", label: "Daily Life", sentenceIds: ["s6", "s7", "s8", "s9", "s10"] },
    { id: "food", label: "Food & Restaurants (Essentials)", sentenceIds: ["s11", "s12", "s13", "s14", "s15"] },
    { id: "travel", label: "Travel & Directions", sentenceIds: ["s16", "s17", "s18", "s19", "s20"] },
    { id: "shopping_money_basic", label: "Shopping & Money (Basic)", sentenceIds: ["s21", "s22", "s23", "s24", "s25"] },
    { id: "social", label: "Social Interaction", sentenceIds: ["s26", "s27", "s28", "s29", "s30"] },
    { id: "feelings", label: "Feelings / State", sentenceIds: ["s31", "s32", "s33", "s34"] },
    { id: "emergency", label: "Emergency / Help", sentenceIds: ["s35", "s36", "s37"] },
    { id: "household", label: "Household / Living", sentenceIds: ["s38", "s39", "s40"] },
    { id: "holiday_accommodation", label: "Holiday: Accommodation", sentenceIds: ["s41", "s42", "s43", "s44", "s45", "s46", "s47", "s48", "s49", "s50"] },
    { id: "holiday_transport", label: "Holiday: Transportation", sentenceIds: ["s51", "s52", "s53", "s54", "s55", "s56", "s57", "s58", "s59", "s60"] },
    { id: "holiday_sightseeing", label: "Holiday: Sightseeing & Photos", sentenceIds: ["s61", "s62", "s63", "s64", "s65", "s66", "s67", "s68", "s69", "s70"] },
    { id: "holiday_shopping", label: "Holiday: Shopping & Bargaining", sentenceIds: ["s71", "s72", "s73", "s74", "s75", "s76", "s77", "s78", "s79", "s80"] },
    { id: "holiday_food", label: "Holiday: Ordering Food & Needs", sentenceIds: ["s81", "s82", "s83", "s84", "s85", "s86", "s87", "s88", "s89", "s90"] },
    { id: "holiday_time", label: "Holiday: Time & Numbers", sentenceIds: ["s91", "s92", "s93", "s94", "s95", "s96", "s97", "s98", "s99", "s100"] },
];
const SENTENCE_MAP: Record<string, SentenceEntry> = SENTENCES.reduce((acc, s) => {
    acc[s.id] = s;
    return acc;
}, {} as Record<string, SentenceEntry>);


/* =======================
   Utilities
======================= */

function shuffle<T>(array: T[]): T[] {
  let currentIndex = array.length,
    randomIndex;
  const newArray = [...array];

  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [newArray[currentIndex], newArray[randomIndex]] = [
      newArray[randomIndex],
      newArray[currentIndex],
    ];
  }
  return newArray;
}

function generateChoices(word: CardData, vocab: CardData[]): CardData[] {
    const distractors = shuffle(vocab.filter((v) => v.id !== word.id));
    const selectedDistractors = distractors.slice(0, 3); 
    const options = shuffle([...selectedDistractors, word]);

    return options;
}
const APP_STATE_KEY = "sinhalaTrainerAppState";
function loadAppState(): AppState {
    const defaultAppState: AppState = {
        srs: {},
        streak: 0,
        totalReviews: 0,
        correctReviews: 0,
        selectedCategory: "all",
        sessionSize: 10,
        lastStudyDay: undefined,
    };
    try {
      const json = localStorage.getItem(APP_STATE_KEY);
      if (json) {
        const loadedState: AppState = JSON.parse(json);

        for (const id in loadedState.srs) {
          loadedState.srs[id].due = Number(loadedState.srs[id].due);
          if (loadedState.srs[id].lastReviewed) {
            loadedState.srs[id].lastReviewed = Number(loadedState.srs[id].lastReviewed);
          }
        }
        return { ...defaultAppState, ...loadedState }; 
      }
    } catch (e) {
      console.error("Could not load state from local storage", e);
    }
    return defaultAppState;
}
function saveAppState(state: AppState) {
    try {
      localStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Could not save state to local storage", e);
    }
}
function calculateSM2(card: SRSCard, quality: 1 | 2 | 3 | 4) {
    let { reps, lapses, ease, interval } = card;

    if (quality >= 3) {
      reps = reps + 1;
      lapses = lapses;
      ease = ease + (0.1 - (3 - quality) * (0.08 + (3 - quality) * 0.02));
      ease = Math.max(1.3, ease); 

      if (reps === 1) {
        interval = 1;
      } else if (reps === 2) {
        interval = 6;
      } else {
        interval = Math.round(interval * ease);
      }
    } else {
      reps = 0;
      lapses = lapses + 1;
      interval = 1;
      ease = ease - 0.2;
      ease = Math.max(1.3, ease);
    }

    const today = new Date().getTime();
    const nextDue = today + interval * 24 * 60 * 60 * 1000;
    const strength = Math.max(0, 100 - lapses * 15);

    const lastReviewed = today;

    return {
      id: card.id, 
      reps,
      lapses,
      ease,
      interval,
      due: nextDue,
      lastReviewed,
      strength,
    };
}


/* =======================
   Default State & Data
======================= */

const ALL_WORDS: CardData[] = VOCAB;

const ALL_CATEGORIES: { id: string; label: string }[] = [
  ...new Set(VOCAB.map((v) => v.category)),
].map((cat) => ({ id: cat, label: cat.charAt(0).toUpperCase() + cat.slice(1) }));

/* =======================
   Components 
======================= */

// --- Sentence Quiz Screen (Reused for both category practice and full review) ---
function SentenceQuizScreen({
    sentence,
    onComplete,
    onSkip,
    globalTokenPool, 
}: {
    sentence: SentenceEntry;
    onComplete: (isCorrect: boolean) => void;
    onSkip: () => void;
    globalTokenPool: string[];
}) {
    const [wordChoices, setWordChoices] = useState<string[]>([]);
    const [constructedSentence, setConstructedSentence] = useState<string[]>([]);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    const [showNextButton, setShowNextButton] = useState(false);
    
    const NUM_DYNAMIC_DISTRACTORS = 4;

    useEffect(() => {
        const correctTokens = sentence.tokens;
        // Generate dynamic distractors from the entire token pool that aren't in the current sentence
        const distractorCandidates = globalTokenPool.filter(token => 
            !correctTokens.includes(token)
        );
        const selectedDistractors = shuffle(distractorCandidates).slice(0, NUM_DYNAMIC_DISTRACTORS);
        const fullWordBank = [...correctTokens, ...selectedDistractors];

        setWordChoices(shuffle(fullWordBank));
        setConstructedSentence([]);
        setIsCorrect(null);
        setShowNextButton(false);
        
    }, [sentence, globalTokenPool]);

    const handleWordClick = useCallback((word: string) => {
        if (isCorrect !== null) return; 

        setConstructedSentence((prev) => {
            const newSentence = [...prev, word];
            
            // Check for completion first
            if (newSentence.length === sentence.tokens.length) {
                // Final check: Compare built tokens to the correct phonetic sentence
                const success = newSentence.join(' ') === sentence.tokens.join(' ');
                setIsCorrect(success);
                setShowNextButton(true);
            } 
            
            return newSentence;
        });

        setWordChoices((prev) => prev.filter((w) => w !== word));
    }, [isCorrect, sentence]);

    const handleClear = useCallback(() => {
        if (isCorrect !== null) return;
        
        // Re-generate the word bank for a clean slate
        const correctTokens = sentence.tokens;
        const distractorCandidates = globalTokenPool.filter(token => 
            !correctTokens.includes(token)
        );
        const selectedDistractors = shuffle(distractorCandidates).slice(0, NUM_DYNAMIC_DISTRACTORS);
        const fullWordBank = [...correctTokens, ...selectedDistractors];

        setWordChoices(shuffle(fullWordBank));
        setConstructedSentence([]);
    }, [isCorrect, sentence, globalTokenPool]);

    const handleNext = useCallback(() => {
        if (isCorrect === null) return; 

        onComplete(isCorrect); 
    }, [isCorrect, onComplete]);


    return (
        <div className="memCard memSentenceCard">
            <div className="memCardHeader">
                <span className="muted small">Sentence Builder Quiz</span>
            </div>
            
            <div className="memCardContent">
                <div className="foreignWord large" style={{ marginBottom: '20px' }}>
                    {sentence.english}
                </div>
                
                <div className={`sentenceTarget large ${isCorrect === true ? 'correctTarget' : isCorrect === false ? 'wrongTarget' : ''}`}>
                    {constructedSentence.length > 0 ? constructedSentence.join(' ') : "Click the words to build the sentence."}
                </div>

                {isCorrect !== null && (
                    <div className={`memPracticeResult ${isCorrect ? "ok" : "bad"}`} style={{ marginTop: '15px' }}>
                        {isCorrect 
                            ? "Perfect! 🎉" 
                            : `Incorrect. The correct sentence was: ${sentence.phonetic}`}
                    </div>
                )}
                
                <div className="memChoicesGrid sentence-choices" style={{ marginTop: '30px', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px' }}>
                    {wordChoices.map((word, index) => (
                        <button
                            key={index}
                            className={`choice memBtn sentence-word-btn`}
                            onClick={() => handleWordClick(word)}
                            disabled={isCorrect !== null}
                        >
                            {word}
                        </button>
                    ))}
                </div>
                
            </div>

            <div className="memCardFooter" style={{ paddingTop: '20px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                        className="memBtn muted small" 
                        onClick={handleClear} 
                        disabled={isCorrect !== null || constructedSentence.length === 0}
                    >
                        Clear
                    </button>
                    <button className="memBtn muted small" onClick={onSkip} disabled={isCorrect !== null}>
                        Skip
                    </button>
                </div>
                
                {showNextButton && (
                    <button className="memBtn memPrimary" onClick={handleNext}>
                        Next Sentence
                    </button>
                )}
            </div>
        </div>
    );
}

// --- Quiz Screen (Multiple Choice - Only used for Vocab Review) ---
function QuizScreen({
  word,
  vocabPool: _vocabPool, 
  onAnswer,
  onSkip,
  srsCard,
  isPracticeMode, 
  isNewCard,
  sessionCategory: _sessionCategory, 
}: {
  word: CardData;
  vocabPool: CardData[];
  onAnswer: (quality: 1 | 2 | 3 | 4) => void;
  onSkip: () => void;
  srsCard: SRSCard | null;
  isPracticeMode: boolean;
  isNewCard: boolean;
  sessionCategory: string;
}) {
    const [selected, setSelected] = useState<string | null>(null);
    const [choices, setChoices] = useState<CardData[]>([]);
    const [showNextButton, setShowNextButton] = useState(false); 
    
    const timeoutRef = useRef<number | null>(null); 

    useEffect(() => {
        // Use ALL_WORDS (the full vocab) for distractors here
        setChoices(generateChoices(word, ALL_WORDS));
        setSelected(null);
        setShowNextButton(false);
        
        return () => {
            if (timeoutRef.current !== null) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, [word]); 

    function handleSelect(choice: CardData) {
        if (selected) return;

        setSelected(choice.id);

        const isCorrect = choice.id === word.id;
        const quality = isCorrect ? 3 : 1; 

        const timer = setTimeout(() => { 
            if (isCorrect) {
                onAnswer(quality); 
            } else {
                setShowNextButton(true); 
            }
        }, ANSWER_DELAY_MS); 
        
        timeoutRef.current = timer; 
    }
    
    function handleNext() {
        if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null; 
        }
        onAnswer(1); 
    }

    function getChoiceClass(choice: CardData) {
        if (!selected) return "";
        
        if (choice.id === word.id) {
            return "correct"; 
        }

        if (choice.id === selected && choice.id !== word.id) {
            return "wrong"; 
        }

        return selected ? "disabled" : ""; 
    }

    const headerLabel = isPracticeMode 
        ? "Quiz Mode" 
        : isNewCard 
        ? "Learning Phase"
        : word.category.charAt(0).toUpperCase() + word.category.slice(1);

    const answerWasWrong = selected !== null && selected !== word.id;

    return (
        <div className="memCard">
            <div className="memCardHeader">
                <span className="muted small">{headerLabel}</span>
                {srsCard && !isPracticeMode && (
                    <span className="muted small" style={{ marginLeft: 10 }}>
                        Lapses: {srsCard.lapses} | Ease: {srsCard.ease.toFixed(2)}
                    </span>
                )}
            </div>

            <div className="memCardContent">
                <div className="foreignWord large">{word.english}</div>
                <div className="foreignMeaning muted">
                    Choose the correct Sinhala phonetic word:
                </div>

                <div className="memChoicesGrid" style={{ marginTop: '20px' }}>
                    {choices.map((choice) => (
                    <button
                        key={choice.id}
                        className={`choice memBtn ${getChoiceClass(choice)}`}
                        onClick={() => handleSelect(choice)}
                        disabled={!!selected}
                    >
                        {choice.phonetic}
                    </button>
                    ))}
                </div>

                {selected && (
                    <div className={`memPracticeResult ${selected === word.id ? "ok" : "bad"}`}>
                    {selected === word.id
                        ? "Correct! 🎉" + (isPracticeMode ? "" : " Scheduling for longer.")
                        : `Incorrect. The correct word was: ${word.phonetic}`}
                    </div>
                )}
                
                {showNextButton && answerWasWrong && (
                    <button className="memBtn memPrimary" onClick={handleNext} style={{ marginTop: '20px' }}>
                        Got It / Next Card
                    </button>
                )}
            </div>

            <div className="memCardFooter">
                <button className="memBtn muted small" onClick={onSkip} disabled={!!selected || showNextButton}>
                    {isPracticeMode ? "Next Random" : "Skip"}
                </button>
            </div>
        </div>
    );
}

// ... (TopBar, ProgressBar, StatBox, CategoryItem - OMITTED for brevity)
function TopBar({
    onNavigate,
    totalDue,
  }: {
    onNavigate: (key: ScreenKey) => void;
    totalDue: number;
  }) {
      return (
          <div className="memTopbar"> 
              <div className="memBrand" onClick={() => onNavigate("home")}>
                  Sinhala Trainer
              </div>
              <div className="memTopbarActions">
                  <button
                      className="memBtn small muted"
                      onClick={() => onNavigate("settings")} 
                      title="Settings"
                  >
                      ⚙️
                  </button>
                  <button
                      className={`memBtn small memPrimary ${totalDue > 0 ? "active" : ""}`}
                      onClick={() => onNavigate("categories")} 
                      disabled={totalDue === 0}
                  >
                      {totalDue > 0 ? `Study (${totalDue})` : "Study"}
                  </button>
              </div>
          </div>
      );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
    const clampedDone = Math.min(done, total);
    const pct =
        total === 0 ? 0 : Math.round((clampedDone / total) * 100);

    return (
        <div className="memProgress">
            <div className="memProgressBar">
                <div className="memProgressFill" style={{ width: `${pct}%` }} />
            </div>
            <div className="muted small">
                {clampedDone}/{total}
            </div>
        </div>
    );
}
function StatBox({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="memStatBox">
            <div className="statLabel">{label}</div>
            <div className="statValue">{value}</div>
        </div>
    );
}
function CategoryItem({
    category,
    count,
    onStudy,
    stats,
    isSentence, 
  }: {
    category: { id: string; label: string };
    count: number;
    onStudy: (id: string) => void;
    stats: { reviewsDue: number; newCards: number };
    isSentence?: boolean;
  }) {
      const totalCount = isSentence ? count : stats.reviewsDue + stats.newCards;
      
      return (
          <div className="memCategoryItem">
              <div className="categoryInfo">
                  <div className="categoryName large">{category.label}</div>
                  <div className="categoryCount muted">
                      {count} {isSentence ? "sentences" : "words"} total 
                      {!isSentence && stats.reviewsDue > 0 && <span> • {stats.reviewsDue} due</span>}
                      {!isSentence && stats.newCards > 0 && <span> • {stats.newCards} new</span>}
                  </div>
              </div>
              <button 
                  className={`memBtn small memPrimary active`}
                  onClick={() => onStudy(category.id)}
              >
                  {isSentence ? `Practice (${count})` : `Study (${totalCount > 0 ? totalCount : 0})`}
              </button>
          </div>
      );
}


/* =======================
   Main App
======================= */

function App() {
  const [state, setState] = useState<AppState>(loadAppState);
  const [screen, setScreen] = useState<Screen>({ key: "home", category: "" });
  
  const [sentenceSession, setSentenceSession] = useState<SentenceSession | null>(null);
  const [session, setSession] = useState<Session | null>(null); 

  useEffect(() => {
    saveAppState(state);
  }, [state]);

  // 1. Calculate All Sentence Tokens (for distractor pool in Sentence Quiz)
  const ALL_SENTENCE_TOKENS: string[] = useMemo(() => {
    const allTokensSet = new Set<string>();
    SENTENCES.forEach(s => {
        s.tokens.forEach(token => allTokensSet.add(token));
    });
    return Array.from(allTokensSet);
  }, []);
  
  const { totalReviewsDue, totalNewCards, allCategoryStats, categoryVocabPools } = useMemo(() => {
    const today = new Date().getTime();
    let totalReviewsDue = 0;
    let totalNewCards = 0;
    const stats: Record<string, { reviewsDue: CardData[], newCards: CardData[] }> = {};
    const vocabPools: Record<string, CardData[]> = {};
    
    ALL_CATEGORIES.forEach(cat => {
        stats[cat.id] = { reviewsDue: [], newCards: [] };
        vocabPools[cat.id] = [];
    });

    ALL_WORDS.forEach((word) => {
      const srsCard = state.srs[word.id];
      const categoryId = word.category;

      if (!stats[categoryId]) return; 
      
      vocabPools[categoryId].push(word);

      if (srsCard && srsCard.due <= today) {
        stats[categoryId].reviewsDue.push(word);
        totalReviewsDue++;
      } else if (!srsCard) {
        stats[categoryId].newCards.push(word);
        totalNewCards++;
      }
    });
    
    const allCategoryStats: Record<string, { reviewsDue: number, newCards: number, reviewQueue: CardData[], newQueue: CardData[] }> = {};
    for (const id in stats) {
        stats[id].reviewsDue.sort((a, b) => (state.srs[a.id]?.due || 0) - (state.srs[b.id]?.due || 0));
        allCategoryStats[id] = {
            reviewsDue: stats[id].reviewsDue.length,
            newCards: stats[id].newCards.length,
            reviewQueue: stats[id].reviewsDue,
            newQueue: shuffle(stats[id].newCards)
        };
    }

    return {
      totalReviewsDue,
      totalNewCards,
      allCategoryStats,
      categoryVocabPools: vocabPools,
    };
  }, [state.srs]);

  const navigate = useCallback((key: ScreenKey, category?: string) => {
    setScreen({ key, category: category ?? screen.category });
    
    // Clear study session state if navigating away from study/practice screens
    if (key !== "review" && key !== "practice") {
      setSession(null); 
    }
    // Clear sentence session state if navigating away from sentence practice
    if (key !== "practice-sentences") { 
        setSentenceSession(null);
    }
  }, [screen.category]);

  const endSession = useCallback(() => {
    setSession(null);
    navigate(screen.category === FULL_REVIEW_ID ? "home" : "categories");
  }, [navigate, screen.category]);
  
  // Sentence Quiz completion (for the builder screen)
  const endSentenceSession = useCallback(() => {
    setSentenceSession(null);
    // Always go to sentence categories
    navigate("sentence-categories"); 
  }, [navigate]);


  const startSentencePractice = useCallback((categoryId: string) => {
    const categoryInfo = SENTENCE_CATEGORIES_DATA.find(c => c.id === categoryId);
    if (!categoryInfo) return;

    const categorySentences: SentenceEntry[] = categoryInfo.sentenceIds
        .map(id => SENTENCE_MAP[id])
        .filter((s): s is SentenceEntry => !!s);
    
    const sessionLimit = state.sessionSize === "unlimited" ? categorySentences.length : Number(state.sessionSize);
    const queue = shuffle(categorySentences).slice(0, sessionLimit);

    if (queue.length === 0) return;

    setSentenceSession({
        queue: queue,
        index: 0,
        active: true,
        totalCards: queue.length,
        sessionCategory: categoryInfo.label, 
        isReview: false, 
    });
    
    navigate("practice-sentences", categoryId);
  }, [navigate, state.sessionSize]);
  
  // startAllSentenceQuiz function removed as requested.


  // Unified handler for Sentence Quiz completion/advancement
  const handleSentenceComplete = useCallback((_isCorrect: boolean) => { 
    setSentenceSession((s) => {
        if (!s) return null;
        let newS: SentenceSession = { ...s };

        newS.index += 1;
        
        if (newS.index >= newS.queue.length) {
            newS.active = false;
            // Delay ending the session
            setTimeout(endSentenceSession, ANSWER_DELAY_MS); 
        }
        return newS;
    });
  }, [endSentenceSession]); 

  // ... (startSession, startFullReviewSession, handleCardComplete - Omitted for brevity)
  const startSession = useCallback((categoryId: string) => {
    const stats = allCategoryStats[categoryId];
    const pool = categoryVocabPools[categoryId];

    if (!stats || pool.length === 0) return;
    
    const reviews = stats.reviewQueue;
    const newCards = stats.newQueue;
    
    const sessionLimit = state.sessionSize === "unlimited" ? ALL_WORDS.length : Number(state.sessionSize);
    
    // Prioritize reviews, then new cards
    let studyQueue: CardData[] = [];
    let remainingLimit = sessionLimit;
    
    // 1. Add Reviews
    const numReviews = Math.min(reviews.length, remainingLimit);
    studyQueue = [...reviews.slice(0, numReviews)];
    remainingLimit -= numReviews;

    // 2. Add New Cards
    const numNewCards = Math.min(newCards.length, remainingLimit, MAX_NEW_CARDS_TO_LEARN);
    studyQueue = [...studyQueue, ...newCards.slice(0, numNewCards)];
    
    if (studyQueue.length === 0) return;

    setSession({
        studyQueue: shuffle(studyQueue),
        index: 0,
        active: true,
        totalCards: studyQueue.length,
        sessionCategory: categoryId,
    });

    navigate("review", categoryId);

  }, [allCategoryStats, navigate, state.sessionSize, categoryVocabPools]);
  
  const startFullReviewSession = useCallback(() => {
    const weakCards = ALL_WORDS.filter(word => {
        const srsCard = state.srs[word.id];
        return srsCard && srsCard.strength < 70; // Adjust strength threshold as needed
    }).sort((a, b) => (state.srs[a.id]?.strength || 100) - (state.srs[b.id]?.strength || 100)); // Sort by weakness

    const totalCardsToReview = Object.keys(state.srs).length;
    
    const sessionLimit = state.sessionSize === "unlimited" 
        ? totalCardsToReview 
        : Math.min(Number(state.sessionSize), totalCardsToReview);

    let reviewQueue: CardData[] = [];
    
    // 1. Prioritize Weakest Cards
    const numWeak = Math.min(weakCards.length * WEAK_CARD_MULTIPLIER, sessionLimit);
    reviewQueue = shuffle(weakCards).slice(0, numWeak);
    
    // 2. Fill the rest with random reviewed cards
    const remainingSlots = sessionLimit - reviewQueue.length;
    if (remainingSlots > 0) {
        const allReviewedCards = ALL_WORDS.filter(word => state.srs[word.id] !== undefined);
        const alreadyInQueueIds = new Set(reviewQueue.map(c => c.id));
        const fillerCandidates = shuffle(allReviewedCards.filter(c => !alreadyInQueueIds.has(c.id)));
        
        reviewQueue = [...reviewQueue, ...fillerCandidates.slice(0, remainingSlots)];
    }
    
    if (reviewQueue.length === 0) return;

    setSession({
        studyQueue: shuffle(reviewQueue),
        index: 0,
        active: true,
        totalCards: reviewQueue.length,
        sessionCategory: FULL_REVIEW_ID,
    });

    navigate("review", FULL_REVIEW_ID);

  }, [state.srs, navigate, state.sessionSize]);

  const handleCardComplete = useCallback((wordId: string, quality: 1 | 2 | 3 | 4, _isNewCard: boolean, isPractice: boolean = false) => { 
    if (!session) return;

    // 1. Update SRS
    if (!isPractice) {
        setState((s) => {
            const currentCard = s.srs[wordId] || {
                id: wordId,
                reps: 0,
                lapses: 0,
                ease: 2.5,
                interval: 0,
                due: 0,
                strength: 100,
            };
            const updatedCard = calculateSM2(currentCard, quality);

            return {
                ...s,
                srs: {
                    ...s.srs,
                    [wordId]: updatedCard,
                },
                totalReviews: s.totalReviews + 1,
                correctReviews: s.correctReviews + (quality >= 3 ? 1 : 0),
            };
        });
    }

    // 2. Advance Session
    setSession((s) => {
        if (!s) return null;
        let newS: Session = { ...s };

        newS.index += 1;
        
        if (newS.index >= newS.studyQueue.length) {
            newS.active = false;
            // Delay ending the session if it's the main review queue
            if (!isPractice) {
                setTimeout(endSession, ANSWER_DELAY_MS); 
            } else {
                setTimeout(endSession, ANSWER_DELAY_MS);
            }
        }
        return newS;
    });

  }, [session, endSession]); 
  
  
  // --- Memoized Values for Current Session ---
  const currentSentence = useMemo(() => {
    if (!sentenceSession || !sentenceSession.active) return null;
    return sentenceSession.queue[sentenceSession.index]; 
  }, [sentenceSession]);

  const currentCard = useMemo(() => {
    if (!session || !session.active) return null;
    return session.studyQueue[session.index];
  }, [session]);
  
  const currentSRS = useMemo(() => {
    if (!currentCard) return null;
    return state.srs[currentCard.id] || null;
  }, [currentCard, state.srs]);

  // 7. Render Screens
  const renderScreen = () => {
    // Current Card/Sentence for Display
    const isVocabReview = screen.key === "review" && session && session.active && currentCard;
    const isSentenceQuiz = screen.key === "practice-sentences" && sentenceSession && sentenceSession.active && currentSentence;
    const isPracticeMode = screen.key === "practice"; // A dedicated screen for quiz mode

    switch (screen.key) {
      case "home":
        return (
          <div className="memContainer homeScreen"> 
            <div className="memHeader">
                Sinhala Trainer Status
            </div>
            <div className="memStatsGrid"> 
              <StatBox label="Reviews Due" value={totalReviewsDue} />
              <StatBox label="New Cards" value={totalNewCards} />
              <StatBox label="Total Reviews" value={state.totalReviews} />
              <StatBox label="Correct %" value={`${state.totalReviews > 0 ? ((state.correctReviews / state.totalReviews) * 100).toFixed(0) : 0}%`} />
            </div>

            <div className="memActionGrid">
              
              {/* Only the section-based sentence quiz remains, restyled as main sentence button */}
              <button
                className="memBtn large memSecondary"
                onClick={() => navigate("sentence-categories")} 
              >
                Sentence Builder (Sections)
              </button>
              
              <button
                className="memBtn large memPrimary"
                onClick={() => navigate("categories")}
                disabled={totalReviewsDue + totalNewCards === 0}
              >
                Go to Vocab Categories to Study
              </button>
              <button
                className="memBtn large"
                onClick={startFullReviewSession}
                disabled={totalReviewsDue + totalNewCards === 0 && Object.keys(state.srs).length === 0}
              >
                Catch-up Review (All Words)
              </button>
              <button
                className="memBtn large"
                onClick={() => navigate("practice")}
              >
                Word Quiz Mode (Practice)
              </button>
            </div>
            
            <div className="memSettingsSection" style={{ marginTop: '20px', padding: '0 15px' }}>
                <div className="memSettingsTitle">Session Length</div>
                <div className="memSessionSizeSelector">
                    {[5, 10, 20, 'unlimited'].map((size) => (
                        <button
                            key={size}
                            className={`memBtn small ${state.sessionSize === size ? 'memPrimary' : 'muted'}`}
                            onClick={() => setState(s => ({ ...s, sessionSize: size as SessionSize }))}
                        >
                            {size}
                        </button>
                    ))}
                </div>
            </div>
          </div>
        );

      case "categories":
        return (
            <div className="memContainer">
                <div className="memHeader" style={{padding: 0}}>Vocab Categories</div>
                {ALL_CATEGORIES.map((cat) => (
                    <CategoryItem
                        key={cat.id}
                        category={cat}
                        count={categoryVocabPools[cat.id]?.length || 0}
                        onStudy={startSession}
                        stats={allCategoryStats[cat.id] || { reviewsDue: 0, newCards: 0 }}
                    />
                ))}
            </div>
        );
      
      case "sentence-categories": 
        return (
            <div className="memContainer">
                <div className="memHeader" style={{padding: 0}}>Sentence Builder Sections ({SENTENCES.length} Total)</div>
                {SENTENCE_CATEGORIES_DATA.map((cat) => (
                    <CategoryItem
                        key={cat.id}
                        category={cat}
                        count={cat.sentenceIds.length}
                        onStudy={startSentencePractice}
                        stats={{ reviewsDue: 0, newCards: 0 }} 
                        isSentence={true}
                    />
                ))}
                <button className="memBtn muted small" onClick={() => navigate("home")} style={{ marginTop: '20px' }}>
                    &larr; Back to Home
                </button>
            </div>
        );

      case "review": 
      case "practice":
        if (!isVocabReview && !isPracticeMode) {
            // End screen when session is over or not active
            const sessionTitle = session?.sessionCategory === FULL_REVIEW_ID 
                ? "Catch-up Review" 
                : "Category Review";
                
            return (
                <div className="memContainer">
                    <div className="memHeader">{sessionTitle}</div> 
                    <div className="memCard">
                        <div className="memCardContent">
                            <div className="foreignWord">Session Complete! 🎉</div>
                            <button className="memBtn memPrimary" onClick={endSession}>
                                Back to Categories
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        if (isVocabReview || isPracticeMode) {
            const currentSession = session!;
            
            return (
                <div className="memContainer">
                    <div className="memHeader">
                        Word Review 
                        {isPracticeMode && " (Quiz Mode)"}
                    </div>
                    <ProgressBar
                        done={currentSession.index}
                        total={currentSession.totalCards}
                    />
                    <QuizScreen
                        key={currentCard!.id}
                        word={currentCard!}
                        vocabPool={ALL_WORDS} 
                        onAnswer={(quality) => handleCardComplete(currentCard!.id, quality, currentSRS === null, isPracticeMode)}
                        onSkip={() => handleCardComplete(currentCard!.id, 1, currentSRS === null, isPracticeMode)}
                        srsCard={currentSRS}
                        isPracticeMode={isPracticeMode}
                        isNewCard={currentSRS === null}
                        sessionCategory={currentSession.sessionCategory}
                    />
                </div>
            );
        }
        return null;

        
      case "practice-sentences": 
        if (!isSentenceQuiz) {
            
            const returnDestination = "sentence-categories";

            return (
                <div className="memContainer">
                    <div className="memHeader">Sentence Builder</div>
                    <div className="memCard">
                        <div className="memCardContent">
                            <div className="foreignWord">Practice Complete! 🎉</div>
                            <button className="memBtn memPrimary" onClick={() => navigate(returnDestination)}>
                                Back to Sections
                            </button>
                        </div>
                    </div>
                </div>
            );
        }
        
        // Dynamic title based on session type
        const sessionTitle = `Sentence Builder: ${sentenceSession!.sessionCategory}`;

        return (
            <div className="memContainer">
                <div className="memHeader">
                    {sessionTitle}
                </div>
                <ProgressBar
                    done={sentenceSession!.index}
                    total={sentenceSession!.totalCards}
                />
                <SentenceQuizScreen
                    key={currentSentence!.id + sentenceSession!.index} 
                    sentence={currentSentence!}
                    onComplete={handleSentenceComplete} 
                    onSkip={() => handleSentenceComplete(false)} 
                    globalTokenPool={ALL_SENTENCE_TOKENS} 
                />
            </div>
        );
        
      case "settings":
        // ... (Settings logic omitted)
        return <div className="memContainer">Settings Screen Content (Omitted)</div>;
        
      default:
        return <div className="memContainer">Error: Unknown Screen</div>;
    }
  };
  
  return (
    <div className="memApp">
      <TopBar
        onNavigate={navigate}
        totalDue={totalReviewsDue + totalNewCards}
      />
      <div className="memMain">{renderScreen()}</div>
    </div>
  );
}

export default App;