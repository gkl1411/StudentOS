# StudentOS — your AI study companion

A gamified student productivity hub: dashboard, notes with AI summarize + auto-generated flashcards, assignment tracker, Pomodoro focus mode, a resource vault that auto-organizes uploaded files by subject, XP/levels/streaks/pet, and an analytics page.

## Stack
- Backend: Node.js + Express, JSON file storage (no database setup needed), Multer for file uploads
- Frontend: vanilla HTML/CSS/JS, Chart.js for analytics
- AI: Google Gemini API (`gemini-2.0-flash`) for note summaries, flashcard generation, and the daily study planner — with a built-in local fallback so every feature still works with **no API key at all**

## Setup

```bash
npm install
cp .env.example .env
npm start
```

Then open **http://localhost:3000**.

If you skip the API key, the app still works end-to-end — summaries and flashcards are generated with a local heuristic instead of calling Gemini. You'll see `"source": "local"` vs `"source": "gemini"` in the AI responses so you can tell which one ran.

## What's implemented

- **Dashboard** — greeting, today's stats, upcoming deadlines, achievements, and an "AI: plan my day" button
- **Notes** — subject/color-coded notes, search, AI summarize, AI-generated flashcards straight from a note's content
- **Assignments** — add/edit/delete, progress slider, status, due-date tracking; completing one awards XP and unlocks an achievement
- **Focus Mode** — Pomodoro timer with presets (25/15/45/5 min), a simple ambient tone toggle, XP awarded per completed session
- **Flashcards** — flip-card decks grouped by subject, generated automatically from your notes
- **Resource Vault** — upload files; they're automatically organized into folders by subject on disk (`/uploads/<subject>/`)
- **Analytics** — focus minutes by day and assignment status, via Chart.js
- **Gamification** — XP curve with levels, a streak counter, a productivity pet that grows/moods change with your activity, dark/light theme toggle (persisted)

## Structure

```
server.js              Express entry point
routes/api.js           All REST endpoints (notes, assignments, focus, files, xp, ai)
routes/ai.js            Gemini integration + local fallback logic
routes/db.js            Tiny JSON-file read/write helper
data/db.json             All app data (auto-created/updated at runtime)
public/index.html        SPA shell
public/css/style.css     Design system (dark/light theme via CSS variables)
public/js/app.js         All frontend logic
uploads/                 Auto-organized uploaded files, by subject
``` 

# Future Scope of the project

