# Lumee Backend - Ollama Integration

Lumee 백엔드 서버를 Ollama로 전환하여 무료 로컬 AI 기능을 사용합니다.

## 🎯 주요 변경사항

### Before (Gemini API)
- ✅ Google Gemini 2.0 Flash API 사용
- ❌ API 호출 비용 발생
- ❌ 인터넷 연결 필요
- ❌ API 키 관리 필요

### After (Ollama)
- ✅ Llama 3.1 8B 로컬 모델 사용
- ✅ **완전 무료** (API 비용 없음)
- ✅ 로컬 실행 (인터넷 불필요)
- ✅ API 키 불필요
- ✅ 데이터 프라이버시 보장

## 🚀 시작하기

### 1. Ollama 설치

**Windows:**
1. [Ollama 다운로드 페이지](https://ollama.com/download) 방문
2. Windows 설치 파일 다운로드 및 실행
3. 설치 완료 후 PowerShell에서 확인:
   ```powershell
   ollama --version
   ```

### 2. AI 모델 다운로드

```powershell
# 텍스트 생성 모델 (채팅, 날씨 조언 등)
ollama pull llama3.1:8b

# 이미지 분석 모델 (옷차림 분석)
ollama pull llava
```

### 3. Ollama 서버 실행

**별도 터미널에서 실행** (백그라운드 서비스):
```powershell
ollama serve
```

기본 포트: `http://localhost:11434`

### 4. 환경 변수 설정

`.env` 파일이 이미 구성되어 있습니다:

```env
# Ollama 설정
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
OLLAMA_VISION_MODEL=llava

# 기타 API (계속 필요)
OPENWEATHER_API_KEY=your_openweather_key
GOOGLE_MAPS_API_KEY=your_google_maps_key
```

### 5. 백엔드 서버 시작

```powershell
cd backend
npm start
```

서버가 `http://localhost:4000`에서 실행됩니다.

## 🧪 테스트

### 채팅 기능 테스트 (한국어)

```powershell
curl -X POST http://localhost:4000/chat -H "Content-Type: application/json" -d '{\"userInput\": \"오늘 날씨 어때?\", \"coords\": {\"latitude\": 37.5665, \"longitude\": 126.9780}}'
```

### 채팅 기능 테스트 (영어)

```powershell
curl -X POST http://localhost:4000/chat -H "Content-Type: application/json" -d '{\"userInput\": \"How is the weather today?\", \"coords\": {\"latitude\": 37.5665, \"longitude\": 126.9780}}'
```

### 기대 결과

자연스러운 한국어/영어로 날씨 정보 제공:
```json
{
  "reply": "순일님, 현재 서울의 날씨는 맑고 기온은 15도예요. 😊 가벼운 가디건을 챙기시면 좋을 것 같아요!"
}
```

## 📊 성능 비교

| 항목 | Gemini 2.0 Flash | Llama 3.1 8B (Ollama) |
|------|------------------|----------------------|
| **비용** | 유료 ($0.000125/1k 토큰) | **무료** |
| **속도** | ~2초 (네트워크 포함) | ~3-5초 (로컬) |
| **한국어 품질** | 매우 우수 | 우수 |
| **프라이버시** | 클라우드 전송 | **로컬 처리** |
| **인터넷** | 필요 | **불필요** |

## 🔧 트러블슈팅

### 1. Ollama 서버 연결 실패

**문제:** `Error: connect ECONNREFUSED 127.0.0.1:11434`

**해결:**
```powershell
# 별도 터미널에서 Ollama 서버 실행
ollama serve
```

### 2. 모델을 찾을 수 없음

**문제:** `Error: model 'llama3.1:8b' not found`

**해결:**
```powershell
ollama pull llama3.1:8b
ollama list  # 모델 확인
```

### 3. 이미지 분석 실패

**문제:** 카메라 기능에서 옷차림 분석 실패

**해결:**
```powershell
ollama pull llava  # 멀티모달 모델 다운로드
```

### 4. 응답 속도가 너무 느림

**해결 방법:**
- GPU가 있다면 Ollama가 자동으로 사용합니다
- CPU만 있다면 Llama 3.1 8B 대신 더 작은 모델 사용 고려:
  ```powershell
  ollama pull llama3.1:3b  # 더 빠른 모델
  ```
  `.env`에서 `OLLAMA_MODEL=llama3.1:3b`로 변경

### 5. 한국어 품질이 떨어짐

Llama 3.1은 영어 중심이지만 한국어도 지원합니다. 더 나은 한국어 품질을 원하면:
- **옵션 1:** Gemini API 병행 사용 (비용 발생)
- **옵션 2:** 한국어 fine-tuned 모델 사용 (커뮤니티 모델 검색)

## 🔄 Gemini로 롤백하기

문제가 발생하면 언제든지 Gemini로 되돌릴 수 있습니다:

1. `.env` 파일 수정:
   ```env
   GEMINI_API_KEY=your_api_key  # 주석 해제
   ```

2. `server.js` 수정 (line 23):
   ```javascript
   const { callGeminiForToolSelection, callGeminiForFinalResponse } = require('./geminiUtils');
   ```

3. 서버 재시작

## 📦 파일 구조

```
backend/
├── ollamaUtils.js          # 새로 추가됨 - Ollama API 통합
├── server.js               # 수정됨 - Ollama 사용
├── scheduleLocationExtractor.js  # 수정됨 - Ollama 사용
├── cameraRoutes.js         # 수정됨 - Ollama Vision 사용
├── geminiUtils.js          # 백업용 유지 (더 이상 사용 안 함)
└── .env                    # 수정됨 - Ollama 설정 추가
```

## 🎓 추가 학습 자료

- [Ollama 공식 문서](https://github.com/ollama/ollama)
- [Llama 3.1 모델 소개](https://ai.meta.com/blog/meta-llama-3-1/)
- [Ollama 모델 라이브러리](https://ollama.com/library)

## 💡 팁

### 모델 메모리 관리

```powershell
# 현재 로드된 모델 확인
ollama ps

# 메모리에서 모델 언로드
ollama stop llama3.1:8b
```

### 커스텀 모델 파라미터

`ollamaUtils.js`에서 temperature, top_p 등을 조정할 수 있습니다:

```javascript
options: {
  temperature: 0.7,  // 0-1, 높을수록 창의적
  top_p: 0.9,        // 응답 다양성
  top_k: 40,         // 고려할 토큰 수
}
```

---

**축하합니다! 🎉 이제 무료로 AI 기반 날씨 어시스턴트를 사용할 수 있습니다!**
