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
 * @module server/server The WebSocket game server.
 */

import { chmodSync, lstatSync, unlinkSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { STATUS_CODES, createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { connect } from 'node:net';
import type { Socket } from 'node:net';

import { WebSocket, WebSocketServer } from 'ws';
import type { RawData } from 'ws';

import {
  SIMULATION_RATE,
  SNAPSHOT_RATE,
  createWelcomeMessage,
  decodeClientMessage,
  encodeServerMessage,
} from '@clovervale/shared';
import type {
  ClientMessage,
  DayCycle,
  PlayerState,
  ServerMessage,
} from '@clovervale/shared';

import { Realm } from './realm.ts';

/** A running game server. */
export interface RunningServer {
  /**
   * The TCP port the server is listening on, or `null` if it is listening
   * on a Unix socket file.
   */
  readonly port: number | null;
  /**
   * The Unix socket file the server is listening on, or `null` if it is
   * listening on a TCP port.
   */
  readonly socketPath: string | null;
  /**
   * Stops the server and disconnects every peer.
   *
   * The Unix socket file of the server, if it has one, is removed.
   *
   * @returns {Promise<void>} A promise settled once the server has stopped.
   */
  stop(): Promise<void>;
}

/** How long one step of the simulation lasts, in milliseconds. */
const STEP_MILLISECONDS: number = 1000 / SIMULATION_RATE;

/** The number of simulation steps from one snapshot to the next. */
const STEPS_PER_SNAPSHOT: number = SIMULATION_RATE / SNAPSHOT_RATE;

/** The WebSocket status code for a peer that breaks the protocol. */
const POLICY_VIOLATION = 1008;

/** The HTTP status code for a request that is not a WebSocket handshake. */
const UPGRADE_REQUIRED = 426;

/** The permissions of a socket file: its owner and its group may connect. */
const SOCKET_FILE_MODE = 0o660;

/**
 * Starts a game server.
 *
 * Every peer that connects gets a player of its own in the village, which
 * it is welcomed with and steers with its messages, and which leaves the
 * world it is in when the peer disconnects.  The welcome also tells the
 * peer how the day goes.  A peer that sends anything but well-formed
 * client messages, or inputs that are not numbered upwards, or more inputs
 * than can wait for their turn, is disconnected.  A line a peer has its
 * player say is heard as {@link Realm.receiveSay} tells, and a phrase as
 * {@link Realm.receivePhrase} tells.  Every peer is sent what
 * {@link Realm.composeMessages} composes for its player, again and again,
 * as the simulation of the worlds goes on: which map its player is in,
 * whenever that changes, and snapshots of the world its player is in and
 * the events that happen there.  A slash that names the time of the world
 * its peer showed is judged on the world as it was then, as far as the
 * world allows.
 *
 * A Unix socket file is created for its owner and its group to connect to.
 * A socket file that nothing listens on any more is replaced.
 *
 * @param {number | string} target - The TCP port to listen on, or 0 for any
 *   free port, or the path of the Unix socket file to listen on.
 * @param {DayCycle} day - How the time of day goes, counted from step 0
 *   of the simulation.
 * @returns {Promise<RunningServer>} The running server.
 * @throws {Error} If the server cannot listen there: the port is taken,
 *   another server is listening on the socket file, or the path of the
 *   socket file is taken by something that is not a socket.
 */
export async function startServer(
  target: number | string,
  day: DayCycle,
): Promise<RunningServer> {
  if (typeof target === 'string') {
    await removeStaleSocket(target);
  }
  const listener: Server = createServer(refuseRequest);
  await listen(listener, target);
  if (typeof target === 'string') {
    chmodSync(target, SOCKET_FILE_MODE);
  }
  const sockets = new WebSocketServer({ server: listener });
  const realm = new Realm();
  const playerIds = new Map<WebSocket, number>();
  sockets.on('connection', (socket: WebSocket) => {
    const player: PlayerState = realm.addPlayer();
    playerIds.set(socket, player.id);
    socket.on('message', (data: RawData) => {
      let message: ClientMessage;
      try {
        message = decodeClientMessage(readText(data));
      } catch {
        socket.close(POLICY_VIOLATION, 'The message is malformed.');
        return;
      }
      if (message.type === 'say') {
        realm.receiveSay(player.id, message.text);
        return;
      }
      if (message.type === 'phrase') {
        realm.receivePhrase(player.id, message.code);
        return;
      }
      if (!realm.receiveInput(player.id, message)) {
        socket.close(POLICY_VIOLATION, 'The input is out of turn.');
      }
    });
    socket.on('close', () => {
      playerIds.delete(socket);
      realm.removePlayer(player.id);
    });
    socket.send(encodeServerMessage(createWelcomeMessage(player.id, day)));
  });
  const stopSimulation: () => void = runSimulation(realm, playerIds);
  const address = listener.address();
  return {
    port: address === null || typeof address === 'string' ? null : address.port,
    socketPath: typeof target === 'string' ? target : null,
    stop: () => {
      stopSimulation();
      return stopServer(sockets, listener);
    },
  };
}

/**
 * Removes a Unix socket file that nothing listens on any more.
 *
 * @param {string} socketPath - The path of the socket file, which need not
 *   exist.
 * @returns {Promise<void>} A promise settled once the path is free.
 * @throws {Error} If the path is taken by something that is not a socket,
 *   or by a socket that something is listening on.
 */
async function removeStaleSocket(socketPath: string): Promise<void> {
  let stats: Stats;
  try {
    stats = lstatSync(socketPath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }
  if (!stats.isSocket()) {
    throw new Error(`${socketPath} exists and is not a socket file.`);
  }
  if (await isSocketAnswering(socketPath)) {
    throw new Error(`Another server is listening on ${socketPath}.`);
  }
  unlinkSync(socketPath);
}

/**
 * Tells whether something is listening on a Unix socket file.
 *
 * @param {string} socketPath - The path of the socket file.
 * @returns {Promise<boolean>} Whether a connection to it is accepted.
 * @throws {Error} If that cannot be told, as when the file may not be
 *   connected to.
 */
function isSocketAnswering(socketPath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket: Socket = connect(socketPath);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ECONNREFUSED') {
        resolve(false);
      } else {
        reject(error);
      }
    });
  });
}

/**
 * Refuses an HTTP request that is not a WebSocket handshake.
 *
 * @param {IncomingMessage} _request - The request.
 * @param {ServerResponse} response - The response to the request.
 */
function refuseRequest(
  _request: IncomingMessage,
  response: ServerResponse,
): void {
  const body: string = STATUS_CODES[UPGRADE_REQUIRED] ?? '';
  response
    .writeHead(UPGRADE_REQUIRED, {
      'Content-Length': body.length,
      'Content-Type': 'text/plain',
    })
    .end(body);
}

/**
 * Starts an HTTP server listening.
 *
 * @param {Server} listener - The HTTP server.
 * @param {number | string} target - The TCP port to listen on, or 0 for any
 *   free port, or the path of the Unix socket file to listen on.
 * @returns {Promise<void>} A promise settled once the server is listening.
 */
function listen(listener: Server, target: number | string): Promise<void> {
  return new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(target, () => {
      listener.off('error', reject);
      resolve();
    });
  });
}

/**
 * Reads the text of a message received from a peer.
 *
 * @param {RawData} data - The message as received.
 * @returns {string} The text of the message.
 */
function readText(data: RawData): string {
  // A socket hands a message over in fragments only if it is set to.
  return new TextDecoder().decode(data as Buffer | ArrayBuffer);
}

/**
 * Keeps the simulation of the worlds going at its fixed rate, and sends
 * every peer what the realm composes for its player at the snapshot rate.
 * A message that several peers are sent alike is encoded once.
 *
 * @param {Realm} realm - The worlds to simulate.
 * @param {ReadonlyMap<WebSocket, number>} playerIds - The identifiers of
 *   the players of the connected peers, by their connections.
 * @returns {() => void} Stops the simulation and the snapshots.
 */
function runSimulation(
  realm: Realm,
  playerIds: ReadonlyMap<WebSocket, number>,
): () => void {
  const startTime: number = performance.now();
  let timer: NodeJS.Timeout;
  const catchUp = (): void => {
    const dueCount: number = Math.floor(
      (performance.now() - startTime) / STEP_MILLISECONDS,
    );
    let isSnapshotDue = false;
    while (realm.stepCount < dueCount) {
      realm.step();
      isSnapshotDue ||= realm.stepCount % STEPS_PER_SNAPSHOT === 0;
    }
    if (isSnapshotDue) {
      const composed: Map<number, ServerMessage[]> = realm.composeMessages();
      const encoded = new Map<ServerMessage, string>();
      for (const [socket, id] of playerIds) {
        if (socket.readyState !== WebSocket.OPEN) {
          continue;
        }
        for (const message of composed.get(id) ?? []) {
          let data: string | undefined = encoded.get(message);
          if (data === undefined) {
            data = encodeServerMessage(message);
            encoded.set(message, data);
          }
          socket.send(data);
        }
      }
    }
    const nextTime: number =
      startTime + (realm.stepCount + 1) * STEP_MILLISECONDS;
    timer = setTimeout(catchUp, Math.max(nextTime - performance.now(), 0));
  };
  timer = setTimeout(catchUp, STEP_MILLISECONDS);
  return () => {
    clearTimeout(timer);
  };
}

/**
 * Stops a game server and disconnects every peer.
 *
 * @param {WebSocketServer} sockets - The WebSocket server the peers are
 *   connected to.
 * @param {Server} listener - The HTTP server the WebSocket server listens
 *   through.
 * @returns {Promise<void>} A promise settled once the server has stopped.
 */
function stopServer(sockets: WebSocketServer, listener: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    for (const socket of sockets.clients) {
      socket.terminate();
    }
    sockets.close();
    listener.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
    listener.closeAllConnections();
  });
}
