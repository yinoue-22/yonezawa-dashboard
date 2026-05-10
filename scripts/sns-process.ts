/**
 * SNS反響データ処理スクリプト
 *
 * 使い方:
 *   npx tsx scripts/sns-process.ts --event {event-id}
 *
 * 入力:
 *   data/raw/sns-{event-id}.csv（CSV形式の投稿データ、Claude Codeが生成）
 *   data/events/sns-events-meta.json（イベントメタデータ）
 *
 * 出力:
 *   data/events/sns-{event-id}.json（ダッシュボード読込用の集計JSON）
 *
 * 処理内容:
 *   - 投稿テキストの形態素分割（簡易・kuromoji相当）
 *   - 感情判定（東北大日本語感情極性辞書ベース）
 *   - キーワード頻度集計
 *   - ハッシュタグ頻度集計
 *   - 言及量タイムライン生成
 *   - 影響力TOP投稿抽出
 */
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';

interface SnsPost {
  date: string;
  platform: string;
  handle: string;
  text: string;
  likes: number;
  reposts: number;
  hashtags: string[];
}

interface EventMeta {
  name: string;
  name_short: string;
  tab_key: string;
  date_start: string;
  date_end: string;
  query_window_days: number;
  hashtags: string[];
}

// ====== 簡易感情極性辞書 ======
const POSITIVE = new Set([
  '良い', '素晴らしい', '凄い', 'すごい', '感動', '感激', '楽しい', '美しい',
  '綺麗', 'きれい', '最高', '素敵', '嬉しい', '幸せ', '迫力', '鳥肌', '泣ける',
  '号泣', '圧巻', '満足', 'リピート', '面白い', '美味しい', 'うまい', '映え',
  '幻想的', '神秘', '感謝', 'ありがとう', '行きたい', '来年も', 'また', '神',
  '神回', 'ヤバい', 'ヤバ', '映える', '癒し', '癒される', 'ほっこり', '心温まる'
]);
const NEGATIVE = new Set([
  '混雑', '残念', '悪い', '退屈', 'つまらない', '失望', '物足りない', '不便',
  '高い', '遠い', '寒すぎ', '暑すぎ', '渋滞', '駐車場', '並ぶ', '待ち', '疲れた',
  'がっかり', '微妙', 'ダメ', 'やばい', '最悪', '残念', '無理'
]);

function analyzeSentiment(text: string): 'positive' | 'neutral' | 'negative' {
  let pos = 0, neg = 0;
  POSITIVE.forEach(w => { if (text.includes(w)) pos++; });
  NEGATIVE.forEach(w => { if (text.includes(w)) neg++; });
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

// ====== 簡易形態素分割 ======
const STOPWORDS = new Set([
  'の', 'に', 'は', 'を', 'が', 'と', 'で', 'も', 'こと', 'これ', 'それ', 'あれ',
  'ます', 'です', 'した', 'する', 'いる', 'ある', 'なる', 'なった', 'てる', 'てい',
  'よう', 'けど', 'から', 'まで', 'って', 'たい', 'なら', 'では', 'とか', 'だけ',
  'みたい', 'such', 'this', 'the', 'and', 'for', 'a', 'an'
]);

function tokenize(text: string): string[] {
  // ハッシュタグ・URL・記号除去
  let cleaned = text
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/#\S+/g, ' ')
    .replace(/@\S+/g, ' ')
    .replace(/[「」『』（）()【】［］\[\]、。！？!?\s\d]+/g, ' ');

  // 2文字以上のトークンを抽出
  // 日本語：連続する漢字・カタカナ・ひらがなの塊
  const tokens: string[] = [];
  const regex = /[一-龯]{2,}|[ァ-ヶー]{2,}|[a-zA-Zぁ-ん]{3,}/g;
  let m;
  while ((m = regex.exec(cleaned)) !== null) {
    const t = m[0];
    if (!STOPWORDS.has(t) && t.length >= 2) tokens.push(t);
  }
  return tokens;
}

function loadEventMeta(eventId: string): EventMeta {
  const meta = JSON.parse(fs.readFileSync('data/events/sns-events-meta.json', 'utf-8'));
  if (!meta.events[eventId]) {
    throw new Error(`Unknown event-id: ${eventId}`);
  }
  return meta.events[eventId];
}

function loadCsv(eventId: string): SnsPost[] {
  const csvPath = `data/raw/sns-${eventId}.csv`;
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}\nClaude Code が生成する想定です。手動で投稿を貼ってもOK`);
  }
  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows: any[] = parse(csvText, { columns: true, skip_empty_lines: true });
  return rows.map(r => ({
    date: r.date,
    platform: r.platform || 'X',
    handle: r.handle || '',
    text: r.text || '',
    likes: parseInt(r.likes || '0'),
    reposts: parseInt(r.reposts || '0'),
    hashtags: (r.hashtags || '').split('|').filter(Boolean)
  }));
}

function main() {
  const args = process.argv.slice(2);
  const ev = args[args.indexOf('--event') + 1];
  if (!ev) {
    console.error('Usage: npx tsx scripts/sns-process.ts --event {event-id}');
    process.exit(1);
  }

  const meta = loadEventMeta(ev);
  const posts = loadCsv(ev);

  if (posts.length === 0) {
    console.error('⚠️ No posts in CSV');
    process.exit(1);
  }

  // 感情判定
  const sentCount = { positive: 0, neutral: 0, negative: 0 };
  posts.forEach(p => sentCount[analyzeSentiment(p.text)]++);

  // ワード頻度
  const wordMap = new Map<string, number>();
  posts.forEach(p => {
    const seen = new Set<string>();  // 1投稿内で重複カウントしない
    tokenize(p.text).forEach(w => {
      if (!seen.has(w)) {
        wordMap.set(w, (wordMap.get(w) || 0) + 1);
        seen.add(w);
      }
    });
  });
  const wordFreq = Array.from(wordMap.entries())
    .filter(([_, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50);

  // ハッシュタグ頻度
  const tagMap = new Map<string, number>();
  posts.forEach(p => p.hashtags.forEach(t => {
    tagMap.set(t, (tagMap.get(t) || 0) + 1);
  }));
  const hashtagFreq = Array.from(tagMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // タイムライン
  const dateMap = new Map<string, number>();
  posts.forEach(p => dateMap.set(p.date, (dateMap.get(p.date) || 0) + 1));
  const timeline = Array.from(dateMap.entries())
    .sort()
    .map(([date, count]) => ({ date, count }));

  // TOP投稿
  const topPosts = [...posts]
    .sort((a, b) => (b.likes + b.reposts * 2) - (a.likes + a.reposts * 2))
    .slice(0, 5);

  const totalImp = posts.reduce((s, p) => s + Math.max(p.likes * 100, 100), 0);
  const posPct = Math.round(sentCount.positive / posts.length * 100);

  const out = {
    event_id: ev,
    event_name: meta.name,
    event_name_short: meta.name_short,
    tab_key: meta.tab_key,
    date_start: meta.date_start,
    date_end: meta.date_end,
    last_updated: new Date().toISOString(),
    posts_count: posts.length,
    impressions_estimated: totalImp,
    sentiment_pct: posPct,
    sentiment: sentCount,
    word_freq: wordFreq,
    hashtag_freq: hashtagFreq,
    timeline,
    top_posts: topPosts
  };

  const outPath = `data/events/sns-${ev}.json`;
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8');

  console.log(`✓ ${posts.length} posts → ${outPath}`);
  console.log(`  感情：ポジ${sentCount.positive} / 中立${sentCount.neutral} / ネガ${sentCount.negative}`);
  console.log(`  TOPワード：${wordFreq.slice(0, 5).map(([w, c]) => `${w}(${c})`).join(', ')}`);
  console.log(`  TOP投稿：${topPosts[0]?.handle} (♥${topPosts[0]?.likes})`);
}

main();
