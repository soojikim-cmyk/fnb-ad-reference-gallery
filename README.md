# F&B Ad Reference Gallery

경쟁사(F&B) Meta 광고 크리에이티브를 **Meta 광고 라이브러리**에서 자동 수집하고, 후킹·소구·톤으로 태깅해 **필터 가능한 HTML 갤러리**로 누적하는 도구.

매주 GitHub Actions가 신규 소재를 수집·분류하고 갤러리를 다시 빌드해 GitHub Pages로 배포한다. 사람이 매번 Ad Library를 들여다보지 않아도, "어떤 경쟁사가 어떤 식으로 소구하는지"를 한 곳에서 훑고 찾아 쓸 수 있다.

## 동작 방식

```
collect.js   Ad Library(view_all_page_id) 를 헤드리스 크롬으로 열어 DOM에서
             카드별 크리에이티브·카피·시작일·랜딩 URL 추출 → 신규만 미디어 다운로드
tag.js       신규 소재를 Claude API(비전)로 hook_type·appeal·tone·summary 분류
collect.js --commit   신규+태그를 data/gallery.json 에 머지, 중복 제거, is_active 재조정
render.js    gallery.json → docs/index.html + docs/assets (브랜드·포맷·후킹·소구·톤 필터,
             카피 검색, 인라인 영상 재생, 상세 패널, 라이트/다크)
```

> 대한민국(KR)은 노출수·지출 범위를 제공하지 않으므로, 갤러리는 성과 지표가 아니라 **크리에이티브·카피·시작일·태그** 중심입니다. 공개 Ad Library(투명성 데이터) 기반 read-only 수집.

## 셋업

1. 저장소의 **Settings → Secrets and variables → Actions** 에 `ANTHROPIC_API_KEY` 추가 (태깅용)
2. **Settings → Pages** 에서 Source = `Deploy from a branch`, Branch = `main` / `/docs`
3. **Settings → Actions → General** 에서 Workflow permissions = `Read and write`
4. `Actions` 탭 → `Update gallery` → `Run workflow` 로 첫 실행(이후 매주 월요일 자동)

라이브 갤러리: `https://soojikim-cmyk.github.io/fnb-ad-reference-gallery/`

## 로컬 실행

```bash
npm install
npx playwright install chromium
node collect.js                       # 신규 수집 → data/manifest.json
ANTHROPIC_API_KEY=sk-... node tag.js  # 신규 비전 태깅 → data/tags.json
node collect.js --commit              # gallery.json 머지
node render.js                        # docs/index.html 재생성
```

## 대상 브랜드

`config.json` 의 `brands` 배열이 SSOT — `{ "label": "...", "page_id": "..." }` 추가/삭제로 관리한다. 브랜드를 17개 이상으로 늘리면 `render.js` 의 `BRAND_PALETTE`(색상)도 함께 확인. 국가·태그 enum 도 `config.json` 에서 관리.

## 비용

태깅은 신규 소재에만 발생(주간 수십~수백 건). 기본 모델은 `claude-opus-4-8`이며, 비용을 줄이려면 워크플로 또는 환경변수에서 `TAG_MODEL=claude-haiku-4-5` 로 바꾸면 된다(이 분류 작업엔 충분).

## 주의

- Facebook 광고 라이브러리는 데이터센터 IP를 차단할 수 있습니다. GitHub Actions에서 수집이 막히면 워크플로의 `runs-on` 을 self-hosted 러너(일반 머신)로 바꿔 실행하세요.
- Ad Library의 DOM/리다이렉트 포맷이 바뀌면 `collect.js` 의 추출 로직 보정이 필요할 수 있습니다.
