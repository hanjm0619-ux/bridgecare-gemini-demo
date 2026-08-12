# 이어봄 (BridgeCare) — Gemini 실제 분석 데모

부모님과 AI의 통화 음성을 업로드하면 **Gemini 3.6 Flash**가 음성을 직접 듣고 주요 대화를 전사한 뒤, 정서 신호·관심사·대화 장벽을 분석하고 자녀에게 실제로 사용할 수 있는 대화 문장을 제안하는 웹 MVP입니다.

## 이번 버전에서 바뀐 점

- 기존의 고정 샘플 분석 대신 실제 Gemini API 호출 추가
- 음성 → 화자별 핵심 전사 → 관계 중심 분석 → 자녀용 가이드까지 한 번에 생성
- 샘플 모드는 그대로 유지하여 발표 중 API 문제가 있어도 전체 흐름 시연 가능
- Gemini API 키는 브라우저에 노출하지 않고 Vercel Function의 환경변수에 저장
- 결과를 JSON 형식으로 강제하여 기존 카드 UI에 안정적으로 출력
- 의료/정신건강 진단을 하지 않고, 실제 발화 근거와 가족 소통에 집중하도록 프롬프트 구성

## 파일 구조

```text
bridgecare-gemini-demo/
├─ index.html
├─ styles.css
├─ app.js
├─ README.md
└─ api/
   └─ analyze.js
```

## 가장 쉬운 무료 실행 방법: Vercel에 통째로 배포

이 프로젝트는 정적 웹 + `/api/analyze.js` 서버리스 함수 구조입니다. GitHub에 이 폴더 내용을 올린 뒤 Vercel에서 해당 저장소를 Import하면 프론트와 API를 한 주소에서 같이 실행할 수 있습니다.

### 1. Gemini API 키 만들기

Google AI Studio에서 Gemini API Key를 생성합니다.

### 2. Vercel 환경변수 추가

Vercel 프로젝트에서 다음 환경변수를 추가합니다.

```text
GEMINI_API_KEY=발급받은_키
```

API 키를 `app.js`나 `index.html`에 직접 적지 마세요. 공개 저장소와 브라우저 개발자 도구에서 노출됩니다.

### 3. 배포

저장소를 Vercel에 Import해서 배포합니다. 별도 프레임워크 설정은 필요하지 않습니다. `/api` 아래 JavaScript 파일은 Vercel Function으로 배포됩니다.

배포 후 사이트에서 3MB 이하 MP3/WAV/M4A 파일을 올리고 **AI 분석 시작**을 누르면 됩니다.

## 왜 3MB 제한인가?

Gemini 자체는 더 큰 인라인 오디오도 처리할 수 있지만, 이 MVP는 오디오를 base64 JSON으로 Vercel Function에 전달합니다. Vercel Function의 요청 본문 제한이 4.5MB이고 base64 변환 시 파일 크기가 약 33% 늘어나므로 안전하게 원본 파일을 3MB로 제한했습니다.

발표용 1~3분 압축 음성에는 충분합니다. 이후 10~20분 통화를 지원하려면 브라우저에서 스토리지로 직접 업로드한 뒤 파일 URL을 백엔드가 처리하도록 바꾸는 것이 좋습니다.

## GitHub Pages를 계속 쓰고 싶은 경우

GitHub Pages는 정적 호스팅이라 `/api/analyze` 서버 코드를 실행할 수 없습니다. 프론트는 GitHub Pages에 두고 API만 Vercel에 배포하려면 `index.html`에서 `app.js`보다 먼저 다음을 추가하면 됩니다.

```html
<script>
  window.BRIDGECARE_API_URL = 'https://YOUR-VERCEL-DOMAIN.vercel.app/api/analyze';
</script>
<script src="app.js"></script>
```

기본값은 `/api/analyze`이므로 전체 프로젝트를 Vercel에 올리는 경우에는 이 설정이 필요 없습니다.

## 개인정보 주의

Gemini API 무료 티어에서는 제출한 콘텐츠가 Google 제품 개선에 사용될 수 있습니다. 따라서 이 버전은 **MVP/발표용 샘플 음성**으로 테스트하는 것을 권장합니다. 실서비스에서 실제 가족 통화처럼 민감한 데이터를 처리하려면 유료 티어의 데이터 처리 조건, 동의 절차, 보관 정책을 별도로 설계해야 합니다.

## 반환 데이터 예시

```json
{
  "summary": "부모님이 최근 외출이 줄었고 먼저 연락하기를 망설이고 있음",
  "transcript": [
    { "speaker": "AI", "text": "오늘 하루는 어떠셨어요?" },
    { "speaker": "부모님", "text": "그냥 집에 있었지." }
  ],
  "emotion": {
    "label": "조금 쓸쓸한 분위기",
    "detail": "외출 감소를 언급했고 가족에게 먼저 연락하기를 망설임"
  },
  "topics": {
    "label": "산책 · 가족 사진",
    "detail": "반복해서 언급하며 상대적으로 긍정적으로 반응함"
  },
  "barrier": {
    "label": "자녀가 바쁠까 걱정",
    "detail": "먼저 연락하지 않는 이유를 직접 언급함"
  },
  "guide": {
    "headline": "전에 이야기한 산책로를 먼저 물어보세요.",
    "rationale": "상태 점검보다 부모님이 직접 꺼낸 일상 이야기에서 시작할 수 있습니다.",
    "openers": ["...", "...", "..."],
    "avoid": [
      { "text": "...", "reason": "..." }
    ],
    "coach_note": "상태 확인보다 다음 대화의 이유를 하나 만드는 데 집중하세요."
  }
}
```
