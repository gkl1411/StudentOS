require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const apiRouter = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOAD_ROOT = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(UPLOAD_ROOT));
app.use('/api', apiRouter);
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`StudentOS running at http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.log('No GEMINI_API_KEY set — AI features will use local fallback logic. Add one to .env to enable real Gemini responses.');
  }
});