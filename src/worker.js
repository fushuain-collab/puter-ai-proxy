// Puter AI Proxy - OpenAI Compatible API
// Supports: gpt-5.5-pro, claude-opus-4-8, gemini-3.1-pro, deepseek-v4-pro

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    // Health
    if (url.pathname === '/') {
      return json({ status: 'ok', models: MODELS.map(m => m.id) });
    }

    // Models list
    if (url.pathname === '/v1/models') {
      return json({
        object: 'list',
        data: MODELS.map(m => ({ id: m.id, object: 'model', owned_by: m.provider }))
      });
    }

    // Chat completions
    if (url.pathname === '/v1/chat/completions' && request.method === 'POST') {
      return handleChat(request, env);
    }

    return new Response('Not Found', { status: 404 });
  }
};

const MODELS = [
  { id: 'gpt-5.5-pro',       puter: 'openai/gpt-5.5-pro',                    provider: 'openai' },
  { id: 'gpt-4o',            puter: 'openai/gpt-4o',                          provider: 'openai' },
  { id: 'claude-opus-4-8',   puter: 'anthropic/claude-opus-4-8',              provider: 'anthropic' },
  { id: 'claude-opus-4-7',   puter: 'anthropic/claude-opus-4-7',              provider: 'anthropic' },
  { id: 'gemini-3.1-pro',    puter: 'google/gemini-3.1-pro-preview',          provider: 'google' },
  { id: 'gemini-3.1-flash',  puter: 'google/gemini-3.1-flash-lite-preview',   provider: 'google' },
  { id: 'deepseek-v4-pro',   puter: 'deepseek/deepseek-v4-0324',              provider: 'deepseek' },
];

async function handleChat(request, env) {
  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON', 400); }

  const modelId = body.model || 'gpt-5.5-pro';
  const modelDef = MODELS.find(m => m.id === modelId) || MODELS[0];
  const messages = body.messages || [];
  const stream = body.stream || false;

  // Build prompt from messages
  const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n') + '\nassistant:';

  // Call Puter AI via their public API
  const puterRes = await fetch('https://api.puter.com/drivers/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      interface: 'puter-chat-completion',
      driver: modelDef.puter,
      test_mode: false,
      method: 'complete',
      args: {
        messages: messages,
        model: modelDef.puter,
        stream: stream,
      }
    })
  });

  if (!puterRes.ok) {
    const txt = await puterRes.text();
    return err(`Puter error: ${txt}`, 502);
  }

  if (stream) {
    // Pass through SSE stream
    return new Response(puterRes.body, {
      headers: { ...corsHeaders(), 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
    });
  }

  const data = await puterRes.json();
  const content = data?.result?.message?.content || data?.result?.text || JSON.stringify(data);

  return json({
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    model: modelId,
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop'
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
  });
}

function err(msg, status = 500) {
  return json({ error: { message: msg, type: 'error' } }, status);
}
