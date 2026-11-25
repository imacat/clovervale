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
export { assertNever } from './assert.ts';
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
  isFighting,
  isWithinStrike,
} from './combat.ts';
export type {
  BeastMode,
  EntityRef,
  MonsterKind,
  MonsterKindId,
  MonsterMode,
  MonsterState,
  MonsterWander,
} from './combat.ts';
export { compareCodeUnits } from './compare.ts';
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
  CAVE_CELLS,
  CAVE_CHAMBER_DEPTH,
  CAVE_CONTAINERS,
  CAVE_CONTAINER_MODELS,
  CAVE_DOG_HOMES,
  CAVE_EDWIN_BEHIND_BARS,
  CAVE_FIXTURE_FOOTPRINTS,
  CAVE_FLAMES,
  CAVE_FLAME_AHEAD,
  CAVE_FLAME_HEIGHT,
  CAVE_LANDING,
  CAVE_MODEL_CENTER,
  CAVE_MOUTH,
  CAVE_MOUTH_OUTLINE,
  CAVE_PASSAGE,
  CAVE_PASSAGE_HALF_WIDTH,
  CAVE_PLACEMENTS,
  CAVE_ROPE,
  CAVE_SHAFT_RADIUS,
  CAVE_STORE_ROOMS,
  CAVE_TERRAIN,
  CAVE_TORCH_DEPTH,
} from './cave.ts';
export type { CaveContainer, CaveContainerModels } from './cave.ts';
export {
  FOUNTAIN_HEALING,
  findInteractable,
  findInteraction,
  findVillager,
} from './interaction.ts';
export type {
  ContainerTarget,
  Fountain,
  Interactable,
  InteractionInput,
  ItemTarget,
  Passage,
  PickTarget,
  Surroundings,
  Talkable,
} from './interaction.ts';
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
export {
  ClovervaleQuest,
  QUEST_IDS,
  QUEST_TYPES,
  TobyQuest,
  findQuest,
  isSameCue,
} from './quests.ts';
export type {
  ClovervaleStage,
  Quest,
  QuestId,
  QuestJSON,
  QuestOpening,
  QuestStage,
  QuestType,
  StoryCue,
  StoryEventType,
  StoryNeed,
  StoryRequest,
  TobyStage,
} from './quests.ts';
export { interpolatePlaced, interpolateYaw } from './interpolation.ts';
export type {
  CavePropId,
  FarmFieldId,
  ModelId,
  VillagePropId,
} from './models.ts';
export {
  SIMULATION_RATE,
  STEP_MILLISECONDS,
  WALK_SPEED,
  countSteps,
  findYaw,
  measureDistance,
  movePosition,
} from './movement.ts';
export type { GroundVector } from './movement.ts';
export {
  WAYPOINT_CLEARANCE,
  findMapPath,
} from './navigation.ts';
export {
  APPEARANCE_COUNT,
  TALK_STEPS,
  applyInput,
  canInteract,
  createMotion,
  isResting,
  stepMotion,
} from './player-motion.ts';
export type {
  PlayerInput,
  PlayerMotion,
  PlayerState,
  ReplyInput,
} from './player-motion.ts';
export {
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
} from './protocol.ts';
export type {
  ClientMessage,
  EventsMessage,
  GameEvent,
  HealEvent,
  HitEvent,
  MapMessage,
  PhraseMessage,
  PhrasedMessage,
  PrivateView,
  SaidMessage,
  SayMessage,
  ServerMessage,
  SlashJudgment,
  SnapshotContents,
  SnapshotMessage,
} from './protocol.ts';
export type { Pusher } from './pusher.ts';
export {
  PLAYER_RADIUS,
  Terrain,
  findTurn,
  measureBoundaryReach,
  placePoint,
  placeShape,
  turnVector,
} from './terrain.ts';
export type {
  Boundary,
  BoundaryWave,
  Pose,
  Shape,
} from './terrain.ts';
export {
  TOBY_ACTIVITIES,
  TOBY_ACTIVITY_STEPS,
  TOBY_ENDS,
  TOBY_FOUND_LINE,
  TOBY_GRAB_STEPS,
  TOBY_LOOP_STEPS,
  TOBY_PATCHES,
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
  FARM_FIELDS,
  FARM_FIELD_IDS,
  FIELD_BED_WIDTH,
  FIELD_FENCE_THICKNESS,
  FIELD_FLOOR_HEIGHT,
  FIELD_GATE_WIDTH,
  FOUNTAIN_RIM_RADIUS,
  MARTHA_POST,
  SPAWN_STONES_POSE,
  VILLAGE_PLACEMENTS,
  VILLAGE_TERRAIN,
  PITCHFORK_STAND,
  WELL_STAND,
  findFootprints,
  findPlacement,
} from './village-layout.ts';
export type {
  FarmField,
  FieldBed,
  Placement,
} from './village-layout.ts';
export {
  PLAZA_CENTER,
  SPAWN_POINT_COUNT,
  SPAWN_YAW,
  findSpawnPoint,
} from './village.ts';
export {
  VILLAGERS,
  findPusher,
  getVillager,
  hasServerWords,
  isVillagerFree,
  locateVillager,
} from './villagers.ts';
export {
  FOUNTAIN_REACH,
  HOME_MAP,
  WORLD_MAPS,
  areMonstersPaused,
} from './world-map.ts';
export type { MapId, WorldMap } from './world-map.ts';
export type { Villager, VillagerId } from './villagers.ts';
