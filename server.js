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

// Server-side fallback: environment keys stay private on Render.
const PROVIDER_CONFIG = {
  gemini: { env: 'GEMINI_API_KEY', model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' },
  groq: { env: 'GROQ_API_KEY', model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile' },
  openrouter: { env: 'OPENROUTER_API_KEY', model: process.env.OPENROUTER_MODEL || 'openrouter/free' },
  mistral: { env: 'MISTRAL_API_KEY', model: process.env.MISTRAL_MODEL || 'mistral-small-latest' }
};
const FALLBACK_ORDER = ['gemini', 'groq', 'openrouter', 'mistral'];

app.post('/api/chat', async (req, res) => {
  const body = req.body || {};
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) {
    return res.status(400).json({ error: { message: 'চ্যাট বার্তার তালিকা সঠিক নয়।' } });
  }
  // If fallback=true, try all providers with configured server environment keys.
  const requested = String(body.provider || 'gemini').toLowerCase();
  const order = body.fallback === true ? [...new Set([requested, ...FALLBACK_ORDER])] : [requested];
  const failures = [];
  for (const provider of order) {
    const endpoint = CHAT_PROVIDERS[provider];
    const config = PROVIDER_CONFIG[provider];
    if (!endpoint || !config) continue;
    const apiKey = (process.env[config.env] || (provider === requested && typeof body.apiKey === 'string' ? body.apiKey : '')).trim();
    if (!apiKey) { failures.push(provider + ': API key configured নেই'); continue; }
    const model = (provider === requested && typeof body.model === 'string' && body.model.trim()) || config.model;
    try {
      const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
      if (provider === 'openrouter') {
        headers['HTTP-Referer'] = `https://${req.get('host') || 'localhost'}`;
        headers['X-Title'] = 'AI Developer Workspace';
      }
      const upstream = await fetch(endpoint, {
        method: 'POST', headers,
        body: JSON.stringify({ model, messages }),
        signal: AbortSignal.timeout(45000)
      });
      const responseText = await upstream.text();
      if (upstream.ok) {
        console.log(`AI provider success: ${provider}`);
        res.status(upstream.status);
        res.set('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
        return res.send(responseText);
      }
      // Retry another provider only for rate/availability/auth/config errors.
      failures.push(`${provider}: HTTP ${upstream.status} ${responseText.slice(0, 220)}`);
      console.warn(`AI provider failed: ${provider} HTTP ${upstream.status}`);
      if (![401, 402, 403, 404, 408, 413, 429, 500, 502, 503, 504].includes(upstream.status)) {
        res.status(upstream.status); res.type('application/json'); return res.send(responseText);
      }
    } catch (error) {
      failures.push(`${provider}: ${error.message}`);
      console.warn(`AI provider connection failed: ${provider}: ${error.message}`);
    }
  }
  console.error('All configured AI providers failed:', failures.join(' | '));
  return res.status(503).json({ error: { message: 'সব AI provider ব্যর্থ হয়েছে বা API key সেট করা নেই। Render Environment-এ GEMINI_API_KEY, GROQ_API_KEY বা OPENROUTER_API_KEY যোগ করুন। Logs-এ provider error দেখুন।' } });
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
