function extractDateFromText(text) {
  const lower = text.toLowerCase();
  const now = new Date();

  // 오전/오후 처리
  const ampmMatch = lower.match(/(오전|오후)?\s*(\d{1,2})시/);

  // 요일 기반
  const weekdayMap = {
    '일요일': 0, '월요일': 1, '화요일': 2, '수요일': 3, '목요일': 4, '금요일': 5, '토요일': 6
  };

  const weekMatch = lower.match(/(이번주|다음주)?\s*(일요일|월요일|화요일|수요일|목요일|금요일|토요일)/);
  if (weekMatch) {
    const [_, when, weekday] = weekMatch;
    const targetDay = weekdayMap[weekday];
    const base = new Date(now);
    const currentDay = base.getDay();
    let diff = (targetDay - currentDay + 7) % 7;
    if (diff === 0 && when === '다음주') diff = 7;
    else if (when === '다음주') diff += 7;
    base.setDate(base.getDate() + diff);
    base.setHours(9, 0, 0, 0);
    return base;
  }

  // 오늘, 내일, 모레
  if (lower.includes('오늘')) return now;
  if (lower.includes('내일')) return new Date(now.getTime() + 1 * 86400000);
  if (lower.includes('모레')) return new Date(now.getTime() + 2 * 86400000);

  // N일 뒤 (숫자 or 한글)
  const dayDiffMatch = lower.match(/(\d{1,2}|하루|일일|이일|이틀|삼일|사흘|닷새|엿새|칠일|팔일|구일|십일)\s*뒤/);
  if (dayDiffMatch) {
    const wordToNumber = {
      '하루': 1, '일일': 1,
      '이일': 2, '이틀': 2,
      '삼일': 3, '사흘': 4, '닷새': 5,
      '엿새': 6, '칠일': 7, '팔일': 8, '구일': 9, '십일': 10
    };
    const raw = dayDiffMatch[1];
    const diff = wordToNumber[raw] || parseInt(raw);
    return new Date(now.getTime() + diff * 86400000);
  }

  // N시간 뒤
  const hourDiff = lower.match(/(\d{1,2})시간\s?뒤/);
  if (hourDiff) return new Date(now.getTime() + parseInt(hourDiff[1]) * 3600000);

  // N분 뒤
  const minuteDiff = lower.match(/(\d{1,2})분\s?뒤/);
  if (minuteDiff) return new Date(now.getTime() + parseInt(minuteDiff[1]) * 60000);

  // 오늘|내일|모레 HH시 패턴 + 오전/오후
  const datetimeMatch = lower.match(/(오늘|내일|모레)?\s*(오전|오후)?\s*(\d{1,2})시/);
  if (datetimeMatch) {
    const [, dayWord, ampm, hourStr] = datetimeMatch;
    let base = new Date();

    if (dayWord === '내일') base.setDate(base.getDate() + 1);
    else if (dayWord === '모레') base.setDate(base.getDate() + 2);

    let hour = parseInt(hourStr);
    if (ampm === '오후' && hour < 12) hour += 12;
    if (ampm === '오전' && hour === 12) hour = 0;
    base.setHours(hour, 0, 0, 0);
    return base;
  }

  // MM월 DD일
  const dateMatch = lower.match(/(\d{1,2})월\s?(\d{1,2})일/);
  if (dateMatch) {
    const [_, month, day] = dateMatch.map(Number);
    return new Date(now.getFullYear(), month - 1, day);
  }

  // 🔥 DD일 (예: "23일" -> 현재 월의 23일)
  const dayOnlyMatch = lower.match(/^.*?(\d{1,2})일/);
  if (dayOnlyMatch) {
    const day = parseInt(dayOnlyMatch[1]);
    const result = new Date(now.getFullYear(), now.getMonth(), day);

    // 만약 파싱된 날짜가 과거라면 다음 달로 간주
    if (result < now) {
      result.setMonth(result.getMonth() + 1);
    }

    return result;
  }

  return now; // fallback
}

function getNearestForecastTime(date) {
  const rounded = new Date(date);
  rounded.setMinutes(0, 0, 0); // 분, 초, 밀리초 초기화
  if (date.getMinutes() >= 30) {
    rounded.setHours(rounded.getHours() + 1);
  }
  return Math.floor(rounded.getTime() / 1000); // OpenWeather용 UNIX timestamp (초 단위)
}

module.exports = {
  extractDateFromText,
  getNearestForecastTime

};