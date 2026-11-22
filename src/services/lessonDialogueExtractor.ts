import {
  analyzeGermanPassage,
  buildPronunciationGuide,
  normalizeGermanLookup,
  stripStressAccents,
} from './germanLinguistics';
import type { StudioVoiceName } from './germanAudio';
import type { BookChapter, LexiconEntry, ParsedBook } from '../types/book';

export interface BilingualLine {
  id: string;
  index: number;
  speaker?: string;
  german: string;
  english: string;
}

export interface ChapterVocabPair {
  id: string;
  german: string;
  english: string;
  article?: 'der' | 'die' | 'das' | 'die (pl.)';
  plural?: string;
  pronunciation: string;
  source: 'chapter-wortschatz' | 'ch46-glossary';
}

export interface SentenceSlotBreakdown {
  id: string;
  german: string;
  english: string;
  pos1Label: string;
  pos1Text: string;
  verbPos2: string;
  middleField: string;
  endBracket: string;
  structureNote: string;
}

export interface TerminologyItem {
  term: string;
  plainEnglish: string;
}

export interface StructuredLesson {
  chapterNumber: number;
  bilingualPassage: BilingualLine[];
  wortschatz: ChapterVocabPair[];
  redemittel: { id: string; german: string; english: string }[];
  grammarHeadings: string[];
  beginnerGuide: {
    overview: string;
    keyTakeaways: string[];
    terminology: TerminologyItem[];
  };
  sentenceConstructions: SentenceSlotBreakdown[];
  summaryPoints: string[];
}

export interface DialogueSpeaker {
  id: string;
  name: string;
  roleHint: string;
  studioVoice: StudioVoiceName;
  badgeStyle: 'prussian' | 'sage' | 'ochre';
}

export interface DialogueTurn {
  id: string;
  index: number;
  speakerId: string;
  speakerName: string;
  german: string;
  english: string;
  isNarration?: boolean;
}

export interface BookDialogue {
  id: string;
  chapterNumber: number;
  chapterTitle: string;
  kind: 'explicit-dialogue' | 'chapter-conversation';
  germanTitle: string;
  englishTitle: string;
  contextNote: string;
  speakers: DialogueSpeaker[];
  turns: DialogueTurn[];
}

function cleanText(raw: string): string {
  return raw
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findLexiconMatch(word: string, lexicon: LexiconEntry[]): LexiconEntry | undefined {
  const norm = normalizeGermanLookup(word);
  if (!norm) return undefined;
  return lexicon.find((e) => e.normalized === norm);
}

/**
 * Removes inline textbook footnote markers (superscripts like "1" attached to a word)
 * while preserving real numbers, times, dates, and phone numbers.
 */
function cleanTextbookCell(td: Element): string {
  const clone = td.cloneNode(true) as Element;
  clone.querySelectorAll('sup').forEach((sup) => sup.remove());
  // Also strip tiny italic footnote numbers inside span.calibre_... when isolated single digit after word
  let txt = cleanText(clone.textContent || '');
  // Remove leading numbering like "1. " or "12. " when separating table rows
  txt = txt.replace(/^\d+\.\s*/, '');
  // Normalize smart dashes / spaces
  txt = txt.replace(/\s+([,.;:!?])/g, '$1');
  return txt.trim();
}

function extractRawTableRows(table: Element): [string, string][] {
  const rows = Array.from(table.querySelectorAll('tr'));
  const pairs: [string, string][] = [];
  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('td, th'));
    if (cells.length < 2) continue;
    const left = cleanTextbookCell(cells[0]);
    const right = cleanTextbookCell(cells[1]);
    if (!left && !right) continue;
    pairs.push([left, right]);
  }
  return pairs;
}

function parseDoc(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(`<div>${html}</div>`, 'text/html');
}

function isHeadingTitlePair(left: string, right: string): boolean {
  if (!left || !right) return false;
  // Short title row without sentence punctuation
  if (left.length < 65 && right.length < 65 && !/[.!?]$/.test(left) && !/[.!?]$/.test(right)) {
    return true;
  }
  return false;
}

function isVocabTableRow(left: string, right: string): boolean {
  if (/^(der|die|das)\s+[A-ZÄÖÜ]/.test(left) && left.length < 65 && right.length < 75) return true;
  if (/\bpl\.\s*/i.test(left)) return true;
  if (/^to\s+[a-z]+/i.test(right) && left.split(/\s+/).length <= 4) return true;
  return false;
}

/**
 * Extracts the authentic opening bilingual passage from a chapter (Chapters 3–44)
 * or representative German-English sentences for Chapters 1–2.
 */
function extractChapterBilingualPassage(chapter: BookChapter, doc: Document): BilingualLine[] {
  if (chapter.number === 1) {
    return [
      { id: 'ch1-1', index: 1, german: 'Der Mann ist gut.', english: 'The man is good.' },
      { id: 'ch1-2', index: 2, german: 'Die Frau ist gut.', english: 'The woman is good.' },
      { id: 'ch1-3', index: 3, german: 'Das Haus ist alt.', english: 'The house is old.' },
      { id: 'ch1-4', index: 4, german: 'Das Buch ist interessant.', english: 'The book is interesting.' },
      { id: 'ch1-5', index: 5, german: 'Der Vater trinkt Wasser.', english: 'The father drinks water.' },
      { id: 'ch1-6', index: 6, german: 'Die Mutter singt ein Lied.', english: 'The mother sings a song.' },
    ];
  }

  if (chapter.number === 2) {
    return [
      { id: 'ch2-1', index: 1, german: 'Guten Tag! Wie geht es Ihnen?', english: 'Good day! How are you?' },
      { id: 'ch2-2', index: 2, german: 'Das Haus ist groß und schön.', english: 'The house is big and beautiful.' },
      { id: 'ch2-3', index: 3, german: 'Ich spreche Deutsch.', english: 'I speak German.' },
      { id: 'ch2-4', index: 4, german: 'Der Brief liegt auf dem Tisch.', english: 'The letter lies on the table.' },
      { id: 'ch2-5', index: 5, german: 'Die Bücher sind in der Schule.', english: 'The books are in the school.' },
    ];
  }

  const tables = Array.from(doc.querySelectorAll('table'));
  if (tables.length === 0) return [];

  // Skip review chapters whose first table is a pure verb-list / exercise fill-in table
  const candidateTable = tables.find((t) => {
    const pairs = extractRawTableRows(t);
    if (pairs.length < 3) return false;
    const first = pairs[0];
    // Reject pure verb-list tables like "1. gehen | 1. to go" or grammar paradigms
    if (/^to\s+[a-z]/i.test(first[1]) && first[0].split(/\s+/).length <= 3) return false;
    if (/^(Singular|Infinitive|Positive|Group I|Nom\.|Nominative)/i.test(first[0])) return false;
    if (/_{3,}/.test(first[0]) || /_{3,}/.test(first[1])) return false;
    // Accept tables where rows contain real sentences (length >= 16 chars on average)
    const avgLen =
      pairs.slice(0, 6).reduce((sum, p) => sum + p[0].length + p[1].length, 0) /
      Math.min(6, pairs.length);
    return avgLen >= 34;
  });

  if (!candidateTable) return [];

  const rawRows = extractRawTableRows(candidateTable);
  const lines: BilingualLine[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const [rawDe, rawEn] = rawRows[i];
    if (!rawDe || !rawEn) continue;
    // Skip title header row if row 0 is just the chapter title
    if (i === 0 && isHeadingTitlePair(rawDe, rawEn)) continue;

    // Detect explicit speaker prefix like "C.:" / "E.:" / "T:"
    let speaker: string | undefined;
    let de = rawDe;
    let en = rawEn;
    const spMatch = de.match(/^([A-ZÄÖÜ][a-zäöüß]{0,12}\.?)\s*:\s*(.+)$/);
    if (spMatch) {
      speaker = spMatch[1];
      de = spMatch[2].trim();
      en = en.replace(/^([A-Z][a-z]{0,12}\.?)\s*:\s*/, '').trim();
    }

    lines.push({
      id: `ch${chapter.number}-line-${lines.length + 1}`,
      index: lines.length + 1,
      speaker,
      german: de,
      english: en,
    });
  }

  return lines;
}

/**
 * Extracts Wortschatz (Vocabulary) and Wichtige Redemittel (Everyday Expressions)
 * directly from the chapter's DOM sections, plus enriches from Chapter 46.
 */
function extractChapterVocabAndExpressions(
  chapter: BookChapter,
  doc: Document,
  book: ParsedBook
): {
  wortschatz: ChapterVocabPair[];
  redemittel: { id: string; german: string; english: string }[];
  grammarHeadings: string[];
} {
  const wortschatz: ChapterVocabPair[] = [];
  const redemittel: { id: string; german: string; english: string }[] = [];
  const grammarHeadings: string[] = [];
  const seenVocab = new Set<string>();
  const seenRedemittel = new Set<string>();

  const nodes = Array.from(doc.querySelectorAll('p, table, h2, h3, h4'));
  let mode: 'none' | 'wortschatz' | 'redemittel' | 'grammar' = 'none';

  const pushVocabEntry = (rawGerman: string, rawEnglish: string) => {
    const cleanedDe = cleanText(rawGerman).replace(/^[•·\-–—]\s*/, '');
    const cleanedEn = cleanText(rawEnglish).replace(/^[•·\-–—]\s*/, '');
    if (!cleanedDe || !cleanedEn || cleanedDe.length > 80 || cleanedEn.length > 110) return;

    // Extract article & plural if present (e.g. "der Vater pl. ¨-er" or "der Vater (fah-ter)")
    let article: ChapterVocabPair['article'];
    let plural: string | undefined;
    let working = cleanedDe;

    const artMatch = working.match(/^(der|die|das)\s+(.+)$/);
    if (artMatch) {
      article = artMatch[1] as 'der' | 'die' | 'das';
      working = artMatch[2];
    }

    const plMatch = working.match(/^(.*?)\s+pl\.\s*(.+)$/i);
    if (plMatch) {
      working = plMatch[1].trim();
      plural = `pl. ${plMatch[2].trim()}`;
    }

    // Strip old phonetic parentheticals like "(fah-ter)" from lemma
    const lemma = stripStressAccents(working.replace(/\([^)]*\)/g, '').trim()).replace(/[,;]+$/, '');
    if (!lemma || lemma.length < 2) return;

    const norm = normalizeGermanLookup(lemma);
    if (!norm || seenVocab.has(norm)) return;
    seenVocab.add(norm);

    const lexMatch = findLexiconMatch(lemma, book.lexicon);
    wortschatz.push({
      id: `ch${chapter.number}-v-${wortschatz.length}`,
      german: lemma,
      english: cleanedEn,
      article: article || lexMatch?.article,
      plural: plural || lexMatch?.genitiveAndPlural,
      pronunciation: lexMatch?.pronunciation || buildPronunciationGuide(lemma),
      source: 'chapter-wortschatz',
    });
  };

  for (const el of nodes) {
    if (el.tagName !== 'TABLE') {
      const txt = cleanText(el.textContent || '');
      if (/^WORTSCHATZ\b/i.test(txt)) {
        mode = 'wortschatz';
        continue;
      }
      if (/^WICHTIGE REDEMITTEL\b/i.test(txt)) {
        mode = 'redemittel';
        continue;
      }
      if (/^Grammar Notes/i.test(txt)) {
        mode = 'grammar';
        continue;
      }
      if (/^Exercise\s+\d+/i.test(txt)) {
        if (mode === 'wortschatz' || mode === 'redemittel') {
          mode = 'none';
        }
        continue;
      }

      // Collect grammar section subheadings like "1. Definite Article..." or "A. Use of..."
      if (
        mode === 'grammar' &&
        txt.length >= 6 &&
        txt.length <= 95 &&
        /^(\d+\.|[A-F]\.)\s+[A-Z]/.test(txt) &&
        !/^(Exercise|Example|Note:)/i.test(txt)
      ) {
        if (!grammarHeadings.includes(txt) && grammarHeadings.length < 8) {
          grammarHeadings.push(txt);
        }
      }
      continue;
    }

    // TABLE element encountered
    const rows = extractRawTableRows(el);
    if (mode === 'wortschatz') {
      // In German Made Simple, Wortschatz tables often put TWO pairs per row (left cell = noun + english, right cell = verb/adj + english)
      // OR left cell = German, right cell = English. Handle both cleanly!
      for (const [c1, c2] of rows) {
        const splitCellIntoPair = (cell: string): [string, string] | null => {
          // Pattern: "der Vater pl. ¨-er father" or "die Hauptmahlzeit pl. -en chief meal"
          const plSplit = cell.match(/^((?:der|die|das)\s+\S+(?:\s+pl\.\s*[^\s]+)?)\s+([a-z(].+)$/i);
          if (plSplit) return [plSplit[1], plSplit[2]];
          // Pattern: "telefonieren to telephone"
          const toSplit = cell.match(/^([A-Za-zÄÖÜäöüß\-]+(?:\s+[a-zäöüß]+)?)\s+(to\s+.+)$/);
          if (toSplit) return [toSplit[1], toSplit[2]];
          return null;
        };

        const p1 = splitCellIntoPair(c1);
        const p2 = splitCellIntoPair(c2);
        if (p1 || p2) {
          if (p1) pushVocabEntry(p1[0], p1[1]);
          if (p2) pushVocabEntry(p2[0], p2[1]);
        } else if (isVocabTableRow(c1, c2) || (c1.length < 45 && c2.length < 70)) {
          pushVocabEntry(c1, c2);
        }
      }
    } else if (mode === 'redemittel') {
      for (const [c1, c2] of rows) {
        if (!c1 || !c2 || c1.length > 130 || c2.length > 150) continue;
        const key = c1.toLowerCase();
        if (seenRedemittel.has(key)) continue;
        seenRedemittel.add(key);
        redemittel.push({
          id: `ch${chapter.number}-rm-${redemittel.length}`,
          german: c1,
          english: c2,
        });
      }
    }
  }

  // Supplement with Chapter 46 glossary words whose first appearance is this chapter
  const firstHere = book.lexicon.filter((e) => e.firstChapter === chapter.number);
  for (const entry of firstHere) {
    if (wortschatz.length >= 22) break;
    if (seenVocab.has(entry.normalized)) continue;
    seenVocab.add(entry.normalized);
    wortschatz.push({
      id: `ch${chapter.number}-lex-${entry.id}`,
      german: stripStressAccents(entry.german),
      english: entry.english,
      article: entry.article,
      plural: entry.genitiveAndPlural,
      pronunciation: entry.pronunciation,
      source: 'ch46-glossary',
    });
  }

  return { wortschatz, redemittel, grammarHeadings };
}

const TERMINOLOGY_CATALOG: { pattern: RegExp; term: string; plainEnglish: string }[] = [
  {
    pattern: /gender|der,\s*die,\s*das|definite article/i,
    term: 'Grammatical Gender (der / die / das)',
    plainEnglish:
      'Every German noun is masculine (der), feminine (die), or neuter (das). Always learn the article together with the noun rather than guessing from English meaning.',
  },
  {
    pattern: /nominative/i,
    term: 'Nominative Case (Nominativ)',
    plainEnglish:
      'The subject form of a noun or pronoun—the person or thing performing the verb action (e.g., "Der Mann liest").',
  },
  {
    pattern: /accusative/i,
    term: 'Accusative Case (Akkusativ)',
    plainEnglish:
      'The direct-object form—the person or thing directly receiving the verb action. Only masculine singular changes noticeably (der → den, ein → einen).',
  },
  {
    pattern: /dative/i,
    term: 'Dative Case (Dativ)',
    plainEnglish:
      'The indirect-object form—usually answering "to whom?" or "for whom?" (der/das → dem, die → der, plural → den + -n).',
  },
  {
    pattern: /genitive/i,
    term: 'Genitive Case (Genitiv)',
    plainEnglish:
      'The possessive form meaning "of" or "\'s" (des Mannes = the man\'s / of the man; der Frau = of the woman).',
  },
  {
    pattern: /modal/i,
    term: 'Modal Verbs (können, müssen, wollen, dürfen, sollen, mögen)',
    plainEnglish:
      'Helper verbs expressing ability, necessity, desire, or permission. The modal verb sits in Position 2 and pushes the main action verb (infinitive) to the very end of the sentence.',
  },
  {
    pattern: /separable|prefix/i,
    term: 'Separable-Prefix Verbs (Trennbare Verben)',
    plainEnglish:
      'Verbs like aufstehen (to get up) or einkaufen (to shop) split in the present tense: the core verb takes Position 2 and the prefix travels to the end ("Ich stehe um sechs Uhr auf").',
  },
  {
    pattern: /word order|inverted|dependent|subordinate|conjunction/i,
    term: 'German V2 & Verb-Final Word Order',
    plainEnglish:
      'In standard statements, the conjugated verb always occupies Position 2—even if a time phrase starts the sentence ("Heute lernt er Deutsch"). After subordinating conjunctions like weil or dass, the conjugated verb moves to the end.',
  },
  {
    pattern: /present perfect|conversational past|perfekt/i,
    term: 'Present Perfect (Perfekt)',
    plainEnglish:
      'Germany\'s everyday spoken past tense. Built with haben or sein in Position 2 + the past participle (often starting with ge-) at the very end ("Ich habe das Buch gelesen").',
  },
  {
    pattern: /past tense|imperfect|simple past|präteritum/i,
    term: 'Simple Past (Präteritum)',
    plainEnglish:
      'The narrative past tense used in stories, books, and news—and commonly spoken for sein (war), haben (hatte), and modal verbs (konnte, musste, wollte).',
  },
  {
    pattern: /reflexive/i,
    term: 'Reflexive Verbs (Reflexive Verben)',
    plainEnglish:
      'Verbs whose action reflects back on the subject using pronouns like mich, dich, sich, uns (e.g., "Ich freue mich" = I am glad / rejoice myself).',
  },
  {
    pattern: /adjective ending|declension/i,
    term: 'Adjective Endings (Adjektivendungen)',
    plainEnglish:
      'When an adjective stands directly before a noun ("ein guter Mann"), it takes a small ending (-e, -en, -er, -es) reflecting the noun\'s gender, case, and whether der/ein precedes it.',
  },
  {
    pattern: /future|werden/i,
    term: 'Future Tense (Futur I with werden)',
    plainEnglish:
      'Formed by placing conjugated werden in Position 2 and the main verb infinitive at the end of the clause ("Wir werden nach München fliegen").',
  },
  {
    pattern: /passive/i,
    term: 'Passive Voice (Passiv)',
    plainEnglish:
      'Focuses on the action rather than who performed it, formed with werden + past participle ("Das Haus wird gebaut" = The house is being built).',
  },
  {
    pattern: /subjunctive|konjunktiv|indirect discourse/i,
    term: 'Subjunctive Mood (Konjunktiv)',
    plainEnglish:
      'Used for polite requests ("Ich hätte gern…"), hypothetical wishes ("Wenn ich Zeit hätte…"), and reporting what someone else said (indirect discourse).',
  },
  {
    pattern: /comparative|superlative/i,
    term: 'Comparative & Superlative',
    plainEnglish:
      'Add -er to compare ("schneller als" = faster than) and am …-sten for the superlative ("am schnellsten" = fastest). Many short adjectives also add an umlaut (alt → älter).',
  },
  {
    pattern: /relative pronoun|relative clause/i,
    term: 'Relative Clauses (Relativsätze)',
    plainEnglish:
      'Clauses starting with der/die/das meaning "who/which/that" that describe a noun and send the clause\'s verb to the end.',
  },
  {
    pattern: /pronunciation|sound|vowel|umlaut|consonant/i,
    term: 'Umlauts (ä, ö, ü) & German Diphthongs',
    plainEnglish:
      'Two dots (Umlaut) shift vowel quality forward in the mouth. Spelling-to-sound rules in German are far more consistent than in English: ei = "eye", ie = "ee", w = "v", v = "f", z = "ts".',
  },
];

function buildBeginnerGuide(chapter: BookChapter): StructuredLesson['beginnerGuide'] {
  const combinedContext = `${chapter.englishTitle} ${chapter.summary} ${chapter.tocTopics.join(' ')} ${chapter.learningObjectives.join(' ')}`;
  const terminology: TerminologyItem[] = [];

  for (const item of TERMINOLOGY_CATALOG) {
    if (item.pattern.test(combinedContext) && terminology.length < 4) {
      terminology.push({ term: item.term, plainEnglish: item.plainEnglish });
    }
  }

  if (terminology.length === 0) {
    terminology.push(
      {
        term: 'Noun Capitalization',
        plainEnglish: 'In German, every noun starts with a capital letter—making nouns easy to spot inside any sentence.',
      },
      {
        term: 'Verb-Second (V2) Anchor',
        plainEnglish: 'Look for the conjugated verb in the second slot of a German statement to immediately identify the action.',
      }
    );
  }

  const overview =
    chapter.kind === 'review'
      ? `This review checkpoint consolidates the grammar, vocabulary, and everyday expressions introduced across the previous unit. Read the dialogues and review drills aloud slowly first, then compare your answers with Chapter 45.`
      : chapter.kind === 'foundation'
        ? `This foundational chapter builds your reading and pronunciation confidence before full grammar drills begin. Focus on hearing how German letters map consistently to sounds and recognizing familiar English cognates.`
        : `In Chapter ${chapter.number}, Arnold Leitner introduces new structures inside a real bilingual story first—so you see German working in natural context before examining the grammar rules. Study the German column while listening to the audio, then use the English column to confirm meaning.`;

  const keyTakeaways =
    chapter.tocTopics.length > 0
      ? chapter.tocTopics.slice(0, 5).map((t) => `Focus concept: ${t}`)
      : chapter.learningObjectives.slice(0, 4);

  return { overview, keyTakeaways, terminology };
}

/**
 * Analyzes up to 4 authentic German sentences from the chapter into a visual
 * Position 1 | Position 2 (Verb) | Middle Field | End Bracket blueprint.
 */
function buildSentenceConstructions(
  lines: BilingualLine[],
  book: ParsedBook
): SentenceSlotBreakdown[] {
  const results: SentenceSlotBreakdown[] = [];

  for (const line of lines) {
    if (results.length >= 4) break;
    // Pick the first clean declarative or question sentence of 4..14 words
    const firstSentence = line.german.split(/(?<=[.!?])\s+/)[0]?.trim() || '';
    const firstEnglish = line.english.split(/(?<=[.!?])\s+/)[0]?.trim() || line.english;
    const words = firstSentence.replace(/^[„"‚'—–-]+\s*/, '').split(/\s+/).filter(Boolean);
    if (words.length < 4 || words.length > 14) continue;
    // Avoid overly fragmented exclamations
    if (words[0].endsWith(',') && words.length < 6) continue;

    const analysis = analyzeGermanPassage(firstSentence, book);
    const isQuestion = firstSentence.endsWith('?');
    const cleanWords = words.map((w) => w.replace(/^[„"‚'—–-]+|[""'.,!?;:]+$/g, ''));

    // Heuristic split for Pos 1 vs Pos 2 (Verb) vs Middle vs End Bracket
    let pos1Count = 1;
    if (
      cleanWords.length >= 4 &&
      /^(der|die|das|den|dem|des|ein|eine|einen|einem|einer|mein|meine|sein|seine|ihr|ihre|unser|unsere|dieser|diese|dieses|herr|frau)$/i.test(
        cleanWords[0]
      )
    ) {
      pos1Count = 2;
      // e.g. "Die Familie Clark" or "Der alte Mann"
      if (
        cleanWords.length >= 5 &&
        (/^(Familie|junge|alte|kleine|große|gute|neue|deutsche|amerikanische)$/i.test(cleanWords[1]) ||
          /^[A-ZÄÖÜ]/.test(cleanWords[2]))
      ) {
        pos1Count = 3;
      }
    } else if (
      cleanWords.length >= 5 &&
      /^(in|im|am|an|auf|bei|mit|nach|vor|zu|zum|zur|um|aus|von|seit|während|eines)$/i.test(
        cleanWords[0]
      )
    ) {
      pos1Count = /^(im|am|zum|zur)$/i.test(cleanWords[0]) ? 2 : 3;
    }

    if (pos1Count >= words.length - 1) pos1Count = 1;

    const pos1Text = words.slice(0, pos1Count).join(' ');
    const verbPos2 = words[pos1Count] || '';
    const rest = words.slice(pos1Count + 1);

    // Check if the final word forms a German verbal bracket (participle, infinitive, separable prefix)
    let middleField = rest.join(' ');
    let endBracket = '—';
    const lastClean = cleanWords[cleanWords.length - 1]?.toLowerCase() || '';
    const hasEndBracket =
      rest.length >= 2 &&
      (/^ge[a-zäöüß]+(t|en)$/.test(lastClean) ||
        /^(auf|an|aus|ein|mit|vor|zu|zurück|weg|ab|hin|her|statt|weiter)$/.test(lastClean) ||
        (/en$/.test(lastClean) &&
          /^(kann|kannst|können|muss|musst|müssen|will|willst|wollen|darf|darfst|dürfen|soll|sollen|möchte|möchten|wird|werden|werde|wirst)$/i.test(
            cleanWords[pos1Count] || ''
          )));

    if (hasEndBracket) {
      endBracket = rest[rest.length - 1];
      middleField = rest.slice(0, -1).join(' ');
    }

    const firstInsight = analysis.structureInsights[0];
    results.push({
      id: `sc-${line.id}`,
      german: firstSentence,
      english: firstEnglish,
      pos1Label: isQuestion ? 'Question Opener' : 'Position 1 (Topic / Subject)',
      pos1Text,
      verbPos2,
      middleField: middleField || '—',
      endBracket,
      structureNote: firstInsight
        ? `${firstInsight.label}: ${firstInsight.detail}`
        : 'Standard German Verb-Second (V2) pattern: the conjugated verb anchors slot 2 right after the opening element.',
    });
  }

  return results;
}

export function extractStructuredLesson(chapter: BookChapter, book: ParsedBook): StructuredLesson {
  const doc = parseDoc(chapter.sanitizedHtml);
  const bilingualPassage = extractChapterBilingualPassage(chapter, doc);
  const { wortschatz, redemittel, grammarHeadings } = extractChapterVocabAndExpressions(
    chapter,
    doc,
    book
  );
  const beginnerGuide = buildBeginnerGuide(chapter);
  const sentenceConstructions = buildSentenceConstructions(bilingualPassage, book);

  const summaryPoints: string[] = [
    `Original Chapter ${chapter.number}: ${chapter.displayTitle}.`,
    ...chapter.learningObjectives.slice(0, 3),
  ];
  if (wortschatz.length > 0) {
    summaryPoints.push(
      `Key vocabulary covered: ${wortschatz
        .slice(0, 5)
        .map((w) => (w.article ? `${w.article} ${w.german}` : w.german))
        .join(', ')}.`
    );
  }

  return {
    chapterNumber: chapter.number,
    bilingualPassage,
    wortschatz,
    redemittel,
    grammarHeadings,
    beginnerGuide,
    sentenceConstructions,
    summaryPoints,
  };
}

// ---------------------------------------------------------------------------
// Authentic Textbook Dialogue Extractor (ZERO Invented Dialogues)
// ---------------------------------------------------------------------------

interface ConversationConfig {
  chapterNumber: number;
  germanTitle: string;
  englishTitle: string;
  contextNote: string;
  speakerA: { name: string; roleHint: string; voice: StudioVoiceName };
  speakerB: { name: string; roleHint: string; voice: StudioVoiceName };
  speakerC?: { name: string; roleHint: string; voice: StudioVoiceName };
  narrationRows?: number[]; // 0-based row indices in the bilingual table (after title row) that are narration
  prefixMap?: Record<string, 'A' | 'B' | 'C'>;
  /** Which speaker starts the first spoken turn ('A' or 'B') */
  firstSpeaker?: 'A' | 'B';
}

const CHAPTER_CONVERSATION_SPECS: ConversationConfig[] = [
  {
    chapterNumber: 13,
    germanTitle: 'Ein Freund von Herrn Clark',
    englishTitle: 'A Friend of Mr. Clark (Planning the Trip)',
    contextNote:
      'Authentic chapter conversation from Chapter 13 between Robert Clark (C.) and his friend Wilhelm Engel (E.), who works in the same office building.',
    speakerA: { name: 'Wilhelm Engel', roleHint: 'Friend (E.)', voice: 'Charon' },
    speakerB: { name: 'Herr Clark', roleHint: 'Mr. Clark (C.)', voice: 'Fenrir' },
    narrationRows: [0, 1, 2],
    prefixMap: { 'E.': 'A', E: 'A', 'C.': 'B', C: 'B' },
    firstSpeaker: 'A',
  },
  {
    chapterNumber: 14,
    germanTitle: 'Das Telefonat im Büro',
    englishTitle: 'A Telephone Call at the Office',
    contextNote:
      'Authentic telephone conversation from Chapter 14: Julia Graf calls Mr. Clark at his office looking for Mrs. Clark.',
    speakerA: { name: 'Herr Clark', roleHint: 'Mr. Clark', voice: 'Charon' },
    speakerB: { name: 'Frau Julia Graf', roleHint: 'Caller', voice: 'Kore' },
    narrationRows: [0, 1, 2],
    firstSpeaker: 'A',
  },
  {
    chapterNumber: 15,
    germanTitle: 'Über das Geldsystem in Europa',
    englishTitle: 'Talking About European Currency & Euros',
    contextNote:
      'Authentic German lesson conversation from Chapter 15 between tutor Herr Müller and student Herr Clark about euros, dollars, and train tickets.',
    speakerA: { name: 'Herr Müller', roleHint: 'German Tutor', voice: 'Charon' },
    speakerB: { name: 'Herr Clark', roleHint: 'Student', voice: 'Fenrir' },
    narrationRows: [0],
    firstSpeaker: 'A',
  },
  {
    chapterNumber: 19,
    germanTitle: 'Ein typischer Arbeitstag',
    englishTitle: 'A Typical Working Day',
    contextNote:
      'Authentic Q&A conversation from Chapter 19: Herr Müller asks Herr Clark about his daily routine, breakfast, commute, and workday.',
    speakerA: { name: 'Herr Müller', roleHint: 'German Tutor', voice: 'Charon' },
    speakerB: { name: 'Herr Clark', roleHint: 'Student', voice: 'Fenrir' },
    firstSpeaker: 'A',
  },
  {
    chapterNumber: 20,
    germanTitle: 'Besuch im Monat Februar',
    englishTitle: 'A Visit in February (How Is Your Family?)',
    contextNote:
      'Authentic conversation from Chapter 20: Herr Müller visits the Clarks on a snowy February evening and asks about little Anna.',
    speakerA: { name: 'Herr Clark', roleHint: 'Host', voice: 'Fenrir' },
    speakerB: { name: 'Herr Müller', roleHint: 'Guest & Tutor', voice: 'Charon' },
    narrationRows: [0, 1, 2, 3, 11, 12, 13, 14],
    firstSpeaker: 'A',
  },
  {
    chapterNumber: 27,
    germanTitle: 'Wie haben Sie den Sonntag verbracht?',
    englishTitle: 'How Did You Spend Last Sunday?',
    contextNote:
      'Authentic em-dash dialogue from Chapter 27: Herr Clark tells Herr Müller in the conversational past (Perfekt) about his family\'s Sunday.',
    speakerA: { name: 'Herr Müller', roleHint: 'German Tutor', voice: 'Charon' },
    speakerB: { name: 'Herr Clark', roleHint: 'Student', voice: 'Fenrir' },
    firstSpeaker: 'A',
  },
  {
    chapterNumber: 33,
    germanTitle: 'Die gute deutsche Küche',
    englishTitle: 'Good German Cooking',
    contextNote:
      'Authentic conversation from Chapter 33: Herr Müller introduces Herr Clark to German dishes, restaurants, and regional specialties.',
    speakerA: { name: 'Herr Müller', roleHint: 'German Tutor', voice: 'Charon' },
    speakerB: { name: 'Herr Clark', roleHint: 'Student', voice: 'Fenrir' },
    firstSpeaker: 'A',
  },
  {
    chapterNumber: 34,
    germanTitle: 'Die letzte Deutschstunde',
    englishTitle: 'The Last German Lesson Before Departure',
    contextNote:
      'Authentic farewell lesson conversation from Chapter 34 before Mr. Clark flies to Munich.',
    speakerA: { name: 'Herr Müller', roleHint: 'German Tutor', voice: 'Charon' },
    speakerB: { name: 'Herr Clark', roleHint: 'Student', voice: 'Fenrir' },
    narrationRows: [0],
    firstSpeaker: 'A',
  },
];

function stripLeadingDash(text: string): string {
  return text.replace(/^[—–-]\s*/, '').trim();
}

function buildAlternatingDialogue(
  id: string,
  chapter: BookChapter,
  kind: BookDialogue['kind'],
  germanTitle: string,
  englishTitle: string,
  contextNote: string,
  rows: [string, string][],
  speakerA: DialogueSpeaker,
  speakerB: DialogueSpeaker,
  options?: {
    narrationIndices?: Set<number>;
    prefixMap?: Record<string, 'A' | 'B'>;
    firstSpeaker?: 'A' | 'B';
  }
): BookDialogue | null {
  const turns: DialogueTurn[] = [];
  let nextSlot: 'A' | 'B' = options?.firstSpeaker || 'A';

  rows.forEach(([rawDe, rawEn], idx) => {
    const deClean = cleanText(rawDe);
    const enClean = cleanText(rawEn);
    if (!deClean || !enClean) return;

    // Check explicit speaker prefix (e.g. "T:", "C:", "E.:", "C.:")
    let forcedSlot: 'A' | 'B' | null = null;
    let de = deClean;
    let en = enClean;

    const pMatch = de.match(/^([A-ZÄÖÜ]\.?)\s*:\s*(.+)$/);
    if (pMatch && options?.prefixMap && options.prefixMap[pMatch[1]]) {
      forcedSlot = options.prefixMap[pMatch[1]];
      de = pMatch[2].trim();
      en = en.replace(/^[A-Z]\.?\s*:\s*/, '').trim();
    }

    const isNarration =
      !forcedSlot &&
      (options?.narrationIndices?.has(idx) ||
        (!de.startsWith('—') &&
          !de.startsWith('-') &&
          idx === 0 &&
          /\b(fährt|sitzt|begegnen sich|nähert sich|hat.*eine Deutschstunde)\b/i.test(de)));

    if (isNarration) {
      turns.push({
        id: `${id}-t-${turns.length}`,
        index: turns.length + 1,
        speakerId: 'narrator',
        speakerName: 'Scene Context',
        german: stripLeadingDash(de),
        english: stripLeadingDash(en),
        isNarration: true,
      });
      return;
    }

    const slot = forcedSlot || nextSlot;
    const speaker = slot === 'A' ? speakerA : speakerB;
    nextSlot = slot === 'A' ? 'B' : 'A';

    turns.push({
      id: `${id}-t-${turns.length}`,
      index: turns.length + 1,
      speakerId: speaker.id,
      speakerName: speaker.name,
      german: stripLeadingDash(de),
      english: stripLeadingDash(en),
    });
  });

  if (turns.filter((t) => !t.isNarration).length < 3) return null;

  return {
    id,
    chapterNumber: chapter.number,
    chapterTitle: chapter.displayTitle,
    kind,
    germanTitle,
    englishTitle,
    contextNote,
    speakers: [speakerA, speakerB],
    turns,
  };
}

/**
 * Extracts explicit standalone DIALOG tables from review chapters (18, 24, 30, 36, 41).
 */
function extractExplicitDialoguesFromChapter(chapter: BookChapter): BookDialogue[] {
  const doc = parseDoc(chapter.sanitizedHtml);
  const tables = Array.from(doc.querySelectorAll('table'));
  const found: BookDialogue[] = [];

  for (let tIdx = 0; tIdx < tables.length; tIdx++) {
    const table = tables[tIdx];
    const rows = extractRawTableRows(table);
    if (rows.length < 4) continue;

    // Check preceding heading element for "DIALOG 1", "DIALOG 2", "DIALOG"
    let prevText = '';
    let prev: Element | null = table.previousElementSibling;
    for (let step = 0; step < 3 && prev; step++) {
      const txt = cleanText(prev.textContent || '');
      if (txt) {
        prevText = `${txt} ${prevText}`.trim();
        if (/DIALOG/i.test(txt)) break;
      }
      prev = prev.previousElementSibling;
    }

    const firstRowText = `${rows[0][0]} ${rows[0][1]}`;
    const isExplicitDialog =
      /\b(Der erste Dialog|Der zweite Dialog|DER ERSTE DIALOG|DER ZWEITE DIALOG|DIALOG)\b/i.test(
        firstRowText
      ) || /\bDIALOG\b/i.test(prevText);

    const isCh30DashTable =
      chapter.number === 30 && rows.some(([l]) => /Wo warst du gestern Abend/i.test(l));

    if (!isExplicitDialog && !isCh30DashTable) continue;

    // Handle Ch 30's compact multi-turn single-cell dialogue rows
    if (isCh30DashTable) {
      const expanded: [string, string][] = [];
      for (const [deCell, enCell] of rows) {
        const deParts = deCell
          .split(/\s*—\s*/)
          .map((s) => s.trim())
          .filter(Boolean);
        const enParts = enCell
          .split(/\s*—\s*/)
          .map((s) => s.trim())
          .filter(Boolean);
        const count = Math.min(deParts.length, enParts.length);
        for (let k = 0; k < count; k++) {
          expanded.push([deParts[k], enParts[k]]);
        }
      }
      const dlg = buildAlternatingDialogue(
        `ch30-dialog-${tIdx}`,
        chapter,
        'explicit-dialogue',
        'Wo warst du gestern Abend?',
        'Where Were You Last Evening? (Conversational Past Practice)',
        'Authentic short conversational exchanges from Chapter 30 Review contrasting Perfekt and Präteritum.',
        expanded,
        { id: 'sp-a', name: 'Freund A', roleHint: 'Speaker A', studioVoice: 'Charon', badgeStyle: 'prussian' },
        { id: 'sp-b', name: 'Freund B', roleHint: 'Speaker B', studioVoice: 'Kore', badgeStyle: 'sage' }
      );
      if (dlg) found.push(dlg);
      continue;
    }

    // Parse title & content rows from explicit dialogue tables (Ch 18, 24, 36, 41)
    let germanTitle = '';
    let englishTitle = '';
    let startRow = 0;

    if (/Dialog/i.test(rows[0][0]) || /Dialogue/i.test(rows[0][1])) {
      germanTitle = rows[0][0]
        .replace(/^(Der erste Dialog|Der zweite Dialog|DER ERSTE DIALOG|DER ZWEITE DIALOG)\s*/i, '')
        .trim();
      englishTitle = rows[0][1]
        .replace(/^(The First Dialogue|The Second Dialogue|THE FIRST DIALOGUE|THE SECOND DIALOGUE)\s*/i, '')
        .trim();
      startRow = 1;
      // Sometimes row 1 is the actual subtitle (e.g. Ch 24 "Zwei Freunde begegnen sich auf der Straße")
      if (!germanTitle && rows[1] && !rows[1][0].startsWith('—')) {
        germanTitle = rows[1][0];
        englishTitle = rows[1][1];
        startRow = 2;
      }
    } else if (/DIALOG/i.test(prevText)) {
      if (!rows[0][0].startsWith('—') && rows[0][0].length < 60 && !/[.!?]$/.test(rows[0][0])) {
        germanTitle = rows[0][0];
        englishTitle = rows[0][1];
        startRow = 1;
      } else {
        const cleanedPrev = prevText.replace(/^.*DIALOG\s*\d*\s*/i, '').trim();
        germanTitle = cleanedPrev || `Dialog (Chapter ${chapter.number})`;
        englishTitle = /FILME/i.test(cleanedPrev)
          ? 'German or American Films?'
          : /RESTAURANT/i.test(cleanedPrev)
            ? 'At the Restaurant'
            : `Dialogue (Chapter ${chapter.number})`;
      }
    }

    if (!germanTitle) {
      germanTitle = rows[0][0].slice(0, 50);
      englishTitle = rows[0][1].slice(0, 50);
    }

    // Assign context-accurate speaker labels based on the textbook dialogue
    let speakerA: DialogueSpeaker = {
      id: 'sp-a',
      name: 'Sprecher A',
      roleHint: 'Speaker A',
      studioVoice: 'Charon',
      badgeStyle: 'prussian',
    };
    let speakerB: DialogueSpeaker = {
      id: 'sp-b',
      name: 'Sprecher B',
      roleHint: 'Speaker B',
      studioVoice: 'Kore',
      badgeStyle: 'sage',
    };
    let prefixMap: Record<string, 'A' | 'B'> | undefined;

    if (/Tankstelle/i.test(germanTitle)) {
      speakerA = {
        id: 'tankwart',
        name: 'Tankwart',
        roleHint: 'Gas Station Attendant (T.)',
        studioVoice: 'Puck',
        badgeStyle: 'prussian',
      };
      speakerB = {
        id: 'clark',
        name: 'Herr Clark',
        roleHint: 'Mr. Clark (C.)',
        studioVoice: 'Charon',
        badgeStyle: 'sage',
      };
      prefixMap = { T: 'A', 'T.': 'A', C: 'B', 'C.': 'B' };
    } else if (/Restaurant/i.test(germanTitle)) {
      speakerA = {
        id: 'kellner',
        name: 'Kellner',
        roleHint: 'Waiter',
        studioVoice: 'Charon',
        badgeStyle: 'prussian',
      };
      speakerB = {
        id: 'gast',
        name: 'Gast',
        roleHint: 'Guest',
        studioVoice: 'Kore',
        badgeStyle: 'sage',
      };
    } else if (/Autobus/i.test(germanTitle)) {
      speakerA = {
        id: 'fahrgast',
        name: 'Fahrgast',
        roleHint: 'Passenger',
        studioVoice: 'Kore',
        badgeStyle: 'prussian',
      };
      speakerB = {
        id: 'schaffner',
        name: 'Schaffner',
        roleHint: 'Bus Conductor',
        studioVoice: 'Charon',
        badgeStyle: 'sage',
      };
    } else if (/Uhr/i.test(germanTitle)) {
      speakerA = {
        id: 'gastgeber',
        name: 'Bekannter A',
        roleHint: 'Waiting Friend',
        studioVoice: 'Zephyr',
        badgeStyle: 'prussian',
      };
      speakerB = {
        id: 'besucher',
        name: 'Bekannter B',
        roleHint: 'Arriving Friend',
        studioVoice: 'Charon',
        badgeStyle: 'sage',
      };
    }

    const dlg = buildAlternatingDialogue(
      `ch${chapter.number}-explicit-${found.length + 1}`,
      chapter,
      'explicit-dialogue',
      germanTitle,
      englishTitle || germanTitle,
      `Authentic standalone textbook dialogue from Chapter ${chapter.number} (${chapter.englishTitle}).`,
      rows.slice(startRow),
      speakerA,
      speakerB,
      { prefixMap }
    );
    if (dlg) found.push(dlg);
  }

  return found;
}

/**
 * Extracts all authentic dialogues & spoken conversations from the parsed textbook.
 * Preserves original chapter sequence and never invents material.
 */
export function extractAllBookDialogues(book: ParsedBook): BookDialogue[] {
  const dialogues: BookDialogue[] = [];

  for (const chapter of book.chapters) {
    if (chapter.number > 44) continue;

    // 1. Standalone explicit DIALOG sections (Chapters 18, 24, 30, 36, 41)
    const explicit = extractExplicitDialoguesFromChapter(chapter);
    dialogues.push(...explicit);

    // 2. Spoken chapter conversations (Chapters 13, 14, 15, 19, 20, 27, 33, 34)
    const spec = CHAPTER_CONVERSATION_SPECS.find((s) => s.chapterNumber === chapter.number);
    if (spec) {
      const doc = parseDoc(chapter.sanitizedHtml);
      const firstTable = doc.querySelector('table');
      if (firstTable) {
        let rows = extractRawTableRows(firstTable);
        if (rows.length > 0 && isHeadingTitlePair(rows[0][0], rows[0][1])) {
          rows = rows.slice(1);
        }
        const speakerA: DialogueSpeaker = {
          id: 'sp-a',
          name: spec.speakerA.name,
          roleHint: spec.speakerA.roleHint,
          studioVoice: spec.speakerA.voice,
          badgeStyle: 'prussian',
        };
        const speakerB: DialogueSpeaker = {
          id: 'sp-b',
          name: spec.speakerB.name,
          roleHint: spec.speakerB.roleHint,
          studioVoice: spec.speakerB.voice,
          badgeStyle: 'sage',
        };
        const dlg = buildAlternatingDialogue(
          `ch${chapter.number}-conv`,
          chapter,
          'chapter-conversation',
          spec.germanTitle,
          spec.englishTitle,
          spec.contextNote,
          rows,
          speakerA,
          speakerB,
          {
            narrationIndices: new Set(spec.narrationRows || []),
            prefixMap: spec.prefixMap as Record<string, 'A' | 'B'> | undefined,
            firstSpeaker: spec.firstSpeaker,
          }
        );
        if (dlg) dialogues.push(dlg);
      }
    }
  }

  return dialogues;
}

export function extractDialogueKeyVocabulary(
  dialogue: BookDialogue,
  book: ParsedBook
): LexiconEntry[] {
  const seen = new Set<string>();
  const matches: LexiconEntry[] = [];
  const allGerman = dialogue.turns.map((t) => t.german).join(' ');
  const tokens = allGerman.match(/[A-Za-zÄÖÜäöüß]+/g) || [];

  for (const tok of tokens) {
    if (tok.length < 3) continue;
    const entry = findLexiconMatch(tok, book.lexicon);
    if (entry && !seen.has(entry.normalized)) {
      seen.add(entry.normalized);
      matches.push(entry);
    }
    if (matches.length >= 28) break;
  }

  return matches;
}
