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

type SentenceEntry = {
  id: string;
  english: string;
  phonetic: string;
  tokens: string[];
  distractors?: string[];
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

type ScreenKey =
  | "home"
  | "categories"
  | "review" 
  | "learn" 
  | "practice" 
  | "stats"
  | "settings";

type Screen = {
  key: ScreenKey;
  category?: string; // Tracks the active study category
};

/* =======================
   Constants
======================= */

const MAX_NEW_CARDS_TO_LEARN = 5; 
const ANSWER_DELAY_MS = 800; // Delay for correct answer auto-advance/feedback

// NEW CONSTANTS for Full Review Mode
const WEAK_CARD_BATCH_SIZE = 20; 
const WEAK_CARD_MULTIPLIER = 3; 
const FULL_REVIEW_ID = "full-review-mode"; // Special ID for the new session type


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
    // Only use distractors that are in the same vocabulary pool (i.e., same category for a session)
    const distractors = shuffle(vocab.filter((v) => v.id !== word.id));
    const selectedDistractors = distractors.slice(0, 3); 
    const options = shuffle([...selectedDistractors, word]);

    return options;
}


// Quality: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
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

  // Note: lastReviewed is optional in SRSCard type, but should be included here
  const lastReviewed = today;

  return {
    id: card.id, // Ensure ID is carried over
    reps,
    lapses,
    ease,
    interval,
    due: nextDue,
    lastReviewed,
    strength,
  };
}

// Local Storage Keys
const APP_STATE_KEY = "sinhalaTrainerAppState";

function loadAppState(): AppState {
  try {
    const json = localStorage.getItem(APP_STATE_KEY);
    if (json) {
      const loadedState: AppState = JSON.parse(json);

      // Ensure 'due' and 'lastReviewed' are numbers (timestamps) when loaded
      for (const id in loadedState.srs) {
        loadedState.srs[id].due = Number(loadedState.srs[id].due);
        if (loadedState.srs[id].lastReviewed) {
          loadedState.srs[id].lastReviewed = Number(loadedState.srs[id].lastReviewed);
        }
      }
      // Merge with defaults to ensure new properties are always present
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

/* =======================
   Default State & Data
======================= */

const defaultAppState: AppState = {
  srs: {},
  streak: 0,
  totalReviews: 0,
  correctReviews: 0,
  selectedCategory: "all",
  sessionSize: 10,
  lastStudyDay: undefined,
};

const ALL_WORDS: CardData[] = VOCAB;

const ALL_CATEGORIES: { id: string; label: string }[] = [
  ...new Set(VOCAB.map((v) => v.category)),
].map((cat) => ({ id: cat, label: cat.charAt(0).toUpperCase() + cat.slice(1) }));

/* =======================
   Components
======================= */

// --- Quiz Screen (Multiple Choice) - Used for Review and Practice ---
function QuizScreen({
  word,
  vocabPool,
  onAnswer,
  onSkip,
  srsCard,
  isPracticeMode, 
  isNewCard,
}: {
  word: CardData;
  vocabPool: CardData[];
  onAnswer: (quality: 1 | 2 | 3 | 4) => void;
  onSkip: () => void;
  srsCard: SRSCard | null;
  isPracticeMode: boolean;
  isNewCard: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [choices, setChoices] = useState<CardData[]>([]);
  const [showNextButton, setShowNextButton] = useState(false); 
  
  // FIX: Changed NodeJS.Timeout to number | null. The type for browser setTimeout IDs is number.
  const timeoutRef = useRef<number | null>(null); 

  useEffect(() => {
    // Re-generate choices when the word changes (which happens on re-mount)
    setChoices(generateChoices(word, vocabPool));
    setSelected(null);
    setShowNextButton(false);
    
    // Cleanup function runs when the component is unmounted (due to key change)
    // and cancels any pending setTimeout, preventing the freeze.
    return () => {
        if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    };
  }, [word, vocabPool]); 

  function handleSelect(choice: CardData) {
    if (selected) return;

    setSelected(choice.id);

    const isCorrect = choice.id === word.id;
    const quality = isCorrect ? 3 : 1; 

    // Apply delay for feedback visibility
    // Store the timer ID in the ref for cleanup
    const timer = setTimeout(() => { 
        if (isCorrect) {
            // Correct answer: auto-advance
            onAnswer(quality); 
        } else {
            // Incorrect answer: show the next button for manual advance
            setShowNextButton(true); 
        }
    }, ANSWER_DELAY_MS); 
    
    // Store the timer ID in the ref for cleanup
    timeoutRef.current = timer; 
  }
  
  function handleNext() {
      // Clear the timeout manually if it exists before advancing
      if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null; // Clear the ref after use
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
        
        {/* MANUAL ADVANCEMENT BUTTON */}
        {showNextButton && answerWasWrong && (
            <button className="memBtn memPrimary" onClick={handleNext} style={{ marginTop: '20px' }}>
                Got It / Next Card
            </button>
        )}
      </div>

      <div className="memCardFooter">
        {/* Disable skip button if waiting for manual click or initial selection */}
        <button className="memBtn muted small" onClick={onSkip} disabled={!!selected || showNextButton}>
          {isPracticeMode ? "Next Random" : "Skip"}
        </button>
      </div>
    </div>
  );
}

// --- Utility Components (Unchanged) ---

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
          className="memBtn small"
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
}: {
  category: { id: string; label: string };
  count: number;
  onStudy: (id: string) => void;
  stats: { reviewsDue: number; newCards: number };
}) {
    const totalDue = stats.reviewsDue + stats.newCards;
  return (
    <div
      className="memCategoryItem"
    >
      <div className="categoryInfo">
        <div className="categoryName large">{category.label}</div>
        <div className="categoryCount muted">
            {count} words total 
            {stats.reviewsDue > 0 && <span> • {stats.reviewsDue} due</span>}
            {stats.newCards > 0 && <span> • {stats.newCards} new</span>}
        </div>
      </div>
      <button 
        className={`memBtn small memPrimary ${totalDue > 0 ? "active" : "disabled"}`}
        onClick={() => onStudy(category.id)}
        disabled={totalDue === 0}
      >
        Study ({totalDue > 0 ? totalDue : 0})
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
  const [session, setSession] = useState<Session | null>(null); 

  // 1. Load and Save State
  useEffect(() => {
    saveAppState(state);
  }, [state]);

  // 2. Pre-Calculate Stats for ALL Categories
  const { totalReviewsDue, totalNewCards, allCategoryStats, categoryVocabPools } = useMemo(() => {
    const today = new Date().getTime();
    let totalReviewsDue = 0;
    let totalNewCards = 0;
    const stats: Record<string, { reviewsDue: CardData[], newCards: CardData[] }> = {};
    const vocabPools: Record<string, CardData[]> = {};
    
    // Initialize stats and vocab pools for all categories
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
    
    // Sort review queues (oldest first) and shuffle new queues
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

  // 3. Navigation Handlers
  const navigate = useCallback((key: ScreenKey, category?: string) => {
    setScreen({ key, category: category ?? screen.category });
    if (key !== "review" && key !== "practice") {
      setSession(null); 
    }
  }, [screen.category]);

  const endSession = useCallback(() => {
    setSession(null);
    navigate("home");
  }, [navigate]);
  
  // 4. Session Start Logic (Category Unified Queue)
  const startSession = useCallback((categoryId: string) => {
    const categoryStats = allCategoryStats[categoryId];
    if (!categoryStats || (categoryStats.reviewsDue + categoryStats.newCards) === 0) return;

    const reviewLimit = state.sessionSize === "unlimited" ? Infinity : state.sessionSize;
    
    let newCardsToLearn = MAX_NEW_CARDS_TO_LEARN;
    if (state.sessionSize !== "unlimited") {
        newCardsToLearn = Math.min(newCardsToLearn, reviewLimit);
    }
    
    // Slice and combine. The limit applies to the total number of cards.
    const newCards = categoryStats.newQueue.slice(0, newCardsToLearn);
    const reviewCards = categoryStats.reviewQueue.slice(0, reviewLimit - newCards.length);

    // Interleave new and review cards and shuffle the resulting study queue
    const studyQueue = shuffle([...newCards, ...reviewCards]);
    const totalCards = studyQueue.length;

    if (totalCards === 0) return;

    setSession({
        studyQueue: studyQueue,
        index: 0,
        active: true,
        totalCards: totalCards,
        sessionCategory: categoryId,
    });
    
    navigate("review", categoryId); // Start on the Quiz/Review screen
  }, [allCategoryStats, state.sessionSize, navigate]);

  // NEW: Session Start Logic for Full Prioritized Review
  const startFullReviewSession = useCallback(() => {
    
    const today = new Date().getTime();
    
    // 1. Separate all cards into queues (due/new/learned)
    const dueCards: CardData[] = [];
    const newCards: CardData[] = [];
    const learnedCards: CardData[] = []; // Learned/In-progress cards that are NOT due
    
    ALL_WORDS.forEach((word) => {
        const srsCard = state.srs[word.id];
        
        if (srsCard && srsCard.due <= today) {
            dueCards.push(word);
        } else if (!srsCard) {
            newCards.push(word);
        } else {
            learnedCards.push(word);
        }
    });

    // 2. Identify Weakest Cards (highest lapses) from all reviewed cards (due + learned)
    const allReviewedCards = [...dueCards, ...learnedCards];

    // Sort by lapses (descending)
    allReviewedCards.sort((a, b) => {
        const lapsesA = state.srs[a.id]?.lapses || 0;
        const lapsesB = state.srs[b.id]?.lapses || 0;
        return lapsesB - lapsesA; // Highest lapses first (weakest)
    });
    
    // Take the top N weakest cards
    const weakestBatch = allReviewedCards.slice(0, WEAK_CARD_BATCH_SIZE);

    // 3. Build the Master Study Queue
    let studyQueue: CardData[] = [];
    
    // A. All Due Cards (must be reviewed)
    studyQueue.push(...shuffle(dueCards));

    // B. Weakest Cards (multiplied for higher frequency)
    for (let i = 0; i < WEAK_CARD_MULTIPLIER; i++) {
        studyQueue.push(...shuffle(weakestBatch));
    }
    
    // C. A batch of New Cards (limit)
    studyQueue.push(...shuffle(newCards).slice(0, MAX_NEW_CARDS_TO_LEARN));

    // 4. Final Queue preparation
    studyQueue = shuffle(studyQueue); // Final shuffle for variety
    const totalCards = studyQueue.length;

    if (totalCards === 0) return;

    setSession({
        studyQueue: studyQueue,
        index: 0,
        active: true,
        totalCards: totalCards,
        sessionCategory: FULL_REVIEW_ID, // Use the special ID
    });
    
    navigate("review", FULL_REVIEW_ID); // Navigate to review screen with special ID
  }, [state.srs, navigate]);

  // 5. SRS Update and Index Movement Logic
  const handleCardComplete = useCallback((wordId: string, quality: 1 | 2 | 3 | 4, _isNewCard: boolean, isPractice: boolean = false) => {
    // 1. Update SRS State
    setState((prevState) => {
        const oldCard: SRSCard = prevState.srs[wordId] || {
            id: wordId, 
            reps: 0, 
            lapses: 0, 
            ease: 2.5, 
            interval: 0, 
            due: 0,
            strength: 0,
            lastReviewed: 0,
        };
        
        const newCardState = calculateSM2(oldCard, quality);
        const today = new Date().toISOString().split('T')[0];

        return {
            ...prevState,
            srs: { ...prevState.srs, [wordId]: newCardState },
            totalReviews: prevState.totalReviews + 1,
            correctReviews: prevState.correctReviews + (quality >= 3 ? 1 : 0),
            lastStudyDay: today,
        };
    });

    // 2. Update Session Index and Navigation (only for formal sessions)
    if (session && !isPractice) {
        setSession((s) => {
            if (!s) return null;
            let newS = { ...s };

            newS.index += 1;
            
            if (newS.index >= newS.studyQueue.length) {
                newS.active = false;
                setTimeout(endSession, 50); 
            }
            return newS;
        });
    }
  }, [session, endSession]); 

  // 6. Card and Progress Calculations for UI (Updated for single queue)
  const currentCard = useMemo(() => {
    if (!session || !session.active) return null;
    return session.studyQueue[session.index]; 
  }, [session]);

  const currentSRSCard = useMemo(() => {
    return currentCard ? state.srs[currentCard.id] || null : null;
  }, [currentCard, state.srs]);
  
  const cardsDone = useMemo(() => {
    if (!session) return 0;
    return session.index;
  }, [session]);

  const activeCategoryLabel = useMemo(() => {
    const categoryId = screen.category || session?.sessionCategory;
    
    if (categoryId === FULL_REVIEW_ID) { // Handle the new full review mode
        return "Full Review (Prioritized)";
    }
    
    if (!categoryId) return "All";
    const cat = ALL_CATEGORIES.find(c => c.id === categoryId);
    return cat ? cat.label : categoryId.charAt(0).toUpperCase() + categoryId.slice(1);
  }, [screen.category, session?.sessionCategory]);


  // 7. Render Screens
  const renderScreen = () => {
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
              <button
                className="memBtn large memPrimary"
                onClick={() => navigate("categories")}
                disabled={totalReviewsDue + totalNewCards === 0}
              >
                Go to Categories to Study
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
                onClick={() => navigate("categories")}
              >
                Browse Categories
              </button>
              <button
                className="memBtn large"
                onClick={() => navigate("practice")}
              >
                Quiz Mode (Practice)
              </button>
            </div>
          </div>
        );

      case "categories":
        return (
          <div className="memContainer categoryScreen">
            <div className="memHeader">
                <button className="memBtn backButton" onClick={() => navigate("home")}>
                    ←
                </button>
                <h1>Study Categories</h1>
            </div>
            {ALL_CATEGORIES.map((cat) => (
              <CategoryItem
                key={cat.id}
                category={cat}
                count={ALL_WORDS.filter(v => v.category === cat.id).length}
                onStudy={startSession}
                stats={{
                    reviewsDue: allCategoryStats[cat.id]?.reviewsDue || 0,
                    newCards: allCategoryStats[cat.id]?.newCards || 0,
                }}
              />
            ))}
          </div>
        );

      case "review": // This is now the unified Study/Quiz session
        if (!session || !session.active || session.index >= session.studyQueue.length) {
            return (
              <div className="memContainer">
                <div className="memHeader">Study Session</div>
                <div className="memCard">
                    <div className="memCardContent">
                        <div className="foreignWord">Session Complete! 🎉</div>
                        <div className="foreignMeaning muted">You have reviewed {session?.totalCards || 0} cards in {activeCategoryLabel}.</div>
                        <button className="memBtn memPrimary" onClick={() => navigate("home")}>
                            Go Home
                        </button>
                    </div>
                </div>
              </div>
            )
        }
        
        const studyCard = session.studyQueue[session.index];
        const isFullReview = session.sessionCategory === FULL_REVIEW_ID;

        // Use ALL_WORDS for distractors in Full Review mode, otherwise use the category pool
        const studyVocabPool = isFullReview 
            ? ALL_WORDS 
            : (categoryVocabPools[session.sessionCategory] || ALL_WORDS);
            
        const isNewCard = !state.srs[studyCard.id]; // Check if the card is a new card (has no SRS state)
        
        return (
          <div className="memContainer">
            <div className="memHeader">
                {isNewCard ? "Learning New Word" : "Reviewing Card"} in {activeCategoryLabel}
            </div>
            <ProgressBar
              done={cardsDone}
              total={session.totalCards}
            />
            <QuizScreen
              key={session.index} // Ensures component re-mount and state reset
              word={studyCard}
              vocabPool={studyVocabPool} 
              srsCard={currentSRSCard}
              onAnswer={(quality) => handleCardComplete(studyCard.id, quality, isNewCard)}
              onSkip={() => handleCardComplete(studyCard.id, 1, isNewCard)} 
              isPracticeMode={false}
              isNewCard={isNewCard}
            />
          </div>
        );

      case "practice":
        // Practice mode uses all words for a complete challenge
        const practiceVocabPool = ALL_WORDS; 

        if (practiceVocabPool.length === 0) {
            return (
                <div className="memContainer empty">
                    <div className="memHeader">Quiz Mode</div>
                    <div className="muted" style={{ textAlign: 'center' }}>No words available for practice.</div>
                    <button className="memBtn memPrimary" style={{ marginTop: 12 }} onClick={() => navigate("home")}>
                        Go Home
                    </button>
                </div>
            );
        }
        
        // Pick a random card from the entire pool
        const randomCard = shuffle(practiceVocabPool)[0]; 

        return (
            <div className="memContainer">
                <div className="memHeader">
                    Quiz Mode: All Words
                </div>
                <QuizScreen
                    key={randomCard.id}
                    word={randomCard}
                    vocabPool={practiceVocabPool}
                    srsCard={state.srs[randomCard.id] || null}
                    isPracticeMode={true}
                    isNewCard={!state.srs[randomCard.id]}
                    onAnswer={(quality) => {
                        handleCardComplete(randomCard.id, quality, !state.srs[randomCard.id], true); 
                        setScreen({ key: "practice" }); 
                    }}
                    onSkip={() => {
                        setScreen({ key: "practice" });
                    }}
                />
            </div>
        );

      case "settings":
        return (
          <div className="memContainer settingsScreen">
            <div className="memHeader">
                <button className="memBtn backButton" onClick={() => navigate("home")}>
                    ←
                </button>
                <h1>Settings</h1>
            </div>
            <div className="memSettingsRow">
              <label htmlFor="sessionSize">Session Size (Cards)</label>
              <select
                id="sessionSize"
                value={state.sessionSize}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    sessionSize: e.target.value as SessionSize,
                  }))
                }
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value="unlimited">Unlimited</option>
              </select>
            </div>
          </div>
        );
      case "stats":
        return (
          <div className="memContainer">
            <div className="memHeader">
                <button className="memBtn backButton" onClick={() => navigate("home")}>
                    ←
                </button>
                <h1>Statistics</h1>
            </div>
            <div className="memStatsGrid">
                <StatBox label="Total Reviews" value={state.totalReviews} />
                <StatBox label="Correct Answers" value={state.correctReviews} />
                <StatBox label="Incorrect Answers" value={state.totalReviews - state.correctReviews} />
                <StatBox label="Overall Accuracy" value={`${state.totalReviews > 0 ? ((state.correctReviews / state.totalReviews) * 100).toFixed(1) : 0}%`} />
                <StatBox label="Active Cards" value={Object.keys(state.srs).length} />
            </div>
          </div>
        );
        
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