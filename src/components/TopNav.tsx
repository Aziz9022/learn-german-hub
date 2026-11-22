import {
  BookOpen,
  ClipboardCheck,
  Compass,
  FileSearch,
  GraduationCap,
  Languages,
  LayoutDashboard,
  MessageCircle,
  Moon,
  Play,
  Sun,
} from 'lucide-react';
import type { NavigationView } from '../types/book';

interface TopNavProps {
  activeView: NavigationView;
  onSelectView: (view: NavigationView) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  continueChapterNumber: number;
  onContinueLearning: () => void;
}

const PRIMARY_NAV_ITEMS: { id: NavigationView; label: string; shortLabel: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard },
  { id: 'learning-path', label: 'Path', shortLabel: 'Path', icon: Compass },
  { id: 'lessons', label: 'Lessons', shortLabel: 'Lessons', icon: GraduationCap },
  { id: 'dialogues', label: 'Dialogues', shortLabel: 'Dialogues', icon: MessageCircle },
  { id: 'practice', label: 'Practice', shortLabel: 'Practice', icon: ClipboardCheck },
  { id: 'reader-preview', label: 'Textbook', shortLabel: 'Book', icon: BookOpen },
  { id: 'vocabulary', label: 'Vocab', shortLabel: 'Vocab', icon: Languages },
];

export function TopNav({
  activeView,
  onSelectView,
  theme,
  onToggleTheme,
  continueChapterNumber,
  onContinueLearning,
}: TopNavProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-hairline)] bg-[var(--color-paper)]/95 backdrop-blur-sm dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]/95">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Left: Editorial Wordmark */}
        <button
          type="button"
          onClick={() => onSelectView('dashboard')}
          className="flex shrink-0 items-baseline gap-2.5 text-left focus:outline-none"
        >
          <span className="font-editorial text-lg font-semibold tracking-tight text-[var(--color-ink)] dark:text-[#EDEAE3]">
            German Made Simple
          </span>
        </button>

        {/* Center: Primary Single-Row Navigation */}
        <nav aria-label="Main navigation" className="hidden items-center gap-0.5 lg:flex">
          {PRIMARY_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                className={`inline-flex items-center gap-1.5 border-b-2 px-2.5 py-5 text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-[var(--color-prussian)] text-[var(--color-prussian)] dark:border-[#7AB3E6] dark:text-[#7AB3E6]'
                    : 'border-transparent text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:text-slate-400 dark:hover:text-[#EDEAE3]'
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: Source Audit Icon + Theme Switcher + Continue CTA */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectView('source-audit')}
            title="Source Audit & Book Import"
            aria-label="Source Audit and Book Import"
            className={`inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
              activeView === 'source-audit'
                ? 'border-[var(--color-prussian)] bg-[var(--color-prussian)]/10 text-[var(--color-prussian)] dark:border-[#5B9BD5] dark:text-[#7AB3E6]'
                : 'border-[var(--color-hairline)] bg-white text-[var(--color-ink-muted)] hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            <FileSearch className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light reading theme' : 'Switch to dark reading theme'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-hairline)] bg-white text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-slate-300 dark:hover:text-white"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={onContinueLearning}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-prussian)] px-3 py-2 text-xs font-medium whitespace-nowrap text-white transition-colors hover:bg-[var(--color-prussian-hover)] sm:text-sm dark:bg-[#2B649B] dark:hover:bg-[#3474B3]"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span className="hidden sm:inline">Continue · Ch. {continueChapterNumber}</span>
            <span className="sm:hidden">Ch. {continueChapterNumber}</span>
          </button>
        </div>
      </div>

      {/* Tablet & Mobile Navigation Bar */}
      <nav
        aria-label="Mobile navigation"
        className="flex border-t border-[var(--color-hairline)] lg:hidden dark:border-[var(--color-night-hairline)]"
      >
        {PRIMARY_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors ${
                isActive
                  ? 'text-[var(--color-prussian)] dark:text-[#7AB3E6]'
                  : 'text-[var(--color-ink-muted)] dark:text-slate-400'
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
}
