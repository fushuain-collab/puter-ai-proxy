const UPSTREAM = 'https://text.pollinations.ai/openai';

const MODELS = [
  { id: 'openai-fast', object: 'model', created: 1782140735, owned_by: 'pollinations' },
  { id: 'gpt-oss-20b', object: 'model', created: 1782140735, owned_by: 'pollinations' },
  { id: 'gpt-free', object: 'model', created: 1782140735, owned_by: 'pollinations' },
];

function normalizeModel(model) {
  const m = String(model || '').trim();
  if (!m) return 'openai-fast';
  // compatibility aliases shown to clients but backed by free upstream
  if (['gpt-oss-20b', 'gpt-free', 'gpt-4o', 'gpt-4.1', 'gpt-5', 'gpt-5-mini', 'claude-opus-4-8', 'claude-opus-4-7'].includes(m)) return 'openai-fast';
  return m;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', '*');
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return null;
  return Buffer.concat(chunks).toString('utf8');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const rawPath = Array.isArray(req.query.path) ? req.query.path.join('/') : (req.query.path || '');
  const path = '/' + rawPath.replace(/^\/+/, '');

  if (path === '/' || path === '/health') {
    return res.status(200).json({ ok: true, service: 'free-ai-gateway', upstream: 'pollinations' });
  }

  if (path === '/models') {
    return res.status(200).json({ object: 'list', data: MODELS });
  }

  if (path === '/chat/completions') {
    try {
      const bodyText = await readBody(req);
      const body = bodyText ? JSON.parse(bodyText) : {};
      body.model = normalizeModel(body.model);

      const upstreamRes = await fetch(`${UPSTREAM}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers.authorization || 'Bearer sk-free',
          'User-Agent': 'Mozilla/5.0 free-ai-gateway'
        },
        body: JSON.stringify(body),
      });

      res.status(upstreamRes.status);
      res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || (body.stream ? 'text/event-stream' : 'application/json'));
      if (body.stream) {
        for await (const chunk of upstreamRes.body) res.write(Buffer.from(chunk));
        return res.end();
      }
      const text = await upstreamRes.text();
      return res.send(text);
    } catch (e) {
      return res.status(500).json({ error: { message: String(e && e.message || e), type: 'gateway_error' } });
    }
  }

  return res.status(404).json({ error: { message: `Not found: ${path}` } });
};
