const MODEL = 'gemini-3.6-flash';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

function respond(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function extractOutputText(raw) {
  const texts = [];
  for (const step of raw?.steps || []) {
    if (step?.type !== 'model_output') continue;
    for (const part of step?.content || []) {
      if (part?.type === 'text' && typeof part.text === 'string') texts.push(part.text);
    }
  }
  return texts.join('').trim();
}

export default {
  async fetch(request) {
    if (request.method !== 'GET') {
      return respond({ ok: false, error: 'GET 요청만 지원합니다.' }, 405);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return respond({
        ok: false,
        stage: 'environment',
        error: 'GEMINI_API_KEY가 설정되지 않았습니다.'
      }, 500);
    }

    const url = new URL(request.url);
    if (url.searchParams.get('probe') !== '1') {
      return respond({
        ok: true,
        keyConfigured: true,
        model: MODEL,
        endpoint: '/v1beta/interactions',
        hint: 'Gemini까지 실제 호출하려면 ?probe=1을 붙이세요.'
      });
    }

    let response;
    try {
      response = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          model: MODEL,
          store: false,
          input: 'Reply exactly with OK.'
        })
      });
    } catch (error) {
      return respond({ ok: false, stage: 'gemini-network', error: String(error?.message || error) }, 502);
    }

    const raw = await response.json().catch(() => ({}));
    if (!response.ok) {
      return respond({
        ok: false,
        stage: 'gemini-api',
        googleStatus: response.status,
        error: raw?.error?.message || 'Gemini probe failed.'
      }, 502);
    }

    return respond({
      ok: true,
      geminiReachable: true,
      model: MODEL,
      output: extractOutputText(raw) || '(응답 텍스트 없음)'
    });
  }
};
