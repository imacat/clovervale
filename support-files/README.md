Clovervale
==========

Clovervale (四葉谷) is a small learning MMORPG for studying network state
synchronization.  This is a ready-to-run release.  The programs are
bundled with their dependencies, so there is nothing to install except
[Node.js] 24 or later.

Contents
--------

| Path                       | What it is                                  |
|----------------------------|---------------------------------------------|
| `server/server.mjs`        | The game server.                            |
| `client/`                  | The browser client, as static files.        |
| `bots/bots.mjs`            | The headless bots.                          |
| `support-files/`           | Example files for deploying on a web site.  |
| `LICENSE`                  | The license of Clovervale.                  |
| `THIRD-PARTY-LICENSES.txt` | The licenses of the bundled dependencies.   |

Running
-------

Start the game server.  It listens for WebSocket connections on port
8080, or on the port of the `--port` option, or on the Unix socket file
of the `--socket` option.  Its day lasts 20 minutes, or as many minutes
as the `--day-length` option tells, and its clock reads 08:00 when it
starts, unless the `--hold-time` option holds the clock at a fixed time
of day, as in `--hold-time 12:00`.

    node server/server.mjs

Serve the `client/` directory with any static web server, and open it in
Firefox.  For example:

    python3 -m http.server --directory client 8000

The client connects to port 8080 of the host that serves the page.  To
use another game server, name it in the page address, for example
`http://localhost:8000/?server=ws://game.example.com:9000`.  The
`client/` directory may also hold a `client.conf` naming the game
server; `support-files/.env.client` is an example of it.

Running the bots is optional.  The bots are players that walk around the
village by themselves, so that the village does not feel empty; the game
works the same without them.  There are 4 of them, or as many as the
`--count` option tells, and they connect to the game server at
`ws://localhost:8080`, or at the WebSocket URL of the `--server` option.
A game server on a Unix socket file is named with a `ws+unix:` URL, as
in `--server ws+unix:/run/clovervale/clovervale.sock`.

    node bots/bots.mjs

The `BOT_COUNT` and `SERVER_URL` settings tell the same as the two
options.  A setting is an environment variable, or else a line of the
`.env` file in the directory that the bots are run in, if there is
one; `support-files/.env.bots` is an example of it.  An option takes
precedence over an environment variable, and an environment variable
over the file.

    SERVER_URL=ws://game.example.com:9000 BOT_COUNT=8 node bots/bots.mjs

Deploying
---------

The files in `support-files/` are an example of a deployment at
`https://clovervale.example.com/`, with Apache serving the client and
passing the WebSocket connections at `/ws` on to the game server
through a Unix socket file, and with systemd running the game server.
The bots are covered separately, in
[Deploying the Bots](#deploying-the-bots-optional) below.  Change the
site name and the paths in the files to your own.  As root, with
`rsync` installed:

 1. Create the user and the group of the game server and the bots, and
    let Apache into the group.

        adduser --system --group --no-create-home clovervale
        adduser www-data clovervale

 2. Unpack the release into a new temporary directory, and go there.

        cd "$(mktemp -d)"
        tar -xzf /path/to/clovervale-*-bin.tar.gz --strip-components=1 \
            --no-same-owner

 3. Copy the game server and the client to `/srv/www/clovervale`.

        mkdir -p /srv/www/clovervale
        rsync -a --delete server/ /srv/www/clovervale/server/
        rsync -a --delete --exclude=/client.conf \
            client/ /srv/www/clovervale/client/

 4. Copy the example settings file of the client to `/etc/node/`, and
    edit it.

        mkdir -p /etc/node
        cp support-files/.env.client /etc/node/clovervale.client.conf

 5. Link the settings file to where the client looks for it.

        ln -s /etc/node/clovervale.client.conf \
            /srv/www/clovervale/client/client.conf

 6. Copy `support-files/clovervale.service` to `/etc/systemd/system/`,
    edit it, and start the game server.

        systemctl daemon-reload
        systemctl enable --now clovervale

 7. Obtain a TLS certificate for the site.  Copy
    `support-files/clovervale-apache2.conf` to
    `/etc/apache2/sites-available/clovervale.example.com.conf`, edit
    it, and enable the site.

        mkdir -p /var/log/apache2/clovervale
        a2enmod ssl headers proxy proxy_http
        a2ensite clovervale.example.com
        systemctl restart apache2

To upgrade, repeat steps 2 and 3 with the new release, and run
`systemctl restart clovervale`.  Step 3 removes the files that the new
release no longer has, and keeps the link.

Deploying the Bots (Optional)
-----------------------------

Set up the bots after the site.  Here systemd runs the bots, and they
connect through Apache, as the players do.  They may instead connect
straight to the Unix socket file of the game server, if their user can;
`support-files/.env.bots` shows how.  As root, in the directory of the
unpacked release (see step 2 of [Deploying](#deploying)):

 1. Copy the bots to `/srv/www/clovervale`.

        rsync -a --delete --exclude=/.env \
            bots/ /srv/www/clovervale/bots/

 2. Copy the example settings file of the bots to `/etc/node/`, and
    edit it.  The user of the bots must be able to read it.

        cp support-files/.env.bots /etc/node/clovervale.bots.conf

 3. Link the settings file to where the bots look for it.

        ln -s /etc/node/clovervale.bots.conf \
            /srv/www/clovervale/bots/.env

 4. Copy `support-files/clovervale-bots.service` to
    `/etc/systemd/system/`, edit it, and start the bots.

        systemctl daemon-reload
        systemctl enable --now clovervale-bots

To upgrade the bots, upgrade the site first, then repeat step 1 above in
the directory of the new release, and run
`systemctl restart clovervale-bots`.  Step 1 removes the files that the
new release no longer has, and keeps the link.

[Node.js]: https://nodejs.org/
