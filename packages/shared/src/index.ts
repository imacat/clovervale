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
 * @module shared/index The public interface of the shared package.
 */

export type { ActionState, MonsterAction } from './actions.ts';
export {
  AuthoritativePlayer,
  INPUT_WAIT_LIMIT,
} from './authoritative-player.ts';
export type { InputProgress, StampedInput } from './authoritative-player.ts';
export {
  SAY_INTERVAL,
  SAY_LENGTH_LIMIT,
  SAY_RANGE,
  cleanSayText,
  isPhraseCode,
} from './chat.ts';
export type { PhraseCode } from './chat.ts';
export {
  DEATH_DURATION,
  MONSTER_KINDS,
  PLAYER_HEALTH,
  SLASH_DAMAGE,
  SLASH_REACH,
  isWithinStrike,
} from './combat.ts';
export type { MonsterKind, MonsterKindId } from './combat.ts';
export {
  DEFAULT_DAY_LENGTH,
  DEFAULT_DAY_ORIGIN,
  NOON,
  findDayPhase,
  findPhaseTime,
  findTimeOfDay,
} from './day-cycle.ts';
export type { DayCycle, DayPhase } from './day-cycle.ts';
export {
  CAVE_CONTAINERS,
  CAVE_CONTAINER_FILES,
  CAVE_DOG_HOMES,
  CAVE_EDWIN_FILE,
  CAVE_FILE,
  CAVE_FLAMES,
  CAVE_FLAME_HEIGHT,
  CAVE_MOUTH,
  CAVE_MOUTH_OUTLINE,
  CAVE_PASSAGE,
  CAVE_PLACEMENTS,
  CAVE_TERRAIN,
  CAVE_TORCH_FILE,
} from './cave.ts';
export type { CaveContainer, CaveContainerFiles } from './cave.ts';
export {
  FOUNTAIN_HEALING,
  FOUNTAIN_REACH,
  findInteraction,
  findPassage,
  findPickTarget,
  findVillager,
} from './interaction.ts';
export type { Passage, PickTarget } from './interaction.ts';
export {
  CLOVER_KIND,
  CLOVER_PATCHES,
  CLOVER_REGROW_DURATION,
  GROUND_ITEM_DURATION,
  HEALING_POTION_PRICE,
  INVENTORY_SIZE,
  NO_WORLD_ITEMS,
  canUseItem,
  findItemKind,
  hasRoom,
  isUsableItem,
} from './items.ts';
export type {
  GroundItem,
  ItemKind,
  ItemKindId,
  WorldItems,
} from './items.ts';
export { DIALOGUE_REPLY_LIMIT } from './dialogue.ts';
export type { DialogueView } from './dialogue.ts';
export { hasQuestWords } from './quests.ts';
export type { QuestId, QuestLog, QuestStage } from './quests.ts';
export { interpolatePlaced, interpolateYaw } from './interpolation.ts';
export {
  SIMULATION_RATE,
  WALK_SPEED,
  findYaw,
  movePosition,
} from './movement.ts';
export type { GroundVector } from './movement.ts';
export {
  WAYPOINT_CLEARANCE,
  findMapPath,
} from './navigation.ts';
export {
  TALK_STEPS,
  applyInput,
  canInteract,
  createMotion,
  isResting,
  stepMotion,
} from './player-motion.ts';
export type { PlayerInput, PlayerMotion, ReplyInput } from './player-motion.ts';
export {
  APPEARANCE_COUNT,
  DEFAULT_SERVER_PORT,
  PROTOCOL_VERSION,
  SNAPSHOT_RATE,
  createEventsMessage,
  createInteractMessage,
  createMapMessage,
  createMoveMessage,
  createPhraseMessage,
  createPhrasedMessage,
  createSaidMessage,
  createSayMessage,
  createSnapshotMessage,
  createSpeechMessage,
  createWelcomeMessage,
  decodeClientMessage,
  decodeServerMessage,
  encodeClientMessage,
  encodeServerMessage,
  isFighting,
} from './protocol.ts';
export type {
  ClientMessage,
  EntityRef,
  EventsMessage,
  GameEvent,
  HealEvent,
  HitEvent,
  MonsterMode,
  MonsterState,
  PlayerState,
  ServerMessage,
  SlashJudgement,
  SnapshotMessage,
} from './protocol.ts';
export { PLAYER_RADIUS, Terrain, placePoint } from './terrain.ts';
export type { Boundary, Pose, Shape } from './terrain.ts';
export {
  TOBY_ACTIVITY_STEPS,
  TOBY_ENDS,
  TOBY_FILE,
  TOBY_FOUND_LINE,
  TOBY_GRAB_STEPS,
  TOBY_LOOP_STEPS,
  TOBY_RADIUS,
  TOBY_RUN_SPEED,
  TOBY_STOW_STEPS,
  findTobyGrab,
  findTobyPose,
  measurePushReach,
  pushAside,
} from './toby.ts';
export type { TobyActivity, TobyGrab, TobyPose } from './toby.ts';
export {
  FOUNTAIN_RIM_RADIUS,
  VILLAGE_PLACEMENTS,
  VILLAGE_TERRAIN,
  PITCHFORK_STAND,
  findPlacement,
} from './village-layout.ts';
export type { Placement } from './village-layout.ts';
export {
  PLAZA_CENTRE,
  SPAWN_POINT_COUNT,
  SPAWN_YAW,
  findSpawnPoint,
} from './village.ts';
export { VILLAGERS, isVillagerFree, locateVillager } from './villagers.ts';
export { findMapTerrain } from './world-map.ts';
export type { MapId } from './world-map.ts';
export type { Villager, VillagerId } from './villagers.ts';
