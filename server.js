const express = require('express');
const path = require('path');
const multer = require('multer');
const yauzl = require('yauzl');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const CHAT_PROVIDERS = Object.freeze({
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions'
});

const MAX_ZIP_BYTES = 10 * 1024 * 1024;
const MAX_SOURCE_FILES = 40;
const MAX_ONE_SOURCE_BYTES = 32 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 120 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.cs', '.css', '.csv', '.go', '.h', '.html', '.java', '.js', '.jsx',
  '.json', '.kt', '.md', '.mjs', '.php', '.py', '.rb', '.rs', '.sh', '.sql', '.svg', '.swift',
  '.toml', '.ts', '.tsx', '.txt', '.vue', '.xml', '.yaml', '.yml', '.gradle', '.properties',
  '.env.example', '.gitignore'
]);
const EXCLUDED_DIRS = new Set([
  '.git', '.hg', '.svn', 'node_modules', 'vendor', 'dist', 'build', 'coverage', '.next',
  '.nuxt', '.output', '.venv', 'venv', 'target', '__pycache__'
]);

app.disable('x-powered-by');
app.use(express.json({ limit: '8mb' }));

// The API key is supplied by the user on each request. This server does not save API keys.
app.post('/api/chat', async (req, res) => {
  const body = req.body || {};
  const provider = String(body.provider || '').toLowerCase();
  const endpoint = CHAT_PROVIDERS[provider];
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const model = typeof body.model === 'string' ? body.model.trim() : '';
  const messages = body.messages;

  if (!endpoint) return res.status(400).json({ error: { message: 'এই provider সমর্থিত নয়। Settings থেকে সমর্থিত provider বেছে নিন।' } });
  if (!apiKey) return res.status(400).json({ error: { message: 'API key দিন।' } });
  if (!model) return res.status(400).json({ error: { message: 'Model ID দিন।' } });
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) {
    return res.status(400).json({ error: { message: 'চ্যাট বার্তার তালিকা সঠিক নয়।' } });
  }

  try {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = `https://${req.get('host') || 'localhost'}`;
      headers['X-Title'] = 'AI Developer Workspace';
    }

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages })
    });
    const responseText = await upstream.text();
    res.status(upstream.status);
    res.set('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.send(responseText);
  } catch (error) {
    console.error('Provider request failed:', error.message);
    res.status(502).json({ error: { message: 'AI provider-এ সংযোগ করা যায়নি। নেটওয়ার্ক ও provider settings পরীক্ষা করুন।' } });
  }
});

const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ZIP_BYTES, files: 1 },
  fileFilter: (req, file, callback) => {
    const name = String(file.originalname || '').toLowerCase();
    if (name.endsWith('.zip')) return callback(null, true);
    callback(new Error('শুধু .zip ফাইল দেওয়া যাবে।'));
  }
});

app.post('/api/inspect-zip', zipUpload.single('archive'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'একটি ZIP ফাইল দিন।' });
  try {
    const result = await extractSourceFromZip(req.file.buffer);
    if (result.files.length === 0) {
      return res.status(400).json({ error: 'ZIP-এর মধ্যে পড়ার মতো কোনো supported code/text file পাওয়া যায়নি।' });
    }
    res.json({
      archiveName: req.file.originalname,
      files: result.files,
      truncated: result.truncated,
      skippedFiles: result.skippedFiles,
      totalBytes: result.totalBytes
    });
  } catch (error) {
    console.warn('ZIP inspection failed:', error.message);
    res.status(400).json({ error: 'ZIP ফাইলটি পড়া যায়নি। এটি valid ZIP কি না পরীক্ষা করুন।' });
  }
});

function isIncludedSourcePath(entryName) {
  const normalized = String(entryName || '').replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) return false;
  const parts = normalized.split('/').filter(Boolean);
  if (!parts.length || parts.some(part => part === '..' || part === '.')) return false;
  if (parts.some(part => EXCLUDED_DIRS.has(part.toLowerCase()))) return false;
  const name = parts[parts.length - 1].toLowerCase();
  if (name === '.gitignore' || name === '.env.example') return true;
  return ALLOWED_EXTENSIONS.has(path.posix.extname(name));
}

function extractSourceFromZip(buffer) {
  return new Promise((resolve, reject) => {
    const files = [];
    let totalBytes = 0;
    let skippedFiles = 0;
    let truncated = false;
    let settled = false;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value);
    };

    yauzl.fromBuffer(buffer, {
      lazyEntries: true,
      decodeStrings: true,
      validateEntrySizes: true,
      strictFileNames: true
    }, (openError, zipFile) => {
      if (openError) return finish(openError);

      zipFile.on('error', error => finish(error));
      zipFile.on('end', () => finish(null, { files, totalBytes, skippedFiles, truncated }));
      zipFile.on('entry', entry => {
        const name = String(entry.fileName || '');
        const isDirectory = name.endsWith('/');
        const declaredSize = Number(entry.uncompressedSize) || 0;

        if (isDirectory || !isIncludedSourcePath(name)) {
          skippedFiles += isDirectory ? 0 : 1;
          zipFile.readEntry();
          return;
        }
        if (files.length >= MAX_SOURCE_FILES || declaredSize > MAX_ONE_SOURCE_BYTES || totalBytes + declaredSize > MAX_TOTAL_SOURCE_BYTES) {
          skippedFiles += 1;
          truncated = true;
          zipFile.readEntry();
          return;
        }

        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError) return finish(streamError);
          const chunks = [];
          let actualBytes = 0;
          let streamFailed = false;

          stream.on('data', chunk => {
            actualBytes += chunk.length;
            if (actualBytes > MAX_ONE_SOURCE_BYTES) {
              streamFailed = true;
              stream.destroy(new Error('ZIP entry exceeded size limit'));
              return;
            }
            chunks.push(chunk);
          });
          stream.on('error', () => {
            if (settled) return;
            skippedFiles += 1;
            truncated = true;
            zipFile.readEntry();
          });
          stream.on('end', () => {
            if (streamFailed || settled) return;
            const text = Buffer.concat(chunks).toString('utf8');
            files.push({ path: name, content: text });
            totalBytes += actualBytes;
            zipFile.readEntry();
          });
        });
      });
      zipFile.readEntry();
    });
  });
}

app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'ZIP সর্বোচ্চ 10 MB হতে পারবে।' });
    return res.status(400).json({ error: 'ZIP upload করা যায়নি।' });
  }
  if (error) return res.status(400).json({ error: error.message || 'Request করা যায়নি।' });
  return next();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AI Developer Workspace listening on port ${PORT}`);
});
