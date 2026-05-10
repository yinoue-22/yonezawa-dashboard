---
description: 米沢観光ダッシュボードの指定イベントSNS反響を Yahoo!リアルタイム検索から取得して更新
---

# /sns-update {event-id}

指定されたイベントのSNS反響データを Yahoo!リアルタイム検索から取得し、ダッシュボードのJSONを更新してgit pushまで実行します。

## 引数

`event-id`：以下のいずれか
- `uesugi-matsuri-2025` ─ 米沢上杉まつり（4/29-5/3）／ ハッシュタグ：#米沢上杉まつり
- `suijou-hanabi-2025` ─ 米沢納涼水上花火大会（8/8）／ ハッシュタグ：#米沢納涼水上花火大会
- `360-of-2025` ─ 360°よねざわオープンファクトリー（9/11-13）／ ハッシュタグ：#360OF or #米沢オープンファクトリー
- `naseba-aki-2025` ─ なせばなる秋まつり（9/27-28）／ ハッシュタグ：#なせばなる秋まつり
- `sengoku-hanabi-2025` ─ よねざわ戦国花火大会（10/11）／ ハッシュタグ：#よねざわ戦国花火大会
- `yukidouro-2026` ─ 上杉雪灯篭まつり（2/14-15）／ ハッシュタグ：#上杉雪灯篭まつり

## 実行手順

引数 `$ARGUMENTS` を `event-id` として、以下を順番に実行してください。

### Step 1: イベントメタデータを読み込む

`data/events/sns-events-meta.json` を読み、`event-id` に対応する以下を取得：
- `name`（表示名）
- `hashtags`（検索対象のハッシュタグ配列、優先度順）
- `date_start` / `date_end`（イベント開催日）
- `query_window_days`（検索期間：開催日±N日、デフォルト14）

### Step 2: Yahoo!リアルタイム検索で投稿を取得

メインハッシュタグについて WebFetch で以下のURLを取得：

```
https://search.yahoo.co.jp/realtime/search?p={URL_ENCODED_HASHTAG}&ei=UTF-8
```

返されたHTMLから以下を抽出：
- 投稿日時
- ユーザーハンドル（@xxx）
- 投稿本文
- いいね数（取得できる範囲で）
- リポスト数（取得できる範囲で）
- 含まれるハッシュタグ

**取得目標：30投稿（最大50投稿まで）**。HTML構造解析できない場合は、上位投稿のテキスト要約だけでも記録してください。

### Step 3: CSVに保存

`data/raw/sns-{event-id}.csv` に以下のヘッダーで保存：

```csv
date,platform,handle,text,likes,reposts,hashtags
2025-10-11,X,@example,投稿本文,123,45,#tag1|#tag2
```

`platform` は X 固定。Instagramは別タスクで手動収集とする。

### Step 4: 解析スクリプトを実行

```bash
npx tsx scripts/sns-process.ts --event {event-id}
```

これが `data/events/sns-{event-id}.json` を生成・更新します。生成されたJSONの中身を確認してください（投稿数・感情比率・TOPワードがそれっぽいか）。

### Step 5: コミット＆プッシュ

```bash
git add data/raw/sns-{event-id}.csv data/events/sns-{event-id}.json
git commit -m "chore: {イベント名} SNS反響を最新化（{投稿数}件）"
git push
```

### Step 6: 結果報告

ユーザーに以下のサマリーを返してください：
- 取得投稿数
- 感情比率（ポジ/中立/ネガ）
- TOPキーワード上位5
- 影響力TOP投稿（最もいいねが多い投稿の抜粋）
- コミットハッシュ
- 「数分後にダッシュボードに反映されます」の旨

## エラーハンドリング

- Yahoo!リアルタイム検索のHTML構造が読めない／投稿が0件の場合：
  - エラーで止めず、ユーザーに「Yahoo!側でブロック・構造変更があった可能性。手動で投稿をコピペしますか？」と確認してください
- 期間外で投稿が見つからない場合：
  - `query_window_days` を伸ばして再試行（最大±30日まで）

## 制約・注意

- 取得は公開投稿のみ。鍵アカは取得不可
- Yahoo!の利用規約上、過度な高頻度取得はNG。手動オペレーション相当のペースで
- 個人特定可能な情報（電話番号・住所等）が混入していたらフィルタ
