const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const { readDB, writeDB } = require('./db');
const ai = require('./ai');

const router = express.Router();

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subject = (req.body.subject || 'General').replace(/[^a-z0-9_\- ]/gi, '');
    const dir = path.join(UPLOAD_ROOT, subject);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

// XP required to reach next level: simple curve
function xpForLevel(level) {
  return 100 + (level - 1) * 50;
}

function awardXP(db, amount) {
  db.user.xp += amount;
  let leveled = false;
  while (db.user.xp >= xpForLevel(db.user.level)) {
    db.user.xp -= xpForLevel(db.user.level);
    db.user.level += 1;
    leveled = true;
  }
  // pet grows a little with every XP gain, caps at 100
  db.user.pet.growth = Math.min(100, db.user.pet.growth + Math.round(amount / 4));
  db.user.pet.mood = db.user.pet.growth > 60 ? 'thriving' : db.user.pet.growth > 25 ? 'content' : 'curious';
  return leveled;
}

function touchStreak(db) {
  const today = new Date().toISOString().slice(0, 10);
  if (db.user.lastActiveDate === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (db.user.lastActiveDate === yesterday) {
    db.user.streak += 1;
  } else if (db.user.lastActiveDate !== today) {
    db.user.streak = 1;
  }
  db.user.lastActiveDate = today;
}

// ---------------- State ----------------

router.get('/state', (req, res) => {
  const db = readDB();
  res.json(db);
});

router.post('/theme', (req, res) => {
  const db = readDB();
  db.user.theme = req.body.theme === 'light' ? 'light' : 'dark';
  writeDB(db);
  res.json({ ok: true });
});

const VALID_PETS = ['cat', 'dog', 'cactus', 'plant', 'penguin'];

router.put('/settings', (req, res) => {
  const db = readDB();
  const { name, petType, petName } = req.body;
  if (typeof name === 'string' && name.trim()) db.user.name = name.trim().slice(0, 40);
  if (VALID_PETS.includes(petType)) db.user.pet.type = petType;
  if (typeof petName === 'string') db.user.pet.name = petName.trim().slice(0, 24);
  writeDB(db);
  res.json({ ok: true, user: db.user });
});

// ---------------- XP / Gamification ----------------

const XP_TABLE = {
  login: 5,
  note_created: 8,
  assignment_completed: 25,
  pomodoro_completed: 15,
  habit_completed: 5
};

router.post('/xp/award', (req, res) => {
  const { action } = req.body;
  const db = readDB();
  touchStreak(db);
  const amount = XP_TABLE[action] || 0;
  const leveledUp = awardXP(db, amount);
  if (db.user.streak >= 7) {
    const ach = db.achievements.find(a => a.id === 'streak7');
    if (ach) ach.earned = true;
  }
  writeDB(db);
  res.json({ xp: db.user.xp, level: db.user.level, streak: db.user.streak, leveledUp, pet: db.user.pet, gained: amount });
});

// ---------------- Notes ----------------

router.get('/notes', (req, res) => res.json(readDB().notes));

router.post('/notes', (req, res) => {
  const db = readDB();
  const note = {
    id: uuid(),
    title: req.body.title || 'Untitled note',
    subject: req.body.subject || 'General',
    color: req.body.color || '#7C5CFF',
    pinned: false,
    tags: req.body.tags || [],
    content: req.body.content || '',
    updatedAt: new Date().toISOString()
  };
  db.notes.unshift(note);
  touchStreak(db);
  awardXP(db, XP_TABLE.note_created);
  writeDB(db);
  res.json(note);
});

router.put('/notes/:id', (req, res) => {
  const db = readDB();
  const note = db.notes.find(n => n.id === req.params.id);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  Object.assign(note, req.body, { updatedAt: new Date().toISOString() });
  writeDB(db);
  res.json(note);
});

router.delete('/notes/:id', (req, res) => {
  const db = readDB();
  db.notes = db.notes.filter(n => n.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// ---------------- Assignments ----------------

router.get('/assignments', (req, res) => res.json(readDB().assignments));

router.post('/assignments', (req, res) => {
  const db = readDB();
  const a = {
    id: uuid(),
    title: req.body.title || 'Untitled assignment',
    subject: req.body.subject || 'General',
    professor: req.body.professor || '',
    dueDate: req.body.dueDate || new Date().toISOString().slice(0, 10),
    priority: req.body.priority || 'Medium',
    progress: 0,
    status: 'Not Started'
  };
  db.assignments.push(a);
  writeDB(db);
  res.json(a);
});

router.put('/assignments/:id', (req, res) => {
  const db = readDB();
  const a = db.assignments.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Assignment not found' });
  const wasIncomplete = a.status !== 'Submitted';
  Object.assign(a, req.body);
  if (a.progress >= 100) a.status = 'Submitted';
  else if (a.progress > 0) a.status = 'In Progress';

  if (wasIncomplete && a.status === 'Submitted') {
    touchStreak(db);
    awardXP(db, XP_TABLE.assignment_completed);
    const ach = db.achievements.find(x => x.id === 'first_assignment');
    if (ach) ach.earned = true;
  }
  writeDB(db);
  res.json(a);
});

router.delete('/assignments/:id', (req, res) => {
  const db = readDB();
  db.assignments = db.assignments.filter(a => a.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// ---------------- Focus / Pomodoro ----------------

router.post('/focus/complete', (req, res) => {
  const db = readDB();
  const minutes = Number(req.body.minutes) || 25;
  db.focusSessions.push({ id: uuid(), minutes, completedAt: new Date().toISOString() });
  touchStreak(db);
  const leveledUp = awardXP(db, XP_TABLE.pomodoro_completed);
  const totalMinutes = db.focusSessions.reduce((sum, s) => sum + s.minutes, 0);
  if (totalMinutes >= 600) {
    const ach = db.achievements.find(a => a.id === 'study10');
    if (ach) ach.earned = true;
  }
  if (db.focusSessions.length >= 100) {
    const ach = db.achievements.find(a => a.id === 'pomodoro100');
    if (ach) ach.earned = true;
  }
  writeDB(db);
  res.json({ xp: db.user.xp, level: db.user.level, leveledUp, totalSessions: db.focusSessions.length, totalMinutes });
});

router.get('/focus/stats', (req, res) => {
  const db = readDB();
  res.json({ sessions: db.focusSessions });
});

// ---------------- Files ----------------

router.get('/files', (req, res) => {
  const db = readDB();
  res.json(db.files);
});

router.post('/files/upload', upload.single('file'), (req, res) => {
  const db = readDB();
  const subject = (req.body.subject || 'General').replace(/[^a-z0-9_\- ]/gi, '');
  const record = {
    id: uuid(),
    name: req.file.originalname,
    subject,
    size: req.file.size,
    path: `/uploads/${subject}/${req.file.filename}`,
    uploadedAt: new Date().toISOString()
  };
  db.files.push(record);
  writeDB(db);
  res.json(record);
});

router.delete('/files/:id', (req, res) => {
  const db = readDB();
  const file = db.files.find(f => f.id === req.params.id);
  if (file) {
    const abs = path.join(__dirname, '..', file.path.replace(/^\//, ''));
    fs.unlink(abs, () => {});
  }
  db.files = db.files.filter(f => f.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// ---------------- AI ----------------

router.post('/ai/summarize', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'No text provided' });
  const result = await ai.summarizeNote(text);
  res.json(result);
});

router.post('/ai/flashcards', async (req, res) => {
  const { text, subject, noteId } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'No text provided' });
  const result = await ai.generateFlashcards(text, subject);
  const db = readDB();
  const deck = { id: uuid(), subject: subject || 'General', noteId: noteId || null, cards: result.cards, createdAt: new Date().toISOString() };
  db.flashcardDecks.unshift(deck);
  writeDB(db);
  res.json({ deck, source: result.source });
});

router.get('/flashcards', (req, res) => {
  res.json(readDB().flashcardDecks);
});

router.delete('/flashcards/:id', (req, res) => {
  const db = readDB();
  db.flashcardDecks = db.flashcardDecks.filter(d => d.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

router.post('/ai/plan-day', async (req, res) => {
  const db = readDB();
  const pending = db.assignments.filter(a => a.status !== 'Submitted');
  const totalMinutes = db.focusSessions
    .filter(s => s.completedAt.slice(0, 10) === new Date().toISOString().slice(0, 10))
    .reduce((sum, s) => sum + s.minutes, 0);
  const result = await ai.planDay(pending, totalMinutes);
  res.json(result);
});

router.get('/ai/status', (req, res) => {
  res.json({ hasKey: ai.hasKey() });
});

module.exports = router;
