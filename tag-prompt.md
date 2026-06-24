F&B 경쟁사 크리에이티브(Meta 광고 + 인스타그램 게시물)를 분류하는 작업이다. 아래를 그대로 수행하라.

1. 대상 수집:
   - data/manifest.json 이 있으면 읽는다. brands[].new_ads[] 중 media_rel 이 null 이 아닌 항목이 대상이다.
     이 항목의 태그 키는 해당 항목의 library_id 이다.
   - data/manifest-ig.json 이 있으면 읽는다. targets[].new_posts[] 중 media_rel 이 null 이 아닌 항목이 대상이다.
     이 항목의 태그 키는 해당 항목의 key 필드(예: "ig_owned:Cabc123") 이다.
   - 두 파일 중 없는 것은 건너뛴다.
2. data/tags.json 이 있으면 읽는다(없으면 빈 객체). 이미 키로 존재하는 항목은 건너뛴다(재태깅 금지).
3. 남은 각 대상에 대해:
   - 이미지 파일 docs/<media_rel> 을 Read 도구로 직접 읽어 본다.
     (광고: docs/assets/<page_id>/<library_id>.jpg · 인스타: docs/assets/ig/<source>/<bucket>/<shortcode>.jpg)
   - copy 텍스트(광고 카피 또는 인스타 캡션)를 함께 참고한다.
   - 아래 enum 에서 각 항목당 정확히 하나의 값을 고른다(반드시 enum 안의 값, 한국어 그대로):
     hook_type: 문제제기형 | 혜택강조형 | 후기·증언형 | 비교형 | 호기심형 | 정보제공형
     appeal: 가성비·대용량 | 품질·성분 | 신뢰·리뷰 | 한정·긴급 | 라이프스타일 | 편의성
     tone: 정보형 | 감성형 | 유머형 | 미니멀
   - summary: 한국어 한 줄(40자 내외, 명사형 종결). 실제 보이는 것/카피 기준으로만, 추측·과장 금지.
4. 이번에 새로 분류한 항목만 data/new_tags.json 에 Write 도구로 기록한다. data/tags.json 은 절대 수정하지 말 것(읽기 전용). Edit 도구를 쓰지 말고 반드시 Write 로 파일 전체를 한 번에 기록하라. 형식은 키(library_id 또는 인스타 key)를 키로 하는 객체:
   {"<key>": {"hook_type": "...", "appeal": "...", "tone": "...", "summary": "..."}, ...}
   광고와 인스타 키는 모두 고유 문자열이라 한 파일에 섞여도 충돌하지 않는다. 유효한 JSON 이어야 한다.
   (기존 tags.json 과의 병합은 이후 merge-tags.js 가 결정적으로 처리하므로 여기서는 신규분만 담으면 된다.)
5. 모든 대상이 빠짐없이 태깅돼야 한다. 신규 대상이 0건이면 data/new_tags.json 을 만들지 말고 그대로 종료한다.
6. 끝나면 새로 태깅한 개수만 한 줄로 보고한다. 그 외 설명은 출력하지 않는다.
