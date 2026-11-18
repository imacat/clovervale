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
 * @module client/tests/model-catalogue Tests for knowing the model files.
 */

import { describe, expect, it } from 'vitest';

import {
  REQUIRED_MODEL_FILES,
  classifyModel,
  planModels,
} from '../src/model-catalogue.ts';

describe('classifyModel', () => {
  it('knows the required models', () => {
    expect(classifyModel('character-01.glb')).toBe('character');
    expect(classifyModel('character-08.glb')).toBe('character');
    expect(classifyModel('npc.glb')).toBe('npc');
    expect(classifyModel('wild-dog.glb')).toBe('monster');
    expect(classifyModel('weapon-shop.glb')).toBe('building');
    expect(classifyModel('fountain.glb')).toBe('building');
  });

  it('takes any properly named prop', () => {
    expect(classifyModel('prop-rock.glb')).toBe('prop');
    expect(classifyModel('prop-great-tree.glb')).toBe('prop');
  });

  it('rejects the files the game does not use', () => {
    expect(classifyModel('character-09.glb')).toBeNull();
    expect(classifyModel('prop-.glb')).toBeNull();
    expect(classifyModel('prop-Rock.glb')).toBeNull();
    expect(classifyModel('prop-rock.gltf')).toBeNull();
    expect(classifyModel('index.json')).toBeNull();
  });
});

describe('planModels', () => {
  it('shows everything when all the required models are available', () => {
    const available: string[] = ['prop-rock.glb', ...REQUIRED_MODEL_FILES];
    const plan = planModels(available);
    expect(plan.shown).toEqual([...available].sort());
    expect(plan.missing).toEqual([]);
  });

  it('reports every required model when none is available', () => {
    const plan = planModels([]);
    expect(plan.shown).toEqual([]);
    expect(plan.missing).toEqual(REQUIRED_MODEL_FILES);
  });

  it('reports the required models that are not available', () => {
    const available: string[] = REQUIRED_MODEL_FILES.filter(
      (file: string) => file !== 'npc.glb' && file !== 'character-03.glb',
    );
    const plan = planModels(available);
    expect(plan.shown).toEqual([...available].sort());
    expect(plan.missing).toEqual(['character-03.glb', 'npc.glb']);
  });

  it('does not miss the optional props', () => {
    expect(planModels(REQUIRED_MODEL_FILES).missing).toEqual([]);
  });

  it('leaves out the files the game does not use', () => {
    const plan = planModels(['notes.glb', 'fountain.glb', 'fountain.glb']);
    expect(plan.shown).toEqual(['fountain.glb']);
  });
});
