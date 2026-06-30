import { describe, it, expect, vi } from "vitest";
import { Hook } from "./Hook";
import { makeHook } from "./__tests__/helpers";

describe("Hook", () => {
  describe("#resolveTarget", () => {
    it("uses data-target when set", () => {
      const el = document.createElement("div");
      el.dataset.target = "#my-component";
      const { hook, view } = makeHook(Hook, el);
      hook.mounted();
      hook.pushToServer("event", {});
      expect(view.withinTargets).toHaveBeenCalledWith("#my-component", expect.any(Function));
    });

    it("uses the nearest [data-phx-component] ancestor when no data-target", () => {
      const parent = document.createElement("div");
      parent.setAttribute("data-phx-component", "1");
      const el = document.createElement("div");
      parent.appendChild(el);
      const { hook, view } = makeHook(Hook, el);
      hook.mounted();
      hook.pushToServer("event", {});
      expect(view.withinTargets).toHaveBeenCalledWith(parent, expect.any(Function));
    });

    it("falls back to el when neither data-target nor [data-phx-component] ancestor is present", () => {
      const el = document.createElement("div");
      const { hook, view } = makeHook(Hook, el);
      hook.mounted();
      hook.pushToServer("event", {});
      expect(view.withinTargets).toHaveBeenCalledWith(el, expect.any(Function));
    });
  });

  describe("pushToServer", () => {
    it("passes the event and payload to pushHookEvent", () => {
      const el = document.createElement("div");
      const { hook, pushHookEvent } = makeHook(Hook, el);
      hook.mounted();
      hook.pushToServer("my-event", { foo: "bar" });
      expect(pushHookEvent).toHaveBeenCalledWith(el, null, "my-event", { foo: "bar" });
    });

    it("invokes the reply callback when pushHookEvent resolves", async () => {
      const el = document.createElement("div");
      const { hook } = makeHook(Hook, el);
      hook.mounted();
      const onReply = vi.fn();
      hook.pushToServer("my-event", {}, onReply);
      await Promise.resolve();
      expect(onReply).toHaveBeenCalledWith({ ok: true }, 1);
    });
  });

  describe("handleFromServer", () => {
    it("calls the callback when a phx: window event is dispatched", () => {
      const el = document.createElement("div");
      const { hook } = makeHook(Hook, el);
      const callback = vi.fn();
      hook.handleFromServer("test-event", callback);
      window.dispatchEvent(new CustomEvent("phx:test-event", { detail: { data: 42 } }));
      expect(callback).toHaveBeenCalledWith({ data: 42 });
    });
  });

  describe("pushToClient", () => {
    it("dispatches a CustomEvent on window with the given detail", () => {
      const el = document.createElement("div");
      const { hook } = makeHook(Hook, el);
      const listener = vi.fn();
      window.addEventListener("my-event", listener);
      hook.pushToClient("my-event", { value: 1 });
      expect(listener).toHaveBeenCalled();
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ value: 1 });
      window.removeEventListener("my-event", listener);
    });
  });

  describe("handleFromClient", () => {
    it("calls the callback when the event is dispatched on window", () => {
      const el = document.createElement("div");
      const { hook } = makeHook(Hook, el);
      const callback = vi.fn();
      hook.handleFromClient("my-event", callback);
      window.dispatchEvent(new CustomEvent("my-event", { detail: { x: 99 } }));
      expect(callback).toHaveBeenCalledWith({ x: 99 });
    });

    it("stops calling the callback after destroyed()", () => {
      const el = document.createElement("div");
      const { hook } = makeHook(Hook, el);
      const callback = vi.fn();
      hook.handleFromClient("my-event", callback);
      hook.destroyed();
      window.dispatchEvent(new CustomEvent("my-event", { detail: {} }));
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("updated", () => {
    it("calls afterUpdate()", () => {
      const el = document.createElement("div");
      const { hook } = makeHook(Hook, el);
      const spy = vi.spyOn(hook, "afterUpdate");
      hook.updated();
      expect(spy).toHaveBeenCalled();
    });
  });
});
