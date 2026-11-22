import type { BookChapter, ParsedBook } from '../types/book';

export type ExerciseCategory =
  | 'fill-blank'
  | 'translation'
  | 'grammar-transform'
  | 'matching'
  | 'comprehension'
  | 'open-ended';

export type SkillDrillTopic =
  | 'articles-cases'
  | 'verbs-tenses'
  | 'translation-word-order';

export interface ExtractedExerciseItem {
  id: string;
  itemNumber: string; // "1", "2", "a", etc.
  prompt: string; // Primary prompt shown to learner
  cue?: string; // Optional English/German cue (e.g. parallel table translation)
  spokenGerman?: string; // Clean German text suitable for native German audio
  officialAnswer?: string; // Official Chapter 45 answer for this item (if present)
}

export interface MatchingColumns {
  leftHeader: string;
  rightHeader: string;
  leftItems: { label: string; text: string }[];
  rightItems: { label: string; text: string }[];
}

export interface ExtractedExercise {
  exerciseNumber: number;
  chapterNumber: number;
  chapterTitle: string;
  unitId: string;
  category: ExerciseCategory;
  skillTags: SkillDrillTopic[];
  instruction: string;
  example?: string;
  items: ExtractedExerciseItem[];
  matchingColumns?: MatchingColumns;
  hasAnswerKey: boolean;
  isAutoGradable: boolean;
  officialAnswerLines: string[];
  officialAnswerRawHtml?: string;
  sourceNote?: string;
  rawHtml: string;
}

export interface GradeResult {
  status: 'correct' | 'almost' | 'incorrect';
  feedback: string;
}

export interface AssessmentQuestion {
  id: string;
  sourceLabel: string; // e.g. "Ch. 4 · Exercise 6 · Item 3"
  chapterNumber: number;
  exerciseNumber?: number;
  kind: 'typed' | 'choice';
  instruction: string;
  prompt: string;
  cue?: string;
  spokenGerman?: string;
  officialAnswer: string;
  choices?: string[];
  correctChoiceIndex?: number;
}

interface ParsedAnswerBlock {
  exerciseNumber: number;
  numberedAnswers: Record<string, string>;
  lines: string[];
  rawHtml: string;
}

function cleanText(raw: string): string {
  return raw
    .replace(/\u00A0/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function cleanGermanForAudio(text: string): string {
  return cleanText(text)
    .replace(/_{2,}/g, ' ')
    .replace(/\(\s*[^)]*\s*\)/g, ' ')
    .replace(/^\d+[a-z]?\.\s*/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function looksGerman(text: string): boolean {
  if (!text || text.length < 3) return false;
  if (/[äöüßÄÖÜ]/.test(text)) return true;
  const germanHits = (
    text.match(
      /\b(der|die|das|den|dem|des|ein|eine|einen|einem|kein|keine|ich|du|er|sie|es|wir|ihr|Sie|ist|sind|war|hat|haben|wird|werden|nicht|und|oder|mit|von|zu|zum|zur|auf|aus|bei|nach|über|unter|für|Herr|Frau|Fräulein|wie|wo|was|wer|wann|warum|heute|morgen|gestern|hier|dort|auch|sehr|schon|noch|aber|denn|weil|dass)\b/gi
    ) || []
  ).length;
  const englishHits = (
    text.match(
      /\b(the|is|are|was|were|have|has|had|this|that|these|those|with|from|into|about|which|what|where|when|why|does|did|would|could|should|will|your|their|our|complete|translate|answer|following|sentence|sentences|example|column|exercise)\b/gi
    ) || []
  ).length;
  return germanHits > englishHits && germanHits >= 1;
}

/**
 * Splits a line that may contain multiple inline numbered answers such as:
 *   "9. er 10. er" -> [["9", "er"], ["10", "er"]]
 * Only splits when subsequent numbers are strictly ascending and reasonable (<= 40).
 */
function splitInlineNumberedItems(text: string): { num: string; value: string }[] {
  const cleaned = cleanText(text);
  if (!cleaned) return [];

  const matches: { index: number; num: number; fullLen: number }[] = [];
  const regex = /(?:^|\s)(\d{1,2})\.\s+/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(cleaned)) !== null) {
    const num = Number(m[1]);
    if (num >= 1 && num <= 45) {
      const startOfNum = m.index + (m[0].startsWith(' ') ? 1 : 0);
      matches.push({ index: startOfNum, num, fullLen: m[1].length + 1 });
    }
  }

  if (matches.length === 0) return [];
  // Must start near beginning of string for item 1 of this line
  if (matches[0].index > 3) return [];

  // Filter so numbers are strictly ascending (avoid splitting dates like "14. Mai")
  const valid: typeof matches = [matches[0]];
  for (let i = 1; i < matches.length; i++) {
    const prev = valid[valid.length - 1];
    if (matches[i].num === prev.num + 1 || (matches[i].num > prev.num && matches[i].num <= prev.num + 2)) {
      valid.push(matches[i]);
    }
  }

  const results: { num: string; value: string }[] = [];
  for (let i = 0; i < valid.length; i++) {
    const cur = valid[i];
    const nextStart = i + 1 < valid.length ? valid[i + 1].index : cleaned.length;
    const rawVal = cleaned
      .slice(cur.index + cur.fullLen, nextStart)
      .trim()
      .replace(/^\s+/, '');
    if (rawVal) {
      results.push({ num: String(cur.num), value: rawVal });
    }
  }
  return results;
}

/**
 * Parses Chapter 45 (Answer Section) into a structured map of exerciseNumber -> ParsedAnswerBlock.
 */
function parseChapter45Answers(book: ParsedBook): Map<number, ParsedAnswerBlock> {
  const map = new Map<number, ParsedAnswerBlock>();
  const ch45 = book.chapters.find((c) => c.number === 45);
  if (!ch45) return map;

  const doc = new DOMParser().parseFromString(`<div>${ch45.sanitizedHtml}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return map;

  // Walk block-level elements in document order without duplicating children inside tables/lists
  const blocks: Element[] = [];
  const collectBlocks = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === 'p' || tag === 'blockquote' || tag === 'table' || tag === 'ol' || tag === 'ul' || /^h[1-6]$/.test(tag)) {
        blocks.push(child);
      } else {
        collectBlocks(child);
      }
    }
  };
  collectBlocks(root);

  let currentNum: number | null = null;
  let currentBlock: ParsedAnswerBlock | null = null;

  const flush = () => {
    if (currentNum !== null && currentBlock) {
      map.set(currentNum, currentBlock);
    }
  };

  for (const el of blocks) {
    const text = cleanText(el.textContent || '');
    if (!text) continue;

    // Detect "Exercise N" heading in Chapter 45
    const headingMatch = text.match(/^Exercise\s+(\d{1,3})\b\.?$/i);
    if (headingMatch) {
      flush();
      currentNum = Number(headingMatch[1]);
      currentBlock = {
        exerciseNumber: currentNum,
        numberedAnswers: {},
        lines: [],
        rawHtml: '',
      };
      continue;
    }

    if (!currentBlock) continue;

    currentBlock.rawHtml += el.outerHTML;
    const tag = el.tagName.toLowerCase();

    if (tag === 'ol' || tag === 'ul') {
      const lis = Array.from(el.querySelectorAll('li'));
      lis.forEach((li, idx) => {
        const liText = cleanText(li.textContent || '');
        if (!liText) return;
        currentBlock!.lines.push(liText);
        const inlineItems = splitInlineNumberedItems(liText);
        if (inlineItems.length > 0) {
          inlineItems.forEach(({ num, value }) => {
            currentBlock!.numberedAnswers[num] = value;
          });
        } else {
          currentBlock!.numberedAnswers[String(idx + 1)] = liText;
        }
      });
    } else if (tag === 'table') {
      const rows = Array.from(el.querySelectorAll('tr'));
      rows.forEach((row) => {
        const cells = Array.from(row.querySelectorAll('td, th')).map((c) => cleanText(c.textContent || ''));
        const rowText = cells.filter(Boolean).join(' — ');
        if (!rowText) return;
        currentBlock!.lines.push(rowText);
        cells.forEach((cellText) => {
          const inlineItems = splitInlineNumberedItems(cellText);
          inlineItems.forEach(({ num, value }) => {
            currentBlock!.numberedAnswers[num] = value;
          });
        });
      });
    } else {
      currentBlock.lines.push(text);
      const inlineItems = splitInlineNumberedItems(text);
      if (inlineItems.length > 0) {
        inlineItems.forEach(({ num, value }) => {
          currentBlock!.numberedAnswers[num] = value;
        });
      } else {
        // Check for lettered answers like "a. ..." or "(1d) ..."
        const matchPair = text.match(/^\(?(\d{1,2})\s*([a-z])\)?[\s.:—–-]*(.*)$/i);
        if (matchPair) {
          const num = matchPair[1];
          const letter = matchPair[2].toLowerCase();
          const rest = matchPair[3].trim();
          currentBlock.numberedAnswers[num] = rest ? `${letter} — ${rest}` : letter;
        }
      }
    }
  }
  flush();

  return map;
}

function classifyExercise(
  instruction: string,
  items: ExtractedExerciseItem[],
  hasMatching: boolean,
  hasAnswerKey: boolean
): { category: ExerciseCategory; skillTags: SkillDrillTopic[] } {
  const lowerInst = instruction.toLowerCase();
  const samplePrompts = items
    .slice(0, 5)
    .map((i) => `${i.prompt} ${i.cue || ''}`)
    .join(' ')
    .toLowerCase();

  let category: ExerciseCategory = 'grammar-transform';
  if (hasMatching || /column\s+ii|match/i.test(lowerInst)) {
    category = 'matching';
  } else if (
    /translate|translation|put into german|put into english|express in german|how would you say|auf deutsch/i.test(
      lowerInst
    )
  ) {
    category = 'translation';
  } else if (
    /lesestück|answer.*questions|fragen|beantworten|comprehension|based on the reading/i.test(
      lowerInst + ' ' + samplePrompts
    )
  ) {
    category = 'comprehension';
  } else if (
    /complete|fill in|blank|insert|supply|ergänzen/i.test(lowerInst) ||
    items.some((i) => /_{3,}/.test(i.prompt))
  ) {
    category = 'fill-blank';
  } else if (!hasAnswerKey && (/read aloud|pronounce|practice|conversation|compose|write.*dialogue|describe/i.test(lowerInst) || items.length === 0)) {
    category = 'open-ended';
  }

  const skillTags = new Set<SkillDrillTopic>();
  const combined = `${lowerInst} ${samplePrompts}`;
  if (
    /\b(article|der|die|das|ein|eine|kein|case|nominative|accusative|dative|genitive|pronoun|preposition|adjective|ending|plural|possessive|gender|declension)\b/i.test(
      combined
    )
  ) {
    skillTags.add('articles-cases');
  }
  if (
    /\b(verb|tense|present|past|perfect|imperfect|future|imperative|modal|subjunctive|passive|separable|reflexive|conjugat|participle|haben|sein|werden|infinitive|command)\b/i.test(
      combined
    )
  ) {
    skillTags.add('verbs-tenses');
  }
  if (
    category === 'translation' ||
    /\b(translate|word order|sentence|question|negat|nicht|conjunction|clause|relative|weil|dass|wenn|ob|als)\b/i.test(
      combined
    )
  ) {
    skillTags.add('translation-word-order');
  }
  if (skillTags.size === 0) {
    skillTags.add('translation-word-order');
  }

  return { category, skillTags: Array.from(skillTags) };
}

function getSpecialSourceNote(exerciseNumber: number, hasAnswerKey: boolean): string | undefined {
  if (exerciseNumber === 35) {
    return 'Source note: The printed textbook references an illustration of a messy room that was omitted from the uploaded HTML export.';
  }
  if (exerciseNumber === 50) {
    return 'Source note: The uploaded HTML contains literal "DRAWING" text placeholders instead of printed artwork for this exercise.';
  }
  if (!hasAnswerKey) {
    return 'Open-ended / self-check exercise: Chapter 45 (Answer Section) does not print a fixed answer key for this exercise.';
  }
  return undefined;
}

function isSectionBoundary(text: string): boolean {
  if (/^Exercise\s+\d{1,3}\b/i.test(text)) return true;
  if (/^(WORTSCHATZ|WICHTIGE\s+REDEMITTEL|GRAMMAR\s+NOTES|NEW\s+WORDS|USEFUL\s+EXPRESSIONS|REVIEW\s+EXERCISES)\b/i.test(text)) {
    return true;
  }
  if (/^DIALOG\s+\d+\b/i.test(text)) return true;
  // Numbered major grammar heading like "3. THE PRESENT TENSE OF HABEN"
  if (/^\d{1,2}\.\s+[A-ZÄÖÜ][A-ZÄÖÜ\s,\-–—()/'’]{4,}$/.test(text) && !/_{2,}/.test(text)) {
    return true;
  }
  return false;
}

function parseChapterExercises(
  chapter: BookChapter,
  answerMap: Map<number, ParsedAnswerBlock>
): ExtractedExercise[] {
  if (chapter.number > 44 || chapter.exercises.length === 0) return [];

  const doc = new DOMParser().parseFromString(`<div>${chapter.sanitizedHtml}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return [];

  // Flatten top-level content blocks while preserving tables and lists as single blocks
  const blocks: Element[] = [];
  const collect = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      const tag = child.tagName.toLowerCase();
      if (
        tag === 'p' ||
        tag === 'blockquote' ||
        tag === 'table' ||
        tag === 'ol' ||
        tag === 'ul' ||
        /^h[1-6]$/.test(tag)
      ) {
        blocks.push(child);
      } else {
        collect(child);
      }
    }
  };
  collect(root);

  // Locate each Exercise N start index in blocks
  const starts: { idx: number; exerciseNumber: number }[] = [];
  blocks.forEach((el, idx) => {
    const text = cleanText(el.textContent || '');
    const m = text.match(/^Exercise\s+(\d{1,3})\b\.?(?:\s|$)/i);
    if (m && text.length < 40) {
      const num = Number(m[1]);
      if (!starts.some((s) => s.exerciseNumber === num)) {
        starts.push({ idx, exerciseNumber: num });
      }
    }
  });

  const extracted: ExtractedExercise[] = [];

  for (let s = 0; s < starts.length; s++) {
    const { idx: startIdx, exerciseNumber } = starts[s];
    const nextStartIdx = s + 1 < starts.length ? starts[s + 1].idx : blocks.length;

    const slice: Element[] = [];
    for (let i = startIdx + 1; i < nextStartIdx; i++) {
      const el = blocks[i];
      const text = cleanText(el.textContent || '');
      if (!text && !el.querySelector('img')) continue;
      if (slice.length > 0 && isSectionBoundary(text)) {
        break;
      }
      slice.push(el);
    }

    const answerBlock = answerMap.get(exerciseNumber);
    const hasAnswerKey = Boolean(answerBlock && answerBlock.lines.length > 0);
    const numberedAnswers = answerBlock?.numberedAnswers || {};

    const instructionParts: string[] = [];
    let example: string | undefined;
    const items: ExtractedExerciseItem[] = [];
    let matchingColumns: MatchingColumns | undefined;
    const rawHtml = [blocks[startIdx].outerHTML, ...slice.map((e) => e.outerHTML)].join('');

    for (const el of slice) {
      const tag = el.tagName.toLowerCase();
      const text = cleanText(el.textContent || '');
      if (!text) continue;

      if (tag === 'table') {
        const rows = Array.from(el.querySelectorAll('tr'));
        const rowCells = rows.map((r) =>
          Array.from(r.querySelectorAll('td, th')).map((c) => cleanText(c.textContent || ''))
        );

        // Detect Column I / Column II matching table
        const isMatchingTable =
          rowCells.some((c) => c.length >= 2 && /^I$/i.test(c[0]) && /^II$/i.test(c[1])) ||
          rowCells.filter((c) => c.length >= 2 && /^\d{1,2}\./.test(c[0]) && /^[a-z]\./i.test(c[1])).length >= 3;

        if (isMatchingTable) {
          const leftItems: { label: string; text: string }[] = [];
          const rightItems: { label: string; text: string }[] = [];
          for (const cells of rowCells) {
            if (cells.length < 2) continue;
            if (/^I$/i.test(cells[0]) && /^II$/i.test(cells[1])) continue;
            const lm = cells[0].match(/^(\d{1,2})\.\s*(.*)$/);
            const rm = cells[1].match(/^([a-z])\.\s*(.*)$/i);
            if (lm) {
              leftItems.push({ label: lm[1], text: lm[2] });
              items.push({
                id: `ex-${exerciseNumber}-item-${lm[1]}`,
                itemNumber: lm[1],
                prompt: lm[2],
                spokenGerman: looksGerman(lm[2]) ? cleanGermanForAudio(lm[2]) : undefined,
                officialAnswer: numberedAnswers[lm[1]],
              });
            }
            if (rm) {
              rightItems.push({ label: rm[1].toLowerCase(), text: rm[2] });
            }
          }
          if (leftItems.length > 0 && rightItems.length > 0) {
            matchingColumns = {
              leftHeader: 'Column I',
              rightHeader: 'Column II',
              leftItems,
              rightItems,
            };
          }
          continue;
        }

        // Parallel 2-column numbered items (e.g., English cue in Col 1 + German fill-in-the-blank in Col 2)
        for (const cells of rowCells) {
          const nonEmpty = cells.filter(Boolean);
          if (nonEmpty.length === 2) {
            const leftMatch = nonEmpty[0].match(/^(\d{1,2})\.\s*(.+)$/);
            const rightMatch = nonEmpty[1].match(/^(\d{1,2})\.\s*(.+)$/);
            if (leftMatch && rightMatch && leftMatch[1] === rightMatch[1]) {
              const num = leftMatch[1];
              const leftBody = leftMatch[2];
              const rightBody = rightMatch[2];
              const rightHasBlank = /_{2,}/.test(rightBody);
              const prompt = rightHasBlank ? rightBody : leftBody;
              const cue = rightHasBlank ? leftBody : rightBody;
              const germanCandidate = looksGerman(rightBody)
                ? rightBody
                : looksGerman(leftBody)
                  ? leftBody
                  : undefined;
              items.push({
                id: `ex-${exerciseNumber}-item-${num}`,
                itemNumber: num,
                prompt,
                cue,
                spokenGerman: germanCandidate ? cleanGermanForAudio(germanCandidate) : undefined,
                officialAnswer: numberedAnswers[num],
              });
              continue;
            }
            // Two independent numbered items side by side (e.g. "1. ..." and "6. ...")
            if (leftMatch && rightMatch && leftMatch[1] !== rightMatch[1]) {
              for (const matchPair of [leftMatch, rightMatch]) {
                const num = matchPair[1];
                const body = matchPair[2];
                items.push({
                  id: `ex-${exerciseNumber}-item-${num}`,
                  itemNumber: num,
                  prompt: body,
                  spokenGerman: looksGerman(body) ? cleanGermanForAudio(body) : undefined,
                  officialAnswer: numberedAnswers[num],
                });
              }
              continue;
            }
          }
          // Fallback: check each cell for numbered items
          for (const cellText of nonEmpty) {
            const inline = splitInlineNumberedItems(cellText);
            for (const { num, value } of inline) {
              items.push({
                id: `ex-${exerciseNumber}-item-${num}-${items.length}`,
                itemNumber: num,
                prompt: value,
                spokenGerman: looksGerman(value) ? cleanGermanForAudio(value) : undefined,
                officialAnswer: numberedAnswers[num],
              });
            }
          }
        }
        continue;
      }

      if (tag === 'ol' || tag === 'ul') {
        const lis = Array.from(el.querySelectorAll('li'));
        lis.forEach((li, idx) => {
          const liText = cleanText(li.textContent || '');
          if (!liText) return;
          const m = liText.match(/^(\d{1,2})\.\s*(.+)$/);
          const num = m ? m[1] : String(items.length + idx + 1);
          const body = m ? m[2] : liText;
          items.push({
            id: `ex-${exerciseNumber}-item-${num}-${items.length}`,
            itemNumber: num,
            prompt: body,
            spokenGerman: looksGerman(body) ? cleanGermanForAudio(body) : undefined,
            officialAnswer: numberedAnswers[num],
          });
        });
        continue;
      }

      // Example / Beispiel line before items start
      if (items.length === 0 && /^(Example|Beispiel|Model|Muster)\b/i.test(text)) {
        example = example ? `${example} ${text}` : text;
        continue;
      }

      // Numbered paragraph / blockquote item(s)
      const inlineItems = splitInlineNumberedItems(text);
      if (inlineItems.length > 0) {
        for (const { num, value } of inlineItems) {
          items.push({
            id: `ex-${exerciseNumber}-item-${num}-${items.length}`,
            itemNumber: num,
            prompt: value,
            spokenGerman: looksGerman(value) ? cleanGermanForAudio(value) : undefined,
            officialAnswer: numberedAnswers[num],
          });
        }
        continue;
      }

      // Otherwise treat pre-item paragraphs as instructions (up to 3 concise paragraphs)
      if (items.length === 0 && instructionParts.length < 3) {
        instructionParts.push(text);
      }
    }

    // Sort items numerically if table side-by-side layout put 1,6,2,7 out of order
    const allNumeric = items.length > 1 && items.every((it) => /^\d+$/.test(it.itemNumber));
    if (allNumeric) {
      items.sort((a, b) => Number(a.itemNumber) - Number(b.itemNumber));
    }

    // Deduplicate accidentally repeated itemNumbers while preserving distinct items
    const seenIds = new Set<string>();
    const dedupedItems = items.filter((it) => {
      const key = `${it.itemNumber}:${it.prompt.slice(0, 30)}`;
      if (seenIds.has(key)) return false;
      seenIds.add(key);
      return true;
    });

    // If an exercise has an answer key with numbered items but body items didn't map 1:1 (e.g., Exercise 1 reading-translation paragraphs),
    // try positional alignment when counts match
    if (hasAnswerKey && dedupedItems.length > 0 && dedupedItems.every((i) => !i.officialAnswer)) {
      const answerKeys = Object.keys(numberedAnswers);
      if (answerKeys.length === dedupedItems.length) {
        dedupedItems.forEach((it, idx) => {
          it.officialAnswer = numberedAnswers[answerKeys[idx]];
        });
      }
    }

    const instruction =
      instructionParts.join(' ') ||
      `Complete Exercise ${exerciseNumber} from Chapter ${chapter.number}.`;

    const { category, skillTags } = classifyExercise(
      instruction,
      dedupedItems,
      Boolean(matchingColumns),
      hasAnswerKey
    );

    const gradableItemCount = dedupedItems.filter((it) => Boolean(it.officialAnswer)).length;
    const isAutoGradable = hasAnswerKey && gradableItemCount > 0;

    extracted.push({
      exerciseNumber,
      chapterNumber: chapter.number,
      chapterTitle: chapter.displayTitle,
      unitId: chapter.unitId,
      category,
      skillTags,
      instruction,
      example,
      items: dedupedItems,
      matchingColumns,
      hasAnswerKey,
      isAutoGradable,
      officialAnswerLines: answerBlock?.lines || [],
      officialAnswerRawHtml: answerBlock?.rawHtml,
      sourceNote: getSpecialSourceNote(exerciseNumber, hasAnswerKey),
      rawHtml,
    });
  }

  return extracted;
}

/**
 * Extracts all 202 authentic textbook exercises from Chapters 1–44 and pairs
 * the 161 keyed exercises with their official Chapter 45 Answer Section keys.
 */
export function extractAllBookExercises(book: ParsedBook): ExtractedExercise[] {
  const answerMap = parseChapter45Answers(book);
  const all: ExtractedExercise[] = [];

  for (const ch of book.chapters) {
    if (ch.number > 44) continue;
    all.push(...parseChapterExercises(ch, answerMap));
  }

  return all.sort((a, b) => a.exerciseNumber - b.exerciseNumber);
}

/* -------------------------------------------------------------------------- */
/* Forgiving German Answer Grader                                             */
/* -------------------------------------------------------------------------- */

function normalizeBasic(str: string): string {
  return str
    .replace(/\u00A0/g, ' ')
    .replace(/[„“”"‚‘’']/g, '')
    .replace(/[.,!?;:]+$/g, '')
    .replace(/^\d{1,2}\.\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function foldGermanDiacritics(str: string): string {
  return str
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss');
}

function foldGermanDigraphs(str: string): string {
  return str
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u')
    .replace(/ß/g, 'ss');
}

/**
 * Expands textbook answer notation into acceptable variants:
 * - "Ein (kein) Plan" -> ["ein plan", "kein plan", "ein (kein) plan", "ein kein plan"]
 * - "er / sie" or "er, sie" -> accepts variants
 * - "d — in der Vorstadt..." -> accepts "d", "1d", or full phrase
 */
function buildAcceptableVariants(official: string): string[] {
  const base = normalizeBasic(official);
  const variants = new Set<string>([base]);

  // Matching format: "d — in der Vorstadt"
  const matchLetter = base.match(/^([a-z])\s*[—–-]\s*(.+)$/);
  if (matchLetter) {
    variants.add(matchLetter[1]);
    variants.add(matchLetter[2].trim());
  }

  // Parenthetical optional or alternative word, e.g. "Ein (kein) Plan" or "er (sie)"
  const parenMatch = base.match(/^(.+?)\s*\(([^)]+)\)\s*(.*)$/);
  if (parenMatch) {
    const before = parenMatch[1].trim();
    const inside = parenMatch[2].trim();
    const after = parenMatch[3].trim();
    // Without parenthetical
    variants.add(`${before} ${after}`.replace(/\s+/g, ' ').trim());
    // Substituting the last word before paren with the parenthetical word (e.g. "ein (kein) plan" -> "kein plan")
    const beforeTokens = before.split(' ');
    const replaced = [...beforeTokens.slice(0, -1), inside, after].filter(Boolean).join(' ');
    variants.add(replaced);
    // Keeping both without parens
    variants.add(`${before} ${inside} ${after}`.replace(/\s+/g, ' ').trim());
  }

  // Slash or "or" alternatives
  if (base.includes('/')) {
    base.split('/').forEach((part) => {
      const p = part.trim();
      if (p) variants.add(p);
    });
  }

  // Semicolon-separated list: allow commas too
  if (base.includes(';')) {
    variants.add(base.replace(/;/g, ',').replace(/\s+/g, ' ').trim());
  }

  // Strip inner punctuation variant for full sentences
  for (const v of Array.from(variants)) {
    const noPunct = v.replace(/[.,!?;:—–-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (noPunct) variants.add(noPunct);
  }

  return Array.from(variants);
}

/**
 * Grades a learner's typed German or English answer against the official Chapter 45 answer key.
 */
export function gradeGermanAnswer(userInput: string, officialAnswer: string): GradeResult {
  const cleanUser = normalizeBasic(userInput);
  if (!cleanUser) {
    return { status: 'incorrect', feedback: 'Enter your answer above before checking.' };
  }

  const userNoPunct = cleanUser.replace(/[.,!?;:—–-]/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. Handle ellipsis gap answers like "habe … geholfen" or "werden ... machen"
  if (/(\u2026|\.{3})/.test(officialAnswer)) {
    const parts = officialAnswer
      .split(/\u2026|\.{3}/)
      .map((p) => normalizeBasic(p).replace(/[.,!?;:]/g, '').trim())
      .filter(Boolean);

    if (parts.length >= 2) {
      const joinedClean = parts.join(' ');
      if (userNoPunct === joinedClean) {
        return { status: 'correct', feedback: 'Exact match with Chapter 45 answer key.' };
      }
      // Check if user wrote the full sentence containing every required part in order
      let cursor = 0;
      let allInOrder = true;
      for (const part of parts) {
        const idx = userNoPunct.indexOf(part, cursor);
        if (idx === -1) {
          allInOrder = false;
          break;
        }
        cursor = idx + part.length;
      }
      if (allInOrder) {
        return { status: 'correct', feedback: 'Correct! Your response contains all required parts.' };
      }
      // Check diacritic-folded version
      const foldedUser = foldGermanDigraphs(foldGermanDiacritics(userNoPunct));
      let fCursor = 0;
      let foldedAllInOrder = true;
      for (const part of parts) {
        const fPart = foldGermanDigraphs(foldGermanDiacritics(part));
        const idx = foldedUser.indexOf(fPart, fCursor);
        if (idx === -1) {
          foldedAllInOrder = false;
          break;
        }
        fCursor = idx + fPart.length;
      }
      if (foldedAllInOrder) {
        return {
          status: 'almost',
          feedback: `Right words—watch the German umlauts/ß: "${officialAnswer}".`,
        };
      }
    }
  }

  const variants = buildAcceptableVariants(officialAnswer);

  // 2. Exact match against any normalized official variant
  if (variants.includes(cleanUser) || variants.includes(userNoPunct)) {
    return { status: 'correct', feedback: 'Correct! Matches the official Chapter 45 key.' };
  }

  // 3. Matching shorthand e.g. user typed "1d" when official is "d — ..."
  const leadingNumLetter = cleanUser.match(/^\d{1,2}\s*([a-z])$/);
  if (leadingNumLetter && variants.includes(leadingNumLetter[1])) {
    return { status: 'correct', feedback: 'Correct match!' };
  }

  // 4. Diacritic / umlaut / ß forgiving match -> "almost"
  const foldedUser = foldGermanDigraphs(foldGermanDiacritics(userNoPunct));
  for (const v of variants) {
    const foldedVariant = foldGermanDigraphs(foldGermanDiacritics(v));
    if (foldedUser && foldedUser === foldedVariant) {
      return {
        status: 'almost',
        feedback: `Almost! Check German umlauts (ä, ö, ü) or ß — official key: "${officialAnswer}".`,
      };
    }
  }

  // 5. Token overlap heuristic for long sentence translations (>= 4 words)
  const officialTokens = variants[0].split(' ').filter((w) => w.length > 1);
  if (officialTokens.length >= 4) {
    const userTokens = new Set(foldedUser.split(' '));
    const hits = officialTokens.filter((t) =>
      userTokens.has(foldGermanDigraphs(foldGermanDiacritics(t)))
    ).length;
    const ratio = hits / officialTokens.length;
    if (ratio >= 0.8) {
      return {
        status: 'almost',
        feedback: `Very close wording! Compare with the official key: "${officialAnswer}".`,
      };
    }
  }

  return {
    status: 'incorrect',
    feedback: `Official Chapter 45 answer: ${officialAnswer}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Assessment & Skill Drill Builders                                          */
/* -------------------------------------------------------------------------- */

function deterministicShuffle<T>(arr: T[], seed: number): T[] {
  const copy = [...arr];
  let s = seed || 17;
  for (let i = copy.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = s % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function toTypedAssessmentQuestion(ex: ExtractedExercise, item: ExtractedExerciseItem): AssessmentQuestion {
  return {
    id: `aq-ex-${ex.exerciseNumber}-${item.itemNumber}`,
    sourceLabel: `Ch. ${ex.chapterNumber} · Exercise ${ex.exerciseNumber} · #${item.itemNumber}`,
    chapterNumber: ex.chapterNumber,
    exerciseNumber: ex.exerciseNumber,
    kind: 'typed',
    instruction: ex.instruction,
    prompt: item.prompt,
    cue: item.cue,
    spokenGerman: item.spokenGerman,
    officialAnswer: item.officialAnswer || '',
  };
}

function buildVocabChoiceQuestions(
  chapterNumbers: number[],
  book: ParsedBook,
  maxCount: number,
  seed: number
): AssessmentQuestion[] {
  const pool = book.lexicon.filter(
    (entry) => entry.firstChapter && chapterNumbers.includes(entry.firstChapter)
  );
  const picked = deterministicShuffle(pool, seed).slice(0, maxCount);
  const allMeanings = book.lexicon.slice(0, 120).map((e) => e.english);

  const questions: AssessmentQuestion[] = [];
  picked.forEach((entry, idx) => {
    const distractors = deterministicShuffle(
      Array.from(
        new Set(allMeanings.filter((m) => m.toLowerCase() !== entry.english.toLowerCase()))
      ),
      seed + idx * 13
    ).slice(0, 3);
    if (distractors.length < 3) return;
    const choices = deterministicShuffle([entry.english, ...distractors], seed + idx * 29);
    const displayGerman = entry.article ? `${entry.article} ${entry.german}` : entry.german;
    questions.push({
      id: `aq-voc-${entry.id}-${idx}`,
      sourceLabel: `Ch. ${entry.firstChapter || chapterNumbers[0]} · Vocabulary`,
      chapterNumber: entry.firstChapter || chapterNumbers[0],
      kind: 'choice',
      instruction: 'Choose the authentic English meaning from the textbook glossary:',
      prompt: displayGerman,
      spokenGerman: displayGerman,
      officialAnswer: entry.english,
      choices,
      correctChoiceIndex: choices.indexOf(entry.english),
    });
  });

  return questions;
}

export function buildChapterAssessment(
  chapterNumber: number,
  allExercises: ExtractedExercise[],
  book: ParsedBook,
  seed = 1
): AssessmentQuestion[] {
  const chapterEx = allExercises.filter(
    (e) => e.chapterNumber === chapterNumber && e.isAutoGradable && !e.matchingColumns
  );
  const typedCandidates: AssessmentQuestion[] = [];

  for (const ex of chapterEx) {
    for (const item of ex.items) {
      if (item.officialAnswer && item.officialAnswer.length <= 95) {
        typedCandidates.push(toTypedAssessmentQuestion(ex, item));
      }
    }
  }

  const pickedTyped = deterministicShuffle(typedCandidates, chapterNumber * 41 + seed).slice(0, 7);
  const neededVocab = Math.max(0, 10 - pickedTyped.length);
  const vocabQuestions = buildVocabChoiceQuestions(
    [chapterNumber],
    book,
    neededVocab,
    chapterNumber * 19 + seed
  );

  return [...pickedTyped, ...vocabQuestions].slice(0, 10);
}

export function buildUnitAssessment(
  unitId: string,
  allExercises: ExtractedExercise[],
  book: ParsedBook,
  seed = 1
): AssessmentQuestion[] {
  const unit = book.units.find((u) => u.id === unitId);
  if (!unit) return [];

  const chapterNums: number[] = [];
  for (let n = unit.chapterStart; n <= Math.min(44, unit.chapterEnd); n++) {
    chapterNums.push(n);
  }

  const unitEx = allExercises.filter(
    (e) => e.unitId === unitId && e.isAutoGradable && !e.matchingColumns
  );

  // Sample evenly across exercises in the unit
  const typedCandidates: AssessmentQuestion[] = [];
  for (const ex of unitEx) {
    const validItems = ex.items.filter((i) => i.officialAnswer && i.officialAnswer.length <= 90);
    if (validItems.length > 0) {
      const sample = deterministicShuffle(validItems, ex.exerciseNumber * 11 + seed).slice(0, 2);
      sample.forEach((it) => typedCandidates.push(toTypedAssessmentQuestion(ex, it)));
    }
  }

  const pickedTyped = deterministicShuffle(typedCandidates, unit.order * 53 + seed).slice(0, 8);
  const vocabQuestions = buildVocabChoiceQuestions(
    chapterNums,
    book,
    Math.max(0, 12 - pickedTyped.length),
    unit.order * 37 + seed
  );

  return [...pickedTyped, ...vocabQuestions].slice(0, 12);
}

export function buildSkillDrill(
  skill: SkillDrillTopic,
  allExercises: ExtractedExercise[],
  seed = 1
): AssessmentQuestion[] {
  const matchingEx = allExercises.filter(
    (e) => e.isAutoGradable && !e.matchingColumns && e.skillTags.includes(skill)
  );
  const pool: AssessmentQuestion[] = [];
  for (const ex of matchingEx) {
    const validItems = ex.items.filter((i) => i.officialAnswer && i.officialAnswer.length <= 80);
    if (validItems.length > 0) {
      const sample = deterministicShuffle(validItems, ex.exerciseNumber * 7 + seed).slice(0, 2);
      sample.forEach((it) => pool.push(toTypedAssessmentQuestion(ex, it)));
    }
  }
  return deterministicShuffle(pool, skill.length * 97 + seed).slice(0, 10);
}
