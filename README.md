# Capt Hook

I've been writing [Phoenix
LiveView](https://github.com/phoenixframework/phoenix_live_view) lately, but I
found it hard to organize my JavaScript hooks. Enter Capt Hook.

```ts
import { Hook } from "capt-hook";

/**
 * Copies the element's href to the clipboard and temporarily swaps the inner
 * span's text to "link copied" for 2 seconds.
 */
class InvitationLink extends Hook {
  #timer: ReturnType<typeof setTimeout> | null = null;
  #originalText: string | null = null;

  mounted() {
    super.mounted();
    this.#originalText = this.el.textContent;
    this.el.addEventListener("click", (e) => this.#handleClick(e));
  }

  destroyed() {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
    }
    super.destroyed();
  }

  #handleClick(e: Event) {
    e.preventDefault();
    navigator.clipboard.writeText((this.el as HTMLAnchorElement).href).catch(() => {});

    this.el.textContent = "link copied";

    if (this.#timer !== null) {
      clearTimeout(this.#timer);
    }
    this.#timer = setTimeout(() => {
      this.el.textContent = this.#originalText;
      this.#timer = null;
    }, 2000);
  }
}

export { InvitationLink };
```

## Testing hooks

Import `makeHook` from `@nmsmith/capt-hook/test` to construct your actual hook with
a stubbed LiveView connection. The helper has no test runner dependency. Provide
your own DOM fixture and browser API mocks, such as `ResizeObserver`, audio, or
element dimensions.

```ts
import { makeHook } from "@nmsmith/capt-hook/test";
import { InvitationLink } from "./InvitationLink.js";

const el = document.createElement("a");
el.href = "https://example.com/invite";
document.body.appendChild(el);
// Mock navigator.clipboard in your test environment before mounting this hook.
const helper = makeHook(InvitationLink, el);

try {
  helper.hook.mounted();
  el.click();
  // Assert against helper.hook or the updated DOM using your test runner.
} finally {
  helper.destroy();
  el.remove();
}
```

For automatic teardown, register `cleanupAllHooks` with your test runner's
`afterEach`:

```ts
import { cleanupAllHooks } from "@nmsmith/capt-hook/test";

afterEach(() => {
  cleanupAllHooks();
});
```

Every helper created by `makeHook` is registered for cleanup, including helpers
that have not mounted. Calling `destroy()` yourself unregisters that helper.
Repeated cleanup is safe. If teardown throws, cleanup still attempts every hook
and then reports the failures in an `AggregateError`. DOM fixtures and browser
mocks remain your test's responsibility.

`makeHook(HookClass, el, options?)` returns:

- `hook`: the real subclass instance, without replacing its event methods. Call
  `hook.mounted()` to run its mounted lifecycle.
- `destroy()`: runs the destroyed lifecycle once and cleans up both capt-hook
  client listeners and Phoenix server listeners, including direct `handleEvent`
  registrations. Call it during teardown or use `cleanupAllHooks`, even if mounting
  fails. Subclass lifecycle methods should call `super`, as they do in production.
- `dispatchServerEvent(name, payload)`: dispatches a real `phx:` window event, so
  every currently registered listener for that event receives the payload.
- `pushes`: an array of `{ el, target, event, payload }` records, populated
  synchronously by outgoing pushes. `target` is the resolved element or component
  ID, or `null` for an untargeted `pushEvent`.
- `pushHookEvent`: the stub transport function,
  available for inspection or spying with your preferred runner.

Replies default to `{ ok: true }`. Set `reply` for a fixed result, or `replyFor`
to compute each reply from its push. `replyFor` takes precedence and can return a
promise for deferred replies, or throw/reject to simulate a failed push:

```ts
const helper = makeHook(MyHook, el, {
  replyFor: async ({ event, payload }) => {
    if (event === "save") return { saved: true };
    return { allowed: false };
  },
});
```

The real Phoenix methods deliver replies to callbacks or promises, with numeric
references starting at 1 for each helper. You can also inject a runner's spy as
`replyFor`. All targets share one simulated LiveView. Target selectors resolve
against the element's document, including multiple matches; attach selector-based
fixtures before pushing. The helper does not attach or remove DOM elements, mock
browser APIs, or implement a full LiveSocket.

## Further Reading
https://phoenix-live-view.hexdocs.pm/js-interop.html#client-hooks-via-phx-hook
