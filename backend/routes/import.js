const express = require('express');
const multer = require('multer');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { extractText, parseQuizQuestions, parseProblemDocument } = require('../services/documentImport');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok =
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      /\.(pdf|docx)$/i.test(file.originalname || '');
    if (!ok) return cb(new Error('Only .pdf or .docx files are supported'));
    cb(null, true);
  },
});

// Import quiz questions from a .pdf/.docx — parsed locally, no LLM. Returns
// a pre-filled draft the professor reviews/edits before saving (#3), never
// writes to the DB directly.
router.post('/quiz', requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name "file")' });
  try {
    const text = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
    if (!text.trim()) return res.status(422).json({ error: 'Could not extract any text from that file' });
    const { questions, warnings } = parseQuizQuestions(text);
    if (questions.length === 0) {
      return res.status(422).json({ error: 'No questions could be detected. Expected a format like "Q1. ... A) ... B) ... Answer: B".' });
    }
    res.json({ questions, warnings });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to parse file' });
  }
});

// Import a problem statement/examples from a .pdf/.docx — same
// review-before-save flow as the quiz import (#19).
router.post('/problem', requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name "file")' });
  try {
    const text = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
    if (!text.trim()) return res.status(422).json({ error: 'Could not extract any text from that file' });
    const draft = parseProblemDocument(text);
    res.json({ draft });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to parse file' });
  }
});

module.exports = router;
