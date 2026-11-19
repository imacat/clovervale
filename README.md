Clovervale
==========

Clovervale (四葉谷) is a small learning MMORPG for studying network state
synchronisation.


Requirements
------------

- [Node.js] 24 or later, with npm.
- `tar` and `zip`, only for building the release archives.
- [Firefox], only for the browser check.


Commands
--------

Run them all at the project root.

### `npm install`

Installs the dependencies of all packages.

### `npm run build`

Type-checks everything and builds all packages.

### `npm test`

Runs the tests of all packages.

### `npm run coverage`

Runs the tests and reports coverage in `coverage/`.

### `npm run lint`

Lints everything.

### `npm run docs`

Generates the API documentation in `docs/api/`.

### `npm run release`

Builds the release archives in `release/`.

### `npm run clean`

Removes everything the commands above generate.

### `npm run typecheck`

Type-checks everything without building.

### `npm run test:watch`

Runs the tests again whenever a file changes.

### `npm run test:browser`

Builds everything and checks the client in Firefox.

### `npm run build:models`

Regenerates the 3D models of the client.

### `npm run test:models`

Checks that the 3D models are valid glTF and meet the needs of the game.

### For development

#### `npm run dev:server`

Runs the server, restarting it on changes.  Options for the server
follow a `--`, as in `npm run dev:server -- --port 9000`.

#### `npm run dev:client`

Serves the client at <http://localhost:5173/>.

#### `npm run dev:bots`

Runs bots, players that walk about the village by themselves.  Options
for the bots follow a `--`, as in `npm run dev:bots -- --count 8`.


Configuration
-------------

The server listens on port 8080, or on the port of its `--port` option,
or on the Unix socket file of its `--socket` option.  Its day lasts 20
minutes, or as many minutes as its `--day-length` option tells, and the
clock of the world reads 08:00 when the server starts; its `--hold-time`
option instead holds the clock at a fixed time of day, as in
`--hold-time 12:00`.  The client connects to port 8080 of the host that
serves its page, or to the server named in the `server` query parameter
of the page address, as in `?server=ws://game.example.com:9000`.  There
are four bots, or as many as the `--count` option tells, and they
connect to `ws://localhost:8080`, or to the server URL of the `--server`
option, as in `--server ws://game.example.com:9000`.

Firefox is run as `firefox`, or as the command in the `FIREFOX`
environment variable.


Licence
-------

Copyright 2026 imacat.

Licensed under the Apache License, Version 2.0.  See [LICENSE](LICENSE).

The exception is the music, "Embers on the Flagstone" by Kaazoom, from
[Pixabay], which is under the [Pixabay Content License].

[Node.js]: https://nodejs.org/
[Firefox]: https://www.mozilla.org/firefox/
[Pixabay]: https://pixabay.com/
[Pixabay Content License]: https://pixabay.com/service/license-summary/
