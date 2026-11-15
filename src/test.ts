import type { Hook } from "./Hook.js";

const hookCleanups = new Set<() => void>();

/** Destroys all helpers created by makeHook, attempting every teardown before reporting errors. */
export function cleanupAllHooks(): void {
  const errors: unknown[] = [];
  for (const destroy of [...hookCleanups]) {
    try {
      destroy();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, "Failed to clean up hooks");
  }
}

/** A push made through the hook's real pushEvent/pushEventTo methods. */
export interface HookPush {
  el: HTMLElement;
  /** The resolved target element or component ID; null for pushEvent. */
  target: HTMLElement | number | null;
  event: string;
  payload: unknown;
}

export interface HookTestOptions {
  /** A fixed server reply. Defaults to { ok: true }. */
  reply?: unknown;
  /** Overrides reply for each push. May return a promise or throw to simulate failure. */
  replyFor?: (push: HookPush) => unknown | Promise<unknown>;
}

export interface HookTestView {
  isDead: boolean;
  pushHookEvent(
    source: HTMLElement,
    target: HookPush["target"],
    event: string,
    payload: unknown,
  ): Promise<{ reply: unknown; ref: number }>;
  withinTargets(
    target: HTMLElement | string | number,
    callback: (view: HookTestView, target: HookPush["target"]) => void,
  ): void;
}

export interface HookTest<T extends Hook> {
  hook: T;
  pushes: HookPush[];
  pushHookEvent: HookTestView["pushHookEvent"];
  destroy(): void;
  dispatchServerEvent(name: string, payload: unknown): void;
}

// Phoenix omits its internal constructor from its published declarations.
export type HookConstructor<T extends Hook> = new (
  view: never,
  el: HTMLElement,
  callbacks: object,
) => T;

/**
 * Constructs a real hook with a stubbed LiveView connection, without mounting it.
 * Supply an element and a DOM environment, then call hook.mounted() and tear down with
 * destroy() or cleanupAllHooks().
 * All targets share one simulated LiveView; selectors resolve against el's document.
 */
export function makeHook<T extends Hook>(
  HookClass: HookConstructor<T>,
  el: HTMLElement,
  options: HookTestOptions = {},
): HookTest<T> {
  const pushes: HookPush[] = [];
  let nextRef = 1;

  const pushHookEvent = async (
    source: HTMLElement,
    target: HookPush["target"],
    event: string,
    payload: unknown,
  ) => {
    const push = { el: source, target, event, payload };
    pushes.push(push);
    const ref = nextRef++;
    const reply = options.replyFor
      ? await options.replyFor(push)
      : Object.hasOwn(options, "reply")
        ? options.reply
        : { ok: true };
    return { reply, ref };
  };

  const view: HookTestView = {
    isDead: false,
    pushHookEvent,
    withinTargets(target, callback) {
      if (
        typeof target === "number" ||
        (typeof target === "string" && /^(0|[1-9]\d*)$/.test(target))
      ) {
        const cid = Number(target);
        if (el.ownerDocument.querySelector(`[data-phx-component="${cid}"]`)) {
          callback(view, cid);
        }
      } else if (typeof target === "string") {
        el.ownerDocument
          .querySelectorAll<HTMLElement>(target)
          .forEach((match) => callback(view, match));
      } else {
        callback(view, target);
      }
    },
  };

  const hook = new HookClass(view as never, el, {});
  // Phoenix calls these when attaching/removing hooks, but omits them from its types.
  const lifecycle = hook as T & {
    __destroyed(): void;
    __cleanup__(): void;
  };
  let destroyed = false;

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    hookCleanups.delete(destroy);
    try {
      lifecycle.__destroyed();
    } finally {
      // destroyed() handles capt-hook listeners; Phoenix tracks server listeners separately.
      lifecycle.__cleanup__();
    }
  }

  hookCleanups.add(destroy);

  return {
    hook,
    pushes,
    destroy,
    pushHookEvent,
    dispatchServerEvent(name: string, payload: unknown) {
      window.dispatchEvent(new CustomEvent(`phx:${name}`, { detail: payload }));
    },
  };
}
