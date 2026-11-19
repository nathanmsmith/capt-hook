# Capt Hook

[![CI](https://github.com/nathanmsmith/capt-hook/actions/workflows/ci.yml/badge.svg)](https://github.com/nathanmsmith/capt-hook/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/nathanmsmith/capt-hook/graph/badge.svg)](https://codecov.io/gh/nathanmsmith/capt-hook)


![Capt Hook](docs/capt-hook.png)

You're probably familiar with [Phoenix Liveview
Hooks](https://phoenix-live-view.hexdocs.pm/js-interop.html). Capt Hook is a
more organizable (imo) way to write hooks.

## Installation

Requires Phoenix LiveView 1.1.2 or later. From your Phoenix project's root:

```sh
npm install @nmsmith/capt-hook --prefix assets
```


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
    this.el.addEventListener("blur", () => {
      this.pushToServer("validate_phone", { value: (this.el as HTMLInputElement).value });
    });

    this.handleFromServer<{ valid: boolean }>("phone_validated", ({ valid }) => {
      this.el.classList.toggle("invalid", !valid);
    });
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

On the server, `validate_phone` goes to the nearest LiveComponent (or the
LiveView), and `phone_validated` is sent back with `push_event`:

```elixir
def handle_event("validate_phone", %{"value" => value}, socket) do
  valid = Regex.match?(~r/^\d{3}-\d{3}-\d{4}$/, value)
  {:noreply, push_event(socket, "phone_validated", %{valid: valid})}
end
```

## Event helpers

Capt Hook takes advantage of class definition syntax of phx-hooks to provide a
few reusable helpers:

* `pushToServer` - Pushes a LiveView event scoped to the nearest component (or LiveView).
* `handleFromServer` - Handles an event pushed from the server to this hook.
* `pushToClient` - Dispatches a `CustomEvent` on `window` for other client-side listeners.
* `handleFromClient` - Listens for a `CustomEvent` on `window`.

This is mainly a wrapper around `pushEventTo` and `handleEvent`. The entire hook
definition is [<100 lines of code](src/Hook.ts).

Each helper takes a type parameter for its payload:

```ts
this.pushToServer<{ value: string }>("validate_phone", { value: "555-555-5555" });
this.handleFromServer<{ valid: boolean }>("phone_validated", ({ valid }) => { ... });
this.pushToClient<{ id: string }>("item:selected", { id: "42" });
this.handleFromClient<{ id: string }>("item:selected", ({ id }) => { ... });
```

### Replies

`pushToServer` takes an optional callback that receives the server's reply and
the push's ref:

```ts
this.pushToServer("save", { value }, (reply, ref) => {
  console.log(reply.status);
});
```

```elixir
def handle_event("save", %{"value" => value}, socket) do
  {:reply, %{status: "ok"}, socket}
end
```

### Where `pushToServer` sends events

The target is resolved once, when the hook mounts:

1. The element's `data-target` attribute, if set. It's passed to `pushEventTo`,
   so it should be a CSS selector for the target component's element.
2. Otherwise, the nearest LiveComponent containing the element.
3. Otherwise, the LiveView.

```html
<div phx-hook="Chart" id="chart" data-target="#sidebar-component">
```

### Client event cleanup

Listeners added with `handleFromClient` are removed from `window` automatically
when the hook is destroyed, so you don't need to track them yourself.

## Lifecycle

If you override `mounted()` or `destroyed()`, call `super`:

```ts
class Chart extends Hook {
  mounted() {
    super.mounted(); // resolves the pushToServer target
    // ...
  }

  destroyed() {
    // ...
    super.destroyed(); // removes handleFromClient listeners
  }
}
```

Skipping `super.mounted()` means `pushToServer` has no target, and skipping
`super.destroyed()` leaves `handleFromClient` listeners attached to `window`.

`Hook` also defines a few extra lifecycle methods:

* `afterUpdate()` - Called from `updated()`. Override it instead of `updated()`;
  if you override `updated()` directly, call `super.updated()` or `afterUpdate()`
  won't run.
* `onDisconnect()` / `onReconnect()` - Call `disconnected()` / `reconnected()`.

## Development

```sh
npm install
npm test             # run tests in watch mode
npm run coverage     # run tests once with coverage
npm run lint
npm run build        # compile to dist/
```

## License

[MIT](LICENSE)
