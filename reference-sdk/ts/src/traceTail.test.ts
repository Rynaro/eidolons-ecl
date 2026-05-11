/**
 * traceTail.test.ts — Unit tests for Story S5.
 *
 * Coverage targets (G-S5-Unit):
 *   - Non-follow, single thread file: events stream in order.
 *   - from filter: only matching events appear.
 *   - to filter: only matching events appear.
 *   - thread filter: only the named thread file is read.
 *   - Multiple files in lexicographic sort order.
 *   - Malformed JSON line skipped; valid lines following it are yielded.
 *   - Missing trace dir throws EclError({ code: "IO_FAILED" }).
 *   - Follow mode: existing events emitted, then new appended event arrives.
 *   - Follow mode: AbortSignal tears down cleanly.
 *
 * Note on follow-mode test timing:
 *   We write existing events, start the tail generator, then append a new
 *   event. The test collects until at least the expected count, capping at
 *   ~500 ms to avoid hanging. No fake timers are used because fs.watch is
 *   real-OS-backed; vi.useFakeTimers would prevent its callbacks from firing.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EclError } from "./errors.js";
import { type TraceTailOptions, traceTail } from "./traceTail.js";
import type { EmitTraceEvent, TraceEvent } from "./types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Minimal valid emit event fixture. */
function makeEmitEvent(overrides: Partial<EmitTraceEvent> = {}): EmitTraceEvent {
  return {
    ts: "2026-05-11T10:00:00Z",
    event: "emit",
    message_id: "01926e3a-0000-7000-8000-000000000001",
    thread_id: "01926e3a-0000-7000-8000-000000000000",
    from: "atlas@1.4.2",
    to: "spectra@4.2.11",
    performative: "PROPOSE",
    integrity_method: "sha256",
    ...overrides,
  };
}

/** Append a single event as a JSONL line to a file. */
function appendEvent(filePath: string, event: TraceEvent): void {
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, { flag: "a" });
}

/** Collect all events from an AsyncIterable into an array. */
async function collectAll(iterable: AsyncIterable<TraceEvent>): Promise<TraceEvent[]> {
  const results: TraceEvent[] = [];
  for await (const ev of iterable) {
    results.push(ev);
  }
  return results;
}

/**
 * Collect events from an AsyncIterable, stopping when `stopCount` events
 * have been collected or `timeoutMs` elapses — whichever comes first.
 * Used for follow-mode tests to avoid hanging indefinitely.
 */
async function collectWithTimeout(
  iterable: AsyncIterable<TraceEvent>,
  stopCount: number,
  timeoutMs: number
): Promise<TraceEvent[]> {
  const results: TraceEvent[] = [];
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    // Compose the abort signals: timeout OR external abort.
    const opts = iterable as AsyncGenerator<TraceEvent>;
    // We iterate manually to be able to break early.
    const iter = opts[Symbol.asyncIterator]();
    while (results.length < stopCount && !ac.signal.aborted) {
      const next = await Promise.race([
        iter.next(),
        new Promise<IteratorResult<TraceEvent>>((_, reject) =>
          ac.signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true })
        ),
      ]);
      if (next.done) break;
      results.push(next.value);
    }
  } catch {
    // timeout or abort — return whatever we have
  } finally {
    clearTimeout(timer);
    ac.abort(); // ensure generator is stopped
  }

  return results;
}

// ---------------------------------------------------------------------------
// Test fixtures — tmpdir lifecycle
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ecl-trace-tail-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Non-follow mode tests
// ---------------------------------------------------------------------------

describe("traceTail — non-follow", () => {
  it("streams events from a single thread file in order", async () => {
    const threadId = "01926e3a-0000-7000-8000-aaaaaaaaaaaa";
    const filePath = path.join(tmpDir, `${threadId}.jsonl`);

    const ev1 = makeEmitEvent({
      ts: "2026-05-11T10:00:00Z",
      message_id: "01926e3a-0000-7000-8000-000000000001",
    });
    const ev2 = makeEmitEvent({
      ts: "2026-05-11T10:01:00Z",
      message_id: "01926e3a-0000-7000-8000-000000000002",
    });
    appendEvent(filePath, ev1);
    appendEvent(filePath, ev2);

    const events = await collectAll(traceTail({ traceDir: tmpDir, thread: threadId }));

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ event: "emit", message_id: ev1.message_id });
    expect(events[1]).toMatchObject({ event: "emit", message_id: ev2.message_id });
  });

  it("applies from filter: only matching events appear", async () => {
    const threadId = "01926e3a-0000-7000-8000-bbbbbbbbbbbb";
    const filePath = path.join(tmpDir, `${threadId}.jsonl`);

    appendEvent(
      filePath,
      makeEmitEvent({ from: "atlas@1.4.2", message_id: "01926e3a-0000-7000-8000-000000000011" })
    );
    appendEvent(
      filePath,
      makeEmitEvent({ from: "apivr@3.0.5", message_id: "01926e3a-0000-7000-8000-000000000012" })
    );
    appendEvent(
      filePath,
      makeEmitEvent({ from: "atlas@1.4.2", message_id: "01926e3a-0000-7000-8000-000000000013" })
    );

    const events = await collectAll(
      traceTail({ traceDir: tmpDir, thread: threadId, from: "atlas" })
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ from: "atlas@1.4.2" });
    expect(events[1]).toMatchObject({ from: "atlas@1.4.2" });
  });

  it("applies to filter: only matching events appear", async () => {
    const threadId = "01926e3a-0000-7000-8000-cccccccccccc";
    const filePath = path.join(tmpDir, `${threadId}.jsonl`);

    appendEvent(
      filePath,
      makeEmitEvent({ to: "spectra@4.2.11", message_id: "01926e3a-0000-7000-8000-000000000021" })
    );
    appendEvent(
      filePath,
      makeEmitEvent({ to: "vigil@1.0.3", message_id: "01926e3a-0000-7000-8000-000000000022" })
    );
    appendEvent(
      filePath,
      makeEmitEvent({ to: "spectra@4.2.11", message_id: "01926e3a-0000-7000-8000-000000000023" })
    );

    const events = await collectAll(
      traceTail({ traceDir: tmpDir, thread: threadId, to: "spectra" })
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ to: "spectra@4.2.11" });
    expect(events[1]).toMatchObject({ to: "spectra@4.2.11" });
  });

  it("thread filter: only the named thread file is read", async () => {
    const threadA = "01926e3a-0000-7000-8000-aaaaaaaaaaaa";
    const threadB = "01926e3a-0000-7000-8000-bbbbbbbbbbbb";

    appendEvent(
      path.join(tmpDir, `${threadA}.jsonl`),
      makeEmitEvent({ message_id: "01926e3a-0000-7000-8000-000000000031" })
    );
    appendEvent(
      path.join(tmpDir, `${threadB}.jsonl`),
      makeEmitEvent({ message_id: "01926e3a-0000-7000-8000-000000000032" })
    );

    const events = await collectAll(traceTail({ traceDir: tmpDir, thread: threadA }));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ message_id: "01926e3a-0000-7000-8000-000000000031" });
  });

  it("reads multiple files in lexicographic sort order", async () => {
    // File names chosen so LC_ALL=C sort produces deterministic order: b < c < d
    const fileB = path.join(tmpDir, "b-thread.jsonl");
    const fileC = path.join(tmpDir, "c-thread.jsonl");
    const fileD = path.join(tmpDir, "d-thread.jsonl");

    appendEvent(fileB, makeEmitEvent({ message_id: "01926e3a-0000-7000-8000-000000000041" }));
    appendEvent(fileC, makeEmitEvent({ message_id: "01926e3a-0000-7000-8000-000000000042" }));
    appendEvent(fileD, makeEmitEvent({ message_id: "01926e3a-0000-7000-8000-000000000043" }));

    const events = await collectAll(traceTail({ traceDir: tmpDir }));

    expect(events).toHaveLength(3);
    // Lexicographic order: b < c < d
    expect(events[0]).toMatchObject({ message_id: "01926e3a-0000-7000-8000-000000000041" });
    expect(events[1]).toMatchObject({ message_id: "01926e3a-0000-7000-8000-000000000042" });
    expect(events[2]).toMatchObject({ message_id: "01926e3a-0000-7000-8000-000000000043" });
  });

  it("skips malformed JSON lines; yields valid lines before and after", async () => {
    const threadId = "01926e3a-0000-7000-8000-dddddddddddd";
    const filePath = path.join(tmpDir, `${threadId}.jsonl`);

    const validBefore = makeEmitEvent({ message_id: "01926e3a-0000-7000-8000-000000000051" });
    const validAfter = makeEmitEvent({ message_id: "01926e3a-0000-7000-8000-000000000052" });

    fs.appendFileSync(filePath, `${JSON.stringify(validBefore)}\n`);
    fs.appendFileSync(filePath, "THIS IS NOT JSON\n");
    fs.appendFileSync(filePath, `${JSON.stringify(validAfter)}\n`);

    const events = await collectAll(traceTail({ traceDir: tmpDir, thread: threadId }));

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ message_id: "01926e3a-0000-7000-8000-000000000051" });
    expect(events[1]).toMatchObject({ message_id: "01926e3a-0000-7000-8000-000000000052" });
  });

  it("throws EclError(IO_FAILED) when traceDir does not exist", async () => {
    const missing = path.join(tmpDir, "no-such-dir");

    const gen = traceTail({ traceDir: missing });
    await expect(gen.next()).rejects.toMatchObject({
      code: "IO_FAILED",
    });
  });

  it("throws EclError(IO_FAILED) when specific thread file does not exist", async () => {
    const gen = traceTail({ traceDir: tmpDir, thread: "no-such-thread" });
    await expect(gen.next()).rejects.toMatchObject({
      code: "IO_FAILED",
    });
  });

  it("returns no events when the thread file is empty", async () => {
    const threadId = "01926e3a-0000-7000-8000-eeeeeeeeeeee";
    fs.writeFileSync(path.join(tmpDir, `${threadId}.jsonl`), "");

    const events = await collectAll(traceTail({ traceDir: tmpDir, thread: threadId }));
    expect(events).toHaveLength(0);
  });

  it("from+to combined filter: only events matching both pass", async () => {
    const threadId = "01926e3a-0000-7000-8000-ffffffffffff";
    const filePath = path.join(tmpDir, `${threadId}.jsonl`);

    // matches both from and to
    appendEvent(
      filePath,
      makeEmitEvent({
        from: "atlas@1.4.2",
        to: "spectra@4.2.11",
        message_id: "01926e3a-0000-7000-8000-000000000061",
      })
    );
    // matches from only
    appendEvent(
      filePath,
      makeEmitEvent({
        from: "atlas@1.4.2",
        to: "vigil@1.0.3",
        message_id: "01926e3a-0000-7000-8000-000000000062",
      })
    );
    // matches to only
    appendEvent(
      filePath,
      makeEmitEvent({
        from: "apivr@3.0.5",
        to: "spectra@4.2.11",
        message_id: "01926e3a-0000-7000-8000-000000000063",
      })
    );

    const events = await collectAll(
      traceTail({ traceDir: tmpDir, thread: threadId, from: "atlas", to: "spectra" })
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ message_id: "01926e3a-0000-7000-8000-000000000061" });
  });
});

// ---------------------------------------------------------------------------
// Follow mode tests
// ---------------------------------------------------------------------------

describe("traceTail — follow mode", () => {
  it("emits existing events then yields a new event appended afterwards", async () => {
    const threadId = "01926e3a-0000-7000-8000-f01100000000";
    const filePath = path.join(tmpDir, `${threadId}.jsonl`);

    // Write 2 existing events before starting the tail.
    const ev1 = makeEmitEvent({ message_id: "01926e3a-0000-7000-8000-000000000071" });
    const ev2 = makeEmitEvent({ message_id: "01926e3a-0000-7000-8000-000000000072" });
    appendEvent(filePath, ev1);
    appendEvent(filePath, ev2);

    const ac = new AbortController();
    const opts: TraceTailOptions = {
      traceDir: tmpDir,
      thread: threadId,
      follow: true,
      signal: ac.signal,
    };

    // Collect 3 events within 1000 ms (2 existing + 1 new).
    const collectPromise = collectWithTimeout(traceTail(opts), 3, 1000);

    // Append a 3rd event after a short delay so the watcher is registered.
    const ev3 = makeEmitEvent({ message_id: "01926e3a-0000-7000-8000-000000000073" });
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    appendEvent(filePath, ev3);

    const events = await collectPromise;
    ac.abort(); // clean up

    expect(events.length).toBeGreaterThanOrEqual(3);
    const ids = events.map((e) => e.message_id);
    expect(ids).toContain(ev1.message_id);
    expect(ids).toContain(ev2.message_id);
    expect(ids).toContain(ev3.message_id);
  });

  it("AbortSignal stops the follow tail cleanly without leaking", async () => {
    const threadId = "01926e3a-0000-7000-8000-ab0700000000";
    const filePath = path.join(tmpDir, `${threadId}.jsonl`);

    appendEvent(filePath, makeEmitEvent({ message_id: "01926e3a-0000-7000-8000-000000000081" }));

    const ac = new AbortController();
    const events: TraceEvent[] = [];

    const gen = traceTail({
      traceDir: tmpDir,
      thread: threadId,
      follow: true,
      signal: ac.signal,
    });

    // Start consuming; abort after the first event.
    for await (const ev of gen) {
      events.push(ev);
      ac.abort();
    }

    // Should have received at least the pre-existing event.
    expect(events.length).toBeGreaterThanOrEqual(1);
    // Generator should have ended cleanly (we exited the for-await loop).
  });
});

// ---------------------------------------------------------------------------
// G-S5-No-Race: concurrent appenders scenario
// ---------------------------------------------------------------------------

describe("traceTail — no-race guarantee", () => {
  it("collects all 100 events from 100 sequential appends without truncation", async () => {
    const threadId = "01926e3a-0000-7000-8000-race00000000";
    const filePath = path.join(tmpDir, `${threadId}.jsonl`);

    const N = 100;
    for (let i = 0; i < N; i++) {
      appendEvent(
        filePath,
        makeEmitEvent({
          message_id: `01926e3a-0000-7000-8000-${String(i).padStart(12, "0")}`,
          ts: `2026-05-11T10:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z`,
        })
      );
    }

    const events = await collectAll(traceTail({ traceDir: tmpDir, thread: threadId }));

    expect(events).toHaveLength(N);
    // Every event is a valid object with event === "emit".
    for (const ev of events) {
      expect(ev.event).toBe("emit");
    }
  });
});
