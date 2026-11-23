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
 * @module server/tests/told-maps Tests for which map each peer has been
 *   told its player is in.
 */

import { describe, expect, it } from 'vitest';

import { ToldMaps } from '../src/told-maps.ts';

describe('the maps told to the peers', () => {
  it('tells a peer nothing of the village it was welcomed into', () => {
    const told = new ToldMaps();
    expect(told.tell(1, 'village')).toBeNull();
  });

  it('tells a peer once that its player is in a cave', () => {
    const told = new ToldMaps();
    expect(told.tell(1, 'cave')).toEqual({ type: 'map', map: 'cave' });
    expect(told.tell(1, 'cave')).toBeNull();
  });

  it('tells a peer whose player climbs up of the village again', () => {
    const told = new ToldMaps();
    told.tell(1, 'cave');
    expect(told.tell(1, 'village')).toEqual({ type: 'map', map: 'village' });
  });

  it('tells each peer of its own player alone', () => {
    const told = new ToldMaps();
    told.tell(1, 'cave');
    expect(told.tell(2, 'cave')).toEqual({ type: 'map', map: 'cave' });
  });

  it('forgets a peer whose player has left', () => {
    const told = new ToldMaps();
    told.tell(1, 'cave');
    told.forget(1);
    expect(told.tell(1, 'village')).toBeNull();
  });
});
