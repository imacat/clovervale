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
  CAVE_CONTAINERS,
  CAVE_PASSAGE,
  CAVE_ROPE,
  CLOVER_PATCHES,
  FOUNTAIN_RIM_RADIUS,
  INVENTORY_SIZE,
  PLAYER_RADIUS,
  PLAZA_CENTRE,
  TALK_REACH,
  TOBY_LOOP_STEPS,
  VILLAGERS,
  VILLAGE_TERRAIN,
  applyInput,
  createMotion,
  findPlacement,
  findTobyPose,
  findTurn,
  killMotion,
  locateVillager,
  stepMotion,
  turnVector,
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

  it('tells a player by Emma, facing her, that it can talk to her', async () => {
    expect(describePrompt(EN, BY_EMMA, 0)).toBe(
      'Press Space to talk to Blacksmith Emma',
    );
    expect(describeSpaceKey(EN, BY_EMMA, 0)).toBe('talk to Blacksmith Emma');
    const zhTw: Translator = await createTranslator('zh-TW');
    expect(describePrompt(zhTw, BY_EMMA, 0)).toBe('按空白鍵與鐵匠艾瑪交談');
    const zhCn: Translator = await createTranslator('zh-CN');
    expect(describePrompt(zhCn, BY_EMMA, 0)).toBe('按空格键与铁匠艾玛交谈');
    const ja: Translator = await createTranslator('ja');
    expect(describePrompt(ja, BY_EMMA, 0)).toBe(
      'スペースキーで鍛冶屋のエマと話す',
    );
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
    expect(describePrompt(EN, BY_PATCH, 0, WITH_CLOVER, [])).toBe(
      'Press Space to pick up the four-leaved clover',
    );
    expect(describeSpaceKey(EN, BY_PATCH, 0, WITH_CLOVER, [])).toBe(
      'pick up the four-leaved clover',
    );
    const zhTw: Translator = await createTranslator('zh-TW');
    expect(describePrompt(zhTw, BY_PATCH, 0, WITH_CLOVER, [])).toBe(
      '按空白鍵拾取四葉幸運草',
    );
    const zhCn: Translator = await createTranslator('zh-CN');
    expect(describePrompt(zhCn, BY_PATCH, 0, WITH_CLOVER, [])).toBe(
      '按空格键拾取四叶幸运草',
    );
    const ja: Translator = await createTranslator('ja');
    expect(describePrompt(ja, BY_PATCH, 0, WITH_CLOVER, [])).toBe(
      'スペースキーで四つ葉のクローバーを拾う',
    );
  });

  it('tells the player its inventory is full, in every language', async () => {
    expect(describePrompt(EN, BY_PATCH, 0, WITH_CLOVER, FULL)).toBe(
      'Your inventory is full, so you cannot pick up the four-leaved clover',
    );
    expect(describeSpaceKey(EN, BY_PATCH, 0, WITH_CLOVER, FULL)).toBe(
      'nothing, as the inventory is full',
    );
    const zhTw: Translator = await createTranslator('zh-TW');
    expect(describePrompt(zhTw, BY_PATCH, 0, WITH_CLOVER, FULL)).toBe(
      '物品欄已滿，無法拾取四葉幸運草',
    );
    const zhCn: Translator = await createTranslator('zh-CN');
    expect(describePrompt(zhCn, BY_PATCH, 0, WITH_CLOVER, FULL)).toBe(
      '物品栏已满，无法拾取四叶幸运草',
    );
    const ja: Translator = await createTranslator('ja');
    expect(describePrompt(ja, BY_PATCH, 0, WITH_CLOVER, FULL)).toBe(
      '持ち物がいっぱいで四つ葉のクローバーを拾えない',
    );
  });

  it('tells nothing once the clover is gone, as the space bar slashes', () => {
    const bare: WorldItems = { clovers: [], items: [] };
    expect(describePrompt(EN, BY_PATCH, 0, bare, [])).toBeNull();
    expect(describeSpaceKey(EN, BY_PATCH, 0, bare, [])).toBe('slash');
  });

  it('tells the player it can pick up a clover on the ground', () => {
    const world: WorldItems = {
      clovers: [],
      items: [{ id: 3, kind: 'clover', x: PATCH.x, z: PATCH.z + 0.5 }],
    };
    expect(describePrompt(EN, BY_PATCH, 0, world, [])).toBe(
      'Press Space to pick up the four-leaved clover',
    );
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
          describePrompt(EN, createMotion(at, yaw), 0, world, []),
          `${String(dx)}, ${String(dz)} facing ${String(yaw)}`,
        ).toBe('Press Space to pick up the four-leaved clover');
      }
    }
  });

  it('tells nothing while the player cannot interact', () => {
    expect(
      describePrompt(EN, killMotion(BY_PATCH), 0, WITH_CLOVER, []),
    ).toBeNull();
  });

  it('tells a player by the fountain to drink before it picks', () => {
    const world: WorldItems = {
      clovers: [],
      items: [
        { id: 1, kind: 'clover', x: BY_FOUNTAIN.x, z: BY_FOUNTAIN.z - 0.3 },
      ],
    };
    expect(describePrompt(EN, BY_FOUNTAIN, 0, world, [])).toBe(
      'Press Space to drink from the fountain',
    );
  });
});

describe('describePrompt by the ways into and out of the cave', () => {
  /** The middle of the burrow of the wild dog. */
  const BURROW: GroundVector = findPlacement('prop-spawn-stones.glb');

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
      describePrompt(translator, motion, 0, none, [], map, monsters),
      describeSpaceKey(translator, motion, 0, none, [], map, monsters),
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
  });

  it('tells nothing of the rope on the same spot in the village', () => {
    expect(describeBoth(EN, BY_ROPE, 'village')).toEqual([null, 'slash']);
  });
});

describe('describePrompt in the cave', () => {
  /** The prisoner in the north cell. */
  const envoy = VILLAGERS.find(({ id }) => id === 'envoy');

  /** Where he stands, behind the bars. */
  const at: GroundVector =
    envoy === undefined ? { x: NaN, z: NaN } : locateVillager(envoy, 0);

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
   * Finds the first container of a kind that holds something, or none.
   *
   * @param {'chest' | 'barrel'} kind - The kind of container.
   * @param {boolean} isFull - Whether it holds something.
   * @returns {CaveContainer} The container.
   * @throws {Error} If there is none.
   */
  function findContainer(
    kind: 'chest' | 'barrel',
    isFull: boolean,
  ): CaveContainer {
    const found: CaveContainer | undefined = CAVE_CONTAINERS.find(
      (container: CaveContainer) =>
        container.kind === kind && (container.item !== null) === isFull,
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
      describePrompt(translator, motion, 0, world, carried, 'cave'),
      describeSpaceKey(translator, motion, 0, world, carried, 'cave'),
    ];
  }

  it('tells a player at the bars it can talk to the prisoner, in every language', async () => {
    expect(describeBoth(EN, AT_BARS)).toEqual([
      'Press Space to talk to Prisoner',
      'talk to Prisoner',
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
  });

  it('tells a player before a full chest it can open it, in every language', async () => {
    const before: PlayerMotion = standBefore(findContainer('chest', true));
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
  });

  it('tells a player with a full inventory it can take nothing', async () => {
    const before: PlayerMotion = standBefore(findContainer('barrel', true));
    expect(describeBoth(EN, before, [], FULL)).toEqual([
      'Your inventory is full, so you cannot take anything from the barrel',
      'nothing, as the inventory is full',
    ]);
    expect(
      describeBoth(await createTranslator('zh-TW'), before, [], FULL),
    ).toEqual(['物品欄已滿，無法從木桶拿取物品', '無（物品欄已滿）']);
  });

  it('tells a player an empty or looted container is empty, in every language', async () => {
    const empty: PlayerMotion = standBefore(findContainer('barrel', false));
    const looted: PlayerMotion = standBefore(findContainer('chest', true));
    expect(describeBoth(EN, empty)).toEqual([
      'The barrel is empty',
      'nothing, as the barrel is empty',
    ]);
    expect(describeBoth(EN, looted, ALL_LOOTED, FULL)).toEqual([
      'The chest is empty',
      'nothing, as the chest is empty',
    ]);
    expect(describeBoth(await createTranslator('zh-TW'), empty)).toEqual([
      '木桶是空的',
      '無（木桶是空的）',
    ]);
    expect(describeBoth(await createTranslator('zh-CN'), empty)).toEqual([
      '木桶是空的',
      '无（木桶是空的）',
    ]);
    expect(describeBoth(await createTranslator('ja'), empty)).toEqual([
      '樽は空っぽだ',
      'なし（樽は空っぽ）',
    ]);
  });

  it('names the new items it picks up from the ground', async () => {
    const motion: PlayerMotion = createMotion({ x: 9.25, z: 0 }, 0);
    const world = (kind: ItemKindId): WorldItems => ({
      clovers: [],
      items: [{ id: 1, kind, x: 9.25, z: 0.6 }],
    });
    expect(describePrompt(EN, motion, 0, world('sword'), [], 'cave')).toBe(
      'Press Space to pick up the short sword',
    );
    expect(
      describePrompt(EN, motion, 0, world('leather-armour'), [], 'cave'),
    ).toBe('Press Space to pick up the leather armour');
    const zhTw: Translator = await createTranslator('zh-TW');
    expect(describePrompt(zhTw, motion, 0, world('sword'), [], 'cave')).toBe(
      '按空白鍵拾取短劍',
    );
    expect(
      describePrompt(zhTw, motion, 0, world('leather-armour'), [], 'cave'),
    ).toBe('按空白鍵拾取皮甲');
  });
});
