# MD MARKET v3.3 — 47都道府県の新規求人数（e-Stat連携基盤）

## 目的
e-Stat一般職業紹介状況（職業安定業務統計）長期時系列表12「都道府県（受理地）別 雇用形態別 新規求人数（実数）」を地域経済の外部参考指標として扱う。全国求人情報協会の求人広告件数とは別系列で、直接合算しない。

公式出典: https://www.e-stat.go.jp/stat-search/files?cycle=1&layout=dataset&page=1&toukei=00450222&tstat=000001020327

2026年9月分の公式ファイルは10月30日に公表済み。ただしこのリポジトリ内ではまだ公式Excelの抽出結果を検証できていないため、data/prefecture_jobs.json は unavailable/空配列のまま。**公表済みとアプリ検証済みを混同しない。**

## 実装した内容
- 市場画面の47都道府県別の新規求人数パネル。都道府県選択（初期値愛知）、月選択、前月比/前年同月比、比較可能な場合の全県ランキング、増加/減少件数。
- 毎月47件の値を厳格に検査するスキーマ。重複・不正な数値・欠測・未来日を拒否。比較対象の月がなければ0補完せず「比較データ不足」とする。
- 端末内での整形済みJSON取込・解除。ユーザー取込は常に「原本未照合」で表示し、公式原本確認済みに自動昇格させない。読み込んだユーザーデータを公開GitHubへアップロードしない。
- Python標準ライブラリのCSV正規化補助スクリプト scripts/normalize_prefecture_jobs.py。原本Excelの自動パーサではなく、人手で転記したCSVを検証するもの。
- PWAオフラインキャッシュ・JS/ Pythonテスト。

## CSVの利用方法
ヘッダーは month,prefecture,new_job_offers。例: 2026年8月・9月の各47県を人が公式原本から転記した場合、96ではなく94行。前月比較に最低2か月のデータ、前年同月比較に12か月前のデータが必要。架空値はサンプル公開JSONに混入させない。

python scripts/normalize_prefecture_jobs.py --csv verified_transcription.csv --published-on 2026-10-30 --out my_prefecture_jobs.json

生成JSONをiPhoneの市場画面で選んで取り込む。

## 未完成・今後の実装条件
1. e-Stat表12の公式Excelのシート・セル構造を取得して確認。
2. 「総数・受理地・原数値」のセルだけを抽出し47県・対象月を照合。サブ系列の二重加算を防止。
3. GitHub Actionsの月次自動更新、公表日・ソースID・取得時刻保存、原本が変わった際は旧データを保持して失敗を検知。
4. 許諾済みの地域別中古車販売データが得られてから、人口規模、季節性、時差等を考慮し求人と中古車相場の関係を検証。求人増減だけで仕入れを判断しない。
5. 表12単独では市区町村・業種を取得できない。別途データ提供元の定義と利用条件が必要。

## テスト
node tests/test_prefecture_jobs.cjs
python -m unittest discover -s tests -p test_prefecture_jobs.py -v
node tests/test_offline_data.cjs
node tests/test_startup_diagnostics.js
