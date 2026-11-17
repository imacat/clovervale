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

Runs the server, restarting it on changes.

#### `npm run dev:client`

Serves the client at <http://localhost:5173/>.

#### `npm run dev:bots`

Runs the bots against the server.


Configuration
-------------

The server listens on port 8080, or on the port of its `--port` option,
or on the Unix socket file of its `--socket` option.  The client
connects to port 8080 of the host that serves its page, or to the server
named in the `server` query parameter of the page address, as in
`?server=ws://game.example.com:9000`.  The bots connect to
`ws://localhost:8080`, or to the URL in the `SERVER_URL` environment
variable.

Firefox is run as `firefox`, or as the command in the `FIREFOX`
environment variable.


Licence
-------

Copyright 2026 imacat.

Licensed under the Apache License, Version 2.0.  See [LICENSE](LICENSE).

[Node.js]: https://nodejs.org/
[Firefox]: https://www.mozilla.org/firefox/
