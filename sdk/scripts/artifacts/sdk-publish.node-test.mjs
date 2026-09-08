import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { compareVersions, integrity, lookup, prepare, publishVerified } from './sdk-publish.mjs';

const sourceSha = 'a'.repeat(40);
const bytes = Buffer.from('immutable registry archive');
const record = (overrides = {}) => ({
  schemaVersion: 1,
  name: '@reptilianhq/sdk',
  version: '1.2.3',
  sourceSha,
  channel: 'latest',
  registry: 'https://npm.pkg.github.com',
  access: 'restricted',
  filename: 'reptilianhq-sdk-1.2.3.tgz',
  integrity: integrity(bytes),
  ...overrides,
});
const metadata = item => ({ name: item.name, version: item.version, gitHead: item.sourceSha, dist: { integrity: item.integrity } });

function registryFixture(item = record()) {
  const entries = new Map();
  const writes = [];
  return {
    entries,
    writes,
    io: {
      lookup: spec => entries.get(spec) ?? null,
      publish: () => {
        writes.push('publish');
        entries.set(`${item.name}@${item.version}`, metadata(item));
        entries.set(`${item.name}@${item.channel}`, metadata(item));
      },
      tag: () => {
        writes.push('tag');
        entries.set(`${item.name}@${item.channel}`, entries.get(`${item.name}@${item.version}`));
      },
      download: () => bytes,
      wait: async () => {},
    },
  };
}

test('compares stable and numbered RC versions numerically without precision loss', () => {
  assert.equal(compareVersions('1.2.3-rc.10', '1.2.3-rc.2'), 1);
  assert.equal(compareVersions('1.9007199254740993.0', '1.9007199254740992.999999999999999999'), 1);
  assert.equal(compareVersions('1.2.3', '1.2.3-rc.999999999999999999999999'), 1);
  assert.equal(compareVersions('1.2.3-rc.2', '1.2.3-rc.2'), 0);
});

test('rejects conflicting immutable bytes or source before writing', async () => {
  for (const conflict of [
    { ...metadata(record()), dist: { integrity: integrity(Buffer.from('different')) } },
    { ...metadata(record()), gitHead: 'b'.repeat(40) },
  ]) {
    const f = registryFixture();
    f.entries.set('@reptilianhq/sdk@1.2.3', conflict);
    await assert.rejects(publishVerified(record(), f.io));
    assert.deepEqual(f.writes, []);
  }
});

test('refuses a newer install channel before publishing', async () => {
  const f = registryFixture();
  f.entries.set('@reptilianhq/sdk@latest', { version: '1.2.4' });
  await assert.rejects(publishVerified(record(), f.io), /backwards/);
  assert.deepEqual(f.writes, []);
});

test('publishes a missing version and verifies its exact downloaded bytes', async () => {
  const f = registryFixture();
  await publishVerified(record(), f.io);
  assert.deepEqual(f.writes, ['publish']);
});

test('repairs a stale channel for an existing exact version without republishing', async () => {
  const f = registryFixture();
  f.entries.set('@reptilianhq/sdk@1.2.3', metadata(record()));
  f.entries.set('@reptilianhq/sdk@latest', { version: '1.2.2' });
  await publishVerified(record(), f.io);
  assert.deepEqual(f.writes, ['tag']);
});

test('rechecks the channel immediately before repair and rejects a racing newer release', async () => {
  const item = record();
  const f = registryFixture(item);
  f.entries.set(`${item.name}@${item.version}`, metadata(item));
  let channelReads = 0;
  f.io.lookup = spec => {
    if (spec === `${item.name}@${item.channel}` && ++channelReads === 2) return { version: '1.2.4' };
    return f.entries.get(spec) ?? (spec === `${item.name}@${item.channel}` ? { version: '1.2.2' } : null);
  };
  await assert.rejects(publishVerified(item, f.io), /backwards/);
  assert.deepEqual(f.writes, []);
  assert.equal(channelReads, 2);
});

test('rejects downloaded tarball bytes that do not match an existing immutable release', async () => {
  const f = registryFixture();
  f.entries.set('@reptilianhq/sdk@1.2.3', metadata(record()));
  f.entries.set('@reptilianhq/sdk@latest', metadata(record()));
  f.io.download = () => Buffer.from('corrupted download');
  await assert.rejects(publishVerified(record(), f.io), /downloaded registry tarball differs/);
  assert.deepEqual(f.writes, []);
});

test('prepare packs repeatable source-bound bytes, restores the manifest, and ignores lifecycle scripts', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdk-publish-test-'));
  const previousCache = process.env.npm_config_cache;
  process.env.npm_config_cache = join(root, 'npm-cache');
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    const manifest = {
      name: '@reptilianhq/sdk', version: '1.2.3', files: ['index.js'],
      publishConfig: { registry: 'https://npm.pkg.github.com', access: 'restricted' },
      scripts: { prepack: 'node lifecycle.mjs' },
    };
    const original = `${JSON.stringify(manifest, null, 2)}\n`;
    writeFileSync(join(root, 'package.json'), original);
    writeFileSync(join(root, 'index.js'), 'export const value = 42;\n');
    writeFileSync(join(root, 'lifecycle.mjs'), "import { writeFileSync } from 'node:fs'; writeFileSync('lifecycle-ran', 'ran');\n");
    git(['init']);
    git(['add', '.']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']);
    const env = { RELEASE_VERSION: manifest.version, RELEASE_SOURCE_SHA: git(['rev-parse', 'HEAD']), RELEASE_DIST_TAG: 'latest' };
    const first = prepare(join(root, 'first'), root, env);
    const second = prepare(join(root, 'second'), root, env);
    assert.equal(first.integrity, second.integrity);
    assert.deepEqual(readFileSync(join(root, 'first', first.filename)), readFileSync(join(root, 'second', second.filename)));
    assert.deepEqual(readFileSync(join(root, 'package.json')), Buffer.from(original));
    assert.equal(existsSync(join(root, 'lifecycle-ran')), false);
    const packed = JSON.parse(execFileSync('tar', ['-xOf', join(root, 'first', first.filename), 'package/package.json'], { encoding: 'utf8' }));
    assert.equal(packed.gitHead, env.RELEASE_SOURCE_SHA);
    assert.equal(packed.publishConfig.registry, 'https://npm.pkg.github.com');
  } finally {
    if (previousCache === undefined) delete process.env.npm_config_cache;
    else process.env.npm_config_cache = previousCache;
    rmSync(root, { recursive: true, force: true });
  }
});

// npm 11.5.2 emits structured --json errors to stdout and diagnostics to stderr.
test('registry lookup accepts only structured E404 and fails closed on auth or transport errors', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sdk-npm-response-'));
  const previousPath = process.env.PATH;
  try {
    process.env.PATH = `${directory}:${previousPath}`;
    for (const code of ['E404', 'E401', 'ECONNRESET']) {
      writeFileSync(join(directory, 'npm'), `#!/bin/sh\nprintf '%s' '{"error":{"code":"${code}"}}'\nprintf '%s' 'diagnostic mentions E404' >&2\nexit 1\n`, { mode: 0o755 });
      if (code === 'E404') assert.equal(lookup('@reptilianhq/sdk@99.0.0'), null);
      else assert.throws(() => lookup('@reptilianhq/sdk@99.0.0'), /refusing publication/);
    }
  } finally {
    process.env.PATH = previousPath;
    rmSync(directory, { recursive: true, force: true });
  }
});
