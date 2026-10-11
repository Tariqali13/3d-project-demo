/// <reference lib="webworker" />
import { Engine } from './engine';
import type { Request, Response } from './protocol';

const engine = new Engine();
const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<Request>) => {
  const { id, op, args } = e.data;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (engine[op] as (...a: any[]) => unknown)(...args);
    scope.postMessage({ id, ok: true, result } satisfies Response);
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies Response);
  }
};
