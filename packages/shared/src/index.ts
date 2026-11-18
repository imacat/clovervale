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
  FOUNTAIN_HEALING,
  FOUNTAIN_REACH,
  INTERACTION_HALF_ANGLE,
  TALK_REACH,
  findInteraction,
  findVillager,
} from './interaction.ts';
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
  InteractInput,
  MoveInput,
  PlayerInput,
  PlayerMotion,
} from './player-motion.ts';
export {
  APPEARANCE_COUNT,
  DEFAULT_SERVER_PORT,
  MONSTER_MODES,
  PROTOCOL_VERSION,
  SNAPSHOT_RATE,
  createEventsMessage,
  createInteractMessage,
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
  EntityKind,
  EntityRef,
  EventsMessage,
  GameEvent,
  HealEvent,
  HitEvent,
  InteractMessage,
  MonsterMode,
  MonsterState,
  MoveMessage,
  PlayerState,
  ServerMessage,
  SlashJudgement,
  SnapshotMessage,
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
  FOUNTAIN_RIM_RADIUS,
  VILLAGE_BOUNDARY,
  VILLAGE_PLACEMENTS,
  VILLAGE_TERRAIN,
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
export { VILLAGERS } from './villagers.ts';
export type { Villager, VillagerId } from './villagers.ts';
