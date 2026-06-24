#!/usr/bin/env node
'use strict';
/*
 * merge-tags.js
 * data/new_tags.json (이번 회차 신규 분류) → data/tags.json 에 병합(기존 보존, 신규만 추가).
 *
 * 왜 별도 스크립트인가: 태깅 단계(claude -p)가 1000+ 항목의 기존 tags.json 을 직접
 *   머지하려면 Edit 도구를 쓰는데, 헤드리스/CI 권한 게이트에서 막혀 태그가 유실되곤 했다.
 *   → LLM 은 new_tags.json 에 신규분만 Write 하고, 병합은 여기서 결정적으로 처리한다.
 *
 * 사용: node merge-tags.js   (태깅 단계 직후, collect*.js --commit 직전에 실행)
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const TAGS_PATH = path.join(DATA_DIR, 'tags.json');
const NEW_PATH = path.join(DATA_DIR, 'new_tags.json');

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

const newTags = readJSON(NEW_PATH, null);
if (!newTags || typeof newTags !== 'object' || Array.isArray(newTags)) {
  console.log(JSON.stringify({ merged: 0, note: 'new_tags.json 없음 — 병합할 신규 태그 없음' }));
  process.exit(0);
}

const tags = readJSON(TAGS_PATH, {});
let added = 0;
for (const k of Object.keys(newTags)) {
  if (!(k in tags)) { tags[k] = newTags[k]; added++; }
}

fs.writeFileSync(TAGS_PATH, JSON.stringify(tags, null, 2));
try { fs.unlinkSync(NEW_PATH); } catch { /* ignore */ }

console.log(JSON.stringify({ merged: added, total: Object.keys(tags).length }));
