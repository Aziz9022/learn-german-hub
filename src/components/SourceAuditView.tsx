import { AlertTriangle, CheckCircle2, FileWarning, FolderUp, Info, RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ParsedBook } from '../types/book';

interface SourceAuditViewProps {
  book: ParsedBook;
  isCustomImport: boolean;
  onImportFiles: (files: FileList) => Promise<void>;
  onResetToBundled: () => void;
  onOpenChapter: (chapterNumber: number) => void;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'Not provided';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function SourceAuditView({
  book,
  isCustomImport,
  onImportFiles,
  onResetToBundled,
  onOpenChapter,
}: SourceAuditViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const handleFileSelection = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImportError(null);
    setImporting(true);
    try {
      await onImportFiles(files);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Unable to parse selected files.');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const { audit, metadata } = book;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-hairline)] pb-6 dark:border-[var(--color-night-hairline)]">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
            Stage 1 · Complete Source Inspection & Integrity Report
          </p>
          <h1 className="mt-1.5 font-editorial text-3xl font-semibold tracking-tight text-[var(--color-ink)] dark:text-[#EDEAE3]">
            Book Source Audit
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
            Computed directly from the supplied HTML textbook, stylesheet, and image folder. Every missing
            frontmatter file, skipped exercise number, and source quirk is reported transparently without
            inventing missing material.
          </p>
        </div>

        {/* Multi-file Book Importer */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".html,.htm,.css,.jpg,.jpeg,.png,.gif,.webp,.svg"
            onChange={(e) => handleFileSelection(e.target.files)}
            className="hidden"
          />
          <button
            type="button"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-hairline)] bg-white px-3.5 py-2 text-xs font-medium text-[var(--color-ink)] transition-colors hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]"
          >
            <FolderUp className="h-4 w-4 text-[var(--color-prussian)] dark:text-[#7AB3E6]" />
            <span>{importing ? 'Parsing files...' : 'Import Local HTML + Images'}</span>
          </button>

          {isCustomImport && (
            <button
              type="button"
              onClick={onResetToBundled}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-hairline)] px-3 py-2 text-xs font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-300"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Restore Bundled Book</span>
            </button>
          )}
        </div>
      </header>

      {importError && (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {importError}
        </div>
      )}

      {/* Book Metadata & Quantitative Inventory */}
      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 lg:col-span-5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
          <h2 className="font-editorial text-lg font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
            Identified Book Metadata
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                Title & Subtitle
              </dt>
              <dd className="mt-0.5 font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                {metadata.title} — {metadata.subtitle}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                Author Attribution
              </dt>
              <dd className="mt-0.5 text-[var(--color-ink-muted)] dark:text-slate-300">
                {metadata.authorNote}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                Publisher & Copyright
              </dt>
              <dd className="mt-0.5 text-[var(--color-ink-muted)] dark:text-slate-300">
                {metadata.publisher} · {metadata.copyright}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                eISBN & Active Source Files
              </dt>
              <dd className="mt-0.5 font-mono text-xs text-[var(--color-ink-muted)] dark:text-slate-300">
                {metadata.eisbn} · {audit.htmlFileName} ({formatBytes(audit.htmlByteSize)}) ·{' '}
                {audit.cssFileName || 'No CSS'} ({formatBytes(audit.cssByteSize)})
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 lg:col-span-7 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
          <h2 className="font-editorial text-lg font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
            Parsed Content & Asset Inventory
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                Total Chapters
              </dt>
              <dd className="mt-1 font-editorial text-2xl font-semibold tabular-nums text-[var(--color-ink)] dark:text-[#EDEAE3]">
                {audit.totalChapters}
              </dd>
              <p className="text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                {audit.lessonChapters} lessons · {audit.reviewChapters} reviews · {audit.referenceChapters}{' '}
                reference
              </p>
            </div>

            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                Image Resolution
              </dt>
              <dd className="mt-1 font-editorial text-2xl font-semibold tabular-nums text-[var(--color-sage)] dark:text-emerald-400">
                {audit.resolvedImagesCount}/{audit.uniqueImagesReferenced}
              </dd>
              <p className="text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                {audit.totalImageTags} total &lt;img&gt; tags ({audit.inlineGlyphImages.length} inline glyphs)
              </p>
            </div>

            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                Exercises & Keys
              </dt>
              <dd className="mt-1 font-editorial text-2xl font-semibold tabular-nums text-[var(--color-ink)] dark:text-[#EDEAE3]">
                {audit.totalExercisesInBook}
              </dd>
              <p className="text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                {audit.exercisesWithAnswerKey} keyed in Ch. 45 · {audit.missingExerciseNumbers.length} skipped
              </p>
            </div>

            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                End Vocabularies
              </dt>
              <dd className="mt-1 font-editorial text-2xl font-semibold tabular-nums text-[var(--color-ink)] dark:text-[#EDEAE3]">
                {(audit.germanEnglishVocabCount + audit.englishGermanVocabCount).toLocaleString()}
              </dd>
              <p className="text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                {audit.germanEnglishVocabCount.toLocaleString()} DE→EN ·{' '}
                {audit.englishGermanVocabCount.toLocaleString()} EN→DE
              </p>
            </div>

            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                Dialogues & Readings
              </dt>
              <dd className="mt-1 font-editorial text-2xl font-semibold tabular-nums text-[var(--color-ink)] dark:text-[#EDEAE3]">
                {audit.chaptersWithDialogues.length} / {audit.chaptersWithLesestuck.length}
              </dd>
              <p className="text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                {audit.chaptersWithDialogues.length} dialogue ch. · {audit.chaptersWithLesestuck.length}{' '}
                Lesestück ch.
              </p>
            </div>

            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                Internal Links
              </dt>
              <dd className="mt-1 font-editorial text-2xl font-semibold tabular-nums text-[var(--color-ink)] dark:text-[#EDEAE3]">
                {audit.brokenInternalAnchors === 0 ? 'Intact' : `${audit.brokenInternalAnchors} broken`}
              </dd>
              <p className="text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                {audit.totalWords.toLocaleString()} total words parsed
              </p>
            </div>
          </dl>
        </div>
      </section>

      {/* Missing / Incomplete / Anomalous Findings */}
      <section className="mt-8">
        <h2 className="font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
          Missing, Incomplete & Notable Source Findings
        </h2>
        <div className="mt-4 space-y-3">
          {audit.findings.map((finding) => {
            const Icon =
              finding.severity === 'missing'
                ? FileWarning
                : finding.severity === 'warning'
                  ? AlertTriangle
                  : finding.id === 'all-images-resolved'
                    ? CheckCircle2
                    : Info;

            const accentClass =
              finding.severity === 'missing'
                ? 'border-l-red-600 dark:border-l-red-500'
                : finding.severity === 'warning'
                  ? 'border-l-[var(--color-ochre)] dark:border-l-amber-500'
                  : 'border-l-[var(--color-sage)] dark:border-l-emerald-500';

            const labelText =
              finding.severity === 'missing'
                ? 'Missing Source File'
                : finding.severity === 'warning'
                  ? 'Source Quirk'
                  : 'Verified';

            return (
              <div
                key={finding.id}
                className={`rounded-md border border-[var(--color-hairline)] border-l-4 bg-white p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] ${accentClass}`}
              >
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ink-muted)] dark:text-slate-300" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:text-slate-400">
                        {labelText} · {finding.category}
                      </span>
                      {finding.affectedChapters && finding.affectedChapters.length > 0 && (
                        <span className="font-mono text-[10px] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                          (Ch. {finding.affectedChapters.join(', ')})
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1 text-sm font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                      {finding.title}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-300">
                      {finding.details}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Complete 48-Chapter Structural Table */}
      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
            Complete 48-Chapter Structural Inventory
          </h2>
          <span className="font-mono text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
            Click any chapter row to inspect its parsed textbook HTML
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-[var(--color-hairline)] bg-white dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--color-hairline)] bg-[var(--color-paper-subtle)] font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-subtle)] dark:text-slate-400">
                <th className="px-4 py-3">Ch.</th>
                <th className="px-4 py-3">Original Title</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Words</th>
                <th className="px-4 py-3 text-right">Images</th>
                <th className="px-4 py-3">Exercises</th>
                <th className="px-4 py-3">Detected Features</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-hairline)] dark:divide-[var(--color-night-hairline)]">
              {book.chapters.map((ch) => (
                <tr
                  key={ch.number}
                  onClick={() => onOpenChapter(ch.number)}
                  className="cursor-pointer transition-colors hover:bg-[var(--color-paper)] dark:hover:bg-[var(--color-night-subtle)]/70"
                >
                  <td className="px-4 py-2.5 font-mono font-semibold tabular-nums text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                    {String(ch.number).padStart(2, '0')}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                    {ch.displayTitle}
                  </td>
                  <td className="px-4 py-2.5 font-mono uppercase text-[var(--color-ink-muted)] dark:text-slate-400">
                    {ch.kind}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--color-ink-muted)] dark:text-slate-300">
                    {ch.wordCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--color-ink-muted)] dark:text-slate-300">
                    {ch.uniqueImages.length}
                  </td>
                  <td className="px-4 py-2.5 font-mono tabular-nums text-[var(--color-ink-muted)] dark:text-slate-300">
                    {ch.exercises.length > 0
                      ? `${ch.exercises[0]}–${ch.exercises[ch.exercises.length - 1]} (${ch.exercises.length})`
                      : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-ink-muted)] dark:text-slate-400">
                    {[
                      ch.hasWortschatz ? 'Wortschatz' : null,
                      ch.hasRedemittel ? 'Redemittel' : null,
                      ch.hasDialogue ? 'Dialogue' : null,
                      ch.hasLesestuck ? 'Lesestück' : null,
                      ch.hasDrawingPlaceholder ? 'Placeholder text (Ex. 50)' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Text & tables'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
