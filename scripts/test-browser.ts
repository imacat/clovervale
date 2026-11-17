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

/** A player as a page shows it. */
interface FigureView {
  /** The identifier of the player. */
  readonly id: number;
  /** The position along the X axis, in metres. */
  readonly x: number;
  /** The position along the Z axis, in metres. */
  readonly z: number;
  /** The turn around the Y axis from facing +Z towards +X, in degrees. */
  readonly yaw: number;
  /** The name of the clip the player plays, or `null` if it has none. */
  readonly clip: string | null;
}

/** What a page tells at one moment. */
interface PageState {
  /** The width of the view, in CSS pixels. */
  readonly width: number;
  /** The height of the view, in CSS pixels. */
  readonly height: number;
  /** The values the panel of the client displays, by their names. */
  readonly panel: Readonly<Record<string, string>>;
  /** The players the client shows. */
  readonly figures: readonly FigureView[];
}

/** A page as it is at one moment: what it tells, and what it draws. */
interface PageLook extends PageState {
  /** The fraction of the foot of the view that is lit grass, from 0 to 1. */
  readonly grassFraction: number;
}

/** How a page shows a walking player, frame after frame. */
interface WalkSample {
  /** The position along the X axis the page shows the player at. */
  readonly drawn: number;
  /** The position along the X axis the latest snapshot tells. */
  readonly told: number;
}

/** The pixels of an image. */
interface Pixels {
  /** The width of the image, in pixels. */
  readonly width: number;
  /** The height of the image, in pixels. */
  readonly height: number;
  /** The number of colour channels of every pixel. */
  readonly channels: number;
  /** The channels of the pixels, row by row from the top. */
  readonly data: Uint8Array;
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
/** How long a page may take to show what a player does, in milliseconds. */
const ACTION_TIMEOUT = 10_000;
/** How long to wait between two looks at the page, in milliseconds. */
const POLL_INTERVAL = 100;
/** How long a program may take to stop when asked, in milliseconds. */
const STOP_TIMEOUT = 5_000;

/** The least a colour channel of a lit pixel can be, from 0 to 255. */
const LIT_CHANNEL = 96;
/** The least fraction of the foot of the view that is grass when drawn. */
const DRAWN_FRACTION = 0.1;
/** The model status of a client that has shown the models it could. */
const MODELS_SHOWN_PATTERN = /^\d+ shown/;

/** How far a player walks in the check, in metres. */
const WALK_DISTANCE = 2;
/** The yaw of a player that walks to the left of the first view. */
const LEFTWARD_YAW = -90;
/** The least change of a colour channel that changes a pixel, to 255. */
const CHANGED_CHANNEL = 48;
/** The least number of pixels a player changes by walking across a view. */
const MOVED_PIXELS = 3000;

/** How long a walking player is watched frame by frame, in milliseconds. */
const WATCH_DURATION = 1000;
/** The fewest frames a page draws while a walking player is watched. */
const WATCHED_FRAMES = 20;
/** The least fraction of the frames a smooth player is between snapshots. */
const SMOOTH_FRACTION = 0.8;
/** The most two positions differ by when they are the same, in metres. */
const SAME_POSITION = 1e-9;

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
};

/** Reads the size of the view and what the client tells of itself. */
const PAGE_EXPRESSION = `(() => {
  const panel = {};
  for (const input of document.querySelectorAll('input[aria-labelledby]')) {
    const labelId = input.getAttribute('aria-labelledby');
    const label = document.getElementById(labelId)?.textContent;
    if (label) {
      panel[label] = input.value;
    }
  }
  return JSON.stringify({
    width: window.innerWidth,
    height: window.innerHeight,
    panel,
    figures: window.clovervale?.describeFigures() ?? [],
  });
})()`;

/** Reads the action the panel of the client displays. */
const PANEL_ACTION_EXPRESSION = `(() => {
  for (const input of document.querySelectorAll('input[aria-labelledby]')) {
    const labelId = input.getAttribute('aria-labelledby');
    if (document.getElementById(labelId)?.textContent === 'Action') {
      return input.value;
    }
  }
  return '';
})()`;

/**
 * Makes the expression that sets the interpolation switch of the panel, and
 * gives whether it is set afterwards, as `true` or `false`.
 *
 * @param {boolean} isEnabled - Whether to switch the interpolation on.
 * @returns {string} The expression.
 */
function createSwitchExpression(isEnabled: boolean): string {
  return `(() => {
    for (const input of document.querySelectorAll('input[type=checkbox]')) {
      const labelId = input.getAttribute('aria-labelledby');
      if (document.getElementById(labelId)?.textContent === 'Interpolate') {
        if (input.checked !== ${String(isEnabled)}) {
          input.click();
        }
        return String(input.checked);
      }
    }
    return 'missing';
  })()`;
}

/**
 * Makes the expression that watches how a page shows a player, at every
 * frame the page draws for a while, and gives the samples as JSON.
 *
 * @param {number} id - The identifier of the player.
 * @returns {string} The expression.
 */
function createWatchExpression(id: number): string {
  return `new Promise((resolve) => {
    const samples = [];
    const end = performance.now() + ${String(WATCH_DURATION)};
    const findX = (players) =>
      players.find((player) => player.id === ${String(id)})?.x;
    const sample = () => {
      const drawn = findX(window.clovervale.describeFigures());
      const told = findX(window.clovervale.listLatestPlayers());
      if (drawn !== undefined && told !== undefined) {
        samples.push({ drawn, told });
      }
      if (performance.now() < end) {
        requestAnimationFrame(sample);
      } else {
        resolve(JSON.stringify(samples));
      }
    };
    requestAnimationFrame(sample);
  })`;
}

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
  const args: string[] = [serverFile, '--port', '0'];
  const child: ChildProcess = startProgram(process.execPath, args, process.env);
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
 * Decodes a PNG image.
 *
 * @param {Buffer} png - The image, as 8-bit RGB or RGBA without interlacing.
 * @returns {Pixels} The pixels of the image.
 * @throws {Error} If the image is in another PNG format.
 */
function decodePng(png: Buffer): Pixels {
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
  const filtered: Buffer = inflateSync(Buffer.concat(parts));
  const stride: number = width * channels;
  const data = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const start: number = y * (stride + 1);
    const filter: number = filtered[start] ?? 0;
    const row: number = y * stride;
    for (let x = 0; x < stride; x++) {
      const left: number = x < channels ? 0 : (data[row + x - channels] ?? 0);
      const up: number = y === 0 ? 0 : (data[row + x - stride] ?? 0);
      const upLeft: number =
        x < channels || y === 0
          ? 0
          : (data[row + x - stride - channels] ?? 0);
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
      data[row + x] = (filtered[start + 1 + x] ?? 0) + predicted;
    }
  }
  return { width, height, channels, data };
}

/**
 * Measures how much of an image is lit grass.
 *
 * Neither the bare earth nor the page behind the scene counts: the earth is
 * not green, and the page is dark.
 *
 * @param {Pixels} image - The image.
 * @returns {number} The fraction of its pixels that are lit and mostly
 *   green, from 0 to 1.
 */
function measureGrassFraction(image: Pixels): number {
  let grass = 0;
  for (let at = 0; at < image.data.length; at += image.channels) {
    const red: number = image.data[at] ?? 0;
    const green: number = image.data[at + 1] ?? 0;
    const blue: number = image.data[at + 2] ?? 0;
    if (green >= LIT_CHANNEL && green > red && green > blue) {
      grass++;
    }
  }
  return grass / (image.width * image.height);
}

/**
 * Counts the pixels that differ between two images of the same size.
 *
 * @param {Pixels} before - One image.
 * @param {Pixels} after - The other image.
 * @returns {number} The number of pixels of which a colour channel differs
 *   clearly.
 * @throws {Error} If the images differ in size.
 */
function countChangedPixels(before: Pixels, after: Pixels): number {
  if (before.data.length !== after.data.length) {
    throw new Error('The view changed its size during the check.');
  }
  let changed = 0;
  for (let at = 0; at < before.data.length; at += before.channels) {
    for (let channel = 0; channel < 3; channel++) {
      const difference: number =
        (before.data[at + channel] ?? 0) - (after.data[at + channel] ?? 0);
      if (Math.abs(difference) >= CHANGED_CHANNEL) {
        changed++;
        break;
      }
    }
  }
  return changed;
}

/**
 * Evaluates an expression in a page.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string} expression - The expression, which gives a string or a
 *   promise of one.
 * @returns {Promise<string>} The string.
 * @throws {Error} If the expression gives anything else.
 */
async function evaluateInPage(
  session: BidiSession,
  context: string,
  expression: string,
): Promise<string> {
  const evaluated = (await session.send('script.evaluate', {
    expression,
    target: { context },
    awaitPromise: true,
  })) as { result?: { value?: unknown } };
  if (typeof evaluated.result?.value !== 'string') {
    throw new Error('The page could not be inspected.');
  }
  return evaluated.result.value;
}

/**
 * Reads what a page tells now.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<PageState>} What the page tells.
 */
async function readPageState(
  session: BidiSession,
  context: string,
): Promise<PageState> {
  const value: string = await evaluateInPage(session, context, PAGE_EXPRESSION);
  return JSON.parse(value) as PageState;
}

/**
 * Captures what a page draws now.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {object} [clip] - The part of the view to capture, or the whole
 *   view by default.
 * @returns {Promise<Pixels>} The pixels of the view.
 */
async function captureView(
  session: BidiSession,
  context: string,
  clip?: object,
): Promise<Pixels> {
  const screenshot = (await session.send(
    'browsingContext.captureScreenshot',
    clip === undefined ? { context } : { context, clip },
  )) as { data: string };
  return decodePng(Buffer.from(screenshot.data, 'base64'));
}

/**
 * Looks at what a page tells and draws now.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<PageLook>} The page as it is.
 */
async function lookAtPage(
  session: BidiSession,
  context: string,
): Promise<PageLook> {
  const state: PageState = await readPageState(session, context);
  // The foot of the view holds the ground, clear of the settings panel.
  const clip: object = {
    type: 'box',
    x: 0,
    y: state.height / 2,
    width: state.width,
    height: state.height / 2,
  };
  const view: Pixels = await captureView(session, context, clip);
  return { ...state, grassFraction: measureGrassFraction(view) };
}

/**
 * Looks at something again and again until it is as awaited.
 *
 * @param {() => Promise<T>} look - Looks at it.
 * @param {(seen: T) => boolean} isAwaited - Tells whether it is as awaited.
 * @param {number} timeout - How long to wait at most, in milliseconds.
 * @param {(seen: T) => string} describeProblem - Tells what is wrong with
 *   what was last seen, for the error message.
 * @returns {Promise<T>} What was seen when it was as awaited.
 * @throws {Error} If it is not as awaited in time.
 */
async function waitFor<T>(
  look: () => Promise<T>,
  isAwaited: (seen: T) => boolean,
  timeout: number,
  describeProblem: (seen: T) => string,
): Promise<T> {
  const deadline: number = Date.now() + timeout;
  let seen: T = await look();
  while (!isAwaited(seen) && Date.now() < deadline) {
    await sleep(POLL_INTERVAL);
    seen = await look();
  }
  if (!isAwaited(seen)) {
    const seconds = String(timeout / 1000);
    throw new Error(
      `${describeProblem(seen)}\nThat was after ${seconds} seconds.`,
    );
  }
  return seen;
}

/**
 * Loads the client in a page, and waits until it draws its scene, shows the
 * models it has, and connects to the server.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string} url - The address of the client.
 * @param {string} name - The name of the page, for the error messages.
 * @returns {Promise<void>} A promise settled once the client has done so.
 * @throws {Error} If the client does not do so in time.
 */
async function loadClient(
  session: BidiSession,
  context: string,
  url: string,
  name: string,
): Promise<void> {
  await session.send('browsingContext.navigate', { context, url });
  const isConnected = (look: PageLook): boolean =>
    (look.panel.Server ?? '').startsWith('connected');
  const isShown = (look: PageLook): boolean =>
    MODELS_SHOWN_PATTERN.test(look.panel.Models ?? '');
  const isDrawn = (look: PageLook): boolean =>
    look.grassFraction >= DRAWN_FRACTION;
  await waitFor(
    () => lookAtPage(session, context),
    (look: PageLook) => isConnected(look) && isShown(look) && isDrawn(look),
    PAGE_TIMEOUT,
    (look: PageLook) => {
      const problems: string[] = [];
      if (!isConnected(look)) {
        problems.push(
          `${name} did not connect to the server: its server status is ` +
            `"${look.panel.Server ?? ''}".`,
        );
      }
      if (!isShown(look)) {
        problems.push(
          `${name} did not finish showing its models: its model status is ` +
            `"${look.panel.Models ?? ''}".`,
        );
      }
      if (!isDrawn(look)) {
        const percentage: string = (look.grassFraction * 100).toFixed(1);
        problems.push(
          `${name} did not draw its scene: only ${percentage}% of the ` +
            'foot of the view is lit grass.',
        );
      }
      return problems.join('\n');
    },
  );
}

/**
 * Finds a player among those a page shows.
 *
 * @param {PageState} state - What the page tells.
 * @param {number} id - The identifier of the player.
 * @returns {FigureView | undefined} The player, if the page shows it.
 */
function findFigure(state: PageState, id: number): FigureView | undefined {
  return state.figures.find((figure: FigureView) => figure.id === id);
}

/**
 * Describes how a page shows a player, for the error messages.
 *
 * @param {PageState} state - What the page tells.
 * @param {number} id - The identifier of the player.
 * @returns {string} The description.
 */
function describeFigure(state: PageState, id: number): string {
  const figure: FigureView | undefined = findFigure(state, id);
  if (figure === undefined) {
    return `does not show player ${String(id)}`;
  }
  return (
    `shows player ${String(id)} at x ${figure.x.toFixed(2)}, ` +
    `z ${figure.z.toFixed(2)}, with a yaw of ${figure.yaw.toFixed(1)}, ` +
    `playing ${figure.clip ?? 'nothing'}`
  );
}

/**
 * Waits in a page until an action it tells of becomes `Slash` and then
 * something else again.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string} actionExpression - The expression that reads the action
 *   in the page.
 * @returns {Promise<string>} `over` once the slash has come and gone,
 *   `never` if it did not come in time, or `stuck` if it did not go.
 */
function watchSlash(
  session: BidiSession,
  context: string,
  actionExpression: string,
): Promise<string> {
  // The page watches by itself, as a slash is too short to be sure to
  // catch by looking in from the outside.
  const expression = `new Promise((resolve) => {
    let outcome = 'never';
    const stop = (result) => {
      clearInterval(interval);
      clearTimeout(timer);
      resolve(result);
    };
    const interval = setInterval(() => {
      const isSlashing = ${actionExpression} === 'Slash';
      if (isSlashing) {
        outcome = 'stuck';
      } else if (outcome === 'stuck') {
        stop('over');
      }
    }, 10);
    const timer = setTimeout(() => stop(outcome), ${String(ACTION_TIMEOUT)});
  })`;
  return evaluateInPage(session, context, expression);
}

/**
 * Presses or releases a key in a page.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {'keyDown' | 'keyUp'} type - Whether to press or to release.
 * @param {string} value - The character of the key.
 * @returns {Promise<void>} A promise settled once the page has the event.
 */
async function sendKey(
  session: BidiSession,
  context: string,
  type: 'keyDown' | 'keyUp',
  value: string,
): Promise<void> {
  await session.send('input.performActions', {
    context,
    actions: [{ type: 'key', id: 'keyboard', actions: [{ type, value }] }],
  });
}

/**
 * Checks that a player walks, in the page of another player, while a key is
 * held down in its own page, and stops when the key is released.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If the other page does not show the player doing so.
 */
async function checkWalk(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
): Promise<void> {
  const viewBefore: Pixels = await captureView(session, watcher);
  const before: PageState = await readPageState(session, watcher);
  const startX: number = findFigure(before, id)?.x ?? NaN;

  // Both views look the same way, so left is the same for both.
  await sendKey(session, actor, 'keyDown', 'a');
  const isFarLeft = (state: PageState): boolean => {
    const figure: FigureView | undefined = findFigure(state, id);
    return (
      figure !== undefined &&
      figure.x <= startX - WALK_DISTANCE &&
      Math.abs(figure.yaw - LEFTWARD_YAW) < 1 &&
      figure.clip === 'Walk'
    );
  };
  await waitFor(
    () => readPageState(session, watcher),
    isFarLeft,
    ACTION_TIMEOUT,
    (state: PageState) =>
      `With the A key held down in the first page for player ${String(id)}` +
      `, which started at x ${startX.toFixed(2)}, the second page ` +
      `${describeFigure(state, id)}.`,
  );
  const own: PageState = await readPageState(session, actor);
  if (own.panel.Action !== 'Walk') {
    throw new Error(
      'With the A key held down, the panel of the first page tells its ' +
        `player does "${own.panel.Action ?? ''}".`,
    );
  }

  await sendKey(session, actor, 'keyUp', 'a');
  const stopped: PageState = await waitFor(
    () => readPageState(session, watcher),
    (state: PageState) => findFigure(state, id)?.clip === 'Idle',
    ACTION_TIMEOUT,
    (state: PageState) =>
      'With the A key released in the first page, the second page ' +
      `${describeFigure(state, id)}.`,
  );
  await sleep(POLL_INTERVAL * 5);
  const later: PageState = await readPageState(session, watcher);
  if (findFigure(later, id)?.x !== findFigure(stopped, id)?.x) {
    throw new Error(
      'With the A key released in the first page, the second page ' +
        `${describeFigure(later, id)}, still moving.`,
    );
  }

  const viewAfter: Pixels = await captureView(session, watcher);
  const changed: number = countChangedPixels(viewBefore, viewAfter);
  if (changed < MOVED_PIXELS) {
    throw new Error(
      `The second page ${describeFigure(later, id)}, but only ` +
        `${String(changed)} pixels of its view have changed.`,
    );
  }
}

/**
 * Checks how the page of another player shows a player that walks, with the
 * interpolation switched on or off: between the snapshots, moving at about
 * every frame, or exactly as the latest snapshot tells, and in the end
 * where the latest snapshot tells either way.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @param {boolean} isSmooth - Whether the interpolation is switched on.
 * @param {string} key - The character of the key that walks the player
 *   along the X axis.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If the other page does not show the player so.
 */
async function checkMotion(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
  isSmooth: boolean,
  key: string,
): Promise<void> {
  const mode = `With the interpolation switched ${isSmooth ? 'on' : 'off'}`;
  const switched: string = await evaluateInPage(
    session,
    watcher,
    createSwitchExpression(isSmooth),
  );
  if (switched !== String(isSmooth)) {
    throw new Error(
      `${mode} in the second page, its switch tells "${switched}".`,
    );
  }

  await sendKey(session, actor, 'keyDown', key);
  let samples: WalkSample[];
  try {
    await waitFor(
      () => readPageState(session, watcher),
      (state: PageState) => findFigure(state, id)?.clip === 'Walk',
      ACTION_TIMEOUT,
      (state: PageState) =>
        `${mode}, and the ${key.toUpperCase()} key held down in the first ` +
        `page, the second page ${describeFigure(state, id)}.`,
    );
    samples = JSON.parse(
      await evaluateInPage(session, watcher, createWatchExpression(id)),
    ) as WalkSample[];
  } finally {
    await sendKey(session, actor, 'keyUp', key);
  }

  // The first frame may show a snapshot from before the watch began.
  const frames: WalkSample[] = samples.slice(1);
  const told: number[] = samples.map((sample: WalkSample) => sample.told);
  const between: number = frames.filter((sample: WalkSample) =>
    told.every((x: number) => Math.abs(x - sample.drawn) > SAME_POSITION),
  ).length;
  const snapshots: number = new Set<number>(told).size;
  const seen =
    `the second page drew ${String(frames.length)} frames from ` +
    `${String(snapshots)} snapshots, with the player between two ` +
    `snapshots in ${String(between)} of them`;
  if (frames.length < WATCHED_FRAMES || snapshots < 2) {
    throw new Error(`${mode}, ${seen}, which is too few to tell.`);
  }
  if (isSmooth && between < frames.length * SMOOTH_FRACTION) {
    throw new Error(`${mode}, ${seen}, which is not smooth.`);
  }
  if (!isSmooth && between > 0) {
    throw new Error(`${mode}, ${seen}, not as the latest snapshot tells.`);
  }
  const start: number = frames[0]?.drawn ?? NaN;
  const end: number = frames.at(-1)?.drawn ?? NaN;
  const isBackward: boolean = frames.some(
    (sample: WalkSample, index: number) =>
      (sample.drawn - (frames[index - 1]?.drawn ?? start)) * (end - start) <
      0,
  );
  if (isBackward) {
    throw new Error(`${mode}, the second page drew the player going back.`);
  }

  await waitFor(
    () => readPageState(session, watcher),
    (state: PageState) => findFigure(state, id)?.clip === 'Idle',
    ACTION_TIMEOUT,
    (state: PageState) =>
      `${mode}, and the key released in the first page, the second page ` +
      `${describeFigure(state, id)}.`,
  );
  const rest: WalkSample | undefined = (
    JSON.parse(
      await evaluateInPage(session, watcher, createWatchExpression(id)),
    ) as WalkSample[]
  ).at(-1);
  if (rest === undefined || rest.drawn !== rest.told) {
    throw new Error(
      `${mode}, the second page shows the player at x ` +
        `${String(rest?.drawn)} in the end, and the latest snapshot tells ` +
        `x ${String(rest?.told)}.`,
    );
  }
}

/**
 * Checks that a player slashes once, in its own page and in the page of
 * another player, when the space bar is pressed in its own page.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If either page does not show the player doing so.
 */
async function checkSlash(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
): Promise<void> {
  const figureAction =
    '(window.clovervale.describeFigures()' +
    `.find((figure) => figure.id === ${String(id)}) ?? {}).clip`;
  const outcomes: Promise<string[]> = Promise.all([
    watchSlash(session, watcher, figureAction),
    watchSlash(session, actor, PANEL_ACTION_EXPRESSION),
  ]);
  // A watch that fails must not go unhandled while the keys are sent.
  outcomes.catch(() => undefined);
  await sendKey(session, actor, 'keyDown', ' ');
  await sendKey(session, actor, 'keyUp', ' ');
  const [seen = '', told = ''] = await outcomes;
  const problems: Readonly<Record<string, string>> = {
    never: 'never slashing',
    stuck: 'slashing without end',
  };
  if (seen !== 'over') {
    throw new Error(
      'With the space bar pressed in the first page, the second page ' +
        `shows player ${String(id)} ${problems[seen] ?? seen}.`,
    );
  }
  if (told !== 'over') {
    throw new Error(
      'With the space bar pressed in the first page, its panel tells of ' +
        `its player ${problems[told] ?? told}.`,
    );
  }
  const after: PageState = await readPageState(session, watcher);
  if (findFigure(after, id)?.clip !== 'Idle') {
    throw new Error(
      `After the slash, the second page ${describeFigure(after, id)}.`,
    );
  }
}

/**
 * Checks the built client in two pages connected to one server: that each
 * draws its scene, shows the models it has and connects, and that what the
 * player of one page does with the keyboard shows in the other page,
 * smoothly or snapshot by snapshot as the panel of that page is set.
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
  const first: string | undefined = tree.contexts[0]?.context;
  if (first === undefined) {
    throw new Error('Firefox has no page to load the client in.');
  }
  const url =
    `http://127.0.0.1:${String(clientPort)}/` +
    `?server=ws://127.0.0.1:${String(serverPort)}`;
  try {
    await loadClient(session, first, url, 'The first page');
    // A window of its own keeps the second page drawing like the first.
    const created = (await session.send('browsingContext.create', {
      type: 'window',
    })) as { context: string };
    const second: string = created.context;
    await loadClient(session, second, url, 'The second page');

    const isPair = (state: PageState): boolean =>
      state.figures.length === 2 && state.panel.Players === '2';
    const describePair = (name: string) => (state: PageState) =>
      `With two pages connected, ${name} shows ` +
      `${String(state.figures.length)} players, and its panel counts ` +
      `"${state.panel.Players ?? ''}".`;
    const own: PageState = await waitFor(
      () => readPageState(session, first),
      isPair,
      ACTION_TIMEOUT,
      describePair('the first page'),
    );
    await waitFor(
      () => readPageState(session, second),
      isPair,
      ACTION_TIMEOUT,
      describePair('the second page'),
    );
    const id = Number(/^#(\d+)/.exec(own.panel.Player ?? '')?.[1]);
    if (findFigure(own, id) === undefined) {
      throw new Error(
        'The panel of the first page tells its player is ' +
          `"${own.panel.Player ?? ''}", which the page does not show.`,
      );
    }

    await checkWalk(session, first, second, id);
    await checkMotion(session, first, second, id, false, 'd');
    await checkMotion(session, first, second, id, true, 'a');
    await checkSlash(session, first, second, id);
  } catch (error: unknown) {
    const reason: string =
      error instanceof Error ? error.message : String(error);
    const logged: string[] = session.pageErrors.map(
      (text: string) => `A page logged an error: ${text}`,
    );
    throw new Error([reason, ...logged].join('\n'), { cause: error });
  }
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
  console.log(
    'Browser check passed: two clients draw their scenes, connect, and ' +
      'show each other what their players do.',
  );
} catch (error: unknown) {
  const reason: string = error instanceof Error ? error.message : String(error);
  console.error(`Browser check failed: ${reason}`);
  process.exitCode = 1;
} finally {
  await cleanUp();
}
