// The Clovervale project.
// Copyright 2026 imacat.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Authors:
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/17
// AI assistance: Claude Code (Anthropic)

/**
 * @module scripts/test-browser Checks the built client in headless Firefox.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { inflateSync } from 'node:zlib';

/** A message received from the browser over WebDriver BiDi. */
interface BidiMessage {
  /** The kind of message: `success`, `error` or `event`. */
  readonly type?: string;
  /** The identifier of the command a response answers. */
  readonly id?: number;
  /** The result of a successful command. */
  readonly result?: unknown;
  /** The error code of a failed command. */
  readonly error?: string;
  /** The error message of a failed command. */
  readonly message?: string;
  /** The name of an event. */
  readonly method?: string;
  /** The parameters of an event. */
  readonly params?: unknown;
}

/** The callbacks that settle a command sent to the browser. */
interface PendingCommand {
  /** The name of the command. */
  readonly method: string;
  /** Settles the command with its result. */
  readonly resolve: (result: unknown) => void;
  /** Settles the command with its failure. */
  readonly reject: (error: Error) => void;
}

/** What the page shows at one moment. */
interface PageState {
  /** The width of the view, in CSS pixels. */
  readonly width: number;
  /** The height of the view, in CSS pixels. */
  readonly height: number;
  /** The server status the client displays. */
  readonly serverStatus: string;
  /** The model status the client displays. */
  readonly modelStatus: string;
  /** The fraction of the centre of the view that is lit grass, from 0 to 1. */
  readonly grassFraction: number;
}

const rootDir: string = path.resolve(import.meta.dirname, '..');
const clientDir: string = path.join(rootDir, 'packages/client/dist');
const serverFile: string = path.join(
  rootDir,
  'packages/server/dist/server.cjs',
);
const firefoxCommand: string = process.env.FIREFOX ?? 'firefox';

/** How long a program may take to start, in milliseconds. */
const START_TIMEOUT = 30_000;
/** How long the browser may take to answer a command, in milliseconds. */
const COMMAND_TIMEOUT = 15_000;
/** How long the page may take to draw and connect, in milliseconds. */
const PAGE_TIMEOUT = 20_000;
/** How long to wait between two looks at the page, in milliseconds. */
const POLL_INTERVAL = 100;
/** How long a program may take to stop when asked, in milliseconds. */
const STOP_TIMEOUT = 5_000;

/** The least a colour channel of a lit pixel can be, from 0 to 255. */
const LIT_CHANNEL = 96;
/** The least fraction of the centre of the view that is grass when drawn. */
const DRAWN_FRACTION = 0.1;
/** The model status of a client that has shown the models it could. */
const MODELS_SHOWN_PATTERN = /^\d+ shown/;

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
};

/** Reads the size of the view and the statuses the client displays. */
const PAGE_EXPRESSION = `(() => {
  const statuses = { Server: '', Models: '' };
  for (const input of document.querySelectorAll('input[aria-labelledby]')) {
    const labelId = input.getAttribute('aria-labelledby');
    const label = document.getElementById(labelId)?.textContent;
    if (Object.hasOwn(statuses, label)) {
      statuses[label] = input.value;
    }
  }
  return JSON.stringify({
    width: window.innerWidth,
    height: window.innerHeight,
    serverStatus: statuses.Server,
    modelStatus: statuses.Models,
  });
})()`;

/** The steps that undo what the check has started, in starting order. */
const cleanups: (() => Promise<void> | void)[] = [];

/**
 * Undoes everything the check has started, the latest first.
 *
 * @returns {Promise<void>} A promise settled once everything is undone.
 */
async function cleanUp(): Promise<void> {
  for (let undo = cleanups.pop(); undo !== undefined; undo = cleanups.pop()) {
    try {
      await undo();
    } catch (error: unknown) {
      console.error('Cleaning up failed:', error);
    }
  }
}

/**
 * Waits for a line of output that tells a program has started.
 *
 * @param {ChildProcess} child - The program.
 * @param {Readable | null} output - The output stream to watch.
 * @param {RegExp} pattern - The pattern the awaited output matches.
 * @param {string} name - The name of the program, for the error messages.
 * @returns {Promise<string>} The first captured group of the match.
 */
function waitForOutput(
  child: ChildProcess,
  output: Readable | null,
  pattern: RegExp,
  name: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = '';
    const fail = (reason: string): void => {
      clearTimeout(timer);
      const detail: string = text.trim() === '' ? '' : `\n${text.trim()}`;
      reject(new Error(`${name} ${reason}${detail}`));
    };
    const timer: NodeJS.Timeout = setTimeout(() => {
      fail(`did not start within ${String(START_TIMEOUT / 1000)} seconds.`);
    }, START_TIMEOUT);
    child.once('error', (error: NodeJS.ErrnoException) => {
      fail(
        error.code === 'ENOENT'
          ? `is not installed: "${child.spawnfile}" was not found.`
          : `could not be started: ${error.message}`,
      );
    });
    child.once('exit', () => {
      fail('exited before it was ready.');
    });
    output?.setEncoding('utf8').on('data', (chunk: string) => {
      text += chunk;
      const captured: string | undefined = pattern.exec(text)?.[1];
      if (captured !== undefined) {
        clearTimeout(timer);
        resolve(captured);
      }
    });
  });
}

/**
 * Stops a program started in its own process group, with all its children.
 *
 * @param {ChildProcess} child - The program.
 * @returns {Promise<void>} A promise settled once the program has exited.
 */
async function stopProcessGroup(child: ChildProcess): Promise<void> {
  const pid: number | undefined = child.pid;
  if (pid === undefined) {
    return;
  }
  const signalGroup = (signal: NodeJS.Signals): void => {
    try {
      process.kill(-pid, signal);
    } catch {
      // The whole group has already exited.
    }
  };
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise<void>((resolve) => {
      child.once('exit', () => {
        resolve();
      });
    });
    signalGroup('SIGTERM');
    const timer: NodeJS.Timeout = setTimeout(() => {
      signalGroup('SIGKILL');
    }, STOP_TIMEOUT);
    await exited;
    clearTimeout(timer);
  }
  // Whatever the program left behind in its group must go too.
  signalGroup('SIGKILL');
}

/**
 * Starts a program in its own process group, to be stopped on clean-up.
 *
 * @param {string} command - The program to run.
 * @param {string[]} args - The arguments of the program.
 * @param {NodeJS.ProcessEnv} env - The environment of the program.
 * @returns {ChildProcess} The running program.
 */
function startProgram(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): ChildProcess {
  const child: ChildProcess = spawn(command, args, {
    detached: true,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  cleanups.push(() => stopProcessGroup(child));
  return child;
}

/**
 * Starts the built game server on a free port.
 *
 * @returns {Promise<number>} The port the server is listening on.
 */
async function startGameServer(): Promise<number> {
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: '0' };
  const child: ChildProcess = startProgram(process.execPath, [serverFile], env);
  const pattern = /listening on port (\d+)/;
  return Number(
    await waitForOutput(child, child.stdout, pattern, 'The game server'),
  );
}

/**
 * Starts serving the built client as static files on a free port.
 *
 * @returns {Promise<number>} The port the client is served on.
 */
function startClientServer(): Promise<number> {
  const server: Server = createServer((request, response) => {
    const pathname: string = new URL(request.url ?? '/', 'http://localhost')
      .pathname;
    const relative: string = pathname.endsWith('/')
      ? `${pathname}index.html`
      : pathname;
    const file: string = path.join(clientDir, decodeURIComponent(relative));
    if (!file.startsWith(clientDir + path.sep) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    const type: string =
      MIME_TYPES[path.extname(file)] ?? 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type }).end(readFileSync(file));
  });
  cleanups.push(() => {
    server.close();
    server.closeAllConnections();
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

/**
 * Starts headless Firefox with a temporary profile and a free BiDi port.
 *
 * @returns {Promise<string>} The WebSocket URL of its WebDriver BiDi server.
 */
async function startFirefox(): Promise<string> {
  const profileDir: string = mkdtempSync(
    path.join(tmpdir(), 'clovervale-firefox-'),
  );
  cleanups.push(() => {
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 5 });
  });
  const args: string[] = [
    '--headless',
    '--no-remote',
    '--profile',
    profileDir,
    '--remote-debugging-port',
    '0',
    '--width',
    '800',
    '--height',
    '600',
  ];
  const child: ChildProcess = startProgram(firefoxCommand, args, process.env);
  const pattern = /WebDriver BiDi listening on (ws:\/\/\S+)/;
  return await waitForOutput(child, child.stderr, pattern, 'Firefox');
}

/** A WebDriver BiDi session with a browser. */
class BidiSession {
  /** The errors the page has logged to its console. */
  readonly pageErrors: string[] = [];
  readonly #socket: WebSocket;
  readonly #pending = new Map<number, PendingCommand>();
  #lastId = 0;

  /**
   * Wraps a WebSocket connected to the BiDi server of a browser.
   *
   * @param {WebSocket} socket - The connected WebSocket.
   */
  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener('message', (event: MessageEvent) => {
      const data: unknown = event.data;
      this.#receive(JSON.parse(String(data)) as BidiMessage);
    });
    socket.addEventListener('close', () => {
      for (const command of this.#pending.values()) {
        command.reject(new Error('Firefox closed the connection.'));
      }
      this.#pending.clear();
    });
  }

  /**
   * Connects to the BiDi server of a browser and starts a session.
   *
   * @param {string} url - The WebSocket URL of the BiDi server.
   * @returns {Promise<BidiSession>} The session.
   */
  static async connect(url: string): Promise<BidiSession> {
    const socket = new WebSocket(`${url}/session`);
    cleanups.push(() => {
      socket.close();
    });
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => {
        resolve();
      });
      socket.addEventListener('error', () => {
        reject(new Error(`Firefox refused the connection to ${url}.`));
      });
    });
    const session = new BidiSession(socket);
    await session.send('session.new', { capabilities: {} });
    await session.send('session.subscribe', { events: ['log.entryAdded'] });
    return session;
  }

  /**
   * Sends a command to the browser.
   *
   * @param {string} method - The name of the command.
   * @param {object} params - The parameters of the command.
   * @returns {Promise<unknown>} The result of the command.
   */
  send(method: string, params: object): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id: number = ++this.#lastId;
      const timer: NodeJS.Timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Firefox did not answer ${method} in time.`));
      }, COMMAND_TIMEOUT);
      this.#pending.set(id, {
        method,
        resolve: (result: unknown) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error: Error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  /**
   * Handles a message from the browser.
   *
   * @param {BidiMessage} message - The message.
   */
  #receive(message: BidiMessage): void {
    if (message.method === 'log.entryAdded') {
      const entry = message.params as { level?: string; text?: string };
      if (entry.level === 'error') {
        this.pageErrors.push(entry.text ?? '');
      }
      return;
    }
    const command: PendingCommand | undefined = this.#pending.get(
      message.id ?? 0,
    );
    if (command === undefined) {
      return;
    }
    this.#pending.delete(message.id ?? 0);
    if (message.type === 'success') {
      command.resolve(message.result);
    } else {
      const reason: string = message.message ?? message.error ?? 'no reason';
      command.reject(new Error(`Firefox failed ${command.method}: ${reason}`));
    }
  }
}

/**
 * Measures how much of a PNG image is lit grass.
 *
 * Neither the sky nor the page behind the scene counts: the sky is not
 * green, and the page is dark.
 *
 * @param {Buffer} png - The image, as 8-bit RGB or RGBA without interlacing.
 * @returns {number} The fraction of its pixels that are lit and mostly
 *   green, from 0 to 1.
 * @throws {Error} If the image is in another PNG format.
 */
function measureGrassFraction(png: Buffer): number {
  const width: number = png.readUInt32BE(16);
  const height: number = png.readUInt32BE(20);
  const channels: number = png[25] === 6 ? 4 : 3;
  if (png[24] !== 8 || (png[25] !== 2 && png[25] !== 6) || png[28] !== 0) {
    throw new Error('The screenshot is in an unsupported PNG format.');
  }
  const parts: Buffer[] = [];
  for (let offset = 8; offset < png.length; ) {
    const length: number = png.readUInt32BE(offset);
    if (png.toString('latin1', offset + 4, offset + 8) === 'IDAT') {
      parts.push(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
  }
  const data: Buffer = inflateSync(Buffer.concat(parts));
  const stride: number = width * channels;
  let previous: Uint8Array = new Uint8Array(stride);
  let grass = 0;
  for (let y = 0; y < height; y++) {
    const start: number = y * (stride + 1);
    const filter: number = data[start] ?? 0;
    const row = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const left: number = row[x - channels] ?? 0;
      const up: number = previous[x] ?? 0;
      const upLeft: number = previous[x - channels] ?? 0;
      let predicted = 0;
      if (filter === 1) {
        predicted = left;
      } else if (filter === 2) {
        predicted = up;
      } else if (filter === 3) {
        predicted = (left + up) >> 1;
      } else if (filter === 4) {
        const distances: number[] = [left, up, upLeft].map((value) =>
          Math.abs(left + up - upLeft - value),
        );
        const nearest: number = distances.indexOf(Math.min(...distances));
        predicted = [left, up, upLeft][nearest] ?? 0;
      }
      row[x] = (data[start + 1 + x] ?? 0) + predicted;
    }
    for (let x = 0; x < stride; x += channels) {
      const red: number = row[x] ?? 0;
      const green: number = row[x + 1] ?? 0;
      const blue: number = row[x + 2] ?? 0;
      if (green >= LIT_CHANNEL && green > red && green > blue) {
        grass++;
      }
    }
    previous = row;
  }
  return grass / (width * height);
}

/**
 * Looks at what the page shows now.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<PageState>} What the page shows.
 */
async function readPageState(
  session: BidiSession,
  context: string,
): Promise<PageState> {
  const evaluated = (await session.send('script.evaluate', {
    expression: PAGE_EXPRESSION,
    target: { context },
    awaitPromise: false,
  })) as { result?: { value?: unknown } };
  if (typeof evaluated.result?.value !== 'string') {
    throw new Error('The page could not be inspected.');
  }
  const page = JSON.parse(evaluated.result.value) as Omit<
    PageState,
    'grassFraction'
  >;
  // The centre of the view holds the scene, clear of the settings panel.
  const clip: object = {
    type: 'box',
    x: page.width / 4,
    y: page.height / 4,
    width: page.width / 2,
    height: page.height / 2,
  };
  const screenshot = (await session.send(
    'browsingContext.captureScreenshot',
    { context, clip },
  )) as { data: string };
  const png: Buffer = Buffer.from(screenshot.data, 'base64');
  return { ...page, grassFraction: measureGrassFraction(png) };
}

/**
 * Checks that the built client draws its scene, shows the models it has,
 * and connects to the server.
 *
 * @returns {Promise<void>} A promise settled once the client has passed.
 * @throws {Error} If the client fails the check, or the check cannot run.
 */
async function checkClient(): Promise<void> {
  for (const built of [clientDir, serverFile]) {
    if (!existsSync(built)) {
      const missing: string = path.relative(rootDir, built);
      throw new Error(`${missing} is missing.  Run "npm run build" first.`);
    }
  }
  const serverPort: number = await startGameServer();
  const clientPort: number = await startClientServer();
  const session: BidiSession = await BidiSession.connect(await startFirefox());

  const tree = (await session.send('browsingContext.getTree', {})) as {
    contexts: { context: string }[];
  };
  const context: string | undefined = tree.contexts[0]?.context;
  if (context === undefined) {
    throw new Error('Firefox has no page to load the client in.');
  }
  const url =
    `http://127.0.0.1:${String(clientPort)}/` +
    `?server=ws://127.0.0.1:${String(serverPort)}`;
  await session.send('browsingContext.navigate', { context, url });

  const deadline: number = Date.now() + PAGE_TIMEOUT;
  let state: PageState = await readPageState(session, context);
  const isPassing = (): boolean =>
    state.serverStatus.startsWith('connected') &&
    MODELS_SHOWN_PATTERN.test(state.modelStatus) &&
    state.grassFraction >= DRAWN_FRACTION;
  while (!isPassing() && Date.now() < deadline) {
    await sleep(POLL_INTERVAL);
    state = await readPageState(session, context);
  }
  if (isPassing()) {
    return;
  }

  const problems: string[] = [];
  if (!state.serverStatus.startsWith('connected')) {
    problems.push(
      'The client did not connect to the server: its server status is ' +
        `"${state.serverStatus}".`,
    );
  }
  if (!MODELS_SHOWN_PATTERN.test(state.modelStatus)) {
    problems.push(
      'The client did not finish showing its models: its model status is ' +
        `"${state.modelStatus}".`,
    );
  }
  if (state.grassFraction < DRAWN_FRACTION) {
    const percentage: string = (state.grassFraction * 100).toFixed(1);
    problems.push(
      `The client did not draw its scene: only ${percentage}% of the ` +
        'centre of the view is lit grass.',
    );
  }
  for (const text of session.pageErrors) {
    problems.push(`The page logged an error: ${text}`);
  }
  const seconds = String(PAGE_TIMEOUT / 1000);
  throw new Error(
    `The client failed within ${seconds} seconds.\n${problems.join('\n')}`,
  );
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.once(signal, () => {
    void cleanUp().finally(() => {
      process.exit(1);
    });
  });
}

try {
  await checkClient();
  console.log('Browser check passed: the client draws its scene and connects.');
} catch (error: unknown) {
  const reason: string = error instanceof Error ? error.message : String(error);
  console.error(`Browser check failed: ${reason}`);
  process.exitCode = 1;
} finally {
  await cleanUp();
}
