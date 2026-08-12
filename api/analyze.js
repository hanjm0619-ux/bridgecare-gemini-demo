export const maxDuration = 60;

const MODEL = 'gemini-3.6-flash';
const MAX_BASE64_CHARS = 4_250_000;

const responseSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '통화 전체를 1~2문장으로 요약' },
    transcript: {
      type: 'array',
      description: '핵심 대화 순서. 들리지 않는 부분은 [불명확]으로 표시하고 내용을 지어내지 않음.',
      items: {
        type: 'object',
        properties: {
          speaker: { type: 'string', description: 'AI, 부모님, 또는 구분이 어려우면 화자 1/화자 2' },
          text: { type: 'string' }
        },
        required: ['speaker', 'text']
      }
    },
    emotion: {
      type: 'object',
      properties: {
        label: { type: 'string', description: '진단명이 아닌 관계 중심의 간단한 정서 표현' },
        detail: { type: 'string', description: '그렇게 판단한 대화 근거를 짧게 설명' }
      },
      required: ['label', 'detail']
    },
    topics: {
      type: 'object',
      properties: {
        label: { type: 'string', description: '중요 관심사 1~3개를 · 로 연결' },
        detail: { type: 'string' }
      },
      required: ['label', 'detail']
    },
    barrier: {
      type: 'object',
      properties: {
        label: { type: 'string', description: '가족 대화를 어렵게 하는 핵심 장벽을 짧게 표현' },
        detail: { type: 'string' }
      },
      required: ['label', 'detail']
    },
    guide: {
      type: 'object',
      properties: {
        headline: { type: 'string', description: '오늘 먼저 꺼내면 좋은 질문 또는 화제 한 문장' },
        rationale: { type: 'string', description: '왜 이 화제가 자연스러운지 짧게 설명' },
        openers: {
          type: 'array',
          items: { type: 'string' },
          description: '자녀가 실제로 말할 수 있는 자연스러운 한국어 문장 3개',
          minItems: 3,
          maxItems: 3
        },
        avoid: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: '피하면 좋은 표현' },
              reason: { type: 'string', description: '피해야 하는 이유' }
            },
            required: ['text', 'reason']
          }
        },
        coach_note: { type: 'string', description: '오늘 대화의 목표를 관계 중심으로 한 문장 제안' }
      },
      required: ['headline', 'rationale', 'openers', 'avoid', 'coach_note']
    }
  },
  required: ['summary', 'transcript', 'emotion', 'topics', 'barrier', 'guide']
};

const prompt = `
당신은 가족 간 대화를 돕는 한국어 대화 코치입니다.
첨부된 오디오는 부모님과 AI의 통화 녹음입니다. 오디오를 직접 듣고 다음 작업을 수행하세요.

1) 핵심 대화를 화자별로 전사하세요. 가능한 경우 'AI'와 '부모님'을 구분하세요.
2) 부모님이 직접 표현한 내용에 근거해 정서 신호, 관심사, 가족 대화 장벽을 분석하세요.
3) 자녀가 다음 통화에서 자연스럽게 사용할 수 있는 구체적인 질문/문장을 제안하세요.

중요 원칙:
- 들리지 않거나 확신할 수 없는 말은 추측하지 말고 [불명확]으로 표시하세요.
- 정신건강/의학적 진단을 하지 마세요.
- '우울증이다', '치매다' 같은 진단적 단정을 하지 마세요.
- 부모를 감시하거나 통제하는 표현보다 관계와 양방향 소통에 초점을 맞추세요.
- 분석 근거가 부족하면 부족하다고 명시하세요.
- 결과는 자연스러운 한국어로 작성하세요.
`;

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

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
    if (request.method !== 'POST') return json({ error: 'POST 요청만 지원합니다.' }, 405);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return json({ error: '서버에 GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' }, 500);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: '요청 본문을 읽을 수 없습니다.' }, 400);
    }

    const { audioBase64, mimeType = 'audio/mpeg', fileName = 'audio' } = body || {};
    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return json({ error: '분석할 음성 데이터가 없습니다.' }, 400);
    }
    if (audioBase64.length > MAX_BASE64_CHARS) {
      return json({ error: '파일이 너무 큽니다. 발표용 데모에서는 3MB 이하 음성을 사용해주세요.' }, 413);
    }

    const payload = {
      contents: [{
        role: 'user',
        parts: [
          { text: `${prompt}\n파일명: ${fileName}` },
          { inlineData: { mimeType, data: audioBase64 } }
        ]
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema
      }
    };

    let geminiResponse;
    try {
      geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(payload)
        }
      );
    } catch (error) {
      console.error('Gemini network error:', error);
      return json({ error: 'Gemini 서버에 연결하지 못했습니다.' }, 502);
    }

    const raw = await geminiResponse.json().catch(() => ({}));
    if (!geminiResponse.ok) {
      console.error('Gemini API error:', raw);
      const apiMessage = raw?.error?.message || 'Gemini API 호출에 실패했습니다.';
      return json({ error: apiMessage }, geminiResponse.status >= 500 ? 502 : 400);
    }

    const text = raw?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || '')
      .join('')
      .trim();

    if (!text) {
      return json({ error: 'Gemini가 분석 결과를 반환하지 않았습니다. 다른 음성으로 다시 시도해주세요.' }, 502);
    }

    try {
      const result = JSON.parse(text);
      return json({ result, model: MODEL });
    } catch (error) {
      console.error('Gemini JSON parse error:', error, text);
      return json({ error: '분석 결과 형식을 읽지 못했습니다. 다시 시도해주세요.' }, 502);
    }
  }
};
