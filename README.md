# Capt Hook

I've been writing [Phoenix
LiveView](https://github.com/phoenixframework/phoenix_live_view) lately, but I
found it hard to organize my JavaScript hooks. Enter Capt Hook.

```
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
