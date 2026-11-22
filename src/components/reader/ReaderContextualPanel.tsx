import {
  ArrowLeft,
  BookmarkCheck,
  BookmarkPlus,
  BookOpen,
  Edit3,
  Highlighter,
  Layers,
  MessageSquarePlus,
  Search,
  Sparkles,
  Square,
  StickyNote,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  analyzeGermanPassage,
  analyzeGermanWord,
  speakGermanText,
  stopGermanSpeech,
  type PassageAnalysisResult,
  type WordAnalysisResult,
} from '../../services/germanLinguistics';
import type {
  BookChapter,
  HighlightColor,
  ParsedBook,
  ReaderAnnotation,
  ReaderHighlight,
  SavedVocabItem,
} from '../../types/book';

export type ContextPanelTab = 'inspector' | 'highlights' | 'notes';

interface ReaderContextualPanelProps {
  book: ParsedBook;
  chapter: BookChapter;
  selectedText: string;
  activeTab: ContextPanelTab;
  onSelectTab: (tab: ContextPanelTab) => void;
  onSelectManualText: (text: string) => void;
  onClearSelection: () => void;
  savedVocab: SavedVocabItem[];
  highlights: ReaderHighlight[];
  annotations: ReaderAnnotation[];
  onToggleSavedVocab: (item: Omit<SavedVocabItem, 'id' | 'savedAt'>) => void;
  onAddHighlight: (text: string, color: HighlightColor) => void;
  onRemoveHighlight: (id: string) => void;
  onAddAnnotation: (selectedText: string, note: string) => void;
  onUpdateAnnotation: (id: string, note: string) => void;
  onDeleteAnnotation: (id: string) => void;
  onJumpToChapter: (chapterNumber: number) => void;
  onOpenAudioSettings?: () => void;
  onCloseMobile?: () => void;
}

const HIGHLIGHT_OPTIONS: { color: HighlightColor; label: string; dotClass: string }[] = [
  { color: 'amber', label: 'Amber', dotClass: 'bg-amber-400' },
  { color: 'sage', label: 'Sage', dotClass: 'bg-emerald-500' },
  { color: 'prussian', label: 'Blue', dotClass: 'bg-sky-500' },
];

export function ReaderContextualPanel({
  book,
  chapter,
  selectedText,
  activeTab,
  onSelectTab,
  onSelectManualText,
  onClearSelection,
  savedVocab,
  highlights,
  annotations,
  onToggleSavedVocab,
  onAddHighlight,
  onRemoveHighlight,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onJumpToChapter,
  onOpenAudioSettings,
  onCloseMobile,
}: ReaderContextualPanelProps) {
  const [manualInput, setManualInput] = useState('');
  const [drilldownWord, setDrilldownWord] = useState<string | null>(null);
  const [speakingRate, setSpeakingRate] = useState<1 | 0.65 | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Inline note composer state
  const [showNoteComposer, setShowNoteComposer] = useState(false);
  const [draftNote, setDraftNote] = useState('');
  const [generalNoteDraft, setGeneralNoteDraft] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  const [showAllBookHighlights, setShowAllBookHighlights] = useState(false);
  const [showAllBookNotes, setShowAllBookNotes] = useState(false);

  const effectiveSelection = selectedText.trim();
  const wordCountInSelection = effectiveSelection
    ? effectiveSelection.split(/\s+/).filter(Boolean).length
    : 0;

  const isSingleWordMode = Boolean(drilldownWord) || wordCountInSelection === 1;

  const wordAnalysis: WordAnalysisResult | null = useMemo(() => {
    const target = drilldownWord || (wordCountInSelection === 1 ? effectiveSelection : '');
    if (!target) return null;
    return analyzeGermanWord(target, book, chapter);
  }, [book, chapter, drilldownWord, effectiveSelection, wordCountInSelection]);

  const passageAnalysis: PassageAnalysisResult | null = useMemo(() => {
    if (drilldownWord || wordCountInSelection <= 1 || !effectiveSelection) return null;
    return analyzeGermanPassage(effectiveSelection, book, chapter);
  }, [book, chapter, drilldownWord, effectiveSelection, wordCountInSelection]);

  const chapterHighlights = useMemo(
    () =>
      showAllBookHighlights
        ? highlights
        : highlights.filter((h) => h.chapterNumber === chapter.number),
    [chapter.number, highlights, showAllBookHighlights]
  );

  const chapterAnnotations = useMemo(
    () =>
      showAllBookNotes
        ? annotations
        : annotations.filter((a) => a.chapterNumber === chapter.number),
    [annotations, chapter.number, showAllBookNotes]
  );

  const isWordSaved = (german: string) =>
    savedVocab.some((v) => v.german.toLowerCase() === german.toLowerCase());

  const handlePlayAudio = (text: string, rate: 1 | 0.65) => {
    setAudioError(null);
    if (speakingRate === rate) {
      stopGermanSpeech();
      setSpeakingRate(null);
      return;
    }
    speakGermanText(
      text,
      rate,
      () => setSpeakingRate(rate),
      () => setSpeakingRate(null),
      (msg) => setAudioError(msg),
      (warn) => setAudioError(warn)
    );
  };

  const handleSaveWord = (w: WordAnalysisResult) => {
    onToggleSavedVocab({
      german: w.lemma,
      english: w.english,
      article: w.article,
      plural: w.plural,
      partOfSpeech: w.partOfSpeech,
      pronunciation: w.pronunciation,
      exampleSentence: w.exampleSentence,
      chapterNumber: chapter.number,
    });
  };

  const handleSubmitSelectionNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftNote.trim()) return;
    const anchor = drilldownWord || effectiveSelection || `Chapter ${chapter.number}`;
    onAddAnnotation(anchor, draftNote);
    setDraftNote('');
    setShowNoteComposer(false);
    onSelectTab('notes');
  };

  const handleSubmitGeneralNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!generalNoteDraft.trim()) return;
    onAddAnnotation(`Chapter ${chapter.number}: ${chapter.englishTitle}`, generalNoteDraft);
    setGeneralNoteDraft('');
  };

  const handleManualLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    setDrilldownWord(null);
    onSelectManualText(manualInput.trim());
    onSelectTab('inspector');
  };

  return (
    <aside className="flex h-full flex-col border-l border-[var(--color-hairline)] bg-[var(--color-paper)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
      {/* Contextual Panel Header & Tabs */}
      <div className="flex items-center justify-between border-b border-[var(--color-hairline)] px-3 py-2 dark:border-[var(--color-night-hairline)]">
        <div className="flex items-center gap-1">
          {(
            [
              { id: 'inspector', label: 'Inspector', icon: Sparkles },
              {
                id: 'highlights',
                label: `Highlights (${highlights.filter((h) => h.chapterNumber === chapter.number).length})`,
                icon: Highlighter,
              },
              {
                id: 'notes',
                label: `Notes (${annotations.filter((a) => a.chapterNumber === chapter.number).length})`,
                icon: StickyNote,
              },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-white text-[var(--color-prussian)] shadow-2xs dark:bg-[var(--color-night-subtle)] dark:text-[#7AB3E6]'
                    : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:text-slate-400 dark:hover:text-[#EDEAE3]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close contextual side panel"
            className="rounded p-1 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] xl:hidden dark:text-slate-400"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Panel Scroll Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* TAB 1: CONTEXTUAL INSPECTOR */}
        {activeTab === 'inspector' && (
          <div className="space-y-4">
            {/* Quick Manual Lookup Bar */}
            <form onSubmit={handleManualLookup} className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-ink-muted)] dark:text-slate-400" />
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Type a German word or sentence to analyze…"
                className="w-full rounded-md border border-[var(--color-hairline)] bg-white py-1.5 pr-14 pl-8 text-xs text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]/70 focus:border-[var(--color-prussian)] focus:outline-none dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
              />
              <button
                type="submit"
                className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded px-2 py-0.5 text-[11px] font-medium text-[var(--color-prussian)] hover:bg-[var(--color-paper-subtle)] dark:text-[#7AB3E6] dark:hover:bg-[var(--color-night-subtle)]"
              >
                Check
              </button>
            </form>

            {/* Empty State when no selection */}
            {!effectiveSelection && !drilldownWord && (
              <div className="space-y-4 rounded-lg border border-dashed border-[var(--color-hairline)] bg-white/70 p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]/40">
                <div className="flex items-start gap-2.5">
                  <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-prussian)] dark:text-[#7AB3E6]" />
                  <div className="space-y-1.5">
                    <h3 className="font-editorial text-base font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                      Select any German text in the book
                    </h3>
                    <p className="text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
                      Double-click a single German word for article, plural, part of speech, pronunciation,
                      textbook example, and audio—or drag across a full sentence or paragraph for word-by-word
                      explanation and grammar breakdown.
                    </p>
                  </div>
                </div>

                <div className="border-t border-[var(--color-hairline)] pt-3 dark:border-[var(--color-night-hairline)]">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                    Try inspecting a sample from the book
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {['Familie', 'Arbeitszimmer', 'abfahren', 'Herr Clark lernt Deutsch, weil er nach Deutschland fährt.'].map(
                      (sample) => (
                        <button
                          key={sample}
                          type="button"
                          onClick={() => {
                            setDrilldownWord(null);
                            onSelectManualText(sample);
                          }}
                          className="rounded border border-[var(--color-hairline)] bg-white px-2 py-1 text-left text-[11px] text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-slate-200"
                        >
                          {sample}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* SINGLE WORD INSPECTOR */}
            {isSingleWordMode && wordAnalysis && (
              <div className="space-y-4 rounded-lg border border-[var(--color-hairline)] bg-white p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {drilldownWord && (
                      <button
                        type="button"
                        onClick={() => setDrilldownWord(null)}
                        className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
                      >
                        <ArrowLeft className="h-3 w-3" />
                        <span>Back to selected passage</span>
                      </button>
                    )}
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                      {wordAnalysis.partOfSpeech}
                    </p>
                    <h3 className="mt-0.5 font-editorial text-2xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                      {wordAnalysis.article && (
                        <span className="mr-1.5 font-sans text-base font-medium text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                          {wordAnalysis.article}
                        </span>
                      )}
                      {wordAnalysis.lemma}
                    </h3>
                    {wordAnalysis.plural && (
                      <p className="mt-0.5 font-mono text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                        Genitive / Plural: {wordAnalysis.plural}
                      </p>
                    )}
                    {wordAnalysis.principalParts && (
                      <p className="mt-0.5 font-mono text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                        Forms: {wordAnalysis.principalParts}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setDrilldownWord(null);
                      onClearSelection();
                    }}
                    aria-label="Clear selection"
                    className="rounded p-1 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:text-slate-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Pronunciation & German Audio */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] px-3 py-2 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                      Pronunciation
                    </span>
                    <p className="font-mono text-xs text-[var(--color-ink)] dark:text-[#EDEAE3]">
                      {wordAnalysis.pronunciation}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handlePlayAudio(wordAnalysis.article ? `${wordAnalysis.article} ${wordAnalysis.lemma}` : wordAnalysis.query, 1)}
                      className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
                    >
                      {speakingRate === 1 ? <Square className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                      <span>Listen</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePlayAudio(wordAnalysis.article ? `${wordAnalysis.article} ${wordAnalysis.lemma}` : wordAnalysis.query, 0.65)}
                      className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] bg-white px-2 py-1 text-[11px] font-medium text-[var(--color-ink-muted)] hover:border-[var(--color-prussian)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-slate-300"
                    >
                      <span>0.65×</span>
                    </button>
                  </div>
                </div>
                {audioError && (
                  <p className="text-[11px] leading-relaxed text-[var(--color-ochre)] dark:text-amber-300">
                    {audioError}{' '}
                    {onOpenAudioSettings && (
                      <button
                        type="button"
                        onClick={onOpenAudioSettings}
                        className="font-semibold underline underline-offset-2"
                      >
                        Configure German voice →
                      </button>
                    )}
                  </p>
                )}

                {/* English Meaning */}
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                    English Meaning ({wordAnalysis.matchedFrom === 'textbook-glossary' ? 'Ch. 46 Textbook Glossary' : wordAnalysis.matchedFrom === 'core-grammar' ? 'Core German Grammar' : 'Lookup Note'})
                  </p>
                  <p className="mt-1 text-sm leading-relaxed font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                    {wordAnalysis.english}
                  </p>
                  {wordAnalysis.grammarNote && (
                    <p className="mt-1 text-xs text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                      {wordAnalysis.grammarNote}
                    </p>
                  )}
                </div>

                {/* Example Usage from Textbook */}
                {wordAnalysis.exampleSentence && (
                  <div className="border-t border-[var(--color-hairline)] pt-3 dark:border-[var(--color-night-hairline)]">
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                      Example from Textbook
                    </p>
                    <p className="mt-1 text-xs leading-relaxed italic text-[var(--color-ink-muted)] dark:text-slate-300">
                      &ldquo;{wordAnalysis.exampleSentence}&rdquo;
                    </p>
                  </div>
                )}

                {/* Actions: Save to Vocabulary, Highlight, Add Note */}
                <div className="space-y-2.5 border-t border-[var(--color-hairline)] pt-3 dark:border-[var(--color-night-hairline)]">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleSaveWord(wordAnalysis)}
                      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                        isWordSaved(wordAnalysis.lemma)
                          ? 'border-[var(--color-sage)] bg-[var(--color-sage)] text-white dark:border-emerald-600 dark:bg-emerald-700'
                          : 'border-[var(--color-prussian)] bg-[var(--color-prussian)] text-white hover:bg-[var(--color-prussian-hover)] dark:border-[#2B649B] dark:bg-[#2B649B]'
                      }`}
                    >
                      {isWordSaved(wordAnalysis.lemma) ? (
                        <>
                          <BookmarkCheck className="h-3.5 w-3.5" />
                          <span>Saved in Vocabulary</span>
                        </>
                      ) : (
                        <>
                          <BookmarkPlus className="h-3.5 w-3.5" />
                          <span>Save to Vocabulary</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowNoteComposer((v) => !v)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                      <span>Note</span>
                    </button>
                  </div>

                  {/* Highlight Color Row */}
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                      Highlight in text:
                    </span>
                    <div className="flex items-center gap-1.5">
                      {HIGHLIGHT_OPTIONS.map((opt) => (
                        <button
                          key={opt.color}
                          type="button"
                          onClick={() => onAddHighlight(wordAnalysis.query, opt.color)}
                          className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] px-2 py-0.5 text-[11px] text-[var(--color-ink-muted)] hover:border-[var(--color-ink)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-300"
                        >
                          <span className={`h-2 w-2 rounded-full ${opt.dotClass}`} />
                          <span>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Inline Personal Note Form */}
                {showNoteComposer && (
                  <form
                    onSubmit={handleSubmitSelectionNote}
                    className="space-y-2 border-t border-[var(--color-hairline)] pt-3 dark:border-[var(--color-night-hairline)]"
                  >
                    <textarea
                      rows={3}
                      value={draftNote}
                      onChange={(e) => setDraftNote(e.target.value)}
                      placeholder={`Add a personal study note for "${wordAnalysis.query}"…`}
                      className="w-full rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] p-2 text-xs text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowNoteComposer(false)}
                        className="px-2.5 py-1 text-xs text-[var(--color-ink-muted)]"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="rounded-md bg-[var(--color-prussian)] px-3 py-1 text-xs font-medium text-white"
                      >
                        Save Note
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* SENTENCE / PARAGRAPH INSPECTOR */}
            {!isSingleWordMode && passageAnalysis && (
              <div className="space-y-4 rounded-lg border border-[var(--color-hairline)] bg-white p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                      Selected Passage ({passageAnalysis.tokens.length} words)
                    </p>
                    <p className="mt-1 font-editorial text-base leading-relaxed font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                      &ldquo;{passageAnalysis.originalText}&rdquo;
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClearSelection}
                    aria-label="Clear selection"
                    className="rounded p-1 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:text-slate-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Audio + Highlight + Note Controls */}
                <div className="flex flex-wrap items-center gap-1.5 border-y border-[var(--color-hairline)] py-2.5 dark:border-[var(--color-night-hairline)]">
                  <button
                    type="button"
                    onClick={() => handlePlayAudio(passageAnalysis.originalText, 1)}
                    className="inline-flex items-center gap-1 rounded bg-[var(--color-prussian)] px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B]"
                  >
                    {speakingRate === 1 ? <Square className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                    <span>Audio (1.0×)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePlayAudio(passageAnalysis.originalText, 0.65)}
                    className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
                  >
                    <span>Slow (0.65×)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNoteComposer((v) => !v)}
                    className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-300"
                  >
                    <MessageSquarePlus className="h-3 w-3" />
                    <span>Annotate</span>
                  </button>
                </div>
                {audioError && (
                  <p className="text-[11px] leading-relaxed text-[var(--color-ochre)] dark:text-amber-300">
                    {audioError}{' '}
                    {onOpenAudioSettings && (
                      <button
                        type="button"
                        onClick={onOpenAudioSettings}
                        className="font-semibold underline underline-offset-2"
                      >
                        Configure German voice →
                      </button>
                    )}
                  </p>
                )}

                {/* Highlight Palette */}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                    Highlight passage:
                  </span>
                  <div className="flex items-center gap-1.5">
                    {HIGHLIGHT_OPTIONS.map((opt) => (
                      <button
                        key={opt.color}
                        type="button"
                        onClick={() => onAddHighlight(passageAnalysis.originalText, opt.color)}
                        className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] px-2 py-0.5 text-[11px] text-[var(--color-ink-muted)] hover:border-[var(--color-ink)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-300"
                      >
                        <span className={`h-2 w-2 rounded-full ${opt.dotClass}`} />
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {showNoteComposer && (
                  <form onSubmit={handleSubmitSelectionNote} className="space-y-2">
                    <textarea
                      rows={3}
                      value={draftNote}
                      onChange={(e) => setDraftNote(e.target.value)}
                      placeholder="Write a personal note about this sentence or grammar rule…"
                      className="w-full rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] p-2 text-xs text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowNoteComposer(false)}
                        className="px-2 py-1 text-xs text-[var(--color-ink-muted)]"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="rounded-md bg-[var(--color-prussian)] px-3 py-1 text-xs font-medium text-white"
                      >
                        Save Note
                      </button>
                    </div>
                  </form>
                )}

                {/* English Translation / Textbook Match */}
                <div className="space-y-2 rounded-md bg-[var(--color-paper)] p-3 dark:bg-[var(--color-night-surface)]">
                  {passageAnalysis.textbookTranslation && (
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-sage)] dark:text-emerald-400">
                        Adjacent Textbook English Line
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                        {passageAnalysis.textbookTranslation}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                      Lexicon-Assisted Literal Gloss (Word Order Preserved)
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-300">
                      {passageAnalysis.assistedGloss}
                    </p>
                  </div>
                </div>

                {/* Sentence Structure Breakdown */}
                {passageAnalysis.structureInsights.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-[var(--color-prussian)] dark:text-[#7AB3E6]" />
                      <h4 className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                        Sentence Structure Breakdown
                      </h4>
                    </div>
                    <ul className="space-y-2">
                      {passageAnalysis.structureInsights.map((insight, idx) => (
                        <li
                          key={idx}
                          className="rounded border-l-2 border-[var(--color-prussian)] bg-[var(--color-paper)] px-3 py-2 text-xs dark:border-[#5B9BD5] dark:bg-[var(--color-night-surface)]"
                        >
                          <p className="font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                            {insight.label}
                          </p>
                          <p className="mt-0.5 leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-300">
                            {insight.detail}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Word-by-Word Explanation */}
                <div className="space-y-2">
                  <h4 className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                    Word-by-Word Explanation (Click any word)
                  </h4>
                  <div className="divide-y divide-[var(--color-hairline)] rounded border border-[var(--color-hairline)] dark:divide-[var(--color-night-hairline)] dark:border-[var(--color-night-hairline)]">
                    {passageAnalysis.tokens.slice(0, 40).map((tok, i) => (
                      <button
                        key={`${tok.token}-${i}`}
                        type="button"
                        onClick={() => setDrilldownWord(tok.token)}
                        className="flex w-full items-baseline justify-between gap-3 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-[var(--color-paper)] dark:hover:bg-[var(--color-night-surface)]"
                      >
                        <span className="shrink-0 font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                          {tok.article && (
                            <span className="mr-1 font-normal text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                              {tok.article}
                            </span>
                          )}
                          {tok.token}
                        </span>
                        <span className="truncate text-right text-[var(--color-ink-muted)] dark:text-slate-400">
                          {tok.english}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Difficult / Key Vocabulary in Selection */}
                {passageAnalysis.difficultVocabulary.length > 0 && (
                  <div className="space-y-2 border-t border-[var(--color-hairline)] pt-3 dark:border-[var(--color-night-hairline)]">
                    <h4 className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                      Key Vocabulary in This Passage
                    </h4>
                    <div className="space-y-1.5">
                      {passageAnalysis.difficultVocabulary.map((w) => {
                        const saved = isWordSaved(w.lemma);
                        return (
                          <div
                            key={w.lemma}
                            className="flex items-center justify-between gap-2 rounded border border-[var(--color-hairline)] px-2.5 py-1.5 text-xs dark:border-[var(--color-night-hairline)]"
                          >
                            <button
                              type="button"
                              onClick={() => setDrilldownWord(w.query)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="truncate font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                                {w.article ? `${w.article} ` : ''}
                                {w.lemma}
                              </p>
                              <p className="truncate text-[11px] text-[var(--color-ink-muted)] dark:text-slate-400">
                                {w.english}
                              </p>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveWord(w)}
                              className={`shrink-0 rounded border px-2 py-1 text-[11px] font-medium ${
                                saved
                                  ? 'border-[var(--color-sage)] text-[var(--color-sage)] dark:border-emerald-500 dark:text-emerald-400'
                                  : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:border-[var(--color-prussian)] hover:text-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-slate-300'
                              }`}
                            >
                              {saved ? 'Saved' : '+ Save'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: HIGHLIGHTS */}
        {activeTab === 'highlights' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                {showAllBookHighlights ? 'All Book Highlights' : `Chapter ${chapter.number} Highlights`}
              </p>
              <button
                type="button"
                onClick={() => setShowAllBookHighlights((v) => !v)}
                className="text-xs font-medium text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
              >
                {showAllBookHighlights ? 'This chapter only' : `Show all (${highlights.length})`}
              </button>
            </div>

            {chapterHighlights.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--color-hairline)] p-4 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:text-slate-400">
                No highlights here yet. Select any German phrase in the textbook and choose Amber, Sage, or
                Blue in the Inspector panel to highlight it.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {chapterHighlights.map((hl) => (
                  <li
                    key={hl.id}
                    className="rounded-md border border-[var(--color-hairline)] bg-white p-3 text-xs dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (hl.chapterNumber !== chapter.number) onJumpToChapter(hl.chapterNumber);
                          onSelectManualText(hl.text);
                          onSelectTab('inspector');
                        }}
                        className="text-left leading-relaxed text-[var(--color-ink)] hover:text-[var(--color-prussian)] dark:text-[#EDEAE3] dark:hover:text-[#7AB3E6]"
                      >
                        <span
                          className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
                            hl.color === 'amber'
                              ? 'bg-amber-400'
                              : hl.color === 'sage'
                                ? 'bg-emerald-500'
                                : 'bg-sky-500'
                          }`}
                        />
                        &ldquo;{hl.text}&rdquo;
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveHighlight(hl.id)}
                        aria-label="Remove highlight"
                        className="shrink-0 text-[var(--color-ink-muted)] hover:text-red-600 dark:text-slate-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="mt-1.5 font-mono text-[10px] text-[var(--color-ink-muted)] dark:text-slate-500">
                      Chapter {hl.chapterNumber}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* TAB 3: PERSONAL ANNOTATIONS */}
        {activeTab === 'notes' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                {showAllBookNotes ? 'All Book Notes' : `Chapter ${chapter.number} Notes`}
              </p>
              <button
                type="button"
                onClick={() => setShowAllBookNotes((v) => !v)}
                className="text-xs font-medium text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
              >
                {showAllBookNotes ? 'This chapter only' : `Show all (${annotations.length})`}
              </button>
            </div>

            {/* General Chapter Note Composer */}
            <form
              onSubmit={handleSubmitGeneralNote}
              className="space-y-2 rounded-md border border-[var(--color-hairline)] bg-white p-3 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]"
            >
              <textarea
                rows={2}
                value={generalNoteDraft}
                onChange={(e) => setGeneralNoteDraft(e.target.value)}
                placeholder={`Add a personal note for Chapter ${chapter.number}…`}
                className="w-full resize-none bg-transparent text-xs text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]/70 focus:outline-none dark:text-[#EDEAE3]"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!generalNoteDraft.trim()}
                  className="rounded bg-[var(--color-prussian)] px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40"
                >
                  Save Note
                </button>
              </div>
            </form>

            {chapterAnnotations.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--color-hairline)] p-4 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:text-slate-400">
                No personal annotations saved here yet. Add a chapter note above or select any German sentence
                to attach a contextual note.
              </p>
            ) : (
              <ul className="space-y-3">
                {chapterAnnotations.map((ann) => {
                  const isEditing = editingNoteId === ann.id;
                  return (
                    <li
                      key={ann.id}
                      className="rounded-md border border-[var(--color-hairline)] bg-white p-3 text-xs dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (ann.chapterNumber !== chapter.number) onJumpToChapter(ann.chapterNumber);
                          }}
                          className="line-clamp-2 border-l-2 border-[var(--color-prussian)] pl-2 text-left text-[11px] italic text-[var(--color-ink-muted)] dark:border-[#5B9BD5] dark:text-slate-400"
                        >
                          {ann.selectedText}
                        </button>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNoteId(ann.id);
                              setEditingNoteText(ann.note);
                            }}
                            aria-label="Edit note"
                            className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:text-slate-400"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteAnnotation(ann.id)}
                            aria-label="Delete note"
                            className="text-[var(--color-ink-muted)] hover:text-red-600 dark:text-slate-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="mt-2 space-y-2">
                          <textarea
                            rows={3}
                            value={editingNoteText}
                            onChange={(e) => setEditingNoteText(e.target.value)}
                            className="w-full rounded border border-[var(--color-hairline)] bg-[var(--color-paper)] p-2 text-xs text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingNoteId(null)}
                              className="text-[11px] text-[var(--color-ink-muted)]"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onUpdateAnnotation(ann.id, editingNoteText);
                                setEditingNoteId(null);
                              }}
                              className="rounded bg-[var(--color-prussian)] px-2.5 py-1 text-[11px] font-medium text-white"
                            >
                              Update
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 leading-relaxed whitespace-pre-wrap text-[var(--color-ink)] dark:text-[#EDEAE3]">
                          {ann.note}
                        </p>
                      )}

                      <p className="mt-2 font-mono text-[10px] text-[var(--color-ink-muted)] dark:text-slate-500">
                        Chapter {ann.chapterNumber}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
