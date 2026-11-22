import { AlertCircle, BookOpen, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DashboardView } from './components/DashboardView';
import { DialogueStudioView } from './components/DialogueStudioView';
import { InteractiveReaderView } from './components/InteractiveReaderView';
import { LearningPathView } from './components/LearningPathView';
import { LessonStudioView } from './components/LessonStudioView';
import {
  PracticeStudioView,
  type PracticeStudioTab,
} from './components/PracticeStudioView';
import { SourceAuditView } from './components/SourceAuditView';
import { TopNav } from './components/TopNav';
import {
  VocabularyStudioView,
  type VocabStudioTab,
} from './components/VocabularyStudioView';
import { useStudyState } from './hooks/useStudyState';
import { loadDefaultTextbook, parseImportedFileList } from './services/bookParser';
import { extractAllBookExercises } from './services/exerciseExtractor';
import { extractAllBookDialogues } from './services/lessonDialogueExtractor';
import type { NavigationView, ParsedBook } from './types/book';

export default function App() {
  const {
    state: studyState,
    toggleTheme,
    setPreferredGermanVoice,
    recordChapterVisit,
    toggleChapterCompleted,
    toggleDifficultChapter,
    updateReaderPreferences,
    updateChapterProgress,
    addBookmark,
    removeBookmark,
    addHighlight,
    removeHighlight,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    toggleSavedVocab,
    recordVocabReview,
    toggleVocabDifficult,
    recordQuizResult,
    recordExerciseAttempt,
    toggleExerciseNeedsReview,
  } = useStudyState();

  const [book, setBook] = useState<ParsedBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCustomImport, setIsCustomImport] = useState(false);

  const [activeView, setActiveView] = useState<NavigationView>('dashboard');
  const [activeChapterNumber, setActiveChapterNumber] = useState<number>(
    studyState.lastChapterNumber || 1
  );
  const [activeDialogueId, setActiveDialogueId] = useState<string | null>(null);
  const [learningPathUnitFilter, setLearningPathUnitFilter] = useState<string | undefined>(
    undefined
  );
  const [vocabInitialTab, setVocabInitialTab] = useState<VocabStudioTab>('database');
  const [practiceInitialTab, setPracticeInitialTab] = useState<PracticeStudioTab>('workbook');
  const [practiceInitialChapter, setPracticeInitialChapter] = useState<number | undefined>(
    undefined
  );

  const objectUrlsRef = useRef<string[]>([]);

  const cleanupObjectUrls = useCallback(() => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  }, []);

  const loadBundledBook = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    cleanupObjectUrls();
    try {
      const parsed = await loadDefaultTextbook();
      setBook(parsed);
      setIsCustomImport(false);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load textbook source files.');
    } finally {
      setLoading(false);
    }
  }, [cleanupObjectUrls]);

  useEffect(() => {
    void loadBundledBook();
    return () => {
      cleanupObjectUrls();
    };
  }, [loadBundledBook, cleanupObjectUrls]);

  const bookDialogues = useMemo(
    () => (book ? extractAllBookDialogues(book) : []),
    [book]
  );

  const bookExercises = useMemo(
    () => (book ? extractAllBookExercises(book) : []),
    [book]
  );

  const handleImportFiles = useCallback(
    async (files: FileList) => {
      const { book: importedBook, objectUrls } = await parseImportedFileList(files);
      cleanupObjectUrls();
      objectUrlsRef.current = objectUrls;
      setBook(importedBook);
      setIsCustomImport(true);
    },
    [cleanupObjectUrls]
  );

  const handleOpenChapter = useCallback(
    (chapterNumber: number) => {
      const target = book?.chapters.find((c) => c.number === chapterNumber);
      setActiveChapterNumber(chapterNumber);
      setActiveView('reader-preview');
      if (target) {
        recordChapterVisit(target.number, target.displayTitle);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [book, recordChapterVisit]
  );

  const handleOpenLesson = useCallback(
    (chapterNumber: number) => {
      const clamped = Math.min(44, Math.max(1, chapterNumber));
      const target = book?.chapters.find((c) => c.number === clamped);
      setActiveChapterNumber(clamped);
      setActiveView('lessons');
      if (target) {
        recordChapterVisit(target.number, target.displayTitle);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [book, recordChapterVisit]
  );

  const handleOpenDialogue = useCallback((dialogueId?: string) => {
    if (dialogueId) setActiveDialogueId(dialogueId);
    setActiveView('dialogues');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOpenLearningPath = useCallback((unitId?: string) => {
    setLearningPathUnitFilter(unitId);
    setActiveView('learning-path');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOpenVocabularyStudio = useCallback((tab: VocabStudioTab = 'database') => {
    setVocabInitialTab(tab);
    setActiveView('vocabulary');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOpenPractice = useCallback(
    (tab: PracticeStudioTab = 'workbook', chapterNumber?: number) => {
      setPracticeInitialTab(tab);
      setPracticeInitialChapter(chapterNumber);
      setActiveView('practice');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    []
  );

  const handleSelectView = useCallback((view: NavigationView) => {
    if (view !== 'learning-path') {
      setLearningPathUnitFilter(undefined);
    }
    if (view === 'vocabulary') {
      setVocabInitialTab('database');
    }
    if (view === 'practice') {
      setPracticeInitialTab('workbook');
      setPracticeInitialChapter(undefined);
    }
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-paper)] px-6 text-center dark:bg-[var(--color-night)]">
        <BookOpen
          className="h-8 w-8 text-[var(--color-prussian)] dark:text-[#7AB3E6]"
          strokeWidth={1.6}
        />
        <h1 className="mt-4 font-editorial text-2xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
          German Made Simple
        </h1>
        <p className="mt-1.5 text-sm text-[var(--color-ink-muted)] dark:text-slate-400">
          Inspecting source HTML, Table of Contents, glossary, dialogues, and 181 textbook assets…
        </p>
      </div>
    );
  }

  if (loadError || !book) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-paper)] px-6 text-center dark:bg-[var(--color-night)]">
        <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
        <h1 className="mt-3 font-editorial text-2xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
          Could not parse textbook source
        </h1>
        <p className="mt-1.5 max-w-md text-sm text-[var(--color-ink-muted)] dark:text-slate-400">
          {loadError || 'No parsed book data available.'}
        </p>
        <button
          type="button"
          onClick={() => void loadBundledBook()}
          className="mt-5 inline-flex items-center gap-2 rounded-md bg-[var(--color-prussian)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-prussian-hover)]"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Retry loading source</span>
        </button>
      </div>
    );
  }

  const activeChapter =
    book.chapters.find((c) => c.number === activeChapterNumber) || book.chapters[0];

  const activeLessonChapter =
    book.chapters.find((c) => c.number === Math.min(44, activeChapterNumber)) || book.chapters[0];

  const isReaderView = activeView === 'reader-preview';

  return (
    <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)] transition-colors dark:bg-[var(--color-night)] dark:text-[#EDEAE3]">
      <TopNav
        activeView={activeView}
        onSelectView={handleSelectView}
        theme={studyState.theme}
        onToggleTheme={toggleTheme}
        continueChapterNumber={studyState.lastChapterNumber || 1}
        onContinueLearning={() => handleOpenLesson(studyState.lastChapterNumber || 1)}
      />

      {activeView === 'dashboard' && (
        <DashboardView
          book={book}
          studyState={studyState}
          dialogueCount={bookDialogues.length}
          onOpenChapter={handleOpenChapter}
          onOpenLesson={handleOpenLesson}
          onOpenDialogues={() => handleOpenDialogue()}
          onOpenPractice={(tab) => handleOpenPractice(tab)}
          onOpenLearningPath={handleOpenLearningPath}
          onOpenVocabularyStudio={handleOpenVocabularyStudio}
          onOpenSourceAudit={() => handleSelectView('source-audit')}
          onToggleDifficult={toggleDifficultChapter}
        />
      )}

      {activeView === 'learning-path' && (
        <LearningPathView
          key={learningPathUnitFilter || 'all'}
          book={book}
          studyState={studyState}
          initialUnitFilter={learningPathUnitFilter}
          onOpenChapter={handleOpenChapter}
          onOpenLesson={handleOpenLesson}
          onToggleCompleted={toggleChapterCompleted}
          onToggleDifficult={toggleDifficultChapter}
        />
      )}

      {activeView === 'lessons' && activeLessonChapter && (
        <LessonStudioView
          book={book}
          chapter={activeLessonChapter}
          studyState={studyState}
          chapterDialogues={bookDialogues.filter(
            (d) => d.chapterNumber === activeLessonChapter.number
          )}
          onSelectChapter={handleOpenLesson}
          onOpenInReader={handleOpenChapter}
          onOpenDialogue={(dlgId) => handleOpenDialogue(dlgId)}
          onOpenPracticeChapter={(chNum) => handleOpenPractice('workbook', chNum)}
          onToggleCompleted={() =>
            toggleChapterCompleted(activeLessonChapter.number, activeLessonChapter.displayTitle)
          }
          onToggleDifficult={() =>
            toggleDifficultChapter(activeLessonChapter.number, activeLessonChapter.displayTitle)
          }
          onToggleSavedVocab={toggleSavedVocab}
          onAddAnnotation={addAnnotation}
          onDeleteAnnotation={deleteAnnotation}
          onRecordQuizResult={recordQuizResult}
        />
      )}

      {activeView === 'dialogues' && (
        <DialogueStudioView
          book={book}
          dialogues={bookDialogues}
          initialDialogueId={activeDialogueId}
          studyState={studyState}
          onOpenChapter={handleOpenChapter}
          onOpenLesson={handleOpenLesson}
          onToggleSavedVocab={toggleSavedVocab}
          onRecordQuizResult={recordQuizResult}
        />
      )}

      {activeView === 'practice' && (
        <PracticeStudioView
          key={`${practiceInitialTab}-${practiceInitialChapter ?? 'all'}`}
          book={book}
          exercises={bookExercises}
          studyState={studyState}
          initialTab={practiceInitialTab}
          initialChapterFilter={practiceInitialChapter}
          onOpenChapter={handleOpenChapter}
          onOpenLesson={handleOpenLesson}
          onRecordExerciseAttempt={recordExerciseAttempt}
          onToggleExerciseNeedsReview={toggleExerciseNeedsReview}
          onRecordQuizResult={recordQuizResult}
        />
      )}

      {activeView === 'vocabulary' && (
        <VocabularyStudioView
          book={book}
          studyState={studyState}
          initialTab={vocabInitialTab}
          onOpenChapter={handleOpenChapter}
          onToggleSavedVocab={toggleSavedVocab}
          onRecordVocabReview={recordVocabReview}
          onToggleVocabDifficult={toggleVocabDifficult}
          onRecordQuizResult={recordQuizResult}
          onSelectVoiceURI={setPreferredGermanVoice}
        />
      )}

      {activeView === 'source-audit' && (
        <SourceAuditView
          book={book}
          isCustomImport={isCustomImport}
          onImportFiles={handleImportFiles}
          onResetToBundled={() => void loadBundledBook()}
          onOpenChapter={handleOpenChapter}
        />
      )}

      {isReaderView && activeChapter && (
        <InteractiveReaderView
          book={book}
          chapter={activeChapter}
          studyState={studyState}
          onSelectChapter={handleOpenChapter}
          onToggleTheme={toggleTheme}
          onToggleCompleted={() =>
            toggleChapterCompleted(activeChapter.number, activeChapter.displayTitle)
          }
          onToggleDifficult={() =>
            toggleDifficultChapter(activeChapter.number, activeChapter.displayTitle)
          }
          onUpdatePreferences={updateReaderPreferences}
          onUpdateProgress={updateChapterProgress}
          onAddBookmark={addBookmark}
          onRemoveBookmark={removeBookmark}
          onAddHighlight={addHighlight}
          onRemoveHighlight={removeHighlight}
          onAddAnnotation={addAnnotation}
          onUpdateAnnotation={updateAnnotation}
          onDeleteAnnotation={deleteAnnotation}
          onToggleSavedVocab={toggleSavedVocab}
          onOpenAudioSettings={() => handleOpenVocabularyStudio('audio')}
        />
      )}

      {!isReaderView && (
        <footer className="mt-16 border-t border-[var(--color-hairline)] py-6 dark:border-[var(--color-night-hairline)]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 font-mono text-[11px] text-[var(--color-ink-muted)] sm:px-6 lg:px-8 dark:text-slate-500">
            <span>
              Source: {book.metadata.title} ({book.metadata.copyright})
            </span>
            <span>
              Stages 1–8 implemented · Next: Stage 9 Notebook &amp; Progress
            </span>
          </div>
        </footer>
      )}
    </div>
  );
}
