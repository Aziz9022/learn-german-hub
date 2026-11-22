/**
 * Dedicated German Text-to-Speech (TTS) Engine.
 *
 * Primary Engine — Native German Studio Audio (/api/tts · Hochdeutsch WAV):
 *   Generates authentic native German pronunciation on the server so words like
 *   "der Mann" always sound genuinely German across every browser, OS, and iframe,
 *   even when no German system voice pack is installed locally.
 *   Responses are cached in-memory on both server and browser for instant replay.
 *
 * Fallback Engine — Browser Web Speech API (for offline / static GitHub Pages use):
 *   Waits asynchronously for browser voices (`voiceschanged`), normalizes locale tags
 *   (`de_DE` / `de-DE` / `de-AT` / `de-CH`), and guards against Chrome's cancel/speak race.
 */

export type StudioVoiceName = 'Kore' | 'Charon' | 'Zephyr' | 'Fenrir' | 'Puck';

export interface StudioVoiceOption {
  id: StudioVoiceName;
  voiceURI: string;
  label: string;
  genderHint: string;
}

export const STUDIO_VOICE_PREFIX = 'studio:';

export const STUDIO_GERMAN_VOICES: StudioVoiceOption[] = [
  { id: 'Kore', voiceURI: 'studio:Kore', label: 'Kore — Clear Female (Hochdeutsch)', genderHint: 'Female' },
  { id: 'Charon', voiceURI: 'studio:Charon', label: 'Charon — Calm Male (Hochdeutsch)', genderHint: 'Male' },
  { id: 'Zephyr', voiceURI: 'studio:Zephyr', label: 'Zephyr — Warm Female (Hochdeutsch)', genderHint: 'Female' },
  { id: 'Fenrir', voiceURI: 'studio:Fenrir', label: 'Fenrir — Deep Male (Hochdeutsch)', genderHint: 'Male' },
  { id: 'Puck', voiceURI: 'studio:Puck', label: 'Puck — Bright Neutral (Hochdeutsch)', genderHint: 'Neutral' },
];

export interface GermanVoiceInfo {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  isDefault: boolean;
  voice: SpeechSynthesisVoice;
}

export interface VoiceDiagnostics {
  supported: boolean;
  studioAvailable: boolean;
  studioChecked: boolean;
  activeEngine: 'studio' | 'browser';
  activeVoiceLabel: string;
  studioVoices: StudioVoiceOption[];
  activeStudioVoice: StudioVoiceOption;
  voicesLoaded: boolean;
  totalSystemVoices: number;
  germanVoices: GermanVoiceInfo[];
  activeVoice: GermanVoiceInfo | null;
  hasGermanVoice: boolean;
}

const PREFERRED_VOICE_PATTERNS: RegExp[] = [
  /google\s*deutsch/i,
  /microsoft\s*(katja|conrad|amala|florian|seraphina|hedda|stefan)/i,
  /\b(anna|petra|markus|yannick|martin|helena|viktor)\b/i,
  /deutsch|german/i,
];

let cachedBrowserVoices: SpeechSynthesisVoice[] = [];
let browserVoicesLoaded = false;
let preferredVoiceURI: string | null = 'studio:Kore';

// Studio server TTS status
let studioAvailable = true;
let studioChecked = false;
let studioProbePromise: Promise<boolean> | null = null;

// Active playback handles
let activeAudioEl: HTMLAudioElement | null = null;
let activeFetchController: AbortController | null = null;
let activeUtteranceRef: SpeechSynthesisUtterance | null = null;
let pendingSpeakTimer: number | null = null;
let activeSequenceId = 0;

// Client-side Blob URL cache (key -> object URL)
const MAX_CLIENT_AUDIO_CACHE = 180;
const clientAudioCache = new Map<string, string>();

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((cb) => cb());
}

function normalizeLang(lang: string): string {
  return (lang || '').replace(/_/g, '-').toLowerCase().trim();
}

function isGermanBrowserVoice(v: SpeechSynthesisVoice): boolean {
  const norm = normalizeLang(v.lang);
  if (norm === 'de' || norm.startsWith('de-')) return true;
  if (/\b(german|deutsch)\b/i.test(v.name || '')) return true;
  return false;
}

function scoreGermanBrowserVoice(v: SpeechSynthesisVoice): number {
  const norm = normalizeLang(v.lang);
  let score = 0;
  if (norm === 'de-de') score += 50;
  else if (norm === 'de-at' || norm === 'de-ch') score += 35;
  else if (norm.startsWith('de')) score += 25;

  for (let i = 0; i < PREFERRED_VOICE_PATTERNS.length; i++) {
    if (PREFERRED_VOICE_PATTERNS[i].test(v.name || '')) {
      score += 40 - i * 8;
      break;
    }
  }
  if (/natural|neural|online|enhanced|premium/i.test(v.name || '')) {
    score += 20;
  }
  return score;
}

function refreshBrowserVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return [];
  }
  const list = window.speechSynthesis.getVoices();
  if (list && list.length > 0) {
    cachedBrowserVoices = list;
    browserVoicesLoaded = true;
  }
  return cachedBrowserVoices;
}

export async function probeStudioTTS(force = false): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (studioChecked && !force) return studioAvailable;
  if (studioProbePromise && !force) return studioProbePromise;

  studioProbePromise = (async () => {
    try {
      const resp = await fetch('/api/tts/status', { method: 'GET' });
      if (!resp.ok) {
        studioAvailable = false;
      } else {
        const data = (await resp.json()) as { available?: boolean };
        studioAvailable = Boolean(data.available);
      }
    } catch {
      studioAvailable = false;
    } finally {
      studioChecked = true;
      studioProbePromise = null;
      notifyListeners();
    }
    return studioAvailable;
  })();

  return studioProbePromise;
}

// Initialize browser voice listeners & studio probe on client startup
if (typeof window !== 'undefined') {
  if ('speechSynthesis' in window) {
    refreshBrowserVoices();
    const handleVoicesChanged = () => {
      refreshBrowserVoices();
      notifyListeners();
    };
    window.speechSynthesis.addEventListener?.('voiceschanged', handleVoicesChanged);
    if (!window.speechSynthesis.addEventListener) {
      window.speechSynthesis.onvoiceschanged = handleVoicesChanged;
    }
  }
  void probeStudioTTS();
}

export function subscribeVoicesChanged(callback: () => void): () => void {
  listeners.add(callback);
  const before = cachedBrowserVoices.length;
  refreshBrowserVoices();
  if (cachedBrowserVoices.length !== before) {
    callback();
  }
  return () => {
    listeners.delete(callback);
  };
}

export function setPreferredGermanVoiceURI(uri: string | null): void {
  preferredVoiceURI = uri || 'studio:Kore';
  notifyListeners();
}

export function getPreferredGermanVoiceURI(): string | null {
  return preferredVoiceURI;
}

export function getGermanVoices(): GermanVoiceInfo[] {
  const all = refreshBrowserVoices();
  return all
    .filter(isGermanBrowserVoice)
    .sort((a, b) => scoreGermanBrowserVoice(b) - scoreGermanBrowserVoice(a))
    .map((v) => ({
      voiceURI: v.voiceURI,
      name: v.name,
      lang: v.lang,
      localService: v.localService,
      isDefault: v.default,
      voice: v,
    }));
}

export function resolveActiveStudioVoice(): StudioVoiceOption {
  if (preferredVoiceURI && preferredVoiceURI.startsWith(STUDIO_VOICE_PREFIX)) {
    const id = preferredVoiceURI.slice(STUDIO_VOICE_PREFIX.length);
    const match = STUDIO_GERMAN_VOICES.find((v) => v.id === id);
    if (match) return match;
  }
  return STUDIO_GERMAN_VOICES[0];
}

export function resolveActiveBrowserGermanVoice(): GermanVoiceInfo | null {
  const german = getGermanVoices();
  if (german.length === 0) return null;

  if (preferredVoiceURI && !preferredVoiceURI.startsWith(STUDIO_VOICE_PREFIX)) {
    const exact = german.find((v) => v.voiceURI === preferredVoiceURI);
    if (exact) return exact;
  }
  return german[0];
}

function shouldUseStudioEngine(): boolean {
  if (!studioAvailable) return false;
  if (!preferredVoiceURI) return true;
  if (preferredVoiceURI.startsWith(STUDIO_VOICE_PREFIX)) return true;
  // User explicitly selected a local browser German voice
  return false;
}

export function getVoiceDiagnostics(): VoiceDiagnostics {
  const browserSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const all = refreshBrowserVoices();
  const germanVoices = getGermanVoices();
  const activeBrowserVoice = resolveActiveBrowserGermanVoice();
  const activeStudioVoice = resolveActiveStudioVoice();
  const useStudio = shouldUseStudioEngine();

  const activeVoiceLabel = useStudio
    ? `Native German · ${activeStudioVoice.id}`
    : activeBrowserVoice
      ? `${activeBrowserVoice.name} (${activeBrowserVoice.lang})`
      : 'No German browser voice';

  return {
    supported: typeof window !== 'undefined' && (studioAvailable || browserSupported),
    studioAvailable,
    studioChecked,
    activeEngine: useStudio ? 'studio' : 'browser',
    activeVoiceLabel,
    studioVoices: STUDIO_GERMAN_VOICES,
    activeStudioVoice,
    voicesLoaded: browserVoicesLoaded || all.length > 0,
    totalSystemVoices: all.length,
    germanVoices,
    activeVoice: activeBrowserVoice,
    hasGermanVoice: studioAvailable || germanVoices.length > 0,
  };
}

function ensureBrowserVoicesReady(timeoutMs = 700): Promise<SpeechSynthesisVoice[]> {
  const existing = refreshBrowserVoices();
  if (existing.length > 0) return Promise.resolve(existing);
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve([]);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearInterval(poll);
      window.clearTimeout(timer);
      resolve(refreshBrowserVoices());
    };

    const poll = window.setInterval(() => {
      if (window.speechSynthesis.getVoices().length > 0) {
        notifyListeners();
        finish();
      }
    }, 60);

    const timer = window.setTimeout(finish, timeoutMs);
  });
}

function cacheClientAudioUrl(key: string, url: string): void {
  if (clientAudioCache.has(key)) {
    clientAudioCache.delete(key);
  } else if (clientAudioCache.size >= MAX_CLIENT_AUDIO_CACHE) {
    const oldest = clientAudioCache.keys().next().value;
    if (oldest) {
      const oldUrl = clientAudioCache.get(oldest);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      clientAudioCache.delete(oldest);
    }
  }
  clientAudioCache.set(key, url);
}

export interface SpeakGermanCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
  onNoGermanVoiceWarning?: (message: string) => void;
}

export interface SpeakGermanOptions {
  studioVoiceOverride?: StudioVoiceName;
  forceBrowser?: boolean;
}

export function stopGermanAudio(): void {
  activeSequenceId++;

  if (activeFetchController) {
    activeFetchController.abort();
    activeFetchController = null;
  }

  if (activeAudioEl) {
    activeAudioEl.pause();
    activeAudioEl.onended = null;
    activeAudioEl.onerror = null;
    activeAudioEl = null;
  }

  if (pendingSpeakTimer !== null) {
    window.clearTimeout(pendingSpeakTimer);
    pendingSpeakTimer = null;
  }

  activeUtteranceRef = null;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

async function playViaStudioServer(
  cleaned: string,
  rate: 1 | 0.65,
  voiceName: StudioVoiceName,
  callbacks: SpeakGermanCallbacks
): Promise<'played' | 'unavailable' | 'aborted'> {
  const slow = rate < 1;
  const cacheKey = `${voiceName}::${slow ? 'slow' : 'normal'}::${cleaned}`;
  let audioUrl = clientAudioCache.get(cacheKey);

  if (!audioUrl) {
    const controller = new AbortController();
    activeFetchController = controller;
    try {
      const resp = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleaned, voiceName, slow }),
        signal: controller.signal,
      });

      if (activeFetchController === controller) {
        activeFetchController = null;
      }

      if (resp.status === 404 || resp.status === 503) {
        studioAvailable = false;
        studioChecked = true;
        notifyListeners();
        return 'unavailable';
      }

      if (!resp.ok) {
        let errDetail = `German audio request failed (${resp.status}).`;
        try {
          const json = (await resp.json()) as { error?: string };
          if (json.error) errDetail = json.error;
        } catch {
          // ignore non-json body
        }
        callbacks.onEnd?.();
        callbacks.onError?.(errDetail);
        return 'played';
      }

      const blob = await resp.blob();
      audioUrl = URL.createObjectURL(blob);
      cacheClientAudioUrl(cacheKey, audioUrl);
    } catch (err) {
      if (activeFetchController === controller) {
        activeFetchController = null;
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        callbacks.onEnd?.();
        return 'aborted';
      }
      studioAvailable = false;
      studioChecked = true;
      notifyListeners();
      return 'unavailable';
    }
  }

  return await new Promise<'played' | 'aborted'>((resolve) => {
    const audio = new Audio(audioUrl);
    audio.preservesPitch = true;
    // Slight rate trim on top of slow style makes 0.65× extra clear without distortion
    audio.playbackRate = slow ? 0.88 : 1;
    activeAudioEl = audio;

    let finished = false;
    const done = (result: 'played' | 'aborted') => {
      if (finished) return;
      finished = true;
      if (activeAudioEl === audio) activeAudioEl = null;
      callbacks.onEnd?.();
      resolve(result);
    };

    audio.onplay = () => {
      callbacks.onStart?.();
    };
    audio.onended = () => done('played');
    audio.onerror = () => {
      callbacks.onError?.('Unable to decode German audio clip.');
      done('played');
    };

    callbacks.onStart?.();
    void audio.play().catch((err) => {
      if (err instanceof DOMException && err.name === 'AbortError') {
        done('aborted');
        return;
      }
      callbacks.onError?.('Browser blocked audio playback—click Listen again to start.');
      done('played');
    });
  });
}

async function playViaBrowserSpeech(
  cleaned: string,
  rate: 1 | 0.65,
  callbacks: SpeakGermanCallbacks
): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    callbacks.onEnd?.();
    callbacks.onError?.('Text-to-speech is not supported in this browser.');
    return;
  }

  await ensureBrowserVoicesReady(700);
  const germanVoice = resolveActiveBrowserGermanVoice();

  if (!germanVoice) {
    callbacks.onNoGermanVoiceWarning?.(
      'No German (de-DE) voice is installed on this device, so browser fallback may sound English. Switch to Native German Studio Audio in Audio & Pronunciation.'
    );
  }

  return await new Promise<void>((resolve) => {
    pendingSpeakTimer = window.setTimeout(() => {
      pendingSpeakTimer = null;
      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.rate = rate;
      utterance.pitch = 1;

      if (germanVoice) {
        utterance.voice = germanVoice.voice;
        utterance.lang = germanVoice.lang || 'de-DE';
      } else {
        utterance.lang = 'de-DE';
      }

      activeUtteranceRef = utterance;

      utterance.onstart = () => {
        callbacks.onStart?.();
      };
      utterance.onend = () => {
        if (activeUtteranceRef === utterance) activeUtteranceRef = null;
        callbacks.onEnd?.();
        resolve();
      };
      utterance.onerror = (ev) => {
        if (activeUtteranceRef === utterance) activeUtteranceRef = null;
        callbacks.onEnd?.();
        if (ev.error !== 'interrupted' && ev.error !== 'canceled') {
          callbacks.onError?.(`German audio could not play (${ev.error || 'unknown error'}).`);
        }
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    }, 55);
  });
}

export async function playGermanAudio(
  text: string,
  rate: 1 | 0.65 = 1,
  callbacks: SpeakGermanCallbacks = {},
  options: SpeakGermanOptions = {}
): Promise<void> {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return;

  stopGermanAudio();

  if (!studioChecked && !options.forceBrowser) {
    await probeStudioTTS();
  }

  const useStudio = !options.forceBrowser && shouldUseStudioEngine();

  if (useStudio) {
    const voiceName = options.studioVoiceOverride || resolveActiveStudioVoice().id;
    const outcome = await playViaStudioServer(cleaned, rate, voiceName, callbacks);
    if (outcome === 'played' || outcome === 'aborted') {
      return;
    }
    // Studio endpoint unavailable (e.g. static build): fall back to browser voice
  }

  await playViaBrowserSpeech(cleaned, rate, callbacks);
}

export interface SequenceLine {
  id: string;
  text: string;
  studioVoice?: StudioVoiceName;
}

/**
 * Plays a sequence of German dialogue lines one by one, highlighting the active line
 * and respecting cancellation via stopGermanAudio().
 */
export async function playGermanSequence(
  lines: SequenceLine[],
  rate: 1 | 0.65 = 1,
  callbacks: {
    onLineStart?: (lineId: string, index: number) => void;
    onComplete?: () => void;
    onError?: (message: string) => void;
  } = {}
): Promise<void> {
  stopGermanAudio();
  const seqId = ++activeSequenceId;

  if (!studioChecked) {
    await probeStudioTTS();
  }

  for (let i = 0; i < lines.length; i++) {
    if (activeSequenceId !== seqId) return;
    const line = lines[i];
    const cleaned = line.text.replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;

    callbacks.onLineStart?.(line.id, i);

    if (shouldUseStudioEngine()) {
      const voice = line.studioVoice || resolveActiveStudioVoice().id;
      const outcome = await playViaStudioServer(cleaned, rate, voice, {
        onError: callbacks.onError,
      });
      if (activeSequenceId !== seqId) return;
      if (outcome === 'unavailable') {
        await playViaBrowserSpeech(cleaned, rate, { onError: callbacks.onError });
      }
    } else {
      await playViaBrowserSpeech(cleaned, rate, { onError: callbacks.onError });
    }

    if (activeSequenceId !== seqId) return;
    // Brief natural conversational pause between dialogue turns
    await new Promise((r) => setTimeout(r, rate < 1 ? 380 : 240));
  }

  if (activeSequenceId === seqId) {
    callbacks.onComplete?.();
  }
}
