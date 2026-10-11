import type { Engine } from './engine';

type Methods = {
  [K in keyof Engine as Engine[K] extends (...a: never[]) => unknown ? K : never]: Engine[K];
};
export type Op = keyof Methods;

export interface Request<K extends Op = Op> {
  id: number;
  op: K;
  args: Parameters<Methods[K]>;
}

export type Response = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

/**
 * Typed promise API over the engine worker: `await engine.call('cutFill', a, b)`
 * has the same types as calling the Engine directly.
 */
export class EngineClient {
  private seq = 0;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor(private readonly worker: Worker) {
    worker.onmessage = (e: MessageEvent<Response>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new Error(e.message || 'The analysis worker stopped.'));
      this.pending.clear();
    };
  }

  call<K extends Op>(op: K, ...args: Parameters<Methods[K]>): Promise<ReturnType<Methods[K]>> {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ id, op, args } satisfies Request<K>);
    });
  }
}

export function createEngine(): EngineClient {
  return new EngineClient(new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' }));
}
