# 公開データ自動更新・監視（2026-11-11）

## 仕組み
- GitHub Actions `.github/workflows/public-data-refresh.yml` が毎日 04:43 UTC / 日本時間 13:43 に実行されます（GitHub側のスケジュール遅延あり）。
- `scripts/refresh_all_public_data.py` は各データ取得を独立して実行。1系統が失敗しても他系統を継続し、失敗した取得元の直前の検証済みJSONを保持します。
- 日次：USS月次全体集計、軽乗用車車名別販売、登録乗用車車名別販売、e-Stat中古乗用車輸出（API ID登録後）。
- 毎週月曜：都道府県求人・人口移動・故障ニュース見出し。
- 毎月10日：軽乗用車・登録乗用車の歴史系列。
- 結果は `data/refresh_status.json` に保存し、アプリの「市場」画面で利用可能／取得失敗／更新遅れ／API設定待ち／手動管理を分けて表示します。
- アプリ表示時および復帰時（20分以上経過時）に公開済みJSONを再確認します。iPhoneが閉じている間もサーバー側で定期実行されますが、GitHub Actionsの遅延・停止は起こり得ます。

## 自動取得できない／行わないもの
- 車両ごとのUSS落札価格、カーセンサー・グーネットの個別掲載、公開元との契約が必要なランキングの無断巡回。
- ユーザー自身が記録した個別車両、査定額、在庫観測、原典転記、仮定シナリオ（ブラウザー内のIndexedDB・localStorageを自動編集しない）。
- カタログ・参考資料や独自の分析値を最新の取引実績に見せかける更新。

## 設定が必要なもの
- 政府統計の一部はe-Statの無料アプリケーションIDが必要。GitHubリポジトリの **Settings → Secrets and variables → Actions** に `ESTAT_APP_ID` を登録してください。認証情報をWeb公開ディレクトリには保存しません。
- GitHub Actions（リポジトリのActions設定）とワークフローの Contents: write 権限が有効であることを確認してください。
- GitHub Pagesでは最新ファイル公開まで遅延することがあります。アプリの「再確認」ボタンは現在公開済みデータの読み直しであり、GitHub Actionsを起動するボタンではありません。

## 動作確認
1. GitHubの **Actions → Unified public data refresh and health monitoring → Run workflow** を手動実行。全系統を即時点検するときは Full refresh を選択。
2. `data/refresh_status.json` に処理日時、出典・データ確認日時、結果が出ているかを確認。
3. iPhoneのMD MARKET →「市場」→「公開データの自動更新状況」を開く。古い表示の場合はSafariで再読み込み。
4. 「取得失敗」が出た場合はActionsの該当ステップのログ、元サイトの最新のHTML/PDF構造を調査。**0件埋めや未確認の推定値で置換しない。**

## 技術的な限界
各情報源には固有の公開頻度があります。毎日巡回しても毎日数値が変わるわけではありません。取得元の障害、ソース変更、API利用規約、GitHub Actionsの停止・遅延、公開側の更新遅延などにより、常に最新である保証はありません。
