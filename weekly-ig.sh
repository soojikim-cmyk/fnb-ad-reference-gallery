#!/usr/bin/env bash
set -euo pipefail
#
# weekly-ig.sh — 인스타그램 주간 업데이트 일괄 실행
#   수집 → 비전 태깅(Claude Code) → 갤러리 머지 → 렌더
#
# 사전 준비(최초 1회): `npm run login:ig` 로 인스타 로그인 세션을 저장해 둘 것.
# 실행:               `npm run weekly:ig`  (또는 `bash weekly-ig.sh`)
# 끝나면:             git add -A && git commit -m "Weekly IG update" && git push
#                     → GitHub Pages 자동 재배포.
#
# 주의: 로그인·봇차단·데이터센터 IP 차단 때문에 GitHub Actions 가 아니라
#       로그인된 로컬 머신에서 실행해야 한다(버너 계정 권장).

cd "$(dirname "$0")"

echo "▶ 1/4  인스타 신규 수집"
node collect-ig.js

echo "▶ 2/4  비전 태깅 (Claude Code · 신규만)"
if command -v claude >/dev/null 2>&1; then
  claude -p "$(cat tag-prompt.md)" --allowedTools "Read,Write,Glob" --max-turns 200
else
  echo "  ⚠ claude CLI 없음 — 태깅 건너뜀(태그는 비어 있게 들어가며, 나중에 태깅 후 재실행하면 백필됩니다)."
fi

echo "▶ 3/4  갤러리 머지"
node collect-ig.js --commit

echo "▶ 4/4  렌더"
node render.js

echo "✅ 완료 — 변경분을 git add/commit/push 하면 Pages 가 자동 배포됩니다."
