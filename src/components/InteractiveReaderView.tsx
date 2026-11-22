import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Flag,
  Highlighter,
  Minus,
  Moon,
  PanelLeft,
  PanelRight,
  Plus,
  Search,
  Sun,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BookChapter,
  HighlightColor,
  LineSpacingMode,
  ParsedBook,
  ReaderPreferences,
  SavedVocabItem,
  UserStudyState,
} from '../types/book';
import {
  ReaderContextualPanel,
  type ContextPanelTab,
} from './reader/ReaderContextualPanel';
import {
  ReaderNavigationRail,
  type LeftRailTab,
} from './reader/ReaderNavigationRail';

interface InteractiveReaderViewProps {
  book: ParsedBook;
  chapter: BookChapter;
  studyState: UserStudyState;
  onSelectChapter: (chapterNumber: number) => void;
  onToggleTheme: () => void;
  onToggleCompleted: () => void;
  onToggleDifficult: () => void;
  onUpdatePreferences: (patch: Partial<ReaderPreferences>) => void;
  onUpdateProgress: (chapterNumber: number, percent: number) => void;
  onAddBookmark: (payload: {
    chapterNumber: number;
    chapterTitle: string;
    sectionId?: string;
    sectionLabel?: string;
  }) => void;
  onRemoveBookmark: (id: string) => void;
  onAddHighlight: (chapterNumber: number, text: string, color: HighlightColor) => void;
  onRemoveHighlight: (id: string) => void;
  onAddAnnotation: (chapterNumber: number, selectedText: string, note: string) => void;
  onUpdateAnnotation: (id: string, note: string) => void;
  onDeleteAnnotation: (id: string) => void;
  onToggleSavedVocab: (item: Omit<SavedVocabItem, 'id' | 'savedAt'>) => void;
  onOpenAudioSettings: () => void;
}

const LINE_HEIGHT_MAP: Record<LineSpacingMode, number> = {
  compact: 1.55,
  comfortable: 1.8,
  relaxed: 2.08,
};

/**
 * Safely wraps persisted user highlights and active search hits inside text nodes only,
 * preserving all original textbook HTML markup, tables, and inline phonetic images.
 */
function applyDecorationsToHtml(
  sanitizedHtml: string,
  highlights: { text: string; color: HighlightColor }[],
  showHighlights: boolean,
  searchQuery: string
): string {
  const activeSearch = searchQuery.trim();
  const hasHighlights = showHighlights && highlights.length > 0;
  if (!hasHighlights && activeSearch.length < 2) return sanitizedHtml;

  const container = document.createElement('div');
  container.innerHTML = sanitizedHtml;

  const wrapPhrase = (phrase: string, className: string, maxPerNode = 5) => {
    const clean = phrase.trim();
    if (clean.length < 2) return;
    const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let current = walker.nextNode();
    while (current) {
      const parent = current.parentElement;
      if (parent && parent.tagName !== 'MARK' && parent.tagName !== 'SCRIPT' && parent.tagName !== 'STYLE') {
        if (current.nodeValue && regex.test(current.nodeValue)) {
          textNodes.push(current as Text);
        }
        regex.lastIndex = 0;
      }
      current = walker.nextNode();
    }

    for (const node of textNodes) {
      const text = node.nodeValue || '';
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      let lastIndex = 0;
      let count = 0;
      const frag = document.createDocumentFragment();

      while ((match = regex.exec(text)) !== null && count < maxPerNode) {
        if (match.index > lastIndex) {
          frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        const mark = document.createElement('mark');
        mark.className = className;
        mark.textContent = match[0];
        frag.appendChild(mark);
        lastIndex = match.index + match[0].length;
        count++;
      }

      if (count > 0) {
        if (lastIndex < text.length) {
          frag.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
        node.parentNode?.replaceChild(frag, node);
      }
    }
  };

  if (hasHighlights) {
    // Apply longest phrases first to reduce nested overlaps
    const sorted = [...highlights].sort((a, b) => b.text.length - a.text.length);
    for (const hl of sorted) {
      wrapPhrase(hl.text, `reader-hl-${hl.color}`, 2);
    }
  }

  if (activeSearch.length >= 2) {
    wrapPhrase(activeSearch, 'reader-search-hit', 10);
  }

  return container.innerHTML;
}

export function InteractiveReaderView({
  book,
  chapter,
  studyState,
  onSelectChapter,
  onToggleTheme,
  onToggleCompleted,
  onToggleDifficult,
  onUpdatePreferences,
  onUpdateProgress,
  onAddBookmark,
  onRemoveBookmark,
  onAddHighlight,
  onRemoveHighlight,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onToggleSavedVocab,
  onOpenAudioSettings,
}: InteractiveReaderViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);

  const [leftRailOpen, setLeftRailOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [leftRailTab, setLeftRailTab] = useState<LeftRailTab>('sections');
  const [contextTab, setContextTab] = useState<ContextPanelTab>('inspector');
  const [showStudyGuide, setShowStudyGuide] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [activeSectionId, setActiveSectionId] = useState<string | null>(
    chapter.sections[0]?.id ?? null
  );
  const [pendingScrollSectionId, setPendingScrollSectionId] = useState<string | null>(null);
  const [liveScrollPercent, setLiveScrollPercent] = useState<number>(
    studyState.chapterProgress[chapter.number] || 0
  );

  const isCompleted = studyState.completedChapters.includes(chapter.number);
  const isDifficult = studyState.difficultChapters.includes(chapter.number);
  const prefs = studyState.readerPreferences;

  const chapterHighlights = useMemo(
    () => studyState.highlights.filter((h) => h.chapterNumber === chapter.number),
    [chapter.number, studyState.highlights]
  );

  const decoratedHtml = useMemo(
    () =>
      applyDecorationsToHtml(
        chapter.sanitizedHtml,
        chapterHighlights,
        prefs.showHighlights,
        searchQuery
      ),
    [chapter.sanitizedHtml, chapterHighlights, prefs.showHighlights, searchQuery]
  );

  const activeSection = useMemo(
    () => chapter.sections.find((s) => s.id === activeSectionId) || chapter.sections[0] || null,
    [activeSectionId, chapter.sections]
  );

  const activeSectionIndex = useMemo(
    () => (activeSection ? chapter.sections.findIndex((s) => s.id === activeSection.id) : -1),
    [activeSection, chapter.sections]
  );

  const currentBookmark = useMemo(
    () =>
      studyState.bookmarks.find(
        (b) =>
          b.chapterNumber === chapter.number &&
          (b.sectionId || '') === (activeSection?.id || '')
      ),
    [activeSection?.id, chapter.number, studyState.bookmarks]
  );

  // Reset scroll or jump to requested section when chapter changes
  useEffect(() => {
    setActiveSectionId(chapter.sections[0]?.id ?? null);
    setLiveScrollPercent(studyState.chapterProgress[chapter.number] || 0);
    setSelectedText('');

    if (pendingScrollSectionId) {
      const targetId = pendingScrollSectionId;
      setPendingScrollSectionId(null);
      requestAnimationFrame(() => {
        const el = articleRef.current?.querySelector(`[data-section-id="${targetId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setActiveSectionId(targetId);
        }
      });
    } else if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.number]);

  const scrollToSection = useCallback((sectionId: string) => {
    const el = articleRef.current?.querySelector(`[data-section-id="${sectionId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSectionId(sectionId);
    }
  }, []);

  const handleSelectChapterWithSection = useCallback(
    (targetChapter: number, sectionId?: string) => {
      if (targetChapter === chapter.number) {
        if (sectionId) scrollToSection(sectionId);
        return;
      }
      if (sectionId) setPendingScrollSectionId(sectionId);
      onSelectChapter(targetChapter);
    },
    [chapter.number, onSelectChapter, scrollToSection]
  );

  const handlePrevSection = () => {
    if (activeSectionIndex > 0) {
      scrollToSection(chapter.sections[activeSectionIndex - 1].id);
    } else if (chapter.number > 1) {
      onSelectChapter(chapter.number - 1);
    }
  };

  const handleNextSection = () => {
    if (activeSectionIndex >= 0 && activeSectionIndex < chapter.sections.length - 1) {
      scrollToSection(chapter.sections[activeSectionIndex + 1].id);
    } else if (chapter.number < book.chapters.length) {
      onSelectChapter(chapter.number + 1);
    }
  };

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const maxScroll = container.scrollHeight - container.clientHeight;
    const pct = maxScroll <= 0 ? 100 : Math.min(100, Math.max(0, (container.scrollTop / maxScroll) * 100));
    const rounded = Math.round(pct);
    setLiveScrollPercent(rounded);
    if (rounded >= 5) {
      onUpdateProgress(chapter.number, rounded);
    }

    // Track visible section landmark
    const sectionNodes = articleRef.current?.querySelectorAll('[data-section-id]');
    if (sectionNodes && sectionNodes.length > 0) {
      const containerTop = container.getBoundingClientRect().top + 110;
      let currentId: string | null = null;
      sectionNodes.forEach((node) => {
        const rect = node.getBoundingClientRect();
        if (rect.top <= containerTop) {
          currentId = node.getAttribute('data-section-id');
        }
      });
      if (currentId) setActiveSectionId(currentId);
    }
  }, [chapter.number, onUpdateProgress]);

  const captureTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const text = selection.toString().replace(/\s+/g, ' ').trim();
    if (text.length < 2 || text.length > 900) return;

    // Ensure selection originates inside the textbook article
    const anchorNode = selection.anchorNode;
    if (anchorNode && articleRef.current && articleRef.current.contains(anchorNode)) {
      setSelectedText(text);
      setContextTab('inspector');
      setRightPanelOpen(true);
    }
  }, []);

  const handleArticleClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      const calibreMatch = href.match(/^#calibre_link-(\d+)$/);
      if (calibreMatch) {
        e.preventDefault();
        const linkNum = parseInt(calibreMatch[1], 10);
        const targetChapter = linkNum - 2;
        if (targetChapter >= 1 && targetChapter <= book.chapters.length) {
          onSelectChapter(targetChapter);
        }
      }
    },
    [book.chapters.length, onSelectChapter]
  );

  const handleToggleBookmark = () => {
    if (currentBookmark) {
      onRemoveBookmark(currentBookmark.id);
    } else {
      onAddBookmark({
        chapterNumber: chapter.number,
        chapterTitle: chapter.displayTitle,
        sectionId: activeSection?.id,
        sectionLabel: activeSection?.label,
      });
    }
  };

  const cycleLineSpacing = () => {
    const order: LineSpacingMode[] = ['compact', 'comfortable', 'relaxed'];
    const next = order[(order.indexOf(prefs.lineSpacing) + 1) % order.length];
    onUpdatePreferences({ lineSpacing: next });
  };

  const prevChapter = chapter.number > 1 ? chapter.number - 1 : null;
  const nextChapter = chapter.number < book.chapters.length ? chapter.number + 1 : null;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-[var(--color-paper)] dark:bg-[var(--color-night)]">
      {/* Live Scroll Progress Bar */}
      <div className="h-0.5 w-full bg-[var(--color-paper-subtle)] dark:bg-[var(--color-night-subtle)]">
        <div
          className="h-full bg-[var(--color-prussian)] transition-[width] duration-150 dark:bg-[#5B9BD5]"
          style={{ width: `${liveScrollPercent}%` }}
        />
      </div>

      {/* Dedicated Reader Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-hairline)] bg-white px-3 py-2 text-xs dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
        {/* Left Controls: Rail Toggle, Search Shortcut, Section Nav */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setLeftRailOpen((v) => !v)}
            title="Toggle Chapters, Outline & Search"
            className={`inline-flex items-center gap-1.5 rounded border px-2 py-1.5 font-medium transition-colors ${
              leftRailOpen
                ? 'border-[var(--color-prussian)]/40 bg-[var(--color-prussian)]/8 text-[var(--color-prussian)] dark:border-[#5B9BD5]/50 dark:text-[#7AB3E6]'
                : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-300'
            }`}
          >
            <PanelLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Contents</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setLeftRailOpen(true);
              setLeftRailTab('search');
            }}
            title="Search across the entire book"
            className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] px-2 py-1.5 text-[var(--color-ink-muted)] hover:border-[var(--color-prussian)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-300"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Search Book</span>
          </button>

          <div className="hidden items-center rounded border border-[var(--color-hairline)] sm:flex dark:border-[var(--color-night-hairline)]">
            <button
              type="button"
              onClick={handlePrevSection}
              title="Previous section"
              className="px-2 py-1.5 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:text-slate-300"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="max-w-[165px] truncate border-x border-[var(--color-hairline)] px-2.5 py-1 font-mono text-[11px] text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]">
              Ch. {chapter.number}
              {activeSection ? ` · ${activeSection.label}` : ''}
            </span>
            <button
              type="button"
              onClick={handleNextSection}
              title="Next section"
              className="px-2 py-1.5 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:text-slate-300"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Right Controls: Typography, Line Spacing, Bookmark, Progress, Theme, Side Panel */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Font Size */}
          <div className="flex items-center rounded border border-[var(--color-hairline)] dark:border-[var(--color-night-hairline)]">
            <button
              type="button"
              aria-label="Decrease font size"
              onClick={() => onUpdatePreferences({ fontSize: Math.max(13, prefs.fontSize - 1) })}
              className="px-1.5 py-1.5 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:text-slate-300"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="px-1.5 font-mono text-[11px] tabular-nums text-[var(--color-ink)] dark:text-[#EDEAE3]">
              {prefs.fontSize}px
            </span>
            <button
              type="button"
              aria-label="Increase font size"
              onClick={() => onUpdatePreferences({ fontSize: Math.min(22, prefs.fontSize + 1) })}
              className="px-1.5 py-1.5 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:text-slate-300"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          {/* Line Spacing */}
          <button
            type="button"
            onClick={cycleLineSpacing}
            title="Cycle line spacing (Compact / Comfortable / Relaxed)"
            className="hidden rounded border border-[var(--color-hairline)] px-2 py-1.5 font-mono text-[11px] capitalize text-[var(--color-ink-muted)] hover:border-[var(--color-prussian)] hover:text-[var(--color-ink)] md:inline-flex dark:border-[var(--color-night-hairline)] dark:text-slate-300"
          >
            Line: {prefs.lineSpacing}
          </button>

          {/* Toggle Highlights */}
          <button
            type="button"
            onClick={() => onUpdatePreferences({ showHighlights: !prefs.showHighlights })}
            title={prefs.showHighlights ? 'Hide text highlights' : 'Show text highlights'}
            className={`rounded border p-1.5 transition-colors ${
              prefs.showHighlights
                ? 'border-amber-400/60 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300'
                : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:text-slate-400'
            }`}
          >
            <Highlighter className="h-3.5 w-3.5" />
          </button>

          {/* Bookmark Current Section */}
          <button
            type="button"
            onClick={handleToggleBookmark}
            title={currentBookmark ? 'Remove bookmark' : 'Bookmark current section'}
            className={`inline-flex items-center gap-1 rounded border px-2 py-1.5 font-medium transition-colors ${
              currentBookmark
                ? 'border-[var(--color-prussian)] bg-[var(--color-prussian)] text-white dark:border-[#2B649B] dark:bg-[#2B649B]'
                : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:border-[var(--color-prussian)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-300'
            }`}
          >
            {currentBookmark ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
            <span className="hidden lg:inline">{currentBookmark ? 'Bookmarked' : 'Bookmark'}</span>
          </button>

          {/* Reading Theme Quick Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            title="Switch light/dark reading theme"
            className="hidden rounded border border-[var(--color-hairline)] p-1.5 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] sm:inline-flex dark:border-[var(--color-night-hairline)] dark:text-slate-300"
          >
            {studyState.theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>

          {/* Reading Progress */}
          <span className="hidden font-mono text-[11px] tabular-nums text-[var(--color-ink-muted)] xl:inline dark:text-slate-400">
            {liveScrollPercent}% read
          </span>

          {/* Contextual Side Panel Toggle */}
          <button
            type="button"
            onClick={() => setRightPanelOpen((v) => !v)}
            title="Toggle Contextual German Inspector, Highlights & Notes"
            className={`inline-flex items-center gap-1.5 rounded border px-2 py-1.5 font-medium transition-colors ${
              rightPanelOpen
                ? 'border-[var(--color-prussian)]/40 bg-[var(--color-prussian)]/8 text-[var(--color-prussian)] dark:border-[#5B9BD5]/50 dark:text-[#7AB3E6]'
                : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-300'
            }`}
          >
            <PanelRight className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Inspector</span>
          </button>
        </div>
      </div>

      {/* Three-Pane Responsive Reading Workspace */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Left Collapsible Navigation Rail */}
        {leftRailOpen && (
          <div className="absolute inset-y-0 left-0 z-20 w-72 shadow-lg lg:static lg:z-auto lg:w-64 lg:shrink-0 lg:shadow-none xl:w-72">
            <ReaderNavigationRail
              book={book}
              chapter={chapter}
              activeTab={leftRailTab}
              onSelectTab={setLeftRailTab}
              activeSectionId={activeSectionId}
              completedChapters={studyState.completedChapters}
              chapterProgress={studyState.chapterProgress}
              bookmarks={studyState.bookmarks}
              searchQuery={searchQuery}
              onChangeSearchQuery={setSearchQuery}
              onSelectChapter={handleSelectChapterWithSection}
              onSelectSection={scrollToSection}
              onRemoveBookmark={onRemoveBookmark}
              onCloseMobile={() => setLeftRailOpen(false)}
            />
          </div>
        )}

        {/* Center Reading Canvas */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 lg:px-10"
        >
          <div className="mx-auto max-w-3xl">
            {/* Chapter Header & Collapsible Supplementary Objectives */}
            <header className="mb-6 rounded-lg border border-[var(--color-hairline)] bg-white p-5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                    Chapter {chapter.number} · {chapter.kind}
                  </p>
                  <h1 className="mt-1 font-editorial text-2xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                    {chapter.germanTitle || chapter.englishTitle}
                  </h1>
                  {chapter.germanTitle && (
                    <p className="mt-0.5 text-sm text-[var(--color-ink-muted)] dark:text-slate-400">
                      {chapter.englishTitle}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onToggleCompleted}
                    className={`inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      isCompleted
                        ? 'border-[var(--color-sage)] bg-[var(--color-sage)] text-white dark:border-emerald-600 dark:bg-emerald-700'
                        : 'border-[var(--color-hairline)] text-[var(--color-ink)] hover:border-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]'
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>{isCompleted ? 'Completed' : 'Mark Complete'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onToggleDifficult}
                    title="Flag this chapter for revision"
                    className={`inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      isDifficult
                        ? 'border-[var(--color-ochre)] bg-[var(--color-ochre)]/10 text-[var(--color-ochre)] dark:border-amber-500/60 dark:text-amber-300'
                        : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-400'
                    }`}
                  >
                    <Flag className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{isDifficult ? 'Difficult' : 'Flag'}</span>
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowStudyGuide((v) => !v)}
                className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] text-[var(--color-ink-muted)] hover:text-[var(--color-prussian)] dark:text-slate-400 dark:hover:text-[#7AB3E6]"
              >
                {showStudyGuide ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                <span>
                  {showStudyGuide
                    ? 'Hide Supplementary Learning Objectives'
                    : 'Show Supplementary Learning Objectives & Topics'}
                </span>
              </button>

              {showStudyGuide && (
                <div className="mt-3 grid grid-cols-1 gap-4 border-t border-[var(--color-hairline)] pt-3 text-xs sm:grid-cols-2 dark:border-[var(--color-night-hairline)]">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                      Supplementary Study Objectives
                    </p>
                    <ul className="mt-1.5 space-y-1 text-[var(--color-ink-muted)] dark:text-slate-300">
                      {chapter.learningObjectives.map((obj, idx) => (
                        <li key={idx}>• {obj}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                      Original Textbook Topics
                    </p>
                    <p className="mt-1.5 leading-relaxed text-[var(--color-ink)] dark:text-slate-300">
                      {chapter.tocTopics.length > 0 ? chapter.tocTopics.join(' · ') : chapter.summary}
                    </p>
                  </div>
                </div>
              )}
            </header>

            {/* Authentic Original Textbook Content Container */}
            <div className="rounded-lg border border-[var(--color-hairline)] bg-white px-5 py-6 sm:px-10 sm:py-8 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-hairline)] pb-3 dark:border-[var(--color-night-hairline)]">
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                  <BookOpen className="h-3.5 w-3.5" />
                  Original Textbook Content · Select any word or sentence to inspect
                </span>
                {searchQuery.trim().length >= 2 && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="font-mono text-[11px] text-[var(--color-ochre)] hover:underline dark:text-amber-300"
                  >
                    Clear search &ldquo;{searchQuery}&rdquo;
                  </button>
                )}
              </div>

              <article
                ref={articleRef}
                onMouseUp={captureTextSelection}
                onDoubleClick={captureTextSelection}
                onClick={handleArticleClick}
                style={{
                  fontSize: `${prefs.fontSize}px`,
                  lineHeight: LINE_HEIGHT_MAP[prefs.lineSpacing],
                }}
                className="textbook-prose text-[var(--color-ink)] selection:bg-[var(--color-prussian)]/20 dark:text-[#E7E3DA] dark:selection:bg-[#5B9BD5]/30"
                dangerouslySetInnerHTML={{ __html: decoratedHtml }}
              />

              {/* Bottom Chapter Navigation */}
              <nav
                aria-label="Chapter pagination"
                className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-hairline)] pt-6 dark:border-[var(--color-night-hairline)]"
              >
                {prevChapter ? (
                  <button
                    type="button"
                    onClick={() => onSelectChapter(prevChapter)}
                    className="inline-flex items-center gap-2 rounded-md border border-[var(--color-hairline)] px-3.5 py-2 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Previous: Chapter {prevChapter}</span>
                  </button>
                ) : (
                  <span />
                )}

                <button
                  type="button"
                  onClick={onToggleCompleted}
                  className="text-xs font-medium text-[var(--color-sage)] hover:underline dark:text-emerald-400"
                >
                  {isCompleted ? '✓ Chapter marked complete' : 'Mark this chapter complete'}
                </button>

                {nextChapter ? (
                  <button
                    type="button"
                    onClick={() => onSelectChapter(nextChapter)}
                    className="inline-flex items-center gap-2 rounded-md bg-[var(--color-prussian)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B] dark:hover:bg-[#3474B3]"
                  >
                    <span>Next: Chapter {nextChapter}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <span />
                )}
              </nav>
            </div>
          </div>
        </div>

        {/* Right Non-Disruptive Contextual Side Panel */}
        {rightPanelOpen && (
          <div className="absolute inset-y-0 right-0 z-20 w-80 shadow-lg sm:w-96 xl:static xl:z-auto xl:w-[22.5rem] xl:shrink-0 xl:shadow-none">
            <ReaderContextualPanel
              book={book}
              chapter={chapter}
              selectedText={selectedText}
              activeTab={contextTab}
              onSelectTab={setContextTab}
              onSelectManualText={(txt) => setSelectedText(txt)}
              onClearSelection={() => setSelectedText('')}
              savedVocab={studyState.savedVocab}
              highlights={studyState.highlights}
              annotations={studyState.annotations}
              onToggleSavedVocab={onToggleSavedVocab}
              onAddHighlight={(text, color) => onAddHighlight(chapter.number, text, color)}
              onRemoveHighlight={onRemoveHighlight}
              onAddAnnotation={(sel, note) => onAddAnnotation(chapter.number, sel, note)}
              onUpdateAnnotation={onUpdateAnnotation}
              onDeleteAnnotation={onDeleteAnnotation}
              onJumpToChapter={(num) => onSelectChapter(num)}
              onOpenAudioSettings={onOpenAudioSettings}
              onCloseMobile={() => setRightPanelOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
