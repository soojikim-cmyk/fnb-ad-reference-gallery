#!/usr/bin/env bash
# daily-ig.sh — 맥 자동 스케줄(launchd)이 매일 부르는 인스타 갱신 래퍼.
#   weekly-ig.sh(수집→태깅→머지→렌더) 실행 후, 변경이 있으면 자동 커밋·푸시.
#   GitHub Pages 가 푸시를 받아 자동 재배포한다.
#
# launchd 는 최소 PATH 로 실행되므로 도구 경로를 명시한다.
export PATH="/opt/homebrew/bin:/Users/sooji_kim/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$(dirname "$0")" || exit 1

LOG="data/daily-ig.log"
{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S') daily-ig 시작 ====="
  if bash weekly-ig.sh; then
    git add data docs                              # 산출물만 — 태깅이 만든 루트 임시 스크립트 제외
    if git diff --cached --quiet; then
      echo "변경 없음 — 커밋 생략."
    else
      git commit -m "Daily IG update $(date '+%Y-%m-%d')"
      pushed=0
      for i in 1 2 3; do
        if git pull --rebase origin main && git push; then echo "푸시 완료."; pushed=1; break; fi
        git rebase --abort 2>/dev/null || true
        echo "푸시 재시도 $i (원격 갱신/충돌)..."; sleep 5
      done
      [ "$pushed" = 1 ] || echo "⚠ 푸시 실패(재시도 소진 — 인증/충돌 확인)."
    fi
  else
    echo "⚠ 파이프라인 실패 — 커밋/푸시 생략. 인스타 세션 만료 시 'npm run login:ig' 재실행 필요."
  fi
  echo "===== $(date '+%Y-%m-%d %H:%M:%S') 종료 ====="
} >> "$LOG" 2>&1
