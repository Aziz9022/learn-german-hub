import {
  ArrowRight,
  BookOpen,
  Check,
  Clock,
  Flag,
  MessageSquare,
  Search,
  Sparkles,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { BookChapter, ParsedBook, UserStudyState } from '../types/book';

interface LearningPathViewProps {
  book: ParsedBook;
  studyState: UserStudyState;
  initialUnitFilter?: string;
  onOpenChapter: (chapterNumber: number) => void;
  onOpenLesson: (chapterNumber: number) => void;
  onToggleCompleted: (chapterNumber: number, title: string) => void;
  onToggleDifficult: (chapterNumber: number, title: string) => void;
}

type PathFilter = 'all' | 'lesson' | 'review' | 'reference' | 'pending' | 'completed';

export function LearningPathView({
  book,
  studyState,
  initialUnitFilter,
  onOpenChapter,
  onOpenLesson,
  onToggleCompleted,
  onToggleDifficult,
}: LearningPathViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<PathFilter>('all');
  const [selectedUnitId, setSelectedUnitId] = useState<string>(initialUnitFilter || 'all');

  const filteredChapters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return book.chapters.filter((ch) => {
      if (selectedUnitId !== 'all' && ch.unitId !== selectedUnitId) return false;
      if (filter === 'lesson' && ch.kind !== 'lesson' && ch.kind !== 'foundation') return false;
      if (filter === 'review' && ch.kind !== 'review') return false;
      if (filter === 'reference' && ch.kind !== 'reference') return false;
      if (filter === 'completed' && !studyState.completedChapters.includes(ch.number)) return false;
      if (filter === 'pending' && studyState.completedChapters.includes(ch.number)) return false;

      if (!q) return true;
      return (
        String(ch.number) === q ||
        `chapter ${ch.number}`.includes(q) ||
        ch.displayTitle.toLowerCase().includes(q) ||
        ch.summary.toLowerCase().includes(q) ||
        ch.tocTopics.some((t) => t.toLowerCase().includes(q)) ||
        ch.learningObjectives.some((o) => o.toLowerCase().includes(q))
      );
    });
  }, [book.chapters, filter, searchQuery, selectedUnitId, studyState.completedChapters]);

  const groupedByUnit = useMemo(() => {
    return book.units
      .map((unit) => ({
        unit,
        chapters: filteredChapters.filter((ch) => ch.unitId === unit.id),
      }))
      .filter((group) => group.chapters.length > 0);
  }, [book.units, filteredChapters]);

  const filterButtons: { id: PathFilter; label: string }[] = [
    { id: 'all', label: 'All 48' },
    { id: 'lesson', label: 'Lessons (1–44)' },
    { id: 'review', label: 'Review Chapters' },
    { id: 'reference', label: 'Reference (45–48)' },
    { id: 'pending', label: 'Pending' },
    { id: 'completed', label: 'Completed' },
  ];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="border-b border-[var(--color-hairline)] pb-6 dark:border-[var(--color-night-hairline)]">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
          Book → Part → Chapter → Topics & Exercises
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-editorial text-3xl font-semibold tracking-tight text-[var(--color-ink)] dark:text-[#EDEAE3]">
              Book-Based Learning Path
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
              Follows the exact chapter sequence of <em>German Made Simple</em>, organized around the
              textbook&rsquo;s six built-in Review Chapters without rearranging chapters or imposing artificial
              level labels.
            </p>
          </div>
          <div className="font-mono text-xs tabular-nums text-[var(--color-ink-muted)] dark:text-slate-400">
            Showing {filteredChapters.length} of {book.chapters.length} chapters
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 lg:max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-muted)] dark:text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chapter, German topic, grammar rule (e.g. dative, Perfekt)..."
              className="w-full rounded-md border border-[var(--color-hairline)] bg-white py-2 pr-3 pl-9 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]/70 focus:border-[var(--color-prussian)] focus:outline-none dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3] dark:placeholder:text-slate-500 dark:focus:border-[#5B9BD5]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by book part"
              value={selectedUnitId}
              onChange={(e) => setSelectedUnitId(e.target.value)}
              className="rounded-md border border-[var(--color-hairline)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]"
            >
              <option value="all">All Parts (Ch. 1–48)</option>
              {book.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.subtitle}: {u.title.replace(/^Part [IVX]+ · |^Reference · /, '')}
                </option>
              ))}
            </select>

            <div className="flex flex-wrap items-center rounded-md border border-[var(--color-hairline)] bg-white p-0.5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
              {filterButtons.map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setFilter(btn.id)}
                  className={`rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    filter === btn.id
                      ? 'bg-[var(--color-prussian)] text-white dark:bg-[#2B649B]'
                      : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:text-slate-400 dark:hover:text-[#EDEAE3]'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Hierarchical Units & Chapters */}
      <div className="mt-8 space-y-12">
        {groupedByUnit.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--color-hairline)] p-10 text-center dark:border-[var(--color-night-hairline)]">
            <p className="text-sm text-[var(--color-ink-muted)] dark:text-slate-400">
              No chapters match your current search or filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setFilter('all');
                setSelectedUnitId('all');
              }}
              className="mt-3 text-sm font-medium text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
            >
              Reset filters
            </button>
          </div>
        ) : (
          groupedByUnit.map(({ unit, chapters }) => {
            const totalInUnit = book.chapters.filter((c) => c.unitId === unit.id).length;
            const completedInUnit = book.chapters.filter(
              (c) => c.unitId === unit.id && studyState.completedChapters.includes(c.number)
            ).length;

            return (
              <section key={unit.id} aria-labelledby={`unit-${unit.id}`}>
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-hairline)] pb-3 dark:border-[var(--color-night-hairline)]">
                  <div>
                    <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                      {unit.subtitle}
                    </span>
                    <h2
                      id={`unit-${unit.id}`}
                      className="mt-0.5 font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]"
                    >
                      {unit.title}
                    </h2>
                    <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
                      {unit.description}
                    </p>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-[var(--color-ink-muted)] dark:text-slate-400">
                    {completedInUnit}/{totalInUnit} completed
                  </span>
                </div>

                <div className="space-y-4">
                  {chapters.map((chapter) => (
                    <ChapterRowCard
                      key={chapter.number}
                      chapter={chapter}
                      isCompleted={studyState.completedChapters.includes(chapter.number)}
                      isInProgress={studyState.inProgressChapters.includes(chapter.number)}
                      isDifficult={studyState.difficultChapters.includes(chapter.number)}
                      onOpen={() => onOpenChapter(chapter.number)}
                      onOpenLesson={() => onOpenLesson(chapter.number)}
                      onToggleCompleted={() => onToggleCompleted(chapter.number, chapter.displayTitle)}
                      onToggleDifficult={() => onToggleDifficult(chapter.number, chapter.displayTitle)}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}

interface ChapterRowCardProps {
  chapter: BookChapter;
  isCompleted: boolean;
  isInProgress: boolean;
  isDifficult: boolean;
  onOpen: () => void;
  onOpenLesson: () => void;
  onToggleCompleted: () => void;
  onToggleDifficult: () => void;
}

function ChapterRowCard({
  chapter,
  isCompleted,
  isInProgress,
  isDifficult,
  onOpen,
  onOpenLesson,
  onToggleCompleted,
  onToggleDifficult,
}: ChapterRowCardProps) {
  const kindLabel =
    chapter.kind === 'review'
      ? 'Review Chapter'
      : chapter.kind === 'reference'
        ? 'Reference'
        : chapter.kind === 'foundation'
          ? 'Foundation'
          : 'Core Lesson';

  return (
    <article
      className={`rounded-lg border bg-white p-5 transition-colors dark:bg-[var(--color-night-surface)] ${
        chapter.kind === 'review'
          ? 'border-[var(--color-ochre)]/40 dark:border-amber-500/35'
          : 'border-[var(--color-hairline)] dark:border-[var(--color-night-hairline)]'
      }`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        {/* Left: Title, Description, Topics, Objectives */}
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.08em]">
            <span className="font-semibold text-[var(--color-prussian)] dark:text-[#7AB3E6]">
              Chapter {String(chapter.number).padStart(2, '0')}
            </span>
            <span className="text-[var(--color-hairline)] dark:text-[var(--color-night-hairline)]">/</span>
            <span
              className={
                chapter.kind === 'review'
                  ? 'font-medium text-[var(--color-ochre)] dark:text-amber-400'
                  : 'text-[var(--color-ink-muted)] dark:text-slate-400'
              }
            >
              {kindLabel}
            </span>
            <span className="text-[var(--color-hairline)] dark:text-[var(--color-night-hairline)]">/</span>
            <span className="inline-flex items-center gap-1 tabular-nums text-[var(--color-ink-muted)] dark:text-slate-400">
              <Clock className="h-3 w-3" />~{chapter.estimatedMinutes} min
            </span>
            {isCompleted && (
              <>
                <span className="text-[var(--color-hairline)] dark:text-[var(--color-night-hairline)]">/</span>
                <span className="font-semibold text-[var(--color-sage)] dark:text-emerald-400">
                  ● Completed
                </span>
              </>
            )}
            {!isCompleted && isInProgress && (
              <>
                <span className="text-[var(--color-hairline)] dark:text-[var(--color-night-hairline)]">/</span>
                <span className="font-semibold text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                  ● In Progress
                </span>
              </>
            )}
          </div>

          <div>
            <h3 className="font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
              <button
                type="button"
                onClick={onOpen}
                className="text-left hover:text-[var(--color-prussian)] dark:hover:text-[#7AB3E6]"
              >
                {chapter.germanTitle ? (
                  <>
                    <span>{chapter.germanTitle}</span>
                    <span className="font-sans text-base font-normal text-[var(--color-ink-muted)] dark:text-slate-400">
                      {' '}
                      — {chapter.englishTitle}
                    </span>
                  </>
                ) : (
                  chapter.englishTitle
                )}
              </button>
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-300">
              {chapter.summary}
            </p>
          </div>

          {/* Original Book TOC Topics */}
          {chapter.tocTopics.length > 0 && (
            <div className="pt-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                Original Textbook Topics
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink)] dark:text-slate-300">
                {chapter.tocTopics.join(' · ')}
              </p>
            </div>
          )}

          {/* Learning Objectives & Prerequisites */}
          <div className="grid grid-cols-1 gap-3 border-t border-[var(--color-hairline)] pt-3 sm:grid-cols-2 dark:border-[var(--color-night-hairline)]">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                Learning Objectives
              </p>
              <ul className="mt-1 space-y-1 text-xs text-[var(--color-ink-muted)] dark:text-slate-300">
                {chapter.learningObjectives.map((obj, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--color-prussian)] dark:bg-[#7AB3E6]" />
                    <span>{obj}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                  Prerequisites & Assessment Availability
                </p>
                <p className="mt-1 text-xs text-[var(--color-ink-muted)] dark:text-slate-300">
                  Prerequisite: {chapter.prerequisites.join(', ')}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-ink-muted)] dark:text-slate-300">
                  {chapter.exercises.length > 0
                    ? `Exercises ${chapter.exercises[0]}–${chapter.exercises[chapter.exercises.length - 1]} (${chapter.exercises.length} total, ${chapter.answerKeyedExercises.length} with Chapter 45 answer key)`
                    : chapter.kind === 'reference'
                      ? 'Reference appendix — always accessible'
                      : 'Introductory reading chapter (no numbered exercises)'}
                </p>
              </div>

              {/* Structural Content Indicators (Zero-Pill Inline Meta) */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-[var(--color-ink-muted)] dark:text-slate-400">
                {chapter.hasWortschatz && (
                  <span className="inline-flex items-center gap-1">
                    <BookOpen className="h-3 w-3" /> Wortschatz
                  </span>
                )}
                {chapter.hasDialogue && (
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" /> Dialogue
                  </span>
                )}
                {chapter.hasLesestuck && (
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Lesestück
                  </span>
                )}
                <span className="tabular-nums">{chapter.uniqueImages.length} img</span>
                <span className="tabular-nums">{chapter.wordCount.toLocaleString()} words</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex shrink-0 flex-row flex-wrap items-center gap-2 lg:flex-col lg:items-end">
          {chapter.number <= 44 && (
            <button
              type="button"
              onClick={onOpenLesson}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-prussian)] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B] dark:hover:bg-[#3474B3]"
            >
              <span>Study Lesson</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={onOpen}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              chapter.number <= 44
                ? 'border border-[var(--color-hairline)] bg-white text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]'
                : 'bg-[var(--color-prussian)] py-2 text-white hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B]'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>{chapter.number <= 44 ? 'Read Textbook' : 'Open Reference'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleCompleted}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              isCompleted
                ? 'border-[var(--color-sage)] bg-[var(--color-sage)]/10 text-[var(--color-sage)] dark:border-emerald-500/60 dark:bg-emerald-500/15 dark:text-emerald-300'
                : 'border-[var(--color-hairline)] bg-[var(--color-paper)] text-[var(--color-ink-muted)] hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-subtle)] dark:text-slate-300'
            }`}
          >
            <Check className="h-3.5 w-3.5" />
            <span>{isCompleted ? 'Completed' : 'Mark Complete'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleDifficult}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              isDifficult
                ? 'border-[var(--color-ochre)] bg-[var(--color-ochre)]/10 text-[var(--color-ochre)] dark:border-amber-500/60 dark:bg-amber-500/15 dark:text-amber-300'
                : 'border-[var(--color-hairline)] bg-transparent text-[var(--color-ink-muted)] hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-400'
            }`}
          >
            <Flag className="h-3.5 w-3.5" />
            <span>{isDifficult ? 'Flagged Difficult' : 'Flag Difficult'}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
