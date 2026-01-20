const axios = require('axios');
const conversationStore = require('./conversationStore');

/**
 * Ollama API 호출 관련 로직을 모아놓은 유틸리티 파일입니다.
 * Gemini API를 대체하여 로컬 Ollama로 LLM 기능을 제공합니다.
 */

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';

const ollamaApi = axios.create({
    baseURL: OLLAMA_BASE_URL,
    timeout: 120000, // 2분 타임아웃 (로컬 추론 시간 고려)
});

// 🔥 언어 감지 함수
function detectLanguage(text) {
    const koreanRegex = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/;
    return koreanRegex.test(text) ? 'ko' : 'en';
}

/**
 * Ollama를 사용하여 도구 선택을 수행합니다.
 * Gemini의 Function Calling을 프롬프트 기반 JSON 응답으로 대체합니다.
 */
async function callOllamaForToolSelection(userInput, tools) {
    const language = detectLanguage(userInput);

    // Function Calling을 JSON 응답으로 대체하는 프롬프트
    const systemPrompt = language === 'ko' ? `
너는 날씨 정보 제공 어시스턴트의 도구 선택 모듈이야.
사용자의 질문을 분석해서 어떤 도구를 사용할지 결정해야 해.

# 사용 가능한 도구
- get_full_weather_with_context: 날씨 정보를 조회하는 도구

# 응답 형식
반드시 아래 JSON 형식으로만 답변해줘. 다른 텍스트는 포함하지 마:

{
  "name": "get_full_weather_with_context",
  "args": {
    "location": "지역명 또는 CURRENT_LOCATION",
    "date": "조회 날짜 (예: 오늘, 내일, 12월 16일) 또는 생략",
    "graph_needed": true 또는 false,
    "user_input": "사용자의 원문 질문"
  }
}

# 판단 규칙
1. location: 사용자가 지역을 명시하지 않으면 "CURRENT_LOCATION"으로 설정
2. graph_needed: 사용자 질문에 '기온', '온도', '그래프', '뭐 입을까', '옷' 등이 포함되면 true, 아니면 false
3. date: 사용자가 날짜를 명시하지 않으면 생략 (오늘로 처리됨)
` : `
You are the tool selection module for a weather information assistant.
Analyze the user's question and decide which tool to use.

# Available Tools
- get_full_weather_with_context: Tool to query weather information

# Response Format
You MUST respond ONLY in this JSON format. Do not include any other text:

{
  "name": "get_full_weather_with_context",
  "args": {
    "location": "location name or CURRENT_LOCATION",
    "date": "query date (e.g., today, tomorrow, December 16th) or omit",
    "graph_needed": true or false,
    "user_input": "user's original question"
  }
}

# Decision Rules
1. location: If user doesn't specify location, set to "CURRENT_LOCATION"
2. graph_needed: Set to true if user mentions 'temperature', 'temp', 'graph', 'what to wear', 'clothing', etc.
3. date: Omit if user doesn't specify date (defaults to today)
`;

    const prompt = `${systemPrompt}

# 사용자 질문
${userInput}

# JSON 응답`;

    console.log('📡 1차 Ollama 호출: 도구 선택');

    try {
        const { data } = await ollamaApi.post('/api/generate', {
            model: OLLAMA_MODEL,
            prompt: prompt,
            stream: false,
            options: {
                temperature: 0.1, // 낮은 temperature로 일관된 JSON 응답 유도
            }
        });

        // Ollama 응답에서 JSON 추출
        let responseText = data.response.trim();

        // JSON 블록 추출 (```json ... ``` 형태일 수 있음)
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
            responseText.match(/```\s*([\s\S]*?)\s*```/);

        if (jsonMatch) {
            responseText = jsonMatch[1].trim();
        }

        // JSON 파싱
        let functionCall;
        try {
            functionCall = JSON.parse(responseText);
        } catch (parseError) {
            console.error('❌ JSON 파싱 실패:', responseText);
            // 기본값으로 대체
            functionCall = {
                name: 'get_full_weather_with_context',
                args: {
                    location: 'CURRENT_LOCATION',
                    graph_needed: false,
                    user_input: userInput
                }
            };
        }

        // Gemini 형식으로 변환하여 반환 (기존 코드와의 호환성 유지)
        return {
            candidates: [{
                content: {
                    parts: [{
                        functionCall: functionCall
                    }]
                }
            }]
        };

    } catch (error) {
        console.error('❌ Ollama API 호출 실패:', error.message);
        throw new Error(`Ollama 도구 선택 실패: ${error.message}`);
    }
}

/**
 * Ollama를 사용하여 최종 응답을 생성합니다.
 */
async function callOllamaForFinalResponse(userInput, toolSelectionResponse, toolOutputs, userProfile, functionCalls) {
    const language = detectLanguage(userInput);

    // 🔥 날씨 데이터에서 정보 추출
    const weatherTool = toolOutputs.find(output => output.tool_function_name === 'get_full_weather_with_context');

    if (!weatherTool || !weatherTool.output) {
        throw new Error('날씨 데이터를 찾을 수 없습니다.');
    }

    const { location, weather, air, pollen, date } = weatherTool.output;
    const current = weather?.current || {};
    const requestDate = date || new Date().toISOString().split('T')[0];

    // 사용자 정보
    const userName = userProfile?.name || (language === 'ko' ? '사용자' : 'User');
    const hobbies = userProfile?.hobbies?.join(', ') || '';
    const sensitivities = userProfile?.sensitiveFactors?.join(', ') || '';
    const schedule = userProfile?.schedule || '';

    // 🔥 날씨 데이터를 자연스러운 텍스트로 변환 (JSON 대신)
    const weatherDataText = language === 'ko' ? `
[날씨 데이터]
- 위치: ${location}
- 날짜: ${requestDate}
- 기온: ${Math.round(current.temp || 0)}°C
- 체감온도: ${Math.round(current.feels_like || current.temp || 0)}°C
- 최고기온: ${Math.round(current.temp_max || current.temp || 0)}°C
- 최저기온: ${Math.round(current.temp_min || current.temp || 0)}°C
- 날씨 상태: ${current.weather?.[0]?.description || '정보 없음'}
- 구름량: ${current.clouds || 0}%
- 습도: ${current.humidity || 0}%
- 바람: ${(current.wind_speed || 0).toFixed(1)} m/s
- 강수확률: ${current.pop ? Math.round(current.pop * 100) : 0}%
${current.uvi !== undefined ? `- 자외선 지수: ${current.uvi}` : ''}
${air?.pm25 !== undefined ? `- 미세먼지 PM2.5: ${air.pm25} (${air.pm25 <= 15 ? '좋음' : air.pm25 <= 35 ? '보통' : air.pm25 <= 75 ? '나쁨' : '매우 나쁨'})` : ''}
${pollen?.type ? `- 꽃가루: ${pollen.type} - ${pollen.category}` : ''}
` : `
[Weather Data]
- Location: ${location}
- Date: ${requestDate}
- Temperature: ${Math.round(current.temp || 0)}°C
- Feels like: ${Math.round(current.feels_like || current.temp || 0)}°C
- Max temp: ${Math.round(current.temp_max || current.temp || 0)}°C
- Min temp: ${Math.round(current.temp_min || current.temp || 0)}°C
- Conditions: ${current.weather?.[0]?.description || 'N/A'}
- Clouds: ${current.clouds || 0}%
- Humidity: ${current.humidity || 0}%
- Wind: ${(current.wind_speed || 0).toFixed(1)} m/s
- Precipitation probability: ${current.pop ? Math.round(current.pop * 100) : 0}%
${current.uvi !== undefined ? `- UV index: ${current.uvi}` : ''}
${air?.pm25 !== undefined ? `- PM2.5: ${air.pm25} (${air.pm25 <= 15 ? 'Good' : air.pm25 <= 35 ? 'Moderate' : air.pm25 <= 75 ? 'Poor' : 'Very Poor'})` : ''}
${pollen?.type ? `- Pollen: ${pollen.type} - ${pollen.category}` : ''}
`;

    // 사용자 프로필 텍스트
    const userProfileText = language === 'ko' ? `
[사용자 정보]
- 이름: ${userName}
${hobbies ? `- 취미: ${hobbies}` : ''}
${sensitivities ? `- 민감 요소: ${sensitivities}` : ''}
${schedule ? `- 일정: ${schedule}` : ''}
- 요청 날짜: ${requestDate}
` : `
[User Profile]
- Name: ${userName}
${hobbies ? `- Hobbies: ${hobbies}` : ''}
${sensitivities ? `- Sensitive to: ${sensitivities}` : ''}
${schedule ? `- Schedule: ${schedule}` : ''}
- Request date: ${requestDate}
`;

    // 🔥 Gemini의 상세한 프롬프트 규칙 + Few-shot 예제
    const systemPrompt = language === 'ko' ? `
너는 Lumee라는 이름의 똑똑하고 친근한 날씨 정보 제공 어시스턴트야.

# 기본 규칙
- **답변 시작 시 반드시 "${userName}님"으로 인사해야 해**
- 반드시 '해요체'를 사용해 (예: ~해요, ~이에요)
- 절대로 반말 금지 (예: ~해, ~야, ~지 금지)
- 문장은 3~4문장 정도로 간결하게
- 이모지를 적절히 추가해서 생동감을 줘 🙂🌤️
- **절대로 JSON이나 데이터 형식을 그대로 출력하지 마**

# 답변 방식
1. **위치 먼저 언급**: 예: "${userName}님, 현재 ${location} 날씨는..."
2. **일정 언급 규칙**: 요청 날짜와 일정 날짜가 같거나 하루 차이일 때만 언급
3. **핵심 정보만 제공**: 사용자가 물어본 것에만 집중

# 키워드별 답변 규칙
- **"날씨 어때?"** 같은 포괄적 질문: 기온, 하늘 상태, 사용자 민감요소 고려
- **기온/온도**: 기온과 체감온도 언급, 옷차림 추천
- **옷차림/뭐 입을까**: 구체적인 옷 이름 제안 (반팔티, 가디건, 패딩 등)
- **우산/비**: 강수확률만 보고 판단. 30% 이상이면 우산 권유
- **미세먼지**: PM2.5 수치로 좋음/보통/나쁨/매우나쁨 판단
- **마스크**: 미세먼지와 꽃가루 종합해서 판단
- **자외선**: 낮음/보통/높음/매우높음으로 표현

${weatherDataText}
${userProfileText}

# 좋은 답변 예시
질문: "오늘 날씨 어때?"
답변: "${userName}님, 지금 ${location} 날씨는 맑고 기온은 15도예요! 🌤️ 가벼운 옷차림이 좋겠어요."

질문: "미세먼지 어때?"
답변: "${userName}님, 현재 미세먼지 농도는 '좋음' 수준이에요. 😊 공기가 맑아서 산책하기 좋네요!"

# 나쁜 답변 예시 (절대 따라하지 마!)
❌ "날씨 관련하여 가장 최신 정보는 다음과 같습니다. 현재 시각은..."
❌ "현재 시간은 10시이고, 3일 동안의 날씨 예보를 수 있습니다..."
❌ "- 현재 시각: 2026년 1월 20일 10시 -"

사용자 질문: ${userInput}

**답변 (2-3문장, ${userName}님으로 시작, 자연스럽고 간결하게):**
` : `
You are Lumee, a smart and friendly weather assistant.

# Basic Rules
- **Start with "${userName},"**
- Keep to 2-3 sentences max
- Use warm, friendly tone
- Add 1-2 emojis only
- **NO formal phrases like "The weather information is as follows" or "Current time is"**
- **Speak naturally, don't list data**

${weatherDataText}
${userProfileText}

# Good Response Examples
Q: "How's the weather today?"
A: "${userName}, it's sunny in ${location} right now with a nice 15°C! 🌤️ Light clothing should be perfect."

Q: "How's the air quality?"
A: "${userName}, the air quality is 'Good' today. 😊 Perfect for outdoor activities!"

# Bad Response Examples (NEVER do this!)
❌ "Regarding the weather, the latest information is as follows. The current time is..."
❌ "Current time: 10am. You can view 3 days of weather forecast..."

User question: ${userInput}

**Answer (2-3 sentences, start with ${userName}, natural and concise):**
`;

    console.log('📡 2차 Ollama 호출: 최종 응답 생성');

    try {
        const { data } = await ollamaApi.post('/api/generate', {
            model: OLLAMA_MODEL,
            prompt: systemPrompt,
            stream: false,
            options: {
                temperature: 0.7,
                num_predict: 200,  // 최대 토큰 제한
            }
        });

        const reply = data.response.trim();

        // Gemini 형식으로 변환하여 반환
        return {
            candidates: [{
                content: {
                    parts: [{
                        text: reply
                    }]
                }
            }]
        };

    } catch (error) {
        console.error('❌ Ollama API 호출 실패:', error.message);
        throw new Error(`Ollama 최종 응답 생성 실패: ${error.message}`);
    }
}

/**
 * 일정에서 위치 추출을 위한 간단한 Ollama 호출
 */
async function callOllamaForSimpleTask(prompt) {
    try {
        const { data } = await ollamaApi.post('/api/generate', {
            model: OLLAMA_MODEL,
            prompt: prompt,
            stream: false,
            options: {
                temperature: 0.3,
            }
        });

        return data.response.trim();
    } catch (error) {
        console.error('❌ Ollama 간단 작업 호출 실패:', error.message);
        throw error;
    }
}

module.exports = {
    callOllamaForToolSelection,
    callOllamaForFinalResponse,
    callOllamaForSimpleTask,
    detectLanguage,
};
