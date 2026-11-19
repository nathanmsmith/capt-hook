# Capt Hook

[![CI](https://github.com/nathanmsmith/capt-hook/actions/workflows/ci.yml/badge.svg)](https://github.com/nathanmsmith/capt-hook/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/nathanmsmith/capt-hook/graph/badge.svg)](https://codecov.io/gh/nathanmsmith/capt-hook)


![./capt-hook.png]

You're probably familiar with [Phoenix Liveview
Hooks](https://phoenix-live-view.hexdocs.pm/js-interop.html). Capt Hook is a
more organizable (imo) way to write hooks.


You might have something like this in your Heex:

```html
<input type="text" name="user[phone_number]" id="user-phone-number" phx-hook="PhoneNumber" />
```

With Capt Hook, the hook is written as:
```ts
import { Hook } from "@nmsmith/capt-hook";

class PhoneNumber extends Hook {
  mounted() {
    super.mounted();
    this.el.addEventListener("input", () => this.#format());
  }

  #format() {
    const input = this.el as HTMLInputElement;
    const match = input.value.replace(/\D/g, "").match(/^(\d{3})(\d{3})(\d{4})$/);
    if (match) {
      input.value = `${match[1]}-${match[2]}-${match[3]}`;
    }
  }
}

// main.js
let liveSocket = new LiveSocket("/live", Socket, { hooks: { PhoneNumber }, ... });
...
```

## Event helpers

Capt Hook takes advantage of class definition syntax of phx-hooks to provide a
few reusable helpers:

* `pushToServer` - Pushes a LiveView event scoped to the nearest component (or LiveView).
* `handleFromServer` - Pushes a LiveView event scoped to the nearest component (or LiveView).
* `pushToClient` - Dispatches a `CustomEvent` on `window` for other client-side listeners.
* `handleFromClient` - Listens for a `CustomEvent` on `window`.

This is mainly a wrapper around `pushEventTo` and `handleEvent`. The entire hook
definition is [<100 lines of code](src/Hook.ts).
