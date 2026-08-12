# 이어봄 BridgeCare — Gemini API Demo

2026-08-12 기준으로 전체 파일을 다시 맞춘 버전입니다.

## 구조

```text
bridgecare-gemini-20260812/
├─ index.html
├─ styles.css
├─ app.js
├─ package.json
├─ README.md
└─ api/
   ├─ analyze.js
   └─ health.js
```

## 이번 버전의 API 기준

- 모델: `gemini-3.6-flash`
- API: Gemini Interactions API
- REST endpoint: `POST https://generativelanguage.googleapis.com/v1beta/interactions`
- 오디오 입력: `input` 배열에 `{ type: "audio", data, mime_type }`를 직접 전달
- 구조화 출력: 최상위 `response_format` 배열에 `{ type: "text", mime_type: "application/json", schema }`
- 별도 Google SDK를 설치하지 않고 REST를 직접 호출하므로 SDK 버전 불일치가 없습니다.
- `gemini-2.5-flash` fallback은 사용하지 않습니다.

## GitHub Pages

GitHub Pages에서는 HTML/CSS/JS와 **샘플 모드**만 확인할 수 있습니다. `/api` 서버 함수는 실행되지 않습니다.

## Vercel

1. 이 폴더의 파일 전체를 GitHub 저장소 루트에 업로드합니다.
2. Vercel 프로젝트가 그 GitHub 저장소를 연결하도록 합니다.
3. Vercel Environment Variable을 정확히 다음 이름으로 등록합니다.

```text
GEMINI_API_KEY=실제_키
```

4. 새 GitHub commit으로 Vercel의 새 Deployment가 생성되는지 확인합니다.
5. Vercel 주소에서 `서버 연결 확인`을 먼저 누릅니다.

### 진단 URL

Vercel 주소가 `https://example.vercel.app`라면:

- `https://example.vercel.app/api/health`
  - Vercel이 환경변수를 읽는지만 검사합니다.
- `https://example.vercel.app/api/health?probe=1`
  - Gemini 3.6 Flash에 실제 텍스트 요청을 한 번 보내 모델 접근까지 검사합니다.

음성 분석 전에 `probe=1`이 성공하면 문제 범위를 오디오 요청 쪽으로 좁힐 수 있습니다.

## 파일 크기

Vercel Function의 요청 본문 제한이 4.5MB이고 브라우저가 음성을 base64로 변환하면 크기가 약 4/3으로 증가합니다. 이 데모는 안전 여유를 두기 위해 **원본 약 2.5MB 이하** 파일을 권장합니다.

## 보안/개인정보

- API Key를 `app.js`나 `index.html`에 넣지 마세요.
- API Key는 Vercel의 `GEMINI_API_KEY` 환경변수에만 둡니다.
- Gemini 무료 티어 데이터는 Google 제품 개선에 사용될 수 있으므로, 발표 테스트에서는 실제 가족의 민감정보가 없는 녹음을 사용하세요.
