# F&B Ad Reference Gallery

경쟁사(F&B) Meta 광고 크리에이티브를 **Meta 광고 라이브러리**에서 자동 수집하고, 후킹·소구·톤으로 태깅해 **필터 가능한 HTML 갤러리**로 누적하는 도구.

매주 GitHub Actions가 신규 소재를 수집·분류하고 갤러리를 다시 빌드해 GitHub Pages로 배포한다. 사람이 매번 Ad Library를 들여다보지 않아도, "어떤 경쟁사가 어떤 식으로 소구하는지"를 한 곳에서 훑고 찾아 쓸 수 있다.

## 동작 방식

```
collect.js     Ad Library(view_all_page_id) 를 헤드리스 크롬으로 열어 DOM에서
               카드별 크리에이티브·카피·시작일·랜딩 URL 추출 → 신규만 미디어 다운로드
Claude Code    신규 소재를 비전으로 hook_type·appeal·tone·summary 분류 (tag-prompt.md 지시문)
collect.js --commit   신규+태그를 data/gallery.json 에 머지, 중복 제거, is_active 재조정
render.js      gallery.json → docs/index.html + docs/assets (브랜드·포맷·후킹·소구·톤 필터,
               카피 검색, 인라인 영상 재생, 상세 패널, 라이트/다크)
```

> 대한민국(KR)은 노출수·지출 범위를 제공하지 않으므로, 갤러리는 성과 지표가 아니라 **크리에이티브·카피·시작일·태그** 중심입니다. 공개 Ad Library(투명성 데이터) 기반 read-only 수집.

## 셋업

태깅은 **Claude Code(Pro/Max 구독)** 로 동작합니다. 별도 API 키·종량 결제가 아니라 구독 사용량 내에서 처리됩니다.

1. **OAuth 토큰 발급(로컬 1회)** — Max로 로그인된 머신에서:
   ```bash
   npm install -g @anthropic-ai/claude-code
   claude setup-token          # 출력되는 토큰 복사
   ```
2. 저장소 **Settings → Secrets and variables → Actions** 에 `CLAUDE_CODE_OAUTH_TOKEN` 시크릿으로 그 토큰 등록
3. **Settings → Pages**: Source = `Deploy from a branch`, Branch = `main` / `/docs`
4. **Settings → Actions → General**: Workflow permissions = `Read and write`
5. `Actions` 탭 → `Update gallery` → `Run workflow` 로 첫 실행(이후 매주 월요일 자동)

라이브 갤러리: `https://soojikim-cmyk.github.io/fnb-ad-reference-gallery/`

## 로컬 실행

```bash
npm install
npx playwright install chromium
node collect.js                                                   # 신규 수집 → data/manifest.json
claude -p "$(cat tag-prompt.md)" --allowedTools "Read,Write,Glob" # 신규 비전 태깅 → data/tags.json (Claude Code 로그인 필요)
node collect.js --commit                                          # gallery.json 머지
node render.js                                                    # docs/index.html 재생성
```

## 인스타그램 동향 (온드미디어 · 인플루언서 · 해시태그)

대기업 F&B 브랜드 공식계정·인플루언서·해시태그의 게시물 동향을 같은 갤러리에 **탭**으로 추가한다
(`collect-ig.js`). 각 게시물의 미디어·캡션·좋아요/댓글 수·게시일을 수집하고 기존 비전 태깅을 재사용한다.

> ⚠️ **Meta 광고와 다른 점:** 일반 인스타그램은 ① 로그인 필요 ② 강한 봇 차단 ③ 데이터센터 IP 차단이라
> **GitHub Actions에서 자동 수집이 안 된다.** 인스타 수집은 **로그인된 로컬 머신에서 주 1회 수동 실행**하고,
> 결과(`data/gallery.json` + `docs/assets/ig/...`)를 커밋·푸시하면 GitHub Pages가 재배포한다.
> 자동 수집은 ToS 회색지대이며 레이트리밋/계정정지 위험이 있으니 **보조(버너) 계정** 사용을 권장한다.

```bash
npm run login:ig      # 최초 1회: 열린 브라우저에서 인스타 로그인 (세션은 data/.pwprofile-ig 에 저장)
npm run weekly:ig     # 주간 일괄: 수집 → 비전 태깅 → 머지 → 렌더 (weekly-ig.sh)
git add -A && git commit -m "Weekly IG update" && git push   # → Pages 자동 재배포
```

`weekly:ig` 가 내부에서 도는 개별 단계(따로 돌리고 싶을 때):
```bash
npm run collect:ig    # 신규 게시물 수집 → data/manifest-ig.json + docs/assets/ig/ 미디어
claude -p "$(cat tag-prompt.md)" --allowedTools "Read,Write,Glob"   # 비전 태깅 (광고+인스타 공통)
npm run commit:ig     # gallery.json 머지 (복합 키 ig_owned:* / ig_influencer:* / ig_hashtag:*)
npm run render        # docs/index.html 재생성
```

수집 대상은 `config.json` 의 `ig_owned`(계정), `ig_influencer`(계정), `ig_hashtags`(그룹별 해시태그)가 SSOT.
한 번에 가져올 게시물 수는 `ig_max_posts_per_target`(기본 30)로 조절한다.

## 대상 브랜드 · 계정 · 해시태그

`config.json` 이 SSOT다. Meta 광고는 `brands` 배열(`{ "label", "page_id" }`), 인스타는
`ig_owned` / `ig_influencer` / `ig_hashtags` 로 관리한다. 브랜드/계정을 18개 이상으로 늘리면
`render.js` 의 `BRAND_PALETTE`(색상)도 함께 확인. 국가·태그 enum 도 `config.json` 에서 관리.

## 비용

태깅은 Claude Code(Pro/Max 구독) 사용량으로 처리되어 **별도 API 종량 결제가 없습니다**. 신규 소재가 많은 주에는 구독 사용량 한도에 영향을 줄 수 있으니, 한도가 빠듯하면 대상 브랜드 수를 조절하세요.

## 주의

- Facebook 광고 라이브러리는 데이터센터 IP를 차단할 수 있습니다. GitHub Actions에서 수집이 막히면 워크플로의 `runs-on` 을 self-hosted 러너(일반 머신)로 바꿔 실행하세요.
- Ad Library의 DOM/리다이렉트 포맷이 바뀌면 `collect.js` 의 추출 로직 보정이 필요할 수 있습니다.
