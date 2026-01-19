// airPollenService.js

const axios = require('axios');
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// ✅ 미세먼지 정보 가져오기
async function getAirQuality(lat, lon) {
  try {
    const urlV3 = `https://api.openweathermap.org/data/3.0/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`;
    const res = await axios.get(urlV3);
    const data = res.data;
    const pm25 = data.list[0].components.pm2_5;
    const pm10 = data.list[0].components.pm10;
    return { pm25, pm10 };
  } catch (err) {
    const urlV25 = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`;
    try {
      const res = await axios.get(urlV25);
      const data = res.data;
      const pm25 = data.list[0].components.pm2_5;
      const pm10 = data.list[0].components.pm10;
      return { pm25, pm10 };
    } catch (fallbackErr) {
      console.error('❌ 미세먼지 API 호출 실패:', fallbackErr.message);
      return null;
    }
  }
}

// Google Pollen API 호출 함수
async function getPollenGoogle(lat, lon) {
  try {
    const url = 'https://pollen.googleapis.com/v1/forecast:lookup';

    const res = await axios.get(url, {
      params: {
        key: GOOGLE_MAPS_API_KEY,
        'location.latitude': lat,
        'location.longitude': lon,
        days: 1,  // 오늘 데이터만 요청
        languageCode: 'ko'  // 한국어 응답
      }
    });

    // 응답 전체를 콘솔에 찍어서 실제 구조를 확인
    console.log('🌲 Google Pollen API 응답:', JSON.stringify(res.data, null, 2));

    const dailyInfo = res.data?.dailyInfo;
    if (!Array.isArray(dailyInfo) || dailyInfo.length === 0) {
      console.warn('🌲 Google Pollen API 응답에 dailyInfo가 없거나 비어 있습니다.');
      return null;
    }

    // 첫 번째 날(오늘)의 정보
    const today = dailyInfo[0];
    const pollenTypes = today.pollenTypeInfo;  // GRASS, TREE, WEED 배열

    if (!Array.isArray(pollenTypes) || pollenTypes.length === 0) {
      console.warn('🌲 꽃가루 타입 정보가 없습니다.');
      return null;
    }

    // UPI(Universal Pollen Index) 값이 가장 높은 타입 찾기
    // indexInfo가 있는 경우에만 비교, 없으면 첫 번째 타입 사용
    let topPollen = pollenTypes[0];
    for (const pollen of pollenTypes) {
      const currentValue = pollen.indexInfo?.value ?? 0;
      const topValue = topPollen.indexInfo?.value ?? 0;
      if (currentValue > topValue) {
        topPollen = pollen;
      }
    }

    // Google Pollen API 응답 형식:
    // - code: "GRASS", "TREE", "WEED"
    // - displayName: "잔디", "나무", "잡초" (한국어)
    // - indexInfo.value: 0-5 (UPI) - 선택적, 없을 수 있음
    // - indexInfo.category: "None", "Very low", "Low", "Moderate", "High", "Very high" - 선택적
    // - inSeason: boolean - 선택적

    const pollenCode = topPollen.code;  // "GRASS", "TREE", "WEED"
    const upiValue = topPollen.indexInfo?.value ?? 0;
    const category = topPollen.indexInfo?.category || 'Very low';  // indexInfo 없으면 기본값
    const inSeason = topPollen.inSeason ?? true;  // 시즌 정보 없으면 true로 간주

    // ⚠️ indexInfo가 없으면 로그 출력 (디버깅용)
    if (!topPollen.indexInfo) {
      console.warn('⚠️ indexInfo가 없습니다. 기본값 사용:', {
        code: pollenCode,
        displayName: topPollen.displayName,
        defaultCategory: category,
        defaultValue: upiValue
      });
    }

    // Google API 원본 코드명 사용 (GRASS, TREE, WEED)
    return {
      type: pollenCode,            // "GRASS", "TREE", "WEED"
      value: upiValue,             // 0-5 (UPI 지수), indexInfo 없으면 0
      category: category,          // "None", "Very low", "Low", "Moderate", "High", "Very high"
      risk: category,              // 호환성을 위해 category를 risk로도 제공
      inSeason: inSeason,          // 시즌 여부
      time: new Date().toISOString()  // 현재 시간
    };
  } catch (err) {
    console.error('🌲 Google Pollen API 호출 오류:', {
      status: err.response?.status,
      statusText: err.response?.statusText,
      data: err.response?.data || err.message
    });
    return null;
  }
}

module.exports = {
  getAirQuality,
  getPollenGoogle
};
