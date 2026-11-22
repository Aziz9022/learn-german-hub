export type NavigationView =
  | 'dashboard'
  | 'learning-path'
  | 'lessons'
  | 'dialogues'
  | 'practice'
  | 'reader-preview'
  | 'vocabulary'
  | 'source-audit';

export type ChapterKind = 'foundation' | 'lesson' | 'review' | 'reference';

export type HighlightColor = 'amber' | 'sage' | 'prussian';

export type LineSpacingMode = 'compact' | 'comfortable' | 'relaxed';

export type VocabCategory =
  | 'Noun'
  | 'Verb'
  | 'Adjective / Adverb'
  | 'Preposition'
  | 'Conjunction'
  | 'Pronoun / Expression';

export type VocabMasteryLevel = 'new' | 'learning' | 'mastered';

export interface BookUnitDefinition {
  id: string;
  order: number;
  title: string;
  subtitle: string;
  description: string;
  chapterStart: number;
  chapterEnd: number;
  reviewChapterNumber?: number;
}

export interface ChapterPedagogy {
  chapterNumber: number;
  unitId: string;
  kind: ChapterKind;
  summary: string;
  learningObjectives: string[];
  prerequisites: string[];
  estimatedMinutes: number;
}

export interface ChapterSection {
  id: string;
  label: string;
  kind: 'reading' | 'vocabulary' | 'expressions' | 'grammar' | 'exercise' | 'dialogue' | 'section';
}

export interface LexiconEntry {
  id: string;
  german: string;
  normalized: string;
  article?: 'der' | 'die' | 'das' | 'die (pl.)';
  genitiveAndPlural?: string;
  principalParts?: string;
  partOfSpeech: string;
  category: VocabCategory;
  english: string;
  pronunciation: string;
  rawEntry: string;
  sourceChapter: number;
  firstChapter?: number;
  exampleSentence?: string;
}

export interface BookChapter {
  number: number;
  anchorId: string;
  germanTitle: string | null;
  englishTitle: string;
  displayTitle: string;
  tocTopics: string[];
  unitId: string;
  kind: ChapterKind;
  summary: string;
  learningObjectives: string[];
  prerequisites: string[];
  estimatedMinutes: number;
  wordCount: number;
  imageCount: number;
  uniqueImages: string[];
  tableCount: number;
  exercises: number[];
  answerKeyedExercises: number[];
  hasWortschatz: boolean;
  hasRedemittel: boolean;
  hasLesestuck: boolean;
  hasDialogue: boolean;
  hasGrammarNotes: boolean;
  hasDrawingPlaceholder: boolean;
  sections: ChapterSection[];
  sanitizedHtml: string;
  plainText: string;
  plainExcerpt: string;
}

export interface AuditFinding {
  id: string;
  severity: 'missing' | 'warning' | 'info';
  category: 'frontmatter' | 'exercises' | 'assets' | 'formatting';
  title: string;
  details: string;
  affectedChapters?: number[];
}

export interface SourceAuditReport {
  sourceLabel: string;
  htmlFileName: string;
  htmlByteSize: number;
  cssFileName: string | null;
  cssByteSize: number | null;
  totalChapters: number;
  lessonChapters: number;
  reviewChapters: number;
  referenceChapters: number;
  totalWords: number;
  totalImageTags: number;
  uniqueImagesReferenced: number;
  resolvedImagesCount: number;
  unresolvedImages: string[];
  inlineGlyphImages: string[];
  totalExercisesInBook: number;
  highestExerciseNumber: number;
  missingExerciseNumbers: number[];
  exercisesWithAnswerKey: number;
  exercisesWithoutAnswerKey: number[];
  germanEnglishVocabCount: number;
  englishGermanVocabCount: number;
  chaptersWithDialogues: number[];
  chaptersWithLesestuck: number[];
  brokenInternalAnchors: number;
  findings: AuditFinding[];
}

export interface BookMetadata {
  title: string;
  subtitle: string;
  authorNote: string;
  publisher: string;
  copyright: string;
  eisbn: string;
  hasOriginalCover: boolean;
  fallbackIllustrationUrl: string;
  fallbackIllustrationCaption: string;
}

export interface ParsedBook {
  metadata: BookMetadata;
  units: BookUnitDefinition[];
  chapters: BookChapter[];
  lexicon: LexiconEntry[];
  audit: SourceAuditReport;
  parsedAt: string;
}

export interface StudyHistoryItem {
  chapterNumber: number;
  chapterTitle: string;
  visitedAt: string;
  action: 'opened' | 'completed' | 'flagged-difficult';
}

export interface QuizResultRecord {
  id: string;
  chapterNumber: number;
  title: string;
  score: number;
  total: number;
  completedAt: string;
}

export interface SavedVocabItem {
  id: string;
  german: string;
  english: string;
  article?: string;
  plural?: string;
  partOfSpeech?: string;
  pronunciation?: string;
  exampleSentence?: string;
  chapterNumber: number;
  savedAt: string;
}

export interface VocabProgressRecord {
  mastery: VocabMasteryLevel;
  difficult: boolean;
  reviewCount: number;
  correctCount: number;
  lastReviewedAt: string;
  nextReviewAt: string;
}

export interface ReaderPreferences {
  fontSize: number;
  lineSpacing: LineSpacingMode;
  showHighlights: boolean;
}

export interface ReaderBookmark {
  id: string;
  chapterNumber: number;
  chapterTitle: string;
  sectionId?: string;
  sectionLabel?: string;
  note?: string;
  createdAt: string;
}

export interface ReaderHighlight {
  id: string;
  chapterNumber: number;
  text: string;
  color: HighlightColor;
  createdAt: string;
}

export interface ReaderAnnotation {
  id: string;
  chapterNumber: number;
  selectedText: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExerciseAttemptRecord {
  exerciseNumber: number;
  chapterNumber: number;
  bestScore: number;
  total: number;
  attempts: number;
  completed: boolean;
  needsReview: boolean;
  lastAttemptedAt: string;
  savedResponses?: Record<string, string>;
}

export interface UserStudyState {
  lastChapterNumber: number;
  completedChapters: number[];
  inProgressChapters: number[];
  difficultChapters: number[];
  savedVocab: SavedVocabItem[];
  vocabProgress: Record<string, VocabProgressRecord>;
  exerciseProgress: Record<number, ExerciseAttemptRecord>;
  preferredGermanVoiceURI: string | null;
  quizResults: QuizResultRecord[];
  studyHistory: StudyHistoryItem[];
  chapterProgress: Record<number, number>;
  readerPreferences: ReaderPreferences;
  bookmarks: ReaderBookmark[];
  highlights: ReaderHighlight[];
  annotations: ReaderAnnotation[];
  theme: 'light' | 'dark';
}
