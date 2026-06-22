import json

with open('data/tags.json', 'r', encoding='utf-8') as f:
    tags = json.load(f)

new_entries = {
    "1683431956261012": {
        "hook_type": "혜택강조형",
        "appeal": "품질·성분",
        "tone": "감성형",
        "summary": "재출시 기념 배송비 무료, 첨가물 없는 명가삼대떡집 단호박 시루떡 한정 소구"
    },
    "1545068810467157": {
        "hook_type": "후기·증언형",
        "appeal": "품질·성분",
        "tone": "감성형",
        "summary": "배송 오자마자 두 봉지 순삭 후기로 소구하는 100% 유기농 통밀빵 6천원대"
    },
    "2675803096149030": {
        "hook_type": "후기·증언형",
        "appeal": "라이프스타일",
        "tone": "감성형",
        "summary": "고객 추억 담은 신관 아카이브 이벤트와 2027년 1월 리뉴얼 오픈 예고"
    },
    "2265206694224536": {
        "hook_type": "호기심형",
        "appeal": "라이프스타일",
        "tone": "감성형",
        "summary": "상반기 수고한 사람 상장 댓글 이벤트, 송추가마골 3만원 식사권 3명 추첨"
    },
    "2283395335812290": {
        "hook_type": "후기·증언형",
        "appeal": "라이프스타일",
        "tone": "감성형",
        "summary": "잠실점 블로그 후기 인용한 가족 외식 갈비 맛집 추천 광고"
    },
    "1501152598146349": {
        "hook_type": "혜택강조형",
        "appeal": "품질·성분",
        "tone": "정보형",
        "summary": "파인다이닝 셰프 제조 3분 완성 콩단백면 파스타 3+2세트 구매 혜택 소구"
    },
    "1984711958847908": {
        "hook_type": "호기심형",
        "appeal": "품질·성분",
        "tone": "정보형",
        "summary": "다른 파스타 못 먹게 된다는 훅의 파인다이닝 셰프 콩단백 다이어트 파스타 3종"
    },
    "1004925585623341": {
        "hook_type": "후기·증언형",
        "appeal": "품질·성분",
        "tone": "정보형",
        "summary": "다이어터 사이 난리난 완판 후기로 소구하는 파인다이닝 셰프 콩단백 파스타 3종"
    }
}

added = 0
for k, v in new_entries.items():
    if k not in tags:
        tags[k] = v
        added += 1

with open('data/tags.json', 'w', encoding='utf-8') as f:
    json.dump(tags, f, ensure_ascii=False, indent=2)

print(added)
