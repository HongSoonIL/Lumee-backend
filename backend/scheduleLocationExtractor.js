// scheduleLocationExtractor.js
const { model } = require('./geminiUtils');

/**
 * 날짜 객체를 로컬 시간대 기준 YYYY-MM-DD 문자열로 변환
 * (toISOString()은 UTC로 변환하므로 타임존 문제 발생)
 */
function toLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 구글 캘린더 이벤트 목록에서 날씨 예보에 필요한 행정구역 단위의 위치 정보를 추출합니다.
 * Gemini AI를 사용하여 비정형 장소 데이터(예: "스타벅스 강남점")를 표준 지역명(예: "강남구")으로 변환합니다.
 * * @param {Array} events - 구글 캘린더 이벤트 객체 배열 
 * [{ summary: string, location: string, start: string, end: string, ... }]
 * @returns {Promise<Array>} - weatherLocation 필드가 추가된 이벤트 배열
 */
async function extractScheduleLocations(events) {
  // 1. 이벤트가 없거나 배열이 아닌 경우 빈 배열 반환
  if (!events || !Array.isArray(events) || events.length === 0) {
    console.log("No events to process.");
    return [];
  }

  try {
    // 2. Gemini에게 보낼 프롬프트 구성
    // 각 이벤트에 인덱스를 부여하여 AI가 식별할 수 있도록 함
    const eventListString = events.map((e, index) =>
      `ID: ${index}
       - 내용: ${e.summary}
       - 장소: ${e.location || '정보 없음'}
       - 시간: ${e.start}`
    ).join('\n\n');

    const prompt = `
      당신은 일정을 분석하여 날씨 예보를 위한 '정확한 위치(도시/구 단위)'를 추출하는 AI 비서입니다.
      
      아래 제공된 일정 목록을 분석하여 각 일정의 위치를 대한민국 행정구역 단위(시/군/구) 또는 주요 해외 도시명으로 변환해주세요.
      
      [분석 규칙]
      1. '장소' 필드에 **구체적인 주소나 지역명**이 포함되어 있다면 행정구역으로 변환합니다. 
         (예: "코엑스 강남점" -> "서울 강남구", "스타벅스 서면점" -> "부산 부산진구", "제주공항" -> "제주도")
      2. 장소가 "카페", "식당", "병원" 같이 **구체적인 지역 정보가 없는 일반 명칭**이라면 **반드시 weatherLocation을 null로 설정**하세요.
      3. '장소' 필드가 없다면 '내용'을 분석하여 명확한 위치를 추론합니다. (예: "제주도 여행 출발" -> "제주도")
      4. 화상 회의, 온라인 미팅, 재택근무 등 물리적 위치가 불필요한 일정은 weatherLocation을 null로 설정하세요.
      5. 결과는 반드시 아래와 같은 **JSON 배열 형식**으로만 출력해야 합니다. 마크다운이나 다른 설명은 절대 포함하지 마세요.
      
      [출력 예시]
      [
        {"index": 0, "weatherLocation": "서울 강남구"},
        {"index": 1, "weatherLocation": null},
        {"index": 2, "weatherLocation": "부산 해운대구"}
      ]

      [일정 목록]
      ${eventListString}
    `;

    // 3. Gemini 모델 호출
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // 4. JSON 파싱 및 데이터 정제
    // Gemini가 가끔 마크다운 코드 블록(```json ... ```)을 포함할 수 있으므로 이를 제거
    const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

    let extractedLocations = [];
    try {
      extractedLocations = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error("Gemini Response Parsing Error:", parseError);
      console.log("Raw Response:", responseText);
      // 파싱 실패 시 원본 이벤트 반환 (위치 정보 없이)
      return events;
    }

    // 5. 원본 이벤트 객체에 추출된 위치 정보(weatherLocation) 병합
    // 추출된 결과가 있는 일정만 weatherLocation을 추가하고, 나머지는 원본 유지
    const enrichedEvents = events.map((event, index) => {
      const locationData = extractedLocations.find(item => item.index === index);
      return {
        ...event,
        // AI가 추출한 위치가 있으면 사용, 없으면 기존 location 사용, 그것도 없으면 null
        weatherLocation: locationData ? locationData.weatherLocation : (event.location || null)
      };
    });

    return enrichedEvents;

  } catch (error) {
    console.error("Error in extractScheduleLocations:", error);
    // 에러 발생 시 원본 이벤트를 그대로 반환하여 앱이 멈추지 않도록 함
    return events;
  }
}

/**
 * 사용자의 일정에서 특정 날짜에 해당하는 위치 정보를 추출합니다.
 * @param {Object} userProfile - 사용자 프로필 객체 (schedule 필드 포함)
 * @param {Date} requestedDate - 조회할 날짜
 * @returns {string|null} - 추출된 위치 정보 또는 null
 */
function getLocationFromSchedule(userProfile, requestedDate) {
  // 1. 유효성 검사
  if (!userProfile || !userProfile.schedule || !Array.isArray(userProfile.schedule)) {
    console.log('⚠️ 유효한 일정 데이터가 없습니다.');
    return null;
  }

  if (!requestedDate || isNaN(requestedDate.getTime())) {
    console.log('⚠️ 유효하지 않은 날짜입니다.');
    return null;
  }

  // 2. 날짜를 YYYY-MM-DD 형식으로 변환 (로컬 시간대 기준)
  const targetDateStr = toLocalDateString(requestedDate);
  console.log(`🔍 일정 검색 날짜: ${targetDateStr}`);

  // 3. 일정에서 해당 날짜 찾기
  const matchingSchedule = userProfile.schedule.find(schedule => {
    if (!schedule.date) return false;

    // schedule.date가 다양한 형식일 수 있으므로 파싱
    let scheduleDate;
    if (schedule.date.includes('T')) {
      // ISO 형식 (2026-01-16T18:30:00+09:00)
      scheduleDate = schedule.date.split('T')[0];
    } else {
      // 이미 YYYY-MM-DD 형식
      scheduleDate = schedule.date;
    }

    return scheduleDate === targetDateStr;
  });

  // 4. 위치 추출
  if (!matchingSchedule) {
    console.log(`📅 ${targetDateStr}에 해당하는 일정이 없습니다.`);
    return null;
  }

  // weatherLocation 우선, 없으면 location 사용
  const location = matchingSchedule.weatherLocation || matchingSchedule.location;

  if (location) {
    console.log(`✅ 일정 발견: "${matchingSchedule.summary || matchingSchedule.title}" - 위치: ${location}`);
    return location;
  } else {
    console.log(`📅 일정은 있으나 위치 정보가 없습니다: "${matchingSchedule.summary || matchingSchedule.title}"`);
    return null;
  }
}

/**
 * 사용자의 일정에서 특정 날짜에 해당하는 모든 위치 정보를 추출합니다.
 * @param {Object} userProfile - 사용자 프로필 객체 (schedule 필드 포함)
 * @param {Date} requestedDate - 조회할 날짜
 * @returns {Array} - 추출된 일정 배열 [{summary, location, weatherLocation, start}, ...]
 */
function getAllLocationsFromSchedule(userProfile, requestedDate) {
  // 1. 유효성 검사
  if (!userProfile || !userProfile.schedule || !Array.isArray(userProfile.schedule)) {
    console.log('⚠️ 유효한 일정 데이터가 없습니다.');
    return [];
  }

  if (!requestedDate || isNaN(requestedDate.getTime())) {
    console.log('⚠️ 유효하지 않은 날짜입니다.');
    return [];
  }

  // 2. 날짜를 YYYY-MM-DD 형식으로 변환 (로컬 시간대 기준)
  const targetDateStr = toLocalDateString(requestedDate);
  console.log(`🔍 일정 검색 날짜: ${targetDateStr}`);

  // 3. 일정에서 해당 날짜의 모든 일정 찾기
  const matchingSchedules = userProfile.schedule.filter(schedule => {
    if (!schedule.date && !schedule.start) return false;

    // schedule.date 또는 schedule.start 사용
    const dateStr = schedule.date || schedule.start;

    // 다양한 형식 파싱
    let scheduleDate;
    if (dateStr.includes('T')) {
      // ISO 형식 (2026-01-16T18:30:00+09:00)
      scheduleDate = dateStr.split('T')[0];
    } else {
      // 이미 YYYY-MM-DD 형식
      scheduleDate = dateStr;
    }

    return scheduleDate === targetDateStr;
  });

  // 4. 위치 정보가 있는 일정만 필터링
  const schedulesWithLocation = matchingSchedules
    .map(schedule => {
      const location = schedule.weatherLocation || schedule.location;
      if (!location) return null;

      return {
        summary: schedule.summary || schedule.title || '일정',
        location: schedule.location,
        weatherLocation: location,
        start: schedule.start || schedule.date
      };
    })
    .filter(schedule => schedule !== null);

  if (schedulesWithLocation.length > 0) {
    console.log(`✅ ${targetDateStr}에 위치가 포함된 일정 ${schedulesWithLocation.length}개 발견:`);
    schedulesWithLocation.forEach((schedule, index) => {
      console.log(`  [${index + 1}] "${schedule.summary}" - 위치: ${schedule.weatherLocation}`);
    });
  } else {
    console.log(`📅 ${targetDateStr}에 위치가 포함된 일정이 없습니다.`);
  }

  return schedulesWithLocation;
}

module.exports = {
  extractScheduleLocations,
  getLocationFromSchedule,
  getAllLocationsFromSchedule
};