# MD MARKET | iPhone単独PWA v1.0

**Windowsなし・同一Wi-Fi不要のiPhone向けアプリ**を作るための静的Web/PWAソースです。MAMO BOATと同じ GitHub Pages + PWA 方式を想定します。

## 何ができるか
- iPhone Safari → ホーム画面に追加して全画面で起動
- CSVファイルをiPhone内のIndexedDBに保存（Windows、Python、Supabase不要）
- 車種・メーカー・グレード・年式・走行距離・色・装備で絞り込み
- 業者間オークション / 消費者向けオークション / 小売掲載価格を区別
- 異なる取引市場の価格中央値を混ぜない
- 取引件数、車種数、価格中央値、月別推移、車両カード
- CSVバックアップ・復元（再取り込み）・重複除去
- Service Workerによる画面のオフラインキャッシュ

## 現時点でできないこと
- 自動取得・外部サイトの巡回、カーセンサー掲載日数の計算
- 複数端末のデータ同期
- サーバーでの共同共有、SNSログイン
- iPhoneネイティブアプリとしてApp Storeから配布

**重要:** データはiPhoneのWebアプリ専用保存領域。Safariやホーム画面版の削除・ストレージ整理でデータが消える場合があるため、定期CSVバックアップが必要です。Safariとホーム画面版は保存領域が別になる場合があります。CSVはホーム画面から起動後に取り込むのを推奨します。

## 無料公開方法（GitHub Pages）

1. GitHubで新規リポジトリ `md-market-intelligence` を**Public**で作成（ソースだけを公開し、個人データや取引データはアップロードしない）。
2. このZIPの中の `index.html`, `app.js`, `storage.js`, `style.css`, `sw.js`, `manifest.webmanifest`, `icons/`, `.nojekyll` をリポジトリのルートにアップロードする。
3. Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save。
4. GitHubが発行した HTTPS URL をiPhoneのSafariで開き、共有 → ホーム画面に追加 → Webアプリとして開くをオン → 追加。
5. **ホーム画面のMD MARKETを開いてから**CSVをインポートする。

通常のURLは `https://<GitHubユーザー名>.github.io/md-market-intelligence/` の形式です。Pagesを実際に公開するまでは有効URLではありません。

## テスト（開発者向け）

Nodeで `node --check storage.js` / `node --check app.js`、Pythonで `python -m http.server 8765`、Chromiumで表示/CSV取り込みをテスト。Service Workerとホーム画面表示は HTTPS 上で検証する。

## アプリデータ

全ての取引レコードは初期状態で0件。既存の109件CSVは原本照合が完了していないため、同梱・自動登録しません。利用する場合は「未検証」としてインポート。出典URLは真正性を保証しません。

## 将来のクラウド版

共有・同期したい場合は専用Supabaseプロジェクト＋認証/RLSで別途実装する。既存MAMO BOATの本番DBとは分離すること。データ利用許可のないソースを自動収集しない。