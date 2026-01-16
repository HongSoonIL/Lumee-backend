// userProfileUtils.js
const { admin, db } = require('./firebaseAdmin');

// 사용자 프로필 저장
async function saveUserProfile(uid, profileData) {
  try {
    await db.collection('users').doc(uid).set(profileData);
    return true;
  } catch (err) {
    console.error('❌ 사용자 정보 저장 실패:', err.message);
    return false;
  }
}

// 사용자 프로필 불러오기 (없으면 생성)
async function getUserProfile(uid) {
  try {
    // uid가 없으면 게스트 프로필 반환
    if (!uid) {
      console.log('👤 게스트 사용자 - 기본 프로필 사용');
      return {
        name: 'user',
        schedule: '일정 없음'
      };
    }

    const userRef = db.collection('users').doc(uid);
    const doc = await userRef.get();

    let userData;

    // [수정] 문서가 없으면 Firebase Auth에서 사용자 정보를 가져와 프로필 생성
    if (!doc.exists) {
      console.log(`✨ 새로운 사용자 발견: ${uid}. Firebase Auth에서 정보를 가져옵니다.`);

      try {
        // Firebase Auth에서 사용자 정보 가져오기
        const userRecord = await admin.auth().getUser(uid);
        const displayName = userRecord.displayName || 'User';
        const email = userRecord.email || '';

        // 성을 제거하고 이름만 추출 (한국 이름 처리)
        let firstName = displayName;
        if (displayName && displayName.length > 1) {
          // 한글 이름인 경우 성을 제거 (첫 글자 제거)
          const koreanRegex = /[가-힣]/;
          if (koreanRegex.test(displayName)) {
            firstName = displayName.substring(1);
          } else {
            // 영어 이름인 경우 첫 번째 단어만 사용
            firstName = displayName.split(' ')[0];
          }
        }

        userData = {
          name: firstName,
          email: email,
          fullName: displayName,
          createdAt: new Date().toISOString(),
          preferences: {
            theme: 'light'
          }
        };

        console.log(`✅ Firebase Auth에서 사용자 정보를 가져왔습니다: ${displayName} (${email})`);
      } catch (authError) {
        console.warn(`⚠️ Firebase Auth에서 사용자 정보를 가져올 수 없습니다: ${authError.message}`);
        console.log('기본 프로필을 생성합니다.');

        userData = {
          name: 'User',
          createdAt: new Date().toISOString(),
          preferences: {
            theme: 'light'
          }
        };
      }

      await userRef.set(userData);
    } else {
      userData = doc.data();
    }

    // 하위 컬렉션 'schedules' 데이터 가져오기 (기존 로직 유지)
    const schedulesSnapshot = await userRef.collection('schedules').get();

    let scheduleList = [];
    if (!schedulesSnapshot.empty) {
      scheduleList = schedulesSnapshot.docs.map(doc => {
        const data = doc.data();
        return `${data.date}: ${data.title}`;
      });
    }

    userData.schedule = scheduleList.length > 0 ? scheduleList.join(', ') : '일정 없음';

    console.log(`👤 [UserProfile] ${uid} 로드 완료`);

    return userData;

  } catch (err) {
    console.error('❌ 사용자 정보 처리 실패:', err.message);
    // 오류 발생 시에도 서버가 죽지 않도록 기본 객체 반환
    return { name: 'Guest', schedule: '정보 없음' };
  }
}

module.exports = {
  saveUserProfile,
  getUserProfile
};