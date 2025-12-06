require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');

// 라즈베리파이 통신을 위한 모듈들을 불러오기
const { WebSocketServer } = require('ws');

// 라우트 파일 임포트
const cameraRoutes = require('./cameraRoutes');


// 서버 시작 시 API 키 확인 (테스트)
console.log('=== API 키 상태 확인 ===');
console.log('Gemini API 키:', process.env.GEMINI_API_KEY ? '있음' : '없음');
console.log('OpenWeather API 키:', process.env.OPENWEATHER_API_KEY ? '있음' : '없음');
console.log('Ambee API 키:', process.env.AMBEE_POLLEN_API_KEY ? '있음' : '없음');

// Module import
const { getUserProfile } = require('./userProfileUtils');
const { geocodeGoogle, reverseGeocode } = require('./locationUtils');
const { getWeatherByCoords } = require('./weatherUtils'); // 홈 화면 날씨 표시에 사용
const conversationStore = require('./conversationStore');
const { callGeminiForToolSelection, callGeminiForFinalResponse } = require('./geminiUtils');
const { availableTools, executeTool } = require('./tools');
// 🔥 LED 컨트롤러 함수 가져오기 (이 줄이 꼭 있어야 합니다!)
const { setupLEDRoutes, determineLEDStatus, adjustBrightnessForUser } = require('./ledController');

//프론트엔드와 연결을 위한 상수
const corsOptions = {
  origin: '*',
  methods: 'GET,POST,PUT,DELETE,OPTIONS',
  allowedHeaders: 'Content-Type,Authorization'
};

const app = express();
const PORT = 4000;

// 미들웨어 설정
app.use(cors({ origin: '*' })); // 모든 출처 허용 (개발용)
app.use(bodyParser.json({ limit: '50mb' })); // 🔥 이미지 전송을 위해 용량 제한 늘림
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// 라우트 등록
app.use('/camera', cameraRoutes);

// ✅ 필수 API 키
const GEMINI_API_KEY       = process.env.GEMINI_API_KEY;
const OPENWEATHER_API_KEY  = process.env.OPENWEATHER_API_KEY;
const GOOGLE_MAPS_API_KEY  = process.env.GOOGLE_MAPS_API_KEY;
const AMBEE_POLLEN_API_KEY = process.env.AMBEE_POLLEN_API_KEY;

app.use(cors(corsOptions));
app.use(bodyParser.json());

// Express 앱을 기반으로 HTTP 서버를 생성 (웹소켓을 연결하기 위함)
const server = http.createServer(app);

// HTTP 서버에 웹소켓 서버를 연결
const wss = new WebSocketServer({ server });

console.log('--- Lumee 백엔드 서버 시작 ---');

// LED 라우트 설정
setupLEDRoutes(app);

// 라즈베리파이로부터 Wi-Fi를 통해 노크 신호를 받을 엔드포인트
app.post('/knock', (req, res) => {
    console.log('[HTTP] ✊ 라즈베리파이로부터 "KNOCK" 신호 수신!');
    
    // 연결된 모든 프론트엔드 클라이언트에게 "KNOCK" 메시지 전송
    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send('KNOCK');
        }
    });
    
    res.status(200).send('OK'); // 라즈베리파이에게 정상 수신 응답
});

//  채팅 제목 자동 생성 API
app.post('/generate-title', async (req, res) => {
  const { userInput } = req.body;
  
  try {
    // ... (기존 로직 유지)
    res.json({ title: 'New Weather Chat' }); // 간소화
  } catch (err) {
    res.json({ title: 'Weather Chat' });
  }
});

// 🔥🔥🔥 [중요] 이 함수가 없어서 에러가 난 것입니다! 여기에 추가해주세요! 🔥🔥🔥
function mapWeatherIdToCondition(id) {
  if (id >= 200 && id < 300) return "Thunderstorm";
  if (id >= 300 && id < 500) return "Drizzle";
  if (id >= 500 && id < 600) return "Rain";
  if (id >= 600 && id < 700) return "Snow";
  if (id >= 700 && id < 800) return "Mist"; // 안개, 연무 등
  if (id === 800) return "Clear";
  if (id > 800) return "Clouds";
  return "Clear";
}

// ✨ 신규 LLM 중심 채팅 엔드포인트 ✨
app.post('/chat', async (req, res) => {
    const { userInput, coords, uid } = req.body;
    console.log(`💬 사용자 질문 (UID: ${uid}):`, userInput);
    conversationStore.addUserMessage(userInput);

    try {
      // 1. 사용자 프로필 미리 가져오기 (도구 실행에 필요함)
      const userProfile = await getUserProfile(uid);
      if (userProfile) console.log(`👤 사용자 프로필 로드됨:`, userProfile.schedule);

      // 2. 도구 선택
      const toolSelectionResponse = await callGeminiForToolSelection(userInput, availableTools);
      let functionCalls = toolSelectionResponse.candidates?.[0]?.content?.parts
        .filter(p => p.functionCall)
        .map(p => p.functionCall);

      functionCalls = functionCalls.map(call => ({
        ...call,
        args: {
          ...call.args,
          user_input: userInput
        }
      }));

      if (!functionCalls || functionCalls.length === 0) {
        throw new Error('도구 선택이 이루어지지 않았습니다.');
      }

      // 3. 도구 실행 (🔥 중요: userProfile을 세 번째 인자로 전달)
      const executionPromises = functionCalls.map(call => executeTool(call, coords, userProfile));
      const results = await Promise.allSettled(executionPromises);
      const toolOutputs = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      results.filter(r => r.status === 'rejected').forEach(r => console.error('❌ 도구 실행 실패:', r.reason));

      // 4. 최종 Gemini 응답 생성
      const finalResponse = await callGeminiForFinalResponse(
        userInput,
        toolSelectionResponse,
        toolOutputs,
        userProfile,
        functionCalls
      );

      const reply = finalResponse.candidates?.[0]?.content?.parts?.[0]?.text || '죄송해요, 답변 생성에 실패했어요.';
      console.log('🤖 최종 생성 답변:', reply);
      
      const responsePayload = { reply };

      // 5. 사용자 질문에 따른 그래프/미세먼지/LED 데이터 첨부
      const fullWeather = toolOutputs.find(o => o.tool_function_name === 'get_full_weather_with_context');
      const lowerInput = userInput.toLowerCase();

      // 🔥 [LED 제어 로직] 여기서 mapWeatherIdToCondition 함수를 사용합니다!
      if (fullWeather && fullWeather.output) {
        const w = fullWeather.output.weather || {};
        const a = fullWeather.output.air || {};
        const p = fullWeather.output.pollen || {};

        // ledController.js가 기대하는 포맷으로 매핑
        const mappedWeatherData = {
          temperature: w.temp,
          feelsLike: w.feelsLike,
          pm10: a.pm10 || 0,
          pm25: a.pm25 || 0,
          ozone: 0, 
          uvIndex: w.uvi || 0,
          pollen: p.count || 0,
          precipitation: w.rain_1h || 0,
          weather: mapWeatherIdToCondition(w.weatherId), // 👈 여기서 에러가 났던 겁니다!
          clouds: w.clouds || 0,
          humidity: w.humidity || 0
        };

        // LED 상태 결정
        let ledStatus = determineLEDStatus(mappedWeatherData);

        // 사용자 맞춤 조정
        if (userProfile) {
          ledStatus = adjustBrightnessForUser(ledStatus, userProfile);
        }

        // 응답에 LED 상태 추가
        responsePayload.ledStatus = {
          r: ledStatus.color.r,
          g: ledStatus.color.g,
          b: ledStatus.color.b,
          effect: ledStatus.effect,
          duration: ledStatus.duration,
          priority: ledStatus.priority,
          message: ledStatus.message 
        };
        
        console.log(`🎨 예보 기반 LED 설정: ${ledStatus.message}`);
      }

      // 그래프 조건
      if (lowerInput.includes('기온') || lowerInput.includes('온도') || lowerInput.includes('그래프')
        || lowerInput.includes('temperature') || lowerInput.includes('temp') || lowerInput.includes('graph') 
        || lowerInput.includes('뭐 입을까') || lowerInput.includes('뭐 입지') || lowerInput.includes('옷')
        || lowerInput.includes('what should i wear') || lowerInput.includes('what to wear') || lowerInput.includes('clothing') || lowerInput.includes('outfit')
        || lowerInput.includes('air') || lowerInput.includes('quality') || lowerInput.includes('dust') || lowerInput.includes('mask') || lowerInput.includes('pollution')) {
        if (fullWeather?.output?.hourlyTemps?.length > 0) {
          responsePayload.graph = fullWeather.output.hourlyTemps;
          responsePayload.graphDate = fullWeather.output.date;
        }
      }

      // 미세먼지 조건
      if (lowerInput.includes('미세먼지') || lowerInput.includes('먼지') || lowerInput.includes('공기') || lowerInput.includes('마스크') 
        || lowerInput.includes('air') || lowerInput.includes('mask') || lowerInput.includes('dust') || lowerInput.includes('quality') || lowerInput.includes('pollution')) {
        if (fullWeather?.output?.air?.pm25 !== undefined) {
          const pm25 = fullWeather.output.air.pm25;
          const getAirLevel = v => v <= 15 ? 'Good' : v <= 35 ? 'Moderate' : v <= 75 ? 'Poor' : 'Very Poor';
          responsePayload.dust = {
            value: pm25,
            level: getAirLevel(pm25),
            date: fullWeather.output.date
          };
        }
      }

      res.json(responsePayload);

    } catch (err) {
      const errorMessage =
        err.response?.data?.error?.message ||
        err.response?.data ||
        err.message ||
        '요청 처리 중 오류가 발생했습니다.';

      console.error('❌ /chat 처리 오류:', errorMessage);
      res.status(500).json({ error: errorMessage });
    }
});

// ... 나머지 API (reverse-geocode, weather, weather-graph) ...
// 기존 코드 유지 (지면 관계상 생략, 위쪽 코드만 바꿔도 충분합니다)

app.post('/reverse-geocode', async (req, res) => {
  const { latitude, longitude } = req.body;
  try {
    const region = await reverseGeocode(latitude, longitude);
    res.json({ region });
  } catch (err) {
    res.status(500).json({ error: '주소 변환 실패' });
  }
});

app.post('/weather', async (req, res) => {
  const { latitude, longitude } = req.body;
  try {
    const weather = await getWeatherByCoords(latitude, longitude);
    res.json(weather);
  } catch (err) {
    res.status(500).json({ error: '날씨 정보를 불러오는 데 실패했습니다.' });
  }
});

app.post('/weather-graph', async (req, res) => {
  const { latitude, longitude } = req.body;
  try {
    const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${latitude}&lon=${longitude}&exclude=minutely,daily,alerts&appid=${OPENWEATHER_API_KEY}&units=metric&lang=kr`;
    const result = await axios.get(url);
    const data = result.data;

    const hourly = data.hourly;
    const timezoneOffsetSec = data.timezone_offset || 0;
    const offsetMs = timezoneOffsetSec * 1000;

    const utcNow = new Date();
    const localNow = new Date(utcNow.getTime() + offsetMs);
    localNow.setMinutes(0, 0, 0);

    const hourlyTemps = [];
    for (let i = 0; i < 6; i++) {
      const targetLocalTime = new Date(localNow.getTime() + i * 3 * 60 * 60 * 1000);
      const targetUTC = new Date(targetLocalTime.getTime() - offsetMs);
      const closest = hourly.reduce((prev, curr) => {
        const currTime = curr.dt * 1000;
        return Math.abs(currTime - targetUTC.getTime()) < Math.abs(prev.dt * 1000 - targetUTC.getTime()) ? curr : prev;
      });

      const hour = new Date(targetUTC.getTime() + offsetMs).getUTCHours();
      const label = `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'am' : 'pm'}`;

      hourlyTemps.push({
        hour: label,
        temp: Math.round(closest.temp)
      });
    }

    res.json({ hourlyTemps });

  } catch (err) {
    console.error('📊 시간별 기온 그래프용 API 실패:', err.message);
    res.status(500).json({ error: '그래프용 날씨 데이터를 불러오는 데 실패했습니다.' });
  }
});

server.listen(PORT, () => {
  console.log(`[HTTP] API 서버가 ${PORT} 포트에서 실행 중입니다.`);
  console.log(`[웹소켓] 통신 서버가 ${PORT} 포트에서 함께 실행 중입니다.`);
});