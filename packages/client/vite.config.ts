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
 * @module client/vite.config The Vite configuration of the browser client.
 */

import { defineConfig } from 'vite';

import { listModels } from './plugins/model-index.ts';

export default defineConfig({
  // Relative asset URLs let the built client be served from any directory.
  base: './',
  plugins: [listModels()],
  build: {
    // Three.js alone exceeds the default 500 kB warning threshold.
    chunkSizeWarningLimit: 1000,
  },
});
