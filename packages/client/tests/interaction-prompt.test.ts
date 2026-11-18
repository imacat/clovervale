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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/18
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/tests/interaction-prompt Tests for telling what the space
 *   bar does.
 */

import { describe, expect, it } from 'vitest';

import {
  FOUNTAIN_RIM_RADIUS,
  PLAYER_RADIUS,
  PLAZA_CENTRE,
  TALK_REACH,
  applyInput,
  createMotion,
  findPlacement,
  killMotion,
  stepMotion,
} from '@clovervale/shared';
import type { PlayerMotion } from '@clovervale/shared';

import {
  describePrompt,
  describeSpaceKey,
} from '../src/interaction-prompt.ts';
import { Translator } from '../src/translator.ts';

/** A translator of the text into English. */
const EN = new Translator();

/** A player against the rim of the fountain, facing it. */
const BY_FOUNTAIN: PlayerMotion = createMotion(
  {
    x: PLAZA_CENTRE.x,
    z: PLAZA_CENTRE.z + FOUNTAIN_RIM_RADIUS + PLAYER_RADIUS,
  },
  180,
);

/** A player by the fountain, facing away from it. */
const FACING_AWAY: PlayerMotion = { ...BY_FOUNTAIN, yaw: 0 };

/** A player south of Nancy the villager, facing her. */
const BY_NANCY: PlayerMotion = createMotion(
  {
    x: findPlacement('npc-nancy.glb').x,
    z: findPlacement('npc-nancy.glb').z + TALK_REACH - 0.1,
  },
  180,
);

/**
 * Makes a translator of the text into a language.
 *
 * @param {'zh-TW' | 'zh-CN' | 'ja'} code - The language.
 * @returns {Promise<Translator>} The translator.
 */
async function createTranslator(
  code: 'zh-TW' | 'zh-CN' | 'ja',
): Promise<Translator> {
  const translator = new Translator();
  await translator.choose(code);
  return translator;
}

describe('describePrompt', () => {
  it('tells a player by the fountain, facing it, that it can drink', () => {
    expect(describePrompt(EN, BY_FOUNTAIN)).toBe(
      'Press Space to drink from the fountain',
    );
  });

  it('tells a player by Nancy, facing her, that it can talk to her', () => {
    expect(describePrompt(EN, BY_NANCY)).toBe('Press Space to talk to Nancy');
  });

  it('tells it in the language of the page, in its word order', async () => {
    const zhTw: Translator = await createTranslator('zh-TW');
    expect(describePrompt(zhTw, BY_NANCY)).toBe('按空白鍵與南茜交談');
    expect(describePrompt(zhTw, BY_FOUNTAIN)).toBe('按空白鍵喝噴泉的水');
    const zhCn: Translator = await createTranslator('zh-CN');
    expect(describePrompt(zhCn, BY_NANCY)).toBe('按空格键与南茜交谈');
    const ja: Translator = await createTranslator('ja');
    expect(describePrompt(ja, BY_NANCY)).toBe('スペースキーでナンシーと話す');
  });

  it('tells nothing while the player talks already', () => {
    const talking: PlayerMotion = stepMotion(
      applyInput(BY_NANCY, { type: 'interact' }),
    );
    expect(talking.action).toBe('Talk');
    expect(describePrompt(EN, talking)).toBeNull();
  });

  it('tells nothing while the space bar makes the player slash', () => {
    expect(describePrompt(EN, FACING_AWAY)).toBeNull();
  });

  it('tells nothing while the player drinks already', () => {
    const drinking: PlayerMotion = stepMotion(
      applyInput(BY_FOUNTAIN, { type: 'interact' }),
    );
    expect(drinking.action).toBe('Drink');
    expect(describePrompt(EN, drinking)).toBeNull();
  });

  it('tells nothing to a dead player, or without a player', () => {
    expect(describePrompt(EN, killMotion(BY_FOUNTAIN))).toBeNull();
    expect(describePrompt(EN, null)).toBeNull();
  });
});

describe('describeSpaceKey', () => {
  it('tells what the space bar makes the player do', () => {
    expect(describeSpaceKey(EN, BY_FOUNTAIN)).toBe('drink from the fountain');
    expect(describeSpaceKey(EN, FACING_AWAY)).toBe('slash');
    expect(describeSpaceKey(EN, BY_NANCY)).toBe('talk to Nancy');
  });

  it('tells it in the language of the page', async () => {
    const zhTw: Translator = await createTranslator('zh-TW');
    expect(describeSpaceKey(zhTw, BY_NANCY)).toBe('與南茜交談');
    expect(describeSpaceKey(zhTw, FACING_AWAY)).toBe('揮砍');
    expect(describeSpaceKey(zhTw, killMotion(BY_FOUNTAIN))).toBe('無');
    const ja: Translator = await createTranslator('ja');
    expect(describeSpaceKey(ja, BY_NANCY)).toBe('ナンシーと話す');
  });

  it('tells that it does nothing while the player cannot interact', () => {
    expect(describeSpaceKey(EN, killMotion(BY_FOUNTAIN))).toBe('nothing');
  });

  it('tells nothing is known without a player', () => {
    expect(describeSpaceKey(EN, null)).toBe('–');
  });
});
