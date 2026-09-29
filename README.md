# 이너피스 — 직장인 합동 수련소

검은 화면의 목탁을 직접 두드리고, 익명의 한마디가 아래에서 위로 떠오르는 정적 웹앱입니다.

배포 주소: <https://sio60.github.io/sio60.github.io-moktak/>

## 바로 보기

`index.html`을 브라우저에서 열면 설치 없이 동작합니다. 로컬 서버가 필요하면 이 폴더에서 아래 명령을 실행합니다.

```powershell
npx serve .
```

## 현재 동작

- 목탁 PNG와 채 PNG를 분리한 고속 타격 애니메이션
- 합성 목탁 소리, 햅틱, 충격파, 광택, 나무 파편 효과
- 내 타수는 날짜별로 브라우저에 저장
- 익명 한마디는 화면 아래에서 위로 떠오른 뒤 사라짐
- Supabase 설정 전에는 혼자 사용하는 모드로 동작
- Supabase 설정 후에는 DB 저장 없이 메시지만 실시간 공유
- 타격 애니메이션과 내 타수는 각 사용자 화면에서만 처리
- 별도 데이터베이스 테이블과 빌드 과정 없음

## 실시간 연결

Supabase 프로젝트의 Realtime 기능만 사용하며 Postgres 테이블은 만들지 않습니다. `config.js`의 두 값을 채우면 됩니다.

```js
window.INNERPEACE_CONFIG = Object.freeze({
  instagramUrl: "https://www.instagram.com/YOUR_ACCOUNT/",
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabasePublishableKey: "sb_publishable_...",
  channelName: "innerpeace-main-v1",
});
```

Publishable Key는 브라우저에서 사용하는 공개 키입니다. Secret Key 또는 Service Role Key를 넣으면 안 됩니다.

## GitHub Pages

이 폴더의 파일을 저장소 루트에 올린 뒤 GitHub 저장소의 `Settings → Pages`에서 `Deploy from a branch`, `main`, `/ (root)`를 선택하면 됩니다. 모든 경로가 상대 경로라 `username.github.io/repository-name/`에서도 동작합니다.

## 파일

- `index.html`: 화면 구조
- `styles.css`: 검은 배경과 반응형 UI, 이펙트
- `app.js`: 목탁 애니메이션·소리·메시지·Realtime
- `config.js`: 선택적 Supabase 연결 정보
- `assets/moktak.png`: 투명 배경 목탁 이미지
- `assets/mallet.png`: 투명 배경 채 이미지
