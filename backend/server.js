require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const { google } = require('googleapis');

// 라우트 파일 임포트
const cameraRoutes = require('./cameraRoutes');
const { extractScheduleLocations } = require('./scheduleLocationExtractor');

// 서버 시작 시 API 키 확인 (테스트)
console.log('=== API 키 상태 확인 ===');
console.log('Gemini API 키:', process.env.GEMINI_API_KEY ? '있음' : '없음');
console.log('OpenWeather API 키:', process.env.OPENWEATHER_API_KEY ? '있음' : '없음');
console.log('Google Maps API 키:', process.env.GOOGLE_MAPS_API_KEY ? '있음' : '없음');

// Module import
const { getUserProfile } = require('./userProfileUtils');
const { geocodeGoogle, reverseGeocode } = require('./locationUtils');
const { getWeatherByCoords } = require('./weatherUtils'); // 홈 화면 날씨 표시에 사용
const conversationStore = require('./conversationStore');
const { callGeminiForToolSelection, callGeminiForFinalResponse } = require('./geminiUtils');
const { availableTools, executeTool } = require('./tools');

// 프론트엔드와 연결을 위한 상수
const corsOptions = {
  origin: '*',
  methods: 'GET,POST,PUT,DELETE,OPTIONS',
  allowedHeaders: 'Content-Type,Authorization'
};

const app = express();
const PORT = 4000;

// 미들웨어 설정
app.use(cors({ origin: '*' }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// 라우트 등록
app.use('/camera', cameraRoutes);

// ✅ 필수 API 키
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

console.log('--- Lumee 백엔드 서버 시작 ---');

// ---------------------------------------------------------


// 채팅 제목 자동 생성 API
app.post('/generate-title', async (req, res) => {
  try {
    res.json({ title: 'New Weather Chat' });
  } catch (err) {
    res.json({ title: 'Weather Chat' });
  }
});

// Google Calendar API
app.post('/calendar/events', async (req, res) => {
  const { accessToken } = req.body;

  if (!accessToken) {
    return res.status(400).json({ error: 'Access Token is required' });
  }

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // 오늘부터 일주일 뒤까지의 일정 가져오기
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(now.getDate() + 7);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: nextWeek.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items.map(event => ({
      id: event.id,
      summary: event.summary,
      location: event.location || 'Unknown Location', // 위치 정보
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
      description: event.description
    }));

    // Gemini AI를 사용하여 위치 정보 추출 및 추가
    console.log('🤖 Gemini AI로 일정에서 위치 정보 추출 중...');
    const enrichedEvents = await extractScheduleLocations(events);
    console.log(`✅ 위치 추출 완료: ${enrichedEvents.length}개 일정 처리됨`);

    // 디버깅: 실제 반환되는 데이터 확인
    console.log('📤 프론트엔드로 전송하는 일정 데이터:');
    enrichedEvents.forEach((event, index) => {
      console.log(`  [${index}] ${event.summary} - ${event.start}`);
      console.log(`      장소: ${event.location}`);
      console.log(`      날씨조회위치: ${event.weatherLocation}`);
    });

    res.json(enrichedEvents);

  } catch (error) {
    console.error('Calendar API Error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar events' });
  }
});

// ✅ 구글 캘린더 일정 추가 API (새로 추가할 부분)
app.post('/calendar/events/create', async (req, res) => {
  const { accessToken, summary, location, description, startDateTime, endDateTime } = req.body;

  if (!accessToken) {
    return res.status(400).json({ error: 'Access Token is required' });
  }

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // 구글 API 형식에 맞게 데이터 구성
    const event = {
      summary: summary, // 일정 제목
      location: location || '', // 장소
      description: description || 'Lumee 앱에서 생성됨', // 설명
      start: {
        dateTime: startDateTime, // 예: "2026-01-21T15:00:00+09:00"
        timeZone: 'Asia/Seoul',
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'Asia/Seoul',
      },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    console.log('✅ 일정 생성 성공:', response.data.summary);
    res.json({ success: true, event: response.data });

  } catch (error) {
    console.error('Calendar Create Error:', error);
    res.status(500).json({ error: 'Failed to create calendar event' });
  }
});

// ✅ 구글 캘린더 일정 삭제 API
app.post('/calendar/events/delete', async (req, res) => {
  const { accessToken, eventId } = req.body;

  if (!accessToken || !eventId) {
    return res.status(400).json({ error: 'Access Token and Event ID are required' });
  }

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
    });

    console.log('✅ 일정 삭제 성공:', eventId);
    res.json({ success: true });
  } catch (error) {
    console.error('Calendar Delete Error:', error);
    res.status(500).json({ error: 'Failed to delete calendar event' });
  }
});

// 일정 수정
app.post('/calendar/events/update', async (req, res) => {
  const { accessToken, eventId, summary, location, description, startDateTime, endDateTime } = req.body;

  if (!accessToken || !eventId) {
    return res.status(400).json({ error: 'Access Token and Event ID are required' });
  }

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // ✅ patch에 넣을 body (googleapis는 resource 키로 받음)
    const resource = {};

    if (summary !== undefined) resource.summary = summary;
    if (location !== undefined) resource.location = location || '';
    if (description !== undefined) resource.description = description || '';

    // ✅ 시간 보정: start >= end면 end를 +1일로 보정 (오후→오전 케이스)
    const safeStart = startDateTime ? new Date(startDateTime) : null;
    let safeEnd = endDateTime ? new Date(endDateTime) : null;

    if (safeStart && safeEnd && safeEnd.getTime() <= safeStart.getTime()) {
      // end를 다음날로 +1일
      safeEnd = new Date(safeEnd.getTime() + 24 * 60 * 60 * 1000);
    }

    if (safeStart) {
      resource.start = { dateTime: safeStart.toISOString(), timeZone: 'Asia/Seoul' };
    }
    if (safeEnd) {
      resource.end = { dateTime: safeEnd.toISOString(), timeZone: 'Asia/Seoul' };
    }

    console.log('🛠 PATCH eventId:', eventId);
    console.log('🛠 PATCH resource:', JSON.stringify(resource, null, 2));

    const patched = await calendar.events.patch({
      calendarId: 'primary',
      eventId,
      resource,
    });

    return res.json({ success: true, event: patched.data });
  } catch (error) {
    console.error('❌ Calendar Update Error:', error?.response?.data || error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update calendar event',
      detail: error?.response?.data || String(error),
    });
  }
});

// ✨ LLM 중심 채팅 엔드포인트 ✨
app.post('/chat', async (req, res) => {
  const { userInput, coords, uid, schedule } = req.body;

  if (uid) {
    console.log(`💬 사용자 질문 (인증됨 - UID: ${uid}):`, userInput);
  } else {
    console.log(`💬 사용자 질문 (게스트):`, userInput);
  }

  conversationStore.addUserMessage(userInput);

  try {
    // 1. 사용자 프로필 로드
    const userProfile = await getUserProfile(uid);

    // 🔥 2. Google Calendar 일정을 userProfile에 병합
    if (schedule && Array.isArray(schedule) && schedule.length > 0) {
      userProfile.schedule = schedule;
      console.log(`📅 Google Calendar 일정 ${schedule.length}개 병합됨`);
    }

    // 2. 도구 선택
    const toolSelectionResponse = await callGeminiForToolSelection(userInput, availableTools);
    let functionCalls = toolSelectionResponse.candidates?.[0]?.content?.parts
      .filter(p => p.functionCall)
      .map(p => p.functionCall);

    if (!functionCalls) functionCalls = [];

    functionCalls = functionCalls.map(call => ({
      ...call,
      args: { ...call.args, user_input: userInput }
    }));

    // 3. 도구 실행
    const executionPromises = functionCalls.map(call => executeTool(call, coords, userProfile));
    const results = await Promise.allSettled(executionPromises);
    const toolOutputs = results.filter(r => r.status === 'fulfilled').map(r => r.value);

    // 4. 최종 Gemini 응답
    const finalResponse = await callGeminiForFinalResponse(
      userInput,
      toolSelectionResponse,
      toolOutputs,
      userProfile,
      functionCalls
    );

    const reply = finalResponse.candidates?.[0]?.content?.parts?.[0]?.text || '죄송해요, 답변 생성에 실패했어요.';

    // 🔥 [안전 장치] JSON 형식이 그대로 노출되는지 확인
    const containsRawJSON = (text) => {
      // JSON 객체 패턴 감지 (중괄호와 콜론이 함께 있는 경우)
      const jsonPattern = /\{[\s\S]*?["'][\s\S]*?:[\s\S]*?["'][\s\S]*?\}/;
      // get_full_weather 같은 함수명이 포함된 경우
      const functionPattern = /get_full_weather|get_.*_with_context/;
      return jsonPattern.test(text) || functionPattern.test(text);
    };

    // JSON이 감지되면 안전한 대체 메시지 제공
    let safeReply = reply;
    if (containsRawJSON(reply)) {
      console.error('⚠️ 경고: Gemini 응답에 JSON 형식이 감지되어 대체 메시지로 변환합니다.');
      console.error('원본 응답:', reply.substring(0, 200) + '...');

      // 날씨 데이터에서 기본 정보 추출하여 안전한 메시지 생성
      const fullWeather = toolOutputs.find(o => o.tool_function_name === 'get_full_weather_with_context');
      if (fullWeather?.output) {
        const { location, weather } = fullWeather.output;
        const temp = weather?.current?.temp ? Math.round(weather.current.temp) : null;
        const desc = weather?.current?.weather?.[0]?.description || '날씨';
        const userName = userProfile?.name || '사용자';

        safeReply = temp
          ? `${userName}님, 현재 ${location || '해당 지역'}의 날씨는 ${desc}이고 기온은 ${temp}도예요. 😊`
          : `${userName}님, 현재 ${location || '해당 지역'}의 날씨를 확인했어요! 😊`;
      } else {
        safeReply = '죄송해요, 날씨 정보를 표시하는 데 문제가 있었어요. 다시 질문해주시겠어요? 😥';
      }
    }

    const responsePayload = { reply: safeReply };

    // 날씨 데이터 찾기
    const fullWeather = toolOutputs.find(o => o.tool_function_name === 'get_full_weather_with_context');

    // 그래프 및 미세먼지 정보 추가
    const lowerInput = userInput.toLowerCase();

    // (1) 그래프 데이터
    if (['기온', '온도', '그래프', 'temp', 'what to wear', 'outfit'].some(k => lowerInput.includes(k))) {
      if (fullWeather?.output?.hourlyTemps?.length > 0) {
        responsePayload.graph = fullWeather.output.hourlyTemps;
        responsePayload.graphDate = fullWeather.output.date;
      }
    }

    // (2) 미세먼지 데이터
    if (['미세먼지', '먼지', '마스크', 'dust', 'air quality'].some(k => lowerInput.includes(k))) {
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

    // (3) 꽃가루 데이터
    if (['꽃가루', '알레르기', 'pollen', 'allergy'].some(k => lowerInput.includes(k))) {
      if (fullWeather?.output?.pollen) {
        const pollenData = fullWeather.output.pollen;
        // Google Pollen API 응답 형식
        responsePayload.pollen = {
          type: pollenData.type,           // "grass_pollen", "tree_pollen", "weed_pollen"
          value: pollenData.value,         // UPI 0-5
          category: pollenData.category,   // "Very low", "Low", "Moderate", "High", "Very high"
          level: pollenData.category,      // 프론트엔드 호환성
          inSeason: pollenData.inSeason,   // 시즌 여부
          date: fullWeather.output.date
        };
      }
    }

    res.json(responsePayload);

  } catch (err) {
    console.error('❌ /chat 처리 오류:', err.message);
    res.status(500).json({ error: '요청 처리 중 오류가 발생했습니다.' });
  }
});

// 주소 변환 API
app.post('/reverse-geocode', async (req, res) => {
  const { latitude, longitude } = req.body;
  try {
    const region = await reverseGeocode(latitude, longitude);
    res.json({ region });
  } catch (err) {
    res.status(500).json({ error: '주소 변환 실패' });
  }
});

// 날씨 API
app.post('/weather', async (req, res) => {
  const { latitude, longitude } = req.body;
  try {
    const weather = await getWeatherByCoords(latitude, longitude);
    res.json(weather);
  } catch (err) {
    res.status(500).json({ error: '날씨 정보 실패' });
  }
});

// 그래프용 날씨 API
app.post('/weather-graph', async (req, res) => {
  const { latitude, longitude } = req.body;
  try {
    const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${latitude}&lon=${longitude}&exclude=minutely,daily,alerts&appid=${OPENWEATHER_API_KEY}&units=metric&lang=kr`;
    const result = await axios.get(url);
    const data = result.data;

    const hourly = data.hourly;
    const offsetMs = (data.timezone_offset || 0) * 1000;
    const localNow = new Date(new Date().getTime() + offsetMs);
    localNow.setMinutes(0, 0, 0);

    const hourlyTemps = [];
    for (let i = 0; i < 6; i++) {
      const targetLocalTime = new Date(localNow.getTime() + i * 3 * 60 * 60 * 1000);
      const targetUTC = new Date(targetLocalTime.getTime() - offsetMs);

      // 가장 가까운 시간 찾기
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
    res.status(500).json({ error: '그래프 데이터 실패' });
  }
});

app.listen(PORT, () => {
  console.log(`[HTTP] API 서버가 ${PORT} 포트에서 실행 중입니다.`);
});