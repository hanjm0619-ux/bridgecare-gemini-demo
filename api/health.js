const MODEL = 'gemini-3.6-flash';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function respond(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function extractText(raw) {
  return (raw?.candidates || [])
    .flatMap(c => c?.content?.parts || [])
    .filter(p => typeof p?.text === 'string')
    .map(p => p.text)
    .join('')
    .trim();
}

export default {
  async fetch(request) {
    if (request.method !== 'GET') {
      return respond({ ok: false, error: 'GET 요청만 지원합니다.' }, 405);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return respond({ ok: false, stage: 'environment', error: 'GEMINI_API_KEY 환경변수가 없습니다.' }, 500);
    }

    try {
      const response = await fetch(URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Reply with exactly OK' }] }]
        })
      });
      const raw = await response.json().catch(() => ({}));
      if (!response.ok) {
        return respond({
          ok: false,
          stage: 'gemini-api',
          error: raw?.error?.message || 'Gemini API 오류',
          googleStatus: response.status
        }, 502);
      }

      return respond({
        ok: true,
        model: MODEL,
        api: 'generateContent v1beta',
        reply: extractText(raw) || 'OK'
      });
    } catch (error) {
      return respond({ ok: false, stage: 'network', error: String(error?.message || error) }, 502);
    }
  }
};
