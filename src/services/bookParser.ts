import DOMPurify from 'dompurify';
import assetManifest from '../data/assetManifest.json';
import { BOOK_UNITS, CHAPTER_PEDAGOGY } from '../data/learningPathMetadata';
import { parseChapter46Lexicon } from './germanLinguistics';
import type {
  AuditFinding,
  BookChapter,
  BookMetadata,
  ChapterSection,
  LexiconEntry,
  ParsedBook,
  SourceAuditReport,
} from '../types/book';

/**
 * Tiny phonetic/diacritic glyphs rendered as raster JPGs inline within Chapter 2 text.
 * Identifying them ensures they render cleanly inline (height ~1em) rather than as block figures.
 */
const INLINE_GLYPH_FILES = new Set([
  '000032.jpg', // short ü
  '000086.jpg', // checkmark
  '000128.jpg', // long oo
  '000129.jpg', // long ee
  '000130.jpg', // long ä
  '000131.jpg', // short ä
  '000132.jpg', // long ö
  '000133.jpg', // capital Ö
  '000134.jpg', // short ö
  '000135.jpg', // long ü
]);

interface TocEntry {
  chapterNumber: number;
  anchorId: string;
  germanTitle: string | null;
  englishTitle: string;
  topics: string[];
}

export interface BookSourceInput {
  htmlText: string;
  htmlFileName: string;
  htmlByteSize: number;
  cssFileName: string | null;
  cssByteSize: number | null;
  imageMap: Record<string, string>;
  sourceLabel: string;
}

function cleanText(raw: string): string {
  return raw
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTitleCase(input: string): string {
  // Convert ALL-CAPS English titles cleanly while preserving acronyms & Roman/German words
  if (input !== input.toUpperCase()) return input;
  const smallWords = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
  return input
    .toLowerCase()
    .split(/\s+/)
    .map((word, idx) => {
      if (idx > 0 && smallWords.has(word)) return word;
      if (word.includes('–') || word.includes('-')) {
        return word
          .split(/([–-])/)
          .map((part) => (part.length > 0 && /[a-zäöüß]/.test(part[0]) ? part[0].toUpperCase() + part.slice(1) : part))
          .join('');
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ')
    .replace(/\bMr\./g, 'Mr.')
    .replace(/\bMrs\./g, 'Mrs.');
}

function extractTocEntries(doc: Document): {
  entries: Map<number, TocEntry>;
  hasKindleCoverLink: boolean;
  hasMissingTitlePageLink: boolean;
} {
  const entries = new Map<number, TocEntry>();
  const tocContainer = doc.getElementById('calibre_link-1');
  let hasKindleCoverLink = false;
  let hasMissingTitlePageLink = false;

  if (!tocContainer) {
    return { entries, hasKindleCoverLink, hasMissingTitlePageLink };
  }

  const allAnchors = Array.from(tocContainer.querySelectorAll('a'));
  for (const a of allAnchors) {
    const href = a.getAttribute('href') || '';
    if (href.startsWith('kindle:embed:')) hasKindleCoverLink = true;
    if (href === 'part0000.html') hasMissingTitlePageLink = true;
  }

  const children = Array.from(tocContainer.children);
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.tagName === 'P' && el.classList.contains('calibre_2')) {
      const link = el.querySelector('a');
      const chapterLabel = cleanText(el.textContent || '');
      const chMatch = chapterLabel.match(/^CHAPTER\s+(\d+)$/i);
      if (!chMatch || !link) continue;

      const chapterNumber = parseInt(chMatch[1], 10);
      const href = link.getAttribute('href') || '';
      const anchorId = href.replace(/^#/, '');

      // Next sibling <p class="calibre_5"> holds title lines
      let germanTitle: string | null = null;
      let englishTitle = '';
      const titleEl = children[i + 1];
      if (titleEl && titleEl.tagName === 'P') {
        const titleLinks = Array.from(titleEl.querySelectorAll('a'))
          .map((a) => cleanText(a.textContent || ''))
          .filter(Boolean);

        // Some chapters split English title across two links (e.g., Ch 16: "MRS. CLARK GOES SHOPPING" + "WITH HER CHILDREN")
        if (titleLinks.length === 1) {
          englishTitle = toTitleCase(titleLinks[0]);
        } else if (titleLinks.length >= 2) {
          const firstIsUpper = titleLinks[0] === titleLinks[0].toUpperCase();
          if (firstIsUpper) {
            englishTitle = toTitleCase(titleLinks.join(' '));
          } else {
            germanTitle = titleLinks[0];
            englishTitle = toTitleCase(titleLinks.slice(1).join(' '));
          }
        }
      }

      // Following <blockquote class="calibre_6"> holds em-dash separated topics (if present)
      const topics: string[] = [];
      const maybeBlockquote = children[i + 2];
      if (maybeBlockquote && maybeBlockquote.tagName === 'BLOCKQUOTE') {
        const rawTopics = cleanText(maybeBlockquote.textContent || '');
        if (rawTopics) {
          rawTopics
            .split(/\s*[—–]\s*/)
            .map((t) => t.replace(/\.$/, '').trim())
            .filter(Boolean)
            .forEach((t) => topics.push(t));
        }
      }

      entries.set(chapterNumber, {
        chapterNumber,
        anchorId,
        germanTitle,
        englishTitle: englishTitle || `Chapter ${chapterNumber}`,
        topics,
      });
    }
  }

  return { entries, hasKindleCoverLink, hasMissingTitlePageLink };
}

function extractBookMetadata(doc: Document, imageMap: Record<string, string>): BookMetadata {
  const copyrightEl = doc.getElementById('calibre_link-2');
  const copyrightText = cleanText(copyrightEl?.textContent || '');
  const eisbnMatch = copyrightText.match(/eISBN:\s*([\d-]+)/i);

  return {
    title: 'German Made Simple',
    subtitle: 'Learn to Speak and Understand German Quickly and Easily',
    authorNote: 'Arnold Leitner, Ph.D. (title page file part0000.html omitted in HTML export)',
    publisher: 'Broadway Books · Random House, Inc.',
    copyright: 'Copyright © 1965, 1985, 2006 by Broadway Books',
    eisbn: eisbnMatch ? eisbnMatch[1] : '978-0-307-43418-0',
    hasOriginalCover: false,
    fallbackIllustrationUrl: imageMap['000107.jpg'] || '',
    fallbackIllustrationCaption:
      'Brandenburg Gate illustration from Chapter 26 (used in place of the missing Kindle cover embed)',
  };
}

function extractExercisesFromText(plainText: string): number[] {
  const found = new Set<number>();
  const re = /\bExercise\s+(\d+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(plainText)) !== null) {
    found.add(parseInt(m[1], 10));
  }
  return Array.from(found).sort((a, b) => a - b);
}

export function parseBookSource(input: BookSourceInput): ParsedBook {
  const parser = new DOMParser();
  const doc = parser.parseFromString(input.htmlText, 'text/html');

  const { entries: tocEntries, hasKindleCoverLink, hasMissingTitlePageLink } = extractTocEntries(doc);
  const metadata = extractBookMetadata(doc, input.imageMap);

  // Check broken internal hash anchors across the document
  const existingIds = new Set<string>();
  doc.querySelectorAll('[id]').forEach((el) => {
    if (el.id) existingIds.add(el.id);
  });
  let brokenInternalAnchors = 0;
  doc.querySelectorAll('a[href^="#"]').forEach((a) => {
    const target = (a.getAttribute('href') || '').slice(1);
    if (target && !existingIds.has(target)) brokenInternalAnchors++;
  });

  // Collect all chapter root divs (calibre_link-3 .. calibre_link-50)
  // In the Calibre export, each chapter starts at <p id="calibre_link-N" class="calibre_7"> inside a <div class="calibre"> wrapper
  // or directly as a sibling stream. Let's extract each chapter cleanly by locating its anchor element's containing top-level div
  // or slicing sibling nodes until the next chapter anchor.
  const allAnchorEls: { chapterNumber: number; anchorId: string; el: Element }[] = [];
  for (let ch = 1; ch <= 48; ch++) {
    const anchorId = `calibre_link-${ch + 2}`;
    const el = doc.getElementById(anchorId);
    if (el) {
      allAnchorEls.push({ chapterNumber: ch, anchorId, el });
    }
  }

  // First pass: find all exercise numbers present in Chapter 45 (Answer Section, calibre_link-47)
  const answerKeySet = new Set<number>();
  const ch45Entry = allAnchorEls.find((c) => c.chapterNumber === 45);
  if (ch45Entry) {
    const container = ch45Entry.el.parentElement;
    if (container) {
      const ch45Text = extractChapterNodesHtml(ch45Entry.el, 'calibre_link-48').plainText;
      extractExercisesFromText(ch45Text).forEach((n) => answerKeySet.add(n));
    }
  }

  let totalWords = 0;
  let totalImageTags = 0;
  const uniqueImagesReferenced = new Set<string>();
  const unresolvedImages = new Set<string>();
  const allBodyExercises = new Set<number>();
  const chaptersWithDialogues: number[] = [];
  const chaptersWithLesestuck: number[] = [];
  let germanEnglishVocabCount = 0;
  let englishGermanVocabCount = 0;

  let lexicon: LexiconEntry[] = [];

  const chapters: BookChapter[] = allAnchorEls.map((item, idx) => {
    const nextAnchorId = allAnchorEls[idx + 1]?.anchorId ?? null;
    const { fragmentHtml, plainText, tableCount, vocabEntryCount } = extractChapterNodesHtml(
      item.el,
      nextAnchorId
    );

    if (item.chapterNumber === 46) {
      lexicon = parseChapter46Lexicon(fragmentHtml);
    }

    // Rewrite images/NNNNNN.jpg -> resolved asset URL and classify inline glyphs vs block figures
    const tempDiv = doc.createElement('div');
    tempDiv.innerHTML = fragmentHtml;
    const imgs = Array.from(tempDiv.querySelectorAll('img'));
    const chapterUniqueImages = new Set<string>();

    for (const img of imgs) {
      totalImageTags++;
      const rawSrc = img.getAttribute('src') || '';
      const fileName = rawSrc.split('/').pop() || rawSrc;
      uniqueImagesReferenced.add(fileName);
      chapterUniqueImages.add(fileName);

      const resolved = input.imageMap[fileName];
      if (resolved) {
        img.setAttribute('src', resolved);
      } else {
        unresolvedImages.add(fileName);
      }

      if (INLINE_GLYPH_FILES.has(fileName)) {
        img.classList.add('inline-glyph', 'invert-on-dark');
        if (!img.getAttribute('alt')) img.setAttribute('alt', 'phonetic symbol');
      } else {
        img.classList.add('block-figure');
        img.setAttribute('loading', 'lazy');
      }
    }

    // Tag & extract within-chapter section landmarks for section outline & prev/next section navigation
    const sections: ChapterSection[] = [];
    const seenSectionLabels = new Set<string>();
    const candidateParagraphs = Array.from(tempDiv.querySelectorAll('p, h1, h2, h3, h4'));

    candidateParagraphs.forEach((p, pIdx) => {
      const txt = cleanText(p.textContent || '');
      if (!txt || txt.length > 110) return;

      let kind: ChapterSection['kind'] | null = null;
      let label = txt;

      if (/^WORTSCHATZ\b/i.test(txt)) {
        kind = 'vocabulary';
        label = 'Wortschatz (Vocabulary)';
      } else if (/^WICHTIGE REDEMITTEL\b/i.test(txt)) {
        kind = 'expressions';
        label = 'Wichtige Redemittel (Everyday Expressions)';
      } else if (/^Grammar Notes/i.test(txt)) {
        kind = 'grammar';
        label = 'Grammar Notes & Practical Exercises';
      } else if (/^Exercise\s+\d+\b/i.test(txt)) {
        kind = 'exercise';
        const exMatch = txt.match(/^Exercise\s+\d+/i);
        label = exMatch ? exMatch[0] : txt;
      } else if (/^Lesestück/i.test(txt)) {
        kind = 'reading';
        label = txt.slice(0, 60);
      } else if (/^(Dialog|Dialogue|Gespräch)\b/i.test(txt)) {
        kind = 'dialogue';
        label = txt.slice(0, 60);
      } else if (
        (item.chapterNumber === 46 || item.chapterNumber === 47) &&
        /^[A-Z]$/.test(txt)
      ) {
        kind = 'section';
        label = `Letter ${txt}`;
      } else if (
        p.classList.contains('calibre_7') &&
        pIdx > 0 &&
        txt.length >= 4 &&
        txt.length <= 75
      ) {
        kind = 'section';
        label = txt;
      }

      if (kind && !seenSectionLabels.has(`${kind}:${label}`)) {
        seenSectionLabels.add(`${kind}:${label}`);
        const secId = `ch${item.chapterNumber}-sec-${sections.length}`;
        p.setAttribute('data-section-id', secId);
        sections.push({ id: secId, label, kind });
      }
    });

    // Always provide a Chapter Start landmark if there are inner sections
    if (sections.length === 0) {
      const firstEl = tempDiv.firstElementChild;
      if (firstEl) {
        const secId = `ch${item.chapterNumber}-sec-0`;
        firstEl.setAttribute('data-section-id', secId);
        sections.push({ id: secId, label: 'Chapter Reading', kind: 'reading' });
      }
    }

    const sanitizedHtml = DOMPurify.sanitize(tempDiv.innerHTML, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ['loading', 'class', 'data-section-id'],
    });

    const words = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;
    totalWords += words;

    const exercises = item.chapterNumber <= 44 ? extractExercisesFromText(plainText) : [];
    exercises.forEach((n) => allBodyExercises.add(n));
    const answerKeyedExercises = exercises.filter((n) => answerKeySet.has(n));

    const hasWortschatz = /\bWortschatz\b/i.test(plainText);
    const hasRedemittel = /Wichtige Redemittel/i.test(plainText);
    const hasLesestuck = /Lesestück/i.test(plainText);
    const hasDialogue =
      item.chapterNumber <= 44 &&
      (/\bDialog\b|\bDialogue\b|\bGespräch\b/i.test(plainText) ||
        // Also detect named speaker-turn lines (e.g. "Herr Clark:", "Frau Clark:")
        /(Herr|Frau)\s+[A-ZÄÖÜ][a-zäöüß]+\s*:/i.test(plainText));
    const hasGrammarNotes = /Grammar Note|Grammatik/i.test(plainText);
    const hasDrawingPlaceholder = /\bDRAWING\b/.test(plainText);

    if (hasDialogue) chaptersWithDialogues.push(item.chapterNumber);
    if (hasLesestuck) chaptersWithLesestuck.push(item.chapterNumber);

    if (item.chapterNumber === 46) germanEnglishVocabCount = vocabEntryCount;
    if (item.chapterNumber === 47) englishGermanVocabCount = vocabEntryCount;

    const toc = tocEntries.get(item.chapterNumber);
    const pedagogy = CHAPTER_PEDAGOGY[item.chapterNumber] || {
      chapterNumber: item.chapterNumber,
      unitId: 'part-8',
      kind: 'lesson' as const,
      summary: 'Original textbook chapter.',
      learningObjectives: ['Study the original textbook material and exercises.'],
      prerequisites: item.chapterNumber > 1 ? [`Chapter ${item.chapterNumber - 1}`] : ['None'],
      estimatedMinutes: Math.max(10, Math.round(words / 70)),
    };

    const germanTitle = toc?.germanTitle ?? null;
    const englishTitle = toc?.englishTitle ?? `Chapter ${item.chapterNumber}`;
    const displayTitle = germanTitle ? `${germanTitle} — ${englishTitle}` : englishTitle;

    return {
      number: item.chapterNumber,
      anchorId: item.anchorId,
      germanTitle,
      englishTitle,
      displayTitle,
      tocTopics: toc?.topics ?? [],
      unitId: pedagogy.unitId,
      kind: pedagogy.kind,
      summary: pedagogy.summary,
      learningObjectives: pedagogy.learningObjectives,
      prerequisites: pedagogy.prerequisites,
      estimatedMinutes: pedagogy.estimatedMinutes,
      wordCount: words,
      imageCount: imgs.length,
      uniqueImages: Array.from(chapterUniqueImages),
      tableCount,
      exercises,
      answerKeyedExercises,
      hasWortschatz,
      hasRedemittel,
      hasLesestuck,
      hasDialogue,
      hasGrammarNotes,
      hasDrawingPlaceholder,
      sections,
      sanitizedHtml,
      plainText,
      plainExcerpt: plainText.slice(0, 260) + (plainText.length > 260 ? '…' : ''),
    };
  });

  // Compute Exercise audit
  const highestExerciseNumber = allBodyExercises.size > 0 ? Math.max(...allBodyExercises) : 0;
  const missingExerciseNumbers: number[] = [];
  const exercisesWithoutAnswerKey: number[] = [];

  for (let n = 1; n <= highestExerciseNumber; n++) {
    if (!allBodyExercises.has(n)) {
      missingExerciseNumbers.push(n);
    } else if (!answerKeySet.has(n)) {
      exercisesWithoutAnswerKey.push(n);
    }
  }

  // Build transparent Source Audit Findings
  const findings: AuditFinding[] = [];

  if (hasKindleCoverLink) {
    findings.push({
      id: 'missing-cover',
      severity: 'missing',
      category: 'frontmatter',
      title: 'Original book cover image not present in export',
      details:
        'The Table of Contents links to "kindle:embed:0007?mime=image/jpg", a proprietary Kindle embed URI that was not exported into the uploaded image folder. An authentic book illustration (Brandenburg Gate, Ch. 26) is used as a clearly labeled substitute.',
    });
  }

  if (hasMissingTitlePageLink) {
    findings.push({
      id: 'missing-title-page',
      severity: 'missing',
      category: 'frontmatter',
      title: 'Title page file (part0000.html) not included',
      details:
        'The Table of Contents links to "part0000.html" for the Title Page, which was not among the uploaded files. The copyright notice (Broadway Books, 1965/1985/2006) is intact at #calibre_link-2.',
    });
  }

  if (unresolvedImages.size > 0) {
    findings.push({
      id: 'unresolved-images',
      severity: 'missing',
      category: 'assets',
      title: `${unresolvedImages.size} referenced image file(s) missing`,
      details: `Could not resolve: ${Array.from(unresolvedImages).join(', ')}.`,
    });
  } else {
    findings.push({
      id: 'all-images-resolved',
      severity: 'info',
      category: 'assets',
      title: `All ${uniqueImagesReferenced.size} unique textbook images resolved (100%)`,
      details: `Every one of the ${totalImageTags} <img> tags across the HTML book maps cleanly to the uploaded local JPG assets after normalizing hashed workspace filenames.`,
    });
  }

  if (missingExerciseNumbers.length > 0) {
    findings.push({
      id: 'skipped-exercise-numbers',
      severity: 'warning',
      category: 'exercises',
      title: `Original textbook skips Exercise ${missingExerciseNumbers.join(' and Exercise ')}`,
      details: `Chapters 1–44 contain ${allBodyExercises.size} exercises numbered 1–${highestExerciseNumber}. Numbers ${missingExerciseNumbers.join(', ')} are absent in the original source edition itself (Ch. 19 jumps from Exercise 81 to 83; Ch. 26–27 jumps from Exercise 126 to 128).`,
      affectedChapters: [19, 26, 27],
    });
  }

  findings.push({
    id: 'unkeyed-exercises',
    severity: 'warning',
    category: 'exercises',
    title: `${exercisesWithoutAnswerKey.length} exercises have no printed key in Chapter 45`,
    details: `Chapter 45 supplies official answer keys for ${answerKeySet.size} of ${allBodyExercises.size} exercises. The remaining ${exercisesWithoutAnswerKey.length} are predominantly open-ended composition, speaking, or pronunciation drills — plus Exercise 194, whose printed answer in Chapter 45 is mislabeled under "Exercise 193".`,
    affectedChapters: [41, 45],
  });

  findings.push({
    id: 'missing-ex35-ex50-drawings',
    severity: 'warning',
    category: 'assets',
    title: 'Missing visual illustration in Exercise 35 & text placeholders in Exercise 50',
    details:
      'In Chapter 10, Exercise 35 ("Was für eine Unordnung!") asks the learner to describe a messy room picture that was omitted in the HTML source. In Chapter 13, Exercise 50 contains literal placeholder labels ("DRAWING Karl", "DRAWING Marie", "DRAWING Mr./Mrs. Clark") instead of illustrations.',
    affectedChapters: [10, 13],
  });

  findings.push({
    id: 'inline-diacritic-glyphs',
    severity: 'info',
    category: 'formatting',
    title: 'Phonetic & umlaut pronunciation symbols stored as raster images',
    details:
      'Chapter 2 uses 10 tiny inline JPG images (000032.jpg, 000086.jpg, 000128.jpg–000135.jpg) for long/short vowel marks and phonetic umlauts (121 total image tags in Ch. 2). Our parser tags these as inline-glyphs so they flow smoothly inside lines of text and invert legibly in dark mode.',
    affectedChapters: [2],
  });

  const audit: SourceAuditReport = {
    sourceLabel: input.sourceLabel,
    htmlFileName: input.htmlFileName,
    htmlByteSize: input.htmlByteSize,
    cssFileName: input.cssFileName,
    cssByteSize: input.cssByteSize,
    totalChapters: chapters.length,
    lessonChapters: chapters.filter((c) => c.kind === 'lesson' || c.kind === 'foundation').length,
    reviewChapters: chapters.filter((c) => c.kind === 'review').length,
    referenceChapters: chapters.filter((c) => c.kind === 'reference').length,
    totalWords,
    totalImageTags,
    uniqueImagesReferenced: uniqueImagesReferenced.size,
    resolvedImagesCount: uniqueImagesReferenced.size - unresolvedImages.size,
    unresolvedImages: Array.from(unresolvedImages),
    inlineGlyphImages: Array.from(INLINE_GLYPH_FILES),
    totalExercisesInBook: allBodyExercises.size,
    highestExerciseNumber,
    missingExerciseNumbers,
    exercisesWithAnswerKey: answerKeySet.size,
    exercisesWithoutAnswerKey,
    germanEnglishVocabCount,
    englishGermanVocabCount,
    chaptersWithDialogues,
    chaptersWithLesestuck,
    brokenInternalAnchors,
    findings,
  };

  // Map each Chapter 46 lexicon entry to its first appearance across Chapters 1–44
  if (lexicon.length > 0) {
    const chapterTokenSets = chapters
      .filter((c) => c.number >= 1 && c.number <= 44)
      .map((c) => {
        const wordsInChapter = new Set<string>();
        const matches = c.plainText.toLowerCase().match(/[a-zäöüß]+/g);
        if (matches) {
          for (const w of matches) wordsInChapter.add(w);
        }
        return { number: c.number, tokens: wordsInChapter };
      });

    for (const entry of lexicon) {
      if (!entry.normalized) continue;
      for (const chSet of chapterTokenSets) {
        if (chSet.tokens.has(entry.normalized)) {
          entry.firstChapter = chSet.number;
          break;
        }
      }
    }
  }

  return {
    metadata,
    units: BOOK_UNITS,
    chapters,
    lexicon,
    audit,
    parsedAt: new Date().toISOString(),
  };
}

/**
 * Extracts all DOM nodes belonging to one chapter starting from its anchor element
 * up to (but not including) the next chapter anchor element.
 * Handles Calibre's nested <div class="calibre"> structure reliably.
 */
function extractChapterNodesHtml(
  anchorEl: Element,
  nextAnchorId: string | null
): { fragmentHtml: string; plainText: string; tableCount: number; vocabEntryCount: number } {
  const parts: string[] = [];
  const textParts: string[] = [];
  let tableCount = 0;
  let vocabEntryCount = 0;

  // In this Calibre HTML export, each chapter lives inside its own <div class="calibre">
  // OR shares a parent container. Walk siblings from anchorEl, and if its parent <div class="calibre">
  // ends before nextAnchorId, walk following sibling containers until one contains nextAnchorId.
  const collectFromNode = (node: Element) => {
    parts.push(node.outerHTML);
    textParts.push(node.textContent || '');
    if (node.tagName === 'TABLE') tableCount++;
    tableCount += node.querySelectorAll('table').length;
    if (node.tagName === 'P' && node.classList.contains('mbp_pagebreak')) vocabEntryCount++;
    vocabEntryCount += node.querySelectorAll('p.mbp_pagebreak').length;
  };

  let current: Element | null = anchorEl;
  while (current) {
    if (nextAnchorId && (current.id === nextAnchorId || current.querySelector(`#${nextAnchorId}`))) {
      break;
    }
    collectFromNode(current);
    current = current.nextElementSibling;
  }

  // If the chapter's parent wrapper ended before reaching nextAnchorId, check following sibling wrappers
  const parentDiv = anchorEl.parentElement;
  if (parentDiv && parentDiv.tagName === 'DIV' && parentDiv.parentElement) {
    let nextWrapper = parentDiv.nextElementSibling;
    while (nextWrapper) {
      if (nextAnchorId && (nextWrapper.id === nextAnchorId || nextWrapper.querySelector(`#${nextAnchorId}`))) {
        break;
      }
      // Stop if this wrapper contains any other chapter anchor calibre_link-3..50
      const hasAnotherChapter = Array.from(nextWrapper.querySelectorAll('[id^="calibre_link-"]')).some((el) => {
        const num = parseInt(el.id.replace('calibre_link-', ''), 10);
        return num >= 3 && num <= 50;
      });
      if (hasAnotherChapter) break;

      collectFromNode(nextWrapper);
      nextWrapper = nextWrapper.nextElementSibling;
    }
  }

  return {
    fragmentHtml: parts.join('\n'),
    plainText: cleanText(textParts.join(' ')),
    tableCount,
    vocabEntryCount,
  };
}

/**
 * Loads and parses the bundled uploaded textbook from /public/assets/aistudio/.
 */
export async function loadDefaultTextbook(): Promise<ParsedBook> {
  const htmlResp = await fetch(assetManifest.htmlUrl);
  if (!htmlResp.ok) {
    throw new Error(`Failed to fetch textbook HTML (${htmlResp.status})`);
  }
  const htmlText = await htmlResp.text();

  let cssByteSize: number | null = null;
  try {
    const cssResp = await fetch(assetManifest.cssUrl);
    if (cssResp.ok) {
      const cssText = await cssResp.text();
      cssByteSize = new Blob([cssText]).size;
    }
  } catch {
    cssByteSize = null;
  }

  return parseBookSource({
    htmlText,
    htmlFileName: 'index.html (index_e619bc8f.html)',
    htmlByteSize: new Blob([htmlText]).size,
    cssFileName: 'style.css (style_6120f5ec.css)',
    cssByteSize,
    imageMap: assetManifest.images as Record<string, string>,
    sourceLabel: 'Bundled Source · German Made Simple (Uploaded HTML + 181 Images)',
  });
}

/**
 * Parses a user-selected set of local HTML, CSS, and image files while preserving
 * relative image filenames via object URLs (multi-file import support).
 */
export async function parseImportedFileList(files: FileList): Promise<{
  book: ParsedBook;
  objectUrls: string[];
}> {
  const fileArr = Array.from(files);
  const htmlFile = fileArr.find((f) => /\.html?$/i.test(f.name));
  if (!htmlFile) {
    throw new Error('No HTML file found in your selection. Please include index.html along with its images.');
  }

  const cssFile = fileArr.find((f) => /\.css$/i.test(f.name)) || null;
  const imageMap: Record<string, string> = {};
  const objectUrls: string[] = [];

  for (const file of fileArr) {
    if (/\.(jpe?g|png|gif|webp|svg)$/i.test(file.name)) {
      const url = URL.createObjectURL(file);
      objectUrls.push(url);
      imageMap[file.name] = url;
      // Also support hashed filename normalization if uploaded with _hash suffix
      const prefixMatch = file.name.match(/^(\d{6})_.*\.(jpe?g|png|gif|webp)$/i);
      if (prefixMatch) {
        imageMap[`${prefixMatch[1]}.${prefixMatch[2].toLowerCase()}`] = url;
      }
    }
  }

  const htmlText = await htmlFile.text();
  const book = parseBookSource({
    htmlText,
    htmlFileName: htmlFile.name,
    htmlByteSize: htmlFile.size,
    cssFileName: cssFile ? cssFile.name : null,
    cssByteSize: cssFile ? cssFile.size : null,
    imageMap,
    sourceLabel: `Imported Local Bundle (${fileArr.length} files)`,
  });

  return { book, objectUrls };
}
