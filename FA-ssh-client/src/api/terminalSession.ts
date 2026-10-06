import { createTerminalApi } from "./terminal";
import { errorMessage } from "./ssh";
import type { SessionStatus } from "../types";

// The backend currently reports shell EOF as output rather than a status field.
const disconnectedOutput = "\u001b[31m\r\n[连接已断开]\u001b[0m\r\n";

export class TerminalSession {
  private api: ReturnType<typeof createTerminalApi>;
  private sessionId = "";
  private stopped = false;
  private failed = false;
  private executing = false;
  private agentRunning = false;
  private agentAbort?: () => void;
  private opening: Promise<void> = Promise.resolve();
  private closing: Promise<void> | null = null;
  private reading: Promise<void> = Promise.resolve();
  private writing: Promise<void> = Promise.resolve();
  private resizing: Promise<void> = Promise.resolve();
  private execution: Promise<void> = Promise.resolve();
  private readAbort = new AbortController();
  private pollTimer?: number;
  private inputTimer?: number;
  private resizeTimer?: number;
  private pendingInput = "";
  private size = { cols: 120, rows: 24 };

  constructor(
    serverUrl: string,
    private output: (data: string) => void,
    private status: (status: SessionStatus) => void,
  ) {
    this.api = createTerminalApi(serverUrl);
  }

  open(connectionId: string, cols: number, rows: number) {
    this.size = { cols, rows };
    // Do not create remote resources during React StrictMode's probe mount.
    this.opening = Promise.resolve().then(async () => {
      if (this.stopped) return;
      const result = await this.api.open(connectionId, cols, rows);
      this.sessionId = result.sessionId;
      // close() waits for this response so an in-flight open cannot leak a session.
      if (this.stopped) return;
      if (result.initialOutput) this.output(result.initialOutput);
      this.status("running");
      this.flushInput();
      this.resize(this.size.cols, this.size.rows);
      this.poll();
    }).catch((error) => this.fail("打开终端失败", error));
    return this.opening;
  }

  private fail(operation: string, error: unknown) {
    if (this.stopped || this.failed) return;
    this.failed = true;
    this.agentAbort?.();
    this.clearTimers();
    this.readAbort.abort();
    this.pendingInput = "";
    this.output(`\r\n\x1b[31m${operation}：${errorMessage(error)}\x1b[0m\r\n`);
    this.status("error");
  }

  private poll() {
    if (this.stopped || this.failed || this.executing) return;
    this.reading = this.api.read(this.sessionId, this.readAbort.signal).then(({ output }) => {
      if (this.stopped || this.failed) return;
      if (output) this.output(output);
      if (output === disconnectedOutput) {
        this.failed = true;
        this.agentAbort?.();
        this.status("closed");
        return;
      }
      if (!this.executing) this.pollTimer = window.setTimeout(() => this.poll(), output ? 50 : 200);
    }).catch((error) => this.fail("读取终端失败", error));
  }

  write(input: string) {
    if (this.stopped || this.failed || this.executing || this.agentRunning) return;
    this.pendingInput += input;
    if (this.inputTimer === undefined) {
      this.inputTimer = window.setTimeout(() => this.flushInput(), 16);
    }
  }

  private flushInput() {
    window.clearTimeout(this.inputTimer);
    this.inputTimer = undefined;
    if (!this.sessionId || !this.pendingInput || this.stopped || this.failed) return;
    const input = this.pendingInput;
    this.pendingInput = "";
    // Never retry raw input: the server may already have executed it.
    this.writing = this.writing.then(async () => {
      if (!this.stopped && !this.failed) await this.api.write(this.sessionId, input);
    }).catch((error) => this.fail("写入终端失败", error));
  }

  resize(cols: number, rows: number) {
    this.size = { cols, rows };
    window.clearTimeout(this.resizeTimer);
    if (this.stopped || this.failed || !this.sessionId) return;
    this.resizeTimer = window.setTimeout(() => {
      this.resizing = this.resizing.then(async () => {
        if (!this.stopped && !this.failed) await this.api.resize(this.sessionId, this.size.cols, this.size.rows);
      }).catch((error) => this.fail("调整终端大小失败", error));
    }, 100);
  }

  exec(command: string) {
    if (this.stopped || this.failed || this.executing || this.agentRunning || !this.sessionId) {
      return Promise.reject(new Error("终端尚未就绪，请连接后重试。"));
    }
    this.executing = true;
    window.clearTimeout(this.pollTimer);
    this.flushInput();
    this.execution = (async () => {
      // read and exec both drain the same output buffer. Never run them together.
      await Promise.all([this.reading, this.writing]);
      if (this.stopped || this.failed) return;
      // The backend writes the command verbatim, so Enter must be explicit.
      const { output } = await this.api.exec(this.sessionId, `${command}\r`);
      if (!this.stopped && !this.failed && output) this.output(output);
    })().catch((error) => {
      this.fail("执行命令失败", error);
      throw error;
    }).finally(() => {
      this.executing = false;
      this.poll();
    });
    return this.execution;
  }

  async beginAgentRun(abort: () => void) {
    if (this.stopped || this.failed || this.executing || this.agentRunning || !this.sessionId) {
      throw new Error("终端尚未就绪或正在执行命令，请稍后重试。");
    }
    this.agentRunning = true;
    this.agentAbort = abort;
    this.flushInput();
    await this.writing;
    if (this.stopped || this.failed) {
      this.endAgentRun();
      throw new Error("SSH 终端已断开，请重新连接。");
    }
    // Keep polling: the backend duplicates AI command output into the UI buffer.
    return this.sessionId;
  }

  endAgentRun() {
    this.agentRunning = false;
    this.agentAbort = undefined;
  }

  private clearTimers() {
    window.clearTimeout(this.pollTimer);
    window.clearTimeout(this.inputTimer);
    window.clearTimeout(this.resizeTimer);
  }

  close() {
    if (this.closing) return this.closing;
    this.stopped = true;
    this.agentAbort?.();
    this.clearTimers();
    this.readAbort.abort();
    this.pendingInput = "";
    this.closing = (async () => {
      await Promise.allSettled([this.opening, this.writing, this.resizing, this.execution]);
      if (this.sessionId) {
        await this.api.close(this.sessionId);
        this.sessionId = "";
      }
    })().catch((error) => {
      this.closing = null;
      throw error;
    });
    return this.closing;
  }
}
