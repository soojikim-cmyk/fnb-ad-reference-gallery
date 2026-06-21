#!/usr/bin/env node
'use strict';
/*
 * collect-ig.js
 * 인스타그램 동향 수집기 (온드미디어 · 인플루언서 · 해시태그) — 로그인 세션 필요.
 *
 * 왜 별도 수집기인가:
 *   Meta 광고 라이브러리(collect.js)는 공개 투명성 데이터라 로그인 없이 데이터센터 IP로도 긁힌다.
 *   일반 인스타그램은 ① 로그인 필요 ② 강한 봇 차단 ③ 데이터센터 IP 즉시 차단 → GitHub Actions 불가.
 *   따라서 이 스크립트는 "로컬에서, 로그인된 브라우저 세션으로" 주 1회 실행하는 것을 전제로 한다.
 *
 * 수집 방식:
 *   Playwright 영구 프로필(data/.pwprofile-ig)로 instagram.com 세션을 유지하고,
 *   페이지 컨텍스트(쿠키 포함)에서 인스타 웹 내부 JSON API를 fetch 한다.
 *   - 프로필:   /api/v1/users/web_profile_info/?username=<handle>
 *   - 해시태그: /api/v1/tags/web_info/?tag_name=<tag>
 *   obfuscated DOM 셀렉터 대신 JSON을 파싱 → 마크업 변경에 강함. 단, 인스타가 응답 구조를
 *   바꾸면 normalize* 파서 보정이 필요할 수 있다(최초 실행 시 구조 확인 권장).
 *
 * 모드:
 *   node collect-ig.js --login    헤드풀 브라우저로 로그인(최초 1회). 세션은 프로필 디렉터리에 저장.
 *   node collect-ig.js            신규 게시물 수집 + 미디어 다운로드 → data/manifest-ig.json
 *   node collect-ig.js --commit   manifest-ig + data/tags.json 을 gallery.json 으로 머지, state 갱신
 *
 * 영상/릴스: 커버 썸네일만 다운로드, 원본은 permalink(인스타 게시물)로 연결.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'config.json'), 'utf8'));
const OUT_DIR = path.join(ROOT_DIR, CFG.output_dir || 'docs');
const PROFILE_DIR = path.join(ROOT_DIR, CFG.ig_profile_dir || 'data/.pwprofile-ig');

const STATE_PATH = path.join(DATA_DIR, 'state.json');
const GALLERY_PATH = path.join(DATA_DIR, 'gallery.json');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest-ig.json');
const TAGS_PATH = path.join(DATA_DIR, 'tags.json');

const IG_APP_ID = '936619743392459'; // 인스타 웹앱 고정 ID (x-ig-app-id 헤더)
const MAX_POSTS = CFG.ig_max_posts_per_target || 30;
const PAUSE_MS = CFG.ig_scroll_pause_ms || 2500;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}
function nowISO() { return new Date().toISOString(); }
function log(s) { process.stderr.write(s); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// unix(sec) → YYYY-MM-DD (Asia/Seoul)
function dateSeoul(unixSec) {
  if (!unixSec) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(unixSec * 1000));
    return parts; // en-CA → "YYYY-MM-DD"
  } catch { return null; }
}

function permalink(shortcode) { return `https://www.instagram.com/p/${shortcode}/`; }

// ---- normalize: 인스타 미디어 노드 → 공통 post 객체 --------------------------
// 두 가지 응답 형태를 흡수한다:
//  (A) web_profile_info: GraphQL 형태 노드(shortcode/__typename/display_url/edge_*)
//  (B) tags web_info:    v1 feed 형태 미디어(code/media_type/image_versions2/caption ...)

function fmtFromTypename(tn, isVideo) {
  if (tn === 'GraphSidecar') return '캐러셀';
  if (tn === 'GraphVideo' || isVideo) return '릴스';
  return '단일이미지';
}
function fmtFromMediaType(t) {
  if (t === 8) return '캐러셀';
  if (t === 2) return '릴스';
  return '단일이미지';
}

function normalizeGraphNode(n) {
  if (!n || !n.shortcode) return null;
  const caption = n.edge_media_to_caption && n.edge_media_to_caption.edges &&
    n.edge_media_to_caption.edges[0] && n.edge_media_to_caption.edges[0].node
    ? n.edge_media_to_caption.edges[0].node.text : '';
  const likes = (n.edge_liked_by && n.edge_liked_by.count) ??
    (n.edge_media_preview_like && n.edge_media_preview_like.count) ?? null;
  const comments = (n.edge_media_to_comment && n.edge_media_to_comment.count) ??
    (n.edge_media_preview_comment && n.edge_media_preview_comment.count) ?? null;
  return {
    shortcode: n.shortcode,
    format: fmtFromTypename(n.__typename, n.is_video),
    thumb_url: n.display_url || (n.thumbnail_resources && n.thumbnail_resources.slice(-1)[0]?.src) || null,
    video_url: n.is_video ? (n.video_url || null) : null,
    copy: caption || '',
    likes, comments,
    started: dateSeoul(n.taken_at_timestamp),
    author: (n.owner && n.owner.username) || null,
  };
}

function bestCandidateUrl(versions) {
  if (!versions || !versions.length) return null;
  // 가장 큰 해상도 후보 선택
  return versions.slice().sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || versions[0]?.url || null;
}
function normalizeV1Media(m) {
  if (!m || !(m.code || m.shortcode)) return null;
  const code = m.code || m.shortcode;
  const caption = (m.caption && m.caption.text) || '';
  const isVideo = m.media_type === 2;
  const img = m.image_versions2 && bestCandidateUrl(m.image_versions2.candidates);
  const video = isVideo && m.video_versions ? bestCandidateUrl(m.video_versions) : null;
  return {
    shortcode: code,
    format: fmtFromMediaType(m.media_type),
    thumb_url: img || null,
    video_url: video || null,
    copy: caption || '',
    likes: m.like_count ?? null,
    comments: m.comment_count ?? null,
    started: dateSeoul(m.taken_at || m.device_timestamp),
    author: (m.user && m.user.username) || (m.owner && m.owner.username) || null,
  };
}

// tags web_info 응답은 sections/medias 형태가 자주 바뀐다.
// code + (image_versions2|video_versions) 를 가진 미디어 객체를 재귀로 긁어 형태 변화에 강하게 대응.
function findV1Media(obj, out, seen, depth) {
  if (!obj || typeof obj !== 'object' || depth > 8) return;
  if ((obj.code || obj.shortcode) && (obj.image_versions2 || obj.video_versions) && (obj.taken_at || obj.media_type)) {
    const code = obj.code || obj.shortcode;
    if (!seen.has(code)) { seen.add(code); const n = normalizeV1Media(obj); if (n) out.push(n); }
    return; // 캐러셀 자식(carousel_media)으로는 내려가지 않음 → 중복/조각 방지
  }
  if (Array.isArray(obj)) { for (const v of obj) findV1Media(v, out, seen, depth + 1); return; }
  for (const k of Object.keys(obj)) findV1Media(obj[k], out, seen, depth + 1);
}

// ---- in-page fetch (브라우저 컨텍스트에서 쿠키 포함 요청) ----------------------
async function igJson(page, url) {
  return page.evaluate(async ({ url, appId }) => {
    try {
      const res = await fetch(url, {
        headers: { 'x-ig-app-id': appId, 'x-requested-with': 'XMLHttpRequest' },
        credentials: 'include',
      });
      if (!res.ok) return { __error: `HTTP ${res.status}` };
      return await res.json();
    } catch (e) { return { __error: String(e && e.message || e) }; }
  }, { url, appId: IG_APP_ID });
}

async function fetchProfilePosts(page, handle) {
  // 1차: web_profile_info — user.id 확보(+ 운 좋으면 GraphQL edges 로 게시물도 바로 확보)
  const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`;
  const j = await igJson(page, url);
  if (j.__error) throw new Error(`profile ${handle}: ${j.__error}`);
  const user = j.data && j.data.user;
  if (!user) throw new Error(`profile ${handle}: no user in response (구조 변경 가능성)`);

  const posts = [];
  const edges = (user.edge_owner_to_timeline_media && user.edge_owner_to_timeline_media.edges) || [];
  for (const e of edges) {
    const n = normalizeGraphNode(e && e.node);
    if (n) { if (!n.author) n.author = handle; posts.push(n); }
    if (posts.length >= MAX_POSTS) break;
  }
  if (posts.length > 0) return posts;

  // 2차(폴백): web_profile_info 가 게시물을 비워주는 경우 → 유저 피드 엔드포인트로 v1 미디어 수집
  // (해시태그와 동일한 v1 media 구조 → 동일 파서 재사용)
  const uid = user.id;
  if (!uid) return [];
  const feedUrl = `https://www.instagram.com/api/v1/feed/user/${uid}/?count=${MAX_POSTS}`;
  const feed = await igJson(page, feedUrl);
  if (feed.__error) throw new Error(`profile ${handle} feed: ${feed.__error}`);
  const out = [], seen = new Set();
  findV1Media(feed, out, seen, 0);
  for (const p of out) { if (!p.author) p.author = handle; }
  return out.slice(0, MAX_POSTS);
}

async function fetchHashtagPosts(page, tag) {
  const url = `https://www.instagram.com/api/v1/tags/web_info/?tag_name=${encodeURIComponent(tag)}`;
  const j = await igJson(page, url);
  if (j.__error) throw new Error(`hashtag #${tag}: ${j.__error}`);
  const out = [], seen = new Set();
  findV1Media(j, out, seen, 0);
  return out.slice(0, MAX_POSTS);
}

// ---- media download -------------------------------------------------------
async function download(url, dest) {
  if (!url) return false;
  try {
    const res = await fetch(url, { headers: { 'referer': 'https://www.instagram.com/', 'user-agent': UA } });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 512) return false; // 에러 픽셀 등
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    return true;
  } catch { return false; }
}

// ---- browser session ------------------------------------------------------
async function openContext(headless) {
  const { chromium } = require('playwright');
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: { width: 1366, height: 1000 },
    userAgent: UA,
    args: ['--disable-blink-features=AutomationControlled'],
  });
}
async function isLoggedIn(ctx) {
  const cookies = await ctx.cookies('https://www.instagram.com');
  return cookies.some(c => c.name === 'sessionid' && c.value);
}

// 최초 1회: 사람이 직접 로그인. sessionid 쿠키가 잡히면 자동 종료.
async function login() {
  log('[login] 브라우저를 엽니다. 인스타그램에 로그인하세요 (2단계 인증 포함).\n');
  const ctx = await openContext(false);
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded' });
  const deadline = Date.now() + 5 * 60 * 1000; // 최대 5분 대기
  while (Date.now() < deadline) {
    if (await isLoggedIn(ctx)) {
      log('[login] 로그인 감지됨. 세션을 저장하고 종료합니다.\n');
      await sleep(1500);
      await ctx.close();
      return;
    }
    await sleep(2000);
  }
  log('[login] 5분 내 로그인이 확인되지 않았습니다. 다시 시도하세요.\n');
  await ctx.close();
  process.exit(1);
}

// ---- collect --------------------------------------------------------------
async function collect() {
  const state = readJSON(STATE_PATH, { seen_library_ids: [], seen_ig_keys: [], last_run: null });
  const seen = new Set(state.seen_ig_keys || []);

  const ctx = await openContext(CFG.headless !== false);
  const page = ctx.pages()[0] || await ctx.newPage();
  page.setDefaultTimeout(CFG.nav_timeout_ms || 60000);
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
  await sleep(2000);

  if (!(await isLoggedIn(ctx))) {
    await ctx.close();
    console.error('로그인 세션이 없습니다. 먼저 `node collect-ig.js --login` 을 실행하세요.');
    process.exit(1);
  }

  const manifest = { generated_at: nowISO(), targets: [], new_count: 0 };

  // source 그룹 정의: owned / influencer / hashtag
  const groups = [];
  for (const b of (CFG.ig_owned || [])) groups.push({ source: 'ig_owned', label: b.label, handle: b.handle });
  for (const b of (CFG.ig_influencer || [])) groups.push({ source: 'ig_influencer', label: b.handle, handle: b.handle });
  const hashtagGroups = CFG.ig_hashtags || {};
  for (const [grp, tags] of Object.entries(hashtagGroups)) {
    for (const tag of tags) groups.push({ source: 'ig_hashtag', label: `#${tag}`, tag, hashtag_group: grp });
  }

  for (const t of groups) {
    const name = t.handle ? '@' + t.handle : '#' + t.tag;
    log(`\n[collect-ig] ${t.source} ${name}\n`);
    let posts = [];
    try {
      posts = t.source === 'ig_hashtag'
        ? await fetchHashtagPosts(page, t.tag)
        : await fetchProfilePosts(page, t.handle);
    } catch (e) {
      log(`  error: ${e.message}\n`);
      manifest.targets.push({ ...t, error: e.message, new_posts: [] });
      await sleep(PAUSE_MS);
      continue;
    }
    log(`  fetched: ${posts.length}\n`);

    const newPosts = [];
    for (const p of posts) {
      const key = `${t.source}:${p.shortcode}`;
      if (seen.has(key)) continue;
      const bucket = t.source === 'ig_hashtag' ? t.tag : t.handle;
      const rel = path.join('assets', 'ig', t.source, String(bucket), `${p.shortcode}.jpg`);
      const abs = path.join(OUT_DIR, rel);
      const ok = await download(p.thumb_url, abs);
      newPosts.push({
        key,
        source: t.source,
        shortcode: p.shortcode,
        handle: t.source === 'ig_hashtag' ? (p.author || null) : t.handle,
        brand_label: t.source === 'ig_owned' ? t.label : null,
        format: p.format,
        permalink: permalink(p.shortcode),
        started: p.started,
        likes: p.likes, comments: p.comments,
        hashtag: t.source === 'ig_hashtag' ? t.tag : null,
        hashtag_group: t.hashtag_group || null,
        copy: p.copy || '',
        video_url: p.video_url || null,
        media_rel: ok ? rel.split(path.sep).join('/') : null,
      });
    }
    log(`  new: ${newPosts.length}\n`);
    manifest.targets.push({ ...t, new_posts: newPosts });
    manifest.new_count += newPosts.length;
    await sleep(PAUSE_MS); // 보수적 딜레이 — 레이트리밋 회피
  }

  await ctx.close();
  writeJSON(MANIFEST_PATH, manifest);
  process.stdout.write(JSON.stringify({
    new_count: manifest.new_count,
    targets: manifest.targets.map(t => ({ source: t.source, name: t.handle || t.tag, new: (t.new_posts || []).length, error: t.error || null })),
  }, null, 2) + '\n');
}

// ---- commit ---------------------------------------------------------------
function commit() {
  const manifest = readJSON(MANIFEST_PATH, null);
  if (!manifest) { console.error('no manifest-ig.json — run collect-ig first'); process.exit(1); }
  const tags = readJSON(TAGS_PATH, {});
  const gallery = readJSON(GALLERY_PATH, { ads: {}, updated_at: null });
  const state = readJSON(STATE_PATH, { seen_library_ids: [], seen_ig_keys: [], last_run: null });
  const seen = new Set(state.seen_ig_keys || []);
  const ts = nowISO();

  let added = 0, merged = 0;
  for (const t of (manifest.targets || [])) {
    for (const p of (t.new_posts || [])) {
      const key = p.key;
      const existing = gallery.ads[key];
      if (existing) {
        // 같은 게시물이 다른 해시태그에서도 잡힌 경우 → 해시태그만 병합, 중복 추가 안 함
        if (p.hashtag) {
          existing.hashtags = Array.from(new Set([...(existing.hashtags || []), p.hashtag]));
        }
        // 태그 백필: 커밋 이후 태깅한 경우에도 반영(아직 비어있고 tags.json 에 생겼으면 채움)
        const tgx = tags[key];
        if (tgx && existing.tags && !existing.tags.summary && !existing.tags.hook_type &&
            (tgx.summary || tgx.hook_type || tgx.appeal || tgx.tone)) {
          existing.tags = { hook_type: tgx.hook_type || null, appeal: tgx.appeal || null, tone: tgx.tone || null, summary: tgx.summary || null };
        }
        existing.last_seen = ts;
        merged++;
        seen.add(key);
        continue;
      }
      const tg = tags[key] || {};
      gallery.ads[key] = {
        library_id: key,            // 갤러리 공통 식별자(복합 키)
        source: p.source,
        shortcode: p.shortcode,
        handle: p.handle,
        brand_label: p.brand_label || p.handle || (p.hashtag ? `#${p.hashtag}` : ''),
        page_id: null,              // Meta 전용 필드 — 인스타는 없음
        format: p.format,
        started: p.started,
        is_active: true,            // 인스타는 활성 개념 미적용 → 항상 true
        collation: 0,
        likes: p.likes ?? null,
        comments: p.comments ?? null,
        hashtags: p.hashtag ? [p.hashtag] : [],
        hashtag_group: p.hashtag_group || null,
        copy: p.copy || '',
        cta: null,
        landing_url: null,
        permalink: p.permalink,
        video_url: p.video_url || null,
        detail_url: p.permalink,
        media_rel: p.media_rel,
        tags: {
          hook_type: tg.hook_type || null,
          appeal: tg.appeal || null,
          tone: tg.tone || null,
          summary: tg.summary || null,
        },
        first_seen: ts,
        last_seen: ts,
      };
      seen.add(key);
      added++;
    }
  }
  gallery.updated_at = ts;
  writeJSON(GALLERY_PATH, gallery);
  state.seen_ig_keys = [...seen];
  state.last_run = ts;
  writeJSON(STATE_PATH, state);
  console.log(JSON.stringify({ committed: added, merged_hashtags: merged, total_in_gallery: Object.keys(gallery.ads).length }, null, 2));
}

const mode = process.argv[2];
if (mode === '--login') login().catch(e => { console.error(e); process.exit(1); });
else if (mode === '--commit') commit();
else collect().catch(e => { console.error(e); process.exit(1); });
