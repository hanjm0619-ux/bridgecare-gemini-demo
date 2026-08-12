export const maxDuration = 60;

const MODEL = 'gemini-3.6-flash';
const MAX_BASE64_CHARS = 4_250_000;

const prompt = `
당신은 가족 간 대화를 돕는 한국어 대화 코치입니다.
첨부된 오디오는 부모님과 AI의 통화 녹음입니다. 오디오를 직접 듣고 다음 작업을 수행하세요.

1) 핵심 대화를 화자별로 전사하세요. 가능한 경우 'AI'와 '부모님'을 구분하세요.
2) 부모님이 직접 표현한 내용에 근거해 정서 신호, 관심사, 가족 대화 장벽을 분석하세요.
3) 자녀가 다음 통화에서 자연스럽게 사용할 수 있는 구체적인 질문/문장을 제안하세요.

중요 원칙:
- 들리지 않거나 확신할 수 없는 말은 추측하지 말고 [불명확]으로 표시하세요.
- 정신건강/의학적 진단을 하지 마세요.
- 부모를 감시하거나 통제하는 표현보다 관계와 양방향 소통에 초점을 맞추세요.
- 분석 근거가 부족하면 부족하다고 명시하세요.
- 결과는 자연스러운 한국어로 작성하세요.
`;

const responseSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    transcript: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          speaker: { type: 'string' },
          text: { type: 'string' }
        },
        required: ['speaker', 'text']
      }
    },
    emotion: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        detail: { type: 'string' }
      },
      required: ['label', 'detail']
    },
    topics: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        detail: { type: 'string' }
      },
      required: ['label', 'detail']
    },
    barrier: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        detail: { type: 'string' }
      },
      required: ['label', 'detail']
    },
    guide: {
      type: 'object',
      properties: {
        headline: { type: 'string' },
        rationale: { type: 'string' },
        openers: {
          type: 'array',
          items: { type: 'string' }
        },
        avoid: {
          type: 'array',
          items: {
            type: 'object',
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

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeMimeType(mimeType, fileName = '') {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'mp3') return 'audio/mp3';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'aac') return 'audio/aac';
  if (ext === 'ogg') return 'audio/ogg';
  if (ext === 'flac') return 'audio/flac';
  if (ext === 'aiff' || ext === 'aif') return 'audio/aiff';
  return mimeType || 'audio/mp3';
}

function extractOutputText(raw) {
  const modelSteps = Array.isArray(raw?.steps)
    ? raw.steps.filter(step => step?.type === 'model_output')
    : [];

  const last = modelSteps.at(-1);
  if (!last || !Array.isArray(last.content)) return '';

  return last.content
    .filter(item => item?.type === 'text' && typeof item.text === 'string')
    .map(item => item.text)
    .join('')
    .trim();
}

async function callGeminiInteractions({ apiKey, audioBase64, mimeType, fileName }) {
  const payload = {
    model: MODEL,
    store: false,
    input: [
      {
        type: 'text',
        text: `${prompt}\n파일명: ${fileName}`
      },
      {
        type: 'audio',
        data: audioBase64,
        mime_type: mimeType
      }
    ],
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: responseSchema
    }
  };

  return fetch('https://generativelanguage.googleapis.com/v1/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(payload)
  });
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST 요청만 지원합니다.' }, 405);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return json({ error: '서버에 GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' }, 500);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: '요청 본문을 읽을 수 없습니다.' }, 400);
    }

    const { audioBase64, mimeType, fileName = 'audio.mp3' } = body || {};

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return json({ error: '분석할 음성 데이터가 없습니다.' }, 400);
    }

    if (audioBase64.length > MAX_BASE64_CHARS) {
      return json({ error: '파일이 너무 큽니다. 발표용 데모에서는 3MB 이하 음성을 사용해주세요.' }, 413);
    }

    const normalizedMime = normalizeMimeType(mimeType, fileName);
    let lastError = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      let response;
      try {
        response = await callGeminiInteractions({
          apiKey,
          audioBase64,
          mimeType: normalizedMime,
          fileName
        });
      } catch (error) {
        console.error(`Gemini Interactions network error (${attempt}):`, error);
        lastError = { status: 502, message: 'Gemini 서버에 연결하지 못했습니다.' };
        if (attempt < 3) await sleep(900 * attempt);
        continue;
      }

      const raw = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = raw?.error?.message || `Gemini Interactions API 호출 실패 (${response.status})`;
        console.error(`Gemini Interactions API error (${attempt}):`, raw);
        lastError = { status: response.status, message };

        if ((response.status === 500 || response.status === 503) && attempt < 3) {
          await sleep(1100 * attempt);
          continue;
        }
        break;
      }

      const text = extractOutputText(raw);
      if (!text) {
        console.error('Gemini Interactions response has no model text:', raw);
        lastError = { status: 502, message: 'Gemini가 분석 결과를 반환하지 않았습니다.' };
        if (attempt < 3) {
          await sleep(900 * attempt);
          continue;
        }
        break;
      }

      try {
        const result = JSON.parse(text);
        return json({ result, model: MODEL });
      } catch (error) {
        console.error('Gemini Interactions JSON parse error:', error, text);
        lastError = { status: 502, message: 'Gemini 분석 결과 JSON을 읽지 못했습니다.' };
        break;
      }
    }

    const status = lastError?.status || 502;
    const clientStatus = status === 429 ? 429 : (status >= 400 && status < 500 ? status : 502);

    return json({
      error: lastError?.message || 'Gemini 분석에 실패했습니다. 잠시 후 다시 시도해주세요.'
    }, clientStatus);
  }
};
