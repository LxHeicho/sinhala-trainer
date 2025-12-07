// ==========================
// App.tsx — Sinhala Trainer
// Final SRS + Session Summary
// ==========================

import React, { useEffect, useMemo, useState } from "react";
import { createClient, type User } from "@supabase/supabase-js";
import { VOCAB } from "./data/vocab";
import { SENTENCES } from "./data/sentences";
import "./App.css";

/* =======================
   Supabase setup
======================= */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase =
  supabaseUrl && supabaseAnon ? createClient(supabaseUrl, supabaseAnon) : null;

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

type SRSCard = {
  id: string;
  reps: number;
  lapses: number;
  ease: number;
  interval: number; // days
  due: number; // timestamp
  lastReviewed?: number;
  strength: number; // 0–100
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
  autoSuggest: boolean;
  cloudSyncEnabled: boolean;
};

type Screen =
  | { key: "home" }
  | { key: "review" }
  | { key: "categories" }
  | { key: "learn"; category: string | "all" }
  | { key: "practice"; category: string }
  | { key: "flashcards"; category: string | "all" }
  | { key: "sentences" }
  | { key: "stats" }
  | { key: "settings" };

type SessionStats = {
  mode: "learn" | "review";
  category: string | "all";
  target: SessionSize;
  reviews: number;
  correct: number;
};

/* =======================
   Constants
======================= */
const STORAGE_KEY = "sinhala_trainer_v8"; // keep this stable now

// “learned” threshold for words
const LEARNED_THRESHOLD = 80;

const DEFAULT_STATE: AppState = {
  srs: {},
  streak: 0,
  lastStudyDay: undefined,
  totalReviews: 0,
  correctReviews: 0,
  selectedCategory: "all",
  sessionSize: 10,
  autoSuggest: true,
  cloudSyncEnabled: true,
};

const RATING_MAP = { again: 0, hard: 3, good: 4, easy: 5 } as const;

/* =======================
   Helpers
======================= */
function sm2Update(card: SRSCard, rating: keyof typeof RATING_MAP): SRSCard {
  const q = RATING_MAP[rating];
  const now = Date.now();
  let { reps, lapses, ease, interval, strength } = card;

  if (q < 3) {
    // Again
    reps = 0;
    lapses += 1;
    interval = 1;
    ease = Math.max(1.3, ease - 0.2);
    strength = Math.max(0, strength - 15);
  } else {
    // Hard / Good / Easy
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 3;
    else interval = Math.round(interval * ease);

    if (q === 3) ease = Math.max(1.3, ease - 0.15);
    if (q === 5) ease += 0.1;

    strength = Math.min(100, strength + (q === 5 ? 12 : q === 4 ? 8 : 4));
  }

  return {
    ...card,
    reps,
    lapses,
    ease,
    interval,
    due: now + interval * 86400000,
    lastReviewed: now,
    strength,
  };
}

function freshCard(id: string): SRSCard {
  return {
    id,
    reps: 0,
    lapses: 0,
    ease: 2.5,
    interval: 0,
    due: Date.now(),
    strength: 0,
  };
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

const shuffle = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);
const unique = <T,>(arr: T[]): T[] => Array.from(new Set(arr));
const avg = (nums: number[]) =>
  nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;

function formatCategoryName(c: string) {
  if (!c) return "";
  if (c === "all") return "All words";
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/* =======================
   Cloud Sync
======================= */
async function cloudSave(state: AppState, user: User | null) {
  if (!supabase || !user) return;
  await supabase.from("profiles").upsert({
    id: user.id,
    email: user.email,
    state,
    updated_at: new Date().toISOString(),
  });
}

async function cloudLoad(user: User | null): Promise<AppState | null> {
  if (!supabase || !user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("state")
    .eq("id", user.id)
    .single();
  return (data?.state as AppState) ?? null;
}

function mergeStates(localState: AppState, cloudState: AppState): AppState {
  // conservative: keep the "stronger" / more complete state for SRS + stats
  const merged: AppState = { ...localState, ...cloudState };
  const ids = unique([
    ...Object.keys(localState.srs),
    ...Object.keys(cloudState.srs),
  ]);

  const srs: Record<string, SRSCard> = {};
  ids.forEach((id) => {
    const l = localState.srs[id];
    const c = cloudState.srs[id];
    srs[id] = !l ? c : !c ? l : l.strength >= c.strength ? l : c;
  });

  merged.srs = srs;
  merged.streak = Math.max(localState.streak, cloudState.streak);
  merged.totalReviews = Math.max(
    localState.totalReviews,
    cloudState.totalReviews
  );
  merged.correctReviews = Math.max(
    localState.correctReviews,
    cloudState.correctReviews
  );

  return merged;
}

/* =======================
   App Component
======================= */

function App() {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [screen, setScreen] = useState<Screen>({ key: "home" });

  const [user, setUser] = useState<User | null>(null);
  const [_authLoading, setAuthLoading] = useState(true);

  // Session controls
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [pendingScreen, setPendingScreen] = useState<Screen | null>(null);
  const [sessionChoice, setSessionChoice] = useState<SessionSize>(
    state.sessionSize
  );

  // Per-session summary
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [sessionCompleted, setSessionCompleted] = useState(false);

  const vocab = VOCAB as VocabEntry[];

  const categories = useMemo(() => {
    const cats = unique(vocab.map((v) => v.category)).sort();
    return ["all", ...cats] as const;
  }, [vocab]);

  /* =======================
     Load Local + Auth
  ======================= */
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as AppState;
        setState({ ...DEFAULT_STATE, ...parsed });
        setSessionChoice(parsed.sessionSize ?? 10);
      } catch {
        setState(DEFAULT_STATE);
      }
    } else {
      setState(DEFAULT_STATE);
    }

    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      if (sub && sub.subscription) sub.subscription.unsubscribe();
    };
  }, []);

  /* =======================
     Cloud Load on Login
  ======================= */
  useEffect(() => {
    if (!user || !supabase) return;
    (async () => {
      const cloud = await cloudLoad(user);
      if (cloud) {
        setState((local) => {
          const merged = mergeStates(local, cloud);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          return merged;
        });
      }
    })();
  }, [user]);

  /* =======================
     Persist Local + Cloud Autosync
  ======================= */
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (state.cloudSyncEnabled) cloudSave(state, user);
  }, [state, user]);

  /* =======================
     Progress / Stats
  ======================= */
  const progressByCategory = useMemo(() => {
    const map: Record<
      string,
      {
        total: number;
        learned: number;
        inProgress: number;
        unseen: number;
        avgStrength: number;
      }
    > = {};

    for (const v of vocab) {
      if (!map[v.category]) {
        map[v.category] = {
          total: 0,
          learned: 0,
          inProgress: 0,
          unseen: 0,
          avgStrength: 0,
        };
      }
      map[v.category].total += 1;

      const s = state.srs[v.id]?.strength ?? 0;
      map[v.category].avgStrength += s;

      if (s >= LEARNED_THRESHOLD) map[v.category].learned += 1;
      else if (s > 0) map[v.category].inProgress += 1;
      else map[v.category].unseen += 1;
    }

    for (const c of Object.keys(map)) {
      map[c].avgStrength = Math.round(map[c].avgStrength / map[c].total);
    }

    return map;
  }, [vocab, state.srs]);

  const overallProgress = useMemo(() => {
    const strengths = vocab.map((v) => state.srs[v.id]?.strength ?? 0);
    const learned = strengths.filter((s) => s >= LEARNED_THRESHOLD).length;
    const inProgress = strengths.filter(
      (s) => s > 0 && s < LEARNED_THRESHOLD
    ).length;
    const unseen = strengths.filter((s) => s === 0).length;

    return {
      learned,
      total: strengths.length,
      avgStrength: Math.round(avg(strengths)),
      inProgress,
      unseen,
    };
  }, [vocab, state.srs]);

  /* =======================
     Session Suggestion
  ======================= */
  function suggestedSessionSize(): SessionSize {
    const hour = new Date().getHours();
    const accuracy =
      state.totalReviews === 0
        ? 100
        : (state.correctReviews / state.totalReviews) * 100;

    if (accuracy < 60) return 5;
    if (hour >= 21) return 5;
    if (overallProgress.avgStrength < 45) return 10;
    return 20;
  }

  function openWithSession(target: Screen) {
    // If this is a learn session and the category is already complete, short-circuit
    if (target.key === "learn" && target.category !== "all") {
      const catStats = progressByCategory[target.category];
      if (catStats && catStats.learned === catStats.total) {
        return;
      }
    }

    const suggestion = state.autoSuggest
      ? suggestedSessionSize()
      : state.sessionSize;
    setSessionChoice(suggestion);
    setPendingScreen(target);
    setShowSessionModal(true);
  }

  function startSession() {
    if (!pendingScreen) return;
    // prepare session stats for learn/review only
    if (pendingScreen.key === "learn" || pendingScreen.key === "review") {
      setSessionStats({
        mode: pendingScreen.key,
        category:
          pendingScreen.key === "review" ? "all" : pendingScreen.category,
        target: sessionChoice,
        reviews: 0,
        correct: 0,
      });
      setSessionCompleted(false);
    } else {
      setSessionStats(null);
      setSessionCompleted(false);
    }

    setState((s) => ({ ...s, sessionSize: sessionChoice }));
    setShowSessionModal(false);
    setScreen(pendingScreen);
    setPendingScreen(null);
  }

  /* =======================
     QUEUES (SRS Option B)
======================= */

  // REVIEW — all words that have ever been seen (strength > 0),
  // sorted weakest → strongest, limited by sessionSize.
  const reviewQueue = useMemo(() => {
    const pool = vocab.filter((v) => (state.srs[v.id]?.strength ?? 0) > 0);
    const sorted = [...pool].sort(
      (a, b) =>
        (state.srs[a.id]?.strength ?? 0) -
        (state.srs[b.id]?.strength ?? 0)
    );
    const limit =
      state.sessionSize === "unlimited" ? sorted.length : state.sessionSize;
    return sorted.slice(0, limit);
  }, [vocab, state.srs, state.sessionSize]);

  // PRACTICE — unlimited, per category, all words in that category.
  const practiceQueue = useMemo(() => {
    if (screen.key !== "practice") return [] as VocabEntry[];
    return shuffle(vocab.filter((v) => v.category === screen.category));
  }, [screen, vocab]);

  // LEARN — per category, only words with strength < LEARNED_THRESHOLD,
  // bounded by sessionSize.
  const learnQueue = useMemo(() => {
    if (screen.key !== "learn") return [] as VocabEntry[];

    const base =
      screen.category === "all"
        ? vocab
        : vocab.filter((v) => v.category === screen.category);

    const toLearn = base.filter(
      (v) => (state.srs[v.id]?.strength ?? 0) < LEARNED_THRESHOLD
    );
    const shuffled = shuffle(toLearn);
    const limit =
      state.sessionSize === "unlimited" ? shuffled.length : state.sessionSize;
    return shuffled.slice(0, limit);
  }, [screen, vocab, state.srs, state.sessionSize]);

  /* =======================
     Review State
  ======================= */
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewFlip, setReviewFlip] = useState(false);

  const currentReview =
    screen.key === "practice"
      ? practiceQueue[reviewIndex]
      : screen.key === "learn"
      ? learnQueue[reviewIndex]
      : screen.key === "review"
      ? reviewQueue[reviewIndex]
      : undefined;

  useEffect(() => {
    // reset index & flip when queue or screen changes
    setReviewIndex(0);
    setReviewFlip(false);
    setSessionCompleted(false);
  }, [reviewQueue.length, practiceQueue.length, learnQueue.length, screen.key]);

  /* =======================
     Grade Logic (Option B)
  ======================= */
  function gradeCurrent(rating: keyof typeof RATING_MAP) {
    if (!currentReview) return;
    if (screen.key === "practice") {
      // practice does not affect SRS
      const total =
        screen.key === "practice" ? practiceQueue.length : 0;
      const nextIndex =
        total === 0 ? 0 : Math.min(reviewIndex + 1, total);
      setReviewIndex(nextIndex);
      setReviewFlip(false);
      return;
    }

    // Update AppState (SRS, streak, global stats)
    setState((prev) => {
      const prevCard = prev.srs[currentReview.id] ?? freshCard(currentReview.id);
      const nextCard = sm2Update(prevCard, rating);

      const tKey = todayKey();
      let streak = prev.streak;

      // Only count streak if at least one successful review that day
      if (rating !== "again") {
        if (prev.lastStudyDay !== tKey) {
          const y = new Date();
          y.setDate(y.getDate() - 1);
          const yKey = `${y.getFullYear()}-${
            y.getMonth() + 1
          }-${y.getDate()}`;
          streak = prev.lastStudyDay === yKey ? streak + 1 : 1;
        }
      }

      return {
        ...prev,
        srs: { ...prev.srs, [currentReview.id]: nextCard },
        streak,
        lastStudyDay: rating === "again" ? prev.lastStudyDay : tKey,
        totalReviews: prev.totalReviews + 1,
        correctReviews: prev.correctReviews + (rating === "again" ? 0 : 1),
      };
    });

    // Update session stats (per-session summary)
    setSessionStats((prev) => {
      if (!prev) return prev;
      const newReviews = prev.reviews + 1;
      const newCorrect = prev.correct + (rating === "again" ? 0 : 1);
      return { ...prev, reviews: newReviews, correct: newCorrect };
    });

    // Move index & possibly end session
    const total =
      screen.key === "learn"
        ? learnQueue.length
        : screen.key === "review"
        ? reviewQueue.length
        : 0;

    const nextIndex =
      total === 0 ? 0 : Math.min(reviewIndex + 1, total);

    setReviewIndex(nextIndex);
    setReviewFlip(false);

    // strict: session ends when we've walked the entire queue once
    if (nextIndex >= total) {
      setSessionCompleted(true);
    }
  }

  /* =======================
     Sentence Lab
  ======================= */
  const sentenceData = SENTENCES as SentenceEntry[];
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const currentSentence = sentenceData[sentenceIndex];

  const [pool, setPool] = useState<string[]>([]);
  const [answer, setAnswer] = useState<string[]>([]);
  const [sentenceResult, setSentenceResult] = useState<
    null | "correct" | "wrong"
  >(null);

  useEffect(() => {
    if (!currentSentence) {
      setPool([]);
      setAnswer([]);
      setSentenceResult(null);
      return;
    }

    const combined = shuffle([
      ...currentSentence.tokens,
      ...(currentSentence.distractors ?? []),
    ]);

    setPool(combined);
    setAnswer([]);
    setSentenceResult(null);
  }, [currentSentence?.id]);

  function onDragStart(
    e: React.DragEvent,
    word: string,
    from: "pool" | "answer"
  ) {
    e.dataTransfer.setData("word", word);
    e.dataTransfer.setData("from", from);
  }

  function allowDrop(e: React.DragEvent) {
    e.preventDefault();
  }

  function moveWord(word: string, from: "pool" | "answer") {
    if (from === "pool") {
      setPool((p) => p.filter((w) => w !== word));
      setAnswer((a) => [...a, word]);
    } else {
      setAnswer((a) => a.filter((w) => w !== word));
      setPool((p) => [...p, word]);
    }
    setSentenceResult(null);
  }

  function dropTo(target: "pool" | "answer", e: React.DragEvent) {
    e.preventDefault();
    const word = e.dataTransfer.getData("word");
    const from = e.dataTransfer.getData("from") as "pool" | "answer";
    if (!word || from === target) return;
    moveWord(word, from);
  }

  function checkSentence() {
    if (!currentSentence) return;
    const correct = currentSentence.tokens.join(" ").trim();
    const user = answer.join(" ").trim();
    setSentenceResult(user === correct ? "correct" : "wrong");
  }

  /* =======================
     Weak / Strong lists
  ======================= */
  const weakWords = useMemo(
    () =>
      vocab
        .filter(
          (v) =>
            (state.srs[v.id]?.strength ?? 0) > 0 &&
            (state.srs[v.id]?.strength ?? 0) < LEARNED_THRESHOLD
        )
        .sort(
          (a, b) =>
            (state.srs[a.id]?.strength ?? 0) -
            (state.srs[b.id]?.strength ?? 0)
        )
        .slice(0, 25)
        .map((v) => ({
          ...v,
          strength: state.srs[v.id]?.strength ?? 0,
        })),
    [vocab, state.srs]
  );

  const strongWords = useMemo(
    () =>
      vocab
        .filter((v) => (state.srs[v.id]?.strength ?? 0) >= LEARNED_THRESHOLD)
        .sort(
          (a, b) =>
            (state.srs[b.id]?.strength ?? 0) -
            (state.srs[a.id]?.strength ?? 0)
        )
        .slice(0, 25)
        .map((v) => ({
          ...v,
          strength: state.srs[v.id]?.strength ?? 0,
        })),
    [vocab, state.srs]
  );

  const showBack = screen.key !== "home";

  /* =======================
     MAIN UI
  ======================= */
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" onClick={() => setScreen({ key: "home" })}>
          <div className="logoDot" />
          Sinhala Trainer
        </div>
        <div className="topRight">
          {showBack && (
            <button
              className="iconBtn"
              onClick={() => {
                // simple back: go home
                setScreen({ key: "home" });
                setSessionCompleted(false);
              }}
            >
              Home
            </button>
          )}
          <button
            className="iconBtn subtle"
            onClick={() => setScreen({ key: "stats" })}
          >
            Stats
          </button>
        </div>
      </header>

      <main className="main">
        {/* HOME */}
        {screen.key === "home" && (
          <HomeScreen
            streak={state.streak}
            overall={overallProgress}
            progressByCategory={progressByCategory}
            onDailyReview={() => openWithSession({ key: "review" })}
            onCategories={() => setScreen({ key: "categories" })}
            onSentenceLab={() => setScreen({ key: "sentences" })}
            onFlashcards={() =>
              setScreen({
                key: "flashcards",
                category: state.selectedCategory,
              })
            }
            onStats={() => setScreen({ key: "stats" })}
            onSettings={() => setScreen({ key: "settings" })}
          />
        )}

        {/* CATEGORIES */}
        {screen.key === "categories" && (
          <CategoriesScreen
            categories={categories}
            progressByCategory={progressByCategory}
            srs={state.srs}
            vocab={vocab}
            onLearn={(c) => {
              setState((s) => ({ ...s, selectedCategory: c }));
              openWithSession({ key: "learn", category: c });
            }}
            onPractice={(c) => {
              setReviewFlip(false);
              setReviewIndex(0);
              setSessionCompleted(false);
              setScreen({ key: "practice", category: c });
            }}
          />
        )}

        {/* LEARN / REVIEW / PRACTICE */}
        {(screen.key === "learn" ||
          screen.key === "review" ||
          screen.key === "practice") && (
          <section className="panel">
            <div className="panelHead">
              <div className="panelHeadLeft">
                <h2>
                  {screen.key === "review" && "Review all learnt words"}
                  {screen.key === "learn" &&
                    `Learn • ${formatCategoryName(
                      screen.category === "all"
                        ? "all"
                        : screen.category
                    )}`}
                  {screen.key === "practice" &&
                    `Practice • ${formatCategoryName(screen.category)}`}
                </h2>
                {screen.key !== "practice" && (
                  <button
                    className="btn ghost smallBtn"
                    onClick={() => {
                      setScreen({ key: "categories" });
                      setSessionCompleted(false);
                    }}
                  >
                    Back
                  </button>
                )}
              </div>

              <ProgressBar
                done={
                  sessionCompleted
                    ? (screen.key === "learn"
                        ? learnQueue.length
                        : screen.key === "review"
                        ? reviewQueue.length
                        : practiceQueue.length)
                    : reviewIndex
                }
                total={
                  screen.key === "practice"
                    ? practiceQueue.length
                    : screen.key === "learn"
                    ? learnQueue.length
                    : reviewQueue.length
                }
              />
            </div>

            {/* Session summary for learn & review */}
            {(screen.key === "learn" || screen.key === "review") &&
              sessionCompleted &&
              sessionStats && (
                <SessionSummary
                  stats={sessionStats}
                  onBackToCategories={() => {
                    setScreen({ key: "categories" });
                    setSessionCompleted(false);
                  }}
                  onContinue={() => {
                    // restart another session from same screen
                    openWithSession(screen);
                  }}
                />
              )}

            {/* Flashcard flow */}
            {!sessionCompleted && (
              <>
                {!currentReview ? (
                  <EmptyBlock
                    title="No words"
                    subtitle={
                      screen.key === "review"
                        ? "You haven't learned any words yet."
                        : "Nothing available in this mode."
                    }
                    actionLabel="Back to Categories"
                    onAction={() => setScreen({ key: "categories" })}
                  />
                ) : (
                  <Flashcard
                    entry={currentReview}
                    flip={reviewFlip}
                    onFlip={() => setReviewFlip((f) => !f)}
                    strength={state.srs[currentReview.id]?.strength ?? 0}
                    onGrade={gradeCurrent}
                    isPractice={screen.key === "practice"}
                    onRestartPractice={() => {
                      setReviewIndex(0);
                      setReviewFlip(false);
                    }}
                  />
                )}
              </>
            )}
          </section>
        )}

        {/* FLASHCARDS */}
        {screen.key === "flashcards" && (
          <section className="panel">
            <div className="panelHead">
              <div className="panelHeadLeft">
                <h2>Flashcards</h2>
                <button
                  className="btn ghost smallBtn"
                  onClick={() => setScreen({ key: "categories" })}
                >
                  Back
                </button>
              </div>
            </div>

            <BrowseFlashcards
              vocab={vocab}
              selectedCategory={screen.category}
              srs={state.srs}
            />
          </section>
        )}

        {/* SENTENCE LAB */}
        {screen.key === "sentences" && (
          <section className="panel">
            <div className="panelHead">
              <div className="panelHeadLeft">
                <h2>Sentence Lab</h2>
                <button
                  className="btn ghost smallBtn"
                  onClick={() => setScreen({ key: "home" })}
                >
                  Back
                </button>
              </div>
              {sentenceData.length > 0 && (
                <div className="muted small">
                  {sentenceIndex + 1}/{sentenceData.length}
                </div>
              )}
            </div>

            {!currentSentence ? (
              <EmptyBlock
                title="No sentences"
                subtitle="Add entries in sentences.ts"
                actionLabel="Go Home"
                onAction={() => setScreen({ key: "home" })}
              />
            ) : (
              <SentenceCard
                currentSentence={currentSentence}
                pool={pool}
                answer={answer}
                sentenceResult={sentenceResult}
                onDragStart={onDragStart}
                allowDrop={allowDrop}
                dropTo={dropTo}
                onChipClick={moveWord}
                checkSentence={checkSentence}
                next={() =>
                  setSentenceIndex((i) => (i + 1) % sentenceData.length)
                }
                reset={() => {
                  setAnswer([]);
                  setPool(
                    shuffle([
                      ...currentSentence.tokens,
                      ...(currentSentence.distractors ?? []),
                    ])
                  );
                  setSentenceResult(null);
                }}
              />
            )}
          </section>
        )}

        {/* STATS */}
        {screen.key === "stats" && (
          <StatsScreen
            overallProgress={overallProgress}
            progressByCategory={progressByCategory}
            weakWords={weakWords}
            strongWords={strongWords}
            vocab={vocab}
            srs={state.srs}
            categories={categories.filter((c) => c !== "all")}
            onBack={() => setScreen({ key: "home" })}
          />
        )}

        {/* SETTINGS */}
        {screen.key === "settings" && (
          <SettingsScreen
            state={state}
            setState={setState}
            onReset={() => {
              localStorage.removeItem(STORAGE_KEY);
              setState(DEFAULT_STATE);
              setScreen({ key: "home" });
            }}
          />
        )}
      </main>

      {showSessionModal && (
        <SessionModal
          suggested={suggestedSessionSize()}
          choice={sessionChoice}
          autoSuggest={state.autoSuggest}
          onChangeChoice={setSessionChoice}
          onToggleAutoSuggest={(v: boolean) =>
            setState((s) => ({ ...s, autoSuggest: v }))
          }
          onCancel={() => {
            setShowSessionModal(false);
            setPendingScreen(null);
          }}
          onConfirm={startSession}
        />
      )}
    </div>
  );
}

/* =======================
   HOME
======================= */

function HomeScreen({
  streak,
  overall,
  progressByCategory,
  onDailyReview,
  onCategories,
  onSentenceLab,
  onFlashcards,
  onStats,
  onSettings,
}: {
  streak: number;
  overall: {
    learned: number;
    total: number;
    avgStrength: number;
    inProgress: number;
    unseen: number;
  };
  progressByCategory: Record<
    string,
    {
      total: number;
      learned: number;
      inProgress: number;
      unseen: number;
      avgStrength: number;
    }
  >;
  onDailyReview: () => void;
  onCategories: () => void;
  onSentenceLab: () => void;
  onFlashcards: () => void;
  onStats: () => void;
  onSettings: () => void;
}) {
  const pct = Math.round((overall.learned / Math.max(1, overall.total)) * 100);

  return (
    <section className="home">
      <div className="hero">
        <div className="heroTop">
          <div>
            <h1>Speak Sinhala</h1>
            <p className="muted">Train core vocab for real conversations</p>
          </div>
          <div className="streakPill">🔥 {streak}-day streak</div>
        </div>

        <div className="heroStats">
          <HeroStat
            label="Learned"
            value={`${pct}%`}
            sub={`${overall.learned}/${overall.total} words`}
          />
          <HeroStat
            label="In progress"
            value={overall.inProgress}
            sub="Partially learned"
          />
          <HeroStat
            label="Unseen"
            value={overall.unseen}
            sub="Not reviewed yet"
          />
        </div>
      </div>

      <div className="grid">
        <MenuCard
          title="Review"
          subtitle="All words you've started"
          cta="Start"
          onClick={onDailyReview}
        />
        <MenuCard
          title="Categories"
          subtitle="Learn or practice topics"
          cta="Open"
          onClick={onCategories}
        />
        <MenuCard
          title="Sentence Lab"
          subtitle="Build Sinhala sentences"
          cta="Train"
          onClick={onSentenceLab}
        />
        <MenuCard
          title="Flashcards"
          subtitle="Browse vocabulary"
          cta="Browse"
          onClick={onFlashcards}
        />
        <MenuCard
          title="Stats"
          subtitle="Progress & strengths"
          cta="View"
          onClick={onStats}
        />
        <MenuCard
          title="Settings"
          subtitle="Study preferences"
          cta="Edit"
          onClick={onSettings}
        />
      </div>

      <div className="panel slim">
        <div className="panelHead">
          <h2>Category progress</h2>
        </div>

        <div className="catProgressGrid">
          {Object.keys(progressByCategory).map((c) => {
            const p = progressByCategory[c];
            const pPct = Math.round((p.learned / p.total) * 100);

            return (
              <div className="catProgressTile" key={c}>
                <div className="catTileTop">
                  <div className="catName">{formatCategoryName(c)}</div>
                  <div className="muted small">{pPct}% learned</div>
                </div>
                <MiniBar pct={pPct} />
                <div className="muted small">
                  Learned: {p.learned} • In progress: {p.inProgress} • Unseen:{" "}
                  {p.unseen}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function HeroStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
}) {
  return (
    <div className="heroStat">
      <div className="muted small">{label}</div>
      <div className="heroValue">{value}</div>
      <div className="muted small">{sub}</div>
    </div>
  );
}

function MenuCard({
  title,
  subtitle,
  cta,
  onClick,
}: {
  title: string;
  subtitle: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <button className="menuCard" onClick={onClick}>
      <div className="menuTitle">{title}</div>
      <div className="menuSubtitle">{subtitle}</div>
      <div className="menuCta">{cta} →</div>
    </button>
  );
}

/* =======================
   Categories Screen
======================= */

function CategoriesScreen({
  categories,
  progressByCategory,
  srs,
  vocab,
  onLearn,
  onPractice,
}: {
  categories: readonly ("all" | string)[];
  progressByCategory: Record<
    string,
    {
      total: number;
      learned: number;
      inProgress: number;
      unseen: number;
      avgStrength: number;
    }
  >;
  srs: Record<string, SRSCard>;
  vocab: VocabEntry[];
  onLearn: (c: string) => void;
  onPractice: (c: string) => void;
}) {
  return (
    <section className="panel">
      <div className="panelHead">
        <div className="panelHeadLeft">
          <h2>Categories</h2>
        </div>
        <p className="muted small">
          Learn with SRS or practice freely by topic.
        </p>
      </div>

      <div className="catGrid">
        {categories
          .filter((c) => c !== "all")
          .map((c) => {
            const key = String(c);
            const p = progressByCategory[key];
            const pct = p ? Math.round((p.learned / p.total) * 100) : 0;

            const words = vocab.filter((v) => v.category === key);
            const learnedWords = words.filter(
              (v) => (srs[v.id]?.strength ?? 0) >= LEARNED_THRESHOLD
            );
            const inProgressWords = words.filter(
              (v) =>
                (srs[v.id]?.strength ?? 0) > 0 &&
                (srs[v.id]?.strength ?? 0) < LEARNED_THRESHOLD
            );
            const unseenWords = words.filter(
              (v) => (srs[v.id]?.strength ?? 0) === 0
            );

            const done =
              words.length > 0 && learnedWords.length === words.length;

            return (
              <div key={key} className="catTileWrap">
                <div className="catTile">
                  <div className="catName">{formatCategoryName(key)}</div>
                  <div className="muted small">
                    {pct}% learned{done && " • complete"}
                  </div>
                  <MiniBar pct={pct} />
                  <div className="muted small" style={{ marginTop: 6 }}>
                    In progress:{" "}
                    {inProgressWords
                      .map((w) => w.english)
                      .slice(0, 6)
                      .join(", ") || "—"}
                  </div>
                  <div className="muted small" style={{ marginTop: 2 }}>
                    Unseen:{" "}
                    {unseenWords
                      .map((w) => w.english)
                      .slice(0, 6)
                      .join(", ") || "—"}
                  </div>
                </div>

                <div className="catActions">
                  <button
                    className="btn ghost"
                    onClick={() => onPractice(key)}
                  >
                    Practice
                  </button>
                  <button
                    className="btn"
                    disabled={done}
                    onClick={() => !done && onLearn(key)}
                  >
                    {done ? "Completed" : "Learn"}
                  </button>
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
}

/* =======================
   Flashcards
======================= */

function Flashcard({
  entry,
  flip,
  onFlip,
  onGrade,
  strength,
  isPractice,
  onRestartPractice,
}: {
  entry: VocabEntry;
  flip: boolean;
  onFlip: () => void;
  onGrade: (r: keyof typeof RATING_MAP) => void;
  strength: number;
  isPractice?: boolean;
  onRestartPractice?: () => void;
}) {
  return (
    <div className="card">
      <div className="cardTop">
        <div className="tag">{formatCategoryName(entry.category)}</div>
        <div className="strength">Strength: {strength}</div>
      </div>

      <button className="flip" onClick={onFlip}>
        {!flip ? (
          <>
            <div className="prompt">English</div>
            <div className="big">{entry.english}</div>
            <div className="hint">Tap to reveal phonetic</div>
          </>
        ) : (
          <>
            <div className="prompt">Phonetic Sinhala</div>
            <div className="big">{entry.phonetic}</div>
            <div className="hint">
              {isPractice
                ? "Tap practice again to cycle."
                : "How was your recall?"}
            </div>
          </>
        )}
      </button>

      {!isPractice && flip && (
        <div className="grades">
          <button
            className="grade again"
            onClick={() => onGrade("again")}
          >
            Again
          </button>
          <button className="grade hard" onClick={() => onGrade("hard")}>
            Hard
          </button>
          <button className="grade good" onClick={() => onGrade("good")}>
            Good
          </button>
          <button className="grade easy" onClick={() => onGrade("easy")}>
            Easy
          </button>
        </div>
      )}

      {isPractice && (
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn ghost" onClick={onRestartPractice}>
            Restart
          </button>
        </div>
      )}
    </div>
  );
}

function BrowseFlashcards({
  vocab,
  selectedCategory,
  srs,
}: {
  vocab: VocabEntry[];
  selectedCategory: string | "all";
  srs: Record<string, SRSCard>;
}) {
  const list =
    selectedCategory === "all"
      ? vocab
      : vocab.filter((v) => v.category === selectedCategory);

  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);

  const current = list[i];
  if (!current) return <div className="empty">No words in this category.</div>;

  return (
    <div className="card">
      <div className="cardTop">
        <div className="tag">{formatCategoryName(current.category)}</div>
        <div className="strength">
          Strength: {srs[current.id]?.strength ?? 0}
        </div>
      </div>

      <button className="flip" onClick={() => setFlip((f) => !f)}>
        {!flip ? (
          <>
            <div className="prompt">English</div>
            <div className="big">{current.english}</div>
          </>
        ) : (
          <>
            <div className="prompt">Phonetic Sinhala</div>
            <div className="big">{current.phonetic}</div>
          </>
        )}
      </button>

      <div className="row">
        <button
          className="btn ghost"
          onClick={() => {
            setFlip(false);
            setI((x) => (x - 1 + list.length) % list.length);
          }}
        >
          Prev
        </button>
        <button
          className="btn"
          onClick={() => {
            setFlip(false);
            setI((x) => (x + 1) % list.length);
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}

/* =======================
   Session Summary (Learn/Review)
======================= */

function SessionSummary({
  stats,
  onBackToCategories,
  onContinue,
}: {
  stats: SessionStats;
  onBackToCategories: () => void;
  onContinue: () => void;
}) {
  const accuracy =
    stats.reviews === 0
      ? 0
      : Math.round((stats.correct / stats.reviews) * 100);

  return (
    <div className="card sessionSummary">
      <h3>Session complete</h3>
      <p className="muted small">
        Mode: <strong>{stats.mode === "learn" ? "Learn" : "Review"}</strong>{" "}
        • Category: <strong>{formatCategoryName(stats.category)}</strong>
      </p>

      <div className="statsGrid">
        <StatBox label="Cards reviewed" value={stats.reviews} />
        <StatBox label="Correct" value={stats.correct} />
        <StatBox label="Accuracy" value={`${accuracy}%`} />
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn ghost" onClick={onBackToCategories}>
          Back to categories
        </button>
        <button className="btn" onClick={onContinue}>
          Learn more
        </button>
      </div>
    </div>
  );
}

/* =======================
   Sentence Lab Card
======================= */

function SentenceCard({
  currentSentence,
  pool,
  answer,
  sentenceResult,
  onDragStart,
  allowDrop,
  dropTo,
  onChipClick,
  checkSentence,
  next,
  reset,
}: {
  currentSentence: SentenceEntry;
  pool: string[];
  answer: string[];
  sentenceResult: "correct" | "wrong" | null;
  onDragStart: (
    e: React.DragEvent,
    word: string,
    from: "pool" | "answer"
  ) => void;
  allowDrop: (e: React.DragEvent) => void;
  dropTo: (target: "pool" | "answer", e: React.DragEvent) => void;
  onChipClick: (word: string, from: "pool" | "answer") => void;
  checkSentence: () => void;
  next: () => void;
  reset: () => void;
}) {
  return (
    <div className="sentenceWrap">
      <div className="sentenceCard">
        <div className="sentenceEnglish">{currentSentence.english}</div>
      </div>

      <div className="dropZones">
        <div
          className="zone"
          onDrop={(e) => dropTo("answer", e)}
          onDragOver={allowDrop}
        >
          <div className="zoneTitle">Your sentence</div>
          <div className="chips">
            {answer.map((w, i) => (
              <div
                key={`${w}-${i}`}
                className="chip"
                draggable
                onClick={() => onChipClick(w, "answer")}
                onDragStart={(e) => onDragStart(e, w, "answer")}
              >
                {w}
              </div>
            ))}
          </div>
        </div>

        <div
          className="zone"
          onDrop={(e) => dropTo("pool", e)}
          onDragOver={allowDrop}
        >
          <div className="zoneTitle">Word bank</div>
          <div className="chips">
            {pool.map((w, i) => (
              <div
                key={`${w}-${i}`}
                className="chip"
                draggable
                onClick={() => onChipClick(w, "pool")}
                onDragStart={(e) => onDragStart(e, w, "pool")}
              >
                {w}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="row">
        <button className="btn" onClick={checkSentence}>
          Check
        </button>
        <button className="btn ghost" onClick={next}>
          Next
        </button>
        <button className="btn ghost" onClick={reset}>
          Reset
        </button>
      </div>

      {sentenceResult && (
        <div
          className={
            sentenceResult === "correct" ? "result ok" : "result bad"
          }
        >
          {sentenceResult === "correct"
            ? "Correct! 🎉"
            : "Not quite — try again"}
        </div>
      )}
    </div>
  );
}

/* =======================
   Stats Screen
======================= */

function StatsScreen({
  overallProgress,
  progressByCategory,
  weakWords,
  strongWords,
  vocab,
  srs,
  categories,
  onBack,
}: {
  overallProgress: {
    learned: number;
    total: number;
    avgStrength: number;
    inProgress: number;
    unseen: number;
  };
  progressByCategory: Record<
    string,
    {
      total: number;
      learned: number;
      inProgress: number;
      unseen: number;
      avgStrength: number;
    }
  >;
  weakWords: { id: string; english: string; phonetic: string; strength: number }[];
  strongWords: { id: string; english: string; phonetic: string; strength: number }[];
  vocab: VocabEntry[];
  srs: Record<string, SRSCard>;
  categories: (string | "all")[];
  onBack: () => void;
}) {
  const initialCategory =
    (categories[0] as string | undefined) ?? (vocab[0]?.category ?? "");
  const [selectedCategory, setSelectedCategory] =
    useState<string>(initialCategory);

  const learnedInCat =
    selectedCategory === ""
      ? []
      : vocab.filter(
          (v) =>
            v.category === selectedCategory &&
            (srs[v.id]?.strength ?? 0) >= LEARNED_THRESHOLD
        );

  const inProgressInCat =
    selectedCategory === ""
      ? []
      : vocab.filter(
          (v) =>
            v.category === selectedCategory &&
            (srs[v.id]?.strength ?? 0) > 0 &&
            (srs[v.id]?.strength ?? 0) < LEARNED_THRESHOLD
        );

  const unseenInCat =
    selectedCategory === ""
      ? []
      : vocab.filter(
          (v) =>
            v.category === selectedCategory &&
            (srs[v.id]?.strength ?? 0) === 0
        );

  return (
    <section className="panel">
      <div className="panelHead">
        <div className="panelHeadLeft">
          <h2>Stats</h2>
          <button className="btn ghost smallBtn" onClick={onBack}>
            Back
          </button>
        </div>
      </div>

      <div className="statsGrid">
        <StatBox
          label="Learned"
          value={`${overallProgress.learned}/${overallProgress.total}`}
        />
        <StatBox label="In progress" value={overallProgress.inProgress} />
        <StatBox label="Unseen" value={overallProgress.unseen} />
        <StatBox label="Avg strength" value={overallProgress.avgStrength} />
      </div>

      <h3>Per-category</h3>
      <div className="catProgressList">
        {Object.keys(progressByCategory).map((c) => {
          const p = progressByCategory[c];
          const pct = Math.round((p.learned / p.total) * 100);
          return (
            <div className="catProgressRow" key={c}>
              <div className="catProgressLeft">
                <div className="catName">{formatCategoryName(c)}</div>
                <div className="muted small">
                  Learned: {p.learned} • In progress: {p.inProgress} • Unseen:{" "}
                  {p.unseen}
                </div>
              </div>
              <MiniBar pct={pct} />
              <div className="muted small">{pct}%</div>
            </div>
          );
        })}
      </div>

      <div className="panelSubHead">
        <h3>Words by category</h3>
      </div>
      {categories && categories.length > 0 && (
        <div className="settingsRow">
          <label>Category</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              background: "var(--panel-2)",
              border: "1px solid var(--line)",
              color: "var(--text)",
              padding: "6px 8px",
              borderRadius: 8,
              fontWeight: 600,
            }}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {formatCategoryName(String(c))}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedCategory && (
        <div className="lists">
          <div>
            <h3>Learned in {formatCategoryName(selectedCategory)}</h3>
            <ul className="wordList">
              {learnedInCat.length === 0 && (
                <li className="muted small">No learned words yet.</li>
              )}
              {learnedInCat.map((w) => (
                <li key={w.id}>
                  <span>{w.english}</span>
                  <span className="muted">{w.phonetic}</span>
                  <span className="muted small">
                    {srs[w.id]?.strength ?? 0}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3>In progress in {formatCategoryName(selectedCategory)}</h3>
            <ul className="wordList">
              {inProgressInCat.length === 0 && (
                <li className="muted small">Nothing in progress.</li>
              )}
              {inProgressInCat.map((w) => (
                <li key={w.id}>
                  <span>{w.english}</span>
                  <span className="muted">{w.phonetic}</span>
                  <span className="muted small">
                    {srs[w.id]?.strength ?? 0}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3>Unseen in {formatCategoryName(selectedCategory)}</h3>
            <ul className="wordList">
              {unseenInCat.length === 0 && (
                <li className="muted small">Everything started 🎉</li>
              )}
              {unseenInCat.map((w) => (
                <li key={w.id}>
                  <span>{w.english}</span>
                  <span className="muted">{w.phonetic}</span>
                  <span className="muted small">
                    {srs[w.id]?.strength ?? 0}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="panelSubHead">
        <h3>Weak vs strong (all categories)</h3>
      </div>
      <div className="lists">
        <div>
          <h3>In progress (weak words)</h3>
          <ul className="wordList">
            {weakWords.map((w) => (
              <li key={w.id}>
                <span>{w.english}</span>
                <span className="muted">{w.phonetic}</span>
                <span className="muted small">{w.strength}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3>Strong words</h3>
          <ul className="wordList">
            {strongWords.map((w) => (
              <li key={w.id}>
                <span>{w.english}</span>
                <span className="muted">{w.phonetic}</span>
                <span className="muted small">{w.strength}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* =======================
   Settings Screen
======================= */

function SettingsScreen({
  state,
  setState,
  onReset,
}: {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onReset: () => void;
}) {
  return (
    <section className="panel">
      <div className="panelHead">
        <div className="panelHeadLeft">
          <h2>Settings</h2>
        </div>
      </div>

      <div className="settingsRow">
        <label>Auto-suggest session length</label>
        <input
          type="checkbox"
          checked={state.autoSuggest}
          onChange={(e) =>
            setState((s) => ({
              ...s,
              autoSuggest: e.target.checked,
            }))
          }
        />
      </div>

      <div className="settingsRow">
        <label>Cloud sync</label>
        <input
          type="checkbox"
          checked={state.cloudSyncEnabled}
          onChange={(e) =>
            setState((s) => ({
              ...s,
              cloudSyncEnabled: e.target.checked,
            }))
          }
        />
      </div>

      <div className="settingsRow">
        <button className="btn danger" onClick={onReset}>
          Reset progress
        </button>
      </div>
    </section>
  );
}

/* =======================
   Session Modal
======================= */

function SessionModal({
  suggested,
  choice,
  autoSuggest,
  onChangeChoice,
  onToggleAutoSuggest,
  onCancel,
  onConfirm,
}: {
  suggested: SessionSize;
  choice: SessionSize;
  autoSuggest: boolean;
  onChangeChoice: (c: SessionSize) => void;
  onToggleAutoSuggest: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const sizes: SessionSize[] = [5, 10, 20, "unlimited"];

  return (
    <div className="modalBackdrop" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalTitle">Session size</div>
        <div className="muted small">
          Suggested: {suggested === "unlimited" ? "Unlimited" : suggested}
        </div>

        <div className="modalChoices">
          {sizes.map((s) => (
            <button
              key={s}
              className={choice === s ? "choice active" : "choice"}
              onClick={() => onChangeChoice(s)}
            >
              {s === "unlimited" ? "Unlimited" : `${s} words`}
            </button>
          ))}
        </div>

        <label className="toggleRow">
          <input
            type="checkbox"
            checked={autoSuggest}
            onChange={(e) => onToggleAutoSuggest(e.target.checked)}
          />
          Auto-suggest length
        </label>

        <div className="modalActions">
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn" onClick={onConfirm}>
            Start
          </button>
        </div>
      </div>
    </div>
  );
}

/* =======================
   Small UI helpers
======================= */

function ProgressBar({ done, total }: { done: number; total: number }) {
  const safeDone = Math.min(done, total);
  const pct = total === 0 ? 0 : Math.round((safeDone / total) * 100);

  return (
    <div className="progress">
      <div className="progressBar">
        <div className="progressFill" style={{ width: `${pct}%` }} />
      </div>
      <div className="muted small">
        {safeDone}/{total}
      </div>
    </div>
  );
}

function EmptyBlock({
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="empty">
      <div className="emptyTitle">{title}</div>
      <div className="muted">{subtitle}</div>
      <button
        className="btn"
        style={{ marginTop: 12 }}
        onClick={onAction}
      >
        {actionLabel}
      </button>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: any }) {
  return (
    <div className="stat">
      <div className="statLabel">{label}</div>
      <div className="statValue">{value}</div>
    </div>
  );
}

function MiniBar({ pct }: { pct: number }) {
  return (
    <div className="miniBar">
      <div className="miniFill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default App;
