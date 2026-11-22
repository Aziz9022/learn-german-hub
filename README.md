# German Made Simple — Interactive Learning Studio

An interactive German-learning textbook and personal study workspace built directly from **German Made Simple** (Arnold Leitner, Ph.D.), preserving all 48 chapters, 181 authentic textbook illustrations, 1,163-entry glossary, authentic dialogues, and 202 printed exercises (161 paired with official Chapter 45 answer keys).

## Core Learning Modules

- **Dashboard**: Overall course progress, continue-learning desk, 8-part textbook roadmap, revision reminders, saved vocabulary, difficult concepts, and quiz history.
- **Book-Based Learning Path**: Sequential path through Chapters 1–48 grouped into 6 instructional parts + reference appendices without artificial reordering.
- **German Lesson Studio**: Structured beginner lessons separating original textbook material from supplementary simple-English grammar guides, with clickable word inspection, V2 sentence construction, sentence builder, and 5-question chapter checks.
- **Dialogue & Conversation Studio**: All authentic textbook dialogues with side-by-side German/English reading, dual-speaker audio, role-play mode, sentence reconstruction, and comprehension questions.
- **Practice & Assessments Studio**: All 202 textbook exercises with forgiving German answer grading (`ä/ö/ü/ß` character bar, parentheticals, ellipsis gaps), official Chapter 45 answer key reveal, 6 Unit Checkpoint Tests, Chapter Assessments, Targeted Skill Drills, and Weak Areas queue.
- **Interactive Textbook Reader**: Full unmodified textbook HTML with adjustable typography, light/dark themes, in-book search, bookmarks, color highlights, personal annotations, and contextual German word/sentence analysis.
- **Vocabulary Studio**: Searchable textbook glossary, interactive flashcards with spaced-repetition intervals, matching games, recall tests, and German audio controls.
- **Personal Notebook & Progress Analytics**: Unified mastery matrix across Chapters 1–44, searchable notes & annotations editor, bookmarks/highlights manager, Markdown notebook export, and JSON progress backup/restore.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Optional Full-Stack Studio German Audio
When running locally with Express (`npm run dev`), setting `GEMINI_API_KEY` in `.env` enables the server-side Native German Studio TTS endpoint (`/api/tts`) for guaranteed native Hochdeutsch pronunciation across all browsers. When deployed statically (such as on GitHub Pages), the app automatically falls back to your browser's built-in `de-DE` Web Speech voices with zero configuration required.

## Publishing to GitHub Pages (GitHub Actions)

This repository includes a pre-configured GitHub Actions workflow at `.github/workflows/deploy-pages.yml`.

1. **Create a GitHub repository** and push your code to the `main` branch:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: German Made Simple Interactive Learning Studio"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
2. **Enable GitHub Pages via GitHub Actions**:
   - Open your repository on GitHub → **Settings** → **Pages**.
   - Under **Build and deployment → Source**, select **GitHub Actions**.
3. **Automatic Build & Deploy**:
   - Every push to `main` (or manual trigger under the **Actions** tab) automatically type-checks, computes the right subpath (`/<your-repo>/` or `/` for `<username>.github.io`), builds the production bundle with `404.html` and `.nojekyll`, and publishes your live site.

### Testing a Subpath Build Locally
To verify GitHub Pages subpath asset loading locally before pushing:

```bash
VITE_BASE_PATH=/german-made-simple/ npm run build
npx vite preview --base /german-made-simple/
```
