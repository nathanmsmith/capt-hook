# Capt Hook

[![CI](https://github.com/nathanmsmith/capt-hook/actions/workflows/ci.yml/badge.svg)](https://github.com/nathanmsmith/capt-hook/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/nathanmsmith/capt-hook/graph/badge.svg)](https://codecov.io/gh/nathanmsmith/capt-hook)


![Capt Hook](docs/capt-hook.png)

You're probably familiar with [Phoenix Liveview
Hooks](https://phoenix-live-view.hexdocs.pm/js-interop.html). Capt Hook is a
more organizable (imo) way to write hooks.

## Installation

Requires Phoenix LiveView 1.1.9 or later. From your Phoenix project's root:

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

class NoteTextarea extends Hook<HTMLTextAreaElement> {
  #timer?: number;

  #save() {
    clearTimeout(this.#timer);
    this.pushToServer("autosave", { body: this.el.value }, (reply: Saved) => {
      this.pushToClient<Saved>("note:saved", reply);
    });
  }

  mounted() {
    super.mounted();

    this.el.addEventListener("input", () => {
      clearTimeout(this.#timer);
      this.#timer = window.setTimeout(() => this.#save(), 500);
    });

    // The server replaces the draft, e.g. when someone else edits the note
    this.handleFromServer<{ body: string }>("note:replaced", ({ body }) => {
      this.el.value = body;
    });

    // Other hooks on the page can ask for an immediate save
    this.handleFromClient("note:save-now", () => this.#save());
  }

  destroyed() {
    clearTimeout(this.#timer);
    super.destroyed();
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

Every Hook is defined as a subclass of `Hook`. If you're using TypeScript,
`Hook` takes an optional subclass of `HTMLElement`, this is the type of `this.el`.

### Lifecycle Methods

Every hook has the same [lifecycle methods](https://phoenix-live-view.hexdocs.pm/js-interop.html#client-hooks-via-phx-hook)
as LiveView:

* `mounted` - the element has been added to the DOM and its server LiveView has finished mounting
* `destroyed` - the element has been removed from the page, either by a parent update, or by the parent being removed entirely
* `beforeUpdate(toEl)` - the element is about to be updated in the DOM. toEl is a detached element carrying the update that is about to be applied, while this.el is still the unmodified element as it currently exists in the DOM. This is the per-element counterpart to the dom option's onBeforeElUpdated callback described below. Note: any call here must be synchronous as the operation cannot be deferred or cancelled.
* `afterUpdate` (or `updated`) - the element has been updated in the DOM by the server. Note: window.location may not reflect the current URL during this callback. For navigation-aware logic, use the phx:navigate event instead.
* `disconnected` - the element's parent LiveView has disconnected from the server
* `reconnected` - the element's parent LiveView has reconnected to the server

### Private elements

In addition, each hook/class can declare private state and methods with `#`.
(See
[MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Private_elements)
for details.) I find that this allows for better code organization than just
stuffing everything in the lifecycle methods. It reminds me a bit of React
[class components](https://react.dev/reference/react/Component).

### Working with server events

On the server, `autosave` is handled directly by the `NoteEditor` component, with no
`phx-target` needed!

```elixir
defmodule MyAppWeb.NoteEditor do
  use MyAppWeb, :live_component

  alias MyApp.Notes

  def render(assigns) do
    ~H"""
    <textarea id={"note-#{@note.id}"} phx-hook="NoteTextarea" phx-update="ignore">{@note.body}</textarea>
    """
  end

  # The parent LiveView passes in a new note, e.g. after someone else edits it
  def update(%{note: note} = assigns, socket) do
    socket =
      if socket.assigns[:note] && socket.assigns.note.body != note.body do
        push_event(socket, "note:replaced", %{body: note.body})
      else
        socket
      end

    {:ok, assign(socket, assigns)}
  end

  def handle_event("autosave", %{"body" => body}, socket) do
    note = Notes.update_note!(socket.assigns.note, %{body: body})
    {:reply, %{saved_at: DateTime.utc_now()}, assign(socket, note: note)}
  end
end
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

### What to clean up in `destroyed()`

LiveView only calls `destroyed()` when the hook's element is removed from the
page (or the whole LiveView goes away). Listeners on `this.el` go with it, so
you don't need to remove them. You do need to clean up anything that outlives
the element:

* Listeners on `window`, `document`, or other elements that stay on the page.
  (`handleFromClient` listeners are removed for you.)
* Timers and intervals (`clearTimeout`, `clearInterval`).
* Third-party library instances (call their `destroy()`/`dispose()`).
* Observers (`ResizeObserver`, `IntersectionObserver`, `MutationObserver`).

```ts
class Chart extends Hook {
  #chart?: ChartLib;
  #onResize = () => this.#chart?.resize();

  mounted() {
    super.mounted();
    this.#chart = new ChartLib(this.el);
    window.addEventListener("resize", this.#onResize);
  }

  destroyed() {
    window.removeEventListener("resize", this.#onResize);
    this.#chart?.destroy();
    super.destroyed();
  }
}
```

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
