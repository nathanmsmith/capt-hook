import { vi } from "vitest";
import type { ViewHook } from "phoenix_live_view";

export function makeHook<T extends ViewHook>(
  HookClass: new (...args: any[]) => T,
  el: HTMLElement,
): { hook: T; view: { withinTargets: ReturnType<typeof vi.fn> }; pushHookEvent: ReturnType<typeof vi.fn> } {
  const pushHookEvent = vi.fn().mockResolvedValue({ reply: { ok: true }, ref: 1 });
  const view = {
    withinTargets: vi.fn((_target: any, callback: (view: any, targetCtx: any) => void) => {
      callback({ pushHookEvent }, null);
    }),
    isDead: false,
  };
  const hook = new HookClass(view, el);
  return { hook, view, pushHookEvent };
}
