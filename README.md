# 🔮 Lumee 2.0 - 똑똑한 감성 날씨 어시스턴트

> "사용자 취향과 건강 민감도를 반영해, 가장 필요한 날씨 정보를 선별해주는 AI 날씨 비서"


## 📌 프로젝트 개요

- 개발 기간: 2025.09.19 ~ 2025.12.19
- 개발 목적: 2025 캡스톤 디자인 프로젝트 1 과제전



## 🚀 주요 기능

- 🔍 LLM 기반 자연어 질문 인식: `"마스크 써야 해?"`, `"서울 비와?"`, `"우산 챙길까?"`
- 🌐 사용자 위치 기반 자동 날씨 제공
- 🎯 사용자 민감 요소/취미 기반 맞춤형 조언
- 📊 기온/미세먼지 그래프 시각화
- 🧠 LLM에게 실시간 날씨 정보를 넘겨 최종 응답 생성
- 🤚 노크 인터렉션 기반 음성인식 실행
- 📸 카메라로 촬영한 옷차림 분석 제공
- 🌟 생성한 응답을 기준으로 날씨정보를 시각화 (유리 구슬 LED , 홀로그램)



## 💻 링크

- PREVIEW: [Demo Video: Lumee⛅🔮](https://youtu.be/baEqa20eOGI)
- WORKSPACE: [Team Project: Lumee⛅🔮](https://www.notion.so/Aurora-Studio-Lumee-2-0-2030e11d4cf280c38f63de812d22286a?source=copy_link)



## 👥 팀원

| 이름 | 역할 |
| --- | --- |
| 홍순일 (팀장) | PM, Tech Lead, LLM기반 응답 알고리즘 개편, 아두이노 & 라즈베리파이 회로 설계 및 연동 구현, 옷차림 이미지 분석 알고리즘 설계, 촬영 및 하드웨어 연동 프론트엔드 UI 구현, 날씨정보 시각화 알고리즘 설계 (홀로그램, 유리구슬 LED), Git관리 및 팀 코드 리뷰 |
| 정지은 | UI 레이아웃 및 화면 구조 프론트엔드 구현, 화면 구성 요소의 인터랙션 및 스타일 반영, Firebase 기반 사용자 일정 추가 |
| 문수현 | UI 세부 디자인 요소 개선 및 수정, Lumee 홀로그램 영상 제작, Lumee 앱 소개 영상 공동 제작, 전시 소품/포스터 제작 |
| 이지윤 | UI 디자인 컨셉 수립, Lumee 앱 소개 영상 공동 제작, 전시 소품/포스터 제작 |
| 조현지 | UI 디자인, 기획안 콘텐츠 구성 및 시각 자료 정리, 디자인 레퍼런스 조사 및 분석, 전시 소품/포스터 제작 |



## 🛠️ 사용 기술 스택

| 분야 | 기술 |
| --- | --- |
| 프론트엔드 | React, Tailwind CSS, Recharts |
| 백엔드 | Node.js |
| AI 모델 | Gemini API (Google Generative AI) |
| 데이터 API | OpenWeather(날씨), Ambee(꽃가루), Google Geocoding(위치) |
| DB | Firebase Realtime Database |
| 배포 | GithubPage(FE), Render (BE) |
| 생성형 AI 영상 제작 | Midjourney(구슬 컨셉 디자인), Runway(구슬 영상 생성) |
| 아두이노 | FastLED, SoftwareSerial |
| 라즈베리파이 | picamera2, flask, RPi.GPIO, threading |


## 📂 프로젝트 구조

### 1. 리포지토리

[**Front : weather-assistant-frontend-v2**](https://github.com/HongSoonIL/weather-assistant-frontend-v2.git)

[**Back : weather-assistant-backend-v2**](https://github.com/HongSoonIL/weather-assistant-backend-v2.git)

[**HW : weather-assistant-HW-v2**](https://github.com/HongSoonIL/weather-assistant-HW-v2.git)

### 2. 파일구조

```markdown
📂 weather-assistant-frontend
┣  📂 weather-assistant
 ┃  ┗ 📂 src
 ┃    ┣ 📂 screens
 ┃    ┣ 📂 services
 ┃    ┣ 📜 App.js
 ┃    ┗ ...
 ┗ ...
📂 weather-assistant-backend
 ┗ 📂 backend
   ┣ 🔒 .env
   ┣ 📜 server.js
   ┣ 📜 tools.js
   ┣ 📜 geminiUtils.js
   ┣ 📜 weatherUtils.js
   ┣ 📜 userProfileUtils.js
   ┗ ...
📂 weather-assistant-HW
  ┗ 📂 Claud_LED
    ┣ 📜 Claud_LED.ino
  ┗ 📂 Claud_LED2
    ┣ 📜 Claud_LED2.ino
  ┣ 📜 raspi_camera.py
```



## ⚙️ 로컬 실행 방법

### 1. 백엔드 실행

```bash
bash
cd weather-assistant-backend/backend
npm init -y
npm install express cors body-parser axios
npm install firebase
node server.js
```

### 2. 프론트엔드 실행

```bash
cd weather-assistant-frontend/weather-assistant
npm install
npm install chart.js react-chartjs-2
npm start
```

### 3. `.env` 파일 설정

```makefile
GEMINI_API_KEY=YOUR_GEMINI_API_KEY              # Gemini API 키 (LLM 질문 응답)
OPENWEATHER_API_KEY=YOUR_OPENWEATHER_API_KEY    # 날씨 데이터
GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY    # 좌표 → 주소
AMBEE_POLLEN_API_KEY=YOUR_AMBEE_POLLEN_API_KEY  # 꽃가루 정보
RASPI_CAMERA_URL=YOUR_RASPI_CAMERA_URL          # 라즈베리파이 카메라 서버 주소
REACT_APP_BACKEND_URL=YOUR_REACT_APP_BACKEND_URL# 백엔드 서버 주소
REACT_APP_RASPI_UR=YOUR_REACT_APP_RASPI_UR      # 라즈베리파이 카메라 서버 주소
```

### 라즈베리파이 실행

```
cd Desktop
source Lumee/bin/activate
python raspi_camera.py
```

