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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/23
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/tests/space-words Tests for telling what the space bar
 *   does.
 */

import { describe, expect, it } from 'vitest';

import {
  CAVE_CONTAINERS,
  CAVE_PASSAGE,
  CLOVER_PATCHES,
  FOUNTAIN_RIM_RADIUS,
  INVENTORY_SIZE,
  NO_WORLD_ITEMS,
  PLAYER_RADIUS,
  PLAZA_CENTRE,
  TOBY_LOOP_STEPS,
  VILLAGERS,
  VILLAGE_TERRAIN,
  applyInput,
  createMotion,
  findPlacement,
  findTobyPose,
  locateVillager,
  stepMotion,
} from '@clovervale/shared';
import type {
  CaveContainer,
  GroundVector,
  ItemKindId,
  MonsterState,
  Placement,
  PlayerMotion,
  TobyPose,
  WorldItems,
} from '@clovervale/shared';
import { CAVE_ROPE } from '../../shared/src/cave.ts';
import { TALK_REACH } from '../../shared/src/interaction.ts';
import { killMotion } from '../../shared/src/player-motion.ts';
import { findTurn, turnVector } from '../../shared/src/terrain.ts';

import { findSpaceAction } from '../src/space-action.ts';
import type { SpaceAction, SpaceContext } from '../src/space-action.ts';
import { describePrompt, describeSpaceKey } from '../src/space-words.ts';
import { Translator } from '../src/translator.ts';

/** A translator of the text into English. */
const EN = new Translator();

/**
 * Works out what the space bar makes a player do, at the first step, with
 * nothing to pick and nothing carried, in the village and without monsters,
 * unless told otherwise.
 *
 * @param {PlayerMotion} motion - The motion of the player.
 * @param {Partial<SpaceContext>} [context] - What differs from that.
 * @returns {SpaceAction} What the player does.
 */
function findAction(
  motion: PlayerMotion,
  context: Partial<SpaceContext> = {},
): SpaceAction {
  return findSpaceAction({
    step: 0,
    world: NO_WORLD_ITEMS,
    inventory: [],
    map: 'village',
    monsters: [],
    ...context,
    motion,
  });
}

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
    x: findPlacement('nancy').x,
    z: findPlacement('nancy').z + TALK_REACH - 0.1,
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
  const emma: Placement = findPlacement('emma');
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
  const martha: Placement = findPlacement('martha');
  const front: GroundVector = turnVector({ x: 0, z: 1 }, findTurn(martha.yaw));
  return createMotion(
    { x: martha.x + front.x * 0.8, z: martha.z + front.z * 0.8 },
    martha.yaw + 180,
  );
}

/**
 * Makes a translator of the text into a language.
 *
 * @param {'zh-TW' | 'zh-CN' | 'ja' | 'es'} code - The language.
 * @returns {Promise<Translator>} The translator.
 */
async function createTranslator(
  code: 'zh-TW' | 'zh-CN' | 'ja' | 'es',
): Promise<Translator> {
  const translator = new Translator();
  await translator.choose(code);
  return translator;
}

describe('describePrompt', () => {
  it('tells a player by the fountain, facing it, that it can drink', () => {
    expect(
      describePrompt(EN, findAction(BY_FOUNTAIN), [], false),
    ).toBe('Press Space to drink from the fountain');
  });

  it('tells a player by Nancy, facing her, that it can talk to her', () => {
    expect(
      describePrompt(EN, findAction(BY_NANCY), [], false),
    ).toBe('Press Space to talk to Nancy');
  });

  it('tells a player by Martha, facing her, that it can talk to her', async () => {
    const byMartha: PlayerMotion = standByMartha();
    expect(
      describePrompt(EN, findAction(byMartha), [], false),
    ).toBe('Press Space to talk to Chief Martha');
    expect(
      describeSpaceKey(EN, findAction(byMartha)),
    ).toBe('talk to Chief Martha');
    const zhTw: Translator = await createTranslator('zh-TW');
    expect(
      describePrompt(zhTw, findAction(byMartha), [], false),
    ).toBe('按空白鍵與村長瑪莎交談');
    const zhCn: Translator = await createTranslator('zh-CN');
    expect(
      describePrompt(zhCn, findAction(byMartha), [], false),
    ).toBe('按空格键与村长玛莎交谈');
    const ja: Translator = await createTranslator('ja');
    expect(
      describePrompt(ja, findAction(byMartha), [], false),
    ).toBe('スペースキーで村長マーサと話す');
    const es: Translator = await createTranslator('es');
    expect(
      describePrompt(es, findAction(byMartha), [], false),
    ).toBe('Presiona Espacio para hablar con la alcaldesa Marta');
  });

  it('tells it in the language of the page, in its word order', async () => {
    const zhTw: Translator = await createTranslator('zh-TW');
    expect(
      describePrompt(zhTw, findAction(BY_NANCY), [], false),
    ).toBe('按空白鍵與南茜交談');
    expect(
      describePrompt(zhTw, findAction(BY_FOUNTAIN), [], false),
    ).toBe('按空白鍵喝噴泉的水');
    const zhCn: Translator = await createTranslator('zh-CN');
    expect(
      describePrompt(zhCn, findAction(BY_NANCY), [], false),
    ).toBe('按空格键与南茜交谈');
    const ja: Translator = await createTranslator('ja');
    expect(
      describePrompt(ja, findAction(BY_NANCY), [], false),
    ).toBe('スペースキーでナンシーと話す');
    const es: Translator = await createTranslator('es');
    expect(
      describePrompt(es, findAction(BY_NANCY), [], false),
    ).toBe('Presiona Espacio para hablar con Nancy');
    expect(
      describePrompt(es, findAction(BY_FOUNTAIN), [], false),
    ).toBe('Presiona Espacio para beber de la fuente');
  });

  it('tells a player by Emma, facing her, that it can talk to her', async () => {
    expect(
      describePrompt(EN, findAction(BY_EMMA), [], false),
    ).toBe('Press Space to talk to Blacksmith Emma');
    expect(
      describeSpaceKey(EN, findAction(BY_EMMA)),
    ).toBe('talk to Blacksmith Emma');
    const zhTw: Translator = await createTranslator('zh-TW');
    expect(
      describePrompt(zhTw, findAction(BY_EMMA), [], false),
    ).toBe('按空白鍵與鐵匠艾瑪交談');
    const zhCn: Translator = await createTranslator('zh-CN');
    expect(
      describePrompt(zhCn, findAction(BY_EMMA), [], false),
    ).toBe('按空格键与铁匠艾玛交谈');
    const ja: Translator = await createTranslator('ja');
    expect(
      describePrompt(ja, findAction(BY_EMMA), [], false),
    ).toBe('スペースキーで鍛冶屋のエマと話す');
    const es: Translator = await createTranslator('es');
    expect(
      describePrompt(es, findAction(BY_EMMA), [], false),
    ).toBe('Presiona Espacio para hablar con Emma la herrera');
  });

  it('tells nothing while the player talks already', () => {
    const talking: PlayerMotion = stepMotion(
      applyInput(BY_NANCY, { type: 'interact' }),
      0,
      'village',
      [],
    );
    expect(talking.action).toBe('Talk');
    expect(describePrompt(EN, findAction(talking), [], false)).toBeNull();
  });

  it('tells nothing while the space bar makes the player slash', () => {
    expect(describePrompt(EN, findAction(FACING_AWAY), [], false)).toBeNull();
  });

  it('tells nothing while the player drinks already', () => {
    const drinking: PlayerMotion = stepMotion(
      applyInput(BY_FOUNTAIN, { type: 'interact' }),
      0,
      'village',
      [],
    );
    expect(drinking.action).toBe('Drink');
    expect(describePrompt(EN, findAction(drinking), [], false)).toBeNull();
  });

  it('tells nothing to a dead player, or without a player', () => {
    expect(
      describePrompt(EN, findAction(killMotion(BY_FOUNTAIN)), [], false),
    ).toBeNull();
    expect(describePrompt(EN, null, [], false)).toBeNull();
  });
});

describe('describePrompt on a touch device', () => {
  /**
   * Words the prompt for a player as a touch device shows it.
   *
   * @param {Translator} translator - The translator of the text.
   * @param {PlayerMotion} motion - The player.
   * @returns {string | null} The prompt.
   */
  function describeOnTouch(
    translator: Translator,
    motion: PlayerMotion,
  ): string | null {
    return describePrompt(translator, findAction(motion), [], true);
  }

  it('tells of the action button rather than the space bar', async () => {
    expect(describeOnTouch(EN, BY_NANCY)).toBe(
      'Tap the action button to talk to Nancy',
    );
    expect(describeOnTouch(EN, BY_FOUNTAIN)).toBe(
      'Tap the action button to drink from the fountain',
    );
    const zhTw: Translator = await createTranslator('zh-TW');
    expect(describeOnTouch(zhTw, BY_NANCY)).toBe('點動作按鈕與南茜交談');
    const zhCn: Translator = await createTranslator('zh-CN');
    expect(describeOnTouch(zhCn, BY_NANCY)).toBe('点动作按钮与南茜交谈');
    const ja: Translator = await createTranslator('ja');
    expect(describeOnTouch(ja, BY_NANCY)).toBe(
      'アクションボタンでナンシーと話す',
    );
    const es: Translator = await createTranslator('es');
    expect(describeOnTouch(es, BY_NANCY)).toBe(
      'Toca el botón de acción para hablar con Nancy',
    );
  });

  it('tells nothing while the action button makes the player slash', () => {
    expect(describeOnTouch(EN, FACING_AWAY)).toBeNull();
  });
});

describe('describeSpaceKey', () => {
  it('tells what the space bar makes the player do', () => {
    expect(describeSpaceKey(EN, findAction(BY_FOUNTAIN))).toBe(
      'drink from the fountain',
    );
    expect(describeSpaceKey(EN, findAction(FACING_AWAY))).toBe('slash');
    expect(describeSpaceKey(EN, findAction(BY_NANCY))).toBe('talk to Nancy');
  });

  it('tells it in the language of the page', async () => {
    const zhTw: Translator = await createTranslator('zh-TW');
    expect(describeSpaceKey(zhTw, findAction(BY_NANCY))).toBe('與南茜交談');
    expect(describeSpaceKey(zhTw, findAction(FACING_AWAY))).toBe('揮砍');
    expect(
      describeSpaceKey(zhTw, findAction(killMotion(BY_FOUNTAIN))),
    ).toBe('無');
    const ja: Translator = await createTranslator('ja');
    expect(describeSpaceKey(ja, findAction(BY_NANCY))).toBe('ナンシーと話す');
    const es: Translator = await createTranslator('es');
    expect(describeSpaceKey(es, findAction(BY_NANCY))).toBe('hablar con Nancy');
    expect(describeSpaceKey(es, findAction(FACING_AWAY))).toBe('dar un tajo');
  });

  it('tells that it does nothing while the player cannot interact', () => {
    expect(
      describeSpaceKey(EN, findAction(killMotion(BY_FOUNTAIN))),
    ).toBe('nothing');
  });

  it('tells nothing is known without a player', () => {
    expect(describeSpaceKey(EN, null)).toBe('–');
  });
});

describe('describePrompt by Toby', () => {
  it('names him where he is at the step, in every language', async () => {
    let step = 0;
    while (findTobyPose(step).activity !== 'Pick') {
      step = (step + 1) % TOBY_LOOP_STEPS;
    }
    const toby: TobyPose = findTobyPose(step);
    const facing: PlayerMotion = createMotion({ x: toby.x, z: toby.z - 1 }, 0);
    expect(
      describePrompt(EN, findAction(facing, { step }), [], false),
    ).toBe('Press Space to talk to Toby');
    expect(
      describeSpaceKey(EN, findAction(facing, { step })),
    ).toBe('talk to Toby');
    const zhTw: Translator = await createTranslator('zh-TW');
    expect(
      describePrompt(zhTw, findAction(facing, { step }), [], false),
    ).toBe('按空白鍵與托比交談');
    const zhCn: Translator = await createTranslator('zh-CN');
    expect(
      describePrompt(zhCn, findAction(facing, { step }), [], false),
    ).toBe('按空格键与托比交谈');
    const ja: Translator = await createTranslator('ja');
    expect(
      describePrompt(ja, findAction(facing, { step }), [], false),
    ).toBe('スペースキーでトビーと話す');
    const es: Translator = await createTranslator('es');
    expect(
      describePrompt(es, findAction(facing, { step }), [], false),
    ).toBe('Presiona Espacio para hablar con Tobi');
    // Once he has run off, the space bar slashes.
    const gone: number = step + TOBY_LOOP_STEPS / 2;
    expect(findTobyPose(gone).x).not.toBe(toby.x);
    expect(
      describePrompt(EN, findAction(facing, { step: gone }), [], false),
    ).toBeNull();
  });
});

describe('describePrompt by a patch of clover', () => {
  /** Where the patch of clover east of the fountain is. */
  const PATCH: GroundVector = CLOVER_PATCHES[6] ?? { x: NaN, z: NaN };

  /** A player south of that patch, facing it. */
  const BY_PATCH: PlayerMotion = createMotion(
    { x: PATCH.x, z: PATCH.z + 1 },
    180,
  );

  /** The world with the clover of that patch to pick. */
  const WITH_CLOVER: WorldItems = { clovers: [6], items: [] };

  /** A full inventory. */
  const FULL: ItemKindId[] = new Array<ItemKindId>(INVENTORY_SIZE).fill(
    'clover',
  );

  it('tells the player it can pick the clover, in every language', async () => {
    expect(
      describePrompt(
        EN,
        findAction(BY_PATCH, { world: WITH_CLOVER }),
        [],
        false,
      ),
    ).toBe('Press Space to pick up the four-leaved clover');
    expect(
      describeSpaceKey(EN, findAction(BY_PATCH, { world: WITH_CLOVER })),
    ).toBe(
      'pick up the four-leaved clover',
    );
    const zhTw: Translator = await createTranslator('zh-TW');
    expect(
      describePrompt(
        zhTw,
        findAction(BY_PATCH, { world: WITH_CLOVER }),
        [],
        false,
      ),
    ).toBe('按空白鍵拾取四葉幸運草');
    const zhCn: Translator = await createTranslator('zh-CN');
    expect(
      describePrompt(
        zhCn,
        findAction(BY_PATCH, { world: WITH_CLOVER }),
        [],
        false,
      ),
    ).toBe('按空格键拾取四叶幸运草');
    const ja: Translator = await createTranslator('ja');
    expect(
      describePrompt(
        ja,
        findAction(BY_PATCH, { world: WITH_CLOVER }),
        [],
        false,
      ),
    ).toBe('スペースキーで四つ葉のクローバーを拾う');
    const es: Translator = await createTranslator('es');
    expect(
      describePrompt(
        es,
        findAction(BY_PATCH, { world: WITH_CLOVER }),
        [],
        false,
      ),
    ).toBe('Presiona Espacio para recoger el trébol de cuatro hojas');
  });

  it('tells the player its inventory is full, in every language', async () => {
    expect(
      describePrompt(
        EN,
        findAction(BY_PATCH, { world: WITH_CLOVER, inventory: FULL }),
        [],
        false,
      ),
    ).toBe(
      'Your inventory is full, so you cannot pick up the four-leaved clover',
    );
    expect(
      describeSpaceKey(
        EN,
        findAction(BY_PATCH, { world: WITH_CLOVER, inventory: FULL }),
      ),
    ).toBe(
      'nothing, as the inventory is full',
    );
    const zhTw: Translator = await createTranslator('zh-TW');
    expect(
      describePrompt(
        zhTw,
        findAction(BY_PATCH, { world: WITH_CLOVER, inventory: FULL }),
        [],
        false,
      ),
    ).toBe('物品欄已滿，無法拾取四葉幸運草');
    const zhCn: Translator = await createTranslator('zh-CN');
    expect(
      describePrompt(
        zhCn,
        findAction(BY_PATCH, { world: WITH_CLOVER, inventory: FULL }),
        [],
        false,
      ),
    ).toBe('物品栏已满，无法拾取四叶幸运草');
    const ja: Translator = await createTranslator('ja');
    expect(
      describePrompt(
        ja,
        findAction(BY_PATCH, { world: WITH_CLOVER, inventory: FULL }),
        [],
        false,
      ),
    ).toBe('持ち物がいっぱいで四つ葉のクローバーを拾えない');
    const es: Translator = await createTranslator('es');
    expect(
      describePrompt(
        es,
        findAction(BY_PATCH, { world: WITH_CLOVER, inventory: FULL }),
        [],
        false,
      ),
    ).toBe(
      'Tu inventario está lleno: no puedes recoger el trébol de cuatro hojas',
    );
  });

  it('tells nothing once the clover is gone, as the space bar slashes', () => {
    const bare: WorldItems = { clovers: [], items: [] };
    expect(
      describePrompt(EN, findAction(BY_PATCH, { world: bare }), [], false),
    ).toBeNull();
    expect(
      describeSpaceKey(EN, findAction(BY_PATCH, { world: bare })),
    ).toBe('slash');
  });

  it('tells the player it can pick up a clover on the ground', () => {
    const world: WorldItems = {
      clovers: [],
      items: [{ id: 3, kind: 'clover', x: PATCH.x, z: PATCH.z + 0.5 }],
    };
    expect(
      describePrompt(EN, findAction(BY_PATCH, { world }), [], false),
    ).toBe('Press Space to pick up the four-leaved clover');
  });

  it('tells the player it can pick up a clover at its feet, facing any way', () => {
    const at: GroundVector = { x: BY_PATCH.x, z: BY_PATCH.z };
    for (const [dx, dz] of [
      [0.003, 0],
      [-0.003, 0],
      [0, 0.004],
      [0, -0.004],
      [0.002, -0.003],
    ] as const) {
      const world: WorldItems = {
        clovers: [],
        items: [{ id: 3, kind: 'clover', x: at.x + dx, z: at.z + dz }],
      };
      for (const yaw of [0, 90, 180, 270]) {
        expect(
          describePrompt(
            EN,
            findAction(createMotion(at, yaw), { world }),
            [],
            false,
          ),
          `${String(dx)}, ${String(dz)} facing ${String(yaw)}`,
        ).toBe('Press Space to pick up the four-leaved clover');
      }
    }
  });

  it('tells nothing while the player cannot interact', () => {
    expect(
      describePrompt(
        EN,
        findAction(killMotion(BY_PATCH), { world: WITH_CLOVER }),
        [],
        false,
      ),
    ).toBeNull();
  });

  it('tells a player by the fountain to drink before it picks', () => {
    const world: WorldItems = {
      clovers: [],
      items: [
        { id: 1, kind: 'clover', x: BY_FOUNTAIN.x, z: BY_FOUNTAIN.z - 0.3 },
      ],
    };
    expect(
      describePrompt(EN, findAction(BY_FOUNTAIN, { world }), [], false),
    ).toBe('Press Space to drink from the fountain');
  });
});

describe('describePrompt by the ways into and out of the cave', () => {
  /** The middle of the burrow of the wild dog. */
  const BURROW: GroundVector = findPlacement('spawn-stones');

  /** A player in the burrow, facing north. */
  const IN_BURROW: PlayerMotion = createMotion(BURROW, 180);

  /** A player in the cave by the rope, facing it. */
  const BY_ROPE: PlayerMotion = createMotion(
    { x: CAVE_ROPE.x + 0.8, z: CAVE_ROPE.z },
    -90,
  );

  /** The wild dog, alive, a metre in front of a player in the burrow. */
  const DOG: MonsterState = {
    id: 1,
    kind: 'village-dog',
    x: BURROW.x,
    z: BURROW.z - 1,
    yaw: 0,
    action: 'Idle',
    actionCount: 0,
    health: 60,
    mode: 'idle',
  };

  /**
   * Words the prompt and the space key of a player in a map without
   * anything to pick, in a language.
   *
   * @param {Translator} translator - The translator.
   * @param {PlayerMotion} motion - The player.
   * @param {'village' | 'cave'} map - The map it is in.
   * @param {readonly MonsterState[]} monsters - The monsters there.
   * @returns {[string | null, string]} The prompt, and the space key.
   */
  function describeBoth(
    translator: Translator,
    motion: PlayerMotion,
    map: 'village' | 'cave',
    monsters: readonly MonsterState[] = [],
  ): [string | null, string] {
    const none: WorldItems = { clovers: [], items: [] };
    return [
      describePrompt(
        translator,
        findAction(motion, { world: none, map, monsters }),
        [],
        false,
      ),
      describeSpaceKey(
        translator,
        findAction(motion, { world: none, map, monsters }),
      ),
    ];
  }

  it('tells a player in the burrow it can go down, in every language', async () => {
    expect(describeBoth(EN, IN_BURROW, 'village')).toEqual([
      'Press Space to go down the burrow',
      'go down the burrow',
    ]);
    expect(
      describeBoth(await createTranslator('zh-TW'), IN_BURROW, 'village'),
    ).toEqual(['按空白鍵鑽進巢穴', '鑽進巢穴']);
    expect(
      describeBoth(await createTranslator('zh-CN'), IN_BURROW, 'village'),
    ).toEqual(['按空格键钻进巢穴', '钻进巢穴']);
    expect(
      describeBoth(await createTranslator('ja'), IN_BURROW, 'village'),
    ).toEqual(['スペースキーで巣穴に潜る', '巣穴に潜る']);
    expect(
      describeBoth(await createTranslator('es'), IN_BURROW, 'village'),
    ).toEqual([
      'Presiona Espacio para bajar por la madriguera',
      'bajar por la madriguera',
    ]);
  });

  it('tells a player in the burrow it slashes at the living dog in front', () => {
    expect(describeBoth(EN, IN_BURROW, 'village', [DOG])).toEqual([
      null,
      'slash',
    ]);
  });

  it('tells a player by the rope it can climb up, in every language', async () => {
    expect(describeBoth(EN, BY_ROPE, 'cave')).toEqual([
      'Press Space to climb up the rope',
      'climb up the rope',
    ]);
    expect(
      describeBoth(await createTranslator('zh-TW'), BY_ROPE, 'cave'),
    ).toEqual(['按空白鍵順著繩子爬上去', '順著繩子爬上去']);
    expect(
      describeBoth(await createTranslator('zh-CN'), BY_ROPE, 'cave'),
    ).toEqual(['按空格键顺着绳子爬上去', '顺着绳子爬上去']);
    expect(describeBoth(await createTranslator('ja'), BY_ROPE, 'cave')).toEqual(
      ['スペースキーでロープを登る', 'ロープを登る'],
    );
    expect(describeBoth(await createTranslator('es'), BY_ROPE, 'cave')).toEqual(
      ['Presiona Espacio para subir por la cuerda', 'subir por la cuerda'],
    );
  });

  it('tells nothing of the rope on the same spot in the village', () => {
    expect(describeBoth(EN, BY_ROPE, 'village')).toEqual([null, 'slash']);
  });
});

describe('describePrompt in the cave', () => {
  /** The prisoner in the north cell. */
  const edwin = VILLAGERS.find(({ id }) => id === 'edwin');

  /** Where he stands, behind the bars. */
  const at: GroundVector =
    edwin === undefined ? { x: NaN, z: NaN } : locateVillager(edwin, 0, []);

  /** A player at the bars of his cell, before him, facing him. */
  const AT_BARS: PlayerMotion = createMotion(
    { x: at.x, z: CAVE_PASSAGE.north + PLAYER_RADIUS + 0.1 },
    180,
  );

  /** A full inventory. */
  const FULL: ItemKindId[] = new Array<ItemKindId>(INVENTORY_SIZE).fill(
    'clover',
  );

  /** The numbers of every container, as if all had been looted. */
  const ALL_LOOTED: number[] = CAVE_CONTAINERS.map((_, id: number) => id);

  /**
   * Finds the first container of a kind.
   *
   * @param {'chest' | 'barrel'} kind - The kind of container.
   * @returns {CaveContainer} The container.
   * @throws {Error} If there is none.
   */
  function findContainer(kind: 'chest' | 'barrel'): CaveContainer {
    const found: CaveContainer | undefined = CAVE_CONTAINERS.find(
      (container: CaveContainer) => container.kind === kind,
    );
    if (found === undefined) {
      throw new Error(`There is no such ${kind}.`);
    }
    return found;
  }

  /**
   * Makes a player in front of a container, close by it, facing it.
   *
   * @param {CaveContainer} container - The container.
   * @returns {PlayerMotion} The player.
   */
  function standBefore(container: CaveContainer): PlayerMotion {
    const yaw: number = (container.yaw * Math.PI) / 180;
    return createMotion(
      {
        x: container.x + Math.sin(yaw) * 0.75,
        z: container.z + Math.cos(yaw) * 0.75,
      },
      container.yaw + 180,
    );
  }

  /**
   * Words the prompt and the space key of a player in the cave, in a
   * language.
   *
   * @param {Translator} translator - The translator.
   * @param {PlayerMotion} motion - The player.
   * @param {readonly number[]} [looted] - The containers looted, none by
   *   default.
   * @param {readonly ItemKindId[]} [carried] - What the player carries,
   *   nothing by default.
   * @returns {[string | null, string]} The prompt, and the space key.
   */
  function describeBoth(
    translator: Translator,
    motion: PlayerMotion,
    looted: readonly number[] = [],
    carried: readonly ItemKindId[] = [],
  ): [string | null, string] {
    const world: WorldItems = { clovers: [], items: [], looted };
    return [
      describePrompt(
        translator,
        findAction(motion, { world, inventory: carried, map: 'cave' }),
        [],
        false,
      ),
      describeSpaceKey(
        translator,
        findAction(motion, { world, inventory: carried, map: 'cave' }),
      ),
    ];
  }

  it('tells a player at the bars it can talk to the prisoner, in every language', async () => {
    expect(describeBoth(EN, AT_BARS)).toEqual([
      'Press Space to talk to the prisoner',
      'talk to the prisoner',
    ]);
    expect(describeBoth(await createTranslator('zh-TW'), AT_BARS)).toEqual([
      '按空白鍵與囚犯交談',
      '與囚犯交談',
    ]);
    expect(describeBoth(await createTranslator('zh-CN'), AT_BARS)).toEqual([
      '按空格键与囚犯交谈',
      '与囚犯交谈',
    ]);
    expect(describeBoth(await createTranslator('ja'), AT_BARS)).toEqual([
      'スペースキーで囚人と話す',
      '囚人と話す',
    ]);
    expect(describeBoth(await createTranslator('es'), AT_BARS)).toEqual([
      'Presiona Espacio para hablar con el prisionero',
      'hablar con el prisionero',
    ]);
  });

  it('tells a player at the bars it slashes at a living dog in front', () => {
    const turned: PlayerMotion = { ...AT_BARS, yaw: 135 };
    const dog: MonsterState = {
      id: 1,
      kind: 'cave-dog',
      x: turned.x + 1,
      z: turned.z,
      yaw: -90,
      action: 'Idle',
      actionCount: 0,
      health: 80,
      mode: 'chase',
    };
    const world: WorldItems = { clovers: [], items: [], looted: [] };
    expect(
      describeSpaceKey(EN, findAction(turned, { world, map: 'cave' })),
    ).toBe(
      'talk to the prisoner',
    );
    expect([
      describePrompt(
        EN,
        findAction(turned, { world, map: 'cave', monsters: [dog] }),
        [],
        false,
      ),
      describeSpaceKey(
        EN,
        findAction(turned, { world, map: 'cave', monsters: [dog] }),
      ),
    ]).toEqual([null, 'slash']);
  });

  it('calls the prisoner by his name once he has told it, in every language', async () => {
    const known = ['edwin'] as const;
    const wordBoth = (translator: Translator): [string | null, string] => {
      const world: WorldItems = { clovers: [], items: [], looted: [] };
      return [
        describePrompt(
          translator,
          findAction(AT_BARS, { world, map: 'cave' }),
          known,
          false,
        ),
        describeSpaceKey(
          translator,
          findAction(AT_BARS, { world, map: 'cave' }),
          known,
        ),
      ];
    };
    expect(wordBoth(EN)).toEqual([
      'Press Space to talk to Envoy Edwin',
      'talk to Envoy Edwin',
    ]);
    expect(wordBoth(await createTranslator('zh-TW'))).toEqual([
      '按空白鍵與使者艾德溫交談',
      '與使者艾德溫交談',
    ]);
    expect(wordBoth(await createTranslator('zh-CN'))).toEqual([
      '按空格键与使者艾德温交谈',
      '与使者艾德温交谈',
    ]);
    expect(wordBoth(await createTranslator('ja'))).toEqual([
      'スペースキーで使者エドウィンと話す',
      '使者エドウィンと話す',
    ]);
    expect(wordBoth(await createTranslator('es'))).toEqual([
      'Presiona Espacio para hablar con Edwin el emisario',
      'hablar con Edwin el emisario',
    ]);
  });

  it('tells a player before a full chest it can open it, in every language', async () => {
    const before: PlayerMotion = standBefore(findContainer('chest'));
    expect(describeBoth(EN, before)).toEqual([
      'Press Space to open the chest',
      'open the chest',
    ]);
    expect(describeBoth(await createTranslator('zh-TW'), before)).toEqual([
      '按空白鍵打開寶箱',
      '打開寶箱',
    ]);
    expect(describeBoth(await createTranslator('zh-CN'), before)).toEqual([
      '按空格键打开宝箱',
      '打开宝箱',
    ]);
    expect(describeBoth(await createTranslator('ja'), before)).toEqual([
      'スペースキーで宝箱を開ける',
      '宝箱を開ける',
    ]);
    expect(describeBoth(await createTranslator('es'), before)).toEqual([
      'Presiona Espacio para abrir el cofre',
      'abrir el cofre',
    ]);
  });

  it('tells a player with a full inventory it can take nothing', async () => {
    const before: PlayerMotion = standBefore(findContainer('barrel'));
    expect(describeBoth(EN, before, [], FULL)).toEqual([
      'Your inventory is full, so you cannot take anything from the barrel',
      'nothing, as the inventory is full',
    ]);
    expect(
      describeBoth(await createTranslator('zh-TW'), before, [], FULL),
    ).toEqual(['物品欄已滿，無法從木桶拿取物品', '無（物品欄已滿）']);
  });

  it('tells a player before the barrel of silver coins it can open it, however full its inventory', async () => {
    const barrel: CaveContainer | undefined = CAVE_CONTAINERS.find(
      (container: CaveContainer) => (container.silver ?? 0) > 0,
    );
    if (barrel === undefined) {
      throw new Error('There is no barrel of silver coins.');
    }
    const before: PlayerMotion = standBefore(barrel);
    expect(describeBoth(EN, before, [], FULL)).toEqual([
      'Press Space to open the barrel',
      'open the barrel',
    ]);
    expect(describeBoth(await createTranslator('zh-TW'), before)).toEqual([
      '按空白鍵打開木桶',
      '打開木桶',
    ]);
    expect(describeBoth(EN, before, ALL_LOOTED)).toEqual([
      'The barrel is empty',
      'nothing, as the barrel is empty',
    ]);
  });

  it('tells a player an empty or looted container is empty, in every language', async () => {
    const empty: PlayerMotion = standBefore(findContainer('barrel'));
    const looted: PlayerMotion = standBefore(findContainer('chest'));
    expect(describeBoth(EN, empty, ALL_LOOTED)).toEqual([
      'The barrel is empty',
      'nothing, as the barrel is empty',
    ]);
    expect(describeBoth(EN, looted, ALL_LOOTED, FULL)).toEqual([
      'The chest is empty',
      'nothing, as the chest is empty',
    ]);
    expect(
      describeBoth(await createTranslator('zh-TW'), empty, ALL_LOOTED),
    ).toEqual([
      '木桶是空的',
      '無（木桶是空的）',
    ]);
    expect(
      describeBoth(await createTranslator('zh-CN'), empty, ALL_LOOTED),
    ).toEqual([
      '木桶是空的',
      '无（木桶是空的）',
    ]);
    expect(
      describeBoth(await createTranslator('ja'), empty, ALL_LOOTED),
    ).toEqual([
      '樽は空っぽだ',
      'なし（樽は空っぽ）',
    ]);
    expect(
      describeBoth(await createTranslator('es'), empty, ALL_LOOTED),
    ).toEqual([
      'El barril está vacío',
      'nada, porque el barril está vacío',
    ]);
  });

  it('names the new items it picks up from the ground', async () => {
    const motion: PlayerMotion = createMotion({ x: 9.25, z: 0 }, 0);
    const world = (kind: ItemKindId): WorldItems => ({
      clovers: [],
      items: [{ id: 1, kind, x: 9.25, z: 0.6 }],
    });
    expect(
      describePrompt(
        EN,
        findAction(motion, { world: world('sword'), map: 'cave' }),
        [],
        false,
      ),
    ).toBe('Press Space to pick up the short sword');
    expect(
      describePrompt(
        EN,
        findAction(motion, { world: world('leather-armour'), map: 'cave' }),
        [],
        false,
      ),
    ).toBe('Press Space to pick up the leather armour');
    const zhTw: Translator = await createTranslator('zh-TW');
    expect(
      describePrompt(
        zhTw,
        findAction(motion, { world: world('sword'), map: 'cave' }),
        [],
        false,
      ),
    ).toBe('按空白鍵拾取短劍');
    expect(
      describePrompt(
        zhTw,
        findAction(motion, { world: world('leather-armour'), map: 'cave' }),
        [],
        false,
      ),
    ).toBe('按空白鍵拾取皮甲');
  });
});
