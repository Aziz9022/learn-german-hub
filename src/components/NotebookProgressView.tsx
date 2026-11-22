import {
  AlertCircle,
  BarChart3,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  Download,
  Edit3,
  FileText,
  Flag,
  GraduationCap,
  Highlighter,
  History,
  NotebookPen,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { ExtractedExercise } from '../services/exerciseExtractor';
import { playGermanAudio } from '../services/germanAudio';
import type { HighlightColor, ParsedBook, UserStudyState } from '../types/book';

export type NotebookTab = 'progress' | 'notes' | 'bookmarks' | 'backup';

interface NotebookProgressViewProps {
  book: ParsedBook;
  exercises: ExtractedExercise[];
  studyState: UserStudyState;
  initialTab?: NotebookTab;
  onOpenChapter: (chapterNumber: number) => void;
  onOpenLesson: (chapterNumber: number) => void;
  onOpenPracticeChapter: (chapterNumber: number) => void;
  onToggleChapterCompleted: (chapterNumber: number, title: string) => void;
  onToggleDifficultChapter: (chapterNumber: number, title: string) => void;
  onAddAnnotation: (chapterNumber: number, selectedText: string, note: string) => void;
  onUpdateAnnotation: (annotationId: string, note: string) => void;
  onDeleteAnnotation: (annotationId: string) => void;
  onRemoveBookmark: (bookmarkId: string) => void;
  onRemoveHighlight: (highlightId: string) => void;
  onExportStudyJson: () => string;
  onImportStudyJson: (raw: string) => { ok: boolean; error?: string; summary?: string };
  onResetStudyProgress: () => void;
}

const HIGHLIGHT_STYLES: Record<HighlightColor, { label: string; bar: string; badge: string }> = {
  amber: {
    label: 'Amber',
    bar: 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20',
    badge: 'text-amber-700 dark:text-amber-300',
  },
  sage: {
    label: 'Sage',
    bar: 'border-l-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20',
    badge: 'text-emerald-700 dark:text-emerald-300',
  },
  prussian: {
    label: 'Prussian',
    bar: 'border-l-[#1E4D7B] bg-[#1E4D7B]/5 dark:border-l-[#5B9BD5] dark:bg-[#5B9BD5]/10',
    badge: 'text-[#1E4D7B] dark:text-[#7AB3E6]',
  },
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function NotebookProgressView({
  book,
  exercises,
  studyState,
  initialTab = 'progress',
  onOpenChapter,
  onOpenLesson,
  onOpenPracticeChapter,
  onToggleChapterCompleted,
  onToggleDifficultChapter,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onRemoveBookmark,
  onRemoveHighlight,
  onExportStudyJson,
  onImportStudyJson,
  onResetStudyProgress,
}: NotebookProgressViewProps) {
  const [activeTab, setActiveTab] = useState<NotebookTab>(initialTab);

  // Progress matrix filters
  const [matrixUnitFilter, setMatrixUnitFilter] = useState<string>('all');
  const [matrixStatusFilter, setMatrixStatusFilter] = useState<
    'all' | 'completed' | 'in-progress' | 'difficult' | 'unstarted'
  >('all');

  // Notes tab state
  const [noteSearch, setNoteSearch] = useState('');
  const [noteChapterFilter, setNoteChapterFilter] = useState<number | 'all'>('all');
  const [newNoteChapter, setNewNoteChapter] = useState<number>(studyState.lastChapterNumber || 1);
  const [newNoteQuote, setNewNoteQuote] = useState('');
  const [newNoteBody, setNewNoteBody] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteDraft, setEditingNoteDraft] = useState('');

  // Bookmarks & Highlights filters
  const [highlightColorFilter, setHighlightColorFilter] = useState<HighlightColor | 'all'>('all');
  const [highlightChapterFilter, setHighlightChapterFilter] = useState<number | 'all'>('all');

  // Backup / Restore state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importFeedback, setImportFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [confirmResetStep, setConfirmResetStep] = useState(false);

  const instructionalChapters = useMemo(
    () => book.chapters.filter((c) => c.number <= 44),
    [book.chapters]
  );

  // Compute rich analytics
  const analytics = useMemo(() => {
    const completedChaptersCount = instructionalChapters.filter((c) =>
      studyState.completedChapters.includes(c.number)
    ).length;
    const coursePct =
      instructionalChapters.length > 0
        ? Math.round((completedChaptersCount / instructionalChapters.length) * 100)
        : 0;

    const exerciseRecords = Object.values(studyState.exerciseProgress);
    const completedExercises = exerciseRecords.filter((r) => r.completed).length;
    const needsReviewExercises = exerciseRecords.filter((r) => r.needsReview).length;

    const avgQuizPct =
      studyState.quizResults.length > 0
        ? Math.round(
            studyState.quizResults.reduce(
              (acc, q) => acc + (q.total > 0 ? (q.score / q.total) * 100 : 0),
              0
            ) / studyState.quizResults.length
          )
        : null;

    const vocabRecords = Object.values(studyState.vocabProgress);
    const nowMs = Date.now();
    const vocabMastered = vocabRecords.filter((v) => v.mastery === 'mastered').length;
    const vocabLearning = vocabRecords.filter((v) => v.mastery === 'learning').length;
    const vocabDifficult = vocabRecords.filter((v) => v.difficult).length;
    const vocabDue = vocabRecords.filter(
      (v) => v.nextReviewAt && new Date(v.nextReviewAt).getTime() <= nowMs
    ).length;

    const avgReadingPct =
      instructionalChapters.length > 0
        ? Math.round(
            instructionalChapters.reduce(
              (sum, ch) =>
                sum +
                (studyState.completedChapters.includes(ch.number)
                  ? 100
                  : studyState.chapterProgress[ch.number] || 0),
              0
            ) / instructionalChapters.length
          )
        : 0;

    return {
      completedChaptersCount,
      coursePct,
      completedExercises,
      needsReviewExercises,
      avgQuizPct,
      vocabMastered,
      vocabLearning,
      vocabDifficult,
      vocabDue,
      avgReadingPct,
    };
  }, [instructionalChapters, studyState]);

  const exercisesByChapter = useMemo(() => {
    const map = new Map<number, ExtractedExercise[]>();
    for (const ex of exercises) {
      const list = map.get(ex.chapterNumber) || [];
      list.push(ex);
      map.set(ex.chapterNumber, list);
    }
    return map;
  }, [exercises]);

  const filteredMatrixChapters = useMemo(() => {
    return instructionalChapters.filter((ch) => {
      if (matrixUnitFilter !== 'all' && ch.unitId !== matrixUnitFilter) return false;
      const done = studyState.completedChapters.includes(ch.number);
      const inProg = studyState.inProgressChapters.includes(ch.number);
      const diff = studyState.difficultChapters.includes(ch.number);
      if (matrixStatusFilter === 'completed' && !done) return false;
      if (matrixStatusFilter === 'in-progress' && !inProg) return false;
      if (matrixStatusFilter === 'difficult' && !diff) return false;
      if (matrixStatusFilter === 'unstarted' && (done || inProg)) return false;
      return true;
    });
  }, [instructionalChapters, matrixUnitFilter, matrixStatusFilter, studyState]);

  const filteredAnnotations = useMemo(() => {
    const q = noteSearch.trim().toLowerCase();
    return studyState.annotations.filter((a) => {
      if (noteChapterFilter !== 'all' && a.chapterNumber !== noteChapterFilter) return false;
      if (q) {
        const hay = `${a.note} ${a.selectedText} chapter ${a.chapterNumber}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [studyState.annotations, noteSearch, noteChapterFilter]);

  const filteredHighlights = useMemo(() => {
    return studyState.highlights.filter((h) => {
      if (highlightColorFilter !== 'all' && h.color !== highlightColorFilter) return false;
      if (highlightChapterFilter !== 'all' && h.chapterNumber !== highlightChapterFilter) {
        return false;
      }
      return true;
    });
  }, [studyState.highlights, highlightColorFilter, highlightChapterFilter]);

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteBody.trim()) return;
    const ch = book.chapters.find((c) => c.number === newNoteChapter);
    const contextText =
      newNoteQuote.trim() || `Chapter ${newNoteChapter}: ${ch?.englishTitle || 'Study Note'}`;
    onAddAnnotation(newNoteChapter, contextText, newNoteBody.trim());
    setNewNoteQuote('');
    setNewNoteBody('');
  };

  const handleDownloadMarkdownNotebook = () => {
    const lines: string[] = [
      `# German Made Simple — Personal Study Notebook`,
      ``,
      `Exported: ${new Date().toLocaleString()}`,
      ``,
      `## Progress Summary`,
      `- Chapters completed: ${analytics.completedChaptersCount} / ${instructionalChapters.length} (${analytics.coursePct}%)`,
      `- Textbook exercises completed: ${analytics.completedExercises} / ${exercises.length}`,
      `- Saved vocabulary: ${studyState.savedVocab.length} (${analytics.vocabMastered} mastered)`,
      `- Personal notes: ${studyState.annotations.length}`,
      `- Text highlights: ${studyState.highlights.length}`,
      `- Bookmarks: ${studyState.bookmarks.length}`,
      ``,
    ];

    if (studyState.difficultChapters.length > 0) {
      lines.push(`## Flagged Difficult Chapters`);
      for (const chNum of studyState.difficultChapters) {
        const ch = book.chapters.find((c) => c.number === chNum);
        lines.push(`- Chapter ${chNum}: ${ch?.displayTitle || ''}`);
      }
      lines.push(``);
    }

    if (studyState.annotations.length > 0) {
      lines.push(`## Personal Notes & Annotations`);
      for (const ann of studyState.annotations) {
        lines.push(`### Chapter ${ann.chapterNumber} — ${ann.selectedText}`);
        lines.push(ann.note);
        lines.push(`*Updated: ${formatDate(ann.updatedAt)}*`);
        lines.push(``);
      }
    }

    if (studyState.highlights.length > 0) {
      lines.push(`## Textbook Highlights`);
      for (const hl of studyState.highlights) {
        lines.push(`- **Ch. ${hl.chapterNumber}** (${hl.color}): "${hl.text}"`);
      }
      lines.push(``);
    }

    if (studyState.bookmarks.length > 0) {
      lines.push(`## Bookmarks`);
      for (const bm of studyState.bookmarks) {
        lines.push(
          `- **Ch. ${bm.chapterNumber}: ${bm.chapterTitle}**${
            bm.sectionLabel ? ` — ${bm.sectionLabel}` : ''
          }`
        );
      }
      lines.push(``);
    }

    if (studyState.savedVocab.length > 0) {
      lines.push(`## Saved German Vocabulary`);
      lines.push(`| German | English | Chapter |`);
      lines.push(`| --- | --- | --- |`);
      for (const v of studyState.savedVocab) {
        const de = `${v.article ? `${v.article} ` : ''}${v.german}${v.plural ? ` (${v.plural})` : ''}`;
        lines.push(`| ${de.replace(/\|/g, '/')} | ${v.english.replace(/\|/g, '/')} | Ch. ${v.chapterNumber} |`);
      }
      lines.push(``);
    }

    const stamp = new Date().toISOString().slice(0, 10);
    triggerDownload(
      `german-made-simple-notebook-${stamp}.md`,
      lines.join('\n'),
      'text/markdown;charset=utf-8'
    );
  };

  const handleDownloadJsonBackup = () => {
    const json = onExportStudyJson();
    const stamp = new Date().toISOString().slice(0, 10);
    triggerDownload(
      `german-made-simple-backup-${stamp}.json`,
      json,
      'application/json;charset=utf-8'
    );
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = onImportStudyJson(text);
      if (result.ok) {
        setImportFeedback({
          type: 'success',
          message: result.summary || 'Backup restored successfully.',
        });
      } else {
        setImportFeedback({
          type: 'error',
          message: result.error || 'Could not import backup file.',
        });
      }
    } catch {
      setImportFeedback({ type: 'error', message: 'Failed to read the selected file.' });
    } finally {
      e.target.value = '';
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header & KPI Strip */}
      <header className="border-b border-[var(--color-hairline)] pb-6 dark:border-[var(--color-night-hairline)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
              Personal Study Archive · Progress &amp; Mastery
            </p>
            <h1 className="mt-1 font-editorial text-3xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-4xl dark:text-[#EDEAE3]">
              Notebook &amp; Progress Analytics
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-300">
              Track your chapter mastery across German Made Simple, review all personal notes,
              highlights, and bookmarks in one place, and export Markdown notebooks or full JSON
              backups at any time.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadMarkdownNotebook}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-hairline)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Export Notes (.md)</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadJsonBackup}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-prussian)] px-3 py-2 text-xs font-medium text-white hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Backup Progress (.json)</span>
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
              Course Completion
            </dt>
            <dd className="mt-1 flex items-baseline gap-2">
              <span className="font-editorial text-2xl font-semibold tabular-nums text-[var(--color-ink)] dark:text-[#EDEAE3]">
                {analytics.coursePct}%
              </span>
              <span className="font-mono text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                {analytics.completedChaptersCount}/44 ch.
              </span>
            </dd>
          </div>

          <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
              Workbook Exercises
            </dt>
            <dd className="mt-1 flex items-baseline gap-2">
              <span className="font-editorial text-2xl font-semibold tabular-nums text-[var(--color-sage)] dark:text-emerald-400">
                {analytics.completedExercises}
              </span>
              <span className="font-mono text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                / {exercises.length} done
              </span>
            </dd>
          </div>

          <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
              Quiz &amp; Test Average
            </dt>
            <dd className="mt-1 flex items-baseline gap-2">
              <span className="font-editorial text-2xl font-semibold tabular-nums text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                {analytics.avgQuizPct !== null ? `${analytics.avgQuizPct}%` : '—'}
              </span>
              <span className="font-mono text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                {studyState.quizResults.length} logged
              </span>
            </dd>
          </div>

          <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
              Personal Study Items
            </dt>
            <dd className="mt-1 flex items-baseline gap-2">
              <span className="font-editorial text-2xl font-semibold tabular-nums text-[var(--color-ink)] dark:text-[#EDEAE3]">
                {studyState.annotations.length +
                  studyState.highlights.length +
                  studyState.bookmarks.length}
              </span>
              <span className="font-mono text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                {studyState.annotations.length}n · {studyState.highlights.length}h ·{' '}
                {studyState.bookmarks.length}b
              </span>
            </dd>
          </div>
        </dl>

        {/* Sub-navigation Tabs */}
        <div className="mt-6 flex flex-wrap gap-1.5">
          {(
            [
              { id: 'progress', label: 'Progress & Mastery', icon: BarChart3 },
              {
                id: 'notes',
                label: `Personal Notes (${studyState.annotations.length})`,
                icon: NotebookPen,
              },
              {
                id: 'bookmarks',
                label: `Bookmarks & Highlights (${studyState.bookmarks.length + studyState.highlights.length})`,
                icon: Highlighter,
              },
              { id: 'backup', label: 'Export & Backup', icon: Download },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
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

      {/* ==================================================================== */}
      {/* TAB 1: PROGRESS & MASTERY ANALYTICS                                  */}
      {/* ==================================================================== */}
      {activeTab === 'progress' && (
        <div className="mt-6 space-y-8">
          {/* 6 Book Parts Progress Breakdown */}
          <section>
            <h2 className="font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
              Mastery by Textbook Part (Parts I–VI)
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {book.units
                .filter((u) => u.chapterStart <= 44)
                .map((unit) => {
                  const unitChapters = instructionalChapters.filter((c) => c.unitId === unit.id);
                  const doneCount = unitChapters.filter((c) =>
                    studyState.completedChapters.includes(c.number)
                  ).length;
                  const unitExercises = exercises.filter((e) => e.unitId === unit.id);
                  const doneExCount = unitExercises.filter(
                    (e) => studyState.exerciseProgress[e.exerciseNumber]?.completed
                  ).length;
                  const pct =
                    unitChapters.length > 0
                      ? Math.round((doneCount / unitChapters.length) * 100)
                      : 0;

                  return (
                    <div
                      key={unit.id}
                      className="rounded-lg border border-[var(--color-hairline)] bg-white p-5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]"
                    >
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="font-semibold uppercase text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                          {unit.subtitle}
                        </span>
                        <span className="tabular-nums text-[var(--color-ink-muted)] dark:text-slate-400">
                          {pct}% complete
                        </span>
                      </div>
                      <h3 className="mt-1.5 font-editorial text-base font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                        {unit.title.replace(/^Part [IVX]+ · /, '')}
                      </h3>
                      <div className="mt-3 h-2 w-full overflow-hidden rounded-sm bg-[var(--color-paper-subtle)] dark:bg-[var(--color-night-subtle)]">
                        <div
                          className="h-full bg-[var(--color-sage)] transition-all dark:bg-emerald-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-3 flex items-center justify-between font-mono text-[11px] tabular-nums text-[var(--color-ink-muted)] dark:text-slate-400">
                        <span>
                          Chapters: {doneCount}/{unitChapters.length}
                        </span>
                        <span>
                          Exercises: {doneExCount}/{unitExercises.length}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>

          {/* Vocabulary Retention + Study History Split */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 lg:col-span-5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
              <h2 className="font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                Vocabulary &amp; Reading Snapshot
              </h2>
              <dl className="mt-4 divide-y divide-[var(--color-hairline)] text-xs dark:divide-[var(--color-night-hairline)]">
                <div className="flex items-center justify-between py-2.5 first:pt-0">
                  <dt className="text-[var(--color-ink-muted)] dark:text-slate-400">
                    Average Chapter Reading Progress
                  </dt>
                  <dd className="font-mono font-semibold tabular-nums text-[var(--color-ink)] dark:text-[#EDEAE3]">
                    {analytics.avgReadingPct}%
                  </dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-[var(--color-ink-muted)] dark:text-slate-400">
                    Personal Saved Flashcards
                  </dt>
                  <dd className="font-mono font-semibold tabular-nums text-[var(--color-ink)] dark:text-[#EDEAE3]">
                    {studyState.savedVocab.length}
                  </dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-[var(--color-ink-muted)] dark:text-slate-400">
                    Words Mastered / Learning
                  </dt>
                  <dd className="font-mono font-semibold tabular-nums text-[var(--color-sage)] dark:text-emerald-400">
                    {analytics.vocabMastered} mastered · {analytics.vocabLearning} learning
                  </dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-[var(--color-ink-muted)] dark:text-slate-400">
                    Difficult Words / Due for Review
                  </dt>
                  <dd className="font-mono font-semibold tabular-nums text-[var(--color-ochre)] dark:text-amber-400">
                    {analytics.vocabDifficult} difficult · {analytics.vocabDue} due
                  </dd>
                </div>
                <div className="flex items-center justify-between py-2.5 last:pb-0">
                  <dt className="text-[var(--color-ink-muted)] dark:text-slate-400">
                    Exercises Needing Revision
                  </dt>
                  <dd className="font-mono font-semibold tabular-nums text-[var(--color-ochre)] dark:text-amber-400">
                    {analytics.needsReviewExercises}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 lg:col-span-7 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-[var(--color-prussian)] dark:text-[#7AB3E6]" />
                  <h2 className="font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                    Study Activity Timeline
                  </h2>
                </div>
                <span className="font-mono text-[11px] text-[var(--color-ink-muted)] dark:text-slate-400">
                  Last {studyState.studyHistory.length} events
                </span>
              </div>

              {studyState.studyHistory.length === 0 ? (
                <p className="mt-4 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                  Your chapter visits, completions, and difficult flags will appear here as you
                  study.
                </p>
              ) : (
                <ul className="mt-4 max-h-56 divide-y divide-[var(--color-hairline)] overflow-y-auto dark:divide-[var(--color-night-hairline)]">
                  {studyState.studyHistory.map((item, idx) => (
                    <li
                      key={`${item.chapterNumber}-${item.visitedAt}-${idx}`}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenLesson(item.chapterNumber)}
                        className="text-left font-medium text-[var(--color-ink)] hover:text-[var(--color-prussian)] dark:text-[#EDEAE3] dark:hover:text-[#7AB3E6]"
                      >
                        Ch. {String(item.chapterNumber).padStart(2, '0')} · {item.chapterTitle}
                      </button>
                      <div className="flex items-center gap-3 font-mono text-[11px] text-[var(--color-ink-muted)] dark:text-slate-400">
                        <span className="uppercase">{item.action.replace('-', ' ')}</span>
                        <span>{formatDate(item.visitedAt)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Chapter-by-Chapter Mastery Table (Chapters 1–44) */}
          <section className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-hairline)] pb-4 dark:border-[var(--color-night-hairline)]">
              <div>
                <h2 className="font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  Chapter-by-Chapter Mastery Matrix (Chapters 1–44)
                </h2>
                <p className="mt-0.5 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                  Toggle completion or difficult flags directly, or jump straight into any Lesson,
                  Textbook section, or Chapter Exercise set.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filter chapters by book part"
                  value={matrixUnitFilter}
                  onChange={(e) => setMatrixUnitFilter(e.target.value)}
                  className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] px-2.5 py-1.5 text-xs text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
                >
                  <option value="all">All Parts (1–44)</option>
                  {book.units
                    .filter((u) => u.chapterStart <= 44)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.title.split('·')[0].trim()} ({u.subtitle})
                      </option>
                    ))}
                </select>
                <select
                  aria-label="Filter chapters by status"
                  value={matrixStatusFilter}
                  onChange={(e) =>
                    setMatrixStatusFilter(
                      e.target.value as
                        | 'all'
                        | 'completed'
                        | 'in-progress'
                        | 'difficult'
                        | 'unstarted'
                    )
                  }
                  className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] px-2.5 py-1.5 text-xs text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
                >
                  <option value="all">All Statuses</option>
                  <option value="completed">Completed</option>
                  <option value="in-progress">In Progress</option>
                  <option value="difficult">Flagged Difficult</option>
                  <option value="unstarted">Not Started</option>
                </select>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-hairline)] font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:text-slate-400">
                    <th className="py-2.5 pr-3">Chapter</th>
                    <th className="px-3 py-2.5">Read</th>
                    <th className="px-3 py-2.5">Exercises</th>
                    <th className="px-3 py-2.5">Notes</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="py-2.5 pl-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-hairline)] dark:divide-[var(--color-night-hairline)]">
                  {filteredMatrixChapters.map((ch) => {
                    const isDone = studyState.completedChapters.includes(ch.number);
                    const isDiff = studyState.difficultChapters.includes(ch.number);
                    const readPct = isDone ? 100 : studyState.chapterProgress[ch.number] || 0;
                    const chEx = exercisesByChapter.get(ch.number) || [];
                    const doneEx = chEx.filter(
                      (e) => studyState.exerciseProgress[e.exerciseNumber]?.completed
                    ).length;
                    const notesCount = studyState.annotations.filter(
                      (a) => a.chapterNumber === ch.number
                    ).length;

                    return (
                      <tr
                        key={ch.number}
                        className="hover:bg-[var(--color-paper-subtle)]/60 dark:hover:bg-[var(--color-night-subtle)]/60"
                      >
                        <td className="py-2.5 pr-3">
                          <span className="font-mono text-[11px] text-[var(--color-ink-muted)] dark:text-slate-400">
                            Ch. {String(ch.number).padStart(2, '0')}
                          </span>{' '}
                          <span className="font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                            {ch.displayTitle}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono tabular-nums text-[var(--color-ink-muted)] dark:text-slate-400">
                          {readPct}%
                        </td>
                        <td className="px-3 py-2.5 font-mono tabular-nums text-[var(--color-ink-muted)] dark:text-slate-400">
                          {chEx.length > 0 ? `${doneEx}/${chEx.length}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 font-mono tabular-nums text-[var(--color-ink-muted)] dark:text-slate-400">
                          {notesCount > 0 ? notesCount : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onToggleChapterCompleted(ch.number, ch.displayTitle)}
                              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-medium ${
                                isDone
                                  ? 'border-[var(--color-sage)] bg-[var(--color-sage)]/12 text-[var(--color-sage)] dark:border-emerald-500 dark:text-emerald-300'
                                  : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:border-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:text-slate-400'
                              }`}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              <span>{isDone ? 'Done' : 'Mark'}</span>
                            </button>
                            <button
                              type="button"
                              title="Toggle Difficult Flag"
                              onClick={() => onToggleDifficultChapter(ch.number, ch.displayTitle)}
                              className={`rounded border p-1 ${
                                isDiff
                                  ? 'border-[var(--color-ochre)] bg-amber-50 text-[var(--color-ochre)] dark:border-amber-500 dark:bg-amber-950/30 dark:text-amber-300'
                                  : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-500'
                              }`}
                            >
                              <Flag className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          <div className="inline-flex items-center gap-2.5 font-medium">
                            <button
                              type="button"
                              onClick={() => onOpenLesson(ch.number)}
                              className="text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
                            >
                              Lesson
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenChapter(ch.number)}
                              className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:underline dark:text-slate-400 dark:hover:text-white"
                            >
                              Book
                            </button>
                            {chEx.length > 0 && (
                              <button
                                type="button"
                                onClick={() => onOpenPracticeChapter(ch.number)}
                                className="text-[var(--color-sage)] hover:underline dark:text-emerald-400"
                              >
                                Practice
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: PERSONAL NOTES & ANNOTATIONS                                  */}
      {/* ==================================================================== */}
      {activeTab === 'notes' && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Add New Chapter Note */}
          <aside className="lg:col-span-4">
            <form
              onSubmit={handleCreateNote}
              className="rounded-lg border border-[var(--color-hairline)] bg-white p-5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]"
            >
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-[var(--color-prussian)] dark:text-[#7AB3E6]" />
                <h2 className="font-editorial text-lg font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  New Study Note
                </h2>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label
                    htmlFor="nb-chapter"
                    className="block font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400"
                  >
                    Chapter
                  </label>
                  <select
                    id="nb-chapter"
                    value={newNoteChapter}
                    onChange={(e) => setNewNoteChapter(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] px-2.5 py-2 text-xs text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
                  >
                    {book.chapters.map((c) => (
                      <option key={c.number} value={c.number}>
                        Ch. {String(c.number).padStart(2, '0')} — {c.displayTitle}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="nb-quote"
                    className="block font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400"
                  >
                    German Phrase or Topic (Optional)
                  </label>
                  <input
                    id="nb-quote"
                    type="text"
                    value={newNoteQuote}
                    onChange={(e) => setNewNoteQuote(e.target.value)}
                    placeholder="e.g. Dative prepositions: aus, außer, bei, mit…"
                    className="mt-1 w-full rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] px-3 py-2 text-xs text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="nb-body"
                    className="block font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400"
                  >
                    Personal Note
                  </label>
                  <textarea
                    id="nb-body"
                    rows={5}
                    value={newNoteBody}
                    onChange={(e) => setNewNoteBody(e.target.value)}
                    placeholder="Record grammar reminders, tricky word genders, or example sentences…"
                    className="mt-1 w-full rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] p-3 text-xs leading-relaxed text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!newNoteBody.trim()}
                  className="w-full rounded-md bg-[var(--color-prussian)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--color-prussian-hover)] disabled:opacity-40 dark:bg-[#2B649B]"
                >
                  Save to Notebook
                </button>
              </div>
            </form>
          </aside>

          {/* Right: Searchable Notes Archive */}
          <section className="space-y-4 lg:col-span-8">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-hairline)] bg-white p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-muted)]" />
                <input
                  type="text"
                  value={noteSearch}
                  onChange={(e) => setNoteSearch(e.target.value)}
                  placeholder="Search your notes and annotated passages…"
                  className="w-full rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] py-2 pr-3 pl-9 text-xs text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
                />
              </div>

              <select
                aria-label="Filter notes by chapter"
                value={noteChapterFilter}
                onChange={(e) =>
                  setNoteChapterFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] px-2.5 py-2 text-xs text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
              >
                <option value="all">All Chapters</option>
                {book.chapters.map((c) => (
                  <option key={c.number} value={c.number}>
                    Ch. {String(c.number).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>

            {filteredAnnotations.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--color-hairline)] bg-white p-8 text-center text-xs text-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-slate-400">
                {studyState.annotations.length === 0
                  ? 'No personal notes yet. Add a note on the left, inside any Lesson Studio chapter, or by selecting text in the Interactive Textbook Reader.'
                  : 'No notes match your search or chapter filter.'}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAnnotations.map((ann) => {
                  const isEditing = editingNoteId === ann.id;
                  return (
                    <article
                      key={ann.id}
                      className="rounded-lg border border-[var(--color-hairline)] bg-white p-5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                            Chapter {ann.chapterNumber}
                          </span>
                          <p className="mt-0.5 font-editorial text-sm font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                            &ldquo;{ann.selectedText}&rdquo;
                          </p>
                        </div>

                        <div className="flex items-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => onOpenLesson(ann.chapterNumber)}
                            className="inline-flex items-center gap-1 text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
                          >
                            <GraduationCap className="h-3.5 w-3.5" />
                            <span>Lesson</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenChapter(ann.chapterNumber)}
                            className="inline-flex items-center gap-1 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:underline dark:text-slate-400 dark:hover:text-white"
                          >
                            <BookOpen className="h-3.5 w-3.5" />
                            <span>Reader</span>
                          </button>
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="mt-3 space-y-2">
                          <textarea
                            rows={3}
                            value={editingNoteDraft}
                            onChange={(e) => setEditingNoteDraft(e.target.value)}
                            className="w-full rounded-md border border-[var(--color-prussian)] bg-[var(--color-paper)] p-2.5 text-xs text-[var(--color-ink)] focus:outline-none dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                onUpdateAnnotation(ann.id, editingNoteDraft);
                                setEditingNoteId(null);
                              }}
                              className="inline-flex items-center gap-1 rounded bg-[var(--color-prussian)] px-3 py-1 text-xs font-medium text-white dark:bg-[#2B649B]"
                            >
                              <Check className="h-3 w-3" />
                              <span>Save</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingNoteId(null)}
                              className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] px-2.5 py-1 text-xs text-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:text-slate-300"
                            >
                              <X className="h-3 w-3" />
                              <span>Cancel</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-ink)] dark:text-slate-200">
                          {ann.note}
                        </p>
                      )}

                      <div className="mt-3 flex items-center justify-between border-t border-[var(--color-hairline)] pt-2.5 font-mono text-[10px] text-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:text-slate-500">
                        <span>Updated {formatDate(ann.updatedAt)}</span>
                        <div className="flex items-center gap-3">
                          {!isEditing && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNoteId(ann.id);
                                setEditingNoteDraft(ann.note);
                              }}
                              className="inline-flex items-center gap-1 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:text-slate-400 dark:hover:text-white"
                            >
                              <Edit3 className="h-3 w-3" />
                              <span>Edit</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onDeleteAnnotation(ann.id)}
                            className="inline-flex items-center gap-1 text-[var(--color-ink-muted)] hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: BOOKMARKS & HIGHLIGHTS                                        */}
      {/* ==================================================================== */}
      {activeTab === 'bookmarks' && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Bookmarks */}
          <section className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 lg:col-span-5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <div className="flex items-center justify-between border-b border-[var(--color-hairline)] pb-3 dark:border-[var(--color-night-hairline)]">
              <div className="flex items-center gap-2">
                <Bookmark className="h-4 w-4 text-[var(--color-prussian)] dark:text-[#7AB3E6]" />
                <h2 className="font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  Saved Bookmarks ({studyState.bookmarks.length})
                </h2>
              </div>
            </div>

            {studyState.bookmarks.length === 0 ? (
              <p className="mt-4 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
                No bookmarks yet. Click the Bookmark icon in the Textbook Reader toolbar to save
                your spot in any chapter.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--color-hairline)] dark:divide-[var(--color-night-hairline)]">
                {studyState.bookmarks.map((bm) => (
                  <li key={bm.id} className="flex items-start justify-between gap-3 py-3 first:pt-1">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpenChapter(bm.chapterNumber)}
                        className="text-left text-sm font-medium text-[var(--color-ink)] hover:text-[var(--color-prussian)] dark:text-[#EDEAE3] dark:hover:text-[#7AB3E6]"
                      >
                        Ch. {bm.chapterNumber}: {bm.chapterTitle}
                      </button>
                      {bm.sectionLabel && (
                        <p className="mt-0.5 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                          Section: {bm.sectionLabel}
                        </p>
                      )}
                      <p className="mt-1 font-mono text-[10px] text-[var(--color-ink-muted)] dark:text-slate-500">
                        {formatDate(bm.createdAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Remove bookmark"
                      onClick={() => onRemoveBookmark(bm.id)}
                      className="shrink-0 text-[var(--color-ink-muted)] hover:text-red-600 dark:text-slate-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Highlights */}
          <section className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 lg:col-span-7 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-hairline)] pb-3 dark:border-[var(--color-night-hairline)]">
              <div className="flex items-center gap-2">
                <Highlighter className="h-4 w-4 text-[var(--color-ochre)] dark:text-amber-400" />
                <h2 className="font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  Text Highlights ({filteredHighlights.length})
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filter highlights by color"
                  value={highlightColorFilter}
                  onChange={(e) =>
                    setHighlightColorFilter(e.target.value as HighlightColor | 'all')
                  }
                  className="rounded border border-[var(--color-hairline)] bg-[var(--color-paper)] px-2 py-1 text-xs text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
                >
                  <option value="all">All Colors</option>
                  <option value="amber">Amber</option>
                  <option value="sage">Sage</option>
                  <option value="prussian">Prussian</option>
                </select>

                <select
                  aria-label="Filter highlights by chapter"
                  value={highlightChapterFilter}
                  onChange={(e) =>
                    setHighlightChapterFilter(
                      e.target.value === 'all' ? 'all' : Number(e.target.value)
                    )
                  }
                  className="rounded border border-[var(--color-hairline)] bg-[var(--color-paper)] px-2 py-1 text-xs text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
                >
                  <option value="all">All Chapters</option>
                  {Array.from(new Set(studyState.highlights.map((h) => h.chapterNumber)))
                    .sort((a, b) => a - b)
                    .map((n) => (
                      <option key={n} value={n}>
                        Ch. {n}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {filteredHighlights.length === 0 ? (
              <p className="mt-4 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
                No highlights saved yet. Select any German phrase or grammar explanation inside the
                Interactive Textbook Reader and choose Amber, Sage, or Prussian highlight.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {filteredHighlights.map((hl) => {
                  const style = HIGHLIGHT_STYLES[hl.color] || HIGHLIGHT_STYLES.amber;
                  return (
                    <li
                      key={hl.id}
                      className={`rounded-r-md border border-l-4 border-[var(--color-hairline)] p-3.5 dark:border-[var(--color-night-hairline)] ${style.bar}`}
                    >
                      <p className="font-editorial text-sm leading-relaxed text-[var(--color-ink)] dark:text-[#EDEAE3]">
                        &ldquo;{hl.text}&rdquo;
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px]">
                        <span className={style.badge}>
                          Ch. {hl.chapterNumber} · {style.label} · {formatDate(hl.createdAt)}
                        </span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => void playGermanAudio(hl.text, 1)}
                            className="inline-flex items-center gap-1 text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
                          >
                            <Volume2 className="h-3 w-3" />
                            <span>Listen</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenChapter(hl.chapterNumber)}
                            className="text-[var(--color-ink-muted)] hover:underline dark:text-slate-300"
                          >
                            Open Ch. {hl.chapterNumber}
                          </button>
                          <button
                            type="button"
                            aria-label="Remove highlight"
                            onClick={() => onRemoveHighlight(hl.id)}
                            className="text-[var(--color-ink-muted)] hover:text-red-600 dark:text-slate-400"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: EXPORT, BACKUP & RESTORE                                      */}
      {/* ==================================================================== */}
      {activeTab === 'backup' && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <h2 className="font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
              Export Personal Study Data
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-300">
              All progress is stored privately in your browser. Export your notes for printing or
              create a JSON snapshot whenever you switch devices or browsers (including on GitHub
              Pages).
            </p>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]">
                <div>
                  <p className="text-sm font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                    Readable Study Notebook (.md)
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                    Formatted Markdown with notes, highlights, bookmarks, and saved vocabulary table.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadMarkdownNotebook}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-hairline)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Download .md</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]">
                <div>
                  <p className="text-sm font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                    Complete Progress Backup (.json)
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                    Includes chapter completions, 202 exercise records, quiz scores, flashcards, and
                    notes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadJsonBackup}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--color-prussian)] px-3 py-2 text-xs font-medium text-white hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B]"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download .json</span>
                </button>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
              <h2 className="font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                Restore From JSON Backup
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-300">
                Select a previously exported <code>.json</code> backup file to restore your chapters,
                vocabulary mastery, notes, and exercise progress.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={(e) => void handleFileImport(e)}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 inline-flex items-center gap-2 rounded-md border border-[var(--color-prussian)] bg-[var(--color-paper)] px-4 py-2 text-xs font-medium text-[var(--color-prussian)] hover:bg-[var(--color-prussian)] hover:text-white dark:border-[#5B9BD5] dark:bg-[var(--color-night)] dark:text-[#7AB3E6] dark:hover:bg-[#2B649B] dark:hover:text-white"
              >
                <Upload className="h-4 w-4" />
                <span>Choose Backup File (.json)</span>
              </button>

              {importFeedback && (
                <div
                  className={`mt-4 flex items-start gap-2 rounded-md border p-3 text-xs ${
                    importFeedback.type === 'success'
                      ? 'border-[var(--color-sage)]/50 bg-[var(--color-sage)]/10 text-[var(--color-sage)] dark:border-emerald-500/50 dark:text-emerald-300'
                      : 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/50 dark:bg-red-950/30 dark:text-red-300'
                  }`}
                >
                  {importFeedback.type === 'success' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <span>{importFeedback.message}</span>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-red-200 bg-white p-6 dark:border-red-900/50 dark:bg-[var(--color-night-surface)]">
              <h3 className="font-editorial text-lg font-semibold text-red-700 dark:text-red-400">
                Reset Local Study Progress
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
                Clears local chapters, exercise attempts, quiz scores, saved vocabulary, notes,
                highlights, and bookmarks. Download a JSON backup first if you want to keep a copy.
              </p>

              {!confirmResetStep ? (
                <button
                  type="button"
                  onClick={() => setConfirmResetStep(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-red-300 px-3.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset All Progress…</span>
                </button>
              ) : (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onResetStudyProgress();
                      setConfirmResetStep(false);
                      setImportFeedback({
                        type: 'success',
                        message: 'Local study progress has been reset.',
                      });
                    }}
                    className="rounded-md bg-red-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                  >
                    Confirm Permanent Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResetStep(false)}
                    className="rounded-md border border-[var(--color-hairline)] px-3 py-1.5 text-xs text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
