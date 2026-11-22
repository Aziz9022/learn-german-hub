import {
  Check,
  CheckCircle2,
  Eye,
  Flag,
  RotateCcw,
  Shuffle,
  Volume2,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { playGermanAudio } from '../../services/germanAudio';
import {
  findExampleSentenceInBook,
  normalizeGermanLookup,
  stripStressAccents,
} from '../../services/germanLinguistics';
import type {
  LexiconEntry,
  ParsedBook,
  VocabCategory,
  VocabProgressRecord,
} from '../../types/book';

export type PracticeModeId =
  | 'flashcards'
  | 'de-to-en'
  | 'en-to-de'
  | 'matching'
  | 'categorise'
  | 'recall-test';

interface VocabPracticeModesProps {
  mode: PracticeModeId;
  pool: LexiconEntry[];
  fullLexicon: LexiconEntry[];
  book: ParsedBook;
  vocabProgress: Record<string, VocabProgressRecord>;
  scopeLabel: string;
  onRecordReview: (wordKey: string, outcome: 'difficult' | 'good' | 'mastered') => void;
  onToggleDifficult: (wordKey: string) => void;
  onRecordQuizResult: (result: {
    chapterNumber: number;
    title: string;
    score: number;
    total: number;
  }) => void;
}

const GERMAN_SPECIAL_CHARS = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'];

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function shortMeaning(english: string): string {
  const first = english.split(';')[0].trim();
  return first.length > 68 ? `${first.slice(0, 68)}…` : first;
}

function cleanGermanSpeakable(entry: LexiconEntry): string {
  const base = stripStressAccents(entry.german).replace(/-/g, '').trim();
  return entry.article ? `${entry.article} ${base}` : base;
}

function getArticleLabel(article?: string): { text: string; colorClass: string } | null {
  if (article === 'der') {
    return {
      text: 'Masc. · der',
      colorClass: 'border-[var(--color-prussian)]/40 text-[var(--color-prussian)] dark:border-[#5B9BD5]/50 dark:text-[#7AB3E6]',
    };
  }
  if (article === 'die') {
    return {
      text: 'Fem. · die',
      colorClass: 'border-rose-600/40 text-rose-700 dark:border-rose-400/50 dark:text-rose-300',
    };
  }
  if (article === 'das') {
    return {
      text: 'Neut. · das',
      colorClass: 'border-[var(--color-sage)]/40 text-[var(--color-sage)] dark:border-emerald-400/50 dark:text-emerald-300',
    };
  }
  return null;
}

export function VocabPracticeModes(props: VocabPracticeModesProps) {
  const { mode, pool } = props;

  if (pool.length < 4 && mode !== 'flashcards') {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-hairline)] bg-white p-8 text-center dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
        <p className="font-editorial text-lg font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
          Need at least 4 words in this filter to start this exercise
        </p>
        <p className="mt-1.5 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
          Currently {pool.length} word{pool.length === 1 ? '' : 's'} match your active scope. Switch the scope
          above to &ldquo;All Book Vocabulary&rdquo; or save more words from the Textbook Reader.
        </p>
      </div>
    );
  }

  if (pool.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-hairline)] bg-white p-8 text-center dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
        <p className="text-sm text-[var(--color-ink-muted)] dark:text-slate-400">
          No words match your current filter. Choose &ldquo;All Book Vocabulary&rdquo; or clear filters above.
        </p>
      </div>
    );
  }

  switch (mode) {
    case 'flashcards':
      return <FlashcardsDeck {...props} />;
    case 'de-to-en':
      return <GermanToEnglishDrill {...props} />;
    case 'en-to-de':
      return <EnglishToGermanDrill {...props} />;
    case 'matching':
      return <WordMatchingBoard {...props} />;
    case 'categorise':
      return <CategorisationDrill {...props} />;
    case 'recall-test':
      return <RecallTestMode {...props} />;
  }
}

/* =========================== 1. FLASHCARDS =========================== */
function FlashcardsDeck({
  pool,
  book,
  vocabProgress,
  onRecordReview,
  onToggleDifficult,
}: VocabPracticeModesProps) {
  const [seed, setSeed] = useState(0);
  const deck = useMemo(() => shuffleArray(pool).slice(0, 40), [pool, seed]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [frontSide, setFrontSide] = useState<'german' | 'english'>('german');

  const card = deck[index % deck.length];
  const progress = card ? vocabProgress[card.normalized] : undefined;
  const example = useMemo(
    () => (card ? findExampleSentenceInBook(stripStressAccents(card.german).replace(/-/g, ''), book) : undefined),
    [book, card]
  );

  if (!card) return null;
  const articleMeta = getArticleLabel(card.article);

  const advance = (outcome?: 'difficult' | 'good' | 'mastered') => {
    if (outcome) {
      onRecordReview(card.normalized, outcome);
    }
    setFlipped(false);
    setIndex((prev) => (prev + 1) % deck.length);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-mono tabular-nums text-[var(--color-ink-muted)] dark:text-slate-400">
          Card {(index % deck.length) + 1} of {deck.length}
          {progress?.mastery === 'mastered' ? ' · Mastered' : progress?.difficult ? ' · Difficult' : ''}
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setFrontSide((s) => (s === 'german' ? 'english' : 'german'));
              setFlipped(false);
            }}
            className="rounded border border-[var(--color-hairline)] bg-white px-2.5 py-1 font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]"
          >
            Front: {frontSide === 'german' ? 'German → English' : 'English → German'}
          </button>
          <button
            type="button"
            onClick={() => {
              setSeed((s) => s + 1);
              setIndex(0);
              setFlipped(false);
            }}
            className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] bg-white px-2.5 py-1 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-slate-300"
          >
            <Shuffle className="h-3.5 w-3.5" />
            <span>Shuffle</span>
          </button>
        </div>
      </div>

      {/* Flashcard Surface */}
      <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-7 sm:p-9 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
            {card.category} · {card.firstChapter ? `First seen Ch. ${card.firstChapter}` : 'Ch. 46 Glossary'}
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void playGermanAudio(cleanGermanSpeakable(card), 1)}
              className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
            >
              <Volume2 className="h-3.5 w-3.5" />
              <span>1.0×</span>
            </button>
            <button
              type="button"
              onClick={() => void playGermanAudio(cleanGermanSpeakable(card), 0.65)}
              className="rounded border border-[var(--color-hairline)] px-2 py-1 text-xs text-[var(--color-ink-muted)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-slate-300"
            >
              0.65×
            </button>
            <button
              type="button"
              onClick={() => onToggleDifficult(card.normalized)}
              title="Flag word as difficult"
              className={`rounded border p-1.5 ${
                progress?.difficult
                  ? 'border-[var(--color-ochre)] text-[var(--color-ochre)] dark:border-amber-400 dark:text-amber-300'
                  : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)]'
              }`}
            >
              <Flag className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="my-8 text-center">
          {frontSide === 'german' || flipped ? (
            <div className="space-y-2">
              {articleMeta && (
                <span
                  className={`inline-block rounded border px-2 py-0.5 font-mono text-[11px] font-medium ${articleMeta.colorClass}`}
                >
                  {articleMeta.text}
                </span>
              )}
              <h3 className="font-editorial text-3xl font-semibold text-[var(--color-ink)] sm:text-4xl dark:text-[#EDEAE3]">
                {card.article ? `${card.article} ` : ''}
                {card.german}
              </h3>
              {card.genitiveAndPlural && (
                <p className="font-mono text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                  Genitive / Plural: {card.genitiveAndPlural}
                </p>
              )}
              {card.principalParts && (
                <p className="font-mono text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                  {card.principalParts}
                </p>
              )}
              <p className="font-mono text-xs text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                {card.pronunciation}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
                Recall the German word{card.article ? ' & article' : ''}
              </p>
              <h3 className="font-editorial text-2xl font-semibold text-[var(--color-ink)] sm:text-3xl dark:text-[#EDEAE3]">
                {shortMeaning(card.english)}
              </h3>
            </div>
          )}

          {flipped && (
            <div className="mt-6 space-y-3 border-t border-[var(--color-hairline)] pt-5 dark:border-[var(--color-night-hairline)]">
              <p className="text-lg font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                {card.english}
              </p>
              {example && (
                <p className="mx-auto max-w-lg text-xs leading-relaxed italic text-[var(--color-ink-muted)] dark:text-slate-400">
                  Textbook example: &ldquo;{example}&rdquo;
                </p>
              )}
            </div>
          )}
        </div>

        {/* Reveal or Rate Controls */}
        {!flipped ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setFlipped(true)}
              className="inline-flex items-center gap-2 rounded-md bg-[var(--color-prussian)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B]"
            >
              <Eye className="h-4 w-4" />
              <span>Reveal Answer</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => advance('difficult')}
              className="rounded-md border border-[var(--color-ochre)]/50 bg-amber-50/70 px-3 py-2.5 text-xs font-semibold text-[var(--color-ochre)] hover:bg-amber-100/70 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300"
            >
              Still Difficult (4h)
            </button>
            <button
              type="button"
              onClick={() => advance('good')}
              className="rounded-md border border-[var(--color-prussian)]/50 bg-[var(--color-prussian)]/8 px-3 py-2.5 text-xs font-semibold text-[var(--color-prussian)] hover:bg-[var(--color-prussian)]/15 dark:border-[#5B9BD5]/50 dark:text-[#7AB3E6]"
            >
              Good Recall (2d)
            </button>
            <button
              type="button"
              onClick={() => advance('mastered')}
              className="rounded-md bg-[var(--color-sage)] px-3 py-2.5 text-xs font-semibold text-white hover:opacity-95 dark:bg-emerald-700"
            >
              Mastered (7d)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================== 2. GERMAN → ENGLISH =========================== */
function GermanToEnglishDrill({ pool, fullLexicon, onRecordReview }: VocabPracticeModesProps) {
  const [questionIdx, setQuestionIdx] = useState(0);
  const [seed, setSeed] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  const questions = useMemo(() => shuffleArray(pool).slice(0, 25), [pool, seed]);
  const target = questions[questionIdx % questions.length];

  const options = useMemo(() => {
    if (!target) return [];
    const distractorSource = fullLexicon.filter(
      (e) => e.id !== target.id && e.category === target.category
    );
    const fallbackSource = fullLexicon.filter((e) => e.id !== target.id);
    const distractors = shuffleArray(distractorSource.length >= 3 ? distractorSource : fallbackSource).slice(
      0,
      3
    );
    return shuffleArray([target, ...distractors]);
  }, [fullLexicon, target]);

  if (!target) return null;

  const choose = (entry: LexiconEntry) => {
    if (selectedId) return;
    setSelectedId(entry.id);
    const isCorrect = entry.id === target.id;
    setStats((s) => ({ correct: s.correct + (isCorrect ? 1 : 0), total: s.total + 1 }));
    onRecordReview(target.normalized, isCorrect ? 'good' : 'difficult');
  };

  const next = () => {
    setSelectedId(null);
    setQuestionIdx((i) => i + 1);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between font-mono text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
        <span className="tabular-nums">
          Score: {stats.correct} / {stats.total}
        </span>
        <button
          type="button"
          onClick={() => {
            setSeed((s) => s + 1);
            setQuestionIdx(0);
            setSelectedId(null);
            setStats({ correct: 0, total: 0 });
          }}
          className="inline-flex items-center gap-1 hover:text-[var(--color-ink)] dark:hover:text-white"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset drill
        </button>
      </div>

      <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 sm:p-8 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
          German → English Recognition · {target.partOfSpeech}
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-editorial text-3xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
              {target.article ? `${target.article} ` : ''}
              {target.german}
            </h3>
            <p className="mt-0.5 font-mono text-xs text-[var(--color-prussian)] dark:text-[#7AB3E6]">
              {target.pronunciation}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void playGermanAudio(cleanGermanSpeakable(target), 1)}
              className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
            >
              <Volume2 className="h-3.5 w-3.5" /> Listen
            </button>
            <button
              type="button"
              onClick={() => void playGermanAudio(cleanGermanSpeakable(target), 0.65)}
              className="rounded border border-[var(--color-hairline)] px-2.5 py-1.5 text-xs text-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:text-slate-300"
            >
              0.65×
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-2.5">
          {options.map((opt) => {
            const isTarget = opt.id === target.id;
            const isPicked = selectedId === opt.id;
            let stateStyle =
              'border-[var(--color-hairline)] bg-[var(--color-paper)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]';
            if (selectedId) {
              if (isTarget) {
                stateStyle =
                  'border-[var(--color-sage)] bg-[var(--color-sage)]/12 text-[var(--color-sage)] dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-300';
              } else if (isPicked) {
                stateStyle =
                  'border-red-500 bg-red-50 text-red-700 dark:border-red-500/70 dark:bg-red-950/40 dark:text-red-300';
              }
            }
            return (
              <button
                key={opt.id}
                type="button"
                disabled={Boolean(selectedId)}
                onClick={() => choose(opt)}
                className={`flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-left text-sm transition-colors ${stateStyle}`}
              >
                <span>{shortMeaning(opt.english)}</span>
                {selectedId && isTarget && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                {selectedId && isPicked && !isTarget && <XCircle className="h-4 w-4 shrink-0" />}
              </button>
            );
          })}
        </div>

        {selectedId && (
          <div className="mt-5 flex items-center justify-between border-t border-[var(--color-hairline)] pt-4 dark:border-[var(--color-night-hairline)]">
            <p className="text-xs text-[var(--color-ink-muted)] dark:text-slate-300">
              Full entry: <strong>{target.rawEntry}</strong>
            </p>
            <button
              type="button"
              onClick={next}
              className="rounded-md bg-[var(--color-prussian)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B]"
            >
              Next Word →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================== 3. ENGLISH → GERMAN =========================== */
function EnglishToGermanDrill({ pool, onRecordReview }: VocabPracticeModesProps) {
  const [seed, setSeed] = useState(0);
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [checked, setChecked] = useState<'correct' | 'wrong' | null>(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  const deck = useMemo(() => shuffleArray(pool).slice(0, 30), [pool, seed]);
  const target = deck[idx % deck.length];
  if (!target) return null;

  const expectedWord = stripStressAccents(target.german).replace(/-/g, '').trim();
  const expectedWithArticle = target.article ? `${target.article} ${expectedWord}` : expectedWord;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (checked || !typed.trim()) return;

    const userNorm = normalizeGermanLookup(typed);
    const bareNorm = normalizeGermanLookup(expectedWord);
    const fullNorm = normalizeGermanLookup(expectedWithArticle);

    const isCorrect =
      userNorm === fullNorm ||
      userNorm === bareNorm ||
      typed.trim().toLowerCase() === expectedWithArticle.toLowerCase();

    setChecked(isCorrect ? 'correct' : 'wrong');
    setStats((s) => ({ correct: s.correct + (isCorrect ? 1 : 0), total: s.total + 1 }));
    onRecordReview(target.normalized, isCorrect ? 'good' : 'difficult');
    void playGermanAudio(cleanGermanSpeakable(target), 1);
  };

  const next = () => {
    setTyped('');
    setShowHint(false);
    setChecked(null);
    setIdx((i) => i + 1);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between font-mono text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
        <span className="tabular-nums">
          Accuracy: {stats.correct} / {stats.total}
        </span>
        <button
          type="button"
          onClick={() => {
            setSeed((s) => s + 1);
            setIdx(0);
            setTyped('');
            setChecked(null);
            setStats({ correct: 0, total: 0 });
          }}
          className="inline-flex items-center gap-1 hover:text-[var(--color-ink)] dark:hover:text-white"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
      </div>

      <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 sm:p-8 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
          English → German Active Recall · {target.partOfSpeech}
        </p>
        <h3 className="mt-2 font-editorial text-2xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
          {shortMeaning(target.english)}
        </h3>
        {target.article && (
          <p className="mt-1 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
            Include the German article if you know it (e.g., <em>der / die / das</em>).
          </p>
        )}

        {showHint && !checked && (
          <p className="mt-2 font-mono text-xs text-[var(--color-prussian)] dark:text-[#7AB3E6]">
            Hint: {target.article ? `${target.article} ` : ''}
            {expectedWord.slice(0, Math.min(3, expectedWord.length))}… ({expectedWord.length} letters)
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <input
            type="text"
            value={typed}
            disabled={Boolean(checked)}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type the German word…"
            className="w-full rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] px-3.5 py-2.5 text-sm text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
          />

          {/* Umlaut & ß quick-insert bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {GERMAN_SPECIAL_CHARS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  disabled={Boolean(checked)}
                  onClick={() => setTyped((t) => t + ch)}
                  className="h-7 w-7 rounded border border-[var(--color-hairline)] bg-white font-mono text-xs text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
                >
                  {ch}
                </button>
              ))}
            </div>

            {!checked && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowHint(true)}
                  className="text-xs text-[var(--color-ink-muted)] hover:underline dark:text-slate-400"
                >
                  Show hint
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[var(--color-prussian)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B]"
                >
                  Check Answer
                </button>
              </div>
            )}
          </div>
        </form>

        {checked && (
          <div
            className={`mt-5 flex flex-wrap items-center justify-between gap-3 rounded-md border p-4 text-xs ${
              checked === 'correct'
                ? 'border-[var(--color-sage)]/50 bg-[var(--color-sage)]/10 text-[var(--color-sage)] dark:border-emerald-500/50 dark:text-emerald-300'
                : 'border-red-400/50 bg-red-50 text-red-700 dark:border-red-500/50 dark:bg-red-950/30 dark:text-red-300'
            }`}
          >
            <div>
              <p className="font-semibold">
                {checked === 'correct' ? 'Correct!' : 'Expected answer:'} {expectedWithArticle}
              </p>
              <p className="mt-0.5 font-mono opacity-85">{target.pronunciation}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void playGermanAudio(cleanGermanSpeakable(target), 0.65)}
                className="rounded border border-current/30 px-2.5 py-1.5 font-medium"
              >
                Hear 0.65×
              </button>
              <button
                type="button"
                onClick={next}
                className="rounded bg-[var(--color-prussian)] px-3.5 py-1.5 font-medium text-white"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================== 4. WORD MATCHING =========================== */
function WordMatchingBoard({ pool, onRecordReview }: VocabPracticeModesProps) {
  const [round, setRound] = useState(0);
  const pairs = useMemo(() => shuffleArray(pool).slice(0, 6), [pool, round]);
  const englishOrder = useMemo(() => shuffleArray(pairs), [pairs]);

  const [selectedGermanId, setSelectedGermanId] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [wrongPair, setWrongPair] = useState<{ de: string; en: string } | null>(null);
  const [attempts, setAttempts] = useState(0);

  const handlePickEnglish = (enEntry: LexiconEntry) => {
    if (!selectedGermanId || matchedIds.includes(enEntry.id)) return;
    setAttempts((a) => a + 1);
    if (selectedGermanId === enEntry.id) {
      setMatchedIds((prev) => [...prev, enEntry.id]);
      setSelectedGermanId(null);
      setWrongPair(null);
      onRecordReview(enEntry.normalized, 'good');
      void playGermanAudio(cleanGermanSpeakable(enEntry), 1);
    } else {
      setWrongPair({ de: selectedGermanId, en: enEntry.id });
      window.setTimeout(() => setWrongPair(null), 650);
    }
  };

  const allMatched = matchedIds.length === pairs.length && pairs.length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-mono text-[var(--color-ink-muted)] dark:text-slate-400">
          Matched {matchedIds.length} / {pairs.length} · Attempts: {attempts}
        </span>
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setMatchedIds([]);
            setSelectedGermanId(null);
            setWrongPair(null);
            setAttempts(0);
          }}
          className="inline-flex items-center gap-1.5 rounded border border-[var(--color-hairline)] bg-white px-3 py-1.5 font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]"
        >
          <Shuffle className="h-3.5 w-3.5" /> New 6-Word Round
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Left: German */}
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
            1. Select German Word
          </p>
          {pairs.map((item) => {
            const matched = matchedIds.includes(item.id);
            const active = selectedGermanId === item.id;
            const isWrong = wrongPair?.de === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={matched}
                onClick={() => setSelectedGermanId(item.id)}
                className={`flex w-full items-center justify-between rounded-md border px-4 py-3 text-left text-sm font-medium transition-colors ${
                  matched
                    ? 'border-[var(--color-sage)]/40 bg-[var(--color-sage)]/10 text-[var(--color-sage)] line-through opacity-75 dark:text-emerald-300'
                    : isWrong
                      ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                      : active
                        ? 'border-[var(--color-prussian)] bg-[var(--color-prussian)]/10 text-[var(--color-prussian)] dark:border-[#5B9BD5] dark:text-[#7AB3E6]'
                        : 'border-[var(--color-hairline)] bg-white text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]'
                }`}
              >
                <span>
                  {item.article ? `${item.article} ` : ''}
                  {item.german}
                </span>
                {matched && <Check className="h-4 w-4" />}
              </button>
            );
          })}
        </div>

        {/* Right: English */}
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
            2. Match English Meaning
          </p>
          {englishOrder.map((item) => {
            const matched = matchedIds.includes(item.id);
            const isWrong = wrongPair?.en === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={matched || !selectedGermanId}
                onClick={() => handlePickEnglish(item)}
                className={`flex w-full items-center justify-between rounded-md border px-4 py-3 text-left text-sm transition-colors ${
                  matched
                    ? 'border-[var(--color-sage)]/40 bg-[var(--color-sage)]/10 text-[var(--color-sage)] line-through opacity-75 dark:text-emerald-300'
                    : isWrong
                      ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                      : 'border-[var(--color-hairline)] bg-white text-[var(--color-ink)] hover:border-[var(--color-prussian)] disabled:opacity-65 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]'
                }`}
              >
                <span>{shortMeaning(item.english)}</span>
                {matched && <Check className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      </div>

      {allMatched && (
        <div className="rounded-md border border-[var(--color-sage)]/50 bg-[var(--color-sage)]/10 p-4 text-center text-sm font-medium text-[var(--color-sage)] dark:text-emerald-300">
          Round complete in {attempts} attempts! Click &ldquo;New 6-Word Round&rdquo; to continue practicing.
        </div>
      )}
    </div>
  );
}

/* =========================== 5. VOCABULARY CATEGORISATION =========================== */
function CategorisationDrill({ pool, fullLexicon, onRecordReview }: VocabPracticeModesProps) {
  const [subMode, setSubMode] = useState<'articles' | 'pos'>('articles');
  const [seed, setSeed] = useState(0);
  const [idx, setIdx] = useState(0);
  const [feedback, setFeedback] = useState<{ correct: boolean; expected: string } | null>(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  const items = useMemo(() => {
    if (subMode === 'articles') {
      const nounsInPool = pool.filter((e) => e.article === 'der' || e.article === 'die' || e.article === 'das');
      const source = nounsInPool.length >= 4 ? nounsInPool : fullLexicon.filter((e) => e.article === 'der' || e.article === 'die' || e.article === 'das');
      return shuffleArray(source).slice(0, 30);
    }
    return shuffleArray(pool).slice(0, 30);
  }, [fullLexicon, pool, seed, subMode]);

  const current = items[idx % items.length];
  if (!current) return null;

  const handleAnswer = (picked: string) => {
    if (feedback) return;
    const expected =
      subMode === 'articles'
        ? current.article || ''
        : current.category === 'Preposition' || current.category === 'Conjunction'
          ? 'Preposition / Conjunction'
          : current.category === 'Pronoun / Expression'
            ? 'Adjective / Adverb'
            : current.category;

    const isCorrect = picked === expected;
    setFeedback({ correct: isCorrect, expected });
    setStats((s) => ({ correct: s.correct + (isCorrect ? 1 : 0), total: s.total + 1 }));
    onRecordReview(current.normalized, isCorrect ? 'good' : 'difficult');
    void playGermanAudio(cleanGermanSpeakable(current), 1);
  };

  const next = () => {
    setFeedback(null);
    setIdx((i) => i + 1);
  };

  const articleChoices = [
    { id: 'der', label: 'der (Masculine)' },
    { id: 'die', label: 'die (Feminine)' },
    { id: 'das', label: 'das (Neuter)' },
  ];

  const posChoices: { id: VocabCategory | 'Preposition / Conjunction'; label: string }[] = [
    { id: 'Noun', label: 'Noun (Substantiv)' },
    { id: 'Verb', label: 'Verb' },
    { id: 'Adjective / Adverb', label: 'Adjective / Adverb' },
    { id: 'Preposition / Conjunction', label: 'Preposition / Conjunction' },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center rounded-md border border-[var(--color-hairline)] bg-white p-0.5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
          <button
            type="button"
            onClick={() => {
              setSubMode('articles');
              setFeedback(null);
              setIdx(0);
            }}
            className={`rounded-sm px-3 py-1.5 font-medium ${
              subMode === 'articles'
                ? 'bg-[var(--color-prussian)] text-white'
                : 'text-[var(--color-ink-muted)] dark:text-slate-400'
            }`}
          >
            Noun Gender (der / die / das)
          </button>
          <button
            type="button"
            onClick={() => {
              setSubMode('pos');
              setFeedback(null);
              setIdx(0);
            }}
            className={`rounded-sm px-3 py-1.5 font-medium ${
              subMode === 'pos'
                ? 'bg-[var(--color-prussian)] text-white'
                : 'text-[var(--color-ink-muted)] dark:text-slate-400'
            }`}
          >
            Word Category
          </button>
        </div>

        <span className="font-mono tabular-nums text-[var(--color-ink-muted)] dark:text-slate-400">
          Score: {stats.correct} / {stats.total}
        </span>
      </div>

      <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 text-center sm:p-8 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
          {subMode === 'articles' ? 'Choose the correct definite article' : 'Classify this German word'}
        </p>

        <h3 className="mt-3 font-editorial text-3xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
          {subMode === 'articles' ? `___ ${current.german}` : current.german}
        </h3>
        <p className="mt-1.5 text-sm text-[var(--color-ink-muted)] dark:text-slate-400">
          {shortMeaning(current.english)}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {(subMode === 'articles' ? articleChoices : posChoices).map((choice) => (
            <button
              key={choice.id}
              type="button"
              disabled={Boolean(feedback)}
              onClick={() => handleAnswer(choice.id)}
              className={`rounded-md border px-4 py-3 text-xs font-semibold transition-colors ${
                feedback && feedback.expected === choice.id
                  ? 'border-[var(--color-sage)] bg-[var(--color-sage)]/15 text-[var(--color-sage)] dark:text-emerald-300'
                  : 'border-[var(--color-hairline)] bg-[var(--color-paper)] text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]'
              }`}
            >
              {choice.label}
            </button>
          ))}
        </div>

        {feedback && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-hairline)] pt-4 text-xs dark:border-[var(--color-night-hairline)]">
            <span
              className={
                feedback.correct
                  ? 'font-semibold text-[var(--color-sage)] dark:text-emerald-400'
                  : 'font-semibold text-red-600 dark:text-red-400'
              }
            >
              {feedback.correct
                ? `Correct! ${current.article ? `${current.article} ` : ''}${current.german}`
                : `Correct category: ${feedback.expected} (${current.article ? `${current.article} ` : ''}${current.german})`}
            </span>
            <button
              type="button"
              onClick={next}
              className="rounded-md bg-[var(--color-prussian)] px-4 py-1.5 font-medium text-white"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      <div className="text-right">
        <button
          type="button"
          onClick={() => {
            setSeed((s) => s + 1);
            setIdx(0);
            setFeedback(null);
            setStats({ correct: 0, total: 0 });
          }}
          className="font-mono text-[11px] text-[var(--color-ink-muted)] hover:underline dark:text-slate-400"
        >
          Reshuffle deck
        </button>
      </div>
    </div>
  );
}

/* =========================== 6. SCORED 10-QUESTION RECALL TEST =========================== */
interface RecallQuestion {
  entry: LexiconEntry;
  type: 'de-to-en' | 'article';
  options: string[];
  correctAnswer: string;
}

function RecallTestMode({
  pool,
  fullLexicon,
  scopeLabel,
  onRecordReview,
  onRecordQuizResult,
}: VocabPracticeModesProps) {
  const [testRun, setTestRun] = useState(0);
  const [step, setStep] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const questions: RecallQuestion[] = useMemo(() => {
    const picked = shuffleArray(pool).slice(0, Math.min(10, pool.length));
    return picked.map((entry, idx) => {
      if (idx % 3 === 2 && (entry.article === 'der' || entry.article === 'die' || entry.article === 'das')) {
        return {
          entry,
          type: 'article',
          options: ['der', 'die', 'das'],
          correctAnswer: entry.article,
        };
      }
      const distractors = shuffleArray(fullLexicon.filter((e) => e.id !== entry.id))
        .slice(0, 3)
        .map((e) => shortMeaning(e.english));
      const correct = shortMeaning(entry.english);
      return {
        entry,
        type: 'de-to-en',
        options: shuffleArray([correct, ...distractors]),
        correctAnswer: correct,
      };
    });
  }, [fullLexicon, pool, testRun]);

  const current = questions[step];

  const handleChoose = (opt: string) => {
    if (selectedOpt || !current) return;
    setSelectedOpt(opt);
    const isCorrect = opt === current.correctAnswer;
    const nextScore = score + (isCorrect ? 1 : 0);
    setScore(nextScore);
    onRecordReview(current.entry.normalized, isCorrect ? 'good' : 'difficult');

    if (step + 1 >= questions.length) {
      window.setTimeout(() => {
        setFinished(true);
        onRecordQuizResult({
          chapterNumber: current.entry.firstChapter || 46,
          title: `Vocabulary Recall Test (${scopeLabel})`,
          score: nextScore,
          total: questions.length,
        });
      }, 650);
    }
  };

  const handleNext = () => {
    setSelectedOpt(null);
    setStep((s) => s + 1);
  };

  const restart = () => {
    setTestRun((r) => r + 1);
    setStep(0);
    setScore(0);
    setSelectedOpt(null);
    setFinished(false);
  };

  if (finished) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-[var(--color-hairline)] bg-white p-8 text-center dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
          Recall Test Complete · Saved to Dashboard
        </p>
        <p className="mt-3 font-editorial text-5xl font-semibold tabular-nums text-[var(--color-ink)] dark:text-[#EDEAE3]">
          {score} / {questions.length}
        </p>
        <p className="mt-1 font-mono text-sm text-[var(--color-ink-muted)] dark:text-slate-400">
          {pct}% accuracy · Scope: {scopeLabel}
        </p>
        <button
          type="button"
          onClick={restart}
          className="mt-6 rounded-md bg-[var(--color-prussian)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B]"
        >
          Take Another Recall Test
        </button>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between font-mono text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
        <span className="tabular-nums">
          Question {step + 1} of {questions.length}
        </span>
        <span className="tabular-nums">Score: {score}</span>
      </div>

      <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 sm:p-8 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
          {current.type === 'article' ? 'Recall Noun Gender Article' : 'Recall English Meaning'}
        </p>

        <div className="mt-2 flex items-center justify-between gap-3">
          <h3 className="font-editorial text-3xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
            {current.type === 'article'
              ? `___ ${current.entry.german}`
              : `${current.entry.article ? `${current.entry.article} ` : ''}${current.entry.german}`}
          </h3>
          <button
            type="button"
            onClick={() => void playGermanAudio(cleanGermanSpeakable(current.entry), 1)}
            className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] px-2.5 py-1.5 text-xs text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
          >
            <Volume2 className="h-3.5 w-3.5" /> Hear
          </button>
        </div>

        <div className="mt-6 space-y-2.5">
          {current.options.map((opt) => {
            const isCorrect = opt === current.correctAnswer;
            const isPicked = selectedOpt === opt;
            let cls =
              'border-[var(--color-hairline)] bg-[var(--color-paper)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]';
            if (selectedOpt) {
              if (isCorrect) {
                cls =
                  'border-[var(--color-sage)] bg-[var(--color-sage)]/12 text-[var(--color-sage)] dark:text-emerald-300';
              } else if (isPicked) {
                cls = 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300';
              }
            }
            return (
              <button
                key={opt}
                type="button"
                disabled={Boolean(selectedOpt)}
                onClick={() => handleChoose(opt)}
                className={`w-full rounded-md border px-4 py-3 text-left text-sm font-medium transition-colors ${cls}`}
              >
                {opt}
              </button>
            );
          })}
        </div>

        {selectedOpt && step + 1 < questions.length && (
          <div className="mt-5 text-right">
            <button
              type="button"
              onClick={handleNext}
              className="rounded-md bg-[var(--color-prussian)] px-4 py-2 text-xs font-medium text-white"
            >
              Next Question →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
