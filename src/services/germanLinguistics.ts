import type { BookChapter, LexiconEntry, ParsedBook, VocabCategory } from '../types/book';
import { playGermanAudio, stopGermanAudio } from './germanAudio';

export interface WordAnalysisResult {
  query: string;
  lemma: string;
  english: string;
  article?: string;
  plural?: string;
  principalParts?: string;
  partOfSpeech: string;
  pronunciation: string;
  matchedFrom: 'textbook-glossary' | 'core-grammar' | 'inferred';
  grammarNote?: string;
  exampleSentence?: string;
  sourceChapter?: number;
}

export interface TokenBreakdown {
  token: string;
  clean: string;
  lemma: string;
  english: string;
  article?: string;
  partOfSpeech: string;
  isContentWord: boolean;
  foundInLexicon: boolean;
}

export interface StructureInsight {
  label: string;
  detail: string;
}

export interface PassageAnalysisResult {
  originalText: string;
  textbookTranslation: string | null;
  assistedGloss: string;
  tokens: TokenBreakdown[];
  structureInsights: StructureInsight[];
  difficultVocabulary: WordAnalysisResult[];
}

/**
 * Strips stress-accent marks used in Chapter 46 (e.g. Amérika -> Amerika)
 * while preserving genuine German umlauts (ä, ö, ü) and ß.
 */
export function stripStressAccents(word: string): string {
  return word
    .replace(/[áà]/g, 'a')
    .replace(/[ÁÀ]/g, 'A')
    .replace(/[éè]/g, 'e')
    .replace(/[ÉÈ]/g, 'E')
    .replace(/[íì]/g, 'i')
    .replace(/[ÍÌ]/g, 'I')
    .replace(/[óò]/g, 'o')
    .replace(/[ÓÒ]/g, 'O')
    .replace(/[úù]/g, 'u')
    .replace(/[ÚÙ]/g, 'U');
}

export function normalizeGermanLookup(word: string): string {
  return stripStressAccents(word)
    .toLowerCase()
    .replace(/^[^a-zäöüß]+|[^a-zäöüß]+$/gi, '')
    .trim();
}

/**
 * Produces an approachable English-friendly German pronunciation guide
 * aligned with Chapter 2 of German Made Simple.
 */
export function buildPronunciationGuide(germanWord: string): string {
  const cleaned = germanWord.trim();
  if (!cleaned) return '';

  let p = cleaned.toLowerCase();
  // Remove stress accents after noting them
  p = stripStressAccents(p);

  // Apply German grapheme-to-phoneme approximations in careful order
  p = p
    .replace(/sch/g, 'sh')
    .replace(/tsch/g, 'ch')
    .replace(/tz/g, 'ts')
    .replace(/ck/g, 'k')
    .replace(/ß/g, 'ss')
    .replace(/äu/g, 'oy')
    .replace(/eu/g, 'oy')
    .replace(/ei/g, 'eye')
    .replace(/ie/g, 'ee')
    .replace(/au/g, 'ow')
    .replace(/\bst/g, 'sht')
    .replace(/\bsp/g, 'shp')
    .replace(/qu/g, 'kv')
    .replace(/ph/g, 'f')
    .replace(/([aou])ch/g, '$1kh')
    .replace(/ch/g, 'hy')
    .replace(/j/g, 'y')
    .replace(/w/g, 'v')
    .replace(/v/g, 'f')
    .replace(/z/g, 'ts')
    .replace(/ä/g, 'eh')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue');

  return `/${p}/`;
}

/**
 * Core high-frequency German grammar & inflected function words so that every word
 * in a beginner sentence resolves with accurate case/conjugation explanations.
 */
const CORE_GRAMMAR_WORDS: Record<
  string,
  { lemma: string; english: string; pos: string; article?: string; note?: string }
> = {
  der: { lemma: 'der', english: 'the (masc. nom. / fem. dat. & gen. / pl. gen.)', pos: 'Definite Article' },
  die: { lemma: 'die', english: 'the (fem. nom./acc. / plural nom./acc.)', pos: 'Definite Article' },
  das: { lemma: 'das', english: 'the (neuter nom./acc.) / that', pos: 'Definite Article' },
  den: { lemma: 'der', english: 'the (masc. accusative / plural dative)', pos: 'Definite Article', note: 'Accusative masculine direct object or dative plural marker.' },
  dem: { lemma: 'der / das', english: 'the (masc. or neuter dative)', pos: 'Definite Article', note: 'Dative case marker (indirect object or after dative/location prepositions).' },
  des: { lemma: 'der / das', english: 'of the (masc. or neuter genitive)', pos: 'Definite Article', note: 'Genitive case marker showing possession.' },
  ein: { lemma: 'ein', english: 'a, an (masc./neut. nom.)', pos: 'Indefinite Article' },
  eine: { lemma: 'ein', english: 'a, an (fem. nom./acc.)', pos: 'Indefinite Article' },
  einen: { lemma: 'ein', english: 'a, an (masc. accusative)', pos: 'Indefinite Article', note: 'Accusative masculine direct object form of ein.' },
  einem: { lemma: 'ein', english: 'a, an (masc./neut. dative)', pos: 'Indefinite Article', note: 'Dative form of ein.' },
  einer: { lemma: 'ein', english: 'a, an (fem. dative/genitive)', pos: 'Indefinite Article' },
  eines: { lemma: 'ein', english: 'of a, an (masc./neut. genitive)', pos: 'Indefinite Article' },
  kein: { lemma: 'kein', english: 'no, not a', pos: 'Negation Article' },
  keine: { lemma: 'kein', english: 'no, not a (fem./plural)', pos: 'Negation Article' },
  keinen: { lemma: 'kein', english: 'no, not a (masc. acc. / pl. dat.)', pos: 'Negation Article' },
  keinem: { lemma: 'kein', english: 'no, not a (masc./neut. dat.)', pos: 'Negation Article' },
  ich: { lemma: 'ich', english: 'I', pos: 'Personal Pronoun' },
  du: { lemma: 'du', english: 'you (familiar singular)', pos: 'Personal Pronoun' },
  er: { lemma: 'er', english: 'he, it (masc.)', pos: 'Personal Pronoun' },
  sie: { lemma: 'sie / Sie', english: 'she / they / you (formal when capitalized)', pos: 'Personal Pronoun' },
  es: { lemma: 'es', english: 'it (neuter)', pos: 'Personal Pronoun' },
  wir: { lemma: 'wir', english: 'we', pos: 'Personal Pronoun' },
  ihr: { lemma: 'ihr', english: 'you (familiar plural) / her / to her', pos: 'Pronoun / Possessive' },
  mich: { lemma: 'ich', english: 'me (accusative)', pos: 'Personal Pronoun' },
  mir: { lemma: 'ich', english: 'to me, for me (dative)', pos: 'Personal Pronoun' },
  dich: { lemma: 'du', english: 'you (familiar accusative)', pos: 'Personal Pronoun' },
  dir: { lemma: 'du', english: 'to you (familiar dative)', pos: 'Personal Pronoun' },
  ihn: { lemma: 'er', english: 'him, it (accusative)', pos: 'Personal Pronoun' },
  ihm: { lemma: 'er / es', english: 'to him, to it (dative)', pos: 'Personal Pronoun' },
  uns: { lemma: 'wir', english: 'us, to us', pos: 'Personal Pronoun' },
  euch: { lemma: 'ihr', english: 'you (pl. acc./dat.)', pos: 'Personal Pronoun' },
  ihnen: { lemma: 'sie / Sie', english: 'to them / to you (formal Ihnen)', pos: 'Personal Pronoun' },
  sich: { lemma: 'sich', english: 'himself, herself, itself, themselves, yourself', pos: 'Reflexive Pronoun' },
  bin: { lemma: 'sein', english: 'am (1st sg. of sein)', pos: 'Verb (sein)' },
  bist: { lemma: 'sein', english: 'are (2nd sg. of sein)', pos: 'Verb (sein)' },
  ist: { lemma: 'sein', english: 'is (3rd sg. of sein)', pos: 'Verb (sein)' },
  sind: { lemma: 'sein', english: 'are (plural / formal of sein)', pos: 'Verb (sein)' },
  seid: { lemma: 'sein', english: 'are (2nd pl. of sein)', pos: 'Verb (sein)' },
  war: { lemma: 'sein', english: 'was (past tense of sein)', pos: 'Verb (sein)' },
  waren: { lemma: 'sein', english: 'were (past tense of sein)', pos: 'Verb (sein)' },
  gewesen: { lemma: 'sein', english: 'been (past participle of sein)', pos: 'Verb (sein)' },
  habe: { lemma: 'haben', english: 'have (1st sg. of haben)', pos: 'Verb (haben)' },
  hast: { lemma: 'haben', english: 'have (2nd sg. of haben)', pos: 'Verb (haben)' },
  hat: { lemma: 'haben', english: 'has (3rd sg. of haben)', pos: 'Verb (haben)' },
  haben: { lemma: 'haben', english: 'to have / have', pos: 'Verb (haben)' },
  habt: { lemma: 'haben', english: 'have (2nd pl. of haben)', pos: 'Verb (haben)' },
  hatte: { lemma: 'haben', english: 'had (past tense of haben)', pos: 'Verb (haben)' },
  hatten: { lemma: 'haben', english: 'had (past pl. of haben)', pos: 'Verb (haben)' },
  gehabt: { lemma: 'haben', english: 'had (past participle of haben)', pos: 'Verb (haben)' },
  wird: { lemma: 'werden', english: 'becomes / will (3rd sg. of werden)', pos: 'Auxiliary Verb' },
  werden: { lemma: 'werden', english: 'to become / will (future or passive auxiliary)', pos: 'Auxiliary Verb' },
  wurde: { lemma: 'werden', english: 'became / was (passive past of werden)', pos: 'Auxiliary Verb' },
  würde: { lemma: 'werden', english: 'would (Konjunktiv II of werden)', pos: 'Auxiliary Verb' },
  kann: { lemma: 'können', english: 'can, is able to', pos: 'Modal Verb' },
  kannst: { lemma: 'können', english: 'can (2nd sg.)', pos: 'Modal Verb' },
  können: { lemma: 'können', english: 'to be able to, can', pos: 'Modal Verb' },
  konnte: { lemma: 'können', english: 'could, was able to', pos: 'Modal Verb' },
  muss: { lemma: 'müssen', english: 'must, has to', pos: 'Modal Verb' },
  muß: { lemma: 'müssen', english: 'must, has to (older spelling of muss)', pos: 'Modal Verb' },
  müssen: { lemma: 'müssen', english: 'must, to have to', pos: 'Modal Verb' },
  musste: { lemma: 'müssen', english: 'had to', pos: 'Modal Verb' },
  will: { lemma: 'wollen', english: 'wants to', pos: 'Modal Verb' },
  wollen: { lemma: 'wollen', english: 'to want to', pos: 'Modal Verb' },
  darf: { lemma: 'dürfen', english: 'may, is permitted to', pos: 'Modal Verb' },
  soll: { lemma: 'sollen', english: 'should, is supposed to', pos: 'Modal Verb' },
  möchte: { lemma: 'mögen', english: 'would like to', pos: 'Modal Verb' },
  und: { lemma: 'und', english: 'and', pos: 'Conjunction' },
  oder: { lemma: 'oder', english: 'or', pos: 'Conjunction' },
  aber: { lemma: 'aber', english: 'but, however', pos: 'Conjunction' },
  denn: { lemma: 'denn', english: 'for, because (coordinating)', pos: 'Conjunction' },
  weil: { lemma: 'weil', english: 'because (sends conjugated verb to end)', pos: 'Subordinating Conjunction' },
  dass: { lemma: 'dass', english: 'that (sends conjugated verb to end)', pos: 'Subordinating Conjunction' },
  daß: { lemma: 'dass', english: 'that (older spelling of dass)', pos: 'Subordinating Conjunction' },
  wenn: { lemma: 'wenn', english: 'if, when, whenever (verb-final clause)', pos: 'Subordinating Conjunction' },
  ob: { lemma: 'ob', english: 'whether, if (indirect yes/no question)', pos: 'Subordinating Conjunction' },
  nicht: { lemma: 'nicht', english: 'not', pos: 'Negation Adverb' },
  auch: { lemma: 'auch', english: 'also, too', pos: 'Adverb' },
  sehr: { lemma: 'sehr', english: 'very', pos: 'Adverb' },
  hier: { lemma: 'hier', english: 'here', pos: 'Adverb' },
  dort: { lemma: 'dort', english: 'there', pos: 'Adverb' },
  heute: { lemma: 'heute', english: 'today', pos: 'Adverb' },
  jetzt: { lemma: 'jetzt', english: 'now', pos: 'Adverb' },
  im: { lemma: 'in dem', english: 'in the (contraction of in + dem, dative)', pos: 'Preposition Contraction' },
  ins: { lemma: 'in das', english: 'into the (contraction of in + das, accusative)', pos: 'Preposition Contraction' },
  am: { lemma: 'an dem', english: 'at/on the (contraction of an + dem)', pos: 'Preposition Contraction' },
  ans: { lemma: 'an das', english: 'to/onto the (contraction of an + das)', pos: 'Preposition Contraction' },
  zum: { lemma: 'zu dem', english: 'to the (contraction of zu + dem, dative)', pos: 'Preposition Contraction' },
  zur: { lemma: 'zu der', english: 'to the (contraction of zu + der, fem. dative)', pos: 'Preposition Contraction' },
  beim: { lemma: 'bei dem', english: 'at/by/near the (contraction of bei + dem)', pos: 'Preposition Contraction' },
  vom: { lemma: 'von dem', english: 'from/of the (contraction of von + dem)', pos: 'Preposition Contraction' },
  aufs: { lemma: 'auf das', english: 'onto the (contraction of auf + das)', pos: 'Preposition Contraction' },
  mein: { lemma: 'mein', english: 'my', pos: 'Possessive Adjective' },
  meine: { lemma: 'mein', english: 'my (fem./plural)', pos: 'Possessive Adjective' },
  meinen: { lemma: 'mein', english: 'my (masc. acc. / pl. dat.)', pos: 'Possessive Adjective' },
  meinem: { lemma: 'mein', english: 'my (masc./neut. dat.)', pos: 'Possessive Adjective' },
  sein: { lemma: 'sein', english: 'his / its (possessive) OR to be (verb)', pos: 'Possessive / Verb' },
  seine: { lemma: 'sein', english: 'his, its (fem./plural)', pos: 'Possessive Adjective' },
  seinen: { lemma: 'sein', english: 'his, its (masc. acc. / pl. dat.)', pos: 'Possessive Adjective' },
  seinem: { lemma: 'sein', english: 'his, its (masc./neut. dat.)', pos: 'Possessive Adjective' },
  unser: { lemma: 'unser', english: 'our', pos: 'Possessive Adjective' },
  unsere: { lemma: 'unser', english: 'our (fem./plural)', pos: 'Possessive Adjective' },
  wer: { lemma: 'wer', english: 'who?', pos: 'Interrogative Pronoun' },
  was: { lemma: 'was', english: 'what?', pos: 'Interrogative Pronoun' },
  wo: { lemma: 'wo', english: 'where? (location)', pos: 'Interrogative Adverb' },
  wohin: { lemma: 'wohin', english: 'where to? (motion)', pos: 'Interrogative Adverb' },
  woher: { lemma: 'woher', english: 'where from?', pos: 'Interrogative Adverb' },
  wie: { lemma: 'wie', english: 'how? / like, as', pos: 'Interrogative / Conjunction' },
  warum: { lemma: 'warum', english: 'why?', pos: 'Interrogative Adverb' },
  wann: { lemma: 'wann', english: 'when?', pos: 'Interrogative Adverb' },
  herr: { lemma: 'Herr', english: 'Mr., gentleman', pos: 'Noun', article: 'der' },
  herrn: { lemma: 'Herr', english: 'Mr. (acc./dat./gen. weak-noun form of Herr)', pos: 'Noun', article: 'der', note: 'Weak masculine noun Herr adds -n in non-nominative singular cases.' },
  frau: { lemma: 'Frau', english: 'Mrs., Ms., woman, wife', pos: 'Noun', article: 'die' },
  ja: { lemma: 'ja', english: 'yes (or modal particle "indeed")', pos: 'Particle / Adverb' },
  nein: { lemma: 'nein', english: 'no', pos: 'Particle' },
  bitte: { lemma: 'bitte', english: 'please / you are welcome', pos: 'Expression' },
  danke: { lemma: 'danke', english: 'thank you', pos: 'Expression' },
};

const SUBORDINATING_CONJUNCTIONS = new Set([
  'weil',
  'dass',
  'daß',
  'wenn',
  'ob',
  'obwohl',
  'als',
  'bevor',
  'nachdem',
  'während',
  'damit',
  'bis',
  'seit',
  'seitdem',
  'sobald',
  'solange',
]);

const MODAL_OR_AUX_VERBS = new Set([
  'kann',
  'kannst',
  'können',
  'könnt',
  'konnte',
  'muss',
  'muß',
  'musst',
  'müssen',
  'musste',
  'will',
  'willst',
  'wollen',
  'wollte',
  'darf',
  'darfst',
  'dürfen',
  'durfte',
  'soll',
  'sollst',
  'sollen',
  'sollte',
  'mag',
  'mögen',
  'möchte',
  'möchten',
  'habe',
  'hast',
  'hat',
  'haben',
  'habt',
  'hatte',
  'hatten',
  'bin',
  'bist',
  'ist',
  'sind',
  'seid',
  'war',
  'waren',
  'werde',
  'wirst',
  'wird',
  'werden',
  'wurde',
  'wurden',
  'würde',
  'würden',
]);

/**
 * Parses Chapter 46 (German–English Vocabulary) DOM elements into structured LexiconEntry objects.
 */
export function parseChapter46Lexicon(ch46Html: string): LexiconEntry[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${ch46Html}</div>`, 'text/html');
  const paragraphs = Array.from(doc.querySelectorAll('p.mbp_pagebreak'));
  const entries: LexiconEntry[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const rawText = (p.textContent || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
    if (!rawText || rawText.length < 3) continue;

    const firstBold = p.querySelector('span.bold');
    if (!firstBold) continue;

    const boldText = (firstBold.textContent || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
    if (!boldText) continue;

    // Check text immediately preceding first bold for article or "sich"
    let prefixText = '';
    for (const node of Array.from(p.childNodes)) {
      if (node === firstBold) break;
      prefixText += node.textContent || '';
    }
    prefixText = prefixText.replace(/\u00A0/g, ' ').trim();

    let article: LexiconEntry['article'];
    if (/^der\b/i.test(prefixText)) article = 'der';
    else if (/^die\b/i.test(prefixText)) article = 'die';
    else if (/^das\b/i.test(prefixText)) article = 'das';
    const isReflexive = /\bsich\b/i.test(prefixText);

    // Extract italic POS note if present right after bold
    const italicEl = p.querySelector('span.italic');
    const italicText = (italicEl?.textContent || '').trim();

    // Split bold headword on commas: e.g. "Abend, -s, -e" or "abfahren, er fährt ab, fuhr ab, ist abgefahren"
    const boldParts = boldText.split(',').map((s) => s.trim()).filter(Boolean);
    const rawHeadword = boldParts[0] || boldText;
    // Remove separable prefix hyphen for clean lookup (e.g. ab-holen -> abholen)
    const cleanHeadword = rawHeadword.replace(/-/g, '').replace(/\s*\([^)]*\)/g, '').trim();

    // Extract English definition: everything after first bold span
    let afterBold = '';
    let seenFirstBold = false;
    for (const node of Array.from(p.childNodes)) {
      if (node === firstBold) {
        seenFirstBold = true;
        continue;
      }
      if (seenFirstBold) {
        afterBold += node.textContent || '';
      }
    }
    afterBold = afterBold
      .replace(/\u00A0/g, ' ')
      .replace(/^[,;\s-]+/, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Determine genitive/plural or verb principal parts
    let genitiveAndPlural: string | undefined;
    let principalParts: string | undefined;
    let partOfSpeech = 'Word';

    if (article) {
      partOfSpeech = 'Noun';
      if (boldParts.length > 1) {
        genitiveAndPlural = boldParts.slice(1).join(', ');
      }
    } else if (isReflexive) {
      partOfSpeech = 'Reflexive Verb';
      if (boldParts.length > 1) principalParts = boldParts.slice(1).join(', ');
    } else if (/\bsub\.\s*conj/i.test(italicText)) {
      partOfSpeech = 'Subordinating Conjunction';
    } else if (/\bconj/i.test(italicText)) {
      partOfSpeech = 'Conjunction';
    } else if (/\bprep/i.test(italicText)) {
      partOfSpeech = `Preposition (${italicText.replace(/\.$/, '')})`;
    } else if (/\badj/i.test(italicText)) {
      partOfSpeech = 'Adjective';
    } else if (/\badv/i.test(italicText)) {
      partOfSpeech = 'Adverb';
    } else if (/\bpron/i.test(italicText)) {
      partOfSpeech = 'Pronoun';
    } else if (/^to\s+/i.test(afterBold) || boldParts.length >= 3 || rawHeadword.includes('-')) {
      partOfSpeech = rawHeadword.includes('-') ? 'Separable Verb' : 'Verb';
      if (boldParts.length > 1) principalParts = boldParts.slice(1).join(', ');
    } else if (/^[A-ZÄÖÜ]/.test(cleanHeadword)) {
      partOfSpeech = 'Noun / Proper Noun';
    } else {
      partOfSpeech = 'Adjective / Adverb';
    }

    // Clean English definition by trimming leading POS abbreviation if already extracted
    const cleanEnglish = afterBold
      .replace(/^(sub\.\s*conj\.|conj\.|prep\.\s*w\.[^.]*\.|adj\.|adv\.|pron\.|pl\.)\s*/i, '')
      .trim();

    const category: VocabCategory = partOfSpeech.includes('Noun')
      ? 'Noun'
      : partOfSpeech.includes('Verb')
        ? 'Verb'
        : partOfSpeech.includes('Preposition')
          ? 'Preposition'
          : partOfSpeech.includes('Conjunction')
            ? 'Conjunction'
            : partOfSpeech.includes('Pronoun')
              ? 'Pronoun / Expression'
              : 'Adjective / Adverb';

    entries.push({
      id: `ch46-${i}`,
      german: isReflexive ? `sich ${rawHeadword}` : rawHeadword,
      normalized: normalizeGermanLookup(cleanHeadword),
      article,
      genitiveAndPlural,
      principalParts,
      partOfSpeech,
      category,
      english: cleanEnglish || afterBold || rawText,
      pronunciation: buildPronunciationGuide(cleanHeadword),
      rawEntry: rawText,
      sourceChapter: 46,
    });
  }

  return entries;
}

/**
 * Builds an index mapping normalized German words (including verb principal parts
 * like "fuhr", "fährt", "abgefahren") to their Chapter 46 LexiconEntry.
 */
const lexiconIndexCache = new WeakMap<LexiconEntry[], Map<string, LexiconEntry>>();

function getLexiconIndex(lexicon: LexiconEntry[]): Map<string, LexiconEntry> {
  const existing = lexiconIndexCache.get(lexicon);
  if (existing) return existing;

  const map = new Map<string, LexiconEntry>();
  for (const entry of lexicon) {
    if (entry.normalized && !map.has(entry.normalized)) {
      map.set(entry.normalized, entry);
    }
    // Also index principal parts (e.g. "er fährt ab, fuhr ab, ist abgefahren")
    if (entry.principalParts) {
      const partTokens = entry.principalParts
        .split(/[\s,;/()]+/)
        .map((t) => normalizeGermanLookup(t))
        .filter((t) => t.length >= 3 && !['er', 'sie', 'es', 'hat', 'ist', 'sich'].includes(t));
      for (const tok of partTokens) {
        if (!map.has(tok)) {
          map.set(tok, entry);
        }
      }
    }
  }

  lexiconIndexCache.set(lexicon, map);
  return map;
}

export function findExampleSentenceInBook(
  word: string,
  book: ParsedBook,
  preferredChapter?: BookChapter
): string | undefined {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`([^.!?\\n]{8,140}\\b${escaped}\\b[^.!?\\n]{0,120}[.!?])`, 'i');

  const chaptersToSearch: BookChapter[] = [];
  if (preferredChapter && preferredChapter.number <= 44) chaptersToSearch.push(preferredChapter);
  for (const ch of book.chapters) {
    if (ch.number >= 3 && ch.number <= 44 && ch.number !== preferredChapter?.number) {
      chaptersToSearch.push(ch);
    }
  }

  for (const ch of chaptersToSearch) {
    const match = ch.plainText.match(re);
    if (match && match[1]) {
      const sentence = match[1].replace(/\s+/g, ' ').trim();
      // Skip exercise instructions in English if possible
      if (!/^Exercise\s+\d+/i.test(sentence) && sentence.length <= 220) {
        return sentence;
      }
    }
  }
  return undefined;
}

/**
 * Looks up a single German word against Chapter 46 lexicon, inflected stems,
 * and core grammar function words.
 */
export function analyzeGermanWord(
  rawWord: string,
  book: ParsedBook,
  currentChapter?: BookChapter
): WordAnalysisResult {
  const cleanDisplay = rawWord.replace(/^[^A-Za-zÄÖÜäöüß]+|[^A-Za-zÄÖÜäöüß]+$/g, '').trim() || rawWord.trim();
  const norm = normalizeGermanLookup(cleanDisplay);
  const index = getLexiconIndex(book.lexicon);

  // 1. Direct match in Chapter 46 textbook vocabulary
  const exactEntry = index.get(norm);
  if (exactEntry) {
    return {
      query: cleanDisplay,
      lemma: exactEntry.german,
      english: exactEntry.english,
      article: exactEntry.article,
      plural: exactEntry.genitiveAndPlural,
      principalParts: exactEntry.principalParts,
      partOfSpeech: exactEntry.partOfSpeech,
      pronunciation: exactEntry.pronunciation,
      matchedFrom: 'textbook-glossary',
      exampleSentence: findExampleSentenceInBook(cleanDisplay, book, currentChapter),
      sourceChapter: exactEntry.sourceChapter,
    };
  }

  // 2. Core German grammar / function word table
  const core = CORE_GRAMMAR_WORDS[norm];
  if (core) {
    return {
      query: cleanDisplay,
      lemma: core.lemma,
      english: core.english,
      article: core.article,
      partOfSpeech: core.pos,
      pronunciation: buildPronunciationGuide(cleanDisplay),
      matchedFrom: 'core-grammar',
      grammarNote: core.note,
      exampleSentence: findExampleSentenceInBook(cleanDisplay, book, currentChapter),
    };
  }

  // 3. Inflectional stemming (verb conjugations, noun plurals, adjective endings, old ß -> ss)
  const candidates: { stem: string; note: string }[] = [];
  if (norm.includes('ß')) candidates.push({ stem: norm.replace(/ß/g, 'ss'), note: 'Reformed spelling (ß → ss)' });
  if (norm.includes('ss')) candidates.push({ stem: norm.replace(/ss/g, 'ß'), note: 'Traditional textbook spelling (ss → ß)' });

  // Regular verb inflections -> infinitive -en
  if (norm.endsWith('st') && norm.length > 4) {
    candidates.push({ stem: `${norm.slice(0, -2)}en`, note: '2nd-person singular verb form (-st)' });
    candidates.push({ stem: `${norm.slice(0, -2)}n`, note: '2nd-person singular verb form' });
  }
  if (norm.endsWith('et') && norm.length > 4) {
    candidates.push({ stem: `${norm.slice(0, -2)}en`, note: 'Conjugated verb / participle form (-et)' });
  }
  if (norm.endsWith('t') && norm.length > 3) {
    candidates.push({ stem: `${norm.slice(0, -1)}en`, note: '3rd-person singular or 2nd-person plural verb form (-t)' });
  }
  if (norm.endsWith('te') && norm.length > 4) {
    candidates.push({ stem: `${norm.slice(0, -2)}en`, note: 'Past tense (Präteritum) weak verb (-te)' });
  }
  if (norm.endsWith('ten') && norm.length > 5) {
    candidates.push({ stem: `${norm.slice(0, -3)}en`, note: 'Past tense plural weak verb (-ten)' });
  }
  if (norm.startsWith('ge') && norm.endsWith('t') && norm.length > 5) {
    candidates.push({ stem: `${norm.slice(2, -1)}en`, note: 'Past participle (ge-…-t)' });
  }
  if (norm.startsWith('ge') && norm.endsWith('en') && norm.length > 6) {
    candidates.push({ stem: norm.slice(2), note: 'Past participle (ge-…-en)' });
  }
  // Noun & adjective endings
  for (const [suffix, desc] of [
    ['en', 'Inflected/plural form (-en)'],
    ['er', 'Inflected/plural or comparative form (-er)'],
    ['es', 'Genitive or neuter adjective form (-es)'],
    ['em', 'Dative adjective ending (-em)'],
    ['e', '1st-person verb, plural, or adjective ending (-e)'],
    ['n', 'Plural or dative plural ending (-n)'],
    ['s', 'Genitive or plural ending (-s)'],
  ] as const) {
    if (norm.endsWith(suffix) && norm.length > suffix.length + 2) {
      candidates.push({ stem: norm.slice(0, -suffix.length), note: desc });
      if (suffix === 'e') {
        candidates.push({ stem: `${norm.slice(0, -1)}en`, note: '1st-person singular verb form (-e)' });
      }
    }
  }

  // Try de-umlauting plurals (e.g., Häuser -> Haus, Männer -> Mann, Bücher -> Buch)
  const deUmlaut = (s: string) => s.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u');
  if (/[äöü]/.test(norm)) {
    const base = deUmlaut(norm);
    candidates.push({ stem: base, note: 'Umlauted stem form' });
    if (base.endsWith('er')) candidates.push({ stem: base.slice(0, -2), note: 'Plural noun with umlaut + -er' });
    if (base.endsWith('e')) candidates.push({ stem: base.slice(0, -1), note: 'Plural noun with umlaut + -e' });
    if (base.endsWith('t')) candidates.push({ stem: `${base.slice(0, -1)}en`, note: 'Stem-changing verb form' });
  }

  for (const cand of candidates) {
    const hit = index.get(cand.stem);
    if (hit) {
      return {
        query: cleanDisplay,
        lemma: hit.german,
        english: hit.english,
        article: hit.article,
        plural: hit.genitiveAndPlural,
        principalParts: hit.principalParts,
        partOfSpeech: hit.partOfSpeech,
        pronunciation: buildPronunciationGuide(cleanDisplay),
        matchedFrom: 'textbook-glossary',
        grammarNote: `${cand.note} of "${hit.german}"`,
        exampleSentence: findExampleSentenceInBook(cleanDisplay, book, currentChapter),
        sourceChapter: hit.sourceChapter,
      };
    }
    const coreHit = CORE_GRAMMAR_WORDS[cand.stem];
    if (coreHit) {
      return {
        query: cleanDisplay,
        lemma: coreHit.lemma,
        english: coreHit.english,
        article: coreHit.article,
        partOfSpeech: coreHit.pos,
        pronunciation: buildPronunciationGuide(cleanDisplay),
        matchedFrom: 'core-grammar',
        grammarNote: `${cand.note} of "${coreHit.lemma}"`,
        exampleSentence: findExampleSentenceInBook(cleanDisplay, book, currentChapter),
      };
    }
  }

  // 4. Honest fallback when word is a proper name, compound, or outside Chapter 46
  const looksLikeNoun = /^[A-ZÄÖÜ]/.test(cleanDisplay);
  return {
    query: cleanDisplay,
    lemma: cleanDisplay,
    english: 'Not listed as a standalone headword in Chapter 46 (may be a proper name, compound noun, or English word).',
    partOfSpeech: looksLikeNoun ? 'Capitalized Word / Noun' : 'Unindexed Word',
    pronunciation: buildPronunciationGuide(cleanDisplay),
    matchedFrom: 'inferred',
    exampleSentence: findExampleSentenceInBook(cleanDisplay, book, currentChapter),
  };
}

/**
 * Attempts to find an adjacent parallel English translation if the textbook chapter
 * pairs this German sentence with an English line (common in early chapters & dialogues).
 */
function findAdjacentTextbookTranslation(
  selectionText: string,
  chapter?: BookChapter
): string | null {
  if (!chapter) return null;
  const trimmed = selectionText.replace(/\s+/g, ' ').trim();
  if (trimmed.length < 6) return null;

  const idx = chapter.plainText.indexOf(trimmed);
  if (idx === -1) return null;

  // Check if immediately followed by a likely English sentence (heuristic: common English words, no umlauts)
  const after = chapter.plainText.slice(idx + trimmed.length, idx + trimmed.length + 240).trim();
  const nextSentenceMatch = after.match(/^([A-Z][^.!?]{4,180}[.!?])/);
  if (nextSentenceMatch) {
    const candidate = nextSentenceMatch[1].trim();
    const englishSignals = /\b(the|is|are|was|were|have|has|this|that|Mr\.|Mrs\.|in|to|of|and|with|for|not|he|she|they|we|you)\b/i;
    const germanSignals = /[äöüß]|\b(der|die|das|und|ist|sind|ein|eine|nicht|ich|wir|Herr|Frau)\b/i;
    if (englishSignals.test(candidate) && !germanSignals.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Analyzes a selected German sentence or paragraph for Stage 5 Contextual Side Panel:
 * textbook/glossed translation, word-by-word breakdown, sentence structure insights,
 * and key/difficult vocabulary.
 */
export function analyzeGermanPassage(
  rawText: string,
  book: ParsedBook,
  currentChapter?: BookChapter
): PassageAnalysisResult {
  const originalText = rawText.replace(/\s+/g, ' ').trim();
  const rawTokens = originalText.match(/[A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)?/g) || [];

  const tokens: TokenBreakdown[] = rawTokens.map((tok) => {
    const analysis = analyzeGermanWord(tok, book, currentChapter);
    const shortEnglish = analysis.english.split(/[;(]/)[0].trim();
    const isContentWord =
      analysis.matchedFrom === 'textbook-glossary' &&
      !['Definite Article', 'Indefinite Article', 'Conjunction', 'Personal Pronoun'].includes(
        analysis.partOfSpeech
      );
    return {
      token: tok,
      clean: normalizeGermanLookup(tok),
      lemma: analysis.lemma,
      english:
        analysis.matchedFrom === 'inferred' ? '—' : shortEnglish.length > 48 ? `${shortEnglish.slice(0, 48)}…` : shortEnglish,
      article: analysis.article,
      partOfSpeech: analysis.partOfSpeech,
      isContentWord,
      foundInLexicon: analysis.matchedFrom !== 'inferred',
    };
  });

  // Build assisted literal gloss
  const glossParts = tokens.map((t) => (t.foundInLexicon ? t.english.split(',')[0].trim() : t.token));
  const assistedGloss = glossParts.join(' ');

  // Detect authentic German grammatical structures present in the selection
  const structureInsights: StructureInsight[] = [];
  const lowerTokens = tokens.map((t) => t.clean);

  if (originalText.endsWith('?')) {
    const startsWithInterrogative = ['wer', 'was', 'wo', 'wohin', 'woher', 'wie', 'warum', 'wann', 'welche', 'welcher', 'welches'].includes(
      lowerTokens[0] || ''
    );
    structureInsights.push({
      label: startsWithInterrogative ? 'W-Question Word Order' : 'Yes/No Question Inversion',
      detail: startsWithInterrogative
        ? `Starts with question word "${tokens[0]?.token}", followed directly by the conjugated verb in Position 2.`
        : `Places the conjugated verb "${tokens[0]?.token}" in Position 1 before the subject to form a yes/no question.`,
    });
  } else if (tokens.length >= 3) {
    structureInsights.push({
      label: 'Main Clause V2 Rule',
      detail:
        'In standard German statements, the conjugated finite verb occupies Position 2—even if a time or place phrase comes first.',
    });
  }

  const foundSubConj = tokens.find((t) => SUBORDINATING_CONJUNCTIONS.has(t.clean));
  if (foundSubConj) {
    structureInsights.push({
      label: `Subordinate Clause ("${foundSubConj.token}")`,
      detail: `"${foundSubConj.token}" introduces a dependent clause, pushing its conjugated verb to the very end of the clause.`,
    });
  }

  const foundModalOrAux = tokens.find((t) => MODAL_OR_AUX_VERBS.has(t.clean));
  if (foundModalOrAux && tokens.length >= 4) {
    structureInsights.push({
      label: `Sentence Bracket · Satzklammer ("${foundModalOrAux.token}")`,
      detail: `Auxiliary or modal verb "${foundModalOrAux.token}" opens the verb bracket; any paired infinitive or past participle (ge-…) closes the clause at the end.`,
    });
  }

  const caseCues: string[] = [];
  if (lowerTokens.includes('den') || lowerTokens.includes('einen') || lowerTokens.includes('keinen')) {
    caseCues.push('Accusative masculine marker (den / einen / keinen) signaling a direct object or accusative preposition');
  }
  if (lowerTokens.includes('dem') || lowerTokens.includes('einem') || lowerTokens.includes('mir') || lowerTokens.includes('ihm')) {
    caseCues.push('Dative marker (dem / einem / mir / ihm) signaling an indirect object or location/dative preposition');
  }
  if (lowerTokens.includes('des') || lowerTokens.includes('eines')) {
    caseCues.push('Genitive marker (des / eines) signaling possession ("of the")');
  }
  if (caseCues.length > 0) {
    structureInsights.push({
      label: 'Case Signals Detected',
      detail: `${caseCues.join('; ')}.`,
    });
  }

  if (lowerTokens.includes('nicht') || lowerTokens.includes('kein') || lowerTokens.includes('keine') || lowerTokens.includes('keinen')) {
    structureInsights.push({
      label: 'Negation Pattern',
      detail: 'Uses "kein-" to negate nouns without a definite article, or "nicht" to negate verbs, adjectives, and whole clauses.',
    });
  }

  // Extract unique difficult / key vocabulary from the selection
  const seenLemmas = new Set<string>();
  const difficultVocabulary: WordAnalysisResult[] = [];
  for (const tok of tokens) {
    if (!tok.isContentWord) continue;
    const key = normalizeGermanLookup(tok.lemma);
    if (seenLemmas.has(key)) continue;
    seenLemmas.add(key);
    difficultVocabulary.push(analyzeGermanWord(tok.token, book, currentChapter));
    if (difficultVocabulary.length >= 8) break;
  }

  return {
    originalText,
    textbookTranslation: findAdjacentTextbookTranslation(originalText, currentChapter),
    assistedGloss,
    tokens,
    structureInsights,
    difficultVocabulary,
  };
}

/**
 * Web Speech API German TTS player supporting normal (1.0) and slow (0.65) speed.
 * Delegates to the dedicated German Audio engine that waits for async voice loading
 * and enforces German (de-DE / de-AT / de-CH) voices.
 */
export function speakGermanText(
  text: string,
  rate: 1 | 0.65 = 1,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (message: string) => void,
  onNoGermanVoiceWarning?: (message: string) => void
): void {
  void playGermanAudio(text, rate, {
    onStart,
    onEnd,
    onError,
    onNoGermanVoiceWarning,
  });
}

export function stopGermanSpeech(): void {
  stopGermanAudio();
}
