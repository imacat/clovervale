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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/21
// AI assistance: Claude Code (Anthropic)

/**
 * @module shared/tests/quests Tests for the quests and how far a player
 *   has got with them.
 */

import { describe, expect, it } from 'vitest';

import { hasQuestWords, isQuestLog } from '../src/quests.ts';

describe('hasQuestWords', () => {
  it('has the server choose the words of Toby and Martha on the quest', () => {
    expect(hasQuestWords('toby', { 'toby-hurt': 'started' })).toBe(true);
    expect(hasQuestWords('martha', { 'toby-hurt': 'started' })).toBe(true);
    expect(hasQuestWords('martha', { 'toby-hurt': 'supplied' })).toBe(true);
  });

  it('leaves the words of the others to the peer on the quest', () => {
    expect(hasQuestWords('nancy', { 'toby-hurt': 'started' })).toBe(false);
    expect(hasQuestWords('emma', { 'toby-hurt': 'started' })).toBe(false);
  });

  it('leaves the words of Martha to the peer off the quest', () => {
    expect(hasQuestWords('martha', {})).toBe(false);
    expect(hasQuestWords('martha', { 'toby-hurt': 'done' })).toBe(false);
  });
});

describe('isQuestLog', () => {
  it('takes no quests, or a stage of a quest there is', () => {
    expect(isQuestLog({})).toBe(true);
    expect(isQuestLog({ 'toby-hurt': 'started' })).toBe(true);
    expect(isQuestLog({ 'toby-hurt': 'supplied' })).toBe(true);
    expect(isQuestLog({ 'toby-hurt': 'done' })).toBe(true);
  });

  it.each([
    ['nothing', null],
    ['a list', []],
    ['a quest there is not', { 'lost-dog': 'started' }],
    ['a stage there is not', { 'toby-hurt': 'given up' }],
  ])('rejects %s', (_, value: unknown) => {
    expect(isQuestLog(value)).toBe(false);
  });
});
