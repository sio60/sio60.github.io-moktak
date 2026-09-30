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
- 햅틱, 충격파, 광택, 나무 파편 효과 (소리 없음)
- 제목의 안내 문구 아래에 흰색 숫자로만 표시되는 내 타수 (날짜별로 브라우저에 저장)
- 익명 한마디는 화면 아래에서 위로 떠오른 뒤 사라짐
- 모바일 입력 중에는 보이는 화면 높이에 맞춰 입력창과 메시지 시작 위치를 키보드 위로 이동
- Supabase Broadcast로 DB 저장 없이 메시지 실시간 공유 (이전 대화는 남지 않음)
- 오른쪽 상단 끝에 Presence 기반 현재 접속 수 표시 (`현재 접속자: 001명`)
- 접속 수는 열린 페이지 연결 기준으로, 같은 사람이 탭을 여러 개 열면 각각 집계
- 연결이 끊기면 접속 수는 `—`로 표시하고 메시지는 내 화면에만 표시
- 타격 애니메이션은 각 사용자 화면에서만 처리
- 별도 데이터베이스 테이블과 빌드 과정 없음

## 실시간 연결

서울 리전의 `innerpeace-moktak` 프로젝트에 연결되어 있습니다. Supabase의 Broadcast와 Presence만 사용하며 Postgres 테이블은 만들지 않습니다. 다른 프로젝트로 바꾸려면 `config.js`의 두 값을 변경합니다. 값을 비우면 로컬 모드로 동작합니다.

```js
window.INNERPEACE_CONFIG = Object.freeze({
  instagramUrl: "https://www.instagram.com/YOUR_ACCOUNT/",
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabasePublishableKey: "sb_publishable_...",
  channelName: "innerpeace-main-v1",
});
```

Publishable Key는 브라우저에서 사용하는 공개 키입니다. Secret Key 또는 Service Role Key를 넣으면 안 됩니다.

이 앱은 로그인 없는 공개 채널입니다. 채널 이름은 접근 제어 수단이 아니며, 개인정보나 비밀을 보내면 안 됩니다. 화면의 글자 수 제한과 전송 간격은 클라이언트 제한이므로 악의적인 접근을 막는 서버 측 제한은 아닙니다. 무료 플랜에도 실시간 연결·메시지 사용량 한도가 있으니 공개 후 Supabase 사용량을 확인하세요.

## GitHub Pages

이 폴더의 파일을 저장소 루트에 올린 뒤 GitHub 저장소의 `Settings → Pages`에서 `Deploy from a branch`, `main`, `/ (root)`를 선택하면 됩니다. 모든 경로가 상대 경로라 `username.github.io/repository-name/`에서도 동작합니다.

## 파일

- `index.html`: 화면 구조
- `styles.css`: 검은 배경과 반응형 UI, 이펙트
- `app.js`: 목탁 애니메이션·메시지·Realtime
- `composer-viewport.js`: 모바일 키보드와 입력창 위치 동기화
- `config.js`: 공개 Supabase 연결 정보
- `assets/moktak.png`: 투명 배경 목탁 이미지
- `assets/mallet.png`: 투명 배경 채 이미지

## 키보드 회귀 테스트

`node --test tests/composer-viewport.test.cjs`로 표시 영역 축소, 화면 이동, 포커스와 전송 버튼 처리를 확인합니다. DOM 모형 기반 테스트이므로 실제 Android/iOS 및 Instagram 내장 브라우저에서 키보드 열기·닫기 확인도 필요합니다.
