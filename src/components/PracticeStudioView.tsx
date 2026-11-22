import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Eye,
  EyeOff,
  Flag,
  GraduationCap,
  HelpCircle,
  Layers,
  RotateCcw,
  Search,
  Sparkles,
  Square,
  Target,
  Volume2,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildChapterAssessment,
  buildSkillDrill,
  buildUnitAssessment,
  gradeGermanAnswer,
  type AssessmentQuestion,
  type ExerciseCategory,
  type ExtractedExercise,
  type GradeResult,
  type SkillDrillTopic,
} from '../services/exerciseExtractor';
import { playGermanAudio, stopGermanAudio } from '../services/germanAudio';
import type { ParsedBook, UserStudyState } from '../types/book';

export type PracticeStudioTab = 'workbook' | 'assessments' | 'drills' | 'revision';

interface PracticeStudioViewProps {
  book: ParsedBook;
  exercises: ExtractedExercise[];
  studyState: UserStudyState;
  initialTab?: PracticeStudioTab;
  initialChapterFilter?: number;
  initialExerciseNumber?: number;
  onOpenChapter: (chapterNumber: number) => void;
  onOpenLesson: (chapterNumber: number) => void;
  onRecordExerciseAttempt: (payload: {
    exerciseNumber: number;
    chapterNumber: number;
    score: number;
    total: number;
    completed?: boolean;
    savedResponses?: Record<string, string>;
  }) => void;
  onToggleExerciseNeedsReview: (exerciseNumber: number, chapterNumber: number) => void;
  onRecordQuizResult: (result: {
    chapterNumber: number;
    title: string;
    score: number;
    total: number;
  }) => void;
}

const GERMAN_CHARS = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'];

const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  'fill-blank': 'Fill-in-the-Blank',
  translation: 'Translation',
  'grammar-transform': 'Grammar Drill',
  matching: 'Matching',
  comprehension: 'Comprehension',
  'open-ended': 'Open-Ended / Self-Check',
};

const SKILL_DRILLS: {
  id: SkillDrillTopic;
  title: string;
  subtitle: string;
  description: string;
}[] = [
  {
    id: 'articles-cases',
    title: 'Articles, Gender & Cases',
    subtitle: 'der · die · das · ein · kein · Cases',
    description:
      'Practise definite and indefinite articles, plural forms, adjective endings, pronouns, and Nominative / Accusative / Dative / Genitive cases drawn from keyed textbook drills.',
  },
  {
    id: 'verbs-tenses',
    title: 'Verb Conjugation & Tenses',
    subtitle: 'Present · Perfect · Past · Future · Modals',
    description:
      'Drill present-tense endings, haben/sein auxiliaries, conversational past participles, imperatives, separable verbs, and modal verbs across Chapters 3–44.',
  },
  {
    id: 'translation-word-order',
    title: 'Translation & Word Order',
    subtitle: 'V2 Structure · Clauses · English ↔ German',
    description:
      'Build real German sentences, translate authentic textbook cues, and practise question inversion, negation with nicht/kein, and subordinate clauses.',
  },
];

function buildHintText(officialAnswer: string): string {
  const clean = officialAnswer.trim();
  if (!clean) return '';
  const words = clean.split(/\s+/);
  if (words.length === 1) {
    const w = words[0];
    if (w.length <= 2) return `Starts with "${w[0]}" (${w.length} letters)`;
    return `Starts with "${w.slice(0, 2)}…" (${w.length} letters)`;
  }
  return `First word: "${words[0]}" · ${words.length} words total`;
}

export function PracticeStudioView({
  book,
  exercises,
  studyState,
  initialTab = 'workbook',
  initialChapterFilter,
  initialExerciseNumber,
  onOpenChapter,
  onOpenLesson,
  onRecordExerciseAttempt,
  onToggleExerciseNeedsReview,
  onRecordQuizResult,
}: PracticeStudioViewProps) {
  const [activeTab, setActiveTab] = useState<PracticeStudioTab>(initialTab);

  // Workbook Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [chapterFilter, setChapterFilter] = useState<number | 'all'>(initialChapterFilter ?? 'all');
  const [categoryFilter, setCategoryFilter] = useState<ExerciseCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'keyed' | 'open-ended' | 'needs-review' | 'completed' | 'unstarted'
  >('all');

  // Selected Exercise in Workbook
  const [selectedExerciseNum, setSelectedExerciseNum] = useState<number>(() => {
    if (initialExerciseNumber) return initialExerciseNumber;
    if (initialChapterFilter) {
      const firstInCh = exercises.find((e) => e.chapterNumber === initialChapterFilter);
      if (firstInCh) return firstInCh.exerciseNumber;
    }
    return exercises[0]?.exerciseNumber ?? 1;
  });

  // Per-exercise active workspace state
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [freeformDraft, setFreeformDraft] = useState('');
  const [itemGrades, setItemGrades] = useState<Record<string, GradeResult>>({});
  const [hintsShown, setHintsShown] = useState<Record<string, boolean>>({});
  const [showOfficialKey, setShowOfficialKey] = useState(false);
  const [showOriginalHtml, setShowOriginalHtml] = useState(false);
  const [lastGradedSummary, setLastGradedSummary] = useState<{
    correct: number;
    almost: number;
    total: number;
  } | null>(null);
  const [focusedInputKey, setFocusedInputKey] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});

  // Audio playback state
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Assessment & Skill Drill Runner state
  const [activeAssessmentTitle, setActiveAssessmentTitle] = useState<string | null>(null);
  const [activeAssessmentChapter, setActiveAssessmentChapter] = useState<number>(1);
  const [assessmentSourceConfig, setAssessmentSourceConfig] = useState<
    | { kind: 'chapter'; chapterNumber: number }
    | { kind: 'unit'; unitId: string }
    | { kind: 'drill'; skill: SkillDrillTopic }
    | null
  >(null);
  const [assessmentSeed, setAssessmentSeed] = useState(1);
  const [assessmentQuestions, setAssessmentQuestions] = useState<AssessmentQuestion[]>([]);
  const [assessmentTyped, setAssessmentTyped] = useState<Record<string, string>>({});
  const [assessmentChoices, setAssessmentChoices] = useState<Record<string, number>>({});
  const [assessmentSubmitted, setAssessmentSubmitted] = useState(false);
  const [assessmentGrades, setAssessmentGrades] = useState<Record<string, GradeResult>>({});
  const [selectedAssessmentChapter, setSelectedAssessmentChapter] = useState<number>(3);

  // Sync external navigation jumps (e.g. from Lesson Studio "Practice Chapter X Exercises")
  useEffect(() => {
    if (initialChapterFilter !== undefined) {
      setActiveTab('workbook');
      setChapterFilter(initialChapterFilter);
      setUnitFilter('all');
      const firstInCh = exercises.find((e) => e.chapterNumber === initialChapterFilter);
      if (firstInCh) {
        setSelectedExerciseNum(firstInCh.exerciseNumber);
      }
    }
  }, [initialChapterFilter, exercises]);

  useEffect(() => {
    if (initialExerciseNumber !== undefined) {
      setActiveTab('workbook');
      setSelectedExerciseNum(initialExerciseNumber);
    }
  }, [initialExerciseNumber]);

  useEffect(() => {
    return () => stopGermanAudio();
  }, []);

  const chaptersWithExercises = useMemo(() => {
    const nums = Array.from(new Set(exercises.map((e) => e.chapterNumber))).sort((a, b) => a - b);
    return nums
      .map((n) => book.chapters.find((c) => c.number === n))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
  }, [book.chapters, exercises]);

  const filteredExercises = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return exercises.filter((ex) => {
      if (unitFilter !== 'all' && ex.unitId !== unitFilter) return false;
      if (chapterFilter !== 'all' && ex.chapterNumber !== chapterFilter) return false;
      if (categoryFilter !== 'all' && ex.category !== categoryFilter) return false;

      const prog = studyState.exerciseProgress[ex.exerciseNumber];
      if (statusFilter === 'keyed' && !ex.hasAnswerKey) return false;
      if (statusFilter === 'open-ended' && ex.hasAnswerKey) return false;
      if (statusFilter === 'needs-review' && !prog?.needsReview) return false;
      if (statusFilter === 'completed' && !prog?.completed) return false;
      if (statusFilter === 'unstarted' && prog && prog.attempts > 0) return false;

      if (q) {
        const hay = `exercise ${ex.exerciseNumber} ch ${ex.chapterNumber} ${ex.chapterTitle} ${ex.instruction} ${ex.items
          .slice(0, 4)
          .map((i) => i.prompt)
          .join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    exercises,
    unitFilter,
    chapterFilter,
    categoryFilter,
    statusFilter,
    searchQuery,
    studyState.exerciseProgress,
  ]);

  const activeExercise = useMemo(() => {
    return (
      exercises.find((e) => e.exerciseNumber === selectedExerciseNum) ||
      filteredExercises[0] ||
      exercises[0] ||
      null
    );
  }, [exercises, filteredExercises, selectedExerciseNum]);

  // Restore saved responses and reset transient grading when switching active exercise
  useEffect(() => {
    if (!activeExercise) return;
    stopGermanAudio();
    setSpeakingKey(null);
    setAudioError(null);
    const saved = studyState.exerciseProgress[activeExercise.exerciseNumber]?.savedResponses;
    setResponses(saved ? { ...saved } : {});
    setFreeformDraft(saved?.__freeform || '');
    setItemGrades({});
    setHintsShown({});
    setShowOfficialKey(false);
    setShowOriginalHtml(false);
    setLastGradedSummary(null);
    setFocusedInputKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeExercise?.exerciseNumber]);

  const activeFilteredIdx = useMemo(() => {
    if (!activeExercise) return -1;
    return filteredExercises.findIndex((e) => e.exerciseNumber === activeExercise.exerciseNumber);
  }, [activeExercise, filteredExercises]);

  // Overall workbook telemetry
  const stats = useMemo(() => {
    const total = exercises.length;
    const keyed = exercises.filter((e) => e.hasAnswerKey).length;
    const autoGradable = exercises.filter((e) => e.isAutoGradable).length;
    const completed = Object.values(studyState.exerciseProgress).filter((p) => p.completed).length;
    const needsReview = Object.values(studyState.exerciseProgress).filter((p) => p.needsReview).length;
    return { total, keyed, autoGradable, completed, needsReview };
  }, [exercises, studyState.exerciseProgress]);

  const handleSpeak = (key: string, text: string, rate: 1 | 0.65) => {
    setAudioError(null);
    const fullKey = `${key}-${rate}`;
    if (speakingKey === fullKey) {
      stopGermanAudio();
      setSpeakingKey(null);
      return;
    }
    void playGermanAudio(text, rate, {
      onStart: () => setSpeakingKey(fullKey),
      onEnd: () => setSpeakingKey(null),
      onError: (msg) => setAudioError(msg),
      onNoGermanVoiceWarning: (msg) => setAudioError(msg),
    });
  };

  const insertGermanChar = (char: string) => {
    const key = focusedInputKey;
    if (!key) return;

    const el = inputRefs.current[key];
    const start = el?.selectionStart ?? undefined;
    const end = el?.selectionEnd ?? undefined;

    const applyInsert = (currentVal: string): string => {
      if (start !== undefined && end !== undefined) {
        return currentVal.slice(0, start) + char + currentVal.slice(end);
      }
      return currentVal + char;
    };

    if (key === '__freeform') {
      setFreeformDraft((prev) => applyInsert(prev));
    } else if (key.startsWith('assess:')) {
      const qId = key.slice('assess:'.length);
      setAssessmentTyped((prev) => ({ ...prev, [qId]: applyInsert(prev[qId] || '') }));
    } else {
      setResponses((prev) => ({ ...prev, [key]: applyInsert(prev[key] || '') }));
    }

    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        if (start !== undefined) {
          const nextPos = start + char.length;
          el.setSelectionRange(nextPos, nextPos);
        }
      }
    });
  };

  const handleCheckSingleItem = (itemId: string, officialAnswer: string) => {
    const val = responses[itemId] || '';
    const result = gradeGermanAnswer(val, officialAnswer);
    setItemGrades((prev) => ({ ...prev, [itemId]: result }));
  };

  const handleCheckAllExerciseItems = () => {
    if (!activeExercise) return;
    const gradableItems = activeExercise.items.filter((it) => Boolean(it.officialAnswer));
    if (gradableItems.length === 0) return;

    const nextGrades: Record<string, GradeResult> = {};
    let correct = 0;
    let almost = 0;

    for (const item of gradableItems) {
      const res = gradeGermanAnswer(responses[item.id] || '', item.officialAnswer || '');
      nextGrades[item.id] = res;
      if (res.status === 'correct') correct++;
      else if (res.status === 'almost') almost++;
    }

    setItemGrades(nextGrades);
    setLastGradedSummary({ correct, almost, total: gradableItems.length });

    // Count 'correct' as full credit (almost gets flagged for spelling polish but doesn't punish completion harshly)
    const effectiveScore = correct + Math.floor(almost * 0.5);
    onRecordExerciseAttempt({
      exerciseNumber: activeExercise.exerciseNumber,
      chapterNumber: activeExercise.chapterNumber,
      score: effectiveScore,
      total: gradableItems.length,
      savedResponses: responses,
    });
    onRecordQuizResult({
      chapterNumber: activeExercise.chapterNumber,
      title: `Exercise ${activeExercise.exerciseNumber} (Ch. ${activeExercise.chapterNumber})`,
      score: effectiveScore,
      total: gradableItems.length,
    });
  };

  const handleMarkOpenEndedPractised = () => {
    if (!activeExercise) return;
    const saved: Record<string, string> = {
      ...responses,
      ...(freeformDraft.trim() ? { __freeform: freeformDraft } : {}),
    };
    onRecordExerciseAttempt({
      exerciseNumber: activeExercise.exerciseNumber,
      chapterNumber: activeExercise.chapterNumber,
      score: 1,
      total: 1,
      completed: true,
      savedResponses: saved,
    });
    setLastGradedSummary({ correct: 1, almost: 0, total: 1 });
  };

  const handleResetActiveExercise = () => {
    setResponses({});
    setFreeformDraft('');
    setItemGrades({});
    setHintsShown({});
    setLastGradedSummary(null);
  };

  /* ------------------------------------------------------------------------ */
  /* Assessment / Skill Drill Launcher & Grading                              */
  /* ------------------------------------------------------------------------ */

  const startAssessment = (
    config:
      | { kind: 'chapter'; chapterNumber: number }
      | { kind: 'unit'; unitId: string }
      | { kind: 'drill'; skill: SkillDrillTopic },
    seed = 1
  ) => {
    let qs: AssessmentQuestion[] = [];
    let title = '';
    let chNum = 1;

    if (config.kind === 'chapter') {
      const ch = book.chapters.find((c) => c.number === config.chapterNumber);
      qs = buildChapterAssessment(config.chapterNumber, exercises, book, seed);
      title = `Chapter ${config.chapterNumber} Assessment — ${ch?.englishTitle || ''}`;
      chNum = config.chapterNumber;
    } else if (config.kind === 'unit') {
      const unit = book.units.find((u) => u.id === config.unitId);
      qs = buildUnitAssessment(config.unitId, exercises, book, seed);
      title = `${unit?.title || 'Unit'} Checkpoint Assessment`;
      chNum = unit?.reviewChapterNumber || unit?.chapterEnd || 1;
    } else {
      const drillMeta = SKILL_DRILLS.find((d) => d.id === config.skill);
      qs = buildSkillDrill(config.skill, exercises, seed);
      title = `Targeted Drill — ${drillMeta?.title || config.skill}`;
      chNum = qs[0]?.chapterNumber || 1;
    }

    setAssessmentSourceConfig(config);
    setAssessmentSeed(seed);
    setActiveAssessmentTitle(title);
    setActiveAssessmentChapter(chNum);
    setAssessmentQuestions(qs);
    setAssessmentTyped({});
    setAssessmentChoices({});
    setAssessmentGrades({});
    setAssessmentSubmitted(false);
    setFocusedInputKey(null);
  };

  const handleSubmitAssessment = () => {
    if (assessmentQuestions.length === 0 || !activeAssessmentTitle) return;
    const grades: Record<string, GradeResult> = {};
    let score = 0;

    for (const q of assessmentQuestions) {
      if (q.kind === 'choice') {
        const chosen = assessmentChoices[q.id];
        const isRight = chosen === q.correctChoiceIndex;
        if (isRight) score++;
        grades[q.id] = {
          status: isRight ? 'correct' : 'incorrect',
          feedback: isRight
            ? 'Correct!'
            : `Official glossary meaning: "${q.officialAnswer}"`,
        };
      } else {
        const res = gradeGermanAnswer(assessmentTyped[q.id] || '', q.officialAnswer);
        grades[q.id] = res;
        if (res.status === 'correct') score++;
      }
    }

    setAssessmentGrades(grades);
    setAssessmentSubmitted(true);
    onRecordQuizResult({
      chapterNumber: activeAssessmentChapter,
      title: activeAssessmentTitle,
      score,
      total: assessmentQuestions.length,
    });
  };

  // Weak Areas & Revision Queue derived lists
  const revisionExercises = useMemo(() => {
    return exercises
      .filter((ex) => studyState.exerciseProgress[ex.exerciseNumber]?.needsReview)
      .sort((a, b) => a.exerciseNumber - b.exerciseNumber);
  }, [exercises, studyState.exerciseProgress]);

  const attemptedExercises = useMemo(() => {
    return exercises
      .filter((ex) => {
        const p = studyState.exerciseProgress[ex.exerciseNumber];
        return p && p.attempts > 0;
      })
      .sort((a, b) => {
        const pa = studyState.exerciseProgress[a.exerciseNumber]?.lastAttemptedAt || '';
        const pb = studyState.exerciseProgress[b.exerciseNumber]?.lastAttemptedAt || '';
        return pb.localeCompare(pa);
      });
  }, [exercises, studyState.exerciseProgress]);

  const difficultChapters = useMemo(() => {
    return studyState.difficultChapters
      .map((num) => book.chapters.find((c) => c.number === num))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
  }, [book.chapters, studyState.difficultChapters]);

  const activeProgress = activeExercise
    ? studyState.exerciseProgress[activeExercise.exerciseNumber]
    : undefined;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Studio Header */}
      <header className="border-b border-[var(--color-hairline)] pb-6 dark:border-[var(--color-night-hairline)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
              Practice &amp; Assessments Studio · Authentic Textbook Exercises
            </p>
            <h1 className="mt-1 font-editorial text-3xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-4xl dark:text-[#EDEAE3]">
              Interactive German Workbook &amp; Assessments
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-300">
              All {stats.total} printed exercises extracted directly from Chapters 1–44 and paired with the{' '}
              {stats.keyed} official answer keys in Chapter 45—plus chapter checkpoints, unit tests, and
              targeted grammar drills with instant German feedback.
            </p>
          </div>

          <dl className="grid grid-cols-3 gap-4 rounded-lg border border-[var(--color-hairline)] bg-white px-4 py-3 font-mono text-xs tabular-nums dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <div>
              <dt className="text-[10px] uppercase text-[var(--color-ink-muted)] dark:text-slate-400">
                Completed
              </dt>
              <dd className="mt-0.5 text-base font-semibold text-[var(--color-sage)] dark:text-emerald-400">
                {stats.completed}/{stats.total}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase text-[var(--color-ink-muted)] dark:text-slate-400">
                Ch. 45 Keyed
              </dt>
              <dd className="mt-0.5 text-base font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                {stats.keyed}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase text-[var(--color-ink-muted)] dark:text-slate-400">
                Needs Review
              </dt>
              <dd className="mt-0.5 text-base font-semibold text-[var(--color-ochre)] dark:text-amber-400">
                {stats.needsReview}
              </dd>
            </div>
          </dl>
        </div>

        {/* Studio Mode Tabs */}
        <div className="mt-6 flex flex-wrap gap-1 border-b border-transparent">
          {(
            [
              { id: 'workbook', label: `All ${stats.total} Book Exercises`, icon: ClipboardCheck },
              { id: 'assessments', label: 'Chapter & Unit Tests', icon: GraduationCap },
              { id: 'drills', label: 'Targeted Skill Drills', icon: Target },
              {
                id: 'revision',
                label: `Weak Areas & Revision (${stats.needsReview + difficultChapters.length})`,
                icon: RotateCcw,
              },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id === 'workbook' || tab.id === 'revision') {
                    setActiveAssessmentTitle(null);
                  }
                }}
                className={`inline-flex items-center gap-2 rounded-md border px-3.5 py-2 text-xs font-medium transition-colors sm:text-sm ${
                  active
                    ? 'border-[var(--color-prussian)] bg-[var(--color-prussian)] text-white dark:border-[#2B649B] dark:bg-[#2B649B]'
                    : 'border-[var(--color-hairline)] bg-white text-[var(--color-ink-muted)] hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-slate-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {audioError && (
        <div className="mt-4 rounded-md border border-[var(--color-ochre)]/50 bg-amber-50/70 px-4 py-2.5 text-xs text-[var(--color-ochre)] dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300">
          {audioError}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 1: ALL 202 BOOK EXERCISES (INTERACTIVE WORKBOOK)                 */}
      {/* ==================================================================== */}
      {activeTab === 'workbook' && (
        <div className="mt-6 space-y-5">
          {/* Filter Bar */}
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--color-hairline)] bg-white p-4 md:grid-cols-12 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <div className="relative md:col-span-4">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Exercise #, topic, or German text…"
                className="w-full rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] py-2 pr-3 pl-9 text-xs text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
              />
            </div>

            <select
              aria-label="Filter by book part"
              value={unitFilter}
              onChange={(e) => {
                setUnitFilter(e.target.value);
                setChapterFilter('all');
              }}
              className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] px-2.5 py-2 text-xs text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none md:col-span-2 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
            >
              <option value="all">All Book Parts</option>
              {book.units
                .filter((u) => u.chapterStart <= 44)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.title.split('·')[0].trim()} ({u.subtitle})
                  </option>
                ))}
            </select>

            <select
              aria-label="Filter by chapter"
              value={chapterFilter}
              onChange={(e) =>
                setChapterFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] px-2.5 py-2 text-xs text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none md:col-span-2 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
            >
              <option value="all">All Chapters ({chaptersWithExercises.length})</option>
              {chaptersWithExercises.map((ch) => (
                <option key={ch.number} value={ch.number}>
                  Ch. {String(ch.number).padStart(2, '0')} — {ch.englishTitle}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by exercise type"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as ExerciseCategory | 'all')}
              className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] px-2.5 py-2 text-xs text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none md:col-span-2 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
            >
              <option value="all">All Exercise Types</option>
              {(Object.keys(CATEGORY_LABELS) as ExerciseCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by completion or key status"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as
                    | 'all'
                    | 'keyed'
                    | 'open-ended'
                    | 'needs-review'
                    | 'completed'
                    | 'unstarted'
                )
              }
              className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] px-2.5 py-2 text-xs text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none md:col-span-2 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
            >
              <option value="all">All Statuses</option>
              <option value="keyed">Has Ch. 45 Key ({stats.keyed})</option>
              <option value="open-ended">Open-Ended ({stats.total - stats.keyed})</option>
              <option value="needs-review">Needs Review ({stats.needsReview})</option>
              <option value="completed">Completed ({stats.completed})</option>
              <option value="unstarted">Not Started</option>
            </select>
          </div>

          {/* Two-Column Workbook Layout */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left Sidebar: Filtered Exercise List */}
            <aside className="lg:col-span-4">
              <div className="rounded-lg border border-[var(--color-hairline)] bg-white dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
                <div className="flex items-center justify-between border-b border-[var(--color-hairline)] px-4 py-3 dark:border-[var(--color-night-hairline)]">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                    Exercises ({filteredExercises.length})
                  </span>
                  {(searchQuery ||
                    unitFilter !== 'all' ||
                    chapterFilter !== 'all' ||
                    categoryFilter !== 'all' ||
                    statusFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setUnitFilter('all');
                        setChapterFilter('all');
                        setCategoryFilter('all');
                        setStatusFilter('all');
                      }}
                      className="font-mono text-[11px] text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
                    >
                      Reset filters
                    </button>
                  )}
                </div>

                <div className="max-h-[680px] divide-y divide-[var(--color-hairline)] overflow-y-auto dark:divide-[var(--color-night-hairline)]">
                  {filteredExercises.length === 0 ? (
                    <p className="p-5 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                      No exercises match the selected filters.
                    </p>
                  ) : (
                    filteredExercises.map((ex) => {
                      const isSelected = activeExercise?.exerciseNumber === ex.exerciseNumber;
                      const prog = studyState.exerciseProgress[ex.exerciseNumber];
                      return (
                        <button
                          key={ex.exerciseNumber}
                          type="button"
                          onClick={() => setSelectedExerciseNum(ex.exerciseNumber)}
                          className={`block w-full px-4 py-3 text-left transition-colors ${
                            isSelected
                              ? 'border-l-2 border-l-[var(--color-prussian)] bg-[var(--color-prussian)]/8 dark:border-l-[#7AB3E6] dark:bg-[#5B9BD5]/15'
                              : 'hover:bg-[var(--color-paper-subtle)] dark:hover:bg-[var(--color-night-subtle)]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                              Exercise {ex.exerciseNumber}
                              <span className="ml-2 font-normal text-[var(--color-ink-muted)] dark:text-slate-400">
                                Ch. {ex.chapterNumber}
                              </span>
                            </span>
                            <div className="flex items-center gap-1.5 font-mono text-[10px]">
                              {prog?.needsReview && (
                                <span className="text-[var(--color-ochre)] dark:text-amber-400">
                                  Review
                                </span>
                              )}
                              {prog?.completed && (
                                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-sage)] dark:text-emerald-400" />
                              )}
                              {!ex.hasAnswerKey && (
                                <span className="text-[var(--color-ink-muted)] dark:text-slate-500">
                                  Self
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                            {ex.instruction}
                          </p>
                          <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-[var(--color-ink-muted)] dark:text-slate-500">
                            <span>{CATEGORY_LABELS[ex.category]}</span>
                            <span>
                              {ex.items.length > 0 ? `${ex.items.length} items` : 'Guided response'}
                              {prog && prog.total > 0 && ex.isAutoGradable
                                ? ` · Best ${prog.bestScore}/${prog.total}`
                                : ''}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </aside>

            {/* Right Main Panel: Active Exercise Workbench */}
            <section className="lg:col-span-8">
              {activeExercise ? (
                <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
                  {/* Top Navigation & Exercise Meta */}
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-hairline)] pb-4 dark:border-[var(--color-night-hairline)]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                        <span>Chapter {activeExercise.chapterNumber}</span>
                        <span>·</span>
                        <span>{CATEGORY_LABELS[activeExercise.category]}</span>
                        <span>·</span>
                        <span
                          className={
                            activeExercise.hasAnswerKey
                              ? 'text-[var(--color-sage)] dark:text-emerald-400'
                              : 'text-[var(--color-ochre)] dark:text-amber-400'
                          }
                        >
                          {activeExercise.hasAnswerKey
                            ? 'Official Ch. 45 Key'
                            : 'Open-Ended (No Printed Key)'}
                        </span>
                      </div>
                      <h2 className="mt-1 font-editorial text-2xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                        Exercise {activeExercise.exerciseNumber}{' '}
                        <span className="text-base font-normal text-[var(--color-ink-muted)] dark:text-slate-400">
                          — {activeExercise.chapterTitle}
                        </span>
                      </h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={activeFilteredIdx <= 0}
                        onClick={() => {
                          if (activeFilteredIdx > 0) {
                            setSelectedExerciseNum(
                              filteredExercises[activeFilteredIdx - 1].exerciseNumber
                            );
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] disabled:opacity-40 dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        <span>Prev</span>
                      </button>
                      <button
                        type="button"
                        disabled={
                          activeFilteredIdx < 0 ||
                          activeFilteredIdx >= filteredExercises.length - 1
                        }
                        onClick={() => {
                          if (
                            activeFilteredIdx >= 0 &&
                            activeFilteredIdx < filteredExercises.length - 1
                          ) {
                            setSelectedExerciseNum(
                              filteredExercises[activeFilteredIdx + 1].exerciseNumber
                            );
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] disabled:opacity-40 dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
                      >
                        <span>Next</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Action Links Strip */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => onOpenLesson(activeExercise.chapterNumber)}
                        className="inline-flex items-center gap-1 font-medium text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
                      >
                        <GraduationCap className="h-3.5 w-3.5" />
                        <span>Study Ch. {activeExercise.chapterNumber} Lesson</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenChapter(activeExercise.chapterNumber)}
                        className="inline-flex items-center gap-1 font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:underline dark:text-slate-400 dark:hover:text-white"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        <span>Open in Textbook Reader</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onToggleExerciseNeedsReview(
                            activeExercise.exerciseNumber,
                            activeExercise.chapterNumber
                          )
                        }
                        className={`inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                          activeProgress?.needsReview
                            ? 'border-[var(--color-ochre)] bg-amber-50 text-[var(--color-ochre)] dark:border-amber-500 dark:bg-amber-950/30 dark:text-amber-300'
                            : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-300'
                        }`}
                      >
                        <Flag className="h-3.5 w-3.5" />
                        <span>
                          {activeProgress?.needsReview ? 'Flagged for Review' : 'Flag for Review'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Transparent Source Note (Exercise 35, Exercise 50, or Unkeyed) */}
                  {activeExercise.sourceNote && (
                    <div className="mt-4 flex items-start gap-2.5 rounded-md border border-[var(--color-ochre)]/45 bg-amber-50/70 p-3 text-xs leading-relaxed text-[var(--color-ink)] dark:border-amber-500/40 dark:bg-amber-950/25 dark:text-amber-100">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ochre)] dark:text-amber-400" />
                      <span>{activeExercise.sourceNote}</span>
                    </div>
                  )}

                  {/* Original Textbook Instruction & Example */}
                  <div className="mt-4 rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                      Original Textbook Direction
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-ink)] dark:text-[#EDEAE3]">
                      {activeExercise.instruction}
                    </p>
                    {activeExercise.example && (
                      <p className="mt-2 border-t border-[var(--color-hairline)] pt-2 font-editorial text-sm italic text-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:text-slate-300">
                        {activeExercise.example}
                      </p>
                    )}
                  </div>

                  {/* Matching Columns Reference (e.g. Exercise 41) */}
                  {activeExercise.matchingColumns && (
                    <div className="mt-4 rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper-subtle)] p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-subtle)]">
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                        Column II Options — Type the matching letter (a, b, c…) in each row below
                      </p>
                      <div className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {activeExercise.matchingColumns.rightItems.map((opt) => (
                          <div
                            key={opt.label}
                            className="rounded border border-[var(--color-hairline)] bg-white px-3 py-1.5 text-xs text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]"
                          >
                            <span className="mr-1.5 font-mono font-semibold text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                              {opt.label}.
                            </span>
                            <span>{opt.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* German Special Characters Toolbar */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper-subtle)] px-3 py-2 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-subtle)]">
                    <span className="font-mono text-[11px] text-[var(--color-ink-muted)] dark:text-slate-400">
                      German characters (click to insert into active answer box):
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      {GERMAN_CHARS.map((ch) => (
                        <button
                          key={ch}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => insertGermanChar(ch)}
                          className="h-7 min-w-[28px] rounded border border-[var(--color-hairline)] bg-white px-2 font-editorial text-sm font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] hover:text-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]"
                        >
                          {ch}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Interactive Items OR Guided Free-Response Workspace */}
                  {activeExercise.items.length > 0 ? (
                    <div className="mt-5 space-y-3.5">
                      {activeExercise.items.map((item) => {
                        const grade = itemGrades[item.id];
                        const hintOpen = Boolean(hintsShown[item.id]);
                        const playNormal = speakingKey === `${item.id}-1`;
                        const playSlow = speakingKey === `${item.id}-0.65`;
                        const answerPlayKey = `ans-${item.id}`;

                        return (
                          <div
                            key={item.id}
                            className={`rounded-md border p-4 transition-colors ${
                              grade?.status === 'correct'
                                ? 'border-[var(--color-sage)]/60 bg-[var(--color-sage)]/5 dark:border-emerald-600/60 dark:bg-emerald-950/20'
                                : grade?.status === 'almost'
                                  ? 'border-[var(--color-ochre)]/60 bg-amber-50/50 dark:border-amber-500/60 dark:bg-amber-950/20'
                                  : grade?.status === 'incorrect'
                                    ? 'border-red-300 bg-red-50/40 dark:border-red-500/50 dark:bg-red-950/20'
                                    : 'border-[var(--color-hairline)] bg-white dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]'
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                {item.cue && (
                                  <p className="mb-1 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                                    <span className="font-mono text-[10px] uppercase tracking-[0.06em]">
                                      Cue:{' '}
                                    </span>
                                    {item.cue}
                                  </p>
                                )}
                                <p className="font-editorial text-[15px] leading-relaxed text-[var(--color-ink)] dark:text-[#EDEAE3]">
                                  <span className="mr-2 font-mono text-xs font-semibold text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                                    {item.itemNumber}.
                                  </span>
                                  {item.prompt}
                                </p>
                              </div>

                              {item.spokenGerman && (
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleSpeak(item.id, item.spokenGerman!, 1)}
                                    className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium ${
                                      playNormal
                                        ? 'border-[var(--color-prussian)] bg-[var(--color-prussian)] text-white dark:bg-[#2B649B]'
                                        : 'border-[var(--color-hairline)] text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]'
                                    }`}
                                  >
                                    {playNormal ? (
                                      <Square className="h-3 w-3" />
                                    ) : (
                                      <Volume2 className="h-3 w-3" />
                                    )}
                                    <span>1.0×</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSpeak(item.id, item.spokenGerman!, 0.65)}
                                    className={`rounded border px-2 py-1 text-[11px] ${
                                      playSlow
                                        ? 'border-[var(--color-prussian)] bg-[var(--color-prussian)] text-white dark:bg-[#2B649B]'
                                        : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-slate-300'
                                    }`}
                                  >
                                    0.65×
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <input
                                ref={(el) => {
                                  inputRefs.current[item.id] = el;
                                }}
                                type="text"
                                value={responses[item.id] || ''}
                                onFocus={() => setFocusedInputKey(item.id)}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setResponses((prev) => ({ ...prev, [item.id]: v }));
                                  if (itemGrades[item.id]) {
                                    setItemGrades((prev) => {
                                      const next = { ...prev };
                                      delete next[item.id];
                                      return next;
                                    });
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && item.officialAnswer) {
                                    handleCheckSingleItem(item.id, item.officialAnswer);
                                  }
                                }}
                                placeholder={
                                  activeExercise.matchingColumns
                                    ? 'Type matching letter (e.g. d)…'
                                    : 'Type your answer…'
                                }
                                className="min-w-[200px] flex-1 rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] px-3 py-1.5 text-sm text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
                              />

                              {item.officialAnswer && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setHintsShown((prev) => ({
                                        ...prev,
                                        [item.id]: !prev[item.id],
                                      }))
                                    }
                                    className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] px-2.5 py-1.5 text-xs text-[var(--color-ink-muted)] hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-300"
                                  >
                                    <HelpCircle className="h-3.5 w-3.5" />
                                    <span>Hint</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleCheckSingleItem(item.id, item.officialAnswer!)
                                    }
                                    className="inline-flex items-center gap-1 rounded bg-[var(--color-prussian)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B]"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                    <span>Check</span>
                                  </button>
                                </>
                              )}
                            </div>

                            {hintOpen && item.officialAnswer && (
                              <p className="mt-2 font-mono text-[11px] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                                Hint: {buildHintText(item.officialAnswer)}
                              </p>
                            )}

                            {grade && (
                              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                                <div className="flex items-center gap-1.5">
                                  {grade.status === 'correct' ? (
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--color-sage)] dark:text-emerald-400" />
                                  ) : grade.status === 'almost' ? (
                                    <AlertCircle className="h-4 w-4 shrink-0 text-[var(--color-ochre)] dark:text-amber-400" />
                                  ) : (
                                    <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                                  )}
                                  <span
                                    className={
                                      grade.status === 'correct'
                                        ? 'font-medium text-[var(--color-sage)] dark:text-emerald-300'
                                        : grade.status === 'almost'
                                          ? 'font-medium text-[var(--color-ochre)] dark:text-amber-300'
                                          : 'text-red-700 dark:text-red-300'
                                    }
                                  >
                                    {grade.feedback}
                                  </span>
                                </div>

                                {item.officialAnswer && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleSpeak(
                                        answerPlayKey,
                                        item.officialAnswer!.replace(/\u2026|\.{3}/g, ' '),
                                        1
                                      )
                                    }
                                    className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
                                  >
                                    <Volume2 className="h-3 w-3" />
                                    <span>Hear Answer</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Guided Writing Workspace for Dialogue / Paragraph / Composition Exercises */
                    <div className="mt-5 space-y-3">
                      <label
                        htmlFor="freeform-exercise-box"
                        className="block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400"
                      >
                        Your Written Response (Saved Locally)
                      </label>
                      <textarea
                        id="freeform-exercise-box"
                        ref={(el) => {
                          inputRefs.current['__freeform'] = el;
                        }}
                        rows={6}
                        value={freeformDraft}
                        onFocus={() => setFocusedInputKey('__freeform')}
                        onChange={(e) => setFreeformDraft(e.target.value)}
                        placeholder="Write your German sentences, dialogue, or translation here, then compare with the Chapter 45 key (when available) or mark practised…"
                        className="w-full rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] p-3 text-sm leading-relaxed text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
                      />
                    </div>
                  )}

                  {/* Bottom Exercise Action Bar */}
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-hairline)] pt-4 dark:border-[var(--color-night-hairline)]">
                    <div className="flex flex-wrap items-center gap-2">
                      {activeExercise.isAutoGradable ? (
                        <button
                          type="button"
                          onClick={handleCheckAllExerciseItems}
                          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-prussian)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B]"
                        >
                          <ClipboardCheck className="h-4 w-4" />
                          <span>Check All &amp; Record Score</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleMarkOpenEndedPractised}
                          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-sage)] px-4 py-2 text-xs font-medium text-white hover:opacity-90 dark:bg-emerald-700"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Save &amp; Mark Practised</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={handleResetActiveExercise}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-hairline)] px-3 py-2 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Clear</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {activeExercise.hasAnswerKey && (
                        <button
                          type="button"
                          onClick={() => setShowOfficialKey((v) => !v)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-hairline)] px-3 py-2 text-xs font-medium text-[var(--color-prussian)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-[#7AB3E6]"
                        >
                          {showOfficialKey ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                          <span>
                            {showOfficialKey ? 'Hide Ch. 45 Key' : 'Show Official Ch. 45 Key'}
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setShowOriginalHtml((v) => !v)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-hairline)] px-3 py-2 text-xs font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-300"
                      >
                        {showOriginalHtml ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        <span>Original HTML</span>
                      </button>
                    </div>
                  </div>

                  {/* Graded Score Summary Banner */}
                  {lastGradedSummary && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-sage)]/50 bg-[var(--color-sage)]/10 px-4 py-3 text-xs dark:border-emerald-600/50 dark:bg-emerald-950/30">
                      <span className="font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                        {activeExercise.isAutoGradable
                          ? `Graded: ${lastGradedSummary.correct} exact${
                              lastGradedSummary.almost > 0
                                ? ` · ${lastGradedSummary.almost} almost (check umlauts/ß)`
                                : ''
                            } out of ${lastGradedSummary.total} items. Progress saved.`
                          : 'Response saved and Exercise marked as practised.'}
                      </span>
                      {activeExercise.isAutoGradable &&
                        lastGradedSummary.correct / lastGradedSummary.total < 0.8 && (
                          <span className="font-mono text-[11px] text-[var(--color-ochre)] dark:text-amber-300">
                            Added to Weak Areas &amp; Revision Queue
                          </span>
                        )}
                    </div>
                  )}

                  {/* Official Chapter 45 Answer Key Panel */}
                  {showOfficialKey && activeExercise.hasAnswerKey && (
                    <div className="mt-5 rounded-md border border-[var(--color-prussian)]/35 bg-[var(--color-paper)] p-4 dark:border-[#5B9BD5]/35 dark:bg-[var(--color-night)]">
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                        Official Textbook Answer Key · Chapter 45 (Exercise{' '}
                        {activeExercise.exerciseNumber})
                      </p>
                      <div className="mt-2.5 space-y-1.5 text-sm leading-relaxed text-[var(--color-ink)] dark:text-[#EDEAE3]">
                        {activeExercise.officialAnswerLines.map((line, i) => (
                          <p key={i}>{line}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Original Printed Textbook HTML Drawer */}
                  {showOriginalHtml && (
                    <div className="mt-5 rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]">
                      <p className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                        Unmodified Printed HTML — Exercise {activeExercise.exerciseNumber}
                      </p>
                      <div
                        className="textbook-prose max-h-[420px] overflow-y-auto text-sm"
                        dangerouslySetInnerHTML={{ __html: activeExercise.rawHtml }}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-8 text-center text-sm text-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
                  Select an exercise on the left to begin practising.
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2 & TAB 3 SHARED RUNNER (WHEN AN ASSESSMENT OR DRILL IS ACTIVE)  */}
      {/* ==================================================================== */}
      {(activeTab === 'assessments' || activeTab === 'drills') && activeAssessmentTitle && (
        <section className="mt-6 rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-hairline)] pb-4 dark:border-[var(--color-night-hairline)]">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                Graded Assessment · Grounded in Authentic Textbook Keys
              </p>
              <h2 className="mt-1 font-editorial text-2xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                {activeAssessmentTitle}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setActiveAssessmentTitle(null)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Picker</span>
            </button>
          </div>

          {/* German character insertion toolbar */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper-subtle)] px-3 py-2 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-subtle)]">
            <span className="font-mono text-[11px] text-[var(--color-ink-muted)] dark:text-slate-400">
              German characters:
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {GERMAN_CHARS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertGermanChar(ch)}
                  className="h-7 min-w-[28px] rounded border border-[var(--color-hairline)] bg-white px-2 font-editorial text-sm font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]"
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          {assessmentQuestions.length === 0 ? (
            <p className="mt-5 text-sm text-[var(--color-ink-muted)] dark:text-slate-400">
              Not enough auto-gradable items were found for this chapter. Try opening its exercises in
              the Workbook tab instead.
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              {assessmentQuestions.map((q, idx) => {
                const grade = assessmentGrades[q.id];
                return (
                  <div
                    key={q.id}
                    className={`rounded-md border p-4 ${
                      assessmentSubmitted
                        ? grade?.status === 'correct'
                          ? 'border-[var(--color-sage)]/60 bg-[var(--color-sage)]/5 dark:border-emerald-600/60 dark:bg-emerald-950/20'
                          : grade?.status === 'almost'
                            ? 'border-[var(--color-ochre)]/60 bg-amber-50/50 dark:border-amber-500/60 dark:bg-amber-950/20'
                            : 'border-red-300 bg-red-50/40 dark:border-red-500/50 dark:bg-red-950/20'
                        : 'border-[var(--color-hairline)] bg-[var(--color-paper)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                        Question {idx + 1} of {assessmentQuestions.length} · {q.sourceLabel}
                      </span>
                      {q.spokenGerman && (
                        <button
                          type="button"
                          onClick={() => handleSpeak(`aq-${q.id}`, q.spokenGerman!, 1)}
                          className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] bg-white px-2 py-0.5 text-[11px] font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]"
                        >
                          <Volume2 className="h-3 w-3" />
                          <span>Listen</span>
                        </button>
                      )}
                    </div>

                    <p className="mt-1.5 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                      {q.instruction}
                    </p>
                    {q.cue && (
                      <p className="mt-1 text-xs font-medium text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                        Cue: {q.cue}
                      </p>
                    )}
                    <p className="mt-1 font-editorial text-base font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                      {q.prompt}
                    </p>

                    {q.kind === 'choice' && q.choices ? (
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {q.choices.map((opt, optIdx) => {
                          const selected = assessmentChoices[q.id] === optIdx;
                          const isCorrectOpt = optIdx === q.correctChoiceIndex;
                          let cls =
                            'border-[var(--color-hairline)] bg-white text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]';
                          if (assessmentSubmitted) {
                            if (isCorrectOpt) {
                              cls =
                                'border-[var(--color-sage)] bg-[var(--color-sage)]/15 font-medium text-[var(--color-sage)] dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-300';
                            } else if (selected && !isCorrectOpt) {
                              cls =
                                'border-red-400 bg-red-50 text-red-700 dark:border-red-500/60 dark:bg-red-950/30 dark:text-red-300';
                            }
                          } else if (selected) {
                            cls =
                              'border-[var(--color-prussian)] bg-[var(--color-prussian)]/10 font-medium text-[var(--color-prussian)] dark:border-[#5B9BD5] dark:bg-[#5B9BD5]/20 dark:text-[#7AB3E6]';
                          }

                          return (
                            <button
                              key={optIdx}
                              type="button"
                              disabled={assessmentSubmitted}
                              onClick={() =>
                                setAssessmentChoices((prev) => ({ ...prev, [q.id]: optIdx }))
                              }
                              className={`rounded border px-3 py-2 text-left text-xs transition-colors ${cls}`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-3">
                        <input
                          ref={(el) => {
                            inputRefs.current[`assess:${q.id}`] = el;
                          }}
                          type="text"
                          disabled={assessmentSubmitted}
                          value={assessmentTyped[q.id] || ''}
                          onFocus={() => setFocusedInputKey(`assess:${q.id}`)}
                          onChange={(e) =>
                            setAssessmentTyped((prev) => ({ ...prev, [q.id]: e.target.value }))
                          }
                          placeholder="Type your German / English response…"
                          className="w-full rounded-md border border-[var(--color-hairline)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none disabled:opacity-75 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]"
                        />
                      </div>
                    )}

                    {assessmentSubmitted && grade && (
                      <p
                        className={`mt-2.5 text-xs ${
                          grade.status === 'correct'
                            ? 'font-medium text-[var(--color-sage)] dark:text-emerald-300'
                            : grade.status === 'almost'
                              ? 'font-medium text-[var(--color-ochre)] dark:text-amber-300'
                              : 'text-red-700 dark:text-red-300'
                        }`}
                      >
                        {grade.feedback}
                      </p>
                    )}
                  </div>
                );
              })}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-hairline)] pt-4 dark:border-[var(--color-night-hairline)]">
                {!assessmentSubmitted ? (
                  <button
                    type="button"
                    onClick={handleSubmitAssessment}
                    className="inline-flex items-center gap-2 rounded-md bg-[var(--color-prussian)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B]"
                  >
                    <ClipboardCheck className="h-4 w-4" />
                    <span>Grade Assessment &amp; Save Result</span>
                  </button>
                ) : (
                  <div className="flex w-full flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-editorial text-lg font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                        Final Score:{' '}
                        {
                          Object.values(assessmentGrades).filter((g) => g.status === 'correct')
                            .length
                        }{' '}
                        / {assessmentQuestions.length} (
                        {Math.round(
                          (Object.values(assessmentGrades).filter((g) => g.status === 'correct')
                            .length /
                            assessmentQuestions.length) *
                            100
                        )}
                        %)
                      </p>
                      <p className="text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                        Score saved to your Dashboard &amp; Study History.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {assessmentSourceConfig && (
                        <button
                          type="button"
                          onClick={() =>
                            startAssessment(assessmentSourceConfig, assessmentSeed + 1)
                          }
                          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-prussian)] px-4 py-2 text-xs font-medium text-white dark:bg-[#2B649B]"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>New Question Mix</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setActiveAssessmentTitle(null)}
                        className="rounded-md border border-[var(--color-hairline)] px-3.5 py-2 text-xs font-medium text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
                      >
                        Choose Another Test
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: CHAPTER & UNIT CHECKPOINT ASSESSMENTS PICKER                  */}
      {/* ==================================================================== */}
      {activeTab === 'assessments' && !activeAssessmentTitle && (
        <div className="mt-6 space-y-8">
          {/* Unit Checkpoints (Parts I–VI aligned to Review Chapters) */}
          <section>
            <div className="mb-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                Aligned to the Textbook’s 6 Built-in Review Chapters
              </p>
              <h2 className="mt-1 font-editorial text-2xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                Unit Checkpoint Assessments (12 Questions)
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {book.units
                .filter((u) => u.chapterStart <= 44)
                .map((unit) => {
                  const unitKeyedCount = exercises.filter(
                    (e) => e.unitId === unit.id && e.isAutoGradable
                  ).length;
                  return (
                    <div
                      key={unit.id}
                      className="flex flex-col justify-between rounded-lg border border-[var(--color-hairline)] bg-white p-5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                          <span className="font-semibold uppercase text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                            {unit.subtitle}
                          </span>
                          <span className="text-[var(--color-ink-muted)] dark:text-slate-400">
                            {unitKeyedCount} keyed drills
                          </span>
                        </div>
                        <h3 className="mt-2 font-editorial text-lg font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                          {unit.title}
                        </h3>
                        <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
                          {unit.description}
                        </p>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-[var(--color-hairline)] pt-3 dark:border-[var(--color-night-hairline)]">
                        <span className="font-mono text-[11px] text-[var(--color-ink-muted)] dark:text-slate-400">
                          {unit.reviewChapterNumber
                            ? `Review Ch. ${unit.reviewChapterNumber}`
                            : 'Final Mastery'}
                        </span>
                        <button
                          type="button"
                          onClick={() => startAssessment({ kind: 'unit', unitId: unit.id }, 1)}
                          className="inline-flex items-center gap-1 rounded-md bg-[var(--color-prussian)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B]"
                        >
                          <span>Start Unit Test</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>

          {/* Per-Chapter Quick Assessment Launcher */}
          <section className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                  Single-Chapter Mastery Check (Up to 10 Questions)
                </p>
                <h2 className="mt-1 font-editorial text-2xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  Chapter Assessment Builder
                </h2>
                <p className="mt-1 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                  Combines authentic keyed exercise items from the chosen chapter with its textbook
                  glossary vocabulary.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  aria-label="Select chapter for assessment"
                  value={selectedAssessmentChapter}
                  onChange={(e) => setSelectedAssessmentChapter(Number(e.target.value))}
                  className="max-w-xs rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] px-3 py-2 text-xs font-medium text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
                >
                  {chaptersWithExercises.map((ch) => (
                    <option key={ch.number} value={ch.number}>
                      Ch. {String(ch.number).padStart(2, '0')} — {ch.englishTitle} (
                      {ch.answerKeyedExercises.length} keyed ex.)
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    startAssessment(
                      { kind: 'chapter', chapterNumber: selectedAssessmentChapter },
                      1
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-prussian)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B]"
                >
                  <GraduationCap className="h-4 w-4" />
                  <span>Start Ch. {selectedAssessmentChapter} Test</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: TARGETED SKILL DRILLS PICKER                                  */}
      {/* ==================================================================== */}
      {activeTab === 'drills' && !activeAssessmentTitle && (
        <section className="mt-6">
          <div className="mb-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
              Focused 10-Question Sets Built From Chapter 45 Keyed Exercises
            </p>
            <h2 className="mt-1 font-editorial text-2xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
              Targeted German Skill Drills
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {SKILL_DRILLS.map((drill) => {
              const poolCount = exercises.filter(
                (e) => e.isAutoGradable && e.skillTags.includes(drill.id)
              ).length;
              return (
                <div
                  key={drill.id}
                  className="flex flex-col justify-between rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]"
                >
                  <div>
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="font-semibold uppercase text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                        {drill.subtitle}
                      </span>
                    </div>
                    <h3 className="mt-2 font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                      {drill.title}
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-300">
                      {drill.description}
                    </p>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-[var(--color-hairline)] pt-4 dark:border-[var(--color-night-hairline)]">
                    <span className="font-mono text-[11px] text-[var(--color-ink-muted)] dark:text-slate-400">
                      Pool: {poolCount} exercises
                    </span>
                    <button
                      type="button"
                      onClick={() => startAssessment({ kind: 'drill', skill: drill.id }, 1)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-prussian)] px-3.5 py-2 text-xs font-medium text-white hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B]"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Start 10-Item Drill</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: WEAK AREAS & REVISION QUEUE                                   */}
      {/* ==================================================================== */}
      {activeTab === 'revision' && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Exercises Needing Review */}
          <div className="space-y-6 lg:col-span-7">
            <section className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--color-hairline)] pb-3 dark:border-[var(--color-night-hairline)]">
                <div className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-[var(--color-ochre)] dark:text-amber-400" />
                  <h2 className="font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                    Exercises Flagged or Below 80% ({revisionExercises.length})
                  </h2>
                </div>
              </div>

              {revisionExercises.length === 0 ? (
                <p className="mt-4 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
                  No exercises in your revision queue yet. Any exercise where you score below 80%—or
                  manually click <strong>Flag for Review</strong>—will appear here for focused
                  re-practice.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-[var(--color-hairline)] dark:divide-[var(--color-night-hairline)]">
                  {revisionExercises.map((ex) => {
                    const prog = studyState.exerciseProgress[ex.exerciseNumber];
                    const pct =
                      prog && prog.total > 0 ? Math.round((prog.bestScore / prog.total) * 100) : null;
                    return (
                      <li
                        key={ex.exerciseNumber}
                        className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-1 last:pb-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                            Exercise {ex.exerciseNumber}{' '}
                            <span className="font-mono text-xs font-normal text-[var(--color-ink-muted)] dark:text-slate-400">
                              · Ch. {ex.chapterNumber} ({CATEGORY_LABELS[ex.category]})
                            </span>
                          </p>
                          <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                            {ex.instruction}
                          </p>
                          {pct !== null && (
                            <p className="mt-1 font-mono text-[11px] text-[var(--color-ochre)] dark:text-amber-400">
                              Best score: {prog.bestScore}/{prog.total} ({pct}%) · {prog.attempts}{' '}
                              attempt{prog.attempts === 1 ? '' : 's'}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedExerciseNum(ex.exerciseNumber);
                              setActiveTab('workbook');
                            }}
                            className="rounded-md bg-[var(--color-prussian)] px-3 py-1.5 text-xs font-medium text-white dark:bg-[#2B649B]"
                          >
                            Retry Exercise
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onToggleExerciseNeedsReview(ex.exerciseNumber, ex.chapterNumber)
                            }
                            className="rounded-md border border-[var(--color-hairline)] px-2.5 py-1.5 text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-300"
                          >
                            Clear
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Recently Attempted Exercises */}
            <section className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
              <div className="flex items-center gap-2 border-b border-[var(--color-hairline)] pb-3 dark:border-[var(--color-night-hairline)]">
                <Layers className="h-4 w-4 text-[var(--color-prussian)] dark:text-[#7AB3E6]" />
                <h2 className="font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  Recent Exercise Attempts ({attemptedExercises.length})
                </h2>
              </div>

              {attemptedExercises.length === 0 ? (
                <p className="mt-4 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                  Your attempted workbook exercises and best scores will be tracked here.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-[var(--color-hairline)] dark:divide-[var(--color-night-hairline)]">
                  {attemptedExercises.slice(0, 10).map((ex) => {
                    const prog = studyState.exerciseProgress[ex.exerciseNumber];
                    const pct =
                      prog && prog.total > 0 ? Math.round((prog.bestScore / prog.total) * 100) : 100;
                    return (
                      <li
                        key={ex.exerciseNumber}
                        className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-1 last:pb-0 text-xs"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedExerciseNum(ex.exerciseNumber);
                            setActiveTab('workbook');
                          }}
                          className="text-left font-medium text-[var(--color-ink)] hover:text-[var(--color-prussian)] dark:text-[#EDEAE3] dark:hover:text-[#7AB3E6]"
                        >
                          Exercise {ex.exerciseNumber} · Ch. {ex.chapterNumber} ({ex.chapterTitle})
                        </button>
                        <span className="font-mono tabular-nums text-[var(--color-sage)] dark:text-emerald-400">
                          {ex.isAutoGradable ? `${prog.bestScore}/${prog.total} (${pct}%)` : 'Practised'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* Right: Difficult Chapters + Recent Quiz History */}
          <div className="space-y-6 lg:col-span-5">
            <section className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
              <div className="flex items-center gap-2 border-b border-[var(--color-hairline)] pb-3 dark:border-[var(--color-night-hairline)]">
                <Flag className="h-4 w-4 text-[var(--color-ochre)] dark:text-amber-400" />
                <h2 className="font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  Flagged Difficult Chapters ({difficultChapters.length})
                </h2>
              </div>

              {difficultChapters.length === 0 ? (
                <p className="mt-4 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                  No chapters flagged difficult. Flag any challenging grammar chapter from the Lesson
                  Studio or Learning Path to link its exercises here.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-[var(--color-hairline)] dark:divide-[var(--color-night-hairline)]">
                  {difficultChapters.map((ch) => (
                    <li key={ch.number} className="flex items-center justify-between gap-2 py-3 first:pt-1">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                          Ch. {ch.number}: {ch.englishTitle}
                        </p>
                        <p className="font-mono text-[11px] text-[var(--color-ink-muted)] dark:text-slate-400">
                          {ch.exercises.length} exercises ({ch.answerKeyedExercises.length} keyed)
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenLesson(ch.number)}
                          className="text-xs font-medium text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
                        >
                          Lesson
                        </button>
                        {ch.exercises.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setChapterFilter(ch.number);
                              setSelectedExerciseNum(ch.exercises[0]);
                              setActiveTab('workbook');
                            }}
                            className="rounded border border-[var(--color-hairline)] px-2 py-1 text-xs font-medium text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
                          >
                            Practice
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
              <div className="flex items-center gap-2 border-b border-[var(--color-hairline)] pb-3 dark:border-[var(--color-night-hairline)]">
                <GraduationCap className="h-4 w-4 text-[var(--color-sage)] dark:text-emerald-400" />
                <h2 className="font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  Recent Assessment Scores ({studyState.quizResults.length})
                </h2>
              </div>

              {studyState.quizResults.length === 0 ? (
                <p className="mt-4 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                  Complete any workbook exercise, chapter assessment, or skill drill to see your
                  score history here.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-[var(--color-hairline)] dark:divide-[var(--color-night-hairline)]">
                  {studyState.quizResults.slice(0, 8).map((q) => {
                    const pct = q.total > 0 ? Math.round((q.score / q.total) * 100) : 0;
                    return (
                      <li key={q.id} className="flex items-center justify-between gap-2 py-2.5 first:pt-1 text-xs">
                        <span className="truncate font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                          {q.title}
                        </span>
                        <span
                          className={`shrink-0 font-mono font-semibold tabular-nums ${
                            pct >= 80
                              ? 'text-[var(--color-sage)] dark:text-emerald-400'
                              : 'text-[var(--color-ochre)] dark:text-amber-400'
                          }`}
                        >
                          {q.score}/{q.total} ({pct}%)
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
