import http from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';

const ROOT = dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = join(ROOT, 'index.html');
const EXAMPLE_PATH = join(ROOT, 'examples', 'Kano_Project_串燒收集遊戲.json');
const HOST = '127.0.0.1';
const PORT = Number(process.env.KANO_CODEX_PORT || 3210);
const BODY_LIMIT = 32 * 1024 * 1024;
const RUN_TIMEOUT = 240_000;

class CodexBridge {
  constructor() {
    this.proc = null;
    this.ready = null;
    this.nextId = 1;
    this.pending = new Map();
    this.runs = new Map();
    this.stderrTail = [];
  }

  async start() {
    if (this.proc && !this.proc.killed) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const isWindows = process.platform === 'win32';
      const npmCodex = process.env.APPDATA ? join(process.env.APPDATA, 'npm', 'codex.cmd') : 'codex.cmd';
      const codexJs = process.env.APPDATA ? join(process.env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js') : '';
      const useNodeEntrypoint = isWindows && existsSync(codexJs);
      const executable = useNodeEntrypoint ? process.execPath : (isWindows && existsSync(npmCodex) ? npmCodex : (isWindows ? 'codex.cmd' : 'codex'));
      const args = useNodeEntrypoint ? [codexJs, 'app-server'] : ['app-server'];
      const proc = spawn(executable, args, { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: isWindows && !useNodeEntrypoint, env: process.env });
      this.proc = proc;
      proc.once('error', reject);
      proc.once('exit', (code, signal) => {
        const details = this.stderrTail.length ? `：${this.stderrTail.join(' | ')}` : '';
        const reason = new Error(`Codex app-server 已停止（${code ?? signal ?? 'unknown'}）${details}`);
        for (const pending of this.pending.values()) pending.reject(reason);
        for (const run of this.runs.values()) run.reject(reason);
        this.pending.clear(); this.runs.clear(); this.proc = null; this.ready = null;
      });
      createInterface({ input: proc.stdout }).on('line', line => this.handleLine(line));
      createInterface({ input: proc.stderr }).on('line', line => {
        this.stderrTail.push(line);
        if (this.stderrTail.length > 20) this.stderrTail.shift();
      });
      this.request('initialize', { clientInfo: { name: 'kano_survey_codex', title: 'Kano Survey Codex', version: '1.0.0' } }, 30_000)
        .then(() => { this.notify('initialized', {}); resolve(); }, reject);
    });
    return this.ready;
  }

  handleLine(line) {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id); clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message || 'Codex RPC 錯誤'));
      else pending.resolve(message.result);
      return;
    }
    if (message.method) this.handleNotification(message.method, message.params || {});
  }

  handleNotification(method, params) {
    const threadId = params.threadId || params.thread?.id || params.item?.threadId;
    const run = threadId ? this.runs.get(threadId) : null;
    if (!run) return;
    if (method === 'item/completed' && params.item?.type === 'agentMessage' && params.item.text) {
      if (params.item.phase === 'final_answer') run.finalText = params.item.text;
      else run.messages.push(params.item.text);
    }
    if (method === 'turn/completed') {
      this.runs.delete(threadId); clearTimeout(run.timer);
      const status = params.turn?.status;
      if (status && !['completed', 'Completed'].includes(status)) run.reject(new Error(params.turn?.error?.message || `Codex 分析未完成（${status}）`));
      else {
        const text = run.finalText || run.messages.at(-1) || '';
        text ? run.resolve(text) : run.reject(new Error('Codex 沒有回傳分析結果'));
      }
    }
  }

  request(method, params = {}, timeout = 60_000) {
    if (!this.proc?.stdin?.writable) return Promise.reject(new Error('Codex app-server 尚未啟動'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} 等待逾時`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin.write(`${JSON.stringify({ method, id, params })}\n`);
    });
  }

  notify(method, params = {}) {
    if (this.proc?.stdin?.writable) this.proc.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  async account() { await this.start(); return this.request('account/read', { refreshToken: false }, 30_000); }
  async login() {
    const state = await this.account();
    if (state.account?.type === 'chatgpt') return { authenticated: true };
    return this.request('account/login/start', { type: 'chatgpt', useHostedLoginSuccessPage: true, appBrand: 'codex' }, 30_000);
  }
  async logout() { await this.start(); return this.request('account/logout', {}, 30_000); }
  async models() { await this.start(); return this.request('model/list', { limit: 100, includeHidden: false }, 30_000); }

  async run({ model, instructions, content, schemaName, schema }) {
    const state = await this.account();
    if (state.account?.type !== 'chatgpt') throw Object.assign(new Error('請先登入 ChatGPT'), { statusCode: 401 });
    const temporaryFiles = [];
    try {
      const input = [];
      const textParts = [
        '你正在為 Kano 問卷工具執行唯讀分析。不得修改任何本機檔案。',
        instructions || '',
        `輸出名稱：${schemaName || 'kano_result'}。只回傳符合指定 JSON Schema 的 JSON，不要加入 Markdown 圍欄或額外文字。`
      ];
      for (const item of Array.isArray(content) ? content : []) {
        if (item?.type === 'input_text') textParts.push(String(item.text || ''));
        else if (item?.type === 'input_image' && /^data:image\//i.test(item.image_url || '')) {
          const path = await saveDataImage(item.image_url);
          temporaryFiles.push(path); input.push({ type: 'localImage', path });
        }
      }
      input.unshift({ type: 'text', text: textParts.filter(Boolean).join('\n\n') });

      const catalog = await this.models();
      const available = Array.isArray(catalog?.data) ? catalog.data : [];
      const requested = available.find(entry => entry.model === model || entry.id === model);
      const candidates = [requested, available.find(entry => entry.isDefault), available.find(entry => (entry.model || entry.id) === 'gpt-5.3-codex'), ...available].filter(Boolean);
      const unique = candidates.filter((entry, index, all) => all.findIndex(other => (other.model || other.id) === (entry.model || entry.id)) === index);
      if (!unique.length) throw new Error('本機 Codex 沒有回報可用模型，請更新 Codex CLI 後重試');

      let threadResult; let modelUsed; let lastError;
      for (const entry of unique) {
        modelUsed = entry.model || entry.id;
        try {
          threadResult = await this.request('thread/start', { model: modelUsed, cwd: ROOT, approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true, serviceName: 'kano_survey_codex' }, 60_000);
          break;
        } catch (error) { lastError = error; }
      }
      if (!threadResult) throw lastError || new Error('Codex 無法建立分析工作階段');
      const threadId = threadResult?.thread?.id;
      if (!threadId) throw new Error('Codex 無法建立分析工作階段');

      const resultPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { this.runs.delete(threadId); reject(new Error('Codex 分析等待超過 4 分鐘')); }, RUN_TIMEOUT);
        this.runs.set(threadId, { resolve, reject, timer, finalText: '', messages: [] });
      });
      try {
        await this.request('turn/start', { threadId, input, model: modelUsed, effort: 'medium', approvalPolicy: 'never', outputSchema: schema }, 60_000);
      } catch (error) {
        const run = this.runs.get(threadId);
        if (run) { clearTimeout(run.timer); this.runs.delete(threadId); run.reject(error); }
        throw error;
      }
      const text = await resultPromise;
      return { status: 'completed', modelRequested: model || null, modelUsed, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }] };
    } finally {
      await Promise.all(temporaryFiles.map(path => rm(path, { force: true }).catch(() => {})));
    }
  }
}

async function saveDataImage(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=\r\n]+)$/i.exec(dataUrl);
  if (!match) throw new Error('圖片資料格式不支援');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 20 * 1024 * 1024) throw new Error('單張圖片超過 20 MB');
  const extension = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' }[match[1].toLowerCase()] || '.img';
  const directory = join(tmpdir(), 'kano-survey-codex');
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${randomUUID()}${extension}`);
  await writeFile(path, buffer);
  return path;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    request.on('data', chunk => {
      size += chunk.length;
      if (size > BODY_LIMIT) { reject(Object.assign(new Error('請求內容超過 32 MB'), { statusCode: 413 })); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(Object.assign(new Error('JSON 格式錯誤'), { statusCode: 400 })); }
    });
    request.on('error', reject);
  });
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(body));
}

function allowedOrigin(request) {
  const origin = request.headers.origin;
  return !origin || origin === `http://${HOST}:${PORT}` || origin === `http://localhost:${PORT}`;
}

const bridge = new CodexBridge();
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${HOST}:${PORT}`);
    if (!allowedOrigin(request)) return sendJson(response, 403, { error: '不允許的來源' });
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = await readFile(INDEX_PATH);
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(html); return;
    }
    if (request.method === 'GET' && url.pathname === '/examples/Kano_Project_%E4%B8%B2%E7%87%92%E6%94%B6%E9%9B%86%E9%81%8A%E6%88%B2.json') {
      const example = await readFile(EXAMPLE_PATH);
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="Kano_Project_sample.json"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(example); return;
    }
    if (request.method === 'GET' && url.pathname === '/api/auth/status') {
      const state = await bridge.account(); const account = state.account;
      return sendJson(response, 200, { authenticated: account?.type === 'chatgpt', email: account?.type === 'chatgpt' ? account.email : null, planType: account?.type === 'chatgpt' ? account.planType : null });
    }
    if (request.method === 'GET' && url.pathname === '/api/models') {
      const result = await bridge.models();
      const models = (result.data || []).map(entry => ({ id: entry.model || entry.id, displayName: entry.displayName || entry.model || entry.id, isDefault: entry.isDefault === true, inputModalities: entry.inputModalities || ['text', 'image'] }));
      return sendJson(response, 200, { models });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/login') { await readJson(request); return sendJson(response, 200, await bridge.login()); }
    if (request.method === 'POST' && url.pathname === '/api/auth/logout') { await readJson(request); await bridge.logout(); return sendJson(response, 200, { ok: true }); }
    if (request.method === 'POST' && url.pathname === '/api/codex') {
      const body = await readJson(request);
      if (!body.schema || typeof body.schema !== 'object') return sendJson(response, 400, { error: '缺少輸出 Schema' });
      return sendJson(response, 200, await bridge.run(body));
    }
    return sendJson(response, 404, { error: '找不到此路徑' });
  } catch (error) { return sendJson(response, error.statusCode || 500, { error: error.message || '伺服器錯誤' }); }
});

if (!existsSync(INDEX_PATH)) throw new Error(`找不到 ${INDEX_PATH}`);
await bridge.start();
server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`Kano Codex 已啟動：${url}`);
  console.log('關閉此視窗即可停止本機服務。');
  if (process.env.KANO_NO_OPEN !== '1' && process.platform === 'win32') {
    const opener = spawn('cmd.exe', ['/d', '/s', '/c', 'start', '', url], { stdio: 'ignore', windowsHide: true, detached: true });
    opener.unref();
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { server.close(); bridge.proc?.kill(); process.exit(0); });
}
