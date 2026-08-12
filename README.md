# 이어봄 — Gemini API 2단계 안정화 버전 (2026-08-12)

이 버전은 Vercel + Gemini API로 실제 음성 분석을 수행합니다.

## 왜 2단계인가

Gemini 오디오 입력과 구조화 출력(JSON Schema)을 한 요청에 결합했을 때 500 Internal error가 발생하는 경우를 분리하기 위해 다음처럼 구성했습니다.

1. `gemini-3.6-flash`로 음성 -> 텍스트 전사 (구조화 출력 없음)
2. 같은 `gemini-3.6-flash`로 전사 텍스트 -> JSON 분석

둘 다 Google이 계속 지원한다고 명시한 `generateContent` API의 현재 `gemini-3.6-flash` 모델을 사용합니다. 구형 Gemini 2.5 fallback은 없습니다.

## 배포

1. 이 폴더의 내용을 GitHub 저장소 루트에 업로드합니다.
2. Vercel 프로젝트가 저장소와 연결되어 있으면 새 커밋이 자동 배포됩니다.
3. Vercel Environment Variables에 `GEMINI_API_KEY`를 설정합니다.
4. 새 Deployment가 Ready가 된 뒤 Vercel 주소에서 테스트합니다.

## 진단

먼저 사이트의 `서버 연결 확인`을 누릅니다. 성공하면 Gemini 키/모델/기본 API 호출은 정상입니다.

실제 분석 실패 시 오류 단계가 다음처럼 분리됩니다.

- `transcription`: 오디오 -> 전사 단계
- `analysis`: 전사 -> 구조화 분석 단계
- `analysis-parse`: Gemini 응답 JSON 파싱 단계

## 지원 음성

MP3, WAV, AIFF, AAC, OGG, FLAC. 공식 Gemini Audio understanding 문서의 지원 MIME 목록에 없는 M4A는 이번 버전에서 제외했습니다.
