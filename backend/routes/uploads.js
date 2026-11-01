const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Generic image storage for content written inside the app — community
// solution posts, problem statements/examples, quiz/contest question
// images. Saved to local disk, served statically; never a cloud host,
// keeping this fully offline like every other upload in the app.
const IMAGE_DIR = path.join(__dirname, '..', 'uploads', 'images');
fs.mkdirSync(IMAGE_DIR, { recursive: true });

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.mimetype)) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  },
});

router.post('/image', requireAuth, imageUpload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file uploaded (field name "image")' });
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[req.file.mimetype] || 'png';
  const filename = `${randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(IMAGE_DIR, filename), req.file.buffer);
  res.status(201).json({ url: `/uploads/images/${filename}` });
});

module.exports = router;
