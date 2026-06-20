F&B 경쟁사 Meta 광고 크리에이티브를 분류하는 작업이다. 아래를 그대로 수행하라.

1. data/manifest.json 을 읽는다. brands[].new_ads[] 중 media_rel 이 null 이 아닌 광고만 대상이다.
2. data/tags.json 이 있으면 읽는다(없으면 빈 객체). 이미 키로 존재하는 library_id 는 건너뛴다(재태깅 금지).
3. 남은 각 광고에 대해:
   - 이미지 파일 docs/<media_rel> (예: docs/assets/<page_id>/<library_id>.jpg) 을 Read 도구로 직접 읽어 본다.
   - 광고의 copy 텍스트를 함께 참고한다.
   - 아래 enum 에서 각 항목당 정확히 하나의 값을 고른다(반드시 enum 안의 값, 한국어 그대로):
     hook_type: 문제제기형 | 혜택강조형 | 후기·증언형 | 비교형 | 호기심형 | 정보제공형
     appeal: 가성비·대용량 | 품질·성분 | 신뢰·리뷰 | 한정·긴급 | 라이프스타일 | 편의성
     tone: 정보형 | 감성형 | 유머형 | 미니멀
   - summary: 한국어 한 줄(40자 내외, 명사형 종결). 실제 보이는 것/카피 기준으로만, 추측·과장 금지.
4. 결과를 data/tags.json 에 머지해 Write 한다. 형식은 library_id 를 키로 하는 객체:
   {"<library_id>": {"hook_type": "...", "appeal": "...", "tone": "...", "summary": "..."}, ...}
   기존 항목은 보존하고 신규만 추가한다. 유효한 JSON 이어야 한다.
5. 모든 대상 광고가 빠짐없이 태깅돼야 한다. 신규 대상이 0건이면 data/tags.json 을 그대로 두고 종료한다.
6. 끝나면 새로 태깅한 개수만 한 줄로 보고한다. 그 외 설명은 출력하지 않는다.
