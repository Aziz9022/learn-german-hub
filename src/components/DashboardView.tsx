import {
  AlertCircle,
  ArrowRight,
  Bookmark,
  BookOpen,
  CheckCircle2,
  Clock,
  Compass,
  Flag,
  GraduationCap,
  History,
  RotateCcw,
} from 'lucide-react';
import type { BookChapter, ParsedBook, UserStudyState } from '../types/book';

interface DashboardViewProps {
  book: ParsedBook;
  studyState: UserStudyState;
  dialogueCount: number;
  onOpenChapter: (chapterNumber: number) => void;
  onOpenLesson: (chapterNumber: number) => void;
  onOpenDialogues: () => void;
  onOpenPractice: (tab?: 'workbook' | 'assessments' | 'drills' | 'revision') => void;
  onOpenLearningPath: (unitId?: string) => void;
  onOpenVocabularyStudio: (tab?: 'database' | 'flashcards' | 'audio') => void;
  onOpenSourceAudit: () => void;
  onToggleDifficult: (chapterNumber: number, title: string) => void;
}

function formatRelativeDate(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function DashboardView({
  book,
  studyState,
  dialogueCount,
  onOpenChapter,
  onOpenLesson,
  onOpenDialogues,
  onOpenPractice,
  onOpenLearningPath,
  onOpenVocabularyStudio,
  onOpenSourceAudit,
  onToggleDifficult,
}: DashboardViewProps) {
  // Instructional chapters are Chapters 1–44 (Chapters 45–48 are reference/appendices)
  const instructionalChapters = book.chapters.filter((c) => c.number <= 44);
  const completedInstructional = instructionalChapters.filter((c) =>
    studyState.completedChapters.includes(c.number)
  );
  const pendingInstructional = instructionalChapters.filter(
    (c) => !studyState.completedChapters.includes(c.number)
  );

  const progressPercent =
    instructionalChapters.length > 0
      ? Math.round((completedInstructional.length / instructionalChapters.length) * 100)
      : 0;

  const currentChapter: BookChapter =
    book.chapters.find((c) => c.number === studyState.lastChapterNumber) || book.chapters[0];

  // Determine the next pending chapter and upcoming review checkpoint
  const nextPendingChapter = pendingInstructional[0] || book.chapters[0];
  const reviewChapters = book.chapters.filter((c) => c.kind === 'review');
  const nextReviewChapter =
    reviewChapters.find((c) => !studyState.completedChapters.includes(c.number)) || reviewChapters[0];

  const difficultChapterObjects = studyState.difficultChapters
    .map((num) => book.chapters.find((c) => c.number === num))
    .filter((c): c is BookChapter => Boolean(c));

  const recentChapters = Array.from(
    new Map(studyState.studyHistory.map((h) => [h.chapterNumber, h])).values()
  ).slice(0, 5);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero / Book Monograph Overview */}
      <section className="grid grid-cols-1 gap-8 border-b border-[var(--color-hairline)] pb-10 lg:grid-cols-12 dark:border-[var(--color-night-hairline)]">
        {/* Book Cover / Authentic Textbook Plate */}
        <div className="lg:col-span-4">
          <div className="overflow-hidden rounded-lg border border-[var(--color-hairline)] bg-white dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-paper-subtle)] dark:bg-[var(--color-night-subtle)]">
              {book.metadata.fallbackIllustrationUrl ? (
                <img
                  src={book.metadata.fallbackIllustrationUrl}
                  alt={book.metadata.fallbackIllustrationCaption}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <BookOpen className="h-10 w-10 text-[var(--color-ink-muted)]" />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-4 text-white">
                <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-white/80">
                  Primary Textbook Source
                </p>
                <p className="font-editorial text-xl font-semibold leading-snug">
                  {book.metadata.title}
                </p>
              </div>
            </div>
            <div className="space-y-2 p-4 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
              <p className="font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                {book.metadata.subtitle}
              </p>
              <p>{book.metadata.copyright}</p>
              <p className="leading-relaxed">
                Cover image note: Original Kindle cover embed was omitted in the HTML upload; showing the
                Brandenburg Gate plate from Chapter 26.{' '}
                <button
                  type="button"
                  onClick={onOpenSourceAudit}
                  className="font-medium text-[var(--color-prussian)] underline underline-offset-2 dark:text-[#7AB3E6]"
                >
                  Inspect source audit
                </button>
              </p>
            </div>
          </div>
        </div>

        {/* Main Progress & Continue Learning Desk */}
        <div className="flex flex-col justify-between gap-6 lg:col-span-8">
          <div className="space-y-4">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
              Beginner · Early A1 Personal Study Environment
            </p>
            <h1 className="font-editorial text-3xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-4xl dark:text-[#EDEAE3]">
              Your structured path through all 48 chapters of German Made Simple.
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-300">
              Every chapter, dialogue, vocabulary list, illustration, and exercise is parsed directly from your
              uploaded textbook HTML in its original order—preserving authentic German instruction with clear
              English guidance.
            </p>
          </div>

          {/* Overall Learning Progress Bar */}
          <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                  Overall Course Progress (Chapters 1–44)
                </p>
                <div className="mt-1 flex items-baseline gap-3">
                  <span className="font-editorial text-3xl font-semibold tabular-nums text-[var(--color-ink)] dark:text-[#EDEAE3]">
                    {progressPercent}%
                  </span>
                  <span className="font-mono text-xs tabular-nums text-[var(--color-ink-muted)] dark:text-slate-400">
                    {completedInstructional.length} completed · {pendingInstructional.length} pending · 4
                    reference appendices
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onOpenLesson(Math.min(44, currentChapter.number))}
                  className="inline-flex items-center gap-2 rounded-md bg-[var(--color-prussian)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B] dark:hover:bg-[#3474B3]"
                >
                  <span>
                    {studyState.studyHistory.length > 0
                      ? `Continue Lesson ${Math.min(44, currentChapter.number)}`
                      : `Start Lesson ${nextPendingChapter.number}`}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenPractice('workbook')}
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] px-3.5 py-2.5 text-sm font-medium text-[var(--color-ink)] transition-colors hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-subtle)] dark:text-[#EDEAE3]"
                >
                  <span>Practice ({book.audit.totalExercisesInBook})</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenDialogues}
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] px-3.5 py-2.5 text-sm font-medium text-[var(--color-ink)] transition-colors hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-subtle)] dark:text-[#EDEAE3]"
                >
                  <span>Dialogues ({dialogueCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenLearningPath()}
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] px-3.5 py-2.5 text-sm font-medium text-[var(--color-ink)] transition-colors hover:border-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-subtle)] dark:text-[#EDEAE3]"
                >
                  <Compass className="h-4 w-4" />
                  <span>Full Path</span>
                </button>
              </div>
            </div>

            <div className="mt-4 h-2 w-full overflow-hidden rounded-sm bg-[var(--color-paper-subtle)] dark:bg-[var(--color-night-subtle)]">
              <div
                className="h-full bg-[var(--color-prussian)] transition-all duration-300 dark:bg-[#5B9BD5]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Active / Next Up Chapter Preview Strip */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-hairline)] pt-4 text-sm dark:border-[var(--color-night-hairline)]">
              <div className="min-w-0 flex-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                  {studyState.studyHistory.length > 0 ? 'Current chapter' : 'Recommended starting point'}
                </span>
                <p className="truncate font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  Chapter {currentChapter.number}: {currentChapter.displayTitle}
                </p>
              </div>
              <div className="flex items-center gap-4 font-mono text-xs tabular-nums text-[var(--color-ink-muted)] dark:text-slate-400">
                <span>~{currentChapter.estimatedMinutes} min</span>
                <span>{currentChapter.wordCount.toLocaleString()} words</span>
                {currentChapter.exercises.length > 0 && (
                  <span>{currentChapter.exercises.length} exercises</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Book-Based Learning Path Overview (8 Sequential Parts) */}
      <section className="py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-muted)] dark:text-slate-400">
              Original Chapter Sequence
            </p>
            <h2 className="mt-1 font-editorial text-2xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
              Book-Based Learning Path
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onOpenLearningPath()}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
          >
            <span>Explore all 48 chapters</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {book.units.map((unit) => {
            const unitChapters = book.chapters.filter((c) => c.unitId === unit.id);
            const completedInUnit = unitChapters.filter((c) =>
              studyState.completedChapters.includes(c.number)
            ).length;
            const pct = unitChapters.length > 0 ? Math.round((completedInUnit / unitChapters.length) * 100) : 0;

            return (
              <button
                key={unit.id}
                type="button"
                onClick={() => onOpenLearningPath(unit.id)}
                className="group flex flex-col justify-between rounded-lg border border-[var(--color-hairline)] bg-white p-5 text-left transition-colors hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:hover:border-[#5B9BD5]"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                      {unit.subtitle}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-[var(--color-ink-muted)] dark:text-slate-400">
                      {completedInUnit}/{unitChapters.length}
                    </span>
                  </div>
                  <h3 className="mt-2 font-editorial text-base font-semibold leading-snug text-[var(--color-ink)] group-hover:text-[var(--color-prussian)] dark:text-[#EDEAE3] dark:group-hover:text-[#7AB3E6]">
                    {unit.title.replace(/^Part [IVX]+ · |^Reference · /, '')}
                  </h3>
                  <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
                    {unit.description}
                  </p>
                </div>

                <div className="mt-4 space-y-1.5">
                  <div className="h-1.5 w-full overflow-hidden rounded-sm bg-[var(--color-paper-subtle)] dark:bg-[var(--color-night-subtle)]">
                    <div
                      className="h-full bg-[var(--color-sage)] transition-all dark:bg-emerald-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between font-mono text-[11px] text-[var(--color-ink-muted)] dark:text-slate-400">
                    <span>
                      {unit.reviewChapterNumber
                        ? `Review in Ch. ${unit.reviewChapterNumber}`
                        : 'Reference & Tools'}
                    </span>
                    <span className="tabular-nums">{pct}%</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Personal Study Desk Grid */}
      <section className="grid grid-cols-1 gap-6 border-t border-[var(--color-hairline)] pt-10 lg:grid-cols-12 dark:border-[var(--color-night-hairline)]">
        {/* Left Column (7 cols): Recently Studied, Revision Reminders, Completed vs Pending */}
        <div className="space-y-6 lg:col-span-7">
          {/* Revision Reminders */}
          <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-[var(--color-ochre)] dark:text-amber-400" />
                <h2 className="font-editorial text-lg font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  Revision Reminders
                </h2>
              </div>
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                Built-in Textbook Reviews
              </span>
            </div>

            <div className="mt-4 divide-y divide-[var(--color-hairline)] dark:divide-[var(--color-night-hairline)]">
              {nextReviewChapter && (
                <div className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                      Upcoming Checkpoint: Chapter {nextReviewChapter.number} — {nextReviewChapter.englishTitle}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                      Includes {nextReviewChapter.exercises.length} review exercises, dialogues, and graded
                      reading passages (Lesestücke).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenChapter(nextReviewChapter.number)}
                    className="text-xs font-medium text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
                  >
                    Preview review →
                  </button>
                </div>
              )}

              {difficultChapterObjects.length > 0 ? (
                difficultChapterObjects.slice(0, 3).map((ch) => (
                  <div key={ch.number} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                        Flagged for review: Chapter {ch.number} — {ch.displayTitle}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                        {ch.summary}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenChapter(ch.number)}
                      className="text-xs font-medium text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
                    >
                      Revisit →
                    </button>
                  </div>
                ))
              ) : (
                <p className="pt-3 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
                  No chapters flagged for extra revision yet. Mark any tricky grammar chapter (such as cases or
                  adjective endings) as difficult while studying and it will appear here automatically.
                </p>
              )}
            </div>
          </div>

          {/* Recently Studied Sections & Study History */}
          <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-[var(--color-prussian)] dark:text-[#7AB3E6]" />
                <h2 className="font-editorial text-lg font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  Recently Studied & Study History
                </h2>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-[var(--color-ink-muted)] dark:text-slate-400">
                {studyState.studyHistory.length} events
              </span>
            </div>

            {recentChapters.length > 0 ? (
              <ul className="mt-4 divide-y divide-[var(--color-hairline)] dark:divide-[var(--color-night-hairline)]">
                {recentChapters.map((item, index) => (
                  <li
                    key={`${item.chapterNumber}-${item.visitedAt}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenChapter(item.chapterNumber)}
                      className="text-left text-sm font-medium text-[var(--color-ink)] hover:text-[var(--color-prussian)] dark:text-[#EDEAE3] dark:hover:text-[#7AB3E6]"
                    >
                      <span className="font-mono text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                        Ch. {String(item.chapterNumber).padStart(2, '0')} ·{' '}
                      </span>
                      {item.chapterTitle}
                    </button>
                    <div className="flex items-center gap-3 font-mono text-[11px] text-[var(--color-ink-muted)] dark:text-slate-400">
                      <span className="uppercase">{item.action.replace('-', ' ')}</span>
                      <span>{formatRelativeDate(item.visitedAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4 rounded-md border border-dashed border-[var(--color-hairline)] p-4 text-sm text-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:text-slate-400">
                <p>No study sessions recorded yet. Open Chapter 1 to begin your reading and study log.</p>
                <button
                  type="button"
                  onClick={() => onOpenChapter(1)}
                  className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
                >
                  <span>Open Chapter 1: Meet the German Language</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Completed & Pending Chapters Snapshot */}
          <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[var(--color-sage)] dark:text-emerald-400" />
                <h2 className="font-editorial text-lg font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  Completed & Pending Chapters
                </h2>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-[var(--color-ink-muted)] dark:text-slate-400">
                {completedInstructional.length} / {instructionalChapters.length}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-8 gap-1.5 sm:grid-cols-11">
              {instructionalChapters.map((ch) => {
                const isDone = studyState.completedChapters.includes(ch.number);
                const isInProgress = studyState.inProgressChapters.includes(ch.number);
                const isReview = ch.kind === 'review';
                return (
                  <button
                    key={ch.number}
                    type="button"
                    title={`Chapter ${ch.number}: ${ch.displayTitle}${isDone ? ' (Completed)' : ''}`}
                    onClick={() => onOpenChapter(ch.number)}
                    className={`flex h-9 items-center justify-center rounded border font-mono text-xs tabular-nums transition-colors ${
                      isDone
                        ? 'border-[var(--color-sage)] bg-[var(--color-sage)] text-white dark:border-emerald-600 dark:bg-emerald-700'
                        : isInProgress
                          ? 'border-[var(--color-prussian)] bg-[var(--color-prussian)]/10 font-semibold text-[var(--color-prussian)] dark:border-[#5B9BD5] dark:bg-[#5B9BD5]/15 dark:text-[#7AB3E6]'
                          : isReview
                            ? 'border-[var(--color-ochre)]/50 bg-[var(--color-paper-subtle)] font-medium text-[var(--color-ochre)] hover:border-[var(--color-ochre)] dark:border-amber-500/40 dark:bg-[var(--color-night-subtle)] dark:text-amber-300'
                            : 'border-[var(--color-hairline)] bg-[var(--color-paper)] text-[var(--color-ink-muted)] hover:border-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-slate-400'
                    }`}
                  >
                    {ch.number}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[11px] text-[var(--color-ink-muted)] dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-xs bg-[var(--color-sage)] dark:bg-emerald-700" />
                Completed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-xs border border-[var(--color-prussian)] bg-[var(--color-prussian)]/15 dark:border-[#5B9BD5]" />
                In progress
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-xs border border-[var(--color-ochre)]/60 bg-[var(--color-paper-subtle)] dark:border-amber-500/50 dark:bg-[var(--color-night-subtle)]" />
                Review chapter (12, 18, 24, 30, 36, 41)
              </span>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Saved Vocabulary, Difficult Concepts, Quiz Results, Textbook Reference */}
        <div className="space-y-6 lg:col-span-5">
          {/* My Difficult Concepts */}
          <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-[var(--color-ochre)] dark:text-amber-400" />
                <h2 className="font-editorial text-lg font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  My Difficult Concepts
                </h2>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-[var(--color-ink-muted)] dark:text-slate-400">
                {difficultChapterObjects.length} flagged
              </span>
            </div>

            {difficultChapterObjects.length > 0 ? (
              <ul className="mt-4 divide-y divide-[var(--color-hairline)] dark:divide-[var(--color-night-hairline)]">
                {difficultChapterObjects.map((ch) => (
                  <li key={ch.number} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <button
                      type="button"
                      onClick={() => onOpenChapter(ch.number)}
                      className="text-left text-sm font-medium text-[var(--color-ink)] hover:text-[var(--color-prussian)] dark:text-[#EDEAE3] dark:hover:text-[#7AB3E6]"
                    >
                      Ch. {ch.number}: {ch.englishTitle}
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleDifficult(ch.number, ch.displayTitle)}
                      className="shrink-0 font-mono text-[11px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:text-slate-400 dark:hover:text-white"
                    >
                      Clear
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
                Nothing flagged yet. Use the &ldquo;Flag Difficult&rdquo; button on any chapter in the Learning
                Path or Textbook view to track challenging grammar topics (e.g., Dative Case, Adjective Endings,
                Two-Way Prepositions).
              </p>
            )}
          </div>

          {/* Saved Vocabulary */}
          <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bookmark className="h-4 w-4 text-[var(--color-prussian)] dark:text-[#7AB3E6]" />
                <h2 className="font-editorial text-lg font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  Saved Vocabulary
                </h2>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-[var(--color-ink-muted)] dark:text-slate-400">
                {studyState.savedVocab.length} saved
              </span>
            </div>

            {studyState.savedVocab.length === 0 ? (
              <p className="mt-3 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
                No personal flashcards saved yet. Select any German word in the Textbook Reader to save it
                here—powered by {book.lexicon.length.toLocaleString()} indexed entries from Chapter 46.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--color-hairline)] dark:divide-[var(--color-night-hairline)]">
                {studyState.savedVocab.slice(0, 5).map((item) => (
                  <li key={item.id} className="flex items-baseline justify-between gap-2 py-2 first:pt-0">
                    <button
                      type="button"
                      onClick={() => onOpenChapter(item.chapterNumber)}
                      className="min-w-0 flex-1 text-left text-xs hover:text-[var(--color-prussian)] dark:hover:text-[#7AB3E6]"
                    >
                      <span className="font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                        {item.article ? `${item.article} ` : ''}
                        {item.german}
                      </span>
                      <span className="ml-1.5 text-[var(--color-ink-muted)] dark:text-slate-400">
                        — {item.english}
                      </span>
                    </button>
                    <span className="shrink-0 font-mono text-[10px] text-[var(--color-ink-muted)] dark:text-slate-500">
                      Ch. {item.chapterNumber}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => onOpenVocabularyStudio('database')}
                className="text-xs font-medium text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
              >
                Open Vocabulary Studio →
              </button>
              <button
                type="button"
                onClick={() => onOpenVocabularyStudio('flashcards')}
                className="text-xs font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:underline dark:text-slate-400 dark:hover:text-white"
              >
                Practice Flashcards
              </button>
            </div>
          </div>

          {/* Recent Quiz Results */}
          <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-[var(--color-sage)] dark:text-emerald-400" />
                <h2 className="font-editorial text-lg font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  Recent Quiz Results
                </h2>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-[var(--color-ink-muted)] dark:text-slate-400">
                {studyState.quizResults.length} completed
              </span>
            </div>

            {studyState.quizResults.length === 0 ? (
              <p className="mt-3 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
                No assessments taken yet. Practise any of the {book.audit.totalExercisesInBook} textbook
                exercises ({book.audit.exercisesWithAnswerKey} auto-graded against Chapter 45) or start a
                Chapter / Unit Assessment.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--color-hairline)] dark:divide-[var(--color-night-hairline)]">
                {studyState.quizResults.slice(0, 5).map((q) => {
                  const pct = q.total > 0 ? Math.round((q.score / q.total) * 100) : 0;
                  return (
                    <li key={q.id} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                          {q.title}
                        </p>
                        <p className="font-mono text-[10px] text-[var(--color-ink-muted)] dark:text-slate-500">
                          {formatRelativeDate(q.completedAt)}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--color-sage)] dark:text-emerald-400">
                        {q.score}/{q.total} ({pct}%)
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => onOpenPractice('assessments')}
                className="text-xs font-medium text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
              >
                Take Chapter / Unit Test →
              </button>
              <button
                type="button"
                onClick={() => onOpenPractice('revision')}
                className="text-xs font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:underline dark:text-slate-400 dark:hover:text-white"
              >
                Weak Areas Queue
              </button>
            </div>
          </div>

          {/* Textbook Source Summary Card */}
          <div className="rounded-lg border border-[var(--color-hairline)] bg-[var(--color-paper-subtle)] p-5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-subtle)]">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-[var(--color-prussian)] dark:text-[#7AB3E6]" />
              <h3 className="text-sm font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                Verified Textbook Inventory
              </h3>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 font-mono text-xs tabular-nums">
              <div>
                <dt className="text-[var(--color-ink-muted)] dark:text-slate-400">Chapters parsed</dt>
                <dd className="mt-0.5 font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  {book.audit.totalChapters} / 48
                </dd>
              </div>
              <div>
                <dt className="text-[var(--color-ink-muted)] dark:text-slate-400">Images resolved</dt>
                <dd className="mt-0.5 font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  {book.audit.resolvedImagesCount} / {book.audit.uniqueImagesReferenced}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--color-ink-muted)] dark:text-slate-400">Book exercises</dt>
                <dd className="mt-0.5 font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  {book.audit.totalExercisesInBook} ({book.audit.exercisesWithAnswerKey} keyed)
                </dd>
              </div>
              <div>
                <dt className="text-[var(--color-ink-muted)] dark:text-slate-400">Total words</dt>
                <dd className="mt-0.5 font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  {book.audit.totalWords.toLocaleString()}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex items-center justify-between border-t border-[var(--color-hairline)] pt-3 text-xs dark:border-[var(--color-night-hairline)]">
              <span className="inline-flex items-center gap-1.5 text-[var(--color-ink-muted)] dark:text-slate-400">
                <Clock className="h-3.5 w-3.5" />
                Stages 1–8 active · Stage 9 Notebook &amp; Progress next
              </span>
              <button
                type="button"
                onClick={onOpenSourceAudit}
                className="font-medium text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
              >
                Full audit →
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
