import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// A transport guard only: owner release-plan/provenance scripts still authorize
// refs, allocate numbered RCs, and bind stable releases to a published RC source.
export const GUARD_VERSION = '1.0.0';
const registry = 'https://npm.pkg.github.com';
const accessFor = { '@reptilianhq/sdk': 'restricted', '@reptilianhq/pons-sdk': 'public' };
export const integrity = bytes => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const run = (command, args, cwd = process.cwd()) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
function parts(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.(0|[1-9]\d*))?$/.exec(version);
  assert.ok(match, `Expected stable or numbered RC version: ${version}`);
  return match.slice(1).map(part => part === undefined ? null : BigInt(part));
}
export function compareVersions(left, right) {
  const a = parts(left), b = parts(right);
  for (let i = 0; i < 4; i++) {
    if (a[i] === b[i]) continue;
    if (a[i] === null) return 1;
    if (b[i] === null) return -1;
    return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}
export function validate(record) {
  assert.equal(record.schemaVersion, 1);
  assert.ok(Object.hasOwn(accessFor, record.name), 'unsupported SDK package');
  assert.equal(record.registry, registry);
  assert.equal(record.access, accessFor[record.name]);
  assert.equal(record.channel, parts(record.version)[3] === null ? 'latest' : 'rc');
  assert.match(record.sourceSha, /^[0-9a-f]{40}$/);
  assert.match(record.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/);
  assert.equal(record.filename, basename(record.filename));
  assert.match(record.filename, /^[a-zA-Z0-9._-]+\.tgz$/);
}
export function assertExact(record, actual) {
  assert.equal(actual.name, record.name, 'registry package differs');
  assert.equal(actual.version, record.version, 'registry version differs');
  assert.equal(actual.gitHead, record.sourceSha, 'registry source differs');
  assert.equal(actual.dist?.integrity, record.integrity, 'immutable tarball bytes conflict; use a new source/version');
}
export function lookup(spec) {
  const result = spawnSync('npm', ['view', spec, '--json', '--registry', registry], { cwd: tmpdir(), encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status === 0) {
    const value = JSON.parse(result.stdout);
    assert.ok(value && !Array.isArray(value), 'unexpected registry response');
    return value;
  }
  let error;
  try { error = JSON.parse(result.stdout).error; } catch { /* fail closed */ }
  if (error?.code === 'E404') return null;
  throw new Error(`Registry lookup failed for ${spec}; refusing publication`);
}
export async function publishVerified(record, { lookup, publish, tag, download, wait = () => new Promise(resolve => setTimeout(resolve, 5000)) }) {
  validate(record);
  const exactSpec = `${record.name}@${record.version}`;
  const channelSpec = `${record.name}@${record.channel}`;
  const checkChannel = () => {
    const current = lookup(channelSpec);
    assert.ok(!current || compareVersions(current.version, record.version) <= 0, `Refusing to move ${channelSpec} backwards`);
    return current;
  };
  const existing = lookup(exactSpec);
  if (existing) {
    assertExact(record, existing);
    assert.equal(integrity(download(exactSpec)), record.integrity, 'downloaded registry tarball differs');
  }
  let current = checkChannel();
  if (!existing) {
    publish();
  } else if (current?.version !== record.version) {
    // Recheck immediately before the channel write. Owner concurrency serializes
    // our writers; npm has no compare-and-swap for external/manual writers.
    current = checkChannel();
    if (current?.version !== record.version) tag();
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const exact = lookup(exactSpec);
    const channel = lookup(channelSpec);
    if (exact) assertExact(record, exact);
    if (channel && compareVersions(channel.version, record.version) > 0) throw new Error('Install channel advanced during publication; refusing repair');
    if (exact && channel?.version === record.version) {
      assertExact(record, channel);
      assert.equal(integrity(download(exactSpec)), record.integrity, 'downloaded registry tarball differs');
      return;
    }
    if (attempt < 5) await wait();
  }
  throw new Error(`Registry verification failed for ${exactSpec}`);
}
export function prepare(directory, cwd = process.cwd(), env = process.env) {
  mkdirSync(directory, { recursive: true });
  assert.equal(readdirSync(directory).length, 0, 'release directory must be empty');
  const path = join(cwd, 'package.json');
  const original = readFileSync(path);
  const pkg = JSON.parse(original);
  assert.equal(pkg.version, env.RELEASE_VERSION, 'release plan version differs from package');
  assert.equal(run('git', ['rev-parse', 'HEAD'], cwd), env.RELEASE_SOURCE_SHA, 'release source differs from checkout');
  const record = { schemaVersion: 1, name: pkg.name, version: pkg.version, sourceSha: env.RELEASE_SOURCE_SHA, channel: env.RELEASE_DIST_TAG, registry: pkg.publishConfig?.registry, access: pkg.publishConfig?.access };
  // Tarball publication cannot infer gitHead from a package directory. Include
  // it explicitly so the existing RC/stable provenance contract still works.
  try {
    writeFileSync(path, `${JSON.stringify({ ...pkg, gitHead: record.sourceSha }, null, 2)}\n`);
    const [packed] = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory], cwd));
    Object.assign(record, { filename: packed.filename, integrity: integrity(readFileSync(join(directory, packed.filename))) });
    assert.equal(record.integrity, packed.integrity);
    validate(record);
    writeFileSync(join(directory, 'release-record.json'), `${JSON.stringify(record, null, 2)}\n`);
    return record;
  } finally { writeFileSync(path, original); }
}
export async function main(argv = process.argv.slice(2), env = process.env) {
  const [command, target, ...extra] = argv;
  assert.ok(['prepare', 'publish'].includes(command) && target && !extra.length, 'Usage: sdk-publish.mjs prepare|publish <release-directory>');
  const directory = resolve(target);
  if (command === 'prepare') { prepare(directory, process.cwd(), env); return; }
  const record = json(join(directory, 'release-record.json'));
  validate(record);
  assert.equal(record.version, env.RELEASE_VERSION);
  assert.equal(record.sourceSha, env.RELEASE_SOURCE_SHA);
  assert.equal(record.channel, env.RELEASE_DIST_TAG);
  assert.equal(record.sourceSha, run('git', ['rev-parse', 'HEAD']));
  const archive = join(directory, record.filename);
  assert.equal(integrity(readFileSync(archive)), record.integrity, 'prepared tarball changed');
  const manifest = JSON.parse(run('tar', ['-xOf', archive, 'package/package.json']));
  assertExact(record, { ...manifest, dist: { integrity: record.integrity } });
  assert.equal(manifest.publishConfig.registry, record.registry);
  assert.equal(manifest.publishConfig.access, record.access);
  await publishVerified(record, {
    lookup,
    publish: () => run('npm', ['publish', archive, '--ignore-scripts', '--registry', registry, '--access', record.access, '--tag', record.channel]),
    tag: () => run('npm', ['dist-tag', 'add', `${record.name}@${record.version}`, record.channel, '--registry', registry]),
    download: spec => {
      const temp = mkdtempSync(join(tmpdir(), 'sdk-registry-bytes-'));
      try {
        const [packed] = JSON.parse(run('npm', ['pack', spec, '--ignore-scripts', '--json', '--registry', registry, '--pack-destination', temp], temp));
        assert.equal(packed.filename, basename(packed.filename));
        return readFileSync(join(temp, packed.filename));
      } finally { rmSync(temp, { recursive: true, force: true }); }
    },
  });
  writeFileSync(join(directory, 'verification.json'), `${JSON.stringify({ ...record, verifiedAt: new Date().toISOString() }, null, 2)}\n`);
  console.log(`Verified exact bytes and ${record.channel} for ${record.name}@${record.version}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
