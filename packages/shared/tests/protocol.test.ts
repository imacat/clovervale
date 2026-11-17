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
 * @module shared/tests/protocol Tests for the wire protocol.
 */

import { describe, expect, it } from 'vitest';

import {
  PROTOCOL_VERSION,
  createWelcomeMessage,
  decodeServerMessage,
  encodeServerMessage,
} from '../src/index.ts';

describe('the server message codec', () => {
  it('decodes what it encodes', () => {
    const message = createWelcomeMessage();
    expect(decodeServerMessage(encodeServerMessage(message))).toEqual({
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
    });
  });

  it('rejects data that is not JSON', () => {
    expect(() => decodeServerMessage('welcome')).toThrow();
  });

  it('rejects a message of an unknown type', () => {
    const data = JSON.stringify({ type: 'farewell', protocolVersion: 1 });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it('rejects a welcome message without a valid protocol version', () => {
    const data = JSON.stringify({ type: 'welcome', protocolVersion: '1' });
    expect(() => decodeServerMessage(data)).toThrow();
  });
});
