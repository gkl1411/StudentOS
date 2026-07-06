const fetch = require('node-fetch');

const GEMINI_MODEL = 'gemini-2.0-flash';

function hasKey() {
  return !!process.env.GEMINI_API_KEY;
}
async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n') || '';
  return text;
}

// ---------- Fallbacks (no API key needed) ----------

function fallbackSummary(text) {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  const keep = Math.max(1, Math.ceil(sentences.length * 0.4));
  return sentences.slice(0, keep).join(' ');
}

function fallbackFlashcards(text, subject) {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15);

  return sentences.slice(0, 8).map((s, i) => {
    const words = s.replace(/[.?!]$/, '').split(' ');
    const blankIdx = Math.max(1, Math.floor(words.length / 2));
    const answer = words[blankIdx];
    const question = words.map((w, idx) => (idx === blankIdx ? 'ـــــ' : w)).join(' ');
    return {
      id: `fc_${Date.now()}_${i}`,
      front: `Fill in the blank (${subject || 'Notes'}): ${question}`,
      back: answer
    };
  });
}

// ---------- Public functions ----------

async function summarizeNote(text) {
  if (!hasKey()) return { text: fallbackSummary(text), source: 'local' };
  try {
    const prompt = `Summarize the following study notes in 2-3 concise sentences for a student reviewing before an exam:\n\n${text}`;
    const summary = await callGemini(prompt);
    return { text: summary.trim() || fallbackSummary(text), source: 'gemini' };
  } catch (err) {
    return { text: fallbackSummary(text), source: 'local', error: err.message };
  }
}

async function generateFlashcards(text, subject) {
  if (!hasKey()) return { cards: fallbackFlashcards(text, subject), source: 'local' };
  try {
    const prompt = `Create up to 8 flashcards from these study notes on ${subject || 'the subject'}. ` +
      `Respond ONLY with a JSON array, no markdown, no code fences, in this exact shape: ` +
      `[{"front": "question text", "back": "answer text"}]. Notes:\n\n${text}`;
    const raw = await callGemini(prompt);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const cards = parsed.map((c, i) => ({ id: `fc_${Date.now()}_${i}`, front: c.front, back: c.back }));
    return { cards, source: 'gemini' };
  } catch (err) {
    return { cards: fallbackFlashcards(text, subject), source: 'local', error: err.message };
  }
}

async function planDay(assignments, focusMinutesToday) {
  if (!hasKey()) {
    const sorted = [...assignments].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    const plan = sorted.slice(0, 4).map((a, i) => `${i + 1}. Work on "${a.title}" (${a.subject}) - due ${a.dueDate}`);
    return { text: plan.join('\n') || 'No pending assignments — great time for revision or a break!', source: 'local' };
  }
  try {
    const prompt = `A student has these assignments (JSON): ${JSON.stringify(assignments)}. ` +
      `They have already focused for ${focusMinutesToday} minutes today. ` +
      `Suggest a short prioritized study plan for the rest of today, as a numbered list, max 5 items, no preamble.`;
    const text = await callGemini(prompt);
    return { text: text.trim(), source: 'gemini' };
  } catch (err) {
    return { text: 'Could not reach AI planner, please try again.', source: 'local', error: err.message };
  }
}

module.exports = { summarizeNote, generateFlashcards, planDay, hasKey };
