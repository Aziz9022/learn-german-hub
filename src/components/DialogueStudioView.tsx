import {
  BookmarkCheck,
  BookmarkPlus,
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  HelpCircle,
  MessageCircle,
  Play,
  RotateCcw,
  Square,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  playGermanAudio,
  playGermanSequence,
  stopGermanAudio,
  type StudioVoiceName,
} from '../services/germanAudio';
import {
  analyzeGermanWord,
  normalizeGermanLookup,
  stripStressAccents,
  type WordAnalysisResult,
} from '../services/germanLinguistics';
import {
  extractDialogueKeyVocabulary,
  type BookDialogue,
  type DialogueSpeaker,
} from '../services/lessonDialogueExtractor';
import type { ParsedBook, SavedVocabItem, UserStudyState } from '../types/book';

type DialogueStudioTab = 'reader' | 'roleplay' | 'reconstruct' | 'comprehension' | 'vocabulary';

interface DialogueStudioViewProps {
  book: ParsedBook;
  dialogues: BookDialogue[];
  initialDialogueId?: string | null;
  studyState: UserStudyState;
  onOpenChapter: (chapterNumber: number) => void;
  onOpenLesson: (chapterNumber: number) => void;
  onToggleSavedVocab: (item: Omit<SavedVocabItem, 'id' | 'savedAt'>) => void;
  onRecordQuizResult: (result: {
    chapterNumber: number;
    title: string;
    score: number;
    total: number;
  }) => void;
}

const GERMAN_SPECIAL_CHARS = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'];

function speakerBadgeClasses(style: DialogueSpeaker['badgeStyle']): string {
  if (style === 'prussian') {
    return 'border-[#1E4D7B]/40 bg-[#1E4D7B]/10 text-[#1E4D7B] dark:border-[#5B9BD5]/40 dark:bg-[#5B9BD5]/15 dark:text-[#7AB3E6]';
  }
  if (style === 'sage') {
    return 'border-[#2E6B4E]/40 bg-[#2E6B4E]/10 text-[#2E6B4E] dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-300';
  }
  return 'border-[var(--color-ochre)]/40 bg-amber-50 text-[var(--color-ochre)] dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300';
}

function deterministicShuffle<T>(arr: T[], seed: number): T[] {
  const copy = [...arr];
  let s = seed || 1;
  for (let i = copy.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = s % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[„"‚'.,!?;:—–-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function DialogueStudioView({
  book,
  dialogues,
  initialDialogueId,
  studyState,
  onOpenChapter,
  onOpenLesson,
  onToggleSavedVocab,
  onRecordQuizResult,
}: DialogueStudioViewProps) {
  const [selectedId, setSelectedId] = useState<string>(
    initialDialogueId || dialogues[0]?.id || ''
  );
  const [activeTab, setActiveTab] = useState<DialogueStudioTab>('reader');
  const [showEnglish, setShowEnglish] = useState(true);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [isSequencePlaying, setIsSequencePlaying] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [inspectedWord, setInspectedWord] = useState<WordAnalysisResult | null>(null);

  // Role-play state (Hide One Speaker)
  const [hiddenSpeakerId, setHiddenSpeakerId] = useState<string>('');
  const [roleInputs, setRoleInputs] = useState<Record<string, string>>({});
  const [revealedTurns, setRevealedTurns] = useState<Record<string, boolean>>({});
  const [hintTurns, setHintTurns] = useState<Record<string, boolean>>({});

  // Sentence Reconstruction state
  const [reconstructIdx, setReconstructIdx] = useState(0);
  const [chosenTiles, setChosenTiles] = useState<number[]>([]);
  const [reconstructStatus, setReconstructStatus] = useState<'idle' | 'correct' | 'wrong'>('idle');

  // Comprehension Check state
  const [compAnswers, setCompAnswers] = useState<Record<string, number>>({});
  const [compSubmitted, setCompSubmitted] = useState(false);

  useEffect(() => {
    if (initialDialogueId && dialogues.some((d) => d.id === initialDialogueId)) {
      setSelectedId(initialDialogueId);
    }
  }, [initialDialogueId, dialogues]);

  const activeDialogue = useMemo(
    () => dialogues.find((d) => d.id === selectedId) || dialogues[0] || null,
    [dialogues, selectedId]
  );

  // Reset per-dialogue states when switching dialogues
  useEffect(() => {
    stopGermanAudio();
    setActiveTurnId(null);
    setIsSequencePlaying(false);
    setAudioError(null);
    setInspectedWord(null);
    setHiddenSpeakerId(activeDialogue?.speakers[1]?.id || activeDialogue?.speakers[0]?.id || '');
    setRoleInputs({});
    setRevealedTurns({});
    setHintTurns({});
    setReconstructIdx(0);
    setChosenTiles([]);
    setReconstructStatus('idle');
    setCompAnswers({});
    setCompSubmitted(false);
  }, [activeDialogue?.id]);

  useEffect(() => {
    return () => stopGermanAudio();
  }, []);

  const savedNormalizedSet = useMemo(
    () => new Set(studyState.savedVocab.map((v) => normalizeGermanLookup(v.german))),
    [studyState.savedVocab]
  );

  const explicitDialogues = useMemo(
    () => dialogues.filter((d) => d.kind === 'explicit-dialogue'),
    [dialogues]
  );
  const chapterConversations = useMemo(
    () => dialogues.filter((d) => d.kind === 'chapter-conversation'),
    [dialogues]
  );

  const speakerVoiceMap = useMemo(() => {
    const map = new Map<string, StudioVoiceName>();
    if (activeDialogue) {
      for (const sp of activeDialogue.speakers) {
        map.set(sp.id, sp.studioVoice);
      }
    }
    return map;
  }, [activeDialogue]);

  const dialogueVocab = useMemo(
    () => (activeDialogue ? extractDialogueKeyVocabulary(activeDialogue, book) : []),
    [activeDialogue, book]
  );

  const spokenTurns = useMemo(
    () => (activeDialogue ? activeDialogue.turns.filter((t) => !t.isNarration) : []),
    [activeDialogue]
  );

  // Reconstruction items from authentic turns (4..12 words from first sentence of turn)
  const reconstructPool = useMemo(() => {
    return spokenTurns
      .map((t) => {
        const sentence = t.german.split(/(?<=[.!?])\s+/)[0]?.trim() || t.german;
        const eng = t.english.split(/(?<=[.!?])\s+/)[0]?.trim() || t.english;
        const words = sentence.split(/\s+/).filter(Boolean);
        return { turnId: t.id, speakerName: t.speakerName, speakerId: t.speakerId, sentence, eng, words };
      })
      .filter((item) => item.words.length >= 4 && item.words.length <= 12);
  }, [spokenTurns]);

  const activeReconstruct =
    reconstructPool[reconstructIdx % Math.max(1, reconstructPool.length)] || null;

  const scrambledReconstructTiles = useMemo(() => {
    if (!activeReconstruct || !activeDialogue) return [];
    const indexed = activeReconstruct.words.map((word, origIdx) => ({ word, origIdx }));
    const shuffled = deterministicShuffle(
      indexed,
      activeDialogue.chapterNumber * 41 + reconstructIdx * 13 + 7
    );
    if (shuffled.every((x, i) => x.origIdx === i) && shuffled.length > 1) {
      [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
    }
    return shuffled;
  }, [activeDialogue, activeReconstruct, reconstructIdx]);

  // Authentic comprehension questions derived directly from the dialogue's actual turns
  const comprehensionQuestions = useMemo(() => {
    if (!activeDialogue || spokenTurns.length < 4) return [];
    const qs: {
      id: string;
      prompt: string;
      germanQuote: string;
      options: string[];
      correctIndex: number;
      explanation: string;
    }[] = [];

    // Q1 & Q2: Translate spoken turns in context
    for (let i = 0; i < Math.min(2, spokenTurns.length); i++) {
      const target = spokenTurns[i * 2] || spokenTurns[i];
      const targetEn = target.english.split(/(?<=[.!?])\s+/)[0] || target.english;
      const distractors = Array.from(
        new Set(
          spokenTurns
            .filter((t) => t.id !== target.id)
            .map((t) => t.english.split(/(?<=[.!?])\s+/)[0] || t.english)
            .filter((e) => e !== targetEn)
        )
      ).slice(0, 3);
      if (distractors.length < 3) continue;
      const opts = deterministicShuffle([targetEn, ...distractors], activeDialogue.chapterNumber * 19 + i);
      qs.push({
        id: `comp-en-${i}`,
        prompt: `What is ${target.speakerName} saying here?`,
        germanQuote: target.german.split(/(?<=[.!?])\s+/)[0] || target.german,
        options: opts,
        correctIndex: opts.indexOf(targetEn),
        explanation: `Official textbook translation: "${targetEn}"`,
      });
    }

    // Q3 & Q4: Pick the authentic German reply to the partner's turn
    for (let i = 0; i < spokenTurns.length - 1 && qs.length < 4; i += 2) {
      const promptTurn = spokenTurns[i];
      const replyTurn = spokenTurns[i + 1];
      if (!replyTurn || replyTurn.speakerId === promptTurn.speakerId) continue;
      const correctReply = replyTurn.german.split(/(?<=[.!?])\s+/)[0] || replyTurn.german;
      const otherGerman = Array.from(
        new Set(
          spokenTurns
            .filter((t) => t.id !== replyTurn.id && t.id !== promptTurn.id)
            .map((t) => t.german.split(/(?<=[.!?])\s+/)[0] || t.german)
            .filter((g) => g !== correctReply)
        )
      ).slice(0, 3);
      if (otherGerman.length < 3) continue;
      const opts = deterministicShuffle(
        [correctReply, ...otherGerman],
        activeDialogue.chapterNumber * 37 + i
      );
      qs.push({
        id: `comp-reply-${i}`,
        prompt: `${promptTurn.speakerName} says the line below. How does ${replyTurn.speakerName} reply in the dialogue?`,
        germanQuote: `${promptTurn.german.split(/(?<=[.!?])\s+/)[0] || promptTurn.german}`,
        options: opts,
        correctIndex: opts.indexOf(correctReply),
        explanation: `${replyTurn.speakerName} replies: "${correctReply}" (${replyTurn.english.split(/(?<=[.!?])\s+/)[0] || replyTurn.english})`,
      });
    }

    return qs;
  }, [activeDialogue, spokenTurns]);

  const compScore = useMemo(
    () =>
      comprehensionQuestions.reduce(
        (sum, q) => sum + (compAnswers[q.id] === q.correctIndex ? 1 : 0),
        0
      ),
    [compAnswers, comprehensionQuestions]
  );

  const handlePlayTurn = (turnId: string, text: string, speakerId: string, rate: 1 | 0.65) => {
    setAudioError(null);
    setIsSequencePlaying(false);
    const key = `${turnId}-${rate}`;
    if (activeTurnId === key) {
      stopGermanAudio();
      setActiveTurnId(null);
      return;
    }
    void playGermanAudio(
      text,
      rate,
      {
        onStart: () => setActiveTurnId(key),
        onEnd: () => setActiveTurnId(null),
        onError: (msg) => setAudioError(msg),
        onNoGermanVoiceWarning: (msg) => setAudioError(msg),
      },
      { studioVoiceOverride: speakerVoiceMap.get(speakerId) }
    );
  };

  const handlePlayFullDialogue = (rate: 1 | 0.65) => {
    if (!activeDialogue) return;
    setAudioError(null);
    if (isSequencePlaying) {
      stopGermanAudio();
      setIsSequencePlaying(false);
      setActiveTurnId(null);
      return;
    }
    setIsSequencePlaying(true);
    const lines = activeDialogue.turns
      .filter((t) => !t.isNarration)
      .map((t) => ({
        id: t.id,
        text: t.german,
        studioVoice: speakerVoiceMap.get(t.speakerId),
      }));

    void playGermanSequence(lines, rate, {
      onLineStart: (lineId) => setActiveTurnId(`${lineId}-seq`),
      onComplete: () => {
        setIsSequencePlaying(false);
        setActiveTurnId(null);
      },
      onError: (msg) => {
        setAudioError(msg);
        setIsSequencePlaying(false);
      },
    });
  };

  const handleInspectWord = (rawToken: string) => {
    if (!activeDialogue) return;
    const cleaned = rawToken.replace(/^[„"‚'—–(\[]+|[""'.,!?;:)\]]+$/g, '').trim();
    if (!cleaned || cleaned.length < 2 || /^\d+$/.test(cleaned)) return;
    const ch = book.chapters.find((c) => c.number === activeDialogue.chapterNumber);
    setInspectedWord(analyzeGermanWord(cleaned, book, ch));
  };

  const handleSubmitComprehension = () => {
    if (!activeDialogue) return;
    setCompSubmitted(true);
    onRecordQuizResult({
      chapterNumber: activeDialogue.chapterNumber,
      title: `Dialogue Check (Ch. ${activeDialogue.chapterNumber}): ${activeDialogue.englishTitle}`,
      score: compScore,
      total: comprehensionQuestions.length,
    });
  };

  if (!activeDialogue) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-12 text-center sm:px-6 lg:px-8">
        <p className="text-sm text-[var(--color-ink-muted)]">
          No dialogues were detected in the currently loaded HTML source.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Studio Header */}
      <header className="border-b border-[var(--color-hairline)] pb-6 dark:border-[var(--color-night-hairline)]">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
          Stage 7 · Authentic Textbook Conversations &amp; Dual-Speaker Native German Audio
        </p>
        <h1 className="mt-1.5 font-editorial text-3xl font-semibold tracking-tight text-[var(--color-ink)] dark:text-[#EDEAE3]">
          Dialogue &amp; Conversation Studio
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-ink-muted)] dark:text-slate-400">
          Every dialogue below is extracted directly from <em>German Made Simple</em> ({explicitDialogues.length}{' '}
          standalone textbook dialogues + {chapterConversations.length} spoken chapter conversations)—zero
          invented scripts. Listen with distinct speaker voices, practise role-play by hiding one speaker, or
          reconstruct authentic German sentences.
        </p>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Catalog Rail (4 cols) */}
        <aside className="space-y-5 lg:col-span-4">
          <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
              Standalone Textbook Dialogues ({explicitDialogues.length})
            </p>
            <ul className="mt-2.5 space-y-1.5">
              {explicitDialogues.map((dlg) => {
                const isActive = dlg.id === activeDialogue.id;
                return (
                  <li key={dlg.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(dlg.id)}
                      className={`w-full rounded-md border px-3 py-2.5 text-left transition-colors ${
                        isActive
                          ? 'border-[var(--color-prussian)] bg-[var(--color-prussian)]/8 dark:border-[#5B9BD5] dark:bg-[#5B9BD5]/15'
                          : 'border-transparent hover:border-[var(--color-hairline)] hover:bg-[var(--color-paper)] dark:hover:border-[var(--color-night-hairline)] dark:hover:bg-[var(--color-night)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-[var(--color-ink-muted)] dark:text-slate-400">
                        <span>Chapter {dlg.chapterNumber}</span>
                        <span>{dlg.turns.filter((t) => !t.isNarration).length} turns</span>
                      </div>
                      <p className="mt-0.5 font-editorial text-sm font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                        {dlg.germanTitle}
                      </p>
                      <p className="text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                        {dlg.englishTitle}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>

            <p className="mt-5 border-t border-[var(--color-hairline)] pt-4 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:text-slate-400">
              Spoken Chapter Conversations ({chapterConversations.length})
            </p>
            <ul className="mt-2.5 space-y-1.5">
              {chapterConversations.map((dlg) => {
                const isActive = dlg.id === activeDialogue.id;
                return (
                  <li key={dlg.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(dlg.id)}
                      className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                        isActive
                          ? 'border-[var(--color-prussian)] bg-[var(--color-prussian)]/8 dark:border-[#5B9BD5] dark:bg-[#5B9BD5]/15'
                          : 'border-transparent hover:border-[var(--color-hairline)] hover:bg-[var(--color-paper)] dark:hover:border-[var(--color-night-hairline)] dark:hover:bg-[var(--color-night)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-[var(--color-ink-muted)] dark:text-slate-400">
                        <span>Chapter {dlg.chapterNumber}</span>
                        <span>{dlg.speakers.map((s) => s.name).join(' & ')}</span>
                      </div>
                      <p className="mt-0.5 text-xs font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                        {dlg.germanTitle}
                      </p>
                      <p className="text-[11px] text-[var(--color-ink-muted)] dark:text-slate-400">
                        {dlg.englishTitle}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        {/* Right Active Dialogue Workspace (8 cols) */}
        <section className="space-y-5 lg:col-span-8">
          {/* Active Dialogue Header Card */}
          <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                  <span>Chapter {activeDialogue.chapterNumber}</span>
                  <span>·</span>
                  <span>
                    {activeDialogue.kind === 'explicit-dialogue'
                      ? 'Original Textbook Dialogue'
                      : 'Original Chapter Conversation'}
                  </span>
                </div>
                <h2 className="mt-1 font-editorial text-2xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  {activeDialogue.germanTitle}
                </h2>
                <p className="text-sm text-[var(--color-ink-muted)] dark:text-slate-400">
                  {activeDialogue.englishTitle}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenLesson(activeDialogue.chapterNumber)}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--color-hairline)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
                >
                  <span>Ch. {activeDialogue.chapterNumber} Lesson</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChapter(activeDialogue.chapterNumber)}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--color-hairline)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-300"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>Textbook</span>
                </button>
              </div>
            </div>

            <p className="mt-2.5 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
              {activeDialogue.contextNote}
            </p>

            {/* Speakers Legend */}
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--color-hairline)] pt-3 dark:border-[var(--color-night-hairline)]">
              <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                <Users className="h-3.5 w-3.5" />
                Speakers:
              </span>
              {activeDialogue.speakers.map((sp) => (
                <span
                  key={sp.id}
                  className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${speakerBadgeClasses(
                    sp.badgeStyle
                  )}`}
                >
                  <span>{sp.name}</span>
                  <span className="font-mono text-[10px] opacity-80">({sp.roleHint})</span>
                </span>
              ))}
            </div>

            {/* Mode Switcher Tabs */}
            <div className="mt-4 flex flex-wrap gap-1 border-t border-[var(--color-hairline)] pt-3 dark:border-[var(--color-night-hairline)]">
              {(
                [
                  { id: 'reader', label: 'Side-by-Side Reader' },
                  { id: 'roleplay', label: 'Role-Play (Hide Speaker)' },
                  { id: 'reconstruct', label: 'Sentence Reconstruction' },
                  { id: 'comprehension', label: 'Comprehension Check' },
                  { id: 'vocabulary', label: `Vocabulary (${dialogueVocab.length})` },
                ] as { id: DialogueStudioTab; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-[var(--color-prussian)] text-white dark:bg-[#2B649B]'
                      : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-paper-subtle)] hover:text-[var(--color-ink)] dark:text-slate-400 dark:hover:bg-[var(--color-night-subtle)] dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {audioError && (
            <div className="rounded-md border border-[var(--color-ochre)]/50 bg-amber-50/70 px-4 py-2.5 text-xs text-[var(--color-ochre)] dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300">
              {audioError}
            </div>
          )}

          {/* TAB 1: SIDE-BY-SIDE DIALOGUE READER */}
          {activeTab === 'reader' && (
            <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
              {/* Playback Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-hairline)] pb-4 dark:border-[var(--color-night-hairline)]">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePlayFullDialogue(1)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-prussian)] px-3.5 py-2 text-xs font-medium text-white hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B]"
                  >
                    {isSequencePlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    <span>{isSequencePlaying ? 'Stop Dialogue' : 'Play Full Dialogue (1.0×)'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePlayFullDialogue(0.65)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-hairline)] px-3 py-2 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    <span>Play Slow (0.65×)</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowEnglish((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-300"
                >
                  {showEnglish ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  <span>{showEnglish ? 'Hide English' : 'Show English'}</span>
                </button>
              </div>

              {/* Click-a-word inline vocabulary explainer */}
              {inspectedWord && (
                <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-md border border-[var(--color-prussian)]/40 bg-[var(--color-paper)] p-3.5 dark:border-[#5B9BD5]/40 dark:bg-[var(--color-night)]">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                      {inspectedWord.partOfSpeech} · {inspectedWord.pronunciation}
                    </p>
                    <p className="mt-0.5 font-editorial text-base font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                      {inspectedWord.article ? `${inspectedWord.article} ` : ''}
                      {inspectedWord.lemma}
                      {inspectedWord.plural ? (
                        <span className="ml-2 font-mono text-xs font-normal text-[var(--color-ink-muted)] dark:text-slate-400">
                          ({inspectedWord.plural})
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-[var(--color-ink-muted)] dark:text-slate-300">
                      {inspectedWord.english}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        handlePlayTurn(
                          'dlg-word',
                          inspectedWord.article
                            ? `${inspectedWord.article} ${inspectedWord.lemma}`
                            : inspectedWord.query,
                          activeDialogue.speakers[0].id,
                          1
                        )
                      }
                      className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] bg-white px-2 py-1 text-xs font-medium text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]"
                    >
                      <Volume2 className="h-3 w-3" />
                      <span>Listen</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onToggleSavedVocab({
                          german: inspectedWord.lemma,
                          english: inspectedWord.english,
                          article: inspectedWord.article,
                          plural: inspectedWord.plural,
                          pronunciation: inspectedWord.pronunciation,
                          chapterNumber: activeDialogue.chapterNumber,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded bg-[var(--color-prussian)] px-2.5 py-1 text-xs font-medium text-white dark:bg-[#2B649B]"
                    >
                      {savedNormalizedSet.has(normalizeGermanLookup(inspectedWord.lemma))
                        ? 'Saved'
                        : '+ Save'}
                    </button>
                    <button
                      type="button"
                      aria-label="Close word lookup"
                      onClick={() => setInspectedWord(null)}
                      className="p-1 text-[var(--color-ink-muted)]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}

              <p className="mt-3 text-[11px] text-[var(--color-ink-muted)] dark:text-slate-400">
                Tip: Click any German word inside a turn to view its article, meaning, and pronunciation.
              </p>

              {/* Turn-by-Turn Script */}
              <div className="mt-4 space-y-3">
                {activeDialogue.turns.map((turn) => {
                  const spObj = activeDialogue.speakers.find((s) => s.id === turn.speakerId);
                  const isActive =
                    activeTurnId === `${turn.id}-1` ||
                    activeTurnId === `${turn.id}-0.65` ||
                    activeTurnId === `${turn.id}-seq`;

                  if (turn.isNarration) {
                    return (
                      <div
                        key={turn.id}
                        className="rounded-md border border-dashed border-[var(--color-hairline)] bg-[var(--color-paper-subtle)] p-3.5 text-xs dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-subtle)]"
                      >
                        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                          Scene Context (Textbook Narrative)
                        </p>
                        <p className="mt-1 font-editorial text-sm text-[var(--color-ink)] dark:text-[#EDEAE3]">
                          {turn.german}
                        </p>
                        {showEnglish && (
                          <p className="mt-1 text-xs text-[var(--color-ink-muted)] dark:text-slate-300">
                            {turn.english}
                          </p>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={turn.id}
                      className={`rounded-md border p-4 transition-colors ${
                        isActive
                          ? 'border-[var(--color-prussian)] bg-[var(--color-prussian)]/6 dark:border-[#5B9BD5] dark:bg-[#5B9BD5]/12'
                          : 'border-[var(--color-hairline)] bg-[var(--color-paper)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                            spObj ? speakerBadgeClasses(spObj.badgeStyle) : ''
                          }`}
                        >
                          {turn.speakerName}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handlePlayTurn(turn.id, turn.german, turn.speakerId, 1)}
                            className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] bg-white px-2 py-1 text-[11px] font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]"
                          >
                            {activeTurnId === `${turn.id}-1` ? (
                              <Square className="h-3 w-3" />
                            ) : (
                              <Volume2 className="h-3 w-3" />
                            )}
                            <span>1.0×</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePlayTurn(turn.id, turn.german, turn.speakerId, 0.65)}
                            className="rounded border border-[var(--color-hairline)] bg-white px-2 py-1 text-[11px] text-[var(--color-ink-muted)] hover:border-[var(--color-prussian)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-slate-300"
                          >
                            0.65×
                          </button>
                        </div>
                      </div>

                      <div className="mt-2.5 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <p className="font-editorial text-[16px] leading-relaxed text-[var(--color-ink)] dark:text-[#EDEAE3]">
                          {turn.german.split(/(\s+)/).map((tok, idx) =>
                            /^\s+$/.test(tok) ? (
                              <span key={idx}>{tok}</span>
                            ) : (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => handleInspectWord(tok)}
                                className="rounded-xs text-left hover:bg-[var(--color-prussian)]/15 hover:text-[var(--color-prussian)] dark:hover:bg-[#5B9BD5]/20 dark:hover:text-[#7AB3E6]"
                              >
                                {tok}
                              </button>
                            )
                          )}
                        </p>

                        {showEnglish ? (
                          <p className="border-t border-[var(--color-hairline)] pt-2 text-sm leading-relaxed text-[var(--color-ink-muted)] md:border-t-0 md:border-l md:pt-0 md:pl-4 dark:border-[var(--color-night-hairline)] dark:text-slate-300">
                            {turn.english}
                          </p>
                        ) : (
                          <p className="text-xs italic text-[var(--color-ink-muted)] md:pl-4 dark:text-slate-500">
                            English translation hidden
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: ROLE-BASED PRACTICE (HIDE ONE SPEAKER) */}
          {activeTab === 'roleplay' && (
            <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-hairline)] pb-4 dark:border-[var(--color-night-hairline)]">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                    Active Conversation Rehearsal
                  </p>
                  <h3 className="mt-0.5 font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                    Hide One Speaker &amp; Respond in German
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                    I will play:
                  </span>
                  {activeDialogue.speakers.map((sp) => (
                    <button
                      key={sp.id}
                      type="button"
                      onClick={() => {
                        setHiddenSpeakerId(sp.id);
                        setRevealedTurns({});
                        setHintTurns({});
                      }}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                        hiddenSpeakerId === sp.id
                          ? 'border-[var(--color-prussian)] bg-[var(--color-prussian)] text-white dark:bg-[#2B649B]'
                          : 'border-[var(--color-hairline)] text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]'
                      }`}
                    >
                      {sp.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-4">
                {spokenTurns.map((turn) => {
                  const isUserTurn = turn.speakerId === hiddenSpeakerId;
                  const isRevealed = Boolean(revealedTurns[turn.id]);
                  const showHint = Boolean(hintTurns[turn.id]);
                  const userVal = roleInputs[turn.id] || '';
                  const exactMatch =
                    isRevealed &&
                    normalizeForComparison(userVal) === normalizeForComparison(turn.german);

                  if (!isUserTurn) {
                    return (
                      <div
                        key={turn.id}
                        className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                            Partner · {turn.speakerName}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handlePlayTurn(turn.id, turn.german, turn.speakerId, 1)}
                              className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]"
                            >
                              <Volume2 className="h-3 w-3" />
                              <span>Play Partner</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePlayTurn(turn.id, turn.german, turn.speakerId, 0.65)}
                              className="rounded border border-[var(--color-hairline)] bg-white px-2 py-1 text-[11px] text-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-slate-300"
                            >
                              0.65×
                            </button>
                          </div>
                        </div>
                        <p className="mt-2 font-editorial text-base text-[var(--color-ink)] dark:text-[#EDEAE3]">
                          {turn.german}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                          {turn.english}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={turn.id}
                      className="rounded-md border border-[var(--color-prussian)]/45 bg-white p-4 dark:border-[#5B9BD5]/45 dark:bg-[var(--color-night-surface)]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                          Your Turn · {turn.speakerName}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setHintTurns((prev) => ({ ...prev, [turn.id]: !prev[turn.id] }))}
                            className="inline-flex items-center gap-1 text-[11px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] dark:text-slate-400"
                          >
                            <HelpCircle className="h-3 w-3" />
                            <span>{showHint ? 'Hide Hint' : 'Hint'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setRevealedTurns((prev) => ({ ...prev, [turn.id]: !prev[turn.id] }))
                            }
                            className="text-[11px] font-semibold text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
                          >
                            {isRevealed ? 'Hide Answer' : 'Reveal & Compare'}
                          </button>
                        </div>
                      </div>

                      <p className="mt-2 text-xs font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                        Say in German: <span className="italic">&ldquo;{turn.english}&rdquo;</span>
                      </p>

                      {showHint && !isRevealed && (
                        <p className="mt-1.5 font-mono text-xs text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                          Starts with: &ldquo;{turn.german.split(/\s+/).slice(0, 3).join(' ')}…&rdquo;
                        </p>
                      )}

                      <div className="mt-2.5 space-y-1.5">
                        <input
                          type="text"
                          value={userVal}
                          onChange={(e) =>
                            setRoleInputs((prev) => ({ ...prev, [turn.id]: e.target.value }))
                          }
                          placeholder="Speak aloud or type your German response here…"
                          className="w-full rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
                        />
                        <div className="flex flex-wrap items-center gap-1">
                          {GERMAN_SPECIAL_CHARS.map((ch) => (
                            <button
                              key={ch}
                              type="button"
                              onClick={() =>
                                setRoleInputs((prev) => ({
                                  ...prev,
                                  [turn.id]: (prev[turn.id] || '') + ch,
                                }))
                              }
                              className="rounded border border-[var(--color-hairline)] px-2 py-0.5 font-mono text-xs text-[var(--color-ink-muted)] hover:border-[var(--color-prussian)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-300"
                            >
                              {ch}
                            </button>
                          ))}
                        </div>
                      </div>

                      {isRevealed && (
                        <div className="mt-3 rounded-md border border-[var(--color-sage)]/40 bg-[var(--color-sage)]/8 p-3 dark:border-emerald-500/40 dark:bg-emerald-950/30">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-sage)] dark:text-emerald-400">
                              {exactMatch
                                ? 'Exact match with textbook!'
                                : 'Authentic Textbook German Line'}
                            </p>
                            <button
                              type="button"
                              onClick={() => handlePlayTurn(turn.id, turn.german, turn.speakerId, 1)}
                              className="inline-flex items-center gap-1 rounded border border-[var(--color-sage)]/40 bg-white px-2 py-0.5 text-[11px] font-medium text-[var(--color-ink)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
                            >
                              <Volume2 className="h-3 w-3" />
                              <span>Hear Model Answer</span>
                            </button>
                          </div>
                          <p className="mt-1 font-editorial text-base font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                            {turn.german}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: SENTENCE RECONSTRUCTION */}
          {activeTab === 'reconstruct' && (
            <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                    Dialogue Word-Order Practice
                  </p>
                  <h3 className="mt-0.5 font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                    Reconstruct the Spoken German Line
                  </h3>
                </div>
                {reconstructPool.length > 0 && (
                  <span className="font-mono text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                    Line {(reconstructIdx % reconstructPool.length) + 1} of {reconstructPool.length}
                  </span>
                )}
              </div>

              {activeReconstruct ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-md bg-[var(--color-paper)] p-4 dark:bg-[var(--color-night)]">
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                      {activeReconstruct.speakerName} says (English meaning):
                    </p>
                    <p className="mt-1 text-base font-medium text-[var(--color-ink)] dark:text-[#EDEAE3]">
                      &ldquo;{activeReconstruct.eng}&rdquo;
                    </p>
                  </div>

                  <div className="min-h-[60px] rounded-md border border-dashed border-[var(--color-hairline)] bg-[var(--color-paper)]/60 p-3 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]/60">
                    {chosenTiles.length === 0 ? (
                      <p className="text-xs text-[var(--color-ink-muted)] dark:text-slate-500">
                        Select the German word tiles below in the correct order…
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {chosenTiles.map((tileIdx, pos) => (
                          <button
                            key={`${tileIdx}-${pos}`}
                            type="button"
                            onClick={() => {
                              setChosenTiles((prev) => prev.filter((_, i) => i !== pos));
                              setReconstructStatus('idle');
                            }}
                            className="rounded border border-[var(--color-prussian)] bg-[var(--color-prussian)]/10 px-2.5 py-1 text-xs font-medium text-[var(--color-ink)] dark:border-[#5B9BD5] dark:bg-[#5B9BD5]/20 dark:text-[#EDEAE3]"
                          >
                            {scrambledReconstructTiles[tileIdx]?.word}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {scrambledReconstructTiles.map((tile, idx) => {
                      const used = chosenTiles.includes(idx);
                      return (
                        <button
                          key={`${tile.word}-${idx}`}
                          type="button"
                          disabled={used}
                          onClick={() => {
                            setChosenTiles((prev) => [...prev, idx]);
                            setReconstructStatus('idle');
                          }}
                          className={`rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                            used
                              ? 'border-[var(--color-hairline)] bg-[var(--color-paper-subtle)] text-transparent dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-subtle)]'
                              : 'border-[var(--color-hairline)] bg-white text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]'
                          }`}
                        >
                          {tile.word}
                        </button>
                      );
                    })}
                  </div>

                  {reconstructStatus === 'correct' && (
                    <div className="flex items-center justify-between gap-2 rounded bg-[var(--color-sage)]/12 px-3.5 py-2.5 text-xs font-medium text-[var(--color-sage)] dark:bg-emerald-950/40 dark:text-emerald-300">
                      <span>Correct! &ldquo;{activeReconstruct.sentence}&rdquo;</span>
                      <button
                        type="button"
                        onClick={() =>
                          handlePlayTurn(
                            `rec-play-${activeReconstruct.turnId}`,
                            activeReconstruct.sentence,
                            activeReconstruct.speakerId,
                            1
                          )
                        }
                        className="inline-flex items-center gap-1 underline"
                      >
                        <Volume2 className="h-3.5 w-3.5" /> Replay
                      </button>
                    </div>
                  )}

                  {reconstructStatus === 'wrong' && (
                    <p className="rounded bg-amber-50 px-3.5 py-2 text-xs text-[var(--color-ochre)] dark:bg-amber-950/30 dark:text-amber-300">
                      Not quite right yet. Hint: begins with{' '}
                      <strong>{activeReconstruct.words.slice(0, 2).join(' ')}</strong>…
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={chosenTiles.length !== scrambledReconstructTiles.length}
                        onClick={() => {
                          const assembled = chosenTiles
                            .map((i) => scrambledReconstructTiles[i]?.word || '')
                            .join(' ');
                          if (assembled === activeReconstruct.words.join(' ')) {
                            setReconstructStatus('correct');
                            handlePlayTurn(
                              `rec-ok-${activeReconstruct.turnId}`,
                              activeReconstruct.sentence,
                              activeReconstruct.speakerId,
                              1
                            );
                          } else {
                            setReconstructStatus('wrong');
                          }
                        }}
                        className="rounded-md bg-[var(--color-prussian)] px-4 py-2 text-xs font-medium text-white disabled:opacity-40 dark:bg-[#2B649B]"
                      >
                        Check Order
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setChosenTiles([]);
                          setReconstructStatus('idle');
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-hairline)] px-3 py-2 text-xs text-[var(--color-ink-muted)] dark:border-[var(--color-night-hairline)] dark:text-slate-300"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Reset</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setReconstructIdx((v) => (v + 1) % reconstructPool.length);
                        setChosenTiles([]);
                        setReconstructStatus('idle');
                      }}
                      className="text-xs font-medium text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
                    >
                      Next dialogue line →
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                  No sentences of suitable length for tile reconstruction in this dialogue.
                </p>
              )}
            </div>
          )}

          {/* TAB 4: DIALOGUE COMPREHENSION QUESTIONS */}
          {activeTab === 'comprehension' && (
            <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                    Dialogue Comprehension
                  </p>
                  <h3 className="mt-0.5 font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                    Check Your Understanding
                  </h3>
                </div>
                {compSubmitted && (
                  <span className="font-mono text-xs font-semibold text-[var(--color-sage)] dark:text-emerald-400">
                    Score: {compScore} / {comprehensionQuestions.length}
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-4">
                {comprehensionQuestions.map((q, idx) => {
                  const chosen = compAnswers[q.id];
                  return (
                    <div
                      key={q.id}
                      className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]"
                    >
                      <p className="text-xs font-medium text-[var(--color-ink-muted)] dark:text-slate-400">
                        {idx + 1}. {q.prompt}
                      </p>
                      <p className="mt-1 font-editorial text-base font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                        &ldquo;{q.germanQuote}&rdquo;
                      </p>

                      <div className="mt-3 space-y-1.5">
                        {q.options.map((opt, oIdx) => {
                          const isSelected = chosen === oIdx;
                          const isCorrect = oIdx === q.correctIndex;
                          let cls =
                            'border-[var(--color-hairline)] bg-white text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)] dark:text-[#EDEAE3]';
                          if (compSubmitted) {
                            if (isCorrect) {
                              cls =
                                'border-[var(--color-sage)] bg-[var(--color-sage)]/12 font-medium text-[var(--color-sage)] dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-300';
                            } else if (isSelected && !isCorrect) {
                              cls =
                                'border-red-400 bg-red-50 text-red-700 dark:border-red-500/60 dark:bg-red-950/30 dark:text-red-300';
                            }
                          } else if (isSelected) {
                            cls =
                              'border-[var(--color-prussian)] bg-[var(--color-prussian)]/10 font-medium text-[var(--color-prussian)] dark:border-[#5B9BD5] dark:bg-[#5B9BD5]/20 dark:text-[#7AB3E6]';
                          }

                          return (
                            <button
                              key={oIdx}
                              type="button"
                              disabled={compSubmitted}
                              onClick={() => setCompAnswers((prev) => ({ ...prev, [q.id]: oIdx }))}
                              className={`w-full rounded border px-3 py-2 text-left text-xs transition-colors ${cls}`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>

                      {compSubmitted && (
                        <p className="mt-2 text-[11px] text-[var(--color-ink-muted)] dark:text-slate-400">
                          {q.explanation}
                        </p>
                      )}
                    </div>
                  );
                })}

                <div className="flex items-center gap-3 pt-1">
                  {!compSubmitted ? (
                    <button
                      type="button"
                      disabled={Object.keys(compAnswers).length < comprehensionQuestions.length}
                      onClick={handleSubmitComprehension}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-prussian)] px-4 py-2 text-xs font-medium text-white disabled:opacity-40 dark:bg-[#2B649B]"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Submit Comprehension Check</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setCompAnswers({});
                        setCompSubmitted(false);
                      }}
                      className="rounded-md border border-[var(--color-hairline)] px-3.5 py-2 text-xs font-medium text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
                    >
                      Try Again
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: DIALOGUE KEY VOCABULARY */}
          {activeTab === 'vocabulary' && (
            <div className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-[var(--color-prussian)] dark:text-[#7AB3E6]" />
                <h3 className="font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                  Key Vocabulary in This Dialogue ({dialogueVocab.length})
                </h3>
              </div>

              <ul className="mt-4 divide-y divide-[var(--color-hairline)] dark:divide-[var(--color-night-hairline)]">
                {dialogueVocab.map((entry) => {
                  const cleanLemma = stripStressAccents(entry.german);
                  const saved = savedNormalizedSet.has(entry.normalized);
                  const spoken =
                    entry.article && entry.article !== 'die (pl.)'
                      ? `${entry.article} ${cleanLemma}`
                      : cleanLemma;

                  return (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                          {entry.article ? `${entry.article} ` : ''}
                          {cleanLemma}
                          {entry.genitiveAndPlural ? (
                            <span className="ml-2 font-mono text-[11px] font-normal text-[var(--color-ink-muted)] dark:text-slate-400">
                              ({entry.genitiveAndPlural})
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                          {entry.english}{' '}
                          <span className="ml-1 font-mono text-[10px] opacity-80">
                            {entry.pronunciation}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            handlePlayTurn(`dvoc-${entry.id}`, spoken, activeDialogue.speakers[0].id, 1)
                          }
                          className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] px-2 py-1 text-[11px] font-medium text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
                        >
                          <Volume2 className="h-3 w-3" />
                          <span>1.0×</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onToggleSavedVocab({
                              german: cleanLemma,
                              english: entry.english,
                              article: entry.article,
                              plural: entry.genitiveAndPlural,
                              partOfSpeech: entry.partOfSpeech,
                              pronunciation: entry.pronunciation,
                              chapterNumber: activeDialogue.chapterNumber,
                            })
                          }
                          className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium ${
                            saved
                              ? 'border-[var(--color-sage)] text-[var(--color-sage)] dark:border-emerald-500 dark:text-emerald-400'
                              : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-slate-300'
                          }`}
                        >
                          {saved ? <BookmarkCheck className="h-3 w-3" /> : <BookmarkPlus className="h-3 w-3" />}
                          <span>{saved ? 'Saved' : 'Save'}</span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
