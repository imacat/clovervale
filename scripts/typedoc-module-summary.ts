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
 * @module scripts/typedoc-module-summary A TypeDoc plugin for `@module` tags.
 */

import {
  Application,
  Comment,
  Converter,
  ReflectionKind,
} from 'typedoc';
import type { Context, ProjectReflection } from 'typedoc';

/**
 * Splits the brief descriptions off the names of the modules of a project.
 *
 * The project writes its module tags as `@module path/name Brief
 * description`, which TypeDoc reads as a module name containing spaces.
 * After the split, the module is named `path/name`, and the brief
 * description is its summary.
 *
 * @param {ProjectReflection} project - The project to fix the modules of.
 */
function splitModuleNames(project: ProjectReflection): void {
  for (const module of project.getReflectionsByKind(ReflectionKind.Module)) {
    const space: number = module.name.search(/\s/);
    if (space <= 0) {
      continue;
    }
    const description: string = module.name.slice(space).trim();
    if (description === '') {
      continue;
    }
    module.name = module.name.slice(0, space);
    module.comment ??= new Comment();
    module.comment.summary.unshift({ kind: 'text', text: description });
  }
}

/**
 * Registers the plugin with TypeDoc.
 *
 * @param {Application} app - The TypeDoc application.
 */
export function load(app: Application): void {
  app.converter.on(Converter.EVENT_RESOLVE_BEGIN, (context: Context) => {
    splitModuleNames(context.project);
  });
  app.on(Application.EVENT_PROJECT_REVIVE, splitModuleNames);
}
