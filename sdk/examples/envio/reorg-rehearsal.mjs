import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const { values } = parseArgs({ options: { runtime: { type: 'string' }, output: { type: 'string' }, 'sdk-dependencies': { type: 'string' } } });
if (!values.runtime || !values.output || process.env.RECOMPUTE_TEST_PG)
    throw Error('Explicit --runtime and --output are required; external databases are prohibited');
const sdkRoot = resolve(import.meta.dirname, '../..');
const runtime = resolve(values.runtime);
const runtimeRequire = createRequire(runtime + '/package.json');
if (JSON.parse(readFileSync(runtimeRequire.resolve('envio/package.json'))).version !== '3.9.0-reptilian.2')
    throw Error('Rehearsal requires Envio 3.9.0-reptilian.2');
const { parse, stringify } = await import(pathToFileURL(runtimeRequire.resolve('yaml')).href);
const { default: pg } = await import(pathToFileURL(runtimeRequire.resolve('pg')).href);
const dependencyRoot = values['sdk-dependencies'] ? resolve(values['sdk-dependencies']) : sdkRoot;
const sdk = resolve(dependencyRoot, 'node_modules/@reptilianhq');
const req = createRequire(dependencyRoot + '/package.json');
if (values['sdk-dependencies']) {
    const expected = JSON.parse(readFileSync(sdkRoot + '/package.json'));
    for (const [pkg, version] of [['pons-sdk', expected.version], ['uniswap-sdk', expected.dependencies['@reptilianhq/uniswap-sdk']]])
        if (JSON.parse(readFileSync(sdk + '/' + pkg + '/package.json')).version !== version)
            throw Error('SDK dependency version mismatch: ' + pkg);
}
function provisionPostgres() {
    const directory = mkdtempSync(join(tmpdir(), 'pons-v4-reorg-pg-')), data = join(directory, 'data');
    const port = 20000 + Math.floor(Math.random() * 20000);
    const stop = () => { try {
        execFileSync('pg_ctl', ['-D', data, '-m', 'immediate', 'stop'], { stdio: 'ignore' });
    }
    catch { } rmSync(directory, { recursive: true, force: true }); };
    try {
        execFileSync('initdb', ['-D', data, '-U', 'postgres', '--auth=trust'], { stdio: 'ignore' });
        execFileSync('pg_ctl', ['-D', data, '-o', `-p ${port} -h 127.0.0.1 -k ""`, '-l', join(directory, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
        execFileSync('psql', ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-c', 'create database pons_v4_reorg'], { stdio: 'ignore' });
        return { connectionString: `postgresql://postgres@127.0.0.1:${port}/pons_v4_reorg`, stop };
    }
    catch (error) {
        stop();
        throw error;
    }
}
const exp = (pkg, sub) => { const directory = pkg === 'pons-sdk' && !values['sdk-dependencies'] ? sdkRoot : sdk + '/' + pkg; return pathToFileURL(directory + '/' + JSON.parse(readFileSync(directory + '/package.json')).exports[sub].import).href; };
let gen = readFileSync(sdkRoot + '/scripts/generate-indexing.mjs', 'utf8');
gen = gen.replace("import { toEventSignature } from 'viem';", `import { toEventSignature } from ${JSON.stringify(pathToFileURL(req.resolve('viem')).href)};`).replace("'@reptilianhq/uniswap-sdk/v4'", JSON.stringify(exp('uniswap-sdk', './v4'))).replace("'../dist/indexing.js'", JSON.stringify(exp('pons-sdk', './indexing'))).replace("const root = fileURLToPath(new URL('..', import.meta.url));", `const root = ${JSON.stringify(sdkRoot)};`);
const dir = mkdtempSync(join(tmpdir(), 'pons-v4-reorg-candidate-'));
symlinkSync(runtime + '/node_modules', dir + '/node_modules', 'dir');
gen = gen.replace("'yaml'", JSON.stringify(pathToFileURL(runtimeRequire.resolve('yaml')).href));
writeFileSync(dir + '/generator.mjs', gen);
const { renderIndexing } = await import(pathToFileURL(dir + '/generator.mjs').href);
const sample = JSON.parse(readFileSync(new URL('./REORG_SAMPLE.json', import.meta.url)));
const evidence = { result: sample };
const pool = evidence.result.pools[0];
pool.membership.blockNumber = BigInt(pool.membership.blockNumber);
const outputs = renderIndexing(undefined, { poolSelection: [pool] });
for (const [path, bytes] of outputs) {
    if (!path.startsWith('examples/envio/'))
        continue;
    const relative = path.slice('examples/envio/'.length);
    mkdirSync(dir + '/' + relative.split('/').slice(0, -1).join('/'), { recursive: true });
    writeFileSync(dir + '/' + relative, bytes);
}
writeFileSync(dir + '/package.json', JSON.stringify({ name: 'pons-v4-reorg-candidate', type: 'module' }));
const b = Number(pool.membership.blockNumber), hex = x => '0x' + BigInt(x).toString(16), zero = '0x' + '00'.repeat(20);
const registration = sample.registration;
const logs = [registration, ...evidence.result.logs];
let branch = 'A', head = b + 110, requests = 0, managerRequests = 0, unfiltered = 0;
const digest = s => '0x' + createHash('sha256').update(s).digest('hex');
const hash = n => digest((n < b ? 'common' : branch) + ':' + n);
const txs = n => { const ls = logs.filter(l => Number(BigInt(l.blockNumber)) === n); const byIndex = new Map(ls.map(l => [Number(BigInt(l.transactionIndex)), l])); const max = Math.max(-1, ...byIndex.keys()); return Array.from({ length: max + 1 }, (_, i) => ({ hash: byIndex.get(i)?.transactionHash ?? digest(n + ':tx:' + i), blockHash: hash(n), blockNumber: hex(n), transactionIndex: hex(i), from: zero, to: zero, input: '0x', value: '0x0', gas: '0x1000000', gasPrice: '0x1', nonce: hex(i), v: '0x1', r: '0x1', s: '0x1', type: '0x0' })); };
const block = (n, full) => ({ number: hex(n), hash: hash(n), parentHash: hash(n - 1), timestamp: hex(1700000000 + n), transactions: full ? txs(n) : txs(n).map(t => t.hash), gasLimit: '0x10000000', gasUsed: '0x0', miner: zero, nonce: '0x0000000000000000', difficulty: '0x0', totalDifficulty: '0x0', extraData: '0x', size: '0x0', uncles: [], logsBloom: '0x' + '00'.repeat(256), transactionsRoot: digest('tx'), stateRoot: digest('state'), receiptsRoot: digest('receipts') });
const observed = [];
const source = createServer(async (req, res) => {
    try {
        let body = '';
        for await (const x of req)
            body += x;
        const payload = JSON.parse(body);
        const answer = q => {
            requests++;
            let result;
            if (q.method === 'eth_chainId')
                result = hex(4663);
            else if (q.method === 'eth_blockNumber')
                result = hex(head);
            else if (q.method === 'eth_getBlockByNumber')
                result = block(q.params[0] === 'latest' ? head : Number(BigInt(q.params[0])), q.params[1]);
            else if (q.method === 'eth_getLogs') {
                const filter = q.params[0];
                const addresses = [filter.address].flat().map(x => x.toLowerCase());
                if (addresses.includes(pool.poolManager.toLowerCase())) {
                    managerRequests++;
                    if (![filter.topics?.[1]].flat().includes(pool.poolId)) {
                        unfiltered++;
                        throw Error('Unfiltered manager request');
                    }
                }
                const from = Number(BigInt(filter.fromBlock)), to = Number(BigInt(filter.toBlock));
                result = (branch === 'B' ? [] : logs).filter(l => Number(BigInt(l.blockNumber)) >= from && Number(BigInt(l.blockNumber)) <= to && addresses.includes(l.address.toLowerCase()) && (filter.topics ?? []).every((t, i) => t == null || [t].flat().some(v => v.toLowerCase() === l.topics[i]?.toLowerCase()))).map(l => ({ ...l, blockHash: hash(Number(BigInt(l.blockNumber))) }));
                observed.push({ branch, filter, count: result.length });
            }
            else if (q.method === 'eth_getTransactionByHash') {
                result = null;
                for (let n = b; n <= b + 100; n++) {
                    result = txs(n).find(t => t.hash === q.params[0]);
                    if (result)
                        break;
                }
            }
            else
                throw Error('Unsupported ' + q.method);
            return { jsonrpc: '2.0', id: q.id, result };
        };
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(Array.isArray(payload) ? payload.map(answer) : answer(payload)));
    }
    catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
    }
});
await new Promise(r => source.listen(0, '127.0.0.1', r));
const rpc = `http://127.0.0.1:${source.address().port}`;
const config = parse(readFileSync(dir + '/config.yaml', 'utf8'));
config.full_batch_size = 5;
const chain = config.chains[0];
chain.start_block = b - 2;
delete chain.end_block;
delete chain.hypersync_config;
chain.block_lag = 2;
chain.max_reorg_depth = 200;
for (const c of chain.contracts)
    c.start_block = b - 2;
chain.rpc = [{ url: rpc, for: 'sync', initial_block_interval: 20, interval_ceiling: 20 }, { url: rpc, for: 'realtime', polling_interval: 200 }];
writeFileSync(dir + '/config.yaml', stringify(config));
if (process.env.RECOMPUTE_TEST_PG)
    throw Error('External database prohibited');
let database;
try {
    database = provisionPostgres();
}
catch (error) {
    await new Promise(r => source.close(r));
    rmSync(dir, { recursive: true, force: true });
    throw error;
}
const url = new URL(database.connectionString), client = new pg.Client({ connectionString: database.connectionString });
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
Object.assign(env, { ENVIO_PG_HOST: '127.0.0.1', ENVIO_PG_PORT: url.port, ENVIO_PG_USER: 'postgres', ENVIO_PG_PASSWORD: 'testing', ENVIO_PG_DATABASE: 'pons_v4_reorg', ENVIO_PG_SCHEMA: 'v4_reorg', ENVIO_PG_SSL_MODE: 'false', ENVIO_HASURA: 'false', ENVIO_NO_TRACKING: 'true', ENVIO_METRICS_PORT: '0' });
let worker, output = '';
function start() { worker = spawn(process.execPath, [runtimeRequire.resolve('envio/bin.mjs'), 'start'], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] }); for (const s of [worker.stdout, worker.stderr])
    s.on('data', x => { output = (output + x).slice(-80000); }); }
async function stop() { if (worker && worker.exitCode === null && worker.signalCode === null) {
    const done = new Promise(r => worker.once('exit', r));
    worker.kill('SIGTERM');
    setTimeout(() => { if (worker.exitCode === null && worker.signalCode === null)
        worker.kill('SIGKILL'); }, 3000).unref();
    await done;
} }
async function status() { try {
    const pools = (await client.query('select count(*)::int n from v4_reorg."PonsPool"')).rows[0].n;
    const events = (await client.query('select kind,count(*)::int n from v4_reorg."PonsProtocolEvent" group by kind')).rows;
    const progress = (await client.query('select progress_block from v4_reorg.envio_chains')).rows[0]?.progress_block;
    return { pools, events, progress: Number(progress) };
}
catch {
    return {};
} }
async function waitFor(predicate) { const deadline = Date.now() + 60000; while (Date.now() < deadline) {
    const s = await status();
    if (predicate(s))
        return s;
    if (worker.exitCode !== null)
        throw Error('Worker exited ' + worker.exitCode);
    await new Promise(r => setTimeout(r, 200));
} throw Error('Timed out: ' + JSON.stringify(await status())); }
try {
    await client.connect();
    start();
    const a = await waitFor(s => s.pools === 1 && s.events?.find(x => x.kind === 'Swap')?.n === 23 && s.progress >= head - 2);
    console.log('Branch A persisted', a);
    branch = 'B';
    head += 10;
    const bb = await waitFor(s => s.pools === 0 && s.events?.length === 0 && s.progress >= head - 2);
    console.log('Branch B rolled back', bb);
    branch = 'C';
    head += 10;
    const c = await waitFor(s => s.pools === 1 && s.events?.find(x => x.kind === 'Swap')?.n === 23 && s.progress >= head - 2);
    console.log('Branch C replayed', c);
    await stop();
    head += 10;
    const beforeRestartRequests = requests;
    start();
    const restarted = await waitFor(s => requests > beforeRestartRequests && s.pools === 1 && s.events?.find(x => x.kind === 'Swap')?.n === 23 && s.progress >= head - 2);
    const hashes = (await client.query('select distinct "blockHash" from v4_reorg."PonsProtocolEvent"')).rows;
    if (hashes.some(x => !logs.some(l => hash(Number(BigInt(l.blockNumber))) === x.blockHash)))
        throw Error('Orphan hash remains');
    const result = { verifiedAt: new Date().toISOString(), runtime: '3.9.0-reptilian.2', scope: 'Actual Envio/Postgres, SDK-generated selected starter, synthetic competing RPC branches using captured public event payloads; not production aggregate projections', branchA: a, orphanBranch: bb, replacementBranch: c, afterRestart: restarted, requests, managerRequests, unfiltered, observed };
    writeFileSync(values.output, JSON.stringify(result, null, 2));
    console.log('PASS');
}
catch (e) {
    console.error(e.message);
    process.exitCode = 1;
}
finally {
    await stop();
    writeFileSync(values.output + '.worker.log', output);
    await client.end();
    await new Promise(r => source.close(r));
    database.stop();
    rmSync(dir, { recursive: true, force: true });
}
