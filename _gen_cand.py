import json

def load(p):
    try:
        return json.load(open(p, encoding='utf-8'))
    except Exception:
        return None

tags = load("data/tags.json") or {}
m = load("data/manifest.json")
ig = load("data/manifest-ig.json")
out = []
if m and m.get("brands"):
    for b in m["brands"]:
        for a in (b.get("new_ads") or []):
            if a.get("media_rel") is not None:
                k = a["library_id"]
                if k not in tags:
                    out.append({"key": k, "media_rel": a["media_rel"],
                                "copy": (a.get("copy") or a.get("ad_text") or a.get("text") or "")})
if ig and ig.get("targets"):
    for t in ig["targets"]:
        for p in (t.get("new_posts") or []):
            if p.get("media_rel") is not None:
                k = p["key"]
                if k not in tags:
                    out.append({"key": k, "media_rel": p["media_rel"],
                                "copy": (p.get("caption") or p.get("copy") or "")})
json.dump(out, open("_cand.json", "w"), ensure_ascii=False)
print("CANDIDATES", len(out))
