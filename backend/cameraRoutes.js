// cameraRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const sharp = require('sharp');

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 라즈베리파이 주소 (더 이상 사용하지 않음 - 웹 브라우저 카메라 사용)
// const RASPI_CAMERA_URL = process.env.RASPI_CAMERA_URL || 'http://192.168.50.48:5000';

// console.log(`📹 라즈베리파이 카메라 주소: ${RASPI_CAMERA_URL}`);

// ========== 촬영 및 분석 API ==========
// 웹 브라우저에서 촬영한 이미지를 받아 분석합니다
router.post('/capture', async (req, res) => {
  try {
    const { uid, image } = req.body;
    console.log(`📸 촬영 이미지 수신 (UID: ${uid})`);

    // 1. 클라이언트에서 전송한 이미지 검증
    if (!image) {
      return res.status(400).json({
        success: false,
        error: '이미지가 전송되지 않았습니다. 카메라로 촬영한 이미지를 전송해주세요.'
      });
    }

    // base64 이미지에서 data URL prefix 제거 (있는 경우)
    const base64Image = image.replace(/^data:image\/\w+;base64,/, '');
    console.log(`✅ 이미지 수신 완료 (크기: ${base64Image.length} bytes)`);

    // 2. 이미지 최적화
    const imageBuffer = Buffer.from(base64Image, 'base64');
    const optimizedImage = await sharp(imageBuffer)
      .resize(1024, 1024, { fit: 'inside' }) // 비율 유지하며 리사이즈
      .jpeg({ quality: 85 })
      .toBuffer();

    const optimizedBase64 = optimizedImage.toString('base64');
    console.log(`🔄 이미지 최적화 완료 (크기: ${optimizedBase64.length} bytes)`);

    // 3. Gemini Vision API로 분석
    console.log('🤖 Gemini 분석 시작...');
    const analysisResult = await analyzeClothing(optimizedBase64);
    console.log('✅ 분석 완료:', analysisResult);

    // 4. 결과 반환
    res.json({
      success: true,
      image: optimizedBase64,
      analysis: analysisResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 카메라 처리 오류:', error.message);

    // 에러 상세 정보 제공
    let errorMessage = error.message;
    if (error.message.includes('Invalid base64')) {
      errorMessage = '이미지 형식이 올바르지 않습니다. base64 형식의 이미지를 전송해주세요.';
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: error.code
    });
  }
});

// ========== 분석 API (별칭) ==========
// /analyze 엔드포인트는 /capture와 동일한 기능을 제공합니다 (프론트엔드 호환성)
router.post('/analyze', async (req, res) => {
  try {
    const { uid, image } = req.body;
    console.log(`📸 촬영 이미지 수신 (UID: ${uid}) - /analyze 엔드포인트`);

    // 1. 클라이언트에서 전송한 이미지 검증
    if (!image) {
      return res.status(400).json({
        success: false,
        error: '이미지가 전송되지 않았습니다. 카메라로 촬영한 이미지를 전송해주세요.'
      });
    }

    // base64 이미지에서 data URL prefix 제거 (있는 경우)
    const base64Image = image.replace(/^data:image\/\w+;base64,/, '');
    console.log(`✅ 이미지 수신 완료 (크기: ${base64Image.length} bytes)`);

    // 2. 이미지 최적화
    const imageBuffer = Buffer.from(base64Image, 'base64');
    const optimizedImage = await sharp(imageBuffer)
      .resize(1024, 1024, { fit: 'inside' })
      .jpeg({ quality: 85 })
      .toBuffer();

    const optimizedBase64 = optimizedImage.toString('base64');
    console.log(`🔄 이미지 최적화 완료 (크기: ${optimizedBase64.length} bytes)`);

    // 3. Gemini Vision API로 분석
    console.log('🤖 Gemini 분석 시작...');
    const analysisResult = await analyzeClothing(optimizedBase64);
    console.log('✅ 분석 완료:', analysisResult);

    // 4. 결과 반환
    res.json({
      success: true,
      image: optimizedBase64,
      analysis: analysisResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 카메라 처리 오류:', error.message);

    let errorMessage = error.message;
    if (error.message.includes('Invalid base64')) {
      errorMessage = '이미지 형식이 올바르지 않습니다. base64 형식의 이미지를 전송해주세요.';
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: error.code
    });
  }
});

// ========== Gemini Vision 분석 함수 ==========
async function analyzeClothing(base64Image) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `
이 사진 속 인물의 옷차림을 분석해줘.

다음 JSON 형식으로만 응답해줘 (Markdown 없이 순수 JSON만):
{
  "items": ["착용한 의류 아이템들"],
  "colors": ["주요 색상들"],
  "style": "전체적인 스타일 (예: 캐주얼, 포멀, 스포티 등)",
  "warmth_level": 1~5 (1: 매우 시원함, 5: 매우 따뜻함),
  "weather_recommendation": "이 옷차림에 대한 한 줄 코멘트 (예: 오늘 날씨에 딱 좋네요!)"
}

예시:
{
  "items": ["반팔 티셔츠", "청바지"],
  "colors": ["흰색", "파란색"],
  "style": "캐주얼",
  "warmth_level": 2,
  "weather_recommendation": "시원한 여름날에 딱 맞는 옷차림이에요!"
}
`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Image
        }
      }
    ]);

    const response = await result.response;
    let text = response.text();

    // JSON 정리 (```json 제거)
    text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    // JSON 파싱
    const parsed = JSON.parse(text);
    return parsed;

  } catch (error) {
    console.error('❌ Gemini 분석 오류:', error);
    return {
      items: ["분석 실패"],
      colors: [],
      style: "알 수 없음",
      warmth_level: 3,
      weather_recommendation: "이미지를 분석할 수 없습니다."
    };
  }
}

// ========== 카메라 상태 확인 ==========
// 웹 브라우저 카메라를 사용하므로 라즈베리파이 상태 확인은 더 이상 필요하지 않음
// router.get('/status', async (req, res) => {
//   try {
//     const response = await axios.get(`${RASPI_CAMERA_URL}/health`, { timeout: 3000 });
//     res.json({
//       status: 'connected',
//       raspi: response.data,
//       backend_url: RASPI_CAMERA_URL
//     });
//   } catch (error) {
//     res.json({
//       status: 'disconnected',
//       error: error.message,
//       backend_url: RASPI_CAMERA_URL
//     });
//   }
// });

// ========== 스트림 제어 ==========
// 웹 브라우저 카메라를 사용하므로 스트림 제어는 클라이언트에서 직접 처리
// router.post('/start-stream', async (req, res) => {
//   try {
//     await axios.post(`${RASPI_CAMERA_URL}/start_stream`);
//     res.json({ success: true });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// router.post('/stop-stream', async (req, res) => {
//   try {
//     await axios.post(`${RASPI_CAMERA_URL}/stop_stream`);
//     res.json({ success: true });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

module.exports = router;