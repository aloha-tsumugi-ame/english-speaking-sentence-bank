# English Speaking Sentence Bank

## プロジェクトの目的

英会話で「言いたかった英文」を日付・トピック別に蓄積し、音読・復習するための自己完結型HTML
`English_Speaking_Sentence_Bank.html` を継続的に更新するプロジェクト。

## 担当範囲

このプロジェクトが担当するのは **完成済みSentence ListをHTMLへ正確に反映すること だけ**。

- 担当する: ユーザーから渡された完成済みSentence Listを `data/sentence-bank.json` に追加し、HTMLを再生成・検証する
- 担当しない: 英会話のフィードバック、英文の添削・評価、登録する英文の選定、新しい英文の作成
  （これらはプロジェクト外で完了している）

## ディレクトリ構成

```text
english-speaking-sentence-bank/
├── CLAUDE.md                              このファイル（更新ルール）
├── English_Speaking_Sentence_Bank.html    生成物（直接編集しない）
├── index.html                             GitHub Pages 用リダイレクト（固定ファイル）
├── data/
│   └── sentence-bank.json                 Sentence Bank の正本
├── template/
│   └── sentence-bank.template.html        HTMLテンプレート（デザイン・機能）
└── scripts/
    └── build.mjs                          生成・検証スクリプト
```

- `template/sentence-bank.template.html` の `__SENTENCE_BANK_DATA__` に JSON が、
  `__UPDATED_LABEL__` に最新日付の年月（例: `October 2026`）が埋め込まれる。
- デザインや機能を変更する場合のみテンプレートを編集する（英文の追加では触らない）。

## データ形式（data/sentence-bank.json）

```json
[
  {
    "date": "2026-10-04",
    "topics": [
      {
        "title": "Dokan Festival",
        "sentences": [
          [1, "I went to the Dokan Festival last weekend."],
          [2, "..."]
        ]
      }
    ]
  }
]
```

- 1セッション = 1日付。`topics` はトピックの配列、`sentences` は `[番号, "英文"]` の配列。
- 番号はユーザーが提示した番号をそのまま使う。トピックごとに1から振り直す日も、
  日付内で通し番号の日もあるが、どちらも既存の形式のまま維持する。

## 更新ルール（必ず守る）

1. 正本は `data/sentence-bank.json`。英文を追加するために生成済みHTMLを直接編集しない。
2. ユーザーが提示した英文だけを登録する。英文を勝手に追加・添削・要約・言い換えしない
   （句読点、引用符 `’ “ ”`、大文字小文字も提示どおり）。
3. 日本語の説明、前置き、補足、構文解説は登録しない。英文のみを登録する。
4. 日付、トピック名、英文番号はユーザーの提示どおりに維持する。
5. 同一日・同一トピック内の完全重複は追加しない（スキップした文はユーザーに報告する）。
6. 別の日付や別のトピックにある英文は、同じ英文でも勝手に削除しない（重複扱いしない）。
7. 既存データを削除・変更・並び替えしない。
   - 新しいトピックはその日付の `topics` の **末尾** に追加する。
   - 既存トピックへの追記は、そのトピックの `sentences` の **末尾** に追加する。
   - 理由: 習得済みチェックの LocalStorage キーが `日付-トピック位置-文位置` のため、
     途中に挿入すると既存のチェック状態がずれる。
8. 日付は昇順で配置する。新しい日付は正しい位置に挿入する。
9. 同じ日付がすでに存在する場合は、新しい日付セクションを作らずその日付へ統合する。
10. 更新後は必ず `node scripts/build.mjs` でHTMLを再生成する。
11. JSONとHTMLの文数が一致することを確認する（ビルドが自動検証する）。
12. 更新前後の件数（セッション数・トピック数・英文数）をユーザーへ報告する。

既存データの修正・削除は、ユーザーが明示的に依頼した場合に限り
`node scripts/build.mjs --allow-changes` で実行できる。それ以外では使わない。

## Sentence List の追加手順

1. ユーザーが提示した Sentence List から、日付・トピック名・番号・英文を読み取る。
   日本語の説明や解説部分は除外する。日付や所属トピックが不明な場合は推測せずユーザーに確認する。
2. `data/sentence-bank.json` を編集する。
   - 日付が既存 → その日付の `topics` に統合（同名トピックがあればその末尾に追記、なければ末尾に新トピック）
   - 日付が新規 → 昇順になる位置に新しいセッションを挿入
   - 同一日・同一トピック内の完全重複はスキップ
3. 事前検証（任意）: `node scripts/build.mjs --check`
4. 生成: `node scripts/build.mjs`
5. 出力された「更新前 → 更新後」の件数と、スキップした重複があればそれをユーザーへ報告する。
6. GitHub へ反映する場合は `data/`・HTML をコミットして push する（GitHub Pages に自動公開される）。

## HTMLの生成方法

```bash
node scripts/build.mjs           # 検証 → 生成 → 生成物の再検証 → 件数報告
node scripts/build.mjs --check   # 検証と件数比較のみ（HTMLは書き込まない）
```

外部依存はなし（Node.js 18 以上の標準モジュールのみ）。ビルドは次を自動で検証し、問題があれば失敗する。

- JSONとして正しいこと、形式（`date` / `topics` / `title` / `sentences` / `[番号, 英文]`）
- 日付の形式・昇順・重複なし、空のトピック名・空の英文なし、英文に日本語が含まれないこと
- 同一日・同一トピック内の完全重複・番号重複がないこと
- 既存HTMLに収録済みのエントリが削除・変更・並び替えされていないこと
- 生成HTMLに埋め込まれたデータが JSON と完全一致し、文数が一致すること
- 主要機能（検索・日付絞り込み・ランダム・読み上げ・音声選択・チェック・LocalStorage・
  非表示・印刷・件数表示）が生成HTMLに残っていること、外部リソースを参照していないこと

## HTMLの開き方

- ローカル: `open English_Speaking_Sentence_Bank.html`（ブラウザで直接開ける自己完結型HTML）
- GitHub Pages: https://aloha-tsumugi-ame.github.io/english-speaking-sentence-bank/
- 習得済みチェックはブラウザの LocalStorage に保存されるため、ローカルと Pages、
  ブラウザごとにチェック状態は別々になる。

## 更新後の確認方法

1. `node scripts/build.mjs` が `✓` で終了し、「JSON と HTML の文数一致」が表示されること
2. 件数の増分が、ユーザーが提示した英文数（重複スキップ分を除く）と一致すること
3. `git diff data/sentence-bank.json` で追加行のみであること（既存行の変更・削除がないこと）
4. 必要に応じてHTMLをブラウザで開き、追加した日付・トピック・英文が表示されることを確認する
