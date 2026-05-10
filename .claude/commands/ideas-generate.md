---
description: イベントの全データソースを統合分析して改善案を生成
---

# /ideas-generate {event-id}

イベントの**人流（Agoop）・カメラ車両・宿泊（じゃらん）・SNS反響**の各データを横断分析し、6カテゴリに分類した改善案を `data/events/ideas-{event-id}.json` として出力します。

## 引数
`event-id` ─ 以下のいずれか
- `uesugi-matsuri-2025`
- `suijou-hanabi-2025`
- `360-of-2025`
- `naseba-aki-2025`
- `sengoku-hanabi-2025`
- `yukidouro-2026`

## 実行手順

### Step 1: 利用可能データの確認

以下のファイルが存在するか確認し、**読めるものから読む**：

| 種類 | ファイル名 | 中身の例 |
|---|---|---|
| SNS | `data/events/sns-{event-id}.json` | 投稿数・感情比率・TOPキーワード・ハッシュタグ・TOP投稿 |
| Agoop人流 | `data/events/agoop-{event-id}.json` | 滞在人口時系列・居住地分布・性年代 |
| カメラ | `data/events/camera-{event-id}.json` | 4拠点の日別/時間帯別訪問車両数 |
| 宿泊 | `data/events/lodging-{event-id}.json` | 取扱額・人泊・発地TOP・予約リードタイム |

ファイルが無い場合は `index.html` 内のSNS_DATA・各チャート data: からも参照可能。

### Step 2: 横断分析

各データソースから以下を抽出して**ギャップ・伸びしろ・ネガポイント**を特定：

- **集客の強み**：どのセグメントから来ているか（発地・年代・性別）
- **集客の弱み**：来訪が少ない属性、未開拓の市場
- **満足度の高い体験**：SNSポジティブテーマ、リピート意向
- **不満点**：SNSネガティブ、宿泊の単価ギャップ、カメラ滞留時間
- **時系列の特徴**：ピーク時間、混雑時間帯、平日休日差
- **データ取得の欠落**：未取得指標、要復旧データ

### Step 3: 6カテゴリで改善案を5〜10個作成

カテゴリ：
- `shukyaku` ─ 集客向上
- `manzoku` ─ 満足度向上
- `unei` ─ 運営改善
- `pr` ─ PR・プロモ強化
- `shouhin` ─ 商品開発
- `data` ─ データ整備

各案に：
```json
{
  "category": "shukyaku",
  "category_label": "集客向上",
  "title": "簡潔な提案タイトル（15-25文字）",
  "evidence": [
    {"source": "lodging", "data": "東京都発地17%（首都圏最大シェア）"},
    {"source": "sns", "data": "東京アカウントからのポジ言及4件"}
  ],
  "action": "具体的な実施案（2-3文）",
  "impact_text": "宿泊延べ +20%、県外比率 +5pt 等",
  "priority": "high"
}
```

`source` の値：`sns` / `agoop` / `camera` / `lodging` / `analysis` （横断分析）
`priority`：`high` / `medium` / `low`

**重要：単一データソースだけでなく、**`evidence` には**複数ソース横断の根拠**を含めること。例：「SNSで〇〇のポジ言及多数 + 宿泊データで該当層の単価ギャップあり → 商品設計の余地」

### Step 4: 出力ファイル

```json
{
  "event_id": "sengoku-hanabi-2025",
  "event_name": "よねざわ戦国花火大会",
  "generated_at": "2026-05-09T10:00:00+09:00",
  "data_sources_used": ["sns", "camera", "lodging"],
  "summary": "横断分析で見えた最大の論点を1-2文で",
  "ideas": [ ... ]
}
```

`data/events/ideas-{event-id}.json` として保存。

### Step 5: コミット＆プッシュ

```bash
git add data/events/ideas-{event-id}.json
git commit -m "feat: {event-name} 改善案を統合分析で生成（{N}案）"
git push
```

### Step 6: 結果報告

ユーザーに：
- 利用したデータソース
- 生成した提案数（カテゴリ別内訳）
- 特に注目すべき提案2-3件のハイライト
- ダッシュボード反映までの目安時間

## 注意

- データが揃っていないイベントでも**取れる範囲で生成**すること（その場合 `summary` に「データ未取得項目」を明記）
- 既存の `data/events/ideas-{event-id}.json` がある場合は**全体置換**で更新（マージしない）
- 提案内容は**実行可能性の高いもの**を優先（予算・人員制約を考慮）
