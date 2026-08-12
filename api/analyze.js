export const maxDuration = 60;

const MODEL = 'gemini-3.6-flash';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MAX_BASE64_CHARS = 3_650_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    transcript: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          speaker: { type: 'string' },
          text: { type: 'string' }
        },
        required: ['speaker', 'text']
      }
    },
    emotion: {
      type: 'object',
      additionalProperties: false,
      properties: {
        label: { type: 'string' },
        detail: { type: 'string' }
      },
      required: ['label', 'detail']
    },
    topics: {
      type: 'object',
      additionalProperties: false,
      properties: {
        label: { type: 'string' },
        detail: { type: 'string' }
      },
      required: ['label', 'detail']
    },
    barrier: {
      type: 'object',
      additionalProperties: false,
      properties: {
        label: { type: 'string' },
        detail: { type: 'string' }
      },
      required: ['label', 'detail']
    },
    guide: {
      type: 'object',
      additionalProperties: false,
      properties: {
        headline: { type: 'string' },
        rationale: { type: 'string' },
        openers: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: { type: 'string' }
        },
        avoid: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              text: { type: 'string' },
              reason: { type: 'string' }
            },
            required: ['text', 'reason']
          }
        },
        coach_note: { type: 'string' }
      },
      required: ['headline', 'rationale', 'openers', 'avoid', 'coach_note']
    }
  },
  required: ['summary', 'transcript', 'emotion', 'topics', 'barrier', 'guide']
};

const analysisPrompt = `
당신은 부모-자녀 간 자연스러운 대화를 돕는 한국어 대화 코치입니다.
첨부한 통화 음성을 직접 듣고, 오디오에서 확인할 수 있는 내용만 근거로 분석하세요.

해야 할 일:
1. 핵심 대화를 화자별로 전사합니다. AI와 부모님을 구분할 수 있으면 그렇게 표시하고, 확신이 없으면 '화자 1', '화자 2'로 표시합니다.
2. 부모님이 직접 표현한 내용에서 정서 신호, 핵심 관심사, 가족 대화를 어렵게 하는 장벽을 찾습니다.
3. 자녀가 다음 통화에서 실제로 사용할 수 있는 자연스러운 한국어 문장 3개를 제안합니다.
4. 피하면 좋은 표현 3개와 각각의 이유를 제안합니다.
5. 오늘 대화의 목표를 한 문장으로 제안합니다.

원칙:
- 들리지 않거나 불확실한 발화는 지어내지 말고 '[불명확]'이라고 표시합니다.
- 질병, 우울증, 치매 등 의학적·정신건강 진단을 하지 않습니다.
- 부모를 감시하거나 통제하기 위한 조언보다 관계와 양방향 소통에 초점을 둡니다.
- 분석 근거가 부족한 경우 그 사실을 명시합니다.
- 결과는 자연스러운 한국어로 작성합니다.
`;

const mimeAliases = new Map([
  ['audio/mpeg', 'audio/mp3'],
  ['audio/mp3', 'audio/mp3'],
  ['audio/wav', 'audio/wav'],
  ['audio/x-wav', 'audio/wav'],
  ['audio/aiff', 'audio/aiff'],
  ['audio/x-aiff', 'audio/aiff'],
  ['audio/aac', 'audio/aac'],
  ['audio/ogg', 'audio/ogg'],
  ['audio/flac', 'audio/flac'],
  ['audio/m4a', 'audio/m4a'],
  ['audio/x-m4a', 'audio/m4a']
]);

function normalizeMimeType(value) {
  return mimeAliases.get(String(value || '').toLowerCase()) || null;
}

function headers() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  };
}

function respond(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers(),
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractOutputText(raw) {
  if (typeof raw?.output_text === 'string' && raw.output_text.trim()) {
    return raw.output_text.trim();
  }

  const texts = [];
  for (const step of raw?.steps || []) {
    if (step?.type !== 'model_output') continue;
    for (const part of step?.content || []) {
      if (part?.type === 'text' && typeof part.text === 'string') {
        texts.push(part.text);
      }
    }
  }
  return texts.join('').trim();
}

async function callGemini(apiKey, payload) {
  let lastResponse = null;
  let lastRaw = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(payload)
    });

    const raw = await response.json().catch(() => ({}));
    lastResponse = response;
    lastRaw = raw;

    if (response.ok) return { response, raw };
    if (!RETRYABLE_STATUS.has(response.status) || attempt === 3) break;

    await sleep(500 * attempt);
  }

  return { response: lastResponse, raw: lastRaw };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: headers() });
    }
    if (request.method !== 'POST') {
      return respond({ ok: false, stage: 'vercel-route', error: 'POST 요청만 지원합니다.' }, 405);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return respond({
        ok: false,
        stage: 'environment',
        error: '서버에 GEMINI_API_KEY 환경변수가 없습니다. Vercel 환경변수 저장 후 새 배포가 필요합니다.'
      }, 500);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return respond({ ok: false, stage: 'request-parse', error: '요청 JSON을 읽을 수 없습니다.' }, 400);
    }

    const audioBase64 = body?.audioBase64;
    const mimeType = normalizeMimeType(body?.mimeType);
    const fileName = String(body?.fileName || 'audio');

    if (typeof audioBase64 !== 'string' || !audioBase64.length) {
      return respond({ ok: false, stage: 'validation', error: '분석할 음성 데이터가 없습니다.' }, 400);
    }
    if (audioBase64.length > MAX_BASE64_CHARS) {
      return respond({
        ok: false,
        stage: 'validation',
        error: '파일이 너무 큽니다. 이 데모는 Vercel 요청 제한 때문에 원본 약 2.5MB 이하 음성을 권장합니다.'
      }, 413);
    }
    if (!mimeType) {
      return respond({
        ok: false,
        stage: 'validation',
        error: '지원하지 않는 음성 형식입니다. MP3, WAV, AIFF, AAC, OGG, FLAC 또는 M4A를 사용해주세요.'
      }, 415);
    }

    // 2026-08-12 Google 공식 Audio understanding 문서의 Interactions API 형식:
    // input 배열에 text/audio Content를 직접 넣고, inline audio는 data + mime_type을 사용합니다.
    const payload = {
      model: MODEL,
      store: false,
      input: [
        {
          type: 'text',
          text: `${analysisPrompt}\n업로드 파일명: ${fileName}`
        },
        {
          type: 'audio',
          data: audioBase64,
          mime_type: mimeType
        }
      ],
      response_format: [
        {
          type: 'text',
          mime_type: 'application/json',
          schema: responseSchema
        }
      ]
    };

    let result;
    try {
      result = await callGemini(apiKey, payload);
    } catch (error) {
      console.error('Gemini network error', error);
      return respond({
        ok: false,
        stage: 'gemini-network',
        error: 'Vercel에서 Gemini 서버로 연결하지 못했습니다.'
      }, 502);
    }

    const { response, raw } = result;
    if (!response?.ok) {
      const message = raw?.error?.message || 'Gemini API가 요청을 거부했습니다.';
      console.error('Gemini API error', response?.status, raw);
      return respond({
        ok: false,
        stage: 'gemini-api',
        googleStatus: response?.status || 502,
        error: message
      }, response?.status === 429 ? 429 : 502);
    }

    const outputText = extractOutputText(raw);
    if (!outputText) {
      console.error('Gemini empty output', raw);
      return respond({
        ok: false,
        stage: 'gemini-output',
        error: 'Gemini 응답에서 텍스트 결과를 찾지 못했습니다.'
      }, 502);
    }

    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch (error) {
      console.error('Gemini JSON parse error', error, outputText);
      return respond({
        ok: false,
        stage: 'json-parse',
        error: 'Gemini 결과가 JSON 형식으로 해석되지 않았습니다.'
      }, 502);
    }

    return respond({
      ok: true,
      result: parsed,
      meta: {
        model: MODEL,
        api: 'Interactions API',
        apiVersion: 'v1beta'
      }
    });
  }
};
