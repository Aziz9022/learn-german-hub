import {
  AlertTriangle,
  CheckCircle2,
  Layers,
  RefreshCw,
  Search,
  Square,
  Volume2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  getVoiceDiagnostics,
  playGermanAudio,
  stopGermanAudio,
  subscribeVoicesChanged,
  type VoiceDiagnostics,
} from '../../services/germanAudio';
import {
  analyzeGermanPassage,
  analyzeGermanWord,
} from '../../services/germanLinguistics';
import type { ParsedBook } from '../../types/book';

interface PronunciationAudioPanelProps {
  book: ParsedBook;
  preferredVoiceURI: string | null;
  onSelectVoiceURI: (uri: string | null) => void;
  onOpenChapter: (chapterNumber: number) => void;
}

interface SoundRuleGroup {
  id: string;
  title: string;
  rule: string;
  examples: { german: string; guide: string; english: string }[];
}

/**
 * Grounded directly in Chapter 2 ("German Letters and Sounds in Words and Sentences")
 * of German Made Simple.
 */
const CHAPTER_2_SOUNDBOARD: SoundRuleGroup[] = [
  {
    id: 'diphthongs',
    title: 'Vowel Combinations (au, ei, eu / äu, ie)',
    rule: 'ei sounds like English "eye"; ie sounds like long "ee"; au sounds like "ow"; eu and äu sound like "oy".',
    examples: [
      { german: 'das Haus', guide: '/hows/', english: 'house' },
      { german: 'mein Freund', guide: '/meyen froynt/', english: 'my friend' },
      { german: 'die Häuser', guide: '/dee hoyzer/', english: 'the houses' },
      { german: 'der Brief', guide: '/dayr breef/', english: 'the letter' },
      { german: 'heute', guide: '/hoyte/', english: 'today' },
    ],
  },
  {
    id: 'umlauts',
    title: 'Modified Vowels / Umlauts (ä, ö, ü)',
    rule: 'For ö, round lips for "o" while saying "e". For ü, round lips for "oo" while saying "ee".',
    examples: [
      { german: 'die Mädchen', guide: '/dee mayd-hyen/', english: 'the girls' },
      { german: 'schön', guide: '/shoen/', english: 'beautiful' },
      { german: 'können', guide: '/koenen/', english: 'to be able to' },
      { german: 'die Bücher', guide: '/dee bue-hyer/', english: 'the books' },
      { german: 'München', guide: '/muen-hyen/', english: 'Munich' },
    ],
  },
  {
    id: 'ch-sounds',
    title: 'Front ch (ich-Laut) vs. Back ch (ach-Laut)',
    rule: 'After a, o, u, au, ch is pronounced far back in the throat (ach). After e, i, ä, ö, ü, ei, eu or consonants, ch is pronounced softly near the front palate (ich).',
    examples: [
      { german: 'das Buch', guide: '/das bookh/', english: 'the book (back ch)' },
      { german: 'die Nacht', guide: '/dee nakht/', english: 'the night (back ch)' },
      { german: 'ich spreche', guide: '/ihy shpre-hye/', english: 'I speak (front ch)' },
      { german: 'nicht', guide: '/nihyt/', english: 'not (front ch)' },
      { german: 'die Küche', guide: '/dee kue-hye/', english: 'the kitchen (front ch)' },
    ],
  },
  {
    id: 'consonants',
    title: 'Key Consonants (sch, sp/st, z, v, w, j, ß)',
    rule: 'w = English "v"; v = "f"; z = "ts"; j = "y"; sp/st at the start of a word or stem = "shp/sht"; ß = sharp voiceless "ss".',
    examples: [
      { german: 'die Schule', guide: '/dee shoo-le/', english: 'the school' },
      { german: 'die Straße', guide: '/dee shtrah-se/', english: 'the street' },
      { german: 'der Vater', guide: '/dayr fah-ter/', english: 'the father' },
      { german: 'das Wasser', guide: '/das vah-ser/', english: 'the water' },
      { german: 'das Zimmer', guide: '/das tsi-mer/', english: 'the room' },
      { german: 'jetzt', guide: '/yetst/', english: 'now' },
    ],
  },
];

export function PronunciationAudioPanel({
  book,
  preferredVoiceURI,
  onSelectVoiceURI,
  onOpenChapter,
}: PronunciationAudioPanelProps) {
  const [diagnostics, setDiagnostics] = useState<VoiceDiagnostics>(() => getVoiceDiagnostics());
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);

  // Translation & Breakdown Bench state
  const [benchInput, setBenchInput] = useState(
    'Herr Clark lernt Deutsch, weil er bald nach München reist.'
  );

  useEffect(() => {
    const sync = () => setDiagnostics(getVoiceDiagnostics());
    const unsub = subscribeVoicesChanged(sync);
    // Also check once shortly after mount for slower OS voice lists
    const t = window.setTimeout(sync, 350);
    return () => {
      unsub();
      window.clearTimeout(t);
    };
  }, [preferredVoiceURI]);

  const handleSpeak = (key: string, text: string, rate: 1 | 0.65) => {
    setAudioNotice(null);
    if (speakingKey === `${key}-${rate}`) {
      stopGermanAudio();
      setSpeakingKey(null);
      return;
    }
    void playGermanAudio(text, rate, {
      onStart: () => setSpeakingKey(`${key}-${rate}`),
      onEnd: () => setSpeakingKey(null),
      onError: (msg) => setAudioNotice(msg),
      onNoGermanVoiceWarning: (msg) => setAudioNotice(msg),
    });
  };

  const trimmedBench = benchInput.trim();
  const benchWords = trimmedBench ? trimmedBench.split(/\s+/).filter(Boolean) : [];
  const benchSingleWord = useMemo(
    () => (benchWords.length === 1 ? analyzeGermanWord(trimmedBench, book) : null),
    [benchWords.length, book, trimmedBench]
  );
  const benchPassage = useMemo(
    () => (benchWords.length > 1 ? analyzeGermanPassage(trimmedBench, book) : null),
    [benchWords.length, book, trimmedBench]
  );

  return (
    <div className="space-y-8">
      {/* 1. German Voice Engine Selector & Diagnostics */}
      <section className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
              Native German Text-to-Speech Configuration
            </p>
            <h2 className="mt-1 font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
              Audio &amp; German Voice Selection
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
              Powered by native Standard German (<em>Hochdeutsch</em>) Studio Audio so every word—like{' '}
              <strong>der Mann</strong>, <strong>die Mädchen</strong>, or full textbook dialogues—plays with
              authentic German pronunciation on any device or browser, with local browser voices available as
              an offline fallback.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setDiagnostics(getVoiceDiagnostics())}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink-muted)] hover:border-[var(--color-prussian)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-300"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh Voices</span>
          </button>
        </div>

        {/* Voice Status Banner */}
        <div className="mt-5">
          {diagnostics.hasGermanVoice ? (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-[var(--color-sage)]/40 bg-[var(--color-sage)]/8 p-4 dark:border-emerald-600/40 dark:bg-emerald-950/25">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-sage)] dark:text-emerald-400" />
                <div className="text-xs">
                  <p className="font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                    Active German voice: {diagnostics.activeVoiceLabel}
                  </p>
                  <p className="mt-0.5 text-[var(--color-ink-muted)] dark:text-slate-300">
                    {diagnostics.activeEngine === 'studio'
                      ? 'Using Native German Studio Audio (Hochdeutsch WAV, cached for instant replay).'
                      : `Using local browser voice (${diagnostics.germanVoices.length} German device voice${diagnostics.germanVoices.length === 1 ? '' : 's'} detected).`}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Select German voice"
                  value={
                    preferredVoiceURI ||
                    (diagnostics.studioAvailable
                      ? diagnostics.activeStudioVoice.voiceURI
                      : diagnostics.activeVoice?.voiceURI || '')
                  }
                  onChange={(e) => onSelectVoiceURI(e.target.value || null)}
                  className="rounded-md border border-[var(--color-hairline)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
                >
                  {diagnostics.studioAvailable && (
                    <optgroup label="Native German Studio Voices (Recommended · Hochdeutsch)">
                      {diagnostics.studioVoices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {diagnostics.germanVoices.length > 0 && (
                    <optgroup label="Device / Browser German Voices (Offline)">
                      {diagnostics.germanVoices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>

                <button
                  type="button"
                  onClick={() =>
                    handleSpeak('voice-test', 'Der Mann ist gut. Die Frau ist gut. Guten Tag!', 1)
                  }
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-prussian)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B]"
                >
                  {speakingKey === 'voice-test-1' ? (
                    <Square className="h-3.5 w-3.5" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5" />
                  )}
                  <span>Test 1.0×</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleSpeak('voice-test', 'Der Mann ist gut. Die Frau ist gut. Guten Tag!', 0.65)
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--color-hairline)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
                >
                  <span>Test 0.65×</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-[var(--color-ochre)]/50 bg-amber-50/70 p-4 text-xs dark:border-amber-500/40 dark:bg-amber-950/25">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ochre)] dark:text-amber-400" />
                <div className="space-y-2">
                  <p className="font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                    Studio TTS offline and no German (<code className="font-mono">de-DE</code>) browser voice
                    found ({diagnostics.totalSystemVoices} system voices scanned)
                  </p>
                  <p className="leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-300">
                    In offline/static mode without a German system voice pack, Web SpeechSynthesis falls back
                    to the device&rsquo;s default English voice. Install a German voice pack in macOS, Windows,
                    or Chrome/Edge speech settings to use offline playback.
                  </p>
                </div>
              </div>
            </div>
          )}

          {audioNotice && (
            <p className="mt-2.5 text-xs text-[var(--color-ochre)] dark:text-amber-300">{audioNotice}</p>
          )}
        </div>
      </section>

      {/* 2. Chapter 2 Interactive German Soundboard */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-muted)] dark:text-slate-400">
              Grounded in Chapter 2 · German Letters and Sounds
            </p>
            <h2 className="mt-1 font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
              Interactive German Pronunciation Soundboard
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onOpenChapter(2)}
            className="text-xs font-medium text-[var(--color-prussian)] hover:underline dark:text-[#7AB3E6]"
          >
            Open Chapter 2 in Textbook →
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {CHAPTER_2_SOUNDBOARD.map((group) => (
            <div
              key={group.id}
              className="rounded-lg border border-[var(--color-hairline)] bg-white p-5 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]"
            >
              <h3 className="font-editorial text-base font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                {group.title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-400">
                {group.rule}
              </p>

              <ul className="mt-4 divide-y divide-[var(--color-hairline)] dark:divide-[var(--color-night-hairline)]">
                {group.examples.map((ex) => {
                  const key = `${group.id}-${ex.german}`;
                  return (
                    <li
                      key={ex.german}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div>
                        <span className="text-sm font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                          {ex.german}
                        </span>
                        <span className="ml-2 font-mono text-xs text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                          {ex.guide}
                        </span>
                        <span className="ml-2 text-xs text-[var(--color-ink-muted)] dark:text-slate-400">
                          — {ex.english}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSpeak(key, ex.german, 1)}
                          className="inline-flex items-center gap-1 rounded border border-[var(--color-hairline)] px-2 py-1 text-[11px] font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
                        >
                          <Volume2 className="h-3 w-3" />
                          <span>1.0×</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSpeak(key, ex.german, 0.65)}
                          className="rounded border border-[var(--color-hairline)] px-2 py-1 text-[11px] text-[var(--color-ink-muted)] hover:border-[var(--color-prussian)] hover:text-[var(--color-ink)] dark:border-[var(--color-night-hairline)] dark:text-slate-300"
                        >
                          0.65×
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Interactive German Translation & Sentence Breakdown Bench */}
      <section className="rounded-lg border border-[var(--color-hairline)] bg-white p-6 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night-surface)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-prussian)] dark:text-[#7AB3E6]">
              Textbook-Lexicon Analyzer
            </p>
            <h2 className="mt-1 font-editorial text-xl font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
              German Translation, Structure & Audio Bench
            </h2>
          </div>

          {trimmedBench && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSpeak('bench', trimmedBench, 1)}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-prussian)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-prussian-hover)] dark:bg-[#2B649B]"
              >
                <Volume2 className="h-3.5 w-3.5" />
                <span>Speak German</span>
              </button>
              <button
                type="button"
                onClick={() => handleSpeak('bench', trimmedBench, 0.65)}
                className="rounded-md border border-[var(--color-hairline)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-prussian)] dark:border-[var(--color-night-hairline)] dark:text-[#EDEAE3]"
              >
                Slow 0.65×
              </button>
            </div>
          )}
        </div>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-[var(--color-ink-muted)] dark:text-slate-400" />
          <textarea
            rows={2}
            value={benchInput}
            onChange={(e) => setBenchInput(e.target.value)}
            placeholder="Type or paste any German word or sentence to inspect its grammar, word-by-word meaning, and pronunciation…"
            className="w-full rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] py-2.5 pr-3 pl-9 text-sm text-[var(--color-ink)] focus:border-[var(--color-prussian)] focus:outline-none dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)] dark:text-[#EDEAE3]"
          />
        </div>

        {benchSingleWord && (
          <div className="mt-4 rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] p-4 text-xs dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
              {benchSingleWord.partOfSpeech} · {benchSingleWord.pronunciation}
            </p>
            <p className="mt-1 font-editorial text-lg font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
              {benchSingleWord.article ? `${benchSingleWord.article} ` : ''}
              {benchSingleWord.lemma}
            </p>
            <p className="mt-1 text-sm text-[var(--color-ink)] dark:text-slate-200">
              {benchSingleWord.english}
            </p>
            {benchSingleWord.grammarNote && (
              <p className="mt-1 text-[var(--color-prussian)] dark:text-[#7AB3E6]">
                {benchSingleWord.grammarNote}
              </p>
            )}
          </div>
        )}

        {benchPassage && (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                  Word-by-Word Lexicon Breakdown
                </p>
                <div className="mt-2 divide-y divide-[var(--color-hairline)] dark:divide-[var(--color-night-hairline)]">
                  {benchPassage.tokens.map((tok, i) => (
                    <div key={`${tok.token}-${i}`} className="flex items-baseline justify-between gap-3 py-1.5 text-xs">
                      <span className="font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">
                        {tok.article ? `${tok.article} ` : ''}
                        {tok.token}
                      </span>
                      <span className="text-right text-[var(--color-ink-muted)] dark:text-slate-400">
                        {tok.english}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-md border border-[var(--color-hairline)] bg-[var(--color-paper)] p-4 dark:border-[var(--color-night-hairline)] dark:bg-[var(--color-night)]">
              <div className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-[var(--color-prussian)] dark:text-[#7AB3E6]" />
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)] dark:text-slate-400">
                  Sentence Structure Insights
                </p>
              </div>
              <p className="text-xs leading-relaxed text-[var(--color-ink-muted)] dark:text-slate-300">
                <strong className="text-[var(--color-ink)] dark:text-[#EDEAE3]">Literal gloss:</strong>{' '}
                {benchPassage.assistedGloss}
              </p>
              <ul className="space-y-2">
                {benchPassage.structureInsights.map((ins, i) => (
                  <li
                    key={i}
                    className="border-l-2 border-[var(--color-prussian)] pl-3 text-xs dark:border-[#5B9BD5]"
                  >
                    <p className="font-semibold text-[var(--color-ink)] dark:text-[#EDEAE3]">{ins.label}</p>
                    <p className="mt-0.5 text-[var(--color-ink-muted)] dark:text-slate-300">{ins.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
