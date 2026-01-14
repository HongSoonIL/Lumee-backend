// scheduleLocationExtractor.js
const { model } = require('./geminiUtils');

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
      1. '장소' 필드가 있다면 최우선으로 분석하여 행정구역으로 변환합니다. (예: "코엑스" -> "강남구", "스타벅스 서면점" -> "부산 부산진구")
      2. '장소' 필드가 없다면 '내용'을 분석하여 위치를 추론합니다. (예: "제주도 여행 출발" -> "제주도")
      3. 화상 회의, 온라인 미팅, 또는 위치를 도저히 알 수 없는 개인 일정은 결과에 포함시키지 마세요.
      4. 결과는 반드시 아래와 같은 **JSON 배열 형식**으로만 출력해야 합니다. 마크다운이나 다른 설명은 절대 포함하지 마세요.
      
      [출력 예시]
      [
        {"index": 0, "weatherLocation": "서울 강남구"},
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

module.exports = { extractScheduleLocations };