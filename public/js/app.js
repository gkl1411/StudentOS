const state = {
  data: null,
  activeNoteId: null,
  timer: { total: 25 * 60, remaining: 25 * 60, running: false, interval: null },
  ambientCtx: null,
  ambientNodes: null
};
// ---------------- Utilities ----------------

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

function formatDate(d) {
  return new Date(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function daysUntil(dateStr) {
  const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  return diff;
}

// ---------------- Theme ----------------

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('theme-icon').textContent = theme === 'dark' ? '☀' : '☾';
  localStorage.setItem('studentos-theme', theme);
}

function initTheme() {
  const saved = localStorage.getItem('studentos-theme') || (state.data && state.data.user.theme) || 'dark';
  applyTheme(saved);
  document.getElementById('theme-toggle').addEventListener('click', async () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    api('/theme', { method: 'POST', body: JSON.stringify({ theme: next }) }).catch(() => {});
  });
}

// ---------------- Settings ----------------

function renderSettings() {
  const u = state.data.user;
  document.getElementById('settings-name').value = u.name;
  document.getElementById('settings-pet-name').value = u.pet.name || '';
  document.querySelectorAll('.pet-option').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.pet === u.pet.type);
  });
  const currentTheme = document.documentElement.getAttribute('data-theme');
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeChoice === currentTheme);
  });
}

function initSettings() {
  document.querySelectorAll('.pet-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pet-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.themeChoice;
      applyTheme(theme);
      document.querySelectorAll('.theme-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      api('/theme', { method: 'POST', body: JSON.stringify({ theme }) }).catch(() => {});
    });
  });

  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const name = document.getElementById('settings-name').value.trim();
    const petName = document.getElementById('settings-pet-name').value.trim();
    const selectedPet = document.querySelector('.pet-option.selected');
    const petType = selectedPet ? selectedPet.dataset.pet : state.data.user.pet.type;
    try {
      const result = await api('/settings', {
        method: 'PUT',
        body: JSON.stringify({ name, petType, petName })
      });
      state.data.user = result.user;
      renderHeader();
      renderDashboard();
      toast('Profile saved');
    } catch (e) {
      toast(e.message || 'Could not save profile');
    }
  });
}

// ---------------- Tabs ----------------

function initTabs() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'analytics') renderAnalytics();
      if (btn.dataset.tab === 'settings') renderSettings();
    });
  });
}

// ---------------- Header / gamification ----------------

function xpForLevel(level) { return 100 + (level - 1) * 50; }

function renderHeader() {
  const u = state.data.user;
  document.getElementById('greeting-text').textContent = `Good ${partOfDay()}, ${u.name}`;
  document.getElementById('today-date').textContent = formatDate(new Date());
  document.getElementById('streak-count').textContent = u.streak;
  document.getElementById('coin-count').textContent = u.coins;

  document.getElementById('quest-level').textContent = `Lv. ${u.level}`;
  const needed = xpForLevel(u.level);
  document.getElementById('xp-current').textContent = u.xp;
  document.getElementById('xp-needed').textContent = needed;
  document.getElementById('quest-fill').style.width = `${Math.min(100, (u.xp / needed) * 100)}%`;

  const notches = document.getElementById('quest-notches');
  notches.innerHTML = '';
  for (let i = 0; i < 9; i++) notches.appendChild(document.createElement('span'));

  const petEmojiMap = { cat: '🐱', dog: '🐶', cactus: '🌵', plant: '🌱', penguin: '🐧' };
  document.getElementById('pet-emoji').textContent = petEmojiMap[u.pet.type] || '🐱';
  document.getElementById('pet-name').textContent = u.pet.name && u.pet.name.trim() ? u.pet.name : 'Name me in Settings';
  document.getElementById('pet-mood').textContent = u.pet.mood;
  document.getElementById('pet-bar-fill').style.width = `${u.pet.growth}%`;
}

function partOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

async function awardXP(action) {
  try {
    const result = await api('/xp/award', { method: 'POST', body: JSON.stringify({ action }) });
    state.data.user.xp = result.xp;
    state.data.user.level = result.level;
    state.data.user.streak = result.streak;
    state.data.user.pet = result.pet;
    renderHeader();
    if (result.leveledUp) toast(`Level up! You're now level ${result.level} 🎉`);
  } catch (e) { /* ignore */ }
}

// ---------------- Dashboard ----------------

function renderDashboard() {
  const soon = state.data.assignments.filter(a => a.status !== 'Submitted' && daysUntil(a.dueDate) <= 7);
  document.getElementById('stat-assignments').textContent = soon.length;

  const todayMinutes = state.data.focusSessions
    .filter(s => s.completedAt.slice(0, 10) === new Date().toISOString().slice(0, 10))
    .reduce((sum, s) => sum + s.minutes, 0);
  document.getElementById('stat-focus').textContent = `${todayMinutes}m`;

  const weekAgo = Date.now() - 7 * 86400000;
  const notesThisWeek = state.data.notes.filter(n => new Date(n.updatedAt).getTime() > weekAgo).length;
  document.getElementById('stat-notes').textContent = notesThisWeek;

  const list = document.getElementById('dashboard-assignments');
  list.innerHTML = '';
  const upcoming = [...state.data.assignments]
    .filter(a => a.status !== 'Submitted')
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 5);
  if (!upcoming.length) {
    list.innerHTML = '<p class="subtle">Nothing due — you\'re all caught up.</p>';
  }
  upcoming.forEach(a => {
    const row = document.createElement('div');
    row.className = 'mini-item';
    const d = daysUntil(a.dueDate);
    row.innerHTML = `<span>${a.title} <span class="subtle">— ${a.subject}</span></span>
      <span class="tag-priority ${a.priority}">${d <= 0 ? 'due today' : `${d}d left`}</span>`;
    list.appendChild(row);
  });

  const ach = document.getElementById('achievements-list');
  ach.innerHTML = '';
  state.data.achievements.forEach(a => {
    const row = document.createElement('div');
    row.className = `achievement ${a.earned ? 'earned' : ''}`;
    row.innerHTML = `<span class="icon">${a.icon}</span><span>${a.label}</span>`;
    ach.appendChild(row);
  });
}

document.addEventListener('click', async (e) => {
  if (e.target.id === 'btn-plan-day') {
    const out = document.getElementById('plan-output');
    out.textContent = 'Thinking through your day...';
    try {
      const result = await api('/ai/plan-day', { method: 'POST' });
      out.textContent = result.text;
    } catch {
      out.textContent = 'Could not generate a plan right now.';
    }
  }
});

// ---------------- Notes ----------------

function renderNotes(filter = '') {
  const grid = document.getElementById('notes-grid');
  grid.innerHTML = '';
  const q = filter.toLowerCase();
  const notes = state.data.notes.filter(n =>
    n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.subject.toLowerCase().includes(q)
  );
  if (!notes.length) {
    grid.innerHTML = '<p class="subtle">No notes yet — click "New note" to start.</p>';
    return;
  }
  notes.forEach(n => {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.style.borderLeftColor = n.color;
    card.innerHTML = `<h3>${n.pinned ? '📌 ' : ''}${escapeHtml(n.title)}</h3>
      <p>${escapeHtml(n.subject)} · ${new Date(n.updatedAt).toLocaleDateString()}</p>
      <div class="note-tags">${(n.tags || []).map(t => `<span>${escapeHtml(t)}</span>`).join('')}</div>`;
    card.addEventListener('click', () => openNote(n.id));
    grid.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function openNote(id) {
  const note = state.data.notes.find(n => n.id === id);
  state.activeNoteId = id;
  document.getElementById('note-editor').hidden = false;
  document.querySelector('.notes-layout').classList.add('editor-open');
  document.getElementById('note-title').value = note.title;
  document.getElementById('note-subject').value = note.subject;
  document.getElementById('note-color').value = note.color;
  document.getElementById('note-content').value = note.content;
  document.getElementById('btn-delete-note').hidden = false;
  document.getElementById('note-ai-output').textContent = '';
}

function newNoteDraft() {
  state.activeNoteId = null;
  document.getElementById('note-editor').hidden = false;
  document.querySelector('.notes-layout').classList.add('editor-open');
  document.getElementById('note-title').value = '';
  document.getElementById('note-subject').value = '';
  document.getElementById('note-color').value = '#7C5CFF';
  document.getElementById('note-content').value = '';
  document.getElementById('btn-delete-note').hidden = true;
  document.getElementById('note-ai-output').textContent = '';
}

async function saveNote() {
  const payload = {
    title: document.getElementById('note-title').value || 'Untitled note',
    subject: document.getElementById('note-subject').value || 'General',
    color: document.getElementById('note-color').value,
    content: document.getElementById('note-content').value
  };
  if (state.activeNoteId) {
    const updated = await api(`/notes/${state.activeNoteId}`, { method: 'PUT', body: JSON.stringify(payload) });
    const idx = state.data.notes.findIndex(n => n.id === updated.id);
    state.data.notes[idx] = updated;
  } else {
    const created = await api('/notes', { method: 'POST', body: JSON.stringify(payload) });
    state.data.notes.unshift(created);
    state.activeNoteId = created.id;
    document.getElementById('btn-delete-note').hidden = false;
    await refreshHeaderOnly();
  }
  renderNotes(document.getElementById('note-search').value);
  toast('Note saved');
}

async function refreshHeaderOnly() {
  const fresh = await api('/state');
  state.data.user = fresh.user;
  state.data.achievements = fresh.achievements;
  renderHeader();
}

function initNotes() {
  document.getElementById('btn-new-note').addEventListener('click', newNoteDraft);
  document.getElementById('btn-save-note').addEventListener('click', () => saveNote().catch(e => toast(e.message)));
  document.getElementById('note-search').addEventListener('input', (e) => renderNotes(e.target.value));

  document.getElementById('btn-delete-note').addEventListener('click', async () => {
    if (!state.activeNoteId) return;
    await api(`/notes/${state.activeNoteId}`, { method: 'DELETE' });
    state.data.notes = state.data.notes.filter(n => n.id !== state.activeNoteId);
    document.getElementById('note-editor').hidden = true;
    document.querySelector('.notes-layout').classList.remove('editor-open');
    renderNotes();
  });

  document.getElementById('btn-ai-summarize').addEventListener('click', async () => {
    const text = document.getElementById('note-content').value;
    if (!text.trim()) return toast('Write some notes first');
    const out = document.getElementById('note-ai-output');
    out.textContent = 'Summarizing...';
    try {
      const result = await api('/ai/summarize', { method: 'POST', body: JSON.stringify({ text }) });
      out.textContent = `Summary: ${result.text}`;
    } catch { out.textContent = 'Could not summarize right now.'; }
  });

  document.getElementById('btn-ai-flashcards').addEventListener('click', async () => {
    const text = document.getElementById('note-content').value;
    const subject = document.getElementById('note-subject').value || 'General';
    if (!text.trim()) return toast('Write some notes first');
    const out = document.getElementById('note-ai-output');
    out.textContent = 'Generating flashcards...';
    try {
      const result = await api('/ai/flashcards', {
        method: 'POST',
        body: JSON.stringify({ text, subject, noteId: state.activeNoteId })
      });
      state.data.flashcardDecks.unshift(result.deck);
      out.textContent = `Generated ${result.deck.cards.length} flashcards — check the Flashcards tab.`;
      toast('Flashcards ready ✨');
    } catch { out.textContent = 'Could not generate flashcards right now.'; }
  });
}

// ---------------- Assignments ----------------

function renderAssignments() {
  const tbody = document.getElementById('assignments-tbody');
  tbody.innerHTML = '';
  state.data.assignments.forEach(a => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(a.title)}</td>
      <td>${escapeHtml(a.subject)}</td>
      <td>${a.dueDate}</td>
      <td><span class="tag-priority ${a.priority}">${a.priority}</span></td>
      <td>
        <div class="progress-cell">
          <div class="progress-track"><div class="progress-fill" style="width:${a.progress}%"></div></div>
          <input type="range" min="0" max="100" value="${a.progress}" data-id="${a.id}" class="progress-slider" style="width:60px" />
        </div>
      </td>
      <td>
        <select class="status-select" data-id="${a.id}">
          <option ${a.status === 'Not Started' ? 'selected' : ''}>Not Started</option>
          <option ${a.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
          <option ${a.status === 'Submitted' ? 'selected' : ''}>Submitted</option>
        </select>
      </td>
      <td><button class="btn btn-danger" data-del="${a.id}">✕</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.progress-slider').forEach(el => {
    el.addEventListener('change', async (e) => {
      const id = e.target.dataset.id;
      const progress = Number(e.target.value);
      const updated = await api(`/assignments/${id}`, { method: 'PUT', body: JSON.stringify({ progress }) });
      Object.assign(state.data.assignments.find(a => a.id === id), updated);
      renderAssignments();
      renderDashboard();
      await refreshHeaderOnly();
    });
  });

  tbody.querySelectorAll('.status-select').forEach(el => {
    el.addEventListener('change', async (e) => {
      const id = e.target.dataset.id;
      const status = e.target.value;
      const progress = status === 'Submitted' ? 100 : status === 'Not Started' ? 0 : 50;
      const updated = await api(`/assignments/${id}`, { method: 'PUT', body: JSON.stringify({ status, progress }) });
      Object.assign(state.data.assignments.find(a => a.id === id), updated);
      renderAssignments();
      renderDashboard();
      await refreshHeaderOnly();
    });
  });

  tbody.querySelectorAll('[data-del]').forEach(el => {
    el.addEventListener('click', async (e) => {
      const id = e.target.dataset.del;
      await api(`/assignments/${id}`, { method: 'DELETE' });
      state.data.assignments = state.data.assignments.filter(a => a.id !== id);
      renderAssignments();
      renderDashboard();
    });
  });
}

function openAssignmentModal() {
  document.getElementById('new-assignment-title').value = '';
  document.getElementById('new-assignment-subject').value = '';
  document.getElementById('new-assignment-professor').value = '';
  document.getElementById('new-assignment-due').value = new Date().toISOString().slice(0, 10);
  document.getElementById('new-assignment-priority').value = 'Medium';
  document.getElementById('assignment-modal').hidden = false;
  document.getElementById('new-assignment-title').focus();
}

function closeAssignmentModal() {
  document.getElementById('assignment-modal').hidden = true;
}

function initAssignments() {
  document.getElementById('btn-new-assignment').addEventListener('click', openAssignmentModal);
  document.getElementById('close-assignment-modal').addEventListener('click', closeAssignmentModal);
  document.getElementById('btn-cancel-assignment').addEventListener('click', closeAssignmentModal);
  document.getElementById('assignment-modal').addEventListener('click', (e) => {
    if (e.target.id === 'assignment-modal') closeAssignmentModal();
  });

  document.getElementById('btn-create-assignment').addEventListener('click', async () => {
    const title = document.getElementById('new-assignment-title').value.trim();
    if (!title) return toast('Give the assignment a title');
    const payload = {
      title,
      subject: document.getElementById('new-assignment-subject').value.trim() || 'General',
      professor: document.getElementById('new-assignment-professor').value.trim(),
      dueDate: document.getElementById('new-assignment-due').value || new Date().toISOString().slice(0, 10),
      priority: document.getElementById('new-assignment-priority').value
    };
    try {
      const created = await api('/assignments', { method: 'POST', body: JSON.stringify(payload) });
      state.data.assignments.push(created);
      renderAssignments();
      renderDashboard();
      closeAssignmentModal();
      toast('Assignment added');
    } catch (e) {
      toast(e.message || 'Could not add assignment');
    }
  });
}

// ---------------- Focus / Pomodoro ----------------

function updateTimerDisplay() {
  const m = Math.floor(state.timer.remaining / 60).toString().padStart(2, '0');
  const s = (state.timer.remaining % 60).toString().padStart(2, '0');
  document.getElementById('timer-display').textContent = `${m}:${s}`;
}

function initFocus() {
  updateTimerDisplay();

  document.querySelectorAll('[data-mins]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-mins]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mins = Number(btn.dataset.mins);
      state.timer.total = mins * 60;
      state.timer.remaining = mins * 60;
      document.getElementById('timer-mode').textContent = mins <= 10 ? 'Break time' : 'Focus session';
      updateTimerDisplay();
      pauseTimer();
    });
  });

  document.getElementById('btn-timer-start').addEventListener('click', startTimer);
  document.getElementById('btn-timer-pause').addEventListener('click', pauseTimer);
  document.getElementById('btn-timer-reset').addEventListener('click', () => {
    pauseTimer();
    state.timer.remaining = state.timer.total;
    updateTimerDisplay();
  });

  document.querySelectorAll('.ambient-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.ambient-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      setAmbient(chip.dataset.sound);
    });
  });
}

function startTimer() {
  if (state.timer.running) return;
  state.timer.running = true;
  document.getElementById('btn-timer-start').hidden = true;
  document.getElementById('btn-timer-pause').hidden = false;
  state.timer.interval = setInterval(async () => {
    state.timer.remaining--;
    updateTimerDisplay();
    if (state.timer.remaining <= 0) {
      pauseTimer();
      const minutes = Math.round(state.timer.total / 60);
      toast('Session complete! +XP earned 🎉');
      try {
        const result = await api('/focus/complete', { method: 'POST', body: JSON.stringify({ minutes }) });
        state.data.user.xp = result.xp;
        state.data.user.level = result.level;
        renderHeader();
      } catch {}
      state.timer.remaining = state.timer.total;
      updateTimerDisplay();
    }
  }, 1000);
}

function pauseTimer() {
  state.timer.running = false;
  clearInterval(state.timer.interval);
  document.getElementById('btn-timer-start').hidden = false;
  document.getElementById('btn-timer-pause').hidden = true;
}

function setAmbient(sound) {
  if (state.ambientNodes) {
    state.ambientNodes.forEach(n => { try { n.stop(); } catch {} });
    state.ambientNodes = null;
  }
  if (sound === 'none') return;
  if (!state.ambientCtx) state.ambientCtx = new (window.AudioContext || window.webkitAudioContext)();
  const ctx = state.ambientCtx;
  const freqMap = { rain: 220, cafe: 180, forest: 260 };
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freqMap[sound] || 200;
  gain.gain.value = 0.02;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  state.ambientNodes = [osc];
}

// ---------------- Flashcards ----------------

function renderFlashcards() {
  const wrap = document.getElementById('flashcard-decks');
  wrap.innerHTML = '';
  if (!state.data.flashcardDecks.length) {
    wrap.innerHTML = '<p class="subtle">No flashcard decks yet. Generate some from a note!</p>';
    return;
  }
  state.data.flashcardDecks.forEach(deck => {
    const card = document.createElement('div');
    card.className = 'deck-card';
    card.innerHTML = `<h3>${escapeHtml(deck.subject)}</h3>`;
    deck.cards.forEach(c => {
      const fc = document.createElement('div');
      fc.className = 'flashcard';
      fc.innerHTML = `<div class="flashcard-inner">
          <div class="flashcard-face front">${escapeHtml(c.front)}</div>
          <div class="flashcard-face back">${escapeHtml(c.back)}</div>
        </div>`;
      fc.addEventListener('click', () => fc.classList.toggle('flipped'));
      card.appendChild(fc);
    });
    const meta = document.createElement('div');
    meta.className = 'deck-meta';
    meta.textContent = `${deck.cards.length} cards · ${new Date(deck.createdAt).toLocaleDateString()}`;
    card.appendChild(meta);
    wrap.appendChild(card);
  });
}

// ---------------- Files ----------------

function renderFiles() {
  const wrap = document.getElementById('files-by-subject');
  wrap.innerHTML = '';
  const bySubject = {};
  state.data.files.forEach(f => {
    bySubject[f.subject] = bySubject[f.subject] || [];
    bySubject[f.subject].push(f);
  });
  if (!Object.keys(bySubject).length) {
    wrap.innerHTML = '<p class="subtle">No files uploaded yet.</p>';
    return;
  }
  Object.entries(bySubject).forEach(([subject, files]) => {
    const group = document.createElement('div');
    group.className = 'subject-group';
    group.innerHTML = `<h3>${escapeHtml(subject)}</h3>`;
    const list = document.createElement('div');
    list.className = 'file-list';
    files.forEach(f => {
      const row = document.createElement('div');
      row.className = 'file-row';
      row.innerHTML = `<a href="${f.path}" target="_blank">${escapeHtml(f.name)}</a>
        <span class="subtle">${(f.size / 1024).toFixed(1)} KB</span>
        <button class="btn btn-danger" data-file-del="${f.id}">✕</button>`;
      list.appendChild(row);
    });
    group.appendChild(list);
    wrap.appendChild(group);
  });

  wrap.querySelectorAll('[data-file-del]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.fileDel;
      await api(`/files/${id}`, { method: 'DELETE' });
      state.data.files = state.data.files.filter(f => f.id !== id);
      renderFiles();
    });
  });
}

function initFiles() {
  document.getElementById('upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const subject = document.getElementById('upload-subject').value || 'General';
    const fileInput = document.getElementById('upload-file');
    if (!fileInput.files.length) return;
    const formData = new FormData();
    formData.append('subject', subject);
    formData.append('file', fileInput.files[0]);
    const res = await fetch('/api/files/upload', { method: 'POST', body: formData });
    const record = await res.json();
    state.data.files.push(record);
    renderFiles();
    e.target.reset();
    toast('File organized into ' + subject);
  });
}

// ---------------- Analytics ----------------

let focusChart, assignmentChart;

function renderAnalytics() {
  const byDay = {};
  state.data.focusSessions.forEach(s => {
    const day = s.completedAt.slice(0, 10);
    byDay[day] = (byDay[day] || 0) + s.minutes;
  });
  const days = Object.keys(byDay).sort().slice(-7);
  const minutes = days.map(d => byDay[d]);

  const ctx1 = document.getElementById('chart-focus');
  if (focusChart) focusChart.destroy();
  focusChart = new Chart(ctx1, {
    type: 'bar',
    data: { labels: days.length ? days : ['No data'], datasets: [{ label: 'Minutes', data: minutes.length ? minutes : [0], backgroundColor: '#7C5CFF' }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });

  const statuses = ['Not Started', 'In Progress', 'Submitted'];
  const counts = statuses.map(s => state.data.assignments.filter(a => a.status === s).length);
  const ctx2 = document.getElementById('chart-assignments');
  if (assignmentChart) assignmentChart.destroy();
  assignmentChart = new Chart(ctx2, {
    type: 'doughnut',
    data: { labels: statuses, datasets: [{ data: counts, backgroundColor: ['#FF6B6B', '#F2A93B', '#23B5A6'] }] },
    options: { plugins: { legend: { position: 'bottom' } } }
  });
}

// ---------------- Onboarding ----------------

function initOnboarding() {
  const modal = document.getElementById('onboarding-modal');

  if (!state.data.user.pet.name || !state.data.user.pet.name.trim()) {
    document.getElementById('onboard-name').value = state.data.user.name || '';
    modal.hidden = false;
    const defaultBtn = document.querySelector(`#onboard-pet-picker [data-pet="${state.data.user.pet.type}"]`);
    if (defaultBtn) defaultBtn.classList.add('selected');
  }

  document.querySelectorAll('#onboard-pet-picker .pet-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#onboard-pet-picker .pet-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  document.getElementById('btn-finish-onboarding').addEventListener('click', async () => {
    const name = document.getElementById('onboard-name').value.trim() || state.data.user.name;
    const petName = document.getElementById('onboard-pet-name').value.trim() || 'Buddy';
    const selected = document.querySelector('#onboard-pet-picker .pet-option.selected');
    const petType = selected ? selected.dataset.pet : state.data.user.pet.type;
    try {
      const result = await api('/settings', { method: 'PUT', body: JSON.stringify({ name, petType, petName }) });
      state.data.user = result.user;
      renderHeader();
      renderDashboard();
      modal.hidden = true;
      toast(`Welcome, ${name}! ${petName} is excited to get started.`);
    } catch (e) {
      toast(e.message || 'Could not save your profile');
    }
  });
}

// ---------------- Init ----------------

async function init() {
  state.data = await api('/state');
  initTheme();
  initTabs();
  initNotes();
  initAssignments();
  initFocus();
  initFiles();
  initSettings();
  initOnboarding();

  renderHeader();
  renderDashboard();
  renderNotes();
  renderAssignments();
  renderFlashcards();
  renderFiles();

  await awardXP('login');
}

init();
