export const maxDuration = 60;

const MODEL = 'gemini-3.6-flash';
const GENERATE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_BASE64_CHARS = 3_650_000;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const analysisSchema = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    transcript: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          speaker: { type: 'STRING' },
          text: { type: 'STRING' }
        },
        required: ['speaker', 'text']
      }
    },
    emotion: {
      type: 'OBJECT',
      properties: {
        label: { type: 'STRING' },
        detail: { type: 'STRING' }
      },
      required: ['label', 'detail']
    },
    topics: {
      type: 'OBJECT',
      properties: {
        label: { type: 'STRING' },
        detail: { type: 'STRING' }
      },
      required: ['label', 'detail']
    },
    barrier: {
      type: 'OBJECT',
      properties: {
        label: { type: 'STRING' },
        detail: { type: 'STRING' }
      },
      required: ['label', 'detail']
    },
    guide: {
      type: 'OBJECT',
      properties: {
        headline: { type: 'STRING' },
        rationale: { type: 'STRING' },
        openers: { type: 'ARRAY', items: { type: 'STRING' } },
        avoid: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              text: { type: 'STRING' },
              reason: { type: 'STRING' }
            },
            required: ['text', 'reason']
          }
        },
        coach_note: { type: 'STRING' }
      },
      required: ['headline', 'rationale', 'openers', 'avoid', 'coach_note']
    }
  },
  required: ['summary', 'transcript', 'emotion', 'topics', 'barrier', 'guide']
};

const transcriptionPrompt = `
다음 한국어 통화 음성을 정확하게 전사하세요.
- 화자를 가능한 한 구분해서 각 줄을 "AI: ..." 또는 "부모님: ..." 형태로 적으세요.
- 화자 역할을 확신할 수 없으면 "화자 1", "화자 2"를 사용하세요.
- 들리지 않는 부분은 [불명확]으로 표시하세요.
- 분석이나 조언을 하지 말고 전사만 하세요.
`;

const analysisPrompt = transcript => `
당신은 부모-자녀 간 자연스러운 대화를 돕는 한국어 대화 코치입니다.
아래 전사만 근거로 분석하세요. 전사에 없는 사실은 만들지 마세요.

[전사]
${transcript}

요구사항:
1. summary: 통화에서 확인되는 핵심 맥락을 1~2문장으로 요약.
2. transcript: 중요한 발화를 화자별 배열로 정리. speaker/text 필드 사용.
3. emotion: 부모님의 정서 신호. 진단하지 말고, 근거가 약하면 '근거 부족'이라고 명시.
4. topics: 부모님이 관심을 보인 일상 주제.
5. barrier: 가족 대화를 어렵게 하는 표현이나 맥락. 없으면 '뚜렷한 장벽 없음'.
6. guide.headline: 자녀가 먼저 꺼내면 좋은 주제 또는 한 문장.
7. guide.rationale: 왜 그 접근이 자연스러운지 설명.
8. guide.openers: 실제로 사용할 수 있는 자연스러운 문장 3개.
9. guide.avoid: 피하면 좋은 표현 3개와 이유.
10. guide.coach_note: 오늘 대화의 목표를 한 문장으로.

의학적·정신건강 진단은 하지 말고, 감시·통제보다 양방향 소통에 초점을 두세요.
결과는 한국어로 작성하세요.
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
  ['audio/flac', 'audio/flac']
]);

function normalizeMimeType(value) {
  return mimeAliases.get(String(value || '').toLowerCase()) || null;
}

function corsHeaders() {
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
    headers: { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractText(raw) {
  return (raw?.candidates || [])
    .flatMap(c => c?.content?.parts || [])
    .filter(p => typeof p?.text === 'string')
    .map(p => p.text)
    .join('')
    .trim();
}

function cleanJson(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  return s;
}

async function geminiRequest(apiKey, payload, attempts = 3) {
  let lastResponse;
  let lastRaw = {};

  for (let i = 1; i <= attempts; i += 1) {
    const response = await fetch(GENERATE_URL, {
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
    if (!RETRYABLE.has(response.status) || i === attempts) break;
    await sleep(500 * i);
  }

  return { response: lastResponse, raw: lastRaw };
}

function buildAudioPayload(audioBase64, mimeType) {
  return {
    contents: [
      {
        role: 'user',
        parts: [
          { text: transcriptionPrompt },
          {
            inlineData: {
              mimeType,
              data: audioBase64
            }
          }
        ]
      }
    ]
  };
}

function buildAnalysisPayload(transcript, structured = true) {
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: analysisPrompt(transcript) }]
      }
    ]
  };

  if (structured) {
    payload.generationConfig = {
      responseMimeType: 'application/json',
      responseSchema: analysisSchema
    };
  } else {
    payload.contents[0].parts[0].text += '\n반드시 JSON 객체만 출력하세요. 코드펜스는 사용하지 마세요.';
  }

  return payload;
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== 'POST') {
      return respond({ ok: false, stage: 'vercel-route', error: 'POST 요청만 지원합니다.' }, 405);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return respond({ ok: false, stage: 'environment', error: 'GEMINI_API_KEY 환경변수가 없습니다.' }, 500);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return respond({ ok: false, stage: 'request-parse', error: '요청 JSON을 읽을 수 없습니다.' }, 400);
    }

    const audioBase64 = body?.audioBase64;
    const mimeType = normalizeMimeType(body?.mimeType);

    if (typeof audioBase64 !== 'string' || !audioBase64.length) {
      return respond({ ok: false, stage: 'validation', error: '분석할 음성 데이터가 없습니다.' }, 400);
    }
    if (audioBase64.length > MAX_BASE64_CHARS) {
      return respond({ ok: false, stage: 'validation', error: '파일이 너무 큽니다. 원본 약 2.5MB 이하로 테스트해주세요.' }, 413);
    }
    if (!mimeType) {
      return respond({ ok: false, stage: 'validation', error: '지원하지 않는 음성 형식입니다. MP3, WAV, AIFF, AAC, OGG, FLAC를 사용해주세요.' }, 415);
    }

    // 1단계: 오디오 -> 텍스트 전사. 구조화 출력 없이 가장 단순한 multimodal 요청으로 분리.
    let transcribed;
    try {
      transcribed = await geminiRequest(apiKey, buildAudioPayload(audioBase64, mimeType));
    } catch (error) {
      console.error('Gemini transcription network error', error);
      return respond({ ok: false, stage: 'transcription-network', error: 'Gemini 전사 서버에 연결하지 못했습니다.' }, 502);
    }

    if (!transcribed.response?.ok) {
      const message = transcribed.raw?.error?.message || 'Gemini가 음성 전사 요청을 처리하지 못했습니다.';
      console.error('Gemini transcription error', transcribed.response?.status, transcribed.raw);
      return respond({
        ok: false,
        stage: 'transcription',
        error: message,
        googleStatus: transcribed.response?.status || 500
      }, 502);
    }

    const transcript = extractText(transcribed.raw);
    if (!transcript) {
      return respond({ ok: false, stage: 'transcription-parse', error: 'Gemini 전사 결과가 비어 있습니다.' }, 502);
    }

    // 2단계: 전사 텍스트 -> 구조화된 대화 코칭 JSON.
    let analyzed;
    try {
      analyzed = await geminiRequest(apiKey, buildAnalysisPayload(transcript, true));
    } catch (error) {
      console.error('Gemini analysis network error', error);
      return respond({ ok: false, stage: 'analysis-network', error: 'Gemini 분석 서버에 연결하지 못했습니다.' }, 502);
    }

    // 구조화 출력 자체가 실패하면 같은 최신 모델로 일반 JSON 출력 1회 fallback.
    if (!analyzed.response?.ok) {
      console.warn('Structured analysis failed; retrying without schema', analyzed.response?.status, analyzed.raw);
      analyzed = await geminiRequest(apiKey, buildAnalysisPayload(transcript, false), 2);
    }

    if (!analyzed.response?.ok) {
      const message = analyzed.raw?.error?.message || 'Gemini가 대화 분석 요청을 처리하지 못했습니다.';
      console.error('Gemini analysis error', analyzed.response?.status, analyzed.raw);
      return respond({
        ok: false,
        stage: 'analysis',
        error: message,
        googleStatus: analyzed.response?.status || 500
      }, 502);
    }

    const outputText = extractText(analyzed.raw);
    let result;
    try {
      result = JSON.parse(cleanJson(outputText));
    } catch (error) {
      console.error('JSON parse error', error, outputText?.slice(0, 1200));
      return respond({
        ok: false,
        stage: 'analysis-parse',
        error: 'Gemini 분석 응답을 JSON으로 읽지 못했습니다.'
      }, 502);
    }

    return respond({
      ok: true,
      result,
      meta: {
        model: MODEL,
        api: 'generateContent v1beta (2-stage)',
        transcriptionChars: transcript.length
      }
    });
  }
};
