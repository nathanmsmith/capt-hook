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

## Example

I find Capt Hook works best when you think of your hooks and elements as
"components" as opposed to reusable chunks of frontend logic.

For example, let's suppose we have an autosaving note editor that lives inside a
LiveComponent, plus a status button somewhere else on the page (say, the header)
that shows when the note was last saved and can trigger a save on demand.

```heex
<%!-- In the layout header --%>
<button id="save-status-button" phx-hook="SaveStatusButton">Save</button>

<%!-- Inside the NoteEditor LiveComponent --%>
<textarea id={"note-#{@note.id}"} phx-hook="NoteTextarea" phx-update="ignore">{@note.body}</textarea>
```

```ts
import { Hook } from "@nmsmith/capt-hook";

// hooks/NoteTextarea.ts
type Saved = { saved_at: string };

class NoteTextarea extends Hook {
  #timer?: number;

  get #textarea() {
    return this.el as HTMLTextAreaElement;
  }

  mounted() {
    super.mounted();

    this.el.addEventListener("input", () => {
      clearTimeout(this.#timer);
      this.#timer = window.setTimeout(() => this.#save(), 500);
    });

    // The server replaces the draft, e.g. when someone else edits the note
    this.handleFromServer<{ body: string }>("note:replaced", ({ body }) => {
      this.#textarea.value = body;
    });

    // Other hooks on the page can ask for an immediate save
    this.handleFromClient("note:save-now", () => this.#save());
  }

  destroyed() {
    clearTimeout(this.#timer);
    super.destroyed();
  }

  #save() {
    clearTimeout(this.#timer);
    this.pushToServer("autosave", { body: this.#textarea.value }, (reply: Saved) => {
      this.pushToClient<Saved>("note:saved", reply);
    });
  }
}

// hooks/SaveStatusButton.ts
class SaveStatusButton extends Hook {
  mounted() {
    super.mounted();
    this.el.addEventListener("click", () => this.pushToClient("note:save-now"));

    this.handleFromClient<Saved>("note:saved", ({ saved_at }) => {
      this.el.textContent = `Saved ${new Date(saved_at).toLocaleTimeString()}`;
    });
  }
}

// app.js
let liveSocket = new LiveSocket("/live", Socket, { hooks: { NoteTextarea, SaveStatusButton }, ... });
```


Every Hook is defined as a subclass of `Hook`. Each hook/class can declare
private state and methods with `#`. (See [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Private_elements) for details.)

On the server, `autosave` is handled by the `NoteEditor` component, with no
`phx-target` needed:

```elixir
def handle_event("autosave", %{"body" => body}, socket) do
  note = Notes.update_note!(socket.assigns.note, %{body: body})
  {:reply, %{saved_at: DateTime.utc_now()}, assign(socket, note: note)}
end
```

and `note:replaced` is sent with `push_event`:

```elixir
push_event(socket, "note:replaced", %{body: note.body})
```

What Capt Hook takes care of here:

* **Routing.** `autosave` goes to the `NoteEditor` component because the
  textarea is inside it. No `phx-target`, no `pushEventTo` selector.
* **Hook-to-hook messaging.** `NoteTextarea` and `SaveStatusButton` live in
  different parts of the page and don't know about each other. They talk
  through `pushToClient` / `handleFromClient`.
* **Cleanup.** When the user navigates to another note and the editor is
  removed, its `note:save-now` listener is removed from `window` too.
* **Types.** Payloads are typed on both ends, so `saved_at` is checked in
  `SaveStatusButton` and `body` in `note:replaced`.

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
this.pushToServer<{ body: string }>("autosave", { body: "Hello" });
this.handleFromServer<{ body: string }>("note:replaced", ({ body }) => { ... });
this.pushToClient<{ saved_at: string }>("note:saved", { saved_at: "2026-11-21T12:00:00Z" });
this.handleFromClient<{ saved_at: string }>("note:saved", ({ saved_at }) => { ... });
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

To catch this at lint time, add the bundled ESLint rule (ESLint 9+, flat
config) to `eslint.config.js`:

```js
import captHook from "@nmsmith/capt-hook/eslint";

export default [
  // ...
  captHook.configs.recommended,
];
```

The rule (`capt-hook/require-super-lifecycle`) checks classes that directly
extend `Hook` imported from `@nmsmith/capt-hook`.

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
