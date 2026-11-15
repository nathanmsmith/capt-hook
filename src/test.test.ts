import { afterEach, describe, expect, it, vi } from "vitest";
import { Hook } from "./Hook.js";
import { cleanupAllHooks, makeHook } from "./test.js";

afterEach(() => {
  cleanupAllHooks();
  document.body.replaceChildren();
});

class ExampleHook extends Hook {
  mounts = 0;
  destroys = 0;
  clientPayloads: unknown[] = [];
  serverPayloads: unknown[] = [];
  phoenixPayloads: unknown[] = [];

  mounted() {
    super.mounted();
    this.mounts++;
    this.handleFromClient("client-message", (payload) => this.clientPayloads.push(payload));
    this.handleFromServer("server-message", (payload) => this.serverPayloads.push(payload));
    this.handleEvent("phoenix-message", (payload) => this.phoenixPayloads.push(payload));
    this.el.addEventListener("click", this.onClick);
  }

  destroyed() {
    this.destroys++;
    this.el.removeEventListener("click", this.onClick);
    super.destroyed();
  }

  private onClick = () => this.pushToServer("clicked", { count: this.mounts });
}

describe("cleanupAllHooks", () => {
  it("destroys every helper, including unmounted hooks, and removes their listeners", () => {
    const first = makeHook(ExampleHook, document.createElement("div"));
    const second = makeHook(ExampleHook, document.createElement("div"));
    const unmounted = makeHook(Hook, document.createElement("div"));
    const onClient = vi.fn();
    const onServer = vi.fn();
    unmounted.hook.handleFromClient("client-message", onClient);
    unmounted.hook.handleEvent("server-message", onServer);
    first.hook.mounted();
    second.hook.mounted();

    cleanupAllHooks();

    first.hook.pushToClient("client-message", {});
    first.dispatchServerEvent("server-message", {});
    first.dispatchServerEvent("phoenix-message", {});
    for (const { hook } of [first, second]) {
      expect(hook.destroys).toBe(1);
      expect(hook.clientPayloads).toEqual([]);
      expect(hook.serverPayloads).toEqual([]);
      expect(hook.phoenixPayloads).toEqual([]);
    }
    expect(onClient).not.toHaveBeenCalled();
    expect(onServer).not.toHaveBeenCalled();
  });

  it("supports manual destruction, repeated cleanup, and newly created helpers", () => {
    const first = makeHook(ExampleHook, document.createElement("div"));
    first.destroy();
    cleanupAllHooks();
    cleanupAllHooks();
    expect(first.hook.destroys).toBe(1);

    const second = makeHook(ExampleHook, document.createElement("div"));
    cleanupAllHooks();
    second.destroy();
    expect(second.hook.destroys).toBe(1);
  });

  it("attempts every teardown and reports all failures without retaining destroyed helpers", () => {
    const errors = [new Error("first teardown failed"), new Error("second teardown failed")];
    let failureIndex = 0;
    class ThrowingHook extends ExampleHook {
      destroyed() {
        super.destroyed();
        throw errors[failureIndex++];
      }
    }
    const first = makeHook(ThrowingHook, document.createElement("div"));
    const second = makeHook(ThrowingHook, document.createElement("div"));
    const last = makeHook(ExampleHook, document.createElement("div"));
    first.hook.mounted();
    second.hook.mounted();
    last.hook.mounted();

    let caught: unknown;
    try {
      cleanupAllHooks();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual(errors);
    last.hook.pushToClient("client-message", {});
    last.dispatchServerEvent("server-message", {});
    last.dispatchServerEvent("phoenix-message", {});
    for (const { hook } of [first, second, last]) {
      expect(hook.destroys).toBe(1);
      expect(hook.clientPayloads).toEqual([]);
      expect(hook.serverPayloads).toEqual([]);
      expect(hook.phoenixPayloads).toEqual([]);
    }
    expect(cleanupAllHooks).not.toThrow();
  });
});

describe("makeHook", () => {
  it("constructs the actual subclass and leaves mounting explicit", () => {
    const { hook, pushes } = makeHook(ExampleHook, document.createElement("div"));
    expect(hook).toBeInstanceOf(ExampleHook);
    expect(hook.mounts).toBe(0);
    expect(pushes).toEqual([]);
    hook.mounted();
    expect(hook.mounts).toBe(1);
    hook.el.click();
    expect(pushes).toEqual([
      { el: hook.el, target: hook.el, event: "clicked", payload: { count: 1 } },
    ]);
  });

  it("runs real client and server listeners, including Phoenix handleEvent", () => {
    const { hook, dispatchServerEvent } = makeHook(ExampleHook, document.createElement("div"));
    hook.mounted();
    hook.pushToClient("client-message", { from: "client" });
    dispatchServerEvent("server-message", { from: "server" });
    dispatchServerEvent("phoenix-message", { from: "phoenix" });
    expect(hook.clientPayloads).toEqual([{ from: "client" }]);
    expect(hook.serverPayloads).toEqual([{ from: "server" }]);
    expect(hook.phoenixPayloads).toEqual([{ from: "phoenix" }]);
  });

  it("keeps Phoenix listener references usable with removeHandleEvent", () => {
    const { hook, dispatchServerEvent } = makeHook(Hook, document.createElement("div"));
    const onEvent = vi.fn();
    const ref = hook.handleFromServer("removable", onEvent);
    dispatchServerEvent("removable", { value: 1 });
    hook.removeHandleEvent(ref);
    dispatchServerEvent("removable", { value: 2 });
    expect(onEvent.mock.calls).toEqual([[{ value: 1 }]]);
  });

  it("removes capt-hook, Phoenix, and subclass listeners on destroy", () => {
    const { hook, pushes, destroy, dispatchServerEvent } = makeHook(ExampleHook, document.createElement("div"));
    hook.mounted();
    destroy();
    destroy();
    hook.pushToClient("client-message", {});
    dispatchServerEvent("server-message", {});
    dispatchServerEvent("phoenix-message", {});
    hook.el.click();
    expect(hook.destroys).toBe(1);
    expect(hook.clientPayloads).toEqual([]);
    expect(hook.serverPayloads).toEqual([]);
    expect(hook.phoenixPayloads).toEqual([]);
    expect(pushes).toEqual([]);
  });

  it("cleans listeners even if the helper was never mounted", () => {
    const { hook, destroy, dispatchServerEvent } = makeHook(Hook, document.createElement("div"));
    const onClient = vi.fn();
    const onServer = vi.fn();
    hook.handleFromClient("before-mount", onClient);
    hook.handleEvent("before-mount", onServer);
    destroy();
    hook.pushToClient("before-mount", {});
    dispatchServerEvent("before-mount", {});
    expect(onClient).not.toHaveBeenCalled();
    expect(onServer).not.toHaveBeenCalled();
  });

  it("cleans Phoenix listeners if the destroyed callback throws", () => {
    class ThrowingHook extends ExampleHook {
      destroyed() {
        super.destroyed();
        throw new Error("teardown failed");
      }
    }
    const { hook, destroy, dispatchServerEvent } = makeHook(ThrowingHook, document.createElement("div"));
    hook.mounted();
    expect(destroy).toThrow("teardown failed");
    dispatchServerEvent("server-message", {});
    dispatchServerEvent("phoenix-message", {});
    expect(hook.serverPayloads).toEqual([]);
    expect(hook.phoenixPayloads).toEqual([]);
  });

  it("can clean up a partially mounted hook", () => {
    class FailedMount extends ExampleHook {
      mounted() {
        super.mounted();
        throw new Error("mount failed");
      }
    }
    const { hook, destroy, dispatchServerEvent } = makeHook(FailedMount, document.createElement("div"));
    expect(() => hook.mounted()).toThrow("mount failed");
    destroy();
    hook.pushToClient("client-message", {});
    dispatchServerEvent("server-message", {});
    dispatchServerEvent("phoenix-message", {});
    expect(hook.destroys).toBe(1);
    expect(hook.clientPayloads).toEqual([]);
    expect(hook.serverPayloads).toEqual([]);
    expect(hook.phoenixPayloads).toEqual([]);
  });

  it("only cleans the destroyed hook's listeners", () => {
    const first = makeHook(ExampleHook, document.createElement("div"));
    const second = makeHook(ExampleHook, document.createElement("div"));
    first.hook.mounted();
    second.hook.mounted();
    first.destroy();
    second.hook.pushToClient("client-message", { value: 1 });
    second.dispatchServerEvent("server-message", { value: 2 });
    second.dispatchServerEvent("phoenix-message", { value: 3 });
    expect(first.hook.clientPayloads).toEqual([]);
    expect(first.hook.serverPayloads).toEqual([]);
    expect(first.hook.phoenixPayloads).toEqual([]);
    expect(second.hook.clientPayloads).toEqual([{ value: 1 }]);
    expect(second.hook.serverPayloads).toEqual([{ value: 2 }]);
    expect(second.hook.phoenixPayloads).toEqual([{ value: 3 }]);
  });

  it("leaves fixture attachment and removal to the caller", () => {
    const el = document.createElement("div");
    const { hook, destroy } = makeHook(Hook, el);
    hook.mounted();
    expect(el.isConnected).toBe(false);
    document.body.appendChild(el);
    destroy();
    expect(el.isConnected).toBe(true);
  });

  it("routes data-target selectors to every matching element instead of the ancestor", async () => {
    document.body.innerHTML = `
      <div data-phx-component="1"><button data-target=".target"></button></div>
      <div class="target"></div><div class="target"></div>
    `;
    const el = document.querySelector("button")!;
    const targets = Array.from(document.querySelectorAll(".target"));
    const { hook, pushes } = makeHook(Hook, el);
    hook.mounted();
    const results = await hook.pushToServer("targeted", { value: 1 });
    expect(pushes.map((push) => push.target)).toEqual(targets);
    expect(results).toEqual([
      { status: "fulfilled", value: { reply: { ok: true }, ref: 1 } },
      { status: "fulfilled", value: { reply: { ok: true }, ref: 2 } },
    ]);
  });

  it("does not fabricate pushes when a selector has no matches", async () => {
    const el = document.createElement("div");
    el.dataset.target = ".missing-target";
    const { hook, pushes } = makeHook(Hook, el);
    hook.mounted();
    expect(await hook.pushToServer("ignored", {})).toEqual([]);
    expect(pushes).toEqual([]);
  });

  it("resolves component IDs for targeted pushes", async () => {
    document.body.innerHTML = '<div data-phx-component="42"></div>';
    const { hook, pushes } = makeHook(Hook, document.createElement("div"));
    await hook.pushEventTo(42, "numeric-target", {});
    await hook.pushEventTo("42", "string-target", {});
    await hook.pushEventTo(99, "missing-target", {});
    expect(pushes.map(({ target, event }) => ({ target, event }))).toEqual([
      { target: 42, event: "numeric-target" },
      { target: 42, event: "string-target" },
    ]);
  });

  it("supports untargeted Phoenix pushes through the same connection", async () => {
    const { hook, pushes } = makeHook(Hook, document.createElement("div"));
    expect(await hook.pushEvent("direct")).toEqual({ ok: true });
    expect(pushes).toEqual([
      { el: hook.el, target: null, event: "direct", payload: {} },
    ]);
  });

  it.each([{ allowed: false }, null, false, undefined])("supports a fixed reply of %j", async (reply) => {
    const { hook } = makeHook(Hook, document.createElement("div"), { reply });
    hook.mounted();
    expect(await hook.pushToServer("configured", {})).toEqual([
      { status: "fulfilled", value: { reply, ref: 1 } },
    ]);
  });

  it("passes replies and increasing references to real Phoenix callbacks", async () => {
    const { hook } = makeHook(Hook, document.createElement("div"), { reply: { allowed: false } });
    hook.mounted();
    const replies: unknown[] = [];
    await new Promise<void>((resolve) => {
      hook.pushToServer("first", {}, (reply, ref) => {
        replies.push({ reply, ref });
        resolve();
      });
    });
    await new Promise<void>((resolve) => {
      hook.pushEvent("second", {}, (reply, ref) => {
        replies.push({ reply, ref });
        resolve();
      });
    });
    expect(replies).toEqual([
      { reply: { allowed: false }, ref: 1 },
      { reply: { allowed: false }, ref: 2 },
    ]);
  });

  it("supports an injected async reply function based on each push", async () => {
    const replyFor = vi.fn(async ({ event, payload }) => ({ event, received: payload }));
    const { hook, pushes } = makeHook(Hook, document.createElement("div"), { replyFor });
    hook.mounted();
    expect(await hook.pushEvent("save", { id: 7 })).toEqual({ event: "save", received: { id: 7 } });
    expect(await hook.pushToServer("delete", { id: 8 })).toEqual([
      { status: "fulfilled", value: { reply: { event: "delete", received: { id: 8 } }, ref: 2 } },
    ]);
    expect(replyFor.mock.calls).toEqual(pushes.map((push) => [push]));
  });

  it("can defer a reply until the test resolves it", async () => {
    let resolveReply!: (reply: unknown) => void;
    const reply = new Promise((resolve) => { resolveReply = resolve; });
    const { hook, pushes } = makeHook(Hook, document.createElement("div"), { replyFor: () => reply });
    hook.mounted();
    const onReply = vi.fn();
    const completed = new Promise<void>((resolve) => {
      hook.pushToServer("pending", {}, (payload, ref) => {
        onReply(payload, ref);
        resolve();
      });
    });
    expect(pushes).toHaveLength(1);
    expect(onReply).not.toHaveBeenCalled();
    resolveReply({ finished: true });
    await completed;
    expect(onReply).toHaveBeenCalledWith({ finished: true }, 1);
  });

  it.each([false, true])("preserves Phoenix rejection behavior (async: %s)", async (asyncReply) => {
    const error = new Error("server unavailable");
    const { hook, pushes } = makeHook(Hook, document.createElement("div"), {
      replyFor: () => {
        if (asyncReply) return Promise.reject(error);
        throw error;
      },
    });
    hook.mounted();
    await expect(hook.pushEvent("direct", {})).rejects.toBe(error);
    expect(await hook.pushToServer("targeted", {})).toEqual([
      { status: "rejected", reason: error },
    ]);
    expect(pushes.map((push) => push.event)).toEqual(["direct", "targeted"]);
  });
});
