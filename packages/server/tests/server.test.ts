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
 * @module server/tests/server Tests for the game server.
 */

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import type { Server } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket as SocketFileClient } from 'ws';

import {
  CLOVER_PATCHES,
  DEFAULT_DAY_LENGTH,
  DEFAULT_DAY_ORIGIN,
  MONSTER_KINDS,
  PROTOCOL_VERSION,
  SIMULATION_RATE,
  SLASH_DURATION,
  SNAPSHOT_RATE,
  WALK_SPEED,
  createInteractMessage,
  createMoveMessage,
  decodeServerMessage,
  encodeClientMessage,
  findTimeOfDay,
} from '@clovervale/shared';
import type {
  ClientMessage,
  DayCycle,
  GroundItem,
  InputProgress,
  ItemKindId,
  MonsterState,
  PlayerState,
  ServerMessage,
  SlashJudgement,
  WelcomeMessage,
} from '@clovervale/shared';

import { startServer } from '../src/server.ts';
import type { RunningServer } from '../src/server.ts';

/** How long the server may take to send an awaited message, in ms. */
const MESSAGE_TIMEOUT = 3000;

/** A snapshot, and when it was received. */
interface TimedSnapshot {
  /** The number of simulation steps the snapshot tells. */
  readonly step: number;
  /** The players in the snapshot. */
  readonly players: readonly PlayerState[];
  /** The monsters in the snapshot. */
  readonly monsters: readonly MonsterState[];
  /** How far the player of the peer has got with the inputs of the peer. */
  readonly own: InputProgress;
  /** How the latest slash of the player of the peer was judged. */
  readonly slash: SlashJudgement | null;
  /** The patches of clover that have their clover, by number. */
  readonly clovers: readonly number[];
  /** The items on the ground. */
  readonly items: readonly GroundItem[];
  /** What the player of the peer carries. */
  readonly inventory: readonly ItemKindId[];
  /** When the snapshot was received, in milliseconds. */
  readonly time: number;
}

/** A peer of the server, for a test to act as. */
class Peer {
  /** Whether the server has closed the connection. */
  isClosed = false;
  readonly #socket: WebSocket;
  readonly #messages: [ServerMessage, number][] = [];
  #wake: () => void = () => undefined;

  /**
   * Connects to a server.
   *
   * @param {number} port - The TCP port the server is listening on.
   */
  constructor(port: number) {
    this.#socket = new WebSocket(`ws://localhost:${String(port)}`);
    this.#socket.addEventListener('message', (event: MessageEvent) => {
      const message: ServerMessage = decodeServerMessage(String(event.data));
      this.#messages.push([message, performance.now()]);
      this.#wake();
    });
    this.#socket.addEventListener('close', () => {
      this.isClosed = true;
      this.#wake();
    });
  }

  /**
   * Waits for the next message from the server.
   *
   * @returns {Promise<[ServerMessage, number]>} The message, and when it was
   *   received, in milliseconds.
   * @throws {Error} If the server sends none in time.
   */
  async #receive(): Promise<[ServerMessage, number]> {
    const deadline: number = performance.now() + MESSAGE_TIMEOUT;
    for (;;) {
      const message: [ServerMessage, number] | undefined =
        this.#messages.shift();
      if (message !== undefined) {
        return message;
      }
      const left: number = deadline - performance.now();
      if (left <= 0 || this.isClosed) {
        throw new Error('The server sent nothing.');
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left);
        this.#wake = (): void => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
  }

  /**
   * Waits to be welcomed, as the first thing the server says.
   *
   * @returns {Promise<WelcomeMessage>} The welcome message.
   * @throws {Error} If the server says something else first.
   */
  async receiveWelcome(): Promise<WelcomeMessage> {
    const [message] = await this.#receive();
    if (message.type !== 'welcome') {
      throw new Error(`The server started with a ${message.type} message.`);
    }
    return message;
  }

  /**
   * Waits for the next snapshot.
   *
   * @returns {Promise<TimedSnapshot>} The snapshot.
   */
  async receiveSnapshot(): Promise<TimedSnapshot> {
    for (;;) {
      const [message, time] = await this.#receive();
      if (message.type === 'snapshot') {
        const { step, players, monsters, own, slash } = message;
        const { clovers, items, inventory } = message;
        return {
          step,
          players,
          monsters,
          own,
          slash,
          clovers,
          items,
          inventory,
          time,
        };
      }
    }
  }

  /**
   * Waits for a snapshot that shows what a test is waiting for.
   *
   * @param {(players: readonly PlayerState[]) => boolean} isAwaited - Tells
   *   whether a snapshot shows it.
   * @returns {Promise<TimedSnapshot>} The first such snapshot.
   */
  async receiveSnapshotWhere(
    isAwaited: (players: readonly PlayerState[]) => boolean,
  ): Promise<TimedSnapshot> {
    for (;;) {
      const snapshot: TimedSnapshot = await this.receiveSnapshot();
      if (isAwaited(snapshot.players)) {
        return snapshot;
      }
    }
  }

  /**
   * Sends the server a message.
   *
   * @param {ClientMessage | string} message - The message, or the text to
   *   send as it is.
   */
  send(message: ClientMessage | string): void {
    this.#socket.send(
      typeof message === 'string' ? message : encodeClientMessage(message),
    );
  }

  /**
   * Waits for the server to close the connection.
   *
   * @returns {Promise<void>} A promise settled once it is closed.
   * @throws {Error} If the server keeps it open.
   */
  async waitUntilClosed(): Promise<void> {
    const deadline: number = performance.now() + MESSAGE_TIMEOUT;
    while (!this.isClosed) {
      if (performance.now() > deadline) {
        throw new Error('The server kept the connection open.');
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /** Disconnects from the server. */
  leave(): void {
    this.#socket.close();
  }
}

/**
 * Finds a player in a snapshot.
 *
 * @param {TimedSnapshot} snapshot - The snapshot.
 * @param {number} id - The identifier of the player.
 * @returns {PlayerState} The player.
 * @throws {Error} If the player is not in the snapshot.
 */
function findPlayer(snapshot: TimedSnapshot, id: number): PlayerState {
  const player: PlayerState | undefined = snapshot.players.find(
    (candidate: PlayerState) => candidate.id === id,
  );
  if (player === undefined) {
    throw new Error(`Player ${String(id)} is not in the snapshot.`);
  }
  return player;
}

/**
 * Lists the identifiers of the players in a snapshot.
 *
 * @param {TimedSnapshot} snapshot - The snapshot.
 * @returns {number[]} The identifiers, in the order of the snapshot.
 */
function listIds(snapshot: TimedSnapshot): number[] {
  return snapshot.players.map((player: PlayerState) => player.id);
}

describe('the game server', () => {
  let server: RunningServer | undefined;
  const peers: Peer[] = [];

  /**
   * Connects a peer to the server, which is started if it is not running.
   *
   * @returns {Promise<[Peer, number]>} The peer, welcomed, and the
   *   identifier of its player.
   */
  async function connectPeer(): Promise<[Peer, number]> {
    server ??= await startServer(0);
    const peer = new Peer(server.port ?? 0);
    peers.push(peer);
    return [peer, (await peer.receiveWelcome()).playerId];
  }

  /**
   * Tells whether a snapshot shows two players.
   *
   * @param {readonly PlayerState[]} players - The players in the snapshot.
   * @returns {boolean} Whether there are two of them.
   */
  function isPair(players: readonly PlayerState[]): boolean {
    return players.length === 2;
  }

  afterEach(async () => {
    for (const peer of peers.splice(0)) {
      peer.leave();
    }
    await server?.stop();
    server = undefined;
  });

  it('welcomes a peer with its protocol version and its player', async () => {
    server = await startServer(0);
    const peer = new Peer(server.port ?? 0);
    peers.push(peer);
    const welcome: WelcomeMessage = await peer.receiveWelcome();
    expect(welcome.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(listIds(await peer.receiveSnapshot())).toEqual([welcome.playerId]);
  });

  it('tells a peer how the day goes on the server', async () => {
    const day: DayCycle = { origin: 0.75, length: 60_000 };
    server = await startServer(0, day);
    const peer = new Peer(server.port ?? 0);
    peers.push(peer);
    expect((await peer.receiveWelcome()).day).toEqual(day);
  });

  it('runs the default day from the default time by default', async () => {
    server = await startServer(0);
    const peer = new Peer(server.port ?? 0);
    peers.push(peer);
    expect((await peer.receiveWelcome()).day).toEqual({
      origin: DEFAULT_DAY_ORIGIN,
      length: DEFAULT_DAY_LENGTH,
    });
  });

  it('shows a late peer the time of day the others see', async () => {
    const day: DayCycle = { origin: 0.2, length: 4000 };
    server = await startServer(0, day);
    const early = new Peer(server.port ?? 0);
    peers.push(early);
    const earlyDay: DayCycle | null = (await early.receiveWelcome()).day;
    await new Promise((resolve) => setTimeout(resolve, 600));
    const late = new Peer(server.port ?? 0);
    peers.push(late);
    const lateDay: DayCycle | null = (await late.receiveWelcome()).day;
    const { step } = await late.receiveSnapshot();
    let seen: TimedSnapshot = await early.receiveSnapshot();
    while (seen.step < step) {
      seen = await early.receiveSnapshot();
    }
    expect(seen.step).toBe(step);
    // The day had moved on before the late peer joined.
    expect(step).toBeGreaterThan(0);
    expect(earlyDay).not.toBeNull();
    expect(lateDay).not.toBeNull();
    const earlyTime: number = findTimeOfDay(
      earlyDay ?? day,
      (seen.step * 1000) / SIMULATION_RATE,
    );
    const lateTime: number = findTimeOfDay(
      lateDay ?? day,
      (step * 1000) / SIMULATION_RATE,
    );
    expect(lateTime).toBe(earlyTime);
  });

  it('gives every peer a player of its own', async () => {
    const [watcher, firstId] = await connectPeer();
    const [, secondId] = await connectPeer();
    const snapshot: TimedSnapshot = await watcher.receiveSnapshotWhere(isPair);
    expect(listIds(snapshot)).toEqual([firstId, secondId]);
    const first: PlayerState = findPlayer(snapshot, firstId);
    const second: PlayerState = findPlayer(snapshot, secondId);
    expect(first.appearance).not.toBe(second.appearance);
    expect(Math.hypot(first.x - second.x, first.z - second.z))
      .toBeGreaterThan(1);
  });

  it('sends every peer the same players', async () => {
    const [mover, moverId] = await connectPeer();
    const [watcher] = await connectPeer();
    mover.send(createMoveMessage({ sequence: 1, after: 0 }, { x: 1, z: 0 }));
    const isWalking = (players: readonly PlayerState[]): boolean =>
      isPair(players) &&
      players.some(
        (player: PlayerState) =>
          player.id === moverId && player.action === 'Walk',
      );
    const seen: TimedSnapshot = await watcher.receiveSnapshotWhere(isWalking);
    const own: TimedSnapshot = await mover.receiveSnapshotWhere(isWalking);
    expect(seen.players).toEqual(own.players);
    expect(findPlayer(seen, moverId).yaw).toBeCloseTo(90);
  });

  it('sends every peer the monster, and its health', async () => {
    const [first] = await connectPeer();
    const [second] = await connectPeer();
    const seen: TimedSnapshot = await first.receiveSnapshotWhere(isPair);
    expect(seen.monsters).toEqual([
      expect.objectContaining({
        kind: 'village-dog',
        health: MONSTER_KINDS['village-dog'].health,
      }),
    ]);
    const other: TimedSnapshot = await second.receiveSnapshotWhere(
      () => true,
    );
    expect(other.monsters.map((monster: MonsterState) => monster.id)).toEqual(
      seen.monsters.map((monster: MonsterState) => monster.id),
    );
  });

  it('sends snapshots at the snapshot rate', async () => {
    const [peer] = await connectPeer();
    const first: TimedSnapshot = await peer.receiveSnapshot();
    let last: TimedSnapshot = first;
    for (let count = 0; count < SNAPSHOT_RATE; count++) {
      last = await peer.receiveSnapshot();
    }
    const seconds: number = (last.time - first.time) / 1000;
    expect(seconds).toBeGreaterThan(0.8);
    expect(seconds).toBeLessThan(1.3);
  });

  it('tells the simulation step of every snapshot', async () => {
    const [peer] = await connectPeer();
    const first: TimedSnapshot = await peer.receiveSnapshot();
    let last: TimedSnapshot = first;
    for (let count = 0; count < SNAPSHOT_RATE; count++) {
      const next: TimedSnapshot = await peer.receiveSnapshot();
      expect(Number.isInteger(next.step)).toBe(true);
      expect(next.step).toBeGreaterThan(last.step);
      last = next;
    }
    const simulated: number = (last.step - first.step) / SIMULATION_RATE;
    const waited: number = (last.time - first.time) / 1000;
    expect(Math.abs(simulated - waited)).toBeLessThan(0.3);
  });

  it('walks a player the way its peer asks, at walking speed', async () => {
    const [peer, id] = await connectPeer();
    const still: TimedSnapshot = await peer.receiveSnapshot();
    expect(findPlayer(still, id).action).toBe('Idle');
    peer.send(createMoveMessage({ sequence: 1, after: 0 }, { x: 0, z: 1 }));
    const start: TimedSnapshot = await peer.receiveSnapshotWhere(
      ([player]: readonly PlayerState[]) => player?.action === 'Walk',
    );
    let end: TimedSnapshot = start;
    for (let count = 0; count < SNAPSHOT_RATE; count++) {
      end = await peer.receiveSnapshot();
    }
    const from: PlayerState = findPlayer(start, id);
    const to: PlayerState = findPlayer(end, id);
    // The simulation steps at a fixed rate, so a second of snapshots is a
    // second of walking, whenever they happen to arrive.
    expect(to.z - from.z).toBeCloseTo(WALK_SPEED);
    expect(to.x).toBeCloseTo(from.x);
    expect(to.yaw).toBeCloseTo(0);

    peer.send(createMoveMessage({ sequence: 2, after: 0 }, { x: 0, z: 0 }));
    const stopped: TimedSnapshot = await peer.receiveSnapshotWhere(
      ([player]: readonly PlayerState[]) => player?.action === 'Idle',
    );
    const after: TimedSnapshot = await peer.receiveSnapshot();
    expect(findPlayer(after, id)).toEqual(findPlayer(stopped, id));
  });

  it('makes a player slash for a while when its peer interacts', async () => {
    const [actor, id] = await connectPeer();
    const [watcher] = await connectPeer();
    actor.send(createInteractMessage({ sequence: 1, after: 0 }));
    const isSlashing = (players: readonly PlayerState[]): boolean =>
      players.some(
        (player: PlayerState) => player.id === id && player.action === 'Slash',
      );
    const slashing: TimedSnapshot =
      await watcher.receiveSnapshotWhere(isSlashing);
    const over: TimedSnapshot = await watcher.receiveSnapshotWhere(
      (players: readonly PlayerState[]) => !isSlashing(players),
    );
    const seconds: number = (over.time - slashing.time) / 1000;
    expect(seconds).toBeGreaterThan(SLASH_DURATION - 0.3);
    expect(seconds).toBeLessThan(SLASH_DURATION + 0.3);
    const before: PlayerState = findPlayer(slashing, id);
    const after: PlayerState = findPlayer(over, id);
    expect(after.action).toBe('Idle');
    expect(after.actionCount).toBeGreaterThan(before.actionCount);
  });

  it('judges a slash on the snapshot its peer names', async () => {
    const [actor] = await connectPeer();
    const [watcher] = await connectPeer();
    const shown: TimedSnapshot = await actor.receiveSnapshot();
    expect(shown.slash).toBeNull();
    const shownTime: number = (shown.step * 1000) / SIMULATION_RATE;
    actor.send(createInteractMessage({ sequence: 1, after: 0 }, shownTime));
    let judged: TimedSnapshot = await actor.receiveSnapshot();
    while (judged.slash === null) {
      judged = await actor.receiveSnapshot();
    }
    const stepTime: number = (judged.slash.step * 1000) / SIMULATION_RATE;
    expect(judged.slash).toEqual({
      step: judged.slash.step,
      rewind: stepTime - shownTime,
      isHit: false,
    });
    expect((await watcher.receiveSnapshot()).slash).toBeNull();
  });

  it('tells every peer how far its own player has got', async () => {
    const [mover, moverId] = await connectPeer();
    const [watcher, watcherId] = await connectPeer();
    const still: TimedSnapshot = await mover.receiveSnapshot();
    expect(still.own.sequence).toBe(0);
    mover.send(createMoveMessage({ sequence: 1, after: 0 }, { x: 1, z: 0 }));
    mover.send(createMoveMessage({ sequence: 2, after: 4 }, { x: 0, z: 0 }));
    const stopped: TimedSnapshot = await mover.receiveSnapshotWhere(
      (players: readonly PlayerState[]) =>
        players.some(
          (player: PlayerState) =>
            player.id === moverId &&
            player.action === 'Idle' &&
            player.actionCount > 0,
        ),
    );
    const { x, z, yaw, action, actionCount } = findPlayer(stopped, moverId);
    expect(stopped.own.sequence).toBe(2);
    expect(stopped.own.steps).toBeGreaterThan(0);
    expect(stopped.own.motion).toEqual({
      x,
      z,
      yaw,
      action,
      actionCount,
      direction: { x: 0, z: 0 },
      isInteracting: false,
      actionSteps: 0,
    });
    // The stop waited for the four steps it told.
    expect(x - findPlayer(still, moverId).x).toBeCloseTo(
      (WALK_SPEED * 4) / SIMULATION_RATE,
    );
    const seen: TimedSnapshot = await watcher.receiveSnapshot();
    const { x: ownX, z: ownZ } = findPlayer(seen, watcherId);
    expect(seen.own.sequence).toBe(0);
    expect(seen.own.motion).toMatchObject({ x: ownX, z: ownZ });
  });

  it('tells every peer what there is to pick, and what it carries', async () => {
    const [peer] = await connectPeer();
    const snapshot: TimedSnapshot = await peer.receiveSnapshot();
    expect(snapshot.clovers).toEqual(CLOVER_PATCHES.map((_, index) => index));
    expect(snapshot.items).toEqual([]);
    expect(snapshot.inventory).toEqual([]);
  });

  it('takes picks and put-downs of a player in turn', async () => {
    const [peer] = await connectPeer();
    peer.send({ type: 'pick', sequence: 1, after: 0 });
    peer.send({ type: 'drop', sequence: 2, after: 0, slot: 0 });
    let seen: TimedSnapshot = await peer.receiveSnapshot();
    while (seen.own.sequence < 2) {
      seen = await peer.receiveSnapshot();
    }
    // Far from any clover, and carrying nothing, it gets and leaves nothing.
    expect(seen.inventory).toEqual([]);
    expect(seen.items).toEqual([]);
    expect(peer.isClosed).toBe(false);
  });

  it('disconnects a peer whose inputs are not numbered upwards', async () => {
    const [offender] = await connectPeer();
    const [watcher, watcherId] = await connectPeer();
    await watcher.receiveSnapshotWhere(isPair);
    offender.send(createInteractMessage({ sequence: 2, after: 0 }));
    offender.send(createInteractMessage({ sequence: 2, after: 0 }));
    await offender.waitUntilClosed();
    const snapshot: TimedSnapshot = await watcher.receiveSnapshotWhere(
      (players: readonly PlayerState[]) => !isPair(players),
    );
    expect(listIds(snapshot)).toEqual([watcherId]);
  });

  it('takes the player of a peer that leaves out of the world', async () => {
    const [leaver] = await connectPeer();
    const [watcher, watcherId] = await connectPeer();
    await watcher.receiveSnapshotWhere(isPair);
    leaver.leave();
    const snapshot: TimedSnapshot = await watcher.receiveSnapshotWhere(
      (players: readonly PlayerState[]) => !isPair(players),
    );
    expect(listIds(snapshot)).toEqual([watcherId]);
  });

  it('disconnects a peer that sends a malformed message', async () => {
    const [offender] = await connectPeer();
    const [watcher, watcherId] = await connectPeer();
    await watcher.receiveSnapshotWhere(isPair);
    offender.send('{"type":"move","sequence":1,"after":0,"direction":"north"}');
    await offender.waitUntilClosed();
    const snapshot: TimedSnapshot = await watcher.receiveSnapshotWhere(
      (players: readonly PlayerState[]) => !isPair(players),
    );
    expect(listIds(snapshot)).toEqual([watcherId]);
  });
});

describe('the game server on a Unix socket file', () => {
  let directory: string;
  let socketPath: string;
  let server: RunningServer | undefined;

  /**
   * Connects to a socket file, and waits for the first two messages.
   *
   * @param {string} file - The path of the socket file.
   * @returns {Promise<ServerMessage[]>} The two messages.
   */
  function receiveFirstMessages(file: string): Promise<ServerMessage[]> {
    return new Promise((resolve, reject) => {
      const messages: ServerMessage[] = [];
      const client = new SocketFileClient(`ws+unix:${file}:/`);
      const timer: NodeJS.Timeout = setTimeout(() => {
        client.terminate();
        reject(new Error('The server sent nothing.'));
      }, MESSAGE_TIMEOUT);
      client.on('error', (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
      client.on('message', (data: Buffer) => {
        messages.push(decodeServerMessage(data.toString('utf8')));
        if (messages.length === 2) {
          clearTimeout(timer);
          client.terminate();
          resolve(messages);
        }
      });
    });
  }

  /**
   * Listens on a socket file with something that is not a game server.
   *
   * @param {string} file - The path of the socket file.
   * @returns {Promise<Server>} The listening server.
   */
  function listenOnFile(file: string): Promise<Server> {
    return new Promise((resolve, reject) => {
      const other: Server = createServer();
      other.once('error', reject);
      other.listen(file, () => {
        resolve(other);
      });
    });
  }

  /**
   * Stops what listens on a socket file.
   *
   * @param {Server} other - The listening server.
   * @returns {Promise<void>} A promise settled once it has stopped.
   */
  function stopListening(other: Server): Promise<void> {
    return new Promise((resolve) => {
      other.close(() => {
        resolve();
      });
    });
  }

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'clovervale-server-'));
    socketPath = path.join(directory, 'game.sock');
  });

  afterEach(async () => {
    await server?.stop();
    server = undefined;
    rmSync(directory, { recursive: true, force: true });
  });

  it('serves the peers that connect to the socket file', async () => {
    server = await startServer(socketPath);
    expect(server.socketPath).toBe(socketPath);
    expect(server.port).toBeNull();
    const [welcome, snapshot] = await receiveFirstMessages(socketPath);
    expect(welcome?.type).toBe('welcome');
    expect(snapshot?.type).toBe('snapshot');
  });

  it('lets the owner and the group of the socket file connect', async () => {
    server = await startServer(socketPath);
    expect(statSync(socketPath).mode & 0o777).toBe(0o660);
  });

  it('removes the socket file when it stops', async () => {
    server = await startServer(socketPath);
    await server.stop();
    server = undefined;
    expect(existsSync(socketPath)).toBe(false);
  });

  it('replaces a socket file that nothing listens on any more', async () => {
    // A socket file that is moved away outlives what listened on it.
    const elsewhere: string = path.join(directory, 'moved.sock');
    const crashed: Server = await listenOnFile(elsewhere);
    renameSync(elsewhere, socketPath);
    await stopListening(crashed);
    expect(statSync(socketPath).isSocket()).toBe(true);

    server = await startServer(socketPath);
    const [welcome] = await receiveFirstMessages(socketPath);
    expect(welcome?.type).toBe('welcome');
  });

  it('leaves a socket file that something listens on alone', async () => {
    const other: Server = await listenOnFile(socketPath);
    try {
      await expect(startServer(socketPath)).rejects.toThrow(socketPath);
      expect(statSync(socketPath).isSocket()).toBe(true);
      expect(other.listening).toBe(true);
    } finally {
      await stopListening(other);
    }
  });

  it('leaves a file that is not a socket alone', async () => {
    writeFileSync(socketPath, 'Not a socket.');
    await expect(startServer(socketPath)).rejects.toThrow(socketPath);
    expect(readFileSync(socketPath, 'utf8')).toBe('Not a socket.');
  });
});
