const screens = [...document.querySelectorAll('.demo-screen')];
const steps = [...document.querySelectorAll('.step-item')];
const audioUpload = document.getElementById('audioUpload');
const uploadZone = document.getElementById('uploadZone');
const chooseFileBtn = document.getElementById('chooseFileBtn');
const audioPreview = document.getElementById('audioPreview');
const audioPlayer = document.getElementById('audioPlayer');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const uploadTitle = document.getElementById('uploadTitle');
const uploadSub = document.getElementById('uploadSub');
const analyzeBtn = document.getElementById('analyzeBtn');
const sampleBtn = document.getElementById('sampleBtn');
const transcriptBox = document.getElementById('transcriptBox');
const transcriptLog = document.getElementById('transcriptLog');
const transcriptSource = document.getElementById('transcriptSource');
const insightGrid = document.getElementById('insightGrid');
const analysisActions = document.getElementById('analysisActions');
const analysisStatus = document.getElementById('analysisStatus');
const analysisError = document.getElementById('analysisError');
const progressBar = document.querySelector('.progress-line i');
const toast = document.getElementById('toast');

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const API_ENDPOINT = window.BRIDGECARE_API_URL || '/api/analyze';

let selectedFile = null;
let isDemoSample = false;
let lastResult = null;
let objectUrl = null;

const sampleResult = {
  summary: '최근 외출이 줄었고 가족에게 먼저 연락하기를 망설이는 모습이 나타났습니다.',
  transcript: [
    { speaker: 'AI', text: '오늘은 컨디션이 좀 어떠세요?' },
    { speaker: '부모님', text: '몸은 괜찮아. 근데 요즘 집에만 있으니까 심심하긴 하지.' },
    { speaker: 'AI', text: '밖에 나가고 싶으실 때는 어디가 제일 생각나세요?' },
    { speaker: '부모님', text: '아파트 뒤 산책로. 예전엔 친구랑 자주 걸었는데 요즘은 서로 시간이 잘 안 맞네.' },
    { speaker: 'AI', text: '지난번에 말씀하신 손녀 사진은 보셨어요?' },
    { speaker: '부모님', text: '봤지. 근데 애들이 바쁠까봐 내가 먼저 연락하기도 좀 그렇고.' }
  ],
  emotion: {
    label: '가벼운 외로움',
    detail: '직접적으로 힘들다고 말하지 않지만 외출 감소와 연락을 망설이는 표현이 반복됩니다.'
  },
  topics: {
    label: '산책 · 가족 사진',
    detail: '건강 자체보다 일상 경험과 가족 소식에 더 긍정적으로 반응했습니다.'
  },
  barrier: {
    label: '“바쁠까봐” 먼저 연락 못함',
    detail: '자녀에게 부담을 주고 싶지 않다는 생각이 먼저 연락하지 않는 이유로 보입니다.'
  },
  guide: {
    headline: '“요즘 건강은 괜찮아?”보다 “그 산책로 요즘도 걷기 좋아?”',
    rationale: '부모님은 관리받는 느낌보다 자신의 일상을 궁금해해주는 대화에 더 자연스럽게 반응할 가능성이 높습니다.',
    openers: [
      '엄마, 전에 말한 아파트 뒤 산책로 있잖아. 요즘 날씨엔 걷기 괜찮아?',
      '이번에 손녀 사진 새로 찍었는데 보내줄까? 엄마가 좋아할 것 같더라.',
      '이번 주말 시간 되면 내가 같이 좀 걸을까?'
    ],
    avoid: [
      { text: '요즘 왜 집에만 있어?', reason: '통제받는 느낌을 줄 수 있습니다.' },
      { text: '밥은 챙겨 먹었어? 약은?', reason: '질문이 점검표처럼 느껴질 수 있습니다.' },
      { text: '외로우면 먼저 연락하지 그랬어.', reason: '연락을 망설인 감정을 탓하는 표현이 됩니다.' }
    ],
    coach_note: '오늘의 목표는 상태 확인이 아니라 다음 대화의 이유 만들기입니다. 자연스럽게 이어질 약속을 하나 남겨보세요.'
  }
};

function setScreen(step) {
  screens.forEach(screen => screen.classList.toggle('active', screen.dataset.screen === String(step)));
  steps.forEach(item => item.classList.toggle('active', item.dataset.step === String(step)));
}

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / 1024 / 1024;
  return mb < 1 ? `${(bytes / 1024).toFixed(0)} KB` : `${mb.toFixed(1)} MB`;
}

function inferMimeType(file) {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ({
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    mp4: 'audio/mp4',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    flac: 'audio/flac'
  })[ext] || 'audio/mpeg';
}

function loadFile(file) {
  if (!file) return;
  if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|mp4|aac|ogg|flac)$/i.test(file.name)) {
    showToast('음성 파일만 업로드할 수 있습니다.');
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    showToast('현재 실제 분석은 3MB 이하 파일만 지원합니다.');
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
  uploadSub.textContent = '분석 시작 시 음성이 Gemini API로 전송됩니다. 3MB 이하 파일만 지원합니다.';
  analyzeBtn.disabled = false;
}

chooseFileBtn.addEventListener('click', (e) => {
  e.preventDefault();
  audioUpload.click();
});
audioUpload.addEventListener('change', (e) => loadFile(e.target.files?.[0]));

['dragenter', 'dragover'].forEach(eventName => {
  uploadZone.addEventListener(eventName, e => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach(eventName => {
  uploadZone.addEventListener(eventName, e => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
  });
});
uploadZone.addEventListener('drop', e => loadFile(e.dataTransfer.files?.[0]));

sampleBtn.addEventListener('click', () => {
  selectedFile = null;
  isDemoSample = true;
  lastResult = null;
  audioPreview.classList.add('hidden');
  uploadTitle.textContent = '샘플 통화가 선택되었습니다';
  uploadSub.textContent = '샘플 모드는 API를 호출하지 않고 전체 화면 흐름만 시연합니다.';
  analyzeBtn.disabled = false;
  showToast('샘플 통화를 불러왔습니다.');
});

function resetAnalysisUI() {
  transcriptBox.classList.add('hidden');
  insightGrid.classList.add('hidden');
  analysisActions.classList.add('hidden');
  analysisError.classList.add('hidden');
  analysisError.textContent = '';
  analysisStatus.textContent = '분석 중';
  analysisStatus.className = 'status-chip processing';
  progressBar.style.width = '8%';
  ['progressTranscript','progressEmotion','progressTopic','progressGuide'].forEach(id => {
    document.getElementById(id).classList.remove('done');
  });
}

function markProgress(id, width) {
  document.getElementById(id).classList.add('done');
  progressBar.style.width = `${width}%`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      resolve(value.includes(',') ? value.split(',')[1] : value);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function requestGeminiAnalysis(file) {
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
  if (!response.ok) throw new Error(data.error || `분석 요청 실패 (${response.status})`);
  if (!data.result) throw new Error('분석 결과가 비어 있습니다.');
  return data.result;
}

function renderResult(result, sourceLabel) {
  lastResult = result;
  transcriptSource.textContent = sourceLabel;
  transcriptLog.innerHTML = '';

  const transcript = Array.isArray(result.transcript) && result.transcript.length
    ? result.transcript
    : [{ speaker: 'AI', text: result.summary || '전사 결과가 없습니다.' }];

  transcript.slice(0, 14).forEach(item => {
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

  document.getElementById('emotionLabel').textContent = result.emotion?.label || '분석 근거 부족';
  document.getElementById('emotionDetail').textContent = result.emotion?.detail || result.summary || '';
  document.getElementById('topicsLabel').textContent = result.topics?.label || '분석 근거 부족';
  document.getElementById('topicsDetail').textContent = result.topics?.detail || '';
  document.getElementById('barrierLabel').textContent = result.barrier?.label || '분석 근거 부족';
  document.getElementById('barrierDetail').textContent = result.barrier?.detail || '';

  document.getElementById('guideHeadline').textContent = result.guide?.headline || '오늘의 대화 주제를 찾지 못했습니다.';
  document.getElementById('guideRationale').textContent = result.guide?.rationale || '';

  const openerEls = [...document.querySelectorAll('[data-opener]')];
  openerEls.forEach((el, index) => {
    el.textContent = result.guide?.openers?.[index] || '대화 맥락을 더 확인해보세요.';
  });

  const avoidRows = [...document.querySelectorAll('[data-avoid-row]')];
  avoidRows.forEach((row, index) => {
    const item = result.guide?.avoid?.[index] || { text: '단정적인 질문', reason: '충분한 맥락을 확인한 뒤 대화하는 편이 좋습니다.' };
    row.querySelector('p').childNodes[0].nodeValue = item.text;
    row.querySelector('span').textContent = item.reason;
  });

  document.getElementById('coachNote').textContent = result.guide?.coach_note || '다음 대화가 이어질 작은 이유를 만들어보세요.';
}

async function runAnalysis() {
  resetAnalysisUI();
  setScreen(2);
  analyzeBtn.disabled = true;

  try {
    let result;
    if (isDemoSample) {
      await new Promise(resolve => setTimeout(resolve, 450));
      markProgress('progressTranscript', 28);
      await new Promise(resolve => setTimeout(resolve, 380));
      result = sampleResult;
    } else {
      if (!selectedFile) throw new Error('먼저 음성 파일을 선택해주세요.');
      result = await requestGeminiAnalysis(selectedFile);
    }

    transcriptBox.classList.remove('hidden');
    markProgress('progressEmotion', 52);
    await new Promise(resolve => setTimeout(resolve, 220));
    markProgress('progressTopic', 76);
    await new Promise(resolve => setTimeout(resolve, 180));
    markProgress('progressGuide', 100);

    renderResult(result, isDemoSample ? '발표용 샘플 데이터' : 'Gemini 3.6 Flash 실제 분석');
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
    showToast('분석에 실패했습니다. 설정을 확인해주세요.');
  } finally {
    analyzeBtn.disabled = false;
  }
}

analyzeBtn.addEventListener('click', runAnalysis);
document.getElementById('showGuideBtn').addEventListener('click', () => setScreen(3));
document.getElementById('backToUpload').addEventListener('click', () => setScreen(1));
document.getElementById('backToAnalysis').addEventListener('click', () => setScreen(2));

steps.forEach(item => item.addEventListener('click', () => {
  const step = Number(item.dataset.step);
  if (step === 1) setScreen(1);
  if (step === 2 && (!analysisActions.classList.contains('hidden'))) setScreen(2);
  if (step === 3 && (!analysisActions.classList.contains('hidden'))) setScreen(3);
}));

document.querySelectorAll('[data-scroll]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelector(btn.dataset.scroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

document.getElementById('copyGuideBtn').addEventListener('click', async () => {
  const result = lastResult || sampleResult;
  const openers = result.guide?.openers || [];
  const avoid = result.guide?.avoid || [];
  const text = `오늘의 부모님 대화 가이드\n\n먼저 꺼낼 주제\n${result.guide?.headline || ''}\n\n추천 문장\n${openers.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\n피하면 좋은 표현\n${avoid.map((x, i) => `${i + 1}. ${x.text} — ${x.reason}`).join('\n')}\n\nAI 코치\n${result.guide?.coach_note || ''}`;
  try {
    await navigator.clipboard.writeText(text);
    showToast('가이드가 복사되었습니다.');
  } catch {
    showToast('브라우저에서 복사를 허용하지 않았습니다.');
  }
});
