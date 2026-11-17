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

import { WebSocket, WebSocketServer } from 'ws';
import type { RawData } from 'ws';

import {
  SIMULATION_RATE,
  SNAPSHOT_RATE,
  createSnapshotMessage,
  createWelcomeMessage,
  decodeClientMessage,
  encodeServerMessage,
} from '@clovervale/shared';
import type { ClientMessage, PlayerState } from '@clovervale/shared';

import { World } from './world.ts';

/** A running game server. */
export interface RunningServer {
  /** The TCP port the server is listening on. */
  readonly port: number;
  /**
   * Stops the server and disconnects every peer.
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

/**
 * Starts a game server.
 *
 * Every peer that connects gets a player of its own, which it is welcomed
 * with and steers with its messages, and which leaves the world when the
 * peer disconnects.  A peer that sends anything but well-formed client
 * messages is disconnected.  All peers are sent snapshots of all the
 * players, again and again, as the simulation of the world goes on.
 *
 * @param {number} port - The TCP port to listen on, or 0 for any free port.
 * @returns {Promise<RunningServer>} The running server.
 */
export function startServer(port: number): Promise<RunningServer> {
  return new Promise((resolve, reject) => {
    const sockets = new WebSocketServer({ port });
    const world = new World();
    sockets.on('connection', (socket: WebSocket) => {
      const player: PlayerState = world.addPlayer();
      socket.on('message', (data: RawData) => {
        let message: ClientMessage;
        try {
          message = decodeClientMessage(readText(data));
        } catch {
          socket.close(POLICY_VIOLATION, 'The message is malformed.');
          return;
        }
        if (message.type === 'move') {
          world.steerPlayer(player.id, message.direction);
        } else {
          world.interactPlayer(player.id);
        }
      });
      socket.on('close', () => {
        world.removePlayer(player.id);
      });
      socket.send(encodeServerMessage(createWelcomeMessage(player.id)));
    });
    sockets.once('error', reject);
    sockets.once('listening', () => {
      const address = sockets.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('The server is not listening on a TCP port.'));
        return;
      }
      const stopSimulation: () => void = runSimulation(world, sockets);
      resolve({
        port: address.port,
        stop: () => {
          stopSimulation();
          return stopServer(sockets);
        },
      });
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
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }
  return new TextDecoder().decode(data);
}

/**
 * Keeps the simulation of a world going at its fixed rate, and sends every
 * peer a snapshot of the players at the snapshot rate.
 *
 * @param {World} world - The world to simulate.
 * @param {WebSocketServer} sockets - The WebSocket server the peers are
 *   connected to.
 * @returns {() => void} Stops the simulation and the snapshots.
 */
function runSimulation(world: World, sockets: WebSocketServer): () => void {
  const startTime: number = performance.now();
  let stepCount = 0;
  let timer: NodeJS.Timeout;
  const catchUp = (): void => {
    const dueCount: number = Math.floor(
      (performance.now() - startTime) / STEP_MILLISECONDS,
    );
    let isSnapshotDue = false;
    while (stepCount < dueCount) {
      world.step();
      stepCount++;
      isSnapshotDue ||= stepCount % STEPS_PER_SNAPSHOT === 0;
    }
    if (isSnapshotDue) {
      const snapshot: string = encodeServerMessage(
        createSnapshotMessage(world.listPlayers()),
      );
      for (const socket of sockets.clients) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(snapshot);
        }
      }
    }
    const nextTime: number = startTime + (stepCount + 1) * STEP_MILLISECONDS;
    timer = setTimeout(catchUp, Math.max(nextTime - performance.now(), 0));
  };
  timer = setTimeout(catchUp, STEP_MILLISECONDS);
  return () => {
    clearTimeout(timer);
  };
}
/**
 * Stops a WebSocket server and disconnects every peer.
 *
 * @param {WebSocketServer} sockets - The WebSocket server to stop.
 * @returns {Promise<void>} A promise settled once the server has stopped.
 */
function stopServer(sockets: WebSocketServer): Promise<void> {
  return new Promise((resolve, reject) => {
    for (const socket of sockets.clients) {
      socket.terminate();
    }
    sockets.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}
