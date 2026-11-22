import { Bookmark, BookOpen, Check, ListTree, Search, Trash2, X } from 'lucide-react';
import { useMemo } from 'react';
import type { BookChapter, ParsedBook, ReaderBookmark } from '../../types/book';

export type LeftRailTab = 'chapters' | 'sections' | 'search' | 'bookmarks';

interface BookSearchHit {
  chapterNumber: number;
  chapterTitle: string;
  matchCount: number;
  snippet: string;
}

interface ReaderNavigationRailProps {
  book: ParsedBook;
  chapter: BookChapter;
  activeTab: LeftRailTab;
  onSelectTab: (tab: LeftRailTab) => void;
  activeSectionId: string | null;
  completedChapters: number[];
  chapterProgress: Record<number, number>;
  bookmarks: ReaderBookmark[];
  searchQuery: string;
  onChangeSearchQuery: (q: string) => void;
  onSelectChapter: (chapterNumber: number, targetSectionId?: string) => void;
  onSelectSection: (sectionId: string) => void;
  onRemoveBookmark: (id: string) => void;
  onCloseMobile?: () => void;
}

export function ReaderNavigationRail({
  book,
  chapter,
  activeTab,
  onSelectTab,
  activeSectionId,
  completedChapters,
  chapterProgress,
  bookmarks,
  searchQuery,
  onChangeSearchQuery,
  onSelectChapter,
  onSelectSection,
  onRemoveBookmark,
  onCloseMobile,
}: ReaderNavigationRailProps) {
  const searchHits: BookSearchHit[] = useMemo(() => {
    const q = searchQuery.trim();
    if (q.length < 2) return [];
    const lowerQ = q.toLowerCase();
    const hits: BookSearchHit[] = [];

    for (const ch of book.chapters) {
      const lowerText = ch.plainText.toLowerCase();
      const firstIdx = lowerText.indexOf(lowerQ);
      const titleHit = ch.displayTitle.toLowerCase().includes(lowerQ);

      if (firstIdx === -1 && !titleHit) continue;

      let count = 0;
      if (firstIdx !== -1) {
        let pos = firstIdx;
        while (pos !== -1) {
          count++;
          pos = lowerText.indexOf(lowerQ, pos + lowerQ.length);
        }
      }

      const start = Math.max(0, firstIdx - 48);
      const end = Math.min(ch.plainText.length, (firstIdx === -1 ? 0 : firstIdx) + q.length + 72);
      const snippet =
        firstIdx === -1
          ? ch.plainExcerpt
          : `${start > 0 ? '…' : ''}${ch.plainText.slice(start, end)}${end < ch.plainText.length ? '…' : ''}`;

      hits.push({
        chapterNumber: ch.number,
        chapterTitle: ch.displayTitle,
        matchCount: Math.max(count, titleHit ? 1 : 0),
        snippet,
      });
    }

    return hits;
  }, [book.chapters, searchQuery]);

  return (
    <aside className="flex h-full flex-col border-r border-[var(--color-hairline)] bg-[var(--color-paper)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
      {/* Rail Header Tabs */}
      <div className="flex items-center justify-between border-b border-[var(--color-hairline)] px-2 py-2 dark:border-[var(--color-night-hairline)]">
        <div className="grid flex-1 grid-cols-4 gap-0.5">
          {(
            [
              { id: 'chapters', label: 'Ch.', icon: BookOpen, title: 'Chapters' },
              { id: 'sections', label: 'Outline', icon: ListTree, title: 'Chapter Sections' },
              { id: 'search', label: 'Search', icon: Search, title: 'Search Across Book' },
              { id: 'bookmarks', label: `Marks`, icon: Bookmark, title: 'Bookmarks' },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                title={tab.title}
                onClick={() => onSelectTab(tab.id)}
                className={`flex flex-col items-center justify-center gap-0.5 rounded py-1.5 text-[10px] font-medium transition-colors ${
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
            aria-label="Close navigation rail"
            className="ml-1 rounded p-1 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] lg:hidden dark:text-slate-400"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Scrollable Rail Body */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* CHAPTERS LIST */}
        {activeTab === 'chapters' && (
          <div className="space-y-4">
            {book.units.map((unit) => {
              const unitChapters = book.chapters.filter((c) => c.unitId === unit.id);
              return (
                <div key={unit.id}>
                  <p className="px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-500">
                    {unit.subtitle}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {unitChapters.map((ch) => {
                      const isCurrent = ch.number === chapter.number;
                      const isDone = completedChapters.includes(ch.number);
                      const pct = chapterProgress[ch.number] || 0;
                      return (
                        <li key={ch.number}>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectChapter(ch.number);
                              onCloseMobile?.();
                            }}
                            className={`flex w-full items-start justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                              isCurrent
                                ? 'bg-[var(--color-prussian)]/10 font-semibold text-[var(--color-prussian)] dark:bg-[#5B9BD5]/15 dark:text-[#7AB3E6]'
                                : 'text-[var(--color-ink-muted)] hover:bg-white hover:text-[var(--color-ink)] dark:text-slate-300 dark:hover:bg-[var(--color-night-subtle)]'
                            }`}
                          >
                            <span className="min-w-0 flex-1 leading-snug">
                              <span className="mr-1.5 font-mono text-[10px] tabular-nums opacity-75">
                                {String(ch.number).padStart(2, '0')}
                              </span>
                              {ch.germanTitle || ch.englishTitle}
                            </span>
                            {isDone ? (
                              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-sage)] dark:text-emerald-400" />
                            ) : pct > 0 ? (
                              <span className="mt-0.5 shrink-0 font-mono text-[10px] tabular-nums opacity-70">
                                {pct}%
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {/* CURRENT CHAPTER SECTION OUTLINE */}
        {activeTab === 'sections' && (
          <div>
            <p className="px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
              Chapter {chapter.number} Outline ({chapter.sections.length})
            </p>
            <ul className="mt-2 space-y-1">
              {chapter.sections.map((sec) => {
                const isActive = activeSectionId === sec.id;
                return (
                  <li key={sec.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectSection(sec.id);
                        onCloseMobile?.();
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                        isActive
                          ? 'bg-[var(--color-prussian)]/10 font-semibold text-[var(--color-prussian)] dark:bg-[#5B9BD5]/15 dark:text-[#7AB3E6]'
                          : 'text-[var(--color-ink-muted)] hover:bg-white hover:text-[var(--color-ink)] dark:text-slate-300 dark:hover:bg-[var(--color-night-subtle)]'
                      }`}
                    >
                      <span className="truncate">{sec.label}</span>
                      <span className="shrink-0 font-mono text-[9px] uppercase opacity-60">
                        {sec.kind === 'section' ? '' : sec.kind.slice(0, 4)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* FULL-BOOK SEARCH */}
        {activeTab === 'search' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-ink-muted)] dark:text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => onChangeSearchQuery(e.target.value)}
                placeholder="Search all 48 chapters (German or English)…"
                className="w-full rounded-md border border-[var(--color-hairline)] bg-white py-1.5 pr-2.5 pl-8 text-xs text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]/70 focus:border-[var(--color-prussian)] focus:outline-none dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
              />
            </div>

            {searchQuery.trim().length < 2 ? (
              <p className="px-1 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
                Enter at least 2 characters to search vocabulary, dialogues, grammar rules, and exercises across
                all 48 chapters.
              </p>
            ) : searchHits.length === 0 ? (
              <p className="px-1 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                No matches found for &ldquo;{searchQuery}&rdquo;.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="px-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                  {searchHits.length} chapter{searchHits.length === 1 ? '' : 's'} matched
                </p>
                <ul className="space-y-2">
                  {searchHits.map((hit) => (
                    <li key={hit.chapterNumber}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectChapter(hit.chapterNumber);
                          onCloseMobile?.();
                        }}
                        className="w-full rounded-md border border-[var(--color-hairline)] bg-white p-2.5 text-left transition-colors hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10px] font-semibold text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                            Ch. {hit.chapterNumber}
                          </span>
                          <span className="font-mono text-[10px] tabular-nums text-[var(--color-ink-muted)] dark:text-slate-400">
                            {hit.matchCount} hit{hit.matchCount === 1 ? '' : 's'}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                          {hit.chapterTitle}
                        </p>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
                          {hit.snippet}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* BOOKMARKS */}
        {activeTab === 'bookmarks' && (
          <div className="space-y-3">
            <p className="px-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
              Saved Bookmarks ({bookmarks.length})
            </p>
            {bookmarks.length === 0 ? (
              <p className="rounded-md border border-dashed border-[var(--color-hairline)] p-3 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:text-slate-400">
                No bookmarks yet. Click the Bookmark button in the reader toolbar to save your spot in any
                chapter or section.
              </p>
            ) : (
              <ul className="space-y-2">
                {bookmarks.map((bm) => (
                  <li
                    key={bm.id}
                    className="flex items-start justify-between gap-2 rounded-md border border-[var(--color-hairline)] bg-white p-2.5 text-xs dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectChapter(bm.chapterNumber, bm.sectionId);
                        onCloseMobile?.();
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="font-mono text-[10px] font-semibold text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                        Ch. {bm.chapterNumber}
                        {bm.sectionLabel ? ` · ${bm.sectionLabel}` : ''}
                      </p>
                      <p className="mt-0.5 truncate font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                        {bm.chapterTitle}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveBookmark(bm.id)}
                      aria-label="Remove bookmark"
                      className="shrink-0 text-[var(--color-ink-muted)] hover:text-red-600 dark:text-slate-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
