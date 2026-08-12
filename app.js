const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const screens = $$('.demo-screen');
const steps = $$('.step-item');
const audioUpload = $('#audioUpload');
const uploadZone = $('#uploadZone');
const chooseFileBtn = $('#chooseFileBtn');
const audioPreview = $('#audioPreview');
const audioPlayer = $('#audioPlayer');
const fileName = $('#fileName');
const fileSize = $('#fileSize');
const uploadTitle = $('#uploadTitle');
const uploadSub = $('#uploadSub');
const analyzeBtn = $('#analyzeBtn');
const sampleBtn = $('#sampleBtn');
const healthBtn = $('#healthBtn');
const runtimeBanner = $('#runtimeBanner');
const runtimeTitle = $('#runtimeTitle');
const runtimeDetail = $('#runtimeDetail');
const modeChip = $('#modeChip');
const transcriptBox = $('#transcriptBox');
const transcriptLog = $('#transcriptLog');
const transcriptSource = $('#transcriptSource');
const summaryText = $('#summaryText');
const insightGrid = $('#insightGrid');
const analysisActions = $('#analysisActions');
const analysisStatus = $('#analysisStatus');
const analysisError = $('#analysisError');
const progressBar = $('.progress-line i');
const toast = $('#toast');

const MAX_FILE_BYTES = 2.5 * 1024 * 1024;
const API_ENDPOINT = '/api/analyze';
const HEALTH_ENDPOINT = '/api/health';
const isGitHubPages = location.hostname.endsWith('github.io');

let selectedFile = null;
let isDemoSample = false;
let lastResult = null;
let objectUrl = null;

const sampleResult = {
  summary: '최근 외출이 줄었고, 가족에게 먼저 연락하기를 망설이는 표현이 나타났습니다.',
  transcript: [
    { speaker: 'AI', text: '오늘은 컨디션이 좀 어떠세요?' },
    { speaker: '부모님', text: '몸은 괜찮아. 근데 요즘 집에만 있으니까 심심하긴 하지.' },
    { speaker: 'AI', text: '밖에 나가고 싶으실 때는 어디가 제일 생각나세요?' },
    { speaker: '부모님', text: '아파트 뒤 산책로. 예전엔 친구랑 자주 걸었는데 요즘은 서로 시간이 잘 안 맞네.' },
    { speaker: 'AI', text: '가족들과는 연락 자주 하세요?' },
    { speaker: '부모님', text: '애들이 바쁠까봐 내가 먼저 연락하기도 좀 그렇고.' }
  ],
  emotion: { label: '가벼운 외로움', detail: '외출이 줄고 가족에게 먼저 연락하기를 망설이는 표현이 반복됩니다.' },
  topics: { label: '산책 · 가족 소식', detail: '건강 점검보다 일상 경험과 가족 소식에 자연스럽게 반응했습니다.' },
  barrier: { label: '“바쁠까봐” 연락을 망설임', detail: '자녀에게 부담을 주고 싶지 않다는 생각이 먼저 연락하지 않는 이유로 보입니다.' },
  guide: {
    headline: '“요즘 건강은 괜찮아?”보다 “그 산책로 요즘도 걷기 좋아?”',
    rationale: '부모님이 직접 꺼낸 일상 소재에서 시작하면 관리받는 느낌을 줄이고 자연스럽게 대화를 이어갈 수 있습니다.',
    openers: [
      '엄마, 전에 말한 아파트 뒤 산책로 있잖아. 요즘 걷기 괜찮아?',
      '요즘 산책할 때 뭐가 제일 좋았어?',
      '이번 주말 시간 되면 같이 조금 걸을까?'
    ],
    avoid: [
      { text: '요즘 왜 집에만 있어?', reason: '통제받거나 평가받는 느낌을 줄 수 있습니다.' },
      { text: '밥은 먹었어? 약은?', reason: '대화가 점검표처럼 느껴질 수 있습니다.' },
      { text: '외로우면 먼저 연락하지 그랬어.', reason: '연락을 망설인 감정을 탓하는 표현이 될 수 있습니다.' }
    ],
    coach_note: '오늘의 목표는 상태 확인보다 다음 대화가 이어질 작은 이유를 만드는 것입니다.'
  }
};

function setScreen(step) {
  screens.forEach(screen => screen.classList.toggle('active', screen.dataset.screen === String(step)));
  steps.forEach(item => item.classList.toggle('active', item.dataset.step === String(step)));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2300);
}

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function inferMimeType(file) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const byExtension = {
    mp3: 'audio/mp3', wav: 'audio/wav', aiff: 'audio/aiff', aif: 'audio/aiff',
    aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac'
  };
  return byExtension[ext] || file.type || '';
}

function isSupportedAudio(file) {
  return /\.(mp3|wav|aiff?|aac|ogg|flac)$/i.test(file.name) ||
    ['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/aiff','audio/x-aiff','audio/aac','audio/ogg','audio/flac'].includes(file.type);
}

function loadFile(file) {
  if (!file) return;
  if (!isSupportedAudio(file)) {
    showToast('지원하는 음성 파일을 선택해주세요.');
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    showToast('현재 데모는 원본 약 2.5MB 이하 파일을 권장합니다.');
    return;
  }

  selectedFile = file;
  isDemoSample = false;
  lastResult = null;
  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);

  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  audioPlayer.src = objectUrl;
  audioPreview.classList.remove('hidden');
  uploadTitle.textContent = '음성 파일이 준비되었습니다';
  uploadSub.textContent = isGitHubPages
    ? 'GitHub Pages에서는 실제 API가 실행되지 않습니다. Vercel 주소에서 분석해주세요.'
    : 'AI 분석 시작을 누르면 음성이 Vercel을 거쳐 Gemini API로 전송됩니다.';
  analyzeBtn.disabled = isGitHubPages;
}

function resetAnalysisUI() {
  transcriptBox.classList.add('hidden');
  insightGrid.classList.add('hidden');
  analysisActions.classList.add('hidden');
  analysisError.classList.add('hidden');
  analysisError.textContent = '';
  analysisStatus.textContent = '분석 중';
  analysisStatus.className = 'status-chip processing';
  progressBar.style.width = '8%';
  ['progressTranscript','progressEmotion','progressTopic','progressGuide'].forEach(id => $(`#${id}`).classList.remove('done'));
}

function markProgress(id, width) {
  $(`#${id}`).classList.add('done');
  progressBar.style.width = `${width}%`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      resolve(dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl);
    };
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

async function requestAnalysis(file) {
  const audioBase64 = await fileToBase64(file);
  markProgress('progressTranscript', 28);

  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioBase64,
      mimeType: inferMimeType(file),
      fileName: file.name
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    const stage = data.stage ? `\n단계: ${data.stage}` : '';
    const google = data.googleStatus ? `\nGemini HTTP: ${data.googleStatus}` : '';
    throw new Error(`${data.error || `분석 요청 실패 (${response.status})`}${stage}${google}`);
  }
  if (!data.result) throw new Error('분석 결과가 비어 있습니다.');
  return { result: data.result, meta: data.meta };
}

function renderResult(result, sourceLabel) {
  lastResult = result;
  transcriptSource.textContent = sourceLabel;
  summaryText.textContent = result.summary || '요약 결과가 없습니다.';
  transcriptLog.innerHTML = '';

  const transcript = Array.isArray(result.transcript) && result.transcript.length
    ? result.transcript
    : [{ speaker: '화자', text: '전사 결과가 없습니다.' }];

  transcript.slice(0, 18).forEach(item => {
    const row = document.createElement('div');
    const parentLike = /부모|어머니|아버지|엄마|아빠/.test(item.speaker || '');
    row.className = `bubble ${parentLike ? 'parent' : 'ai'}`;
    const speaker = document.createElement('span');
    speaker.textContent = item.speaker || '화자';
    const text = document.createElement('p');
    text.textContent = item.text || '';
    row.append(speaker, text);
    transcriptLog.appendChild(row);
  });

  $('#emotionLabel').textContent = result.emotion?.label || '근거 부족';
  $('#emotionDetail').textContent = result.emotion?.detail || '';
  $('#topicsLabel').textContent = result.topics?.label || '근거 부족';
  $('#topicsDetail').textContent = result.topics?.detail || '';
  $('#barrierLabel').textContent = result.barrier?.label || '근거 부족';
  $('#barrierDetail').textContent = result.barrier?.detail || '';
  $('#guideHeadline').textContent = result.guide?.headline || '대화 주제를 찾지 못했습니다.';
  $('#guideRationale').textContent = result.guide?.rationale || '';

  $$('[data-opener]').forEach((el, index) => {
    el.textContent = result.guide?.openers?.[index] || '대화 맥락을 더 확인해보세요.';
  });

  $$('[data-avoid-row]').forEach((row, index) => {
    const item = result.guide?.avoid?.[index] || { text: '단정적인 표현', reason: '충분한 맥락을 확인한 뒤 대화해보세요.' };
    row.querySelector('.avoid-text').textContent = item.text;
    row.querySelector('small').textContent = item.reason;
  });

  $('#coachNote').textContent = result.guide?.coach_note || '다음 대화가 이어질 작은 이유를 만들어보세요.';
}

async function runAnalysis() {
  if (!isDemoSample && isGitHubPages) {
    showToast('실제 분석은 Vercel 주소에서 실행해주세요.');
    return;
  }

  resetAnalysisUI();
  setScreen(2);
  analyzeBtn.disabled = true;

  try {
    let result;
    let sourceLabel;

    if (isDemoSample) {
      await new Promise(resolve => setTimeout(resolve, 500));
      markProgress('progressTranscript', 30);
      result = sampleResult;
      sourceLabel = '발표용 샘플 데이터';
    } else {
      if (!selectedFile) throw new Error('먼저 음성 파일을 선택해주세요.');
      const apiResult = await requestAnalysis(selectedFile);
      result = apiResult.result;
      sourceLabel = `${apiResult.meta?.model || 'Gemini'} · 실제 분석`;
    }

    transcriptBox.classList.remove('hidden');
    renderResult(result, sourceLabel);
    markProgress('progressEmotion', 55);
    await new Promise(resolve => setTimeout(resolve, 150));
    markProgress('progressTopic', 78);
    await new Promise(resolve => setTimeout(resolve, 120));
    markProgress('progressGuide', 100);
    insightGrid.classList.remove('hidden');
    analysisActions.classList.remove('hidden');
    analysisStatus.textContent = '분석 완료';
    analysisStatus.className = 'status-chip positive';
  } catch (error) {
    console.error(error);
    analysisStatus.textContent = '분석 실패';
    analysisStatus.className = 'status-chip error';
    analysisError.textContent = error.message || '분석 중 오류가 발생했습니다.';
    analysisError.classList.remove('hidden');
  } finally {
    analyzeBtn.disabled = isGitHubPages && !isDemoSample;
  }
}

async function checkHealth() {
  if (isGitHubPages) {
    runtimeBanner.className = 'runtime-banner warning';
    runtimeTitle.textContent = 'GitHub Pages 미리보기';
    runtimeDetail.textContent = '정적 호스팅이라 /api 함수가 없습니다. 실제 분석은 Vercel 배포 주소에서 실행하세요.';
    modeChip.textContent = 'Sample only';
    modeChip.className = 'status-chip neutral';
    return;
  }

  healthBtn.disabled = true;
  runtimeTitle.textContent = 'Vercel 서버 확인 중…';
  runtimeDetail.textContent = '환경변수와 Gemini 모델 접근을 순서대로 검사합니다.';

  try {
    const response = await fetch(`${HEALTH_ENDPOINT}?probe=1`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || `서버 확인 실패 (${response.status})`);

    runtimeBanner.className = 'runtime-banner good';
    runtimeTitle.textContent = 'Gemini 연결 정상';
    runtimeDetail.textContent = `${data.model} · Interactions API 연결 성공`;
    modeChip.textContent = 'Gemini Live';
    modeChip.className = 'status-chip positive';
  } catch (error) {
    runtimeBanner.className = 'runtime-banner bad';
    runtimeTitle.textContent = '서버 연결 확인 필요';
    runtimeDetail.textContent = error.message;
    modeChip.textContent = 'Check API';
    modeChip.className = 'status-chip error';
  } finally {
    healthBtn.disabled = false;
  }
}

chooseFileBtn.addEventListener('click', event => { event.preventDefault(); audioUpload.click(); });
audioUpload.addEventListener('change', event => loadFile(event.target.files?.[0]));
['dragenter','dragover'].forEach(name => uploadZone.addEventListener(name, event => { event.preventDefault(); uploadZone.classList.add('dragover'); }));
['dragleave','drop'].forEach(name => uploadZone.addEventListener(name, event => { event.preventDefault(); uploadZone.classList.remove('dragover'); }));
uploadZone.addEventListener('drop', event => loadFile(event.dataTransfer.files?.[0]));

sampleBtn.addEventListener('click', () => {
  selectedFile = null;
  isDemoSample = true;
  lastResult = null;
  audioPreview.classList.add('hidden');
  uploadTitle.textContent = '샘플 통화가 선택되었습니다';
  uploadSub.textContent = '샘플 모드는 API를 호출하지 않습니다.';
  analyzeBtn.disabled = false;
  showToast('샘플 통화를 불러왔습니다.');
});

analyzeBtn.addEventListener('click', runAnalysis);
healthBtn.addEventListener('click', checkHealth);
$('#showGuideBtn').addEventListener('click', () => setScreen(3));
$('#backToUpload').addEventListener('click', () => setScreen(1));
$('#backToAnalysis').addEventListener('click', () => setScreen(2));

steps.forEach(item => item.addEventListener('click', () => {
  const step = Number(item.dataset.step);
  if (step === 1) setScreen(1);
  if (step === 2 && !analysisActions.classList.contains('hidden')) setScreen(2);
  if (step === 3 && !analysisActions.classList.contains('hidden')) setScreen(3);
}));

$$('[data-scroll]').forEach(button => button.addEventListener('click', () => {
  $(button.dataset.scroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}));

$('#copyGuideBtn').addEventListener('click', async () => {
  const result = lastResult || sampleResult;
  const openers = result.guide?.openers || [];
  const avoid = result.guide?.avoid || [];
  const text = `오늘의 부모님 대화 가이드\n\n먼저 꺼낼 주제\n${result.guide?.headline || ''}\n\n추천 문장\n${openers.map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\n피하면 좋은 표현\n${avoid.map((x,i)=>`${i+1}. ${x.text} — ${x.reason}`).join('\n')}\n\nAI 코치\n${result.guide?.coach_note || ''}`;
  try {
    await navigator.clipboard.writeText(text);
    showToast('가이드가 복사되었습니다.');
  } catch {
    showToast('브라우저에서 복사를 허용하지 않았습니다.');
  }
});

if (isGitHubPages) {
  runtimeBanner.className = 'runtime-banner warning';
  runtimeTitle.textContent = 'GitHub Pages 미리보기';
  runtimeDetail.textContent = '화면/샘플 데모는 정상 작동합니다. 실제 Gemini 분석은 Vercel 주소에서 실행하세요.';
  modeChip.textContent = 'Sample only';
  modeChip.className = 'status-chip neutral';
} else {
  runtimeTitle.textContent = 'Vercel 배포라면 연결 확인을 눌러보세요';
  runtimeDetail.textContent = '먼저 텍스트 한 줄로 Gemini 3.6 Flash 연결을 검사한 뒤 음성을 테스트할 수 있습니다.';
  modeChip.textContent = 'Gemini Live';
  modeChip.className = 'status-chip positive';
}
