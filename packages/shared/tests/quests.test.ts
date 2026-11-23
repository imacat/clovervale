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
 * @module shared/tests/quests Tests for the quests, how they move on, and
 *   how they are told on the wire.
 */

import { describe, expect, it } from 'vitest';

import {
  ClovervaleQuest,
  TobyQuest,
  parseQuest,
  parseQuests,
} from '../src/quests.ts';
import type { Quest, StoryCue } from '../src/quests.ts';

/** That Martha has given the player her ointment. */
const OINTMENT_GIVEN: StoryCue = { villager: 'martha', event: 'ointment-given' };

/** That Toby has had an ointment from the player. */
const OINTMENT_RECEIVED: StoryCue = {
  villager: 'toby',
  event: 'ointment-received',
};

/** That Edwin has given the player his message. */
const MESSAGE_GIVEN: StoryCue = { villager: 'edwin', event: 'message-given' };

/** That the player has beaten Martha. */
const MARTHA_BEATEN: StoryCue = { villager: 'martha', event: 'martha-beaten' };

describe('the quest of Toby, hurt', () => {
  it('waits for the ointment of Martha, then for Toby to have it', () => {
    const quest = new TobyQuest();
    expect(quest.stage).toBe('started');
    expect(quest.awaits).toEqual([OINTMENT_GIVEN, OINTMENT_RECEIVED]);
    expect(quest.advance(OINTMENT_GIVEN)).toBe(true);
    expect(quest.stage).toBe('supplied');
    expect(quest.awaits).toEqual([OINTMENT_RECEIVED]);
    expect(quest.advance(OINTMENT_GIVEN)).toBe(false);
    expect(quest.isDone).toBe(false);
    expect(quest.advance(OINTMENT_RECEIVED)).toBe(true);
    expect(quest.stage).toBe('done');
    expect(quest.isDone).toBe(true);
    expect(quest.awaits).toEqual([]);
  });

  it('is done at once as Toby has an ointment found elsewhere', () => {
    const quest = new TobyQuest();
    expect(quest.advance(OINTMENT_RECEIVED)).toBe(true);
    expect(quest.stage).toBe('done');
    expect(quest.advance(OINTMENT_GIVEN)).toBe(false);
    expect(quest.stage).toBe('done');
  });

  it('asks nothing of anybody', () => {
    expect(new TobyQuest().request).toBeNull();
  });
});

describe('the main plot', () => {
  it('waits for the message of Edwin and for Martha to be beaten', () => {
    const quest = new ClovervaleQuest();
    expect(quest.stage).toBe('entered');
    expect(quest.awaits).toEqual([MESSAGE_GIVEN, MARTHA_BEATEN]);
    expect(quest.advance(OINTMENT_GIVEN)).toBe(false);
    expect(quest.advance(MESSAGE_GIVEN)).toBe(true);
    expect(quest.stage).toBe('message');
    expect(quest.awaits).toEqual([MARTHA_BEATEN]);
    expect(quest.advance(MESSAGE_GIVEN)).toBe(false);
    expect(quest.isDone).toBe(false);
    expect(quest.advance(MARTHA_BEATEN)).toBe(true);
    expect(quest.stage).toBe('done');
    expect(quest.isDone).toBe(true);
    expect(quest.awaits).toEqual([]);
  });

  it('takes the token before the message as well', () => {
    const quest = new ClovervaleQuest();
    expect(quest.advance(MARTHA_BEATEN)).toBe(true);
    expect(quest.stage).toBe('token');
    expect(quest.awaits).toEqual([MESSAGE_GIVEN]);
    expect(quest.isDone).toBe(false);
    expect(quest.advance(MARTHA_BEATEN)).toBe(false);
    expect(quest.advance(MESSAGE_GIVEN)).toBe(true);
    expect(quest.stage).toBe('done');
    expect(quest.isDone).toBe(true);
  });

  it('tells Martha what the player needs of her until she is beaten', () => {
    expect(new ClovervaleQuest('entered').request).toEqual({
      villager: 'martha',
      need: 'prisoner-found',
    });
    expect(new ClovervaleQuest('message').request).toEqual({
      villager: 'martha',
      need: 'message-held',
    });
    expect(new ClovervaleQuest('token').request).toBeNull();
    expect(new ClovervaleQuest('done').request).toBeNull();
  });
});

describe('a quest on the wire', () => {
  it.each([
    new TobyQuest('supplied'),
    new ClovervaleQuest('message'),
    new ClovervaleQuest('token'),
    new ClovervaleQuest('done'),
  ])('is rebuilt as it was told', (quest: Quest) => {
    const rebuilt: Quest = parseQuest(JSON.parse(JSON.stringify(quest)));
    expect(rebuilt).toBeInstanceOf(quest.constructor);
    expect(rebuilt.toJSON()).toEqual(quest.toJSON());
  });

  it.each([
    ['nothing', null],
    ['a list', []],
    ['a quest there is not', { id: 'lost-dog', stage: 'started' }],
    ['a stage there is not', { id: 'toby-hurt', stage: 'given up' }],
    ['a stage of another quest', { id: 'clovervale', stage: 'supplied' }],
    ['no stage', { id: 'clovervale' }],
  ])('rejects %s', (_, value: unknown) => {
    expect(() => parseQuest(value)).toThrow();
  });

  it('rejects quests told twice', () => {
    const told: unknown = JSON.parse(
      JSON.stringify([new TobyQuest(), new TobyQuest('done')]),
    );
    expect(() => parseQuests(told)).toThrow();
  });

  it('rejects each quest class rebuilding another quest', () => {
    expect(() =>
      TobyQuest.fromJSON({ id: 'clovervale', stage: 'done' }),
    ).toThrow();
    expect(() =>
      ClovervaleQuest.fromJSON({ id: 'toby-hurt', stage: 'done' }),
    ).toThrow();
  });
});
