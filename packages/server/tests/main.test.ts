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
 * @module server/tests/main Tests for the game server program.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** The entry point of the game server program. */
const MAIN_FILE: string = path.resolve(import.meta.dirname, '../src/main.ts');

/** How long the program may take to start or to stop, in milliseconds. */
const PROGRAM_TIMEOUT = 10_000;

describe('the game server program', () => {
  let directory: string;
  let program: ChildProcess | undefined;

  /**
   * Starts the program in the test directory.
   *
   * @param {string[]} args - The command-line arguments of the program.
   * @returns {Promise<string>} What the program says once it is listening.
   */
  function startProgram(args: string[]): Promise<string> {
    const child: ChildProcess = spawn(process.execPath, [MAIN_FILE, ...args], {
      cwd: directory,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    program = child;
    return new Promise((resolve, reject) => {
      let output = '';
      const timer: NodeJS.Timeout = setTimeout(() => {
        reject(new Error(`The program did not start in time.\n${output}`));
      }, PROGRAM_TIMEOUT);
      child.once('close', (code: number | null) => {
        clearTimeout(timer);
        const how = `exited with code ${String(code)}`;
        reject(new Error(`The program ${how}.\n${output}`));
      });
      for (const stream of [child.stdout, child.stderr]) {
        stream?.setEncoding('utf8').on('data', (chunk: string) => {
          output += chunk;
          const line: string | undefined = /^.*listening.*$/m.exec(output)?.[0];
          if (line !== undefined) {
            clearTimeout(timer);
            resolve(line);
          }
        });
      }
    });
  }

  /**
   * Asks the program to stop, and waits until it has.
   *
   * @param {NodeJS.Signals} signal - The signal to send the program.
   * @returns {Promise<number | null>} The exit code of the program, or
   *   `null` if a signal killed it.
   */
  function stopProgram(signal: NodeJS.Signals): Promise<number | null> {
    const child: ChildProcess | undefined = program;
    program = undefined;
    if (child === undefined) {
      return Promise.resolve(null);
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      return Promise.resolve(child.exitCode);
    }
    return new Promise((resolve) => {
      const timer: NodeJS.Timeout = setTimeout(() => {
        child.kill('SIGKILL');
      }, PROGRAM_TIMEOUT);
      child.once('exit', (code: number | null) => {
        clearTimeout(timer);
        resolve(code);
      });
      child.kill(signal);
    });
  }

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'clovervale-main-'));
  });

  afterEach(async () => {
    await stopProgram('SIGKILL');
    rmSync(directory, { recursive: true, force: true });
  });

  it('listens on the socket file of --socket', async () => {
    const line: string = await startProgram(['--socket', 'game.sock']);
    expect(line).toContain('game.sock');
    expect(existsSync(path.join(directory, 'game.sock'))).toBe(true);
  });

  it('listens on the port of --port', async () => {
    const line: string = await startProgram(['--port', '0']);
    expect(line).toMatch(/listening on port [1-9]\d*/);
  });

  it('fails without listening when the options are wrong', async () => {
    const args: string[] = ['--socket', 'game.sock', '--port', '0'];
    await expect(startProgram(args)).rejects.toThrow(
      /exited with code [1-9][^]*cannot be used together/,
    );
    expect(existsSync(path.join(directory, 'game.sock'))).toBe(false);
  });

  it.each(['SIGTERM', 'SIGINT'] as const)(
    'removes its socket file and exits cleanly on %s',
    async (signal: NodeJS.Signals) => {
      const socketPath: string = path.join(directory, 'game.sock');
      await startProgram(['--socket', socketPath]);
      expect(existsSync(socketPath)).toBe(true);
      expect(await stopProgram(signal)).toBe(0);
      expect(existsSync(socketPath)).toBe(false);
    },
  );
});
