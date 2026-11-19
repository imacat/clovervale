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
  TOBY_LOOP_STEPS,
  VILLAGE_TERRAIN,
  applyInput,
  createMotion,
  findPlacement,
  findTobyPose,
  findTurn,
  killMotion,
  stepMotion,
  turnVector,
} from '@clovervale/shared';
import type {
  GroundVector,
  Placement,
  PlayerMotion,
  TobyPose,
} from '@clovervale/shared';

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
 * Finds a player by Emma the smith, on clear ground within talking reach of
 * her, facing her.
 *
 * @returns {PlayerMotion} The player.
 * @throws {Error} If the ground around her is not clear anywhere.
 */
function standByEmma(): PlayerMotion {
  const emma: Placement = findPlacement('npc-emma.glb');
  for (let degrees = 0; degrees < 360; degrees += 15) {
    const angle: number = (degrees * Math.PI) / 180;
    const position: GroundVector = {
      x: emma.x + (TALK_REACH - 0.1) * Math.sin(angle),
      z: emma.z + (TALK_REACH - 0.1) * Math.cos(angle),
    };
    if (VILLAGE_TERRAIN.isClear(position)) {
      return createMotion(position, degrees + 180);
    }
  }
  throw new Error('The ground around Emma is not clear anywhere.');
}

/** A player by Emma the smith, facing her. */
const BY_EMMA: PlayerMotion = standByEmma();

/**
 * Finds a player on the porch of the chief's house in front of Martha, the
 * village chief, facing her.
 *
 * @returns {PlayerMotion} The player.
 */
function standByMartha(): PlayerMotion {
  const martha: Placement = findPlacement('npc-martha.glb');
  const front: GroundVector = turnVector({ x: 0, z: 1 }, findTurn(martha.yaw));
  return createMotion(
    { x: martha.x + front.x * 0.8, z: martha.z + front.z * 0.8 },
    martha.yaw + 180,
  );
}

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
    expect(describePrompt(EN, BY_FOUNTAIN, 0)).toBe(
      'Press Space to drink from the fountain',
    );
  });

  it('tells a player by Nancy, facing her, that it can talk to her', () => {
    expect(describePrompt(EN, BY_NANCY, 0)).toBe(
      'Press Space to talk to Nancy',
    );
  });

  it('tells a player by Martha, facing her, that it can talk to her', async () => {
    const byMartha: PlayerMotion = standByMartha();
    expect(describePrompt(EN, byMartha, 0)).toBe(
      'Press Space to talk to Chief Martha',
    );
    expect(describeSpaceKey(EN, byMartha, 0)).toBe('talk to Chief Martha');
    const zhTw: Translator = await createTranslator('zh-TW');
    expect(describePrompt(zhTw, byMartha, 0)).toBe('按空白鍵與村長瑪莎交談');
    const zhCn: Translator = await createTranslator('zh-CN');
    expect(describePrompt(zhCn, byMartha, 0)).toBe('按空格键与村长玛莎交谈');
    const ja: Translator = await createTranslator('ja');
    expect(describePrompt(ja, byMartha, 0)).toBe('スペースキーで村長マーサと話す');
  });

  it('tells it in the language of the page, in its word order', async () => {
    const zhTw: Translator = await createTranslator('zh-TW');
    expect(describePrompt(zhTw, BY_NANCY, 0)).toBe('按空白鍵與南茜交談');
    expect(describePrompt(zhTw, BY_FOUNTAIN, 0)).toBe('按空白鍵喝噴泉的水');
    const zhCn: Translator = await createTranslator('zh-CN');
    expect(describePrompt(zhCn, BY_NANCY, 0)).toBe('按空格键与南茜交谈');
    const ja: Translator = await createTranslator('ja');
    expect(describePrompt(ja, BY_NANCY, 0)).toBe('スペースキーでナンシーと話す');
  });

  it('tells nothing to a player by Emma the smith, facing her', () => {
    expect(describePrompt(EN, BY_EMMA, 0)).toBeNull();
    expect(describeSpaceKey(EN, BY_EMMA, 0)).toBe('slash');
  });

  it('tells nothing while the player talks already', () => {
    const talking: PlayerMotion = stepMotion(
      applyInput(BY_NANCY, { type: 'interact' }),
      0,
    );
    expect(talking.action).toBe('Talk');
    expect(describePrompt(EN, talking, 0)).toBeNull();
  });

  it('tells nothing while the space bar makes the player slash', () => {
    expect(describePrompt(EN, FACING_AWAY, 0)).toBeNull();
  });

  it('tells nothing while the player drinks already', () => {
    const drinking: PlayerMotion = stepMotion(
      applyInput(BY_FOUNTAIN, { type: 'interact' }),
      0,
    );
    expect(drinking.action).toBe('Drink');
    expect(describePrompt(EN, drinking, 0)).toBeNull();
  });

  it('tells nothing to a dead player, or without a player', () => {
    expect(describePrompt(EN, killMotion(BY_FOUNTAIN), 0)).toBeNull();
    expect(describePrompt(EN, null, 0)).toBeNull();
  });
});

describe('describeSpaceKey', () => {
  it('tells what the space bar makes the player do', () => {
    expect(describeSpaceKey(EN, BY_FOUNTAIN, 0)).toBe(
      'drink from the fountain',
    );
    expect(describeSpaceKey(EN, FACING_AWAY, 0)).toBe('slash');
    expect(describeSpaceKey(EN, BY_NANCY, 0)).toBe('talk to Nancy');
  });

  it('tells it in the language of the page', async () => {
    const zhTw: Translator = await createTranslator('zh-TW');
    expect(describeSpaceKey(zhTw, BY_NANCY, 0)).toBe('與南茜交談');
    expect(describeSpaceKey(zhTw, FACING_AWAY, 0)).toBe('揮砍');
    expect(describeSpaceKey(zhTw, killMotion(BY_FOUNTAIN), 0)).toBe('無');
    const ja: Translator = await createTranslator('ja');
    expect(describeSpaceKey(ja, BY_NANCY, 0)).toBe('ナンシーと話す');
  });

  it('tells that it does nothing while the player cannot interact', () => {
    expect(describeSpaceKey(EN, killMotion(BY_FOUNTAIN), 0)).toBe('nothing');
  });

  it('tells nothing is known without a player', () => {
    expect(describeSpaceKey(EN, null, 0)).toBe('–');
  });
});

describe('describePrompt by Toby', () => {
  it('names him where he is at the step, in every language', async () => {
    let step = 0;
    while (findTobyPose(step).activity !== 'Pick') {
      step = (step + 1) % TOBY_LOOP_STEPS;
    }
    const toby: TobyPose = findTobyPose(step);
    const facing: PlayerMotion = createMotion(
      { x: toby.x, z: toby.z - 1 },
      0,
    );
    expect(describePrompt(EN, facing, step)).toBe(
      'Press Space to talk to Toby',
    );
    expect(describeSpaceKey(EN, facing, step)).toBe('talk to Toby');
    const zhTw: Translator = await createTranslator('zh-TW');
    expect(describePrompt(zhTw, facing, step)).toBe('按空白鍵與托比交談');
    const zhCn: Translator = await createTranslator('zh-CN');
    expect(describePrompt(zhCn, facing, step)).toBe('按空格键与托比交谈');
    const ja: Translator = await createTranslator('ja');
    expect(describePrompt(ja, facing, step)).toBe('スペースキーでトビーと話す');
    // Once he has run off, the space bar slashes.
    const gone: number = step + TOBY_LOOP_STEPS / 2;
    expect(findTobyPose(gone).x).not.toBe(toby.x);
    expect(describePrompt(EN, facing, gone)).toBeNull();
  });
});
