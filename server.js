const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const UPSTREAM = 'https://text.pollinations.ai/openai';

app.use(express.json({ limit: '20mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

const models = [
  { id: 'openai-fast', object: 'model', created: 1782140735, owned_by: 'pollinations' },
  { id: 'gpt-oss-20b', object: 'model', created: 1782140735, owned_by: 'pollinations' },
  { id: 'gpt-free', object: 'model', created: 1782140735, owned_by: 'pollinations' }
];

function normalizeModel(model) {
  const m = String(model || '').trim();
  if (!m) return 'openai-fast';
  if (['gpt-oss-20b', 'gpt-free', 'gpt-4o', 'gpt-4.1', 'gpt-5', 'gpt-5-mini', 'claude-opus-4-8', 'claude-opus-4-7'].includes(m)) return 'openai-fast';
  return m;
}

app.get('/', (req, res) => {
  res.json({ ok: true, name: 'free-ai-gateway', endpoints: ['/v1/models', '/v1/chat/completions'] });
});

app.get('/v1/models', (req, res) => {
  res.json({ object: 'list', data: models });
});

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const body = { ...req.body, model: normalizeModel(req.body?.model || 'openai-fast') };
    const upstream = await fetch(`${UPSTREAM}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': body.stream ? 'text/event-stream' : 'application/json',
        'User-Agent': 'Mozilla/5.0 free-ai-gateway'
      },
      body: JSON.stringify(body)
    });

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) {
        res.setHeader(key, value);
      }
    });
    if (!res.getHeader('content-type')) {
      res.setHeader('Content-Type', body.stream ? 'text/event-stream; charset=utf-8' : 'application/json; charset=utf-8');
    }

    if (!upstream.body) return res.end();
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    res.status(502).json({ error: { message: String(err?.message || err), type: 'gateway_error' } });
  }
});

app.listen(PORT, () => console.log(`free-ai-gateway listening on ${PORT}`));
