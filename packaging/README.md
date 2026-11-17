Clovervale
==========

Clovervale (四葉谷) is a small learning MMORPG for studying network state
synchronisation.  This is a ready-to-run release.  The programs are
bundled with their dependencies, so there is nothing to install except
[Node.js] 24 or later.

Contents
--------

| Path                       | What it is                                  |
|----------------------------|---------------------------------------------|
| `server/server.cjs`        | The game server.                            |
| `client/`                  | The browser client, as static files.        |
| `bots/bots.cjs`            | The headless bots.                          |
| `LICENSE`                  | The licence of Clovervale.                  |
| `THIRD-PARTY-LICENSES.txt` | The licences of the bundled dependencies.   |

Running
-------

Start the game server.  It listens for WebSocket connections on port
8080, or on the port in the `PORT` environment variable.

    node server/server.cjs

Serve the `client/` directory with any static web server, and open it in
Firefox.  For example:

    python3 -m http.server --directory client 8000

The client connects to port 8080 of the host that serves the page.  To
use another game server, name it in the page address, for example
`http://localhost:8000/?server=ws://game.example.com:9000`.

Run the bots against the game server at `ws://localhost:8080`, or at
the URL in the `SERVER_URL` environment variable.

    node bots/bots.cjs

[Node.js]: https://nodejs.org/
