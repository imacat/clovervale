四葉谷
======

![四葉谷概念圖](packages/client/public/og-image.jpg)

四葉谷是一個小小的 MMORPG 世界，可以把故事一個個藏進去。

上 <https://clovervale.imacat.idv.tw/> 就能玩，說明文件在
<https://clovervale.imacat.idv.tw/docs/zh-tw/>。


需求
----

- [Node.js] 24 以上，附帶 npm。
- [Firefox]，只有瀏覽器檢查會用到。


指令
----

以下指令都在專案根目錄執行。

### `npm install`

安裝所有套件的相依套件。

### `npm run build`

檢查所有型別，並建置所有套件。

### `npm test`

跑所有套件的測試。

### `npm run coverage`

跑測試，並把涵蓋率報告放在 `coverage/`。

### `npm run lint`

用 lint 檢查所有程式碼。

### `npm run docs`

產生 API 文件，英文版放在 `docs/api/`，正體中文版放在 `docs/api/zh-tw/`。

### `npm run release:stage`

建置發行版，放進 `release/clovervale-<version>/`，等著打包。

### `npm run clean`

把上面這些指令產生的東西全部清掉。

### `npm run typecheck`

只檢查型別，不建置。

### `npm run test:watch`

檔案一有變動，就重跑測試。

### `npm run test:browser`

建置所有套件，然後在 Firefox 裡檢查用戶端。

### `npm run build:models`

重新產生用戶端的 3D 模型。

### `npm run test:models`

檢查 3D 模型是不是有效的 glTF，也符不符合遊戲的需要。

### 開發用

#### `npm run dev:server`

執行伺服器，程式一改就自動重新啟動。伺服器的選項寫在 `--` 後面，例如
`npm run dev:server -- --port 9000`。

#### `npm run dev:client`

在 <http://localhost:5173/> 提供用戶端。

#### `npm run dev:bots`

執行機器人，也就是會自己在村子裡走來走去的玩家。機器人的選項寫在 `--`
後面，例如 `npm run dev:bots -- --count 8`。


設定
----

伺服器預設聽 8080 連接埠，也可以用 `--port` 選項換連接埠，或用 `--socket`
選項改聽 Unix socket 檔案。遊戲裡的一天預設是 20 分鐘，可以用
`--day-length` 選項改成別的分鐘數；伺服器一啟動，世界的時鐘是 08:00。
`--hold-time` 選項則會把時鐘固定在某個時刻，例如 `--hold-time 12:00`。

用戶端會連到提供網頁那台主機的 8080 連接埠，也可以在網址的 `server`
查詢參數指定伺服器，例如 `?server=ws://game.example.com:9000`。

機器人預設有四個，可以用 `--count` 選項改數量。它們預設連到
`ws://localhost:8080`，也可以用 `--server` 選項指定伺服器網址，例如
`--server ws://game.example.com:9000`；要連 Unix socket 檔案上的伺服器，就用
`ws+unix:` 網址，例如 `--server ws+unix:/run/clovervale/clovervale.sock`。
`BOT_COUNT` 和 `SERVER_URL` 這兩個設定跟這兩個選項的作用一樣，但選項優先。
設定可以是環境變數；沒設的話，就看執行機器人的那個目錄裡 `.env`
檔案的對應那一行。用 `npm run dev:bots` 時，這個檔案就是
`packages/bots/.env`。

Firefox 預設用 `firefox` 指令執行，也可以用 `FIREFOX` 環境變數換成別的指令。


授權
----

Copyright 2026 imacat.

採用 Apache License 2.0 授權，詳見 [LICENSE](LICENSE)。

只有音樂例外：Kaazoom 的〈Embers on the Flagstone〉取自 [Pixabay]，採用
[Pixabay Content License]。

[Node.js]: https://nodejs.org/
[Firefox]: https://www.mozilla.org/firefox/
[Pixabay]: https://pixabay.com/
[Pixabay Content License]: https://pixabay.com/service/license-summary/
