// stdio transport probe (Node only).
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { INIT, report } from './probe.js';

export async function probeStdio(cmd, args = []) {
  const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'ignore'] });
  const waiting = new Map(); let id = 0;
  createInterface({ input: p.stdout }).on('line', (l) => { try { const m = JSON.parse(l); waiting.get(m.id)?.(m); } catch {} });
  const rpc = (method, params) => new Promise((ok, no) => {
    const i = ++id; waiting.set(i, ok);
    setTimeout(() => no(new Error(`timeout waiting for ${method}`)), 10000).unref();
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n');
  });
  try {
    const init = await rpc('initialize', INIT);
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const list = await rpc('tools/list', {});
    const unknown = await rpc('no/such_method', {});
    const extra = unknown.error?.code === -32601 ? [] : [{ level: 'warn', id: 'rpc.method_not_found', title: 'Unknown methods do not return JSON-RPC -32601', detail: '', fix: '' }];
    return report(init.result, list.result?.tools || [], extra);
  } finally { p.kill(); }
}

