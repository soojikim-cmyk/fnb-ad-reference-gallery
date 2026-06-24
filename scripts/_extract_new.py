import json, sys

with open('data/manifest.json') as f:
    data = json.load(f)

new_ads_with_media = []
for brand in data['brands']:
    for ad in brand.get('new_ads', []):
        if ad.get('media_rel') is not None:
            new_ads_with_media.append({
                'library_id': ad['library_id'],
                'media_rel': ad['media_rel'],
                'page_id': brand['page_id'],
                'label': brand['label'],
                'copy': ad.get('copy', ad.get('body', ''))
            })

print(f'Total new_ads with media_rel: {len(new_ads_with_media)}')
for a in new_ads_with_media:
    print(json.dumps(a, ensure_ascii=False))
