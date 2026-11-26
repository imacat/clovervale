---
title: 執行與部署
---

四葉谷
======

四葉谷是一個小小的 MMORPG 世界，可以把故事一個個藏進去。
這是可以直接執行的發行版。程式都已經和相依套件打包在一起，除了 [Node.js]
24 以上，什麼都不用裝。

內容
----

| 路徑                       | 是什麼                         |
|----------------------------|--------------------------------|
| `server/server.mjs`        | 遊戲伺服器。                   |
| `client/`                  | 瀏覽器用戶端，全是靜態檔案。   |
| `bots/bots.mjs`            | 不用開畫面的機器人。           |
| `support-files/`           | 架設網站用的範例檔案。         |
| `LICENSE`                  | 四葉谷的授權條款。             |
| `THIRD-PARTY-LICENSES.txt` | 打包進來的相依套件的授權條款。 |

執行
----

先啟動遊戲伺服器。它預設在 8080 連接埠等 WebSocket 連線，也可以用 `--port`
選項換連接埠，或用 `--socket` 選項改聽 Unix socket 檔案。遊戲裡的一天預設是
20 分鐘，可以用 `--day-length` 選項改成別的分鐘數。伺服器一啟動，時鐘是
08:00，除非用 `--hold-time` 選項把時鐘固定在某個時刻，例如
`--hold-time 12:00`。

    node server/server.mjs

隨便找個靜態網頁伺服器提供 `client/` 目錄，再用 Firefox 打開。例如：

    python3 -m http.server --directory client 8000

用戶端會連到提供網頁那台主機的 8080 連接埠。要用別的遊戲伺服器，就寫在網址裡，
例如 `http://localhost:8000/?server=ws://game.example.com:9000`。`client/`
目錄裡也可以放一個 `client.conf` 指定遊戲伺服器，範例在
`support-files/.env.client`。

機器人可跑可不跑。機器人是會自己在村子裡走來走去的玩家，有它們在，村子才不會
冷冷清清；沒有它們，遊戲照樣能玩。預設有 4 個，可以用 `--count`
選項改數量。它們預設連到 `ws://localhost:8080` 的遊戲伺服器，也可以用
`--server` 選項指定 WebSocket 網址。Unix socket 檔案上的遊戲伺服器用
`ws+unix:` 網址表示，例如
`--server ws+unix:/run/clovervale/clovervale.sock`。

    node bots/bots.mjs

`BOT_COUNT` 和 `SERVER_URL` 這兩個設定跟這兩個選項的作用一樣。
設定可以是環境變數；沒設的話，如果執行機器人的目錄裡有 `.env`
檔案，就看裡面對應的那一行，範例在 `support-files/.env.bots`。選項比環境變數優先，環境變數又比檔案優先。

    SERVER_URL=ws://game.example.com:9000 BOT_COUNT=8 node bots/bots.mjs

部署
----

`support-files/` 裡的檔案，是部署在 `https://clovervale.example.com/`
的範例：Apache 負責提供用戶端，並把 `/ws` 的 WebSocket 連線透過 Unix socket
檔案轉給遊戲伺服器，systemd 則負責執行遊戲伺服器。機器人另外寫在下面的
[部署機器人](#部署機器人)。請把檔案裡的網站名稱和路徑改成你自己的。用 root
身分，裝好 `rsync` 之後：

 1. 建立遊戲伺服器和機器人用的使用者和群組，再把 Apache 加進這個群組。

        adduser --system --group --no-create-home clovervale
        adduser www-data clovervale

 2. 把發行版解開到一個新的暫存目錄，然後切換過去。

        cd "$(mktemp -d)"
        tar -xzf /path/to/clovervale-*-bin.tar.gz --strip-components=1 \
            --no-same-owner

 3. 把遊戲伺服器和用戶端複製到 `/srv/www/clovervale`。

        mkdir -p /srv/www/clovervale
        rsync -a --delete server/ /srv/www/clovervale/server/
        rsync -a --delete --exclude=/client.conf \
            client/ /srv/www/clovervale/client/

 4. 把用戶端的範例設定檔複製到 `/etc/node/`，再改成你要的內容。

        mkdir -p /etc/node
        cp support-files/.env.client /etc/node/clovervale.client.conf

 5. 把設定檔連結到用戶端會去找的位置。

        ln -s /etc/node/clovervale.client.conf \
            /srv/www/clovervale/client/client.conf

 6. 把 `support-files/clovervale.service` 複製到 `/etc/systemd/system/`，
    改好之後啟動遊戲伺服器。

        systemctl daemon-reload
        systemctl enable --now clovervale

 7. 幫網站申請 TLS 憑證。把 `support-files/clovervale-apache2.conf` 複製成
    `/etc/apache2/sites-available/clovervale.example.com.conf`，改好之後
    啟用網站。

        mkdir -p /var/log/apache2/clovervale
        a2enmod ssl headers proxy proxy_http
        a2ensite clovervale.example.com
        systemctl restart apache2

要升級的話，用新的發行版重做第 2、3 步，再執行 `systemctl restart clovervale`。
第 3 步會刪掉新發行版裡已經沒有的檔案，連結則會留著。

部署機器人
----------

這一段可以略過。要裝機器人，請先把網站架好。這裡由 systemd 執行機器人，它們跟
玩家一樣透過 Apache 連線。如果機器人的使用者有權限，也可以直接連遊戲伺服器的
Unix socket 檔案，作法見 `support-files/.env.bots`。用 root 身分，在解開發行版
的目錄裡（見[部署](#部署)第 2 步）：

 1. 把機器人複製到 `/srv/www/clovervale`。

        rsync -a --delete --exclude=/.env \
            bots/ /srv/www/clovervale/bots/

 2. 把機器人的範例設定檔複製到 `/etc/node/`，再改成你要的內容。機器人的使用者
    必須讀得到這個檔案。

        cp support-files/.env.bots /etc/node/clovervale.bots.conf

 3. 把設定檔連結到機器人會去找的位置。

        ln -s /etc/node/clovervale.bots.conf \
            /srv/www/clovervale/bots/.env

 4. 把 `support-files/clovervale-bots.service` 複製到
    `/etc/systemd/system/`，改好之後啟動機器人。

        systemctl daemon-reload
        systemctl enable --now clovervale-bots

要升級機器人，先升級網站，然後在新發行版的目錄裡重做上面第 1 步，再執行
`systemctl restart clovervale-bots`。第 1 步會刪掉新發行版裡已經沒有的檔案，
連結則會留著。

[Node.js]: https://nodejs.org/
