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
- 매 회차 108타에 가까워질수록 목탁 뒤의 불상이 서서히 나타남
- 108타 달성 시 불상은 사라지고 금빛 파동과 입자 보상, 타수 아래에는 수련 횟수만 표시
- 타수와 불상 진행은 기존 브라우저 저장값에서 복원하고 복원 시 보상은 재생하지 않음
- 다음 회차에서 다시 불상이 서서히 나타나는 방식으로 반복 (서버로 타수 전송 없음)
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
- `practice-progress.js`: 108타 수련 진행도와 달성 구간 계산
- `composer-viewport.js`: 모바일 키보드와 입력창 위치 동기화
- `config.js`: 공개 Supabase 연결 정보
- `assets/moktak.png`: 투명 배경 목탁 이미지
- `assets/mallet.png`: 투명 배경 채 이미지
- `assets/buddha-reveal.png`: 점진적으로 드러나는 불상 (내장 이미지 생성 도구로 제작)

## 키보드 회귀 테스트

`node --test tests/*.test.cjs`로 108타 진행 경계와 저장복원, 기존 입력창 동작을 함께 검사할 수 있습니다.

`node --test tests/composer-viewport.test.cjs`로 표시 영역 축소, 화면 이동, 포커스와 전송 버튼 처리를 확인합니다. DOM 모형 기반 테스트이므로 실제 Android/iOS 및 Instagram 내장 브라우저에서 키보드 열기·닫기 확인도 필요합니다.

입력 시 기존 페이지와 목탁 크기는 유지합니다. 브라우저의 기본 키보드 회피를 끄지 않으며, VirtualKeyboard overlay 모드와 키보드 사각형 좌표는 사용하지 않습니다. 키보드로 표시 영역이 충분히 줄었을 때만 입력창을 고정해 VisualViewport 하단에 맞춥니다. VisualViewport에 축소 신호가 없을 때만 innerHeight를 대체 신호로 사용하며 여러 API의 최솟값을 섞지 않습니다. 확대/축소, 작은 주소창 변화, 비정상적으로 작은 높이는 키보드로 처리하지 않습니다.

키보드 위치를 전달하지 않는 WebView에서는 입력창을 원래 문서 흐름에 남겨 브라우저의 기본 포커스 이동을 허용합니다. 모든 영역 정보를 숨기는 호스트에서는 웹 코드만으로 정확한 키보드 위치를 알아낼 수 없습니다. DOM 모형 및 데스크톱 크기 조절 검사는 실제 Android/iOS 키보드 검증을 대신하지 않습니다.
