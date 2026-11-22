import { useCallback, useEffect, useState } from 'react';
import { setPreferredGermanVoiceURI } from '../services/germanAudio';
import type {
  ExerciseAttemptRecord,
  HighlightColor,
  QuizResultRecord,
  ReaderAnnotation,
  ReaderBookmark,
  ReaderHighlight,
  ReaderPreferences,
  SavedVocabItem,
  UserStudyState,
  VocabMasteryLevel,
  VocabProgressRecord,
} from '../types/book';

const STORAGE_KEY = 'gms_study_state_v1';

const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  fontSize: 16,
  lineSpacing: 'comfortable',
  showHighlights: true,
};

const DEFAULT_STUDY_STATE: UserStudyState = {
  lastChapterNumber: 1,
  completedChapters: [],
  inProgressChapters: [],
  difficultChapters: [],
  savedVocab: [],
  vocabProgress: {},
  exerciseProgress: {},
  preferredGermanVoiceURI: null,
  quizResults: [],
  studyHistory: [],
  chapterProgress: {},
  readerPreferences: DEFAULT_READER_PREFERENCES,
  bookmarks: [],
  highlights: [],
  annotations: [],
  theme: 'light',
};

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function loadInitialState(): UserStudyState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STUDY_STATE;
    const parsed = JSON.parse(raw) as Partial<UserStudyState>;
    return {
      ...DEFAULT_STUDY_STATE,
      ...parsed,
      completedChapters: Array.isArray(parsed.completedChapters) ? parsed.completedChapters : [],
      inProgressChapters: Array.isArray(parsed.inProgressChapters) ? parsed.inProgressChapters : [],
      difficultChapters: Array.isArray(parsed.difficultChapters) ? parsed.difficultChapters : [],
      savedVocab: Array.isArray(parsed.savedVocab) ? parsed.savedVocab : [],
      vocabProgress:
        parsed.vocabProgress && typeof parsed.vocabProgress === 'object' ? parsed.vocabProgress : {},
      exerciseProgress:
        parsed.exerciseProgress && typeof parsed.exerciseProgress === 'object'
          ? parsed.exerciseProgress
          : {},
      preferredGermanVoiceURI:
        typeof parsed.preferredGermanVoiceURI === 'string' ? parsed.preferredGermanVoiceURI : null,
      quizResults: Array.isArray(parsed.quizResults) ? parsed.quizResults : [],
      studyHistory: Array.isArray(parsed.studyHistory) ? parsed.studyHistory : [],
      chapterProgress:
        parsed.chapterProgress && typeof parsed.chapterProgress === 'object' ? parsed.chapterProgress : {},
      readerPreferences: {
        ...DEFAULT_READER_PREFERENCES,
        ...(parsed.readerPreferences || {}),
      },
      bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
      annotations: Array.isArray(parsed.annotations) ? parsed.annotations : [],
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
    };
  } catch {
    return DEFAULT_STUDY_STATE;
  }
}

export function useStudyState() {
  const [state, setState] = useState<UserStudyState>(loadInitialState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }, [state]);

  useEffect(() => {
    const root = document.documentElement;
    if (state.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [state.theme]);

  // Sync preferred German voice URI with the German Audio engine
  useEffect(() => {
    setPreferredGermanVoiceURI(state.preferredGermanVoiceURI);
  }, [state.preferredGermanVoiceURI]);

  const toggleTheme = useCallback(() => {
    setState((prev) => ({
      ...prev,
      theme: prev.theme === 'dark' ? 'light' : 'dark',
    }));
  }, []);

  const setPreferredGermanVoice = useCallback((uri: string | null) => {
    setPreferredGermanVoiceURI(uri);
    setState((prev) => ({
      ...prev,
      preferredGermanVoiceURI: uri,
    }));
  }, []);

  const recordChapterVisit = useCallback((chapterNumber: number, chapterTitle: string) => {
    setState((prev) => {
      const isCompleted = prev.completedChapters.includes(chapterNumber);
      const nextInProgress =
        isCompleted || prev.inProgressChapters.includes(chapterNumber)
          ? prev.inProgressChapters
          : [...prev.inProgressChapters, chapterNumber];

      const nextHistory = [
        {
          chapterNumber,
          chapterTitle,
          visitedAt: new Date().toISOString(),
          action: 'opened' as const,
        },
        ...prev.studyHistory.filter(
          (item, idx) => !(idx === 0 && item.chapterNumber === chapterNumber && item.action === 'opened')
        ),
      ].slice(0, 20);

      return {
        ...prev,
        lastChapterNumber: chapterNumber,
        inProgressChapters: nextInProgress,
        studyHistory: nextHistory,
      };
    });
  }, []);

  const toggleChapterCompleted = useCallback((chapterNumber: number, chapterTitle: string) => {
    setState((prev) => {
      const exists = prev.completedChapters.includes(chapterNumber);
      const completedChapters = exists
        ? prev.completedChapters.filter((n) => n !== chapterNumber)
        : [...prev.completedChapters, chapterNumber].sort((a, b) => a - b);

      const inProgressChapters = exists
        ? prev.inProgressChapters
        : prev.inProgressChapters.filter((n) => n !== chapterNumber);

      const studyHistory = exists
        ? prev.studyHistory
        : [
            {
              chapterNumber,
              chapterTitle,
              visitedAt: new Date().toISOString(),
              action: 'completed' as const,
            },
            ...prev.studyHistory,
          ].slice(0, 20);

      return {
        ...prev,
        completedChapters,
        inProgressChapters,
        studyHistory,
      };
    });
  }, []);

  const toggleDifficultChapter = useCallback((chapterNumber: number, chapterTitle: string) => {
    setState((prev) => {
      const exists = prev.difficultChapters.includes(chapterNumber);
      const difficultChapters = exists
        ? prev.difficultChapters.filter((n) => n !== chapterNumber)
        : [...prev.difficultChapters, chapterNumber].sort((a, b) => a - b);

      const studyHistory = exists
        ? prev.studyHistory
        : [
            {
              chapterNumber,
              chapterTitle,
              visitedAt: new Date().toISOString(),
              action: 'flagged-difficult' as const,
            },
            ...prev.studyHistory,
          ].slice(0, 20);

      return {
        ...prev,
        difficultChapters,
        studyHistory,
      };
    });
  }, []);

  const updateReaderPreferences = useCallback((patch: Partial<ReaderPreferences>) => {
    setState((prev) => ({
      ...prev,
      readerPreferences: {
        ...prev.readerPreferences,
        ...patch,
      },
    }));
  }, []);

  const updateChapterProgress = useCallback((chapterNumber: number, percent: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    setState((prev) => {
      const current = prev.chapterProgress[chapterNumber] || 0;
      if (clamped <= current) return prev;
      return {
        ...prev,
        chapterProgress: {
          ...prev.chapterProgress,
          [chapterNumber]: clamped,
        },
      };
    });
  }, []);

  const addBookmark = useCallback(
    (payload: {
      chapterNumber: number;
      chapterTitle: string;
      sectionId?: string;
      sectionLabel?: string;
      note?: string;
    }) => {
      setState((prev) => {
        const duplicate = prev.bookmarks.find(
          (b) =>
            b.chapterNumber === payload.chapterNumber &&
            (b.sectionId || '') === (payload.sectionId || '')
        );
        if (duplicate) return prev;
        const next: ReaderBookmark = {
          id: makeId('bm'),
          chapterNumber: payload.chapterNumber,
          chapterTitle: payload.chapterTitle,
          sectionId: payload.sectionId,
          sectionLabel: payload.sectionLabel,
          note: payload.note,
          createdAt: new Date().toISOString(),
        };
        return {
          ...prev,
          bookmarks: [next, ...prev.bookmarks],
        };
      });
    },
    []
  );

  const removeBookmark = useCallback((bookmarkId: string) => {
    setState((prev) => ({
      ...prev,
      bookmarks: prev.bookmarks.filter((b) => b.id !== bookmarkId),
    }));
  }, []);

  const addHighlight = useCallback((chapterNumber: number, text: string, color: HighlightColor) => {
    const trimmed = text.replace(/\s+/g, ' ').trim();
    if (trimmed.length < 2) return;
    setState((prev) => {
      const exists = prev.highlights.find(
        (h) => h.chapterNumber === chapterNumber && h.text === trimmed
      );
      if (exists) {
        return {
          ...prev,
          highlights: prev.highlights.map((h) => (h.id === exists.id ? { ...h, color } : h)),
        };
      }
      const next: ReaderHighlight = {
        id: makeId('hl'),
        chapterNumber,
        text: trimmed,
        color,
        createdAt: new Date().toISOString(),
      };
      return {
        ...prev,
        highlights: [next, ...prev.highlights],
      };
    });
  }, []);

  const removeHighlight = useCallback((highlightId: string) => {
    setState((prev) => ({
      ...prev,
      highlights: prev.highlights.filter((h) => h.id !== highlightId),
    }));
  }, []);

  const addAnnotation = useCallback((chapterNumber: number, selectedText: string, note: string) => {
    const cleanNote = note.trim();
    if (!cleanNote) return;
    const now = new Date().toISOString();
    const next: ReaderAnnotation = {
      id: makeId('note'),
      chapterNumber,
      selectedText: selectedText.replace(/\s+/g, ' ').trim(),
      note: cleanNote,
      createdAt: now,
      updatedAt: now,
    };
    setState((prev) => ({
      ...prev,
      annotations: [next, ...prev.annotations],
    }));
  }, []);

  const updateAnnotation = useCallback((annotationId: string, note: string) => {
    const cleanNote = note.trim();
    if (!cleanNote) return;
    setState((prev) => ({
      ...prev,
      annotations: prev.annotations.map((a) =>
        a.id === annotationId ? { ...a, note: cleanNote, updatedAt: new Date().toISOString() } : a
      ),
    }));
  }, []);

  const deleteAnnotation = useCallback((annotationId: string) => {
    setState((prev) => ({
      ...prev,
      annotations: prev.annotations.filter((a) => a.id !== annotationId),
    }));
  }, []);

  const toggleSavedVocab = useCallback(
    (item: Omit<SavedVocabItem, 'id' | 'savedAt'>) => {
      setState((prev) => {
        const existing = prev.savedVocab.find(
          (v) => v.german.toLowerCase() === item.german.toLowerCase()
        );
        if (existing) {
          return {
            ...prev,
            savedVocab: prev.savedVocab.filter((v) => v.id !== existing.id),
          };
        }
        const next: SavedVocabItem = {
          ...item,
          id: makeId('voc'),
          savedAt: new Date().toISOString(),
        };
        return {
          ...prev,
          savedVocab: [next, ...prev.savedVocab],
        };
      });
    },
    []
  );

  const recordVocabReview = useCallback(
    (wordKey: string, outcome: 'difficult' | 'good' | 'mastered') => {
      const key = wordKey.toLowerCase().trim();
      if (!key) return;
      const now = Date.now();
      const intervalHours = outcome === 'difficult' ? 4 : outcome === 'good' ? 48 : 168;
      const nextReviewAt = new Date(now + intervalHours * 3600 * 1000).toISOString();

      setState((prev) => {
        const existing = prev.vocabProgress[key];
        const mastery: VocabMasteryLevel =
          outcome === 'mastered' ? 'mastered' : outcome === 'good' ? 'learning' : 'learning';
        const updated: VocabProgressRecord = {
          mastery,
          difficult: outcome === 'difficult',
          reviewCount: (existing?.reviewCount || 0) + 1,
          correctCount: (existing?.correctCount || 0) + (outcome === 'difficult' ? 0 : 1),
          lastReviewedAt: new Date(now).toISOString(),
          nextReviewAt,
        };
        return {
          ...prev,
          vocabProgress: {
            ...prev.vocabProgress,
            [key]: updated,
          },
        };
      });
    },
    []
  );

  const toggleVocabDifficult = useCallback((wordKey: string) => {
    const key = wordKey.toLowerCase().trim();
    if (!key) return;
    const nowIso = new Date().toISOString();
    setState((prev) => {
      const existing = prev.vocabProgress[key];
      const nextDifficult = !existing?.difficult;
      const updated: VocabProgressRecord = {
        mastery: existing?.mastery || 'learning',
        difficult: nextDifficult,
        reviewCount: existing?.reviewCount || 0,
        correctCount: existing?.correctCount || 0,
        lastReviewedAt: existing?.lastReviewedAt || nowIso,
        nextReviewAt: nextDifficult ? nowIso : existing?.nextReviewAt || nowIso,
      };
      return {
        ...prev,
        vocabProgress: {
          ...prev.vocabProgress,
          [key]: updated,
        },
      };
    });
  }, []);

  const recordQuizResult = useCallback(
    (result: Omit<QuizResultRecord, 'id' | 'completedAt'>) => {
      const record: QuizResultRecord = {
        ...result,
        id: makeId('quiz'),
        completedAt: new Date().toISOString(),
      };
      setState((prev) => ({
        ...prev,
        quizResults: [record, ...prev.quizResults].slice(0, 30),
      }));
    },
    []
  );

  const recordExerciseAttempt = useCallback(
    (payload: {
      exerciseNumber: number;
      chapterNumber: number;
      score: number;
      total: number;
      completed?: boolean;
      savedResponses?: Record<string, string>;
    }) => {
      const nowIso = new Date().toISOString();
      setState((prev) => {
        const existing = prev.exerciseProgress[payload.exerciseNumber];
        const bestScore = Math.max(existing?.bestScore || 0, payload.score);
        const total = Math.max(payload.total, existing?.total || 0);
        const pct = total > 0 ? payload.score / total : 1;
        const completed =
          payload.completed !== undefined
            ? payload.completed
            : existing?.completed || (total > 0 ? pct >= 0.6 : true);
        const needsReview = total > 0 ? pct < 0.8 : existing?.needsReview || false;

        const updated: ExerciseAttemptRecord = {
          exerciseNumber: payload.exerciseNumber,
          chapterNumber: payload.chapterNumber,
          bestScore,
          total,
          attempts: (existing?.attempts || 0) + 1,
          completed,
          needsReview,
          lastAttemptedAt: nowIso,
          savedResponses: payload.savedResponses ?? existing?.savedResponses,
        };

        return {
          ...prev,
          exerciseProgress: {
            ...prev.exerciseProgress,
            [payload.exerciseNumber]: updated,
          },
        };
      });
    },
    []
  );

  const toggleExerciseNeedsReview = useCallback(
    (exerciseNumber: number, chapterNumber: number) => {
      const nowIso = new Date().toISOString();
      setState((prev) => {
        const existing = prev.exerciseProgress[exerciseNumber];
        const updated: ExerciseAttemptRecord = {
          exerciseNumber,
          chapterNumber,
          bestScore: existing?.bestScore || 0,
          total: existing?.total || 0,
          attempts: existing?.attempts || 0,
          completed: existing?.completed || false,
          needsReview: !existing?.needsReview,
          lastAttemptedAt: existing?.lastAttemptedAt || nowIso,
          savedResponses: existing?.savedResponses,
        };
        return {
          ...prev,
          exerciseProgress: {
            ...prev.exerciseProgress,
            [exerciseNumber]: updated,
          },
        };
      });
    },
    []
  );

  return {
    state,
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
  };
}
