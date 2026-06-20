#!/usr/bin/env node
'use strict';
/*
 * tag.js — 신규 광고 크리에이티브를 Claude API(비전)로 분류해 data/tags.json 작성.
 * collect.js 가 만든 data/manifest.json 의 신규 광고를 읽어, 각 커버 이미지를 모델에 보내
 * hook_type / appeal / tone / summary 를 구조화 출력(JSON schema)으로 받는다.
 *
 * 필요: 환경변수 ANTHROPIC_API_KEY. 모델은 TAG_MODEL 로 변경 가능(기본 claude-opus-4-8).
 *   비용을 줄이려면 TAG_MODEL=claude-haiku-4-5 (이 분류 작업엔 충분).
 */
const fs = require('fs');
const path = require('path');
const AnthropicMod = require('@anthropic-ai/sdk');
const Anthropic = AnthropicMod.default || AnthropicMod;

const DIR = __dirname;
const CFG = JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8'));
const OUT_DIR = path.join(DIR, CFG.output_dir || 'docs');
const MANIFEST = path.join(DIR, 'data', 'manifest.json');
const TAGS = path.join(DIR, 'data', 'tags.json');
const MODEL = process.env.TAG_MODEL || 'claude-opus-4-8';
const CONCURRENCY = Number(process.env.TAG_CONCURRENCY || 5);
const en = CFG.tag_enums;

const client = new Anthropic(); // ANTHROPIC_API_KEY from env

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    hook_type: { type: 'string', enum: en.hook_type },
    appeal: { type: 'string', enum: en.appeal },
    tone: { type: 'string', enum: en.tone },
    summary: { type: 'string' },
  },
  required: ['hook_type', 'appeal', 'tone', 'summary'],
};

const INSTRUCTION =
  '이 이미지는 F&B 경쟁사의 Meta 광고 크리에이티브(커버)입니다. 아래 광고 카피를 함께 참고해 분류하세요.\n' +
  '- hook_type: 도입부 후킹 방식\n- appeal: 핵심 소구점\n- tone: 전반적 톤\n' +
  '- summary: 한국어 한 줄(40자 내외, 명사형 종결). 실제 보이는 것/카피 기준으로만, 추측 금지.\n' +
  '각 enum 값 중 정확히 하나만 고르세요.\n\n[광고 카피]\n';

async function tagOne(ad) {
  const buf = fs.readFileSync(path.join(OUT_DIR, ad.media_rel));
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') } },
        { type: 'text', text: INSTRUCTION + (ad.copy || '').slice(0, 800) },
      ],
    }],
  });
  const block = res.content.find(b => b.type === 'text');
  return JSON.parse(block.text);
}

(async () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const tags = fs.existsSync(TAGS) ? JSON.parse(fs.readFileSync(TAGS, 'utf8')) : {};
  const todo = [];
  for (const b of manifest.brands) {
    for (const ad of (b.new_ads || [])) {
      if (ad.media_rel && !tags[ad.library_id]) todo.push(ad);
    }
  }
  process.stderr.write(`[tag] ${todo.length} ads to tag with ${MODEL}\n`);
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    const out = await Promise.all(batch.map(async ad => {
      try {
        const t = await tagOne(ad);
        // enum 보정(모델이 빗나간 값을 내면 폴백)
        if (!en.hook_type.includes(t.hook_type)) t.hook_type = '혜택강조형';
        if (!en.appeal.includes(t.appeal)) t.appeal = '가성비·대용량';
        if (!en.tone.includes(t.tone)) t.tone = '정보형';
        return [ad.library_id, t];
      } catch (e) {
        process.stderr.write(`  fail ${ad.library_id}: ${e.message}\n`);
        return null;
      }
    }));
    for (const r of out) if (r) tags[r[0]] = r[1];
    fs.writeFileSync(TAGS, JSON.stringify(tags, null, 2)); // checkpoint after each batch
    process.stderr.write(`  ${Math.min(i + CONCURRENCY, todo.length)}/${todo.length}\n`);
  }
  console.log(JSON.stringify({ tagged_total: Object.keys(tags).length }));
})().catch(e => { console.error(e); process.exit(1); });
