import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const ALLOWED_VOICES = ['Kore', 'Charon', 'Zephyr', 'Fenrir', 'Puck'] as const;
type AllowedVoice = (typeof ALLOWED_VOICES)[number];

interface CachedAudio {
  wav: Buffer;
  createdAt: number;
}

const MAX_CACHE_ENTRIES = 320;
const ttsCache = new Map<string, CachedAudio>();

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function normalizeVoiceName(raw: unknown): AllowedVoice {
  if (typeof raw === 'string') {
    const found = ALLOWED_VOICES.find((v) => v.toLowerCase() === raw.toLowerCase());
    if (found) return found;
  }
  return 'Kore';
}

function getCachedWav(key: string): Buffer | null {
  const hit = ttsCache.get(key);
  if (!hit) return null;
  // Refresh LRU recency
  ttsCache.delete(key);
  ttsCache.set(key, hit);
  return hit.wav;
}

function setCachedWav(key: string, wav: Buffer): void {
  if (ttsCache.has(key)) {
    ttsCache.delete(key);
  } else if (ttsCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = ttsCache.keys().next().value;
    if (oldestKey) ttsCache.delete(oldestKey);
  }
  ttsCache.set(key, { wav, createdAt: Date.now() });
}

async function synthesizeGermanWav(
  ai: GoogleGenAI,
  text: string,
  voiceName: AllowedVoice,
  slow: boolean
): Promise<Buffer> {
  const style = slow
    ? 'Native German language instructor from Germany speaking standard Hochdeutsch slowly and distinctly for a beginner learner. Pronounce every German vowel, umlaut, and consonant with authentic German phonology, never with an English accent.'
    : 'Native German speaker from Germany speaking clear, natural standard Hochdeutsch. Pronounce every German word with authentic German phonology, never with an English accent.';

  const runWithMetadata = async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text,
              speechMetadata: {
                style,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error('Speech model returned no audio data.');
    return Buffer.from(base64Audio, 'base64');
  };

  const runWithInlineStyle = async () => {
    const directive = slow
      ? 'Lies den folgenden deutschen Text langsam und deutlich auf Hochdeutsch vor'
      : 'Lies den folgenden deutschen Text klar und natürlich auf Hochdeutsch vor';
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [{ text: `${directive}: ${text}` }],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error('Speech model returned no audio data.');
    return Buffer.from(base64Audio, 'base64');
  };

  try {
    return await runWithMetadata();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/speechMetadata/i.test(msg)) {
      return await runWithInlineStyle();
    }
    if (/\b(500|502|503|504|ECONNRESET|ETIMEDOUT|fetch failed)\b/i.test(msg)) {
      await new Promise((r) => setTimeout(r, 350));
      return await runWithMetadata();
    }
    throw err;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/tts/status', (_req, res) => {
    const available = Boolean(getGeminiClient());
    res.json({
      available,
      engine: 'gemini-3.8-flash-lite-tts',
      voices: [
        { id: 'Kore', label: 'Kore — Clear Female (Hochdeutsch)' },
        { id: 'Charon', label: 'Charon — Calm Male (Hochdeutsch)' },
        { id: 'Zephyr', label: 'Zephyr — Warm Female (Hochdeutsch)' },
        { id: 'Fenrir', label: 'Fenrir — Deep Male (Hochdeutsch)' },
        { id: 'Puck', label: 'Puck — Bright Neutral (Hochdeutsch)' },
      ],
    });
  });

  app.post('/api/tts', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Native German Studio TTS is not configured on this server (missing GEMINI_API_KEY).',
      });
      return;
    }

    const rawText = typeof req.body?.text === 'string' ? req.body.text : '';
    const cleaned = rawText.replace(/\s+/g, ' ').trim();
    if (!cleaned) {
      res.status(400).json({ error: 'German text is required.' });
      return;
    }
    if (cleaned.length > 800) {
      res.status(400).json({ error: 'Text exceeds the 800-character audio limit per clip.' });
      return;
    }

    const voiceName = normalizeVoiceName(req.body?.voiceName);
    const slow = Boolean(req.body?.slow);
    const cacheKey = `${voiceName}::${slow ? 'slow' : 'normal'}::${cleaned}`;

    const cached = getCachedWav(cacheKey);
    if (cached) {
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('X-TTS-Cache', 'HIT');
      res.send(cached);
      return;
    }

    try {
      const wavBuffer = await synthesizeGermanWav(ai, cleaned, voiceName, slow);
      setCachedWav(cacheKey, wavBuffer);
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('X-TTS-Cache', 'MISS');
      res.send(wavBuffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to generate German speech.';
      const status = /\b429\b|RESOURCE_EXHAUSTED/i.test(message)
        ? 429
        : /\b(400|403)\b|API_KEY_INVALID|PERMISSION_DENIED/i.test(message)
          ? 403
          : 502;
      res.status(status).json({ error: message });
    }
  });

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`German Made Simple server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
