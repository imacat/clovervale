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
 * @module scripts/release Packs the built project into release archives.
 */

import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

/** The parts of a package manifest the release needs. */
interface Manifest {
  /** The package name. */
  readonly name: string;
  /** The package version. */
  readonly version: string;
  /** The licence of the package. */
  readonly license?: string;
  /** The supported runtime versions. */
  readonly engines?: Record<string, string>;
  /** The run-time dependencies. */
  readonly dependencies?: Record<string, string>;
}

const rootDir: string = path.resolve(import.meta.dirname, '..');
const releaseDir: string = path.join(rootDir, 'release');
const workspaceScope = '@clovervale/';
const programs: string[] = ['server', 'client', 'bots'];
/** The directory of the files that ship with a release as they are. */
const supportDir = 'support-files';
/** The support file that goes to the top of a release. */
const readmeFile = 'README.md';

/**
 * Reads the manifest of a package.
 *
 * @param {string} packageDir - The directory of the package.
 * @returns {Manifest} The manifest of the package.
 */
function readManifest(packageDir: string): Manifest {
  const file: string = path.join(packageDir, 'package.json');
  return JSON.parse(readFileSync(file, 'utf8')) as Manifest;
}

/**
 * Finds the directory of an installed package.
 *
 * @param {string} name - The name of the package.
 * @param {string} fromDir - The directory of the package that depends on it.
 * @returns {string} The directory of the installed package.
 * @throws {Error} If the package is not installed.
 */
function findPackageDir(name: string, fromDir: string): string {
  let dir: string = fromDir;
  for (;;) {
    const candidate: string = path.join(dir, 'node_modules', name);
    if (existsSync(path.join(candidate, 'package.json'))) {
      return realpathSync(candidate);
    }
    const parent: string = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`${name} is not installed.  Run "npm install" first.`);
    }
    dir = parent;
  }
}

/**
 * Collects the third-party packages that the programs are bundled with.
 *
 * @returns {Map<string, string>} The package directories, by package name.
 */
function collectBundledPackages(): Map<string, string> {
  const bundled = new Map<string, string>();
  const visited = new Set<string>();
  const pending: string[] = programs.map((program) =>
    path.join(rootDir, 'packages', program),
  );
  for (let dir = pending.pop(); dir !== undefined; dir = pending.pop()) {
    if (visited.has(dir)) {
      continue;
    }
    visited.add(dir);
    for (const name of Object.keys(readManifest(dir).dependencies ?? {})) {
      const dependencyDir: string = findPackageDir(name, dir);
      if (!name.startsWith(workspaceScope)) {
        bundled.set(name, dependencyDir);
      }
      pending.push(dependencyDir);
    }
  }
  return bundled;
}

/**
 * Composes the licence notices of the bundled third-party packages.
 *
 * @returns {string} The licence notices.
 * @throws {Error} If a bundled package comes without a licence file.
 */
function composeThirdPartyNotices(): string {
  const bundled: Map<string, string> = collectBundledPackages();
  const notices: string[] = [
    'Clovervale is distributed bundled with the following third-party' +
      ' software.\n',
  ];
  for (const name of [...bundled.keys()].sort()) {
    const dir: string = bundled.get(name) ?? '';
    const manifest: Manifest = readManifest(dir);
    const licenceFile: string | undefined = readdirSync(dir).find((file) =>
      /^(licen[cs]e|copying)/i.test(file),
    );
    if (licenceFile === undefined) {
      throw new Error(`${name} comes without a licence file.`);
    }
    const licence: string = manifest.license ?? 'see below';
    notices.push(
      '='.repeat(72),
      `${name} ${manifest.version} (${licence})`,
      '='.repeat(72),
      '',
      readFileSync(path.join(dir, licenceFile), 'utf8').trim(),
      '',
    );
  }
  return notices.join('\n');
}

/**
 * Copies a file or directory of the project into the release.
 *
 * @param {string} source - The path to copy, relative to the project root.
 * @param {string} target - The path to copy to.
 * @throws {Error} If the source is missing, as when it has not been built.
 */
function copyBuilt(source: string, target: string): void {
  const sourcePath: string = path.join(rootDir, source);
  if (!existsSync(sourcePath)) {
    throw new Error(`${source} is missing.  Run "npm run build" first.`);
  }
  cpSync(sourcePath, target, { recursive: true });
}

/**
 * Packs the built project into versioned .tar.gz and .zip archives.
 */
function packRelease(): void {
  const root: Manifest = readManifest(rootDir);
  const name = `${root.name}-${root.version}`;
  const stageDir: string = path.join(releaseDir, name);
  const archives: string[] = [`${name}.tar.gz`, `${name}.zip`];

  for (const stale of [name, ...archives]) {
    rmSync(path.join(releaseDir, stale), { recursive: true, force: true });
  }
  mkdirSync(stageDir, { recursive: true });

  copyBuilt('packages/server/dist/server.cjs', `${stageDir}/server/server.cjs`);
  copyBuilt('packages/bots/dist/bots.cjs', `${stageDir}/bots/bots.cjs`);
  copyBuilt('packages/client/dist', `${stageDir}/client`);
  copyBuilt('LICENSE', `${stageDir}/LICENSE`);
  for (const file of readdirSync(path.join(rootDir, supportDir))) {
    const target: string = file === readmeFile ? file : `${supportDir}/${file}`;
    copyBuilt(`${supportDir}/${file}`, `${stageDir}/${target}`);
  }
  writeFileSync(
    path.join(stageDir, 'THIRD-PARTY-LICENSES.txt'),
    composeThirdPartyNotices(),
  );
  const manifest: object = {
    name: root.name,
    version: root.version,
    private: true,
    license: root.license,
    engines: root.engines,
    scripts: {
      start: 'node server/server.cjs',
      bots: 'node bots/bots.cjs',
    },
  };
  writeFileSync(
    path.join(stageDir, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  execFileSync('tar', ['-czf', `${name}.tar.gz`, name], { cwd: releaseDir });
  execFileSync('zip', ['-qrX', `${name}.zip`, name], { cwd: releaseDir });
  rmSync(stageDir, { recursive: true });
  for (const archive of archives) {
    console.log(`Packed release/${archive}`);
  }
}

packRelease();
