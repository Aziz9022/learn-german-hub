import {
  ArrowLeft,
  ArrowRight,
  BookmarkCheck,
  BookmarkPlus,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  EyeOff,
  Flag,
  GraduationCap,
  Layers,
  MessageCircle,
  MessageSquarePlus,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { playGermanAudio, stopGermanAudio } from '../services/germanAudio';
import {
  analyzeGermanWord,
  normalizeGermanLookup,
  type WordAnalysisResult,
} from '../services/germanLinguistics';
import {
  extractStructuredLesson,
  type BookDialogue,
  type ChapterVocabPair,
} from '../services/lessonDialogueExtractor';
import type {
  BookChapter,
  ParsedBook,
  SavedVocabItem,
  UserStudyState,
} from '../types/book';

interface LessonStudioViewProps {
  book: ParsedBook;
  chapter: BookChapter;
  studyState: UserStudyState;
  chapterDialogues: BookDialogue[];
  onSelectChapter: (chapterNumber: number) => void;
  onOpenInReader: (chapterNumber: number) => void;
  onOpenDialogue: (dialogueId: string) => void;
  onOpenPracticeChapter?: (chapterNumber: number) => void;
  onToggleCompleted: () => void;
  onToggleDifficult: () => void;
  onToggleSavedVocab: (item: Omit<SavedVocabItem, 'id' | 'savedAt'>) => void;
  onAddAnnotation: (chapterNumber: number, selectedText: string, note: string) => void;
  onDeleteAnnotation: (id: string) => void;
  onRecordQuizResult: (result: {
    chapterNumber: number;
    title: string;
    score: number;
    total: number;
  }) => void;
}

function getArticleLabel(article?: string): { text: string; classes: string } | null {
  if (article === 'der') {
    return {
      text: 'Masc. · der',
      classes: 'border-[#1E4D7B]/40 bg-[#1E4D7B]/10 text-[#1E4D7B] dark:border-[#5B9BD5]/40 dark:bg-[#5B9BD5]/15 dark:text-[#7AB3E6]',
    };
  }
  if (article === 'die') {
    return {
      text: 'Fem. · die',
      classes: 'border-[#8C2D2D]/40 bg-[#8C2D2D]/10 text-[#8C2D2D] dark:border-rose-400/40 dark:bg-rose-950/40 dark:text-rose-300',
    };
  }
  if (article === 'das') {
    return {
      text: 'Neut. · das',
      classes: 'border-[#2E6B4E]/40 bg-[#2E6B4E]/10 text-[#2E6B4E] dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-300',
    };
  }
  if (article === 'die (pl.)') {
    return {
      text: 'Pl. · die',
      classes: 'border-[var(--color-ochre)]/40 bg-amber-50 text-[var(--color-ochre)] dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300',
    };
  }
  return null;
}

interface LessonQuizQuestion {
  id: string;
  prompt: string;
  germanCue?: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

function deterministicShuffle<T>(arr: T[], seed: number): T[] {
  const copy = [...arr];
  let s = seed || 1;
  for (let i = copy.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = s % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function LessonStudioView({
  book,
  chapter,
  studyState,
  chapterDialogues,
  onSelectChapter,
  onOpenInReader,
  onOpenDialogue,
  onOpenPracticeChapter,
  onToggleCompleted,
  onToggleDifficult,
  onToggleSavedVocab,
  onAddAnnotation,
  onDeleteAnnotation,
  onRecordQuizResult,
}: LessonStudioViewProps) {
  const lesson = useMemo(() => extractStructuredLesson(chapter, book), [chapter, book]);

  const [hideEnglish, setHideEnglish] = useState(false);
  const [showOriginalHtml, setShowOriginalHtml] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [inspectedWord, setInspectedWord] = useState<WordAnalysisResult | null>(null);

  // Interactive Sentence Builder state
  const [builderIdx, setBuilderIdx] = useState(0);
  const [selectedTileIndices, setSelectedTileIndices] = useState<number[]>([]);
  const [builderStatus, setBuilderStatus] = useState<'idle' | 'correct' | 'wrong'>('idle');

  // Chapter Knowledge Assessment state
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // Personal Lesson Notes state
  const [noteDraft, setNoteDraft] = useState('');

  // Reset per-chapter transient UI when switching chapters
  useEffect(() => {
    stopGermanAudio();
    setSpeakingId(null);
    setAudioError(null);
    setInspectedWord(null);
    setShowOriginalHtml(false);
    setBuilderIdx(0);
    setSelectedTileIndices([]);
    setBuilderStatus('idle');
    setQuizAnswers({});
    setQuizSubmitted(false);
  }, [chapter.number]);

  useEffect(() => {
    return () => stopGermanAudio();
  }, []);

  const isCompleted = studyState.completedChapters.includes(chapter.number);
  const isDifficult = studyState.difficultChapters.includes(chapter.number);

  const savedNormalizedSet = useMemo(
    () => new Set(studyState.savedVocab.map((v) => normalizeGermanLookup(v.german))),
    [studyState.savedVocab]
  );

  const instructionalChapters = useMemo(
    () => book.chapters.filter((c) => c.number <= 44),
    [book.chapters]
  );
  const prevChapter = chapter.number > 1 ? chapter.number - 1 : null;
  const nextChapter = chapter.number < 44 ? chapter.number + 1 : null;

  const chapterNotes = useMemo(
    () => studyState.annotations.filter((a) => a.chapterNumber === chapter.number),
    [studyState.annotations, chapter.number]
  );

  const handlePlay = (id: string, text: string, rate: 1 | 0.65) => {
    setAudioError(null);
    const fullKey = `${id}-${rate}`;
    if (speakingId === fullKey) {
      stopGermanAudio();
      setSpeakingId(null);
      return;
    }
    void playGermanAudio(text, rate, {
      onStart: () => setSpeakingId(fullKey),
      onEnd: () => setSpeakingId(null),
      onError: (msg) => setAudioError(msg),
      onNoGermanVoiceWarning: (msg) => setAudioError(msg),
    });
  };

  const handleInspectToken = (rawToken: string) => {
    const cleaned = rawToken.replace(/^[„"‚'—–(\[]+|[""'.,!?;:)\]]+$/g, '').trim();
    if (!cleaned || cleaned.length < 2 || /^\d+$/.test(cleaned)) return;
    setInspectedWord(analyzeGermanWord(cleaned, book, chapter));
  };

  const handleSaveVocabPair = (item: ChapterVocabPair) => {
    onToggleSavedVocab({
      german: item.german,
      english: item.english,
      article: item.article,
      plural: item.plural,
      pronunciation: item.pronunciation,
      chapterNumber: chapter.number,
    });
  };

  // Sentence Builder items drawn from authentic chapter sentences
  const builderPool = useMemo(() => {
    return lesson.bilingualPassage
      .map((line) => {
        const firstDe = line.german.split(/(?<=[.!?])\s+/)[0]?.trim() || line.german;
        const firstEn = line.english.split(/(?<=[.!?])\s+/)[0]?.trim() || line.english;
        const words = firstDe.replace(/^[—–-]\s*/, '').split(/\s+/).filter(Boolean);
        return { id: line.id, german: firstDe.replace(/^[—–-]\s*/, ''), english: firstEn, words };
      })
      .filter((item) => item.words.length >= 4 && item.words.length <= 10)
      .slice(0, 5);
  }, [lesson.bilingualPassage]);

  const activeBuilder = builderPool[builderIdx % Math.max(1, builderPool.length)] || null;
  const scrambledTiles = useMemo(() => {
    if (!activeBuilder) return [];
    const indexed = activeBuilder.words.map((word, idx) => ({ word, origIdx: idx }));
    const shuffled = deterministicShuffle(indexed, chapter.number * 31 + builderIdx * 7 + 3);
    // Avoid accidentally leaving in exact order
    if (shuffled.every((x, i) => x.origIdx === i) && shuffled.length > 1) {
      [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
    }
    return shuffled;
  }, [activeBuilder, chapter.number, builderIdx]);

  const handleCheckBuilder = () => {
    if (!activeBuilder) return;
    const built = selectedTileIndices.map((idx) => scrambledTiles[idx]?.word || '').join(' ');
    if (built === activeBuilder.words.join(' ')) {
      setBuilderStatus('correct');
      handlePlay(`builder-ok-${activeBuilder.id}`, activeBuilder.german, 1);
    } else {
      setBuilderStatus('wrong');
    }
  };

  // Generate 5 grounded Chapter Knowledge Check questions from this chapter's real vocab & bilingual sentences
  const quizQuestions: LessonQuizQuestion[] = useMemo(() => {
    const questions: LessonQuizQuestion[] = [];
    const vocabPool = lesson.wortschatz.length >= 4 ? lesson.wortschatz : [];
    const distractorMeanings = [
      ...book.lexicon.slice(0, 60).map((e) => e.english),
    ];

    // Up to 3 vocabulary meaning questions from this chapter
    for (let i = 0; i < Math.min(3, vocabPool.length); i++) {
      const target = vocabPool[i];
      const wrongPool = [
        ...vocabPool.filter((w) => w.id !== target.id).map((w) => w.english),
        ...distractorMeanings,
      ].filter((m) => m.toLowerCase() !== target.english.toLowerCase());
      const wrongs = Array.from(new Set(wrongPool)).slice(i * 2, i * 2 + 3);
      if (wrongs.length < 3) continue;
      const options = deterministicShuffle([target.english, ...wrongs], chapter.number * 17 + i);
      questions.push({
        id: `q-voc-${i}`,
        prompt: 'What does this Chapter vocabulary word mean in English?',
        germanCue: target.article ? `${target.article} ${target.german}` : target.german,
        options,
        correctIndex: options.indexOf(target.english),
        explanation: `${target.article ? `${target.article} ` : ''}${target.german} means "${target.english}".`,
      });
    }

    // Up to 2 bilingual sentence comprehension questions from this chapter
    const sentencePool = lesson.bilingualPassage.filter(
      (l) => l.german.length >= 16 && l.german.length <= 130 && l.english.length >= 12
    );
    for (let i = 0; i < Math.min(2, sentencePool.length); i++) {
      const target = sentencePool[i];
      const otherEnglish = sentencePool
        .filter((l) => l.id !== target.id)
        .map((l) => l.english.split(/(?<=[.!?])\s+/)[0] || l.english);
      const targetShortEn = target.english.split(/(?<=[.!?])\s+/)[0] || target.english;
      const wrongs = Array.from(new Set(otherEnglish))
        .filter((e) => e !== targetShortEn)
        .slice(0, 3);
      if (wrongs.length < 3) continue;
      const options = deterministicShuffle([targetShortEn, ...wrongs], chapter.number * 29 + i + 5);
      questions.push({
        id: `q-sent-${i}`,
        prompt: 'Choose the authentic English meaning of this textbook sentence:',
        germanCue: target.german.split(/(?<=[.!?])\s+/)[0] || target.german,
        options,
        correctIndex: options.indexOf(targetShortEn),
        explanation: `Official textbook translation: "${targetShortEn}"`,
      });
    }

    return questions;
  }, [book.lexicon, chapter.number, lesson.bilingualPassage, lesson.wortschatz]);

  const quizScore = useMemo(() => {
    return quizQuestions.reduce(
      (sum, q) => sum + (quizAnswers[q.id] === q.correctIndex ? 1 : 0),
      0
    );
  }, [quizAnswers, quizQuestions]);

  const handleSubmitQuiz = () => {
    setQuizSubmitted(true);
    if (quizQuestions.length > 0) {
      onRecordQuizResult({
        chapterNumber: chapter.number,
        title: `Ch. ${chapter.number} Lesson Check — ${chapter.englishTitle}`,
        score: quizScore,
        total: quizQuestions.length,
      });
    }
  };

  const handleSaveLessonNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteDraft.trim()) return;
    onAddAnnotation(chapter.number, `Lesson ${chapter.number}: ${chapter.englishTitle}`, noteDraft.trim());
    setNoteDraft('');
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Chapter Picker & Lesson Navigation Bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-hairline)] bg-white px-4 py-3 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={!prevChapter}
            onClick={() => prevChapter && onSelectChapter(prevChapter)}
            className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] disabled:opacity-40 dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Prev</span>
          </button>

          <select
            aria-label="Choose textbook lesson chapter"
            value={chapter.number <= 44 ? chapter.number : 1}
            onChange={(e) => onSelectChapter(Number(e.target.value))}
            className="max-w-[300px] truncate rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none sm:max-w-md dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
          >
            {book.units
              .filter((u) => u.chapterStart <= 44)
              .map((unit) => (
                <optgroup key={unit.id} label={`${unit.title} (${unit.subtitle})`}>
                  {instructionalChapters
                    .filter((c) => c.unitId === unit.id)
                    .map((c) => (
                      <option key={c.number} value={c.number}>
                        Ch. {String(c.number).padStart(2, '0')} — {c.displayTitle}
                        {studyState.completedChapters.includes(c.number) ? ' ✓' : ''}
                      </option>
                    ))}
                </optgroup>
              ))}
          </select>

          <button
            type="button"
            disabled={!nextChapter}
            onClick={() => nextChapter && onSelectChapter(nextChapter)}
            className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] disabled:opacity-40 dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
          >
            <span>Next</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenInReader(chapter.number)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Open Full Textbook</span>
          </button>

          <button
            type="button"
            onClick={onToggleDifficult}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              isDifficult
                ? 'border-[var(--color-ochre)] bg-amber-50 text-[var(--color-ochre)] dark:border-amber-500 dark:bg-amber-950/30 dark:text-amber-300'
                : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-300'
            }`}
          >
            <Flag className="h-3.5 w-3.5" />
            <span>{isDifficult ? 'Flagged Difficult' : 'Flag Difficult'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleCompleted}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              isCompleted
                ? 'bg-[var(--color-sage)] text-white dark:bg-emerald-700'
                : 'bg-[var(--color-prussian)] text-white hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B]'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{isCompleted ? 'Completed' : 'Mark Complete'}</span>
          </button>
        </div>
      </div>

      {/* Lesson Monograph Header: Objectives & Prerequisites */}
      <header className="border-b border-[var(--color-hairline)] pb-7 dark:border-[var(--color-night-hairline)]">
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
          <span>German Lesson Studio · Chapter {chapter.number}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1 text-[var(--color-ink-muted)] dark:text-slate-400">
            <Clock className="h-3 w-3" />~{chapter.estimatedMinutes} min
          </span>
          <span>·</span>
          <span className="text-[var(--color-ink-muted)] dark:text-slate-400">
            {chapter.exercises.length} textbook exercises
          </span>
        </div>

        <h1 className="mt-2 font-editorial text-3xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-4xl dark:text-[#EDEAE3]">
          {chapter.germanTitle ? (
            <>
              <span>{chapter.germanTitle}</span>
              <span className="mt-1 block text-xl font-normal text-[var(--color-ink-muted)] dark:text-slate-400">
                {chapter.englishTitle}
              </span>
            </>
          ) : (
            chapter.englishTitle
          )}
        </h1>

        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-300">
          {chapter.summary}
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-4 md:col-span-8 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
              1. Learning Objectives
            </p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[var(--color-ink)] dark:text-slate-200">
              {chapter.learningObjectives.map((obj, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-prussian)] dark:bg-[#7AB3E6]" />
                  <span>{obj}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-4 md:col-span-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
              2. Prerequisites &amp; Topics
            </p>
            <p className="mt-2 text-xs text-[var(--color-ink)] dark:text-slate-200">
              <strong className="font-semibold">Before this lesson:</strong>{' '}
              {chapter.prerequisites.join(' · ')}
            </p>
            {chapter.tocTopics.length > 0 && (
              <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
                <strong className="text-[var(--color-ink)] dark:text-slate-200">TOC Topics:</strong>{' '}
                {chapter.tocTopics.join(' · ')}
              </p>
            )}
          </div>
        </div>
      </header>

      {audioError && (
        <div className="mt-5 rounded-md border border-[var(--color-ochre)]/50 bg-amber-50/70 px-4 py-2.5 text-xs text-[var(--color-ochre)] dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300">
          {audioError}
        </div>
      )}

      {/* Main Structured Lesson Flow */}
      <div className="mt-8 space-y-8">
        {/* SECTION A: ORIGINAL TEXTBOOK CONTENT & BILINGUAL PASSAGE */}
        <section className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-hairline)] pb-4 dark:border-[var(--color-night-hairline)]">
            <div>
              <span className="inline-block border-l-2 border-[var(--color-ink)] pl-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)] dark:border-[#EDEAE3] dark:text-[#EDEAE3]">
                Original Textbook Material · Arnold Leitner
              </span>
              <h2 className="mt-1.5 font-editorial text-2xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                Bilingual Textbook Passage &amp; Audio
              </h2>
              <p className="mt-1 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                Click any German word below to inspect its meaning, gender article, and pronunciation, or
                play native German audio at normal (1.0×) or beginner slow (0.65×) speed.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setHideEnglish((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
              >
                {hideEnglish ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                <span>{hideEnglish ? 'Show English' : 'Hide English'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowOriginalHtml((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--color-prussian)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-[#7AB3E6]"
              >
                {showOriginalHtml ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                <span>{showOriginalHtml ? 'Hide Full Original HTML' : 'View Full Original HTML'}</span>
              </button>
            </div>
          </div>

          {/* Inline Word Inspector Drawer */}
          {inspectedWord && (
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4 rounded-md border border-[var(--color-prussian)]/40 bg-[var(--color-paper)] p-4 dark:border-[#5B9BD5]/40 dark:bg-[var(--color-night)]">
              <div className="space-y-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                  Word Lookup · {inspectedWord.partOfSpeech} · {inspectedWord.pronunciation}
                </p>
                <p className="font-editorial text-lg font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  {inspectedWord.article ? `${inspectedWord.article} ` : ''}
                  {inspectedWord.lemma}
                  {inspectedWord.plural ? (
                    <span className="ml-2 font-mono text-xs font-normal text-[var(--color-ink-muted)] dark:text-slate-400">
                      ({inspectedWord.plural})
                    </span>
                  ) : null}
                </p>
                <p className="text-xs font-medium text-[var(--color-ink)] dark:text-slate-200">
                  {inspectedWord.english}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handlePlay(
                      'inspect-word',
                      inspectedWord.article ? `${inspectedWord.article} ${inspectedWord.lemma}` : inspectedWord.query,
                      1
                    )
                  }
                  className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  <span>Listen</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onToggleSavedVocab({
                      german: inspectedWord.lemma,
                      english: inspectedWord.english,
                      article: inspectedWord.article,
                      plural: inspectedWord.plural,
                      partOfSpeech: inspectedWord.partOfSpeech,
                      pronunciation: inspectedWord.pronunciation,
                      chapterNumber: chapter.number,
                    })
                  }
                  className="inline-flex items-center gap-1 rounded bg-[var(--color-prussian)] px-2.5 py-1 text-xs font-medium text-white dark:bg-[#2B649B]"
                >
                  {savedNormalizedSet.has(normalizeGermanLookup(inspectedWord.lemma)) ? (
                    <>
                      <BookmarkCheck className="h-3.5 w-3.5" />
                      <span>Saved</span>
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="h-3.5 w-3.5" />
                      <span>Save Word</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  aria-label="Close word inspector"
                  onClick={() => setInspectedWord(null)}
                  className="rounded p-1 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:text-slate-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {lesson.bilingualPassage.length > 0 ? (
            <div className="mt-4 divide-y divide-[var(--color-hairline)] dark:divide-[var(--color-night-hairline)]">
              {lesson.bilingualPassage.map((line) => {
                const isPlayingNormal = speakingId === `${line.id}-1`;
                const isPlayingSlow = speakingId === `${line.id}-0.65`;
                return (
                  <div
                    key={line.id}
                    className="grid grid-cols-1 gap-3 py-3.5 first:pt-1 md:grid-cols-12 md:items-start"
                  >
                    <div className="md:col-span-6">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 w-6 shrink-0 font-mono text-[11px] tabular-nums text-[var(--color-ink-muted)] dark:text-slate-500">
                          {String(line.index).padStart(2, '0')}
                        </span>
                        <div className="min-w-0 flex-1">
                          {line.speaker && (
                            <span className="mr-1.5 font-mono text-xs font-semibold text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                              {line.speaker}:
                            </span>
                          )}
                          <p className="inline font-editorial text-[16px] leading-relaxed text-[var(--color-ink)] dark:text-[#EDEAE3]">
                            {line.german.split(/(\s+)/).map((part, pIdx) =>
                              /^\s+$/.test(part) ? (
                                <span key={pIdx}>{part}</span>
                              ) : (
                                <button
                                  key={pIdx}
                                  type="button"
                                  onClick={() => handleInspectToken(part)}
                                  className="rounded-xs text-left transition-colors hover:bg-[var(--color-prussian)]/12 hover:text-[var(--color-prussian)] dark:hover:bg-[#5B9BD5]/20 dark:hover:text-[#7AB3E6]"
                                >
                                  {part}
                                </button>
                              )
                            )}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pl-8 md:col-span-4 md:pl-0">
                      {hideEnglish ? (
                        <p className="text-xs italic text-[var(--color-ink-muted)] dark:text-slate-500">
                          English hidden — try translating from the German first.
                        </p>
                      ) : (
                        <p className="text-sm leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-300">
                          {line.english}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 pl-8 md:col-span-2 md:justify-end md:pl-0">
                      <button
                        type="button"
                        onClick={() => handlePlay(line.id, line.german, 1)}
                        className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
                          isPlayingNormal
                            ? 'border-[var(--color-prussian)] bg-[var(--color-prussian)] text-white dark:bg-[#2B649B]'
                            : 'border-[var(--color-hairline)] text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]'
                        }`}
                      >
                        {isPlayingNormal ? <Square className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                        <span>1.0×</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePlay(line.id, line.german, 0.65)}
                        className={`rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
                          isPlayingSlow
                            ? 'border-[var(--color-prussian)] bg-[var(--color-prussian)] text-white dark:bg-[#2B649B]'
                            : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:border-[var(--color-prussian)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-300'
                        }`}
                      >
                        0.65×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-md border border-dashed border-[var(--color-hairline)] p-4 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:text-slate-400">
              This chapter is structured primarily as review tables, exercises, or dialogues rather than a
              single opening bilingual narrative. Toggle <strong>View Full Original HTML</strong> above or
              open the chapter in the Full Textbook Reader to inspect all original tables and drills.
            </div>
          )}

          {/* Expandable Complete Original Textbook HTML */}
          {showOriginalHtml && (
            <div className="mt-6 border-t border-[var(--color-hairline)] pt-5 dark:border-[var(--color-night-hairline)]">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                Complete Unmodified Chapter {chapter.number} Textbook Content
              </p>
              <div
                className="textbook-prose max-h-[560px] overflow-y-auto rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] p-5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]"
                dangerouslySetInnerHTML={{ __html: chapter.sanitizedHtml }}
              />
            </div>
          )}
        </section>

        {/* SECTION B: SUPPLEMENTARY SIMPLE-ENGLISH GUIDE & TERMINOLOGY */}
        <section className="rounded-lg border border-[var(--color-prussian)]/30 bg-[var(--color-paper-subtle)] p-6 dark:border-[#5B9BD5]/30 dark:bg-[var(--color-night-subtle)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="inline-flex items-center gap-1.5 border-l-2 border-[var(--color-prussian)] pl-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-prussian)] dark:border-[#7AB3E6] dark:text-[#7AB3E6]">
                <Sparkles className="h-3 w-3" />
                Supplementary Beginner Study Guide (Not Part of Original Printed Book)
              </span>
              <h2 className="mt-1.5 font-editorial text-2xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                Explanation in Simple English &amp; Grammar Terms
              </h2>
            </div>
          </div>

          <p className="mt-3 max-w-4xl text-sm leading-relaxed text-[var(--color-ink)] dark:text-slate-200">
            {lesson.beginnerGuide.overview}
          </p>

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="rounded-md border border-[var(--color-hairline)] bg-white p-4 lg:col-span-5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                What to Focus On in Chapter {chapter.number}
              </p>
              <ul className="mt-2.5 space-y-2 text-xs leading-relaxed text-[var(--color-ink)] dark:text-slate-200">
                {lesson.beginnerGuide.keyTakeaways.map((pt, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="font-mono text-[11px] font-semibold text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                      {i + 1}.
                    </span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>

              {lesson.grammarHeadings.length > 0 && (
                <div className="mt-4 border-t border-[var(--color-hairline)] pt-3 dark:border-[var(--color-night-hairline)]">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                    Original Textbook Grammar Notes in This Chapter
                  </p>
                  <ul className="mt-1.5 space-y-1 text-xs text-[var(--color-ink-muted)] dark:text-slate-300">
                    {lesson.grammarHeadings.map((h, i) => (
                      <li key={i}>• {h}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="space-y-3 lg:col-span-7">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                German Grammar Terms Explained Gradually
              </p>
              {lesson.beginnerGuide.terminology.map((item) => (
                <div
                  key={item.term}
                  className="rounded-md border border-[var(--color-hairline)] bg-white p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]"
                >
                  <p className="text-sm font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                    {item.term}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-300">
                    {item.plainEnglish}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION C: CHAPTER VOCABULARY (WORTSCHATZ) & EVERYDAY EXPRESSIONS */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 lg:col-span-7 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--color-hairline)] pb-3 dark:border-[var(--color-night-hairline)]">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                  Original Textbook · Wortschatz &amp; Chapter Glossary
                </p>
                <h2 className="mt-1 font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  Important German Vocabulary ({lesson.wortschatz.length})
                </h2>
              </div>
            </div>

            {lesson.wortschatz.length === 0 ? (
              <p className="mt-4 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                This chapter has no dedicated Wortschatz table; inspect words directly in the passage above
                or explore the full 1,163-word Vocabulary Studio.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--color-hairline)] dark:divide-[var(--color-night-hairline)]">
                {lesson.wortschatz.slice(0, 18).map((item) => {
                  const badge = getArticleLabel(item.article);
                  const saved = savedNormalizedSet.has(normalizeGermanLookup(item.german));
                  const spokenText = item.article && item.article !== 'die (pl.)'
                    ? `${item.article} ${item.german}`
                    : item.german;
                  return (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-1 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {badge && (
                            <span
                              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium ${badge.classes}`}
                            >
                              {badge.text}
                            </span>
                          )}
                          <span className="text-sm font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                            {item.german}
                          </span>
                          {item.plural && (
                            <span className="font-mono text-[11px] text-[var(--color-ink-muted)] dark:text-slate-400">
                              {item.plural}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--color-ink-muted)] dark:text-slate-300">
                          {item.english}{' '}
                          <span className="ml-1.5 font-mono text-[10px] text-[var(--color-ink-muted)]/80 dark:text-slate-500">
                            {item.pronunciation}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handlePlay(item.id, spokenText, 1)}
                          className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] px-2 py-1 text-[11px] font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
                        >
                          <Volume2 className="h-3 w-3" />
                          <span>1.0×</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePlay(item.id, spokenText, 0.65)}
                          className="rounded border border-[var(--color-hairline)] px-2 py-1 text-[11px] text-[var(--color-ink-muted)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-slate-300"
                        >
                          0.65×
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveVocabPair(item)}
                          className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium ${
                            saved
                              ? 'border-[var(--color-sage)] text-[var(--color-sage)] dark:border-emerald-500 dark:text-emerald-400'
                              : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:border-[var(--color-prussian)] hover:text-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-slate-300'
                          }`}
                        >
                          {saved ? <BookmarkCheck className="h-3 w-3" /> : <BookmarkPlus className="h-3 w-3" />}
                          <span>{saved ? 'Saved' : 'Save'}</span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Everyday Expressions + Dialogue Connection */}
          <div className="space-y-6 lg:col-span-5">
            <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                Original Textbook · Wichtige Redemittel
              </p>
              <h2 className="mt-1 font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                Everyday Expressions
              </h2>

              {lesson.redemittel.length === 0 ? (
                <p className="mt-3 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
                  Chapter {chapter.number} does not include a separate <em>Wichtige Redemittel</em> table.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-[var(--color-hairline)] dark:divide-[var(--color-night-hairline)]">
                  {lesson.redemittel.slice(0, 12).map((expr) => (
                    <li key={expr.id} className="flex items-start justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                          {expr.german}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                          {expr.english}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePlay(expr.id, expr.german, 1)}
                        aria-label={`Listen to ${expr.german}`}
                        className="shrink-0 rounded border border-[var(--color-hairline)] p-1.5 text-[var(--color-ink-muted)] hover:border-[var(--color-prussian)] hover:text-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-slate-300"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Dialogue Practice Link Card */}
            <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-[var(--color-prussian)] dark:text-[#7AB3E6]" />
                <h2 className="font-editorial text-lg font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  Dialogue Practice
                </h2>
              </div>

              {chapterDialogues.length > 0 ? (
                <div className="mt-3 space-y-3">
                  <p className="text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
                    This chapter includes authentic spoken German dialogue ready for role-play, slow
                    playback, and sentence reconstruction:
                  </p>
                  {chapterDialogues.map((dlg) => (
                    <div
                      key={dlg.id}
                      className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] p-3.5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]"
                    >
                      <p className="font-editorial text-sm font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                        {dlg.germanTitle}
                      </p>
                      <p className="text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                        {dlg.englishTitle} · {dlg.turns.filter((t) => !t.isNarration).length} spoken turns
                      </p>
                      <button
                        type="button"
                        onClick={() => onOpenDialogue(dlg.id)}
                        className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-[var(--color-prussian)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B]"
                      >
                        <span>Open in Dialogue Studio</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2.5 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
                  Chapter {chapter.number} focuses on narrative reading and grammar rather than a spoken
                  dialogue. Authentic textbook dialogues begin in Chapter 13 and appear in Chapters 13–15,
                  18–20, 24, 27, 30, 33–34, 36, and 41.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* SECTION D: VISUAL SENTENCE CONSTRUCTION WORKSHOP */}
        {lesson.sentenceConstructions.length > 0 && (
          <section className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-[var(--color-prussian)] dark:text-[#7AB3E6]" />
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                Visual Sentence Construction · Authentic Sentences from Chapter {chapter.number}
              </span>
            </div>
            <h2 className="mt-1 font-editorial text-2xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
              How German Sentences Are Built in This Chapter
            </h2>
            <p className="mt-1 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
              German statements follow the <strong>Verb-Second (V2) bracket</strong>: Position 1 sets the
              topic, Position 2 holds the conjugated verb, the Middle Field gives details, and infinitives /
              participles / separable prefixes close the sentence at the end.
            </p>

            <div className="mt-5 space-y-4">
              {lesson.sentenceConstructions.map((sc) => (
                <div
                  key={sc.id}
                  className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-editorial text-base font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                        {sc.german}
                      </p>
                      <p className="text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                        {sc.english}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePlay(sc.id, sc.german, 0.65)}
                      className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]"
                    >
                      <Volume2 className="h-3 w-3" />
                      <span>Slow 0.65×</span>
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <div className="rounded border border-[var(--color-hairline)] bg-white p-2.5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
                      <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                        {sc.pos1Label}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                        {sc.pos1Text}
                      </p>
                    </div>
                    <div className="rounded border border-[var(--color-prussian)]/50 bg-[var(--color-prussian)]/8 p-2.5 dark:border-[#5B9BD5]/50 dark:bg-[#5B9BD5]/15">
                      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                        Position 2 · Verb
                      </p>
                      <p className="mt-1 text-xs font-bold text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                        {sc.verbPos2}
                      </p>
                    </div>
                    <div className="rounded border border-[var(--color-hairline)] bg-white p-2.5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
                      <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                        Middle Field (Objects / Info)
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-ink)] dark:text-[#EDEAE3]">
                        {sc.middleField}
                      </p>
                    </div>
                    <div className="rounded border border-[var(--color-sage)]/40 bg-[var(--color-sage)]/8 p-2.5 dark:border-emerald-500/40 dark:bg-emerald-950/30">
                      <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-sage)] dark:text-emerald-400">
                        End Bracket
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                        {sc.endBracket}
                      </p>
                    </div>
                  </div>

                  <p className="mt-2.5 text-xs text-[var(--color-ink-muted)] dark:text-slate-300">
                    {sc.structureNote}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* SECTION E: INTERACTIVE SENTENCE BUILDER & CHAPTER KNOWLEDGE ASSESSMENT */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Interactive Sentence Construction Exercise */}
          <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 lg:col-span-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                  Interactive Exercise · Word Order Practice
                </p>
                <h2 className="mt-1 font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  Build the German Sentence
                </h2>
              </div>
              {builderPool.length > 1 && (
                <span className="font-mono text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                  {(builderIdx % builderPool.length) + 1} / {builderPool.length}
                </span>
              )}
            </div>

            {activeBuilder ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-md bg-[var(--color-paper)] p-3.5 dark:bg-[var(--color-night)]">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                    Translate into German word order:
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                    &ldquo;{activeBuilder.english}&rdquo;
                  </p>
                </div>

                {/* Assembled Answer Tray */}
                <div className="min-h-[56px] rounded-md border border-dashed border-[var(--color-hairline)] bg-[var(--color-paper)]/60 p-3 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]/60">
                  {selectedTileIndices.length === 0 ? (
                    <p className="text-xs text-[var(--color-ink-muted)] dark:text-slate-500">
                      Click the German words below in order to construct the sentence…
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTileIndices.map((tileIdx, pos) => (
                        <button
                          key={`${tileIdx}-${pos}`}
                          type="button"
                          onClick={() => {
                            setSelectedTileIndices((prev) => prev.filter((_, idx) => idx !== pos));
                            setBuilderStatus('idle');
                          }}
                          className="rounded border border-[var(--color-prussian)] bg-[var(--color-prussian)]/10 px-2.5 py-1 text-xs font-medium text-[var(--color-ink)] dark:border-[#5B9BD5] dark:bg-[#5B9BD5]/20 dark:text-[#EDEAE3]"
                        >
                          {scrambledTiles[tileIdx]?.word}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Word Bank */}
                <div className="flex flex-wrap gap-2">
                  {scrambledTiles.map((tile, idx) => {
                    const used = selectedTileIndices.includes(idx);
                    return (
                      <button
                        key={`${tile.word}-${idx}`}
                        type="button"
                        disabled={used}
                        onClick={() => {
                          setSelectedTileIndices((prev) => [...prev, idx]);
                          setBuilderStatus('idle');
                        }}
                        className={`rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                          used
                            ? 'border-[var(--color-hairline)] bg-[var(--color-paper-subtle)] text-transparent dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-subtle)]'
                            : 'border-[var(--color-hairline)] bg-white text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]'
                        }`}
                      >
                        {tile.word}
                      </button>
                    );
                  })}
                </div>

                {builderStatus === 'correct' && (
                  <p className="rounded bg-[var(--color-sage)]/12 px-3 py-2 text-xs font-medium text-[var(--color-sage)] dark:bg-emerald-950/40 dark:text-emerald-300">
                    Correct! &ldquo;{activeBuilder.german}&rdquo;
                  </p>
                )}
                {builderStatus === 'wrong' && (
                  <p className="rounded bg-amber-50 px-3 py-2 text-xs text-[var(--color-ochre)] dark:bg-amber-950/30 dark:text-amber-300">
                    Not quite in textbook order yet. Hint: starts with{' '}
                    <strong>{activeBuilder.words.slice(0, 2).join(' ')}</strong>…
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={selectedTileIndices.length !== scrambledTiles.length}
                      onClick={handleCheckBuilder}
                      className="rounded-md bg-[var(--color-prussian)] px-3.5 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-[#2B649B]"
                    >
                      Check Sentence
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTileIndices([]);
                        setBuilderStatus('idle');
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--color-hairline)] px-2.5 py-1.5 text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-300"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Reset</span>
                    </button>
                  </div>

                  {builderPool.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setBuilderIdx((v) => (v + 1) % builderPool.length);
                        setSelectedTileIndices([]);
                        setBuilderStatus('idle');
                      }}
                      className="text-xs font-medium text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
                    >
                      Next sentence →
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                Open the printed textbook exercises in this chapter to practise translation and grammar
                drills.
              </p>
            )}
          </div>

          {/* Chapter Knowledge Assessment */}
          <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 lg:col-span-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-[var(--color-sage)] dark:text-emerald-400" />
                <h2 className="font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  Lesson Knowledge Check
                </h2>
              </div>
              {quizSubmitted && (
                <span className="font-mono text-xs font-semibold text-[var(--color-sage)] dark:text-emerald-400">
                  Score: {quizScore} / {quizQuestions.length}
                </span>
              )}
            </div>

            {quizQuestions.length === 0 ? (
              <p className="mt-3 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                Use the full textbook exercises ({chapter.exercises.length} exercises in Chapter{' '}
                {chapter.number}) to assess this chapter.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {quizQuestions.map((q, qIdx) => {
                  const chosen = quizAnswers[q.id];
                  return (
                    <div
                      key={q.id}
                      className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] p-3.5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]"
                    >
                      <p className="text-xs font-medium text-[var(--color-ink-muted)] dark:text-slate-400">
                        {qIdx + 1}. {q.prompt}
                      </p>
                      {q.germanCue && (
                        <p className="mt-1 font-editorial text-sm font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                          {q.germanCue}
                        </p>
                      )}
                      <div className="mt-2.5 grid grid-cols-1 gap-1.5">
                        {q.options.map((opt, oIdx) => {
                          const isSelected = chosen === oIdx;
                          const isCorrect = oIdx === q.correctIndex;
                          let style =
                            'border-[var(--color-hairline)] bg-white text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]';
                          if (quizSubmitted) {
                            if (isCorrect) {
                              style =
                                'border-[var(--color-sage)] bg-[var(--color-sage)]/12 font-medium text-[var(--color-sage)] dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-300';
                            } else if (isSelected && !isCorrect) {
                              style =
                                'border-red-400 bg-red-50 text-red-700 dark:border-red-500/60 dark:bg-red-950/30 dark:text-red-300';
                            }
                          } else if (isSelected) {
                            style =
                              'border-[var(--color-prussian)] bg-[var(--color-prussian)]/10 font-medium text-[var(--color-prussian)] dark:border-[#5B9BD5] dark:bg-[#5B9BD5]/20 dark:text-[#7AB3E6]';
                          }

                          return (
                            <button
                              key={oIdx}
                              type="button"
                              disabled={quizSubmitted}
                              onClick={() => setQuizAnswers((prev) => ({ ...prev, [q.id]: oIdx }))}
                              className={`rounded border px-3 py-1.5 text-left text-xs transition-colors ${style}`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                      {quizSubmitted && (
                        <p className="mt-2 text-[11px] text-[var(--color-ink-muted)] dark:text-slate-400">
                          {q.explanation}
                        </p>
                      )}
                    </div>
                  );
                })}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  {!quizSubmitted ? (
                    <button
                      type="button"
                      disabled={Object.keys(quizAnswers).length < quizQuestions.length}
                      onClick={handleSubmitQuiz}
                      className="rounded-md bg-[var(--color-prussian)] px-4 py-2 text-xs font-medium text-white disabled:opacity-40 dark:bg-[#2B649B]"
                    >
                      Submit Lesson Check
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setQuizAnswers({});
                          setQuizSubmitted(false);
                        }}
                        className="rounded-md border border-[var(--color-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
                      >
                        Retake Check
                      </button>
                      {!isCompleted && quizScore >= Math.ceil(quizQuestions.length * 0.6) && (
                        <button
                          type="button"
                          onClick={onToggleCompleted}
                          className="rounded-md bg-[var(--color-sage)] px-3 py-1.5 text-xs font-medium text-white dark:bg-emerald-700"
                        >
                          Mark Chapter {chapter.number} Complete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* SECTION F: LESSON SUMMARY & PERSONAL NOTES */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 lg:col-span-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
              Lesson Summary
            </p>
            <h2 className="mt-1 font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
              Key Takeaways — Chapter {chapter.number}
            </h2>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-[var(--color-ink)] dark:text-slate-200">
              {lesson.summaryPoints.map((pt, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-sage)] dark:text-emerald-400" />
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
            {chapter.exercises.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-hairline)] pt-3 text-xs text-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:text-slate-400">
                <span>
                  Printed textbook exercises in Chapter {chapter.number}:{' '}
                  <strong className="text-[var(--color-ink)] dark:text-[#EDEAE3]">
                    Exercise {chapter.exercises.join(', ')}
                  </strong>{' '}
                  ({chapter.answerKeyedExercises.length} with printed answer keys in Chapter 45).
                </span>
                {onOpenPracticeChapter && (
                  <button
                    type="button"
                    onClick={() => onOpenPracticeChapter(chapter.number)}
                    className="inline-flex items-center gap-1 rounded-md bg-[var(--color-prussian)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B]"
                  >
                    <span>Practice Ch. {chapter.number} Exercises</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 lg:col-span-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <div className="flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4 text-[var(--color-prussian)] dark:text-[#7AB3E6]" />
              <h2 className="font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                Personal Notes for Chapter {chapter.number}
              </h2>
            </div>

            <form onSubmit={handleSaveLessonNote} className="mt-3 space-y-2">
              <textarea
                rows={3}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Write a personal grammar reminder, tricky word, or question for this lesson…"
                className="w-full rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] p-3 text-xs text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!noteDraft.trim()}
                  className="rounded-md bg-[var(--color-prussian)] px-3.5 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-[#2B649B]"
                >
                  Save Lesson Note
                </button>
              </div>
            </form>

            {chapterNotes.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-[var(--color-hairline)] pt-3 dark:border-[var(--color-night-hairline)]">
                {chapterNotes.map((ann) => (
                  <li
                    key={ann.id}
                    className="flex items-start justify-between gap-2 rounded border border-[var(--color-hairline)] bg-[var(--color-paper)] p-2.5 text-xs dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]"
                  >
                    <p className="leading-relaxed text-[var(--color-ink)] dark:text-[#EDEAE3]">{ann.note}</p>
                    <button
                      type="button"
                      aria-label="Delete note"
                      onClick={() => onDeleteAnnotation(ann.id)}
                      className="shrink-0 text-[var(--color-ink-muted)] hover:text-red-600 dark:text-slate-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
