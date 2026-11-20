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

export {
  ACTION_STATES,
  DRINK_DURATION,
  MONSTER_ACTIONS,
  SLASH_DURATION,
  TALK_DURATION,
} from './actions.ts';
export type { ActionState, Interaction, MonsterAction } from './actions.ts';
export {
  AuthoritativePlayer,
  INPUT_WAIT_LIMIT,
  WAITING_INPUT_LIMIT,
} from './authoritative-player.ts';
export type {
  InputProgress,
  InputStamp,
  StampedInput,
} from './authoritative-player.ts';
export {
  DEATH_DURATION,
  MONSTER_HEALTH,
  PLAYER_HEALTH,
  SLASH_DAMAGE,
  SLASH_REACH,
  STRIKE_HALF_ANGLE,
  isWithinStrike,
} from './combat.ts';
export {
  DAY_PHASES,
  DEFAULT_DAY_LENGTH,
  DEFAULT_DAY_ORIGIN,
  NOON,
  findDayPhase,
  findPhaseTime,
  findTimeOfDay,
} from './day-cycle.ts';
export type { DayCycle, DayPeriod, DayPhase } from './day-cycle.ts';
export {
  CAVE_BARS_FILE,
  CAVE_BARS_HALF_DEPTH,
  CAVE_BOUNDARY,
  CAVE_CELLS,
  CAVE_CHAMBERS,
  CAVE_CHAMBER_DEPTH,
  CAVE_CONTAINERS,
  CAVE_CONTAINER_FILES,
  CAVE_ENVOY_BEHIND_BARS,
  CAVE_ENVOY_FILE,
  CAVE_FILE,
  CAVE_FIXTURE_FOOTPRINTS,
  CAVE_FLAMES,
  CAVE_FLAME_AHEAD,
  CAVE_FLAME_HEIGHT,
  CAVE_FOOTPRINT,
  CAVE_LANDING,
  CAVE_MODEL_CENTRE,
  CAVE_MOUTH,
  CAVE_MOUTH_OUTLINE,
  CAVE_PASSAGE,
  CAVE_PASSAGE_HALF_WIDTH,
  CAVE_PASSAGE_LENGTH,
  CAVE_PLACEMENTS,
  CAVE_ROPE,
  CAVE_SHAFT_RADIUS,
  CAVE_SKELETON_FILE,
  CAVE_STORE_ROOMS,
  CAVE_TERRAIN,
  CAVE_TORCH_DEPTH,
  CAVE_TORCH_FILE,
} from './cave.ts';
export type {
  CaveContainer,
  CaveContainerFiles,
  CaveContainerKind,
  CaveRoom,
} from './cave.ts';
export {
  BURROW_REACH,
  FEET_REACH,
  FOUNTAIN_HEALING,
  FOUNTAIN_REACH,
  INTERACTION_HALF_ANGLE,
  LOOT_REACH,
  PICK_REACH,
  PASSAGES,
  ROPE_REACH,
  TALK_REACH,
  findInteraction,
  findPassage,
  findPickTarget,
  findVillager,
} from './interaction.ts';
export type { Passage, PickSource, PickTarget } from './interaction.ts';
export {
  CLOVER_KIND,
  CLOVER_PATCHES,
  CLOVER_REGROW_DURATION,
  GROUND_ITEM_DURATION,
  INVENTORY_SIZE,
  ITEM_KINDS,
  NO_WORLD_ITEMS,
  findItemKind,
  hasRoom,
  isItemKindId,
} from './items.ts';
export type {
  GroundItem,
  ItemKind,
  ItemKindId,
  WorldItems,
} from './items.ts';
export { interpolatePlaced, interpolateYaw } from './interpolation.ts';
export type { Placed } from './interpolation.ts';
export {
  SIMULATION_RATE,
  WALK_SPEED,
  findYaw,
  movePosition,
} from './movement.ts';
export type { GroundVector } from './movement.ts';
export {
  NavigationGraph,
  WAYPOINT_CLEARANCE,
  findVillagePath,
  placeWaypoints,
} from './navigation.ts';
export {
  DRINK_STEPS,
  SLASH_STEPS,
  TALK_STEPS,
  applyInput,
  canInteract,
  createMotion,
  isResting,
  killMotion,
  relocateMotion,
  stepMotion,
} from './player-motion.ts';
export type {
  DropInput,
  InteractInput,
  MoveInput,
  PickInput,
  PlayerInput,
  PlayerMotion,
  TravelInput,
} from './player-motion.ts';
export {
  APPEARANCE_COUNT,
  DEFAULT_SERVER_PORT,
  MONSTER_MODES,
  PROTOCOL_VERSION,
  SNAPSHOT_RATE,
  createEventsMessage,
  createInteractMessage,
  createMapMessage,
  createMoveMessage,
  createSnapshotMessage,
  createWelcomeMessage,
  decodeClientMessage,
  decodeServerMessage,
  encodeClientMessage,
  encodeServerMessage,
} from './protocol.ts';
export type {
  ClientMessage,
  DropMessage,
  EntityKind,
  EntityRef,
  EventsMessage,
  GameEvent,
  HealEvent,
  HitEvent,
  InteractMessage,
  MapMessage,
  MonsterMode,
  MonsterState,
  MoveMessage,
  PickMessage,
  PlayerState,
  ServerMessage,
  SlashJudgement,
  SnapshotMessage,
  TravelMessage,
  WelcomeMessage,
} from './protocol.ts';
export {
  PLAYER_RADIUS,
  Terrain,
  findTurn,
  placePoint,
  placeShape,
  turnVector,
} from './terrain.ts';
export type {
  Boundary,
  BoxShape,
  CircleShape,
  Pose,
  Shape,
  Turn,
} from './terrain.ts';
export {
  TOBY_ACTIVITIES,
  TOBY_ACTIVITY_STEPS,
  TOBY_CLOVERS,
  TOBY_ENDS,
  TOBY_FILE,
  TOBY_LOOP_STEPS,
  TOBY_RADIUS,
  TOBY_RUN_SPEED,
  findTobyPose,
  measurePushReach,
  pushAside,
  resolveWalk,
} from './toby.ts';
export type { TobyActivity, TobyPose } from './toby.ts';
export {
  FOUNTAIN_RIM_RADIUS,
  VILLAGE_BOUNDARY,
  VILLAGE_PLACEMENTS,
  VILLAGE_TERRAIN,
  WELL_STAND,
  findPlacement,
} from './village-layout.ts';
export type { Placement } from './village-layout.ts';
export {
  PLAZA_CENTRE,
  SPAWN_POINT_COUNT,
  SPAWN_SPACING,
  SPAWN_YAW,
  findSpawnPoint,
} from './village.ts';
export { VILLAGERS, locateVillager } from './villagers.ts';
export { MAP_IDS, findMapTerrain, isMapId } from './world-map.ts';
export type { MapId } from './world-map.ts';
export type { Villager, VillagerId } from './villagers.ts';
