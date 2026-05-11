/**
 * traceTail — ECL trace JSONL reader with optional follow mode.
 *
 * Port of reference-sdk/bash/trace-tail.sh. The bash helper is the
 * canonical reference; this module produces the same event stream for
 * identical inputs.
 *
 * ## Sort order
 * When reading multiple files (no `thread` filter), files are sorted
 * lexicographically by path (`LC_ALL=C sort`) — matching bash line 51.
 * The parent-agent prompt mentions "newest first by mtime" but the bash
 * script uses `LC_ALL=C sort`; bash is canonical.
 *
 * ## Follow mode
 * `follow: true` uses `fs.watch` for low-latency event delivery.
 * `fs.watch` behaviour differs between macOS APFS (coalesced events) and
 * Linux inotify. When events coalesce the reader falls back to a position-
 * based re-read on each `change` notification, which is safe and correct
 * even if a single notification covers multiple appended lines.
 *
 * An `AbortSignal` is accepted to allow clean shutdown of follow mode.
 * This is an additive option: the bash flag surface has `--follow` only;
 * `signal` has no bash equivalent, but it is necessary to tear down
 * `fs.watch` handles without leaking file descriptors. See the report for
 * rationale.
 *
 * @see reference-sdk/bash/trace-tail.sh
 * @see schemas/handoff-event.v1.json
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { EclError } from "./errors.js";
import type { TraceEvent } from "./types.js";

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

export interface TraceTailOptions {
  /**
   * Directory that contains `<thread_id>.jsonl` trace files.
   * @default ".eidolons/.trace"
   */
  traceDir?: string;

  /**
   * When supplied, read only `<traceDir>/<thread>.jsonl`.
   * When omitted, all `*.jsonl` files in `traceDir` are read in
   * lexicographic order (matching `LC_ALL=C sort` in the bash helper).
   */
  thread?: string;

  /**
   * Eidolon slug (prefix-match against `event.from`).
   * Matches any `from` string that starts with `"${from}@"` — mirrors
   * `jq 'select(.from | startswith("${FROM}@"))'` in bash.
   */
  from?: string;

  /**
   * Eidolon slug (prefix-match against `event.to`).
   * Mirrors `jq 'select(.to | startswith("${TO}@"))'` in bash.
   */
  to?: string;

  /**
   * When `true`, behave like `tail -F`: after emitting all existing events,
   * keep watching the file(s) for new appends and yield them as they arrive.
   * The generator never returns while in follow mode unless `signal` is
   * aborted.
   * @default false
   */
  follow?: boolean;

  /**
   * AbortSignal to stop a follow-mode tail cleanly.
   *
   * This option has no bash equivalent but is required to prevent file-
   * descriptor leaks in long-lived follow sessions. Callers SHOULD pass an
   * AbortController signal and call `controller.abort()` when done.
   *
   * In non-follow mode the signal is checked between file reads; it is
   * safe to pass one, but the generator completes naturally anyway.
   */
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Implementation helpers
// ---------------------------------------------------------------------------

/**
 * Read all JSONL lines from a single file starting at `startByte`, applying
 * `from` and `to` filters, and yielding typed `TraceEvent` objects.
 * Malformed JSON lines are silently skipped to stderr (matching jq -c).
 *
 * Returns the number of bytes consumed so the caller can track the file
 * position for follow mode.
 */
function* readLinesFromBuffer(
  buffer: string,
  fromFilter: string | undefined,
  toFilter: string | undefined,
): Generator<TraceEvent, void, unknown> {
  const lines = buffer.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Malformed line — skip silently (mirrors jq -c swallowing parse errors).
      process.stderr.write(`[traceTail] skipping malformed JSON line\n`);
      continue;
    }

    // Apply from filter: event.from must start with "<slug>@"
    if (fromFilter !== undefined) {
      const rec = parsed as Record<string, unknown>;
      if (typeof rec["from"] !== "string" || !rec["from"].startsWith(`${fromFilter}@`)) {
        continue;
      }
    }

    // Apply to filter: event.to must start with "<slug>@"
    if (toFilter !== undefined) {
      const rec = parsed as Record<string, unknown>;
      if (typeof rec["to"] !== "string" || !rec["to"].startsWith(`${toFilter}@`)) {
        continue;
      }
    }

    yield parsed as TraceEvent;
  }
}

/**
 * Collect all `*.jsonl` files in `traceDir` sorted lexicographically
 * (matching `LC_ALL=C sort` in the bash reference).
 */
function globJsonlFiles(traceDir: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(traceDir, { withFileTypes: true });
  } catch (err) {
    throw new EclError({
      code: "IO_FAILED",
      message: `Failed to read trace dir: ${traceDir}`,
      cause: err,
    });
  }

  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith(".jsonl"))
    .map((e) => path.join(traceDir, e.name));

  // Lexicographic sort on the full path (mirroring `find … | LC_ALL=C sort`).
  files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return files;
}

// ---------------------------------------------------------------------------
// Core generator
// ---------------------------------------------------------------------------

/**
 * Tail one or more ECL trace JSONL files, yielding `TraceEvent` objects.
 *
 * @example
 * ```ts
 * for await (const ev of traceTail({ thread: myThreadId })) {
 *   console.log(ev.event, ev.from, "→", ev.to);
 * }
 * ```
 *
 * @example Follow mode with clean teardown
 * ```ts
 * const ac = new AbortController();
 * setTimeout(() => ac.abort(), 5000);
 * for await (const ev of traceTail({ follow: true, signal: ac.signal })) {
 *   console.log(ev);
 * }
 * ```
 */
export async function* traceTail(opts: TraceTailOptions): AsyncGenerator<TraceEvent> {
  const traceDir = opts.traceDir ?? ".eidolons/.trace";
  const follow = opts.follow ?? false;
  const fromFilter = opts.from;
  const toFilter = opts.to;
  const signal = opts.signal;

  // Gate: trace dir must exist (mirrors bash trace-tail.sh:42-45).
  if (!fs.existsSync(traceDir) || !fs.statSync(traceDir).isDirectory()) {
    throw new EclError({
      code: "IO_FAILED",
      message: `trace dir missing: ${traceDir}`,
    });
  }

  // Resolve the file list.
  let files: string[];
  if (opts.thread !== undefined) {
    files = [path.join(traceDir, `${opts.thread}.jsonl`)];
  } else {
    files = globJsonlFiles(traceDir);
    if (files.length === 0) {
      // No files — non-follow mode completes immediately; follow mode watches
      // for new files via the dir watcher below.
      if (!follow) return;
    }
  }

  if (!follow) {
    // -----------------------------------------------------------------------
    // Non-follow path: read each file sequentially, yield, done.
    // Matches: cat "${FILES[@]}" | jq -c "$JQ_FILTER"
    // -----------------------------------------------------------------------
    for (const filePath of files) {
      if (signal?.aborted) return;

      let content: string;
      try {
        content = fs.readFileSync(filePath, "utf8");
      } catch (err) {
        // If a specific thread file doesn't exist, surface as IO_FAILED.
        throw new EclError({
          code: "IO_FAILED",
          message: `Failed to read trace file: ${filePath}`,
          cause: err,
        });
      }

      yield* readLinesFromBuffer(content, fromFilter, toFilter);
    }
    return;
  }

  // -------------------------------------------------------------------------
  // Follow path: emit existing content, then watch for appends.
  // Matches: tail -F "${FILES[@]}" | jq -c "$JQ_FILTER"
  //
  // Strategy:
  //   1. For each file, record how many bytes we have already emitted.
  //   2. On each fs.watch "change" event for a file, read from the last
  //      position to EOF and yield new lines.
  //   3. Watch the traceDir itself for new *.jsonl files (covers the case
  //      where --thread is not set and new threads start after we begin).
  //
  // The generator uses a queue-based bridge: fs.watch callbacks push events
  // into a queue; the async generator drains the queue, yielding to callers.
  // -------------------------------------------------------------------------

  type QueueItem =
    | { kind: "event"; event: TraceEvent }
    | { kind: "done" }
    | { kind: "error"; error: EclError };

  const queue: QueueItem[] = [];
  let notifyResolve: (() => void) | null = null;

  function enqueue(item: QueueItem): void {
    queue.push(item);
    if (notifyResolve !== null) {
      const r = notifyResolve;
      notifyResolve = null;
      r();
    }
  }

  function waitForItem(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (queue.length > 0) {
        resolve();
        return;
      }
      notifyResolve = resolve;
    });
  }

  // Per-file read state: track byte position.
  const filePositions = new Map<string, number>();
  const fileWatchers = new Map<string, fs.FSWatcher>();

  function readNewContent(filePath: string): void {
    let pos = filePositions.get(filePath) ?? 0;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      // File disappeared (rotation). Reset position; the rename watcher
      // will handle re-registration when it reappears.
      filePositions.set(filePath, 0);
      return;
    }

    if (stat.size <= pos) return; // No new bytes.

    let fd: number;
    try {
      fd = fs.openSync(filePath, "r");
    } catch {
      return;
    }

    const newBytes = stat.size - pos;
    const buf = Buffer.alloc(newBytes);
    let bytesRead: number;
    try {
      bytesRead = fs.readSync(fd, buf, 0, newBytes, pos);
    } finally {
      fs.closeSync(fd);
    }

    const chunk = buf.subarray(0, bytesRead).toString("utf8");
    pos += bytesRead;
    filePositions.set(filePath, pos);

    // The chunk may not end with a newline if a partial line was written.
    // We only process complete lines (ending with \n).
    const lastNewline = chunk.lastIndexOf("\n");
    if (lastNewline === -1) {
      // No complete line yet; roll back position to before this read.
      filePositions.set(filePath, pos - bytesRead);
      return;
    }

    const completePart = chunk.slice(0, lastNewline + 1);
    const incompleteTail = chunk.slice(lastNewline + 1);
    // Roll back by the number of bytes in the incomplete tail.
    filePositions.set(filePath, pos - Buffer.byteLength(incompleteTail, "utf8"));

    for (const ev of readLinesFromBuffer(completePart, fromFilter, toFilter)) {
      enqueue({ kind: "event", event: ev });
    }
  }

  function watchFile(filePath: string): void {
    if (fileWatchers.has(filePath)) return;

    // Emit existing content first.
    let initialContent: string;
    try {
      initialContent = fs.readFileSync(filePath, "utf8");
    } catch {
      initialContent = "";
    }
    filePositions.set(filePath, Buffer.byteLength(initialContent, "utf8"));

    for (const ev of readLinesFromBuffer(initialContent, fromFilter, toFilter)) {
      enqueue({ kind: "event", event: ev });
    }

    // Watch for subsequent writes.
    let watcher: fs.FSWatcher;
    try {
      watcher = fs.watch(filePath, { persistent: false }, (eventType) => {
        if (signal?.aborted) return;
        if (eventType === "change") {
          readNewContent(filePath);
        } else if (eventType === "rename") {
          // File was rotated or deleted. Reset position; re-open when it
          // reappears (dir watcher will pick it up for glob mode).
          filePositions.set(filePath, 0);
          watcher.close();
          fileWatchers.delete(filePath);
        }
      });
    } catch {
      // File disappeared before we could watch it — ignore.
      return;
    }

    watcher.on("error", () => {
      watcher.close();
      fileWatchers.delete(filePath);
    });

    fileWatchers.set(filePath, watcher);
  }

  // Watch the trace dir for new *.jsonl files (only needed for glob mode).
  let dirWatcher: fs.FSWatcher | null = null;

  function cleanup(): void {
    for (const w of fileWatchers.values()) {
      try {
        w.close();
      } catch {
        /* ignore */
      }
    }
    fileWatchers.clear();
    if (dirWatcher !== null) {
      try {
        dirWatcher.close();
      } catch {
        /* ignore */
      }
      dirWatcher = null;
    }
  }

  // Register abort handler.
  if (signal !== undefined) {
    signal.addEventListener("abort", () => {
      cleanup();
      enqueue({ kind: "done" });
    });
  }

  // Start watching files discovered initially.
  for (const filePath of files) {
    watchFile(filePath);
  }

  // Watch the dir for new files (glob mode only).
  if (opts.thread === undefined) {
    try {
      dirWatcher = fs.watch(traceDir, { persistent: false }, (eventType, filename) => {
        if (signal?.aborted) return;
        if (eventType === "rename" && filename !== null && filename.endsWith(".jsonl")) {
          const fullPath = path.join(traceDir, filename);
          // Only add new files we haven't seen yet.
          if (!fileWatchers.has(fullPath)) {
            // Give the OS a tick to finish the write before reading.
            setImmediate(() => {
              if (!signal?.aborted) watchFile(fullPath);
            });
          }
        }
      });
      dirWatcher.on("error", () => {
        /* ignore dir watch errors */
      });
    } catch {
      /* dir watch setup failed — new files won't be discovered */
    }
  }

  // Drain the queue.
  try {
    while (true) {
      if (signal?.aborted) break;

      await waitForItem();

      while (queue.length > 0) {
        const item = queue.shift()!;
        if (item.kind === "done") return;
        if (item.kind === "error") throw item.error;
        yield item.event;
      }
    }
  } finally {
    cleanup();
  }
}
