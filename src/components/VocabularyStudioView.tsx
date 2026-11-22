import {
  AlertTriangle,
  BookmarkCheck,
  BookmarkPlus,
  BookOpen,
  CheckCircle2,
  Flag,
  GraduationCap,
  Headphones,
  Layers,
  Search,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  getVoiceDiagnostics,
  playGermanAudio,
  subscribeVoicesChanged,
  type VoiceDiagnostics,
} from '../services/germanAudio';
import {
  findExampleSentenceInBook,
  normalizeGermanLookup,
  stripStressAccents,
} from '../services/germanLinguistics';
import type {
  LexiconEntry,
  ParsedBook,
  SavedVocabItem,
  UserStudyState,
  VocabCategory,
} from '../types/book';
import { PronunciationAudioPanel } from './vocabulary/PronunciationAudioPanel';
import {
  VocabPracticeModes,
  type PracticeModeId,
} from './vocabulary/VocabPracticeModes';

export type VocabStudioTab = 'database' | PracticeModeId | 'audio';

type VocabScope = 'all' | 'saved' | 'difficult' | 'due' | 'mastered';

interface VocabularyStudioViewProps {
  book: ParsedBook;
  studyState: UserStudyState;
  initialTab?: VocabStudioTab;
  onOpenChapter: (chapterNumber: number) => void;
  onToggleSavedVocab: (item: Omit<SavedVocabItem, 'id' | 'savedAt'>) => void;
  onRecordVocabReview: (wordKey: string, outcome: 'difficult' | 'good' | 'mastered') => void;
  onToggleVocabDifficult: (wordKey: string) => void;
  onRecordQuizResult: (result: {
    chapterNumber: number;
    title: string;
    score: number;
    total: number;
  }) => void;
  onSelectVoiceURI: (uri: string | null) => void;
}

const STUDIO_TABS: { id: VocabStudioTab; label: string }[] = [
  { id: 'database', label: 'Dictionary & Deck' },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'de-to-en', label: 'DE → EN' },
  { id: 'en-to-de', label: 'EN → DE' },
  { id: 'matching', label: 'Word Matching' },
  { id: 'categorise', label: 'Categorise' },
  { id: 'recall-test', label: 'Recall Test' },
  { id: 'audio', label: 'Audio & Pronunciation' },
];

const CATEGORIES: ('All' | VocabCategory)[] = [
  'All',
  'Noun',
  'Verb',
  'Adjective / Adverb',
  'Preposition',
  'Conjunction',
  'Pronoun / Expression',
];

export function VocabularyStudioView({
  book,
  studyState,
  initialTab = 'database',
  onOpenChapter,
  onToggleSavedVocab,
  onRecordVocabReview,
  onToggleVocabDifficult,
  onRecordQuizResult,
  onSelectVoiceURI,
}: VocabularyStudioViewProps) {
  const [activeTab, setActiveTab] = useState<VocabStudioTab>(initialTab);
  const [scope, setScope] = useState<VocabScope>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'All' | VocabCategory>('All');
  const [articleFilter, setArticleFilter] = useState<'all' | 'der' | 'die' | 'das'>('all');
  const [chapterFilter, setChapterFilter] = useState<string>('all');
  const [pageSize, setPageSize] = useState(40);
  const [expandedExampleId, setExpandedExampleId] = useState<string | null>(null);
  const [voiceDiag, setVoiceDiag] = useState<VoiceDiagnostics>(() => getVoiceDiagnostics());

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const sync = () => setVoiceDiag(getVoiceDiagnostics());
    const unsub = subscribeVoicesChanged(sync);
    const t = window.setTimeout(sync, 400);
    return () => {
      unsub();
      window.clearTimeout(t);
    };
  }, [studyState.preferredGermanVoiceURI]);

  // Build unified vocabulary list: Chapter 46 lexicon + any custom saved words not already in Ch. 46
  const allEntries: LexiconEntry[] = useMemo(() => {
    const map = new Map<string, LexiconEntry>();
    for (const entry of book.lexicon) {
      map.set(entry.normalized, entry);
    }
    for (const saved of studyState.savedVocab) {
      const norm = normalizeGermanLookup(saved.german);
      if (!map.has(norm)) {
        map.set(norm, {
          id: saved.id,
          german: saved.german,
          normalized: norm,
          article:
            saved.article === 'der' || saved.article === 'die' || saved.article === 'das'
              ? saved.article
              : undefined,
          genitiveAndPlural: saved.plural,
          partOfSpeech: saved.partOfSpeech || 'Saved Word',
          category: saved.article ? 'Noun' : 'Adjective / Adverb',
          english: saved.english,
          pronunciation: saved.pronunciation || '',
          rawEntry: `${saved.article ? `${saved.article} ` : ''}${saved.german} — ${saved.english}`,
          sourceChapter: saved.chapterNumber,
          firstChapter: saved.chapterNumber,
          exampleSentence: saved.exampleSentence,
        });
      }
    }
    return Array.from(map.values());
  }, [book.lexicon, studyState.savedVocab]);

  const savedNormalizedSet = useMemo(
    () => new Set(studyState.savedVocab.map((v) => normalizeGermanLookup(v.german))),
    [studyState.savedVocab]
  );

  const nowMs = Date.now();
  const counts = useMemo(() => {
    let difficult = 0;
    let due = 0;
    let mastered = 0;
    for (const entry of allEntries) {
      const rec = studyState.vocabProgress[entry.normalized];
      if (!rec) continue;
      if (rec.difficult) difficult++;
      if (rec.mastery === 'mastered') mastered++;
      if (new Date(rec.nextReviewAt).getTime() <= nowMs) due++;
    }
    return {
      total: allEntries.length,
      saved: studyState.savedVocab.length,
      difficult,
      due,
      mastered,
    };
  }, [allEntries, nowMs, studyState.savedVocab.length, studyState.vocabProgress]);

  const filteredPool = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const chNum = chapterFilter === 'all' ? null : parseInt(chapterFilter, 10);

    return allEntries.filter((entry) => {
      const rec = studyState.vocabProgress[entry.normalized];
      if (scope === 'saved' && !savedNormalizedSet.has(entry.normalized)) return false;
      if (scope === 'difficult' && !rec?.difficult) return false;
      if (scope === 'mastered' && rec?.mastery !== 'mastered') return false;
      if (scope === 'due' && (!rec || new Date(rec.nextReviewAt).getTime() > nowMs)) return false;

      if (categoryFilter !== 'All' && entry.category !== categoryFilter) return false;
      if (articleFilter !== 'all' && entry.article !== articleFilter) return false;
      if (chNum !== null && entry.firstChapter !== chNum) return false;

      if (!q) return true;
      return (
        entry.german.toLowerCase().includes(q) ||
        entry.normalized.includes(q) ||
        entry.english.toLowerCase().includes(q) ||
        (entry.article && `${entry.article} ${entry.german}`.toLowerCase().includes(q))
      );
    });
  }, [
    allEntries,
    articleFilter,
    categoryFilter,
    chapterFilter,
    nowMs,
    savedNormalizedSet,
    scope,
    searchQuery,
    studyState.vocabProgress,
  ]);

  const scopeLabel =
    scope === 'all'
      ? chapterFilter !== 'all'
        ? `Chapter ${chapterFilter}`
        : categoryFilter !== 'All'
          ? categoryFilter
          : 'All Textbook Vocabulary'
      : scope === 'saved'
        ? 'My Saved Deck'
        : scope === 'difficult'
          ? 'Difficult Words'
          : scope === 'due'
            ? 'Due for Revision'
            : 'Mastered Words';

  const speakEntry = (entry: LexiconEntry, rate: 1 | 0.65) => {
    const clean = stripStressAccents(entry.german).replace(/-/g, '').trim();
    const speakable = entry.article ? `${entry.article} ${clean}` : clean;
    void playGermanAudio(speakable, rate);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header & Voice Status Strip */}
      <header className="border-b border-[var(--color-hairline)] pb-6 dark:border-[var(--color-night-hairline)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
              Stage 6 · Searchable Textbook Lexicon, Drills & German Audio
            </p>
            <h1 className="mt-1.5 font-editorial text-3xl font-semibold tracking-tight text-[var(--color-ink)] dark:text-[#EDEAE3]">
              Vocabulary &amp; Pronunciation Studio
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-muted)] dark:text-slate-400">
              Built directly from all {book.lexicon.length.toLocaleString()} entries in Chapter 46, mapped to
              their first chapter appearances across <em>German Made Simple</em>.
            </p>
          </div>

          {/* Live German Voice Status Shortcut */}
          <button
            type="button"
            onClick={() => setActiveTab('audio')}
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
              voiceDiag.hasGermanVoice
                ? 'border-[var(--color-sage)]/40 bg-white text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-emerald-600/40 dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]'
                : 'border-[var(--color-ochre)]/60 bg-amber-50/70 text-[var(--color-ochre)] dark:border-amber-500/50 dark:bg-amber-950/30 dark:text-amber-300'
            }`}
          >
            {voiceDiag.hasGermanVoice ? (
              <>
                <Headphones className="h-3.5 w-3.5 text-[var(--color-sage)] dark:text-emerald-400" />
                <span>{voiceDiag.activeVoiceLabel}</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>No German OS Voice Detected · Configure</span>
              </>
            )}
          </button>
        </div>

        {/* Summary Metrics Row (Zero-Pill Inline Tabular Stats) */}
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-[var(--color-hairline)] pt-4 sm:grid-cols-5 dark:border-[var(--color-night-hairline)]">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
              Book Lexicon
            </dt>
            <dd className="mt-0.5 font-editorial text-xl font-semibold tabular-nums text-[var(--color-ink)] dark:text-[#EDEAE3]">
              {counts.total.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
              My Saved Deck
            </dt>
            <dd className="mt-0.5 font-editorial text-xl font-semibold tabular-nums text-[var(--color-prussian)] dark:text-[#7AB3E6]">
              {counts.saved}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
              Difficult Words
            </dt>
            <dd className="mt-0.5 font-editorial text-xl font-semibold tabular-nums text-[var(--color-ochre)] dark:text-amber-400">
              {counts.difficult}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
              Due for Review
            </dt>
            <dd className="mt-0.5 font-editorial text-xl font-semibold tabular-nums text-[var(--color-ink)] dark:text-[#EDEAE3]">
              {counts.due}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
              Mastered
            </dt>
            <dd className="mt-0.5 font-editorial text-xl font-semibold tabular-nums text-[var(--color-sage)] dark:text-emerald-400">
              {counts.mastered}
            </dd>
          </div>
        </dl>

        {/* Mode Tabs */}
        <nav
          aria-label="Vocabulary studio modes"
          className="mt-5 flex flex-wrap items-center gap-1 border-t border-[var(--color-hairline)] pt-4 dark:border-[var(--color-night-hairline)]"
        >
          {STUDIO_TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[var(--color-prussian)] text-white dark:bg-[#2B649B]'
                    : 'text-[var(--color-ink-muted)] hover:bg-white hover:text-[var(--color-ink)] dark:text-slate-400 dark:hover:bg-[var(--color-night-surface)] dark:hover:text-[#EDEAE3]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Shared Scope & Filter Bar (shown for Dictionary & all Practice Modes) */}
      {activeTab !== 'audio' && (
        <section className="mt-6 flex flex-col gap-3 rounded-lg border border-[var(--color-hairline)] bg-white p-4 lg:flex-row lg:items-center lg:justify-between dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `All (${counts.total})` },
                { id: 'saved', label: `Saved (${counts.saved})` },
                { id: 'difficult', label: `Difficult (${counts.difficult})` },
                { id: 'due', label: `Due (${counts.due})` },
                { id: 'mastered', label: `Mastered (${counts.mastered})` },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setScope(s.id);
                  setPageSize(40);
                }}
                className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                  scope === s.id
                    ? 'border-[var(--color-prussian)] bg-[var(--color-prussian)]/10 text-[var(--color-prussian)] dark:border-[#5B9BD5] dark:text-[#7AB3E6]'
                    : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-400'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeTab === 'database' && (
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-ink-muted)]" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPageSize(40);
                  }}
                  placeholder="Search German or English…"
                  className="w-48 rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] py-1.5 pr-2.5 pl-8 text-xs text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none sm:w-56 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
                />
              </div>
            )}

            <select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as 'All' | VocabCategory)}
              className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] px-2.5 py-1.5 text-xs text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c === 'All' ? 'All Categories' : c}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by article"
              value={articleFilter}
              onChange={(e) => setArticleFilter(e.target.value as 'all' | 'der' | 'die' | 'das')}
              className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] px-2.5 py-1.5 text-xs text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
            >
              <option value="all">All Articles</option>
              <option value="der">der (masc.)</option>
              <option value="die">die (fem.)</option>
              <option value="das">das (neut.)</option>
            </select>

            <select
              aria-label="Filter by source chapter"
              value={chapterFilter}
              onChange={(e) => setChapterFilter(e.target.value)}
              className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] px-2.5 py-1.5 text-xs text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
            >
              <option value="all">All Chapters (1–44)</option>
              {book.chapters
                .filter((c) => c.number <= 44)
                .map((c) => (
                  <option key={c.number} value={String(c.number)}>
                    Ch. {c.number}: {c.englishTitle.slice(0, 28)}
                  </option>
                ))}
            </select>

            <span className="font-mono text-[11px] tabular-nums text-[var(--color-ink-muted)] dark:text-slate-400">
              {filteredPool.length} words
            </span>
          </div>
        </section>
      )}

      {/* ACTIVE WORKSPACE CONTENT */}
      <div className="mt-6">
        {activeTab === 'audio' ? (
          <PronunciationAudioPanel
            book={book}
            preferredVoiceURI={studyState.preferredGermanVoiceURI}
            onSelectVoiceURI={onSelectVoiceURI}
            onOpenChapter={onOpenChapter}
          />
        ) : activeTab === 'database' ? (
          <section className="space-y-4">
            {filteredPool.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--color-hairline)] bg-white p-10 text-center dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
                <p className="text-sm text-[var(--color-ink-muted)] dark:text-slate-400">
                  No vocabulary entries match your active filters.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setScope('all');
                    setSearchQuery('');
                    setCategoryFilter('All');
                    setArticleFilter('all');
                    setChapterFilter('all');
                  }}
                  className="mt-3 text-xs font-medium text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
                >
                  Reset all filters
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {filteredPool.slice(0, pageSize).map((entry) => {
                    const isSaved = savedNormalizedSet.has(entry.normalized);
                    const rec = studyState.vocabProgress[entry.normalized];
                    const showExample = expandedExampleId === entry.id;
                    const exampleSentence = showExample
                      ? entry.exampleSentence ||
                        findExampleSentenceInBook(
                          stripStressAccents(entry.german).replace(/-/g, ''),
                          book,
                          entry.firstChapter
                            ? book.chapters.find((c) => c.number === entry.firstChapter)
                            : undefined
                        )
                      : undefined;

                    return (
                      <article
                        key={entry.id}
                        className="flex flex-col justify-between rounded-lg border border-[var(--color-hairline)] bg-white p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                                <span>{entry.partOfSpeech}</span>
                                {rec?.mastery === 'mastered' && (
                                  <span className="inline-flex items-center gap-0.5 text-[var(--color-sage)] dark:text-emerald-400">
                                    <CheckCircle2 className="h-3 w-3" /> Mastered
                                  </span>
                                )}
                                {rec?.difficult && (
                                  <span className="text-[var(--color-ochre)] dark:text-amber-400">
                                    ▲ Difficult
                                  </span>
                                )}
                              </div>

                              <h3 className="mt-1 font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                                {entry.article && (
                                  <span
                                    className={`mr-1.5 font-sans text-sm font-semibold ${
                                      entry.article === 'der'
                                        ? 'text-[var(--color-prussian)] dark:text-[#7AB3E6]'
                                        : entry.article === 'die'
                                          ? 'text-rose-700 dark:text-rose-300'
                                          : 'text-[var(--color-sage)] dark:text-emerald-300'
                                    }`}
                                  >
                                    {entry.article}
                                  </span>
                                )}
                                {entry.german}
                              </h3>

                              {(entry.genitiveAndPlural || entry.principalParts) && (
                                <p className="mt-0.5 font-mono text-[11px] text-[var(--color-ink-muted)] dark:text-slate-400">
                                  {entry.genitiveAndPlural || entry.principalParts}
                                </p>
                              )}
                            </div>

                            {/* Audio Buttons */}
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => speakEntry(entry, 1)}
                                title="Pronounce in German (normal speed)"
                                className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] px-2 py-1 text-[11px] font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
                              >
                                <Volume2 className="h-3 w-3" />
                                <span>1.0×</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => speakEntry(entry, 0.65)}
                                title="Pronounce slowly in German (0.65×)"
                                className="rounded border border-[var(--color-hairline)] px-1.5 py-1 text-[11px] text-[var(--color-ink-muted)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-slate-300"
                              >
                                0.65×
                              </button>
                            </div>
                          </div>

                          <p className="mt-2 text-sm text-[var(--color-ink)] dark:text-slate-200">
                            {entry.english}
                          </p>
                          <p className="mt-1 font-mono text-[11px] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                            {entry.pronunciation}
                          </p>

                          {showExample && (
                            <p className="mt-2 rounded bg-[var(--color-paper)] p-2.5 text-xs leading-relaxed italic text-[var(--color-ink-muted)] dark:bg-[var(--color-night)] dark:text-slate-300">
                              {exampleSentence
                                ? `“${exampleSentence}”`
                                : 'No standalone sentence match found in Chapters 3–44; see Chapter 46 glossary entry.'}
                            </p>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-hairline)] pt-2.5 text-[11px] dark:border-[var(--color-night-hairline)]">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => onOpenChapter(entry.firstChapter || 46)}
                              className="inline-flex items-center gap-1 font-mono text-[var(--color-ink-muted)] hover:text-[var(--color-prussian)] dark:text-slate-400 dark:hover:text-[#7AB3E6]"
                            >
                              <BookOpen className="h-3 w-3" />
                              <span>
                                {entry.firstChapter ? `Ch. ${entry.firstChapter}` : 'Ch. 46'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setExpandedExampleId(showExample ? null : entry.id)}
                              className="inline-flex items-center gap-1 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:text-slate-400 dark:hover:text-white"
                            >
                              <Sparkles className="h-3 w-3" />
                              <span>{showExample ? 'Hide example' : 'Example'}</span>
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onToggleVocabDifficult(entry.normalized)}
                              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-medium ${
                                rec?.difficult
                                  ? 'border-[var(--color-ochre)] text-[var(--color-ochre)] dark:border-amber-400 dark:text-amber-300'
                                  : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-400'
                              }`}
                            >
                              <Flag className="h-3 w-3" />
                              <span>{rec?.difficult ? 'Difficult' : 'Flag'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onToggleSavedVocab({
                                  german: entry.german,
                                  english: entry.english,
                                  article: entry.article,
                                  plural: entry.genitiveAndPlural,
                                  partOfSpeech: entry.partOfSpeech,
                                  pronunciation: entry.pronunciation,
                                  chapterNumber: entry.firstChapter || 46,
                                })
                              }
                              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-medium ${
                                isSaved
                                  ? 'border-[var(--color-sage)] bg-[var(--color-sage)]/10 text-[var(--color-sage)] dark:border-emerald-500 dark:text-emerald-300'
                                  : 'border-[var(--color-hairline)] text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]'
                              }`}
                            >
                              {isSaved ? (
                                <>
                                  <BookmarkCheck className="h-3 w-3" />
                                  <span>Saved</span>
                                </>
                              ) : (
                                <>
                                  <BookmarkPlus className="h-3 w-3" />
                                  <span>Save</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {filteredPool.length > pageSize && (
                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => setPageSize((s) => s + 40)}
                      className="rounded-md border border-[var(--color-hairline)] bg-white px-5 py-2 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]"
                    >
                      Load more ({filteredPool.length - pageSize} remaining)
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        ) : (
          <VocabPracticeModes
            mode={activeTab}
            pool={filteredPool}
            fullLexicon={allEntries}
            book={book}
            vocabProgress={studyState.vocabProgress}
            scopeLabel={scopeLabel}
            onRecordReview={onRecordVocabReview}
            onToggleDifficult={onToggleVocabDifficult}
            onRecordQuizResult={onRecordQuizResult}
          />
        )}
      </div>

      {/* Quick Studio Footer Legend */}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-hairline)] pt-4 font-mono text-[11px] text-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" />
          Gender coding: der (blue · masc.) · die (rose · fem.) · das (sage · neut.)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <GraduationCap className="h-3.5 w-3.5" />
          Recall Test scores automatically log to your Dashboard
        </span>
      </div>
    </main>
  );
}
