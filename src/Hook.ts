import { ViewHook } from "phoenix_live_view";

type OnReply = (reply: any, ref: number) => any;

/**
 * Base class for Phoenix LiveView hooks.
 *
 * Extends `ViewHook` with ergonomic wrappers for pushing/handling events
 * between the server and client, automatic cleanup of `window` listeners on
 * destroy, and a resolved push target scoped to the nearest LiveComponent.
 */
class Hook extends ViewHook {
  #target: HTMLElement | string | undefined;

  // mounted() — Called once, when the element is first added to the DOM and the hook is attached. This is where you set up event listeners, initialize third-party libraries, read initial state from the element, etc. The element (this.el) is in the DOM at this point.
  mounted() {
    super.mounted();
    this.#target = this.#resolveTarget();
  }

  #listeners: Array<[string, EventListener]> = [];

  destroyed() {
    for (const [event, listener] of this.#listeners) {
      window.removeEventListener(event, listener);
    }

    super.destroyed();
  }

  // destroyed() — Called when the element is removed from the DOM (either because the server stopped rendering it or because the LiveView itself unmounted). Tear down listeners, cancel timers, dispose of library instances. The element is already gone or about to be, so don't try to interact with it.

  // beforeUpdate() — Called before LiveView patches the element due to a server diff. Useful for capturing state that the patch might destroy — scroll position, input selection, focus — so you can restore it in updated.
  // updated() — Called after LiveView patches the element. The DOM has new content; if you cached something in beforeUpdate, restore it here. Also where you'd re-sync any third-party library that needs to know the DOM changed.
  beforeUpdate() {}

  afterUpdate() {}
  updated() {
    this.afterUpdate();
  }

  // disconnected() — Called when the LiveView's WebSocket connection drops. The element stays in the DOM, but you've lost the live link to the server. You might use this to show a "reconnecting" indicator or pause behavior that depends on the server.
  // reconnected() — Called when the WebSocket reconnects after a disconnection. Counterpart to disconnected — clear the indicator, resume, possibly re-push any state the server needs to know about.
  onDisconnect() {
    this.disconnected();
  }
  onReconnect() {
    this.reconnected();
  }

  /**
   * Pushes a LiveView event scoped to the nearest component (or LiveView).
   */
  pushToServer<T extends object>(event: string, payload: T, callback?: OnReply) {
    if (callback) {
      return this.pushEventTo(this.#target!, event, payload, callback);
    }
    return this.pushEventTo(this.#target!, event, payload);
  }

  /** Handles an event pushed from the server to this hook. */
  handleFromServer<T extends object>(event: string, callback: (payload: T) => void) {
    return this.handleEvent(event, callback);
  }

  /** Dispatches a `CustomEvent` on `window` for other client-side listeners. */
  pushToClient<T extends object>(event: string, detail?: T) {
    window.dispatchEvent(new CustomEvent(event, { detail }));
  }

  /**
   * Listens for a `CustomEvent` on `window`. The listener is automatically
   * removed when the hook is destroyed.
   */
  handleFromClient<T extends object>(event: string, callback: (detail: T) => void) {
    const listener = (e: Event) => callback((e as CustomEvent).detail);
    this.#listeners.push([event, listener]);
    window.addEventListener(event, listener);
  }

  /**
   * Resolves the push target for this hook's element.
   *
   * Returns `data-target` if explicitly set, otherwise walks up the DOM to
   * find the nearest LiveComponent root (`[data-phx-component]`). Falls back
   * to `undefined` if neither is present, which causes `pushEventTo` to
   * target the LiveView itself.
   */
  #resolveTarget(): HTMLElement | string {
    if (this.el.dataset.target) {
      return this.el.dataset.target;
    }
    return this.el.closest<HTMLElement>("[data-phx-component]") ?? this.el;
  }
}

export { Hook };
