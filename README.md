# Capt Hook

[![CI](https://github.com/nathanmsmith/capt-hook/actions/workflows/ci.yml/badge.svg)](https://github.com/nathanmsmith/capt-hook/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/nathanmsmith/capt-hook/graph/badge.svg)](https://codecov.io/gh/nathanmsmith/capt-hook)


![./capt-hook.png]

You're probably familiar with [Phoenix Liveview
Hooks](https://phoenix-live-view.hexdocs.pm/js-interop.html). Capt Hook is a
more organizable (imo) way to write hooks.


You might have
something like this in your Heex:

```html
<input type="text" name="user[phone_number]" id="user-phone-number" phx-hook="PhoneNumber" />
```

With Capt Hook, the hook is written as:
```ts
// TODO: rewrite in hook style
let Hooks = {}
Hooks.PhoneNumber = {
  mounted() {
    this.el.addEventListener("input", e => {
      let match = this.el.value.replace(/\D/g, "").match(/^(\d{3})(\d{3})(\d{4})$/)
      if(match) {
        this.el.value = `${match[1]}-${match[2]}-${match[3]}`
      }
    })
  }
}

let liveSocket = new LiveSocket("/live", Socket, {hooks: Hooks, ...})
...
```


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

## Further Reading
https://phoenix-live-view.hexdocs.pm/js-interop.html#client-hooks-via-phx-hook
