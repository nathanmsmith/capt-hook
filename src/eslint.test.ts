import { describe, it } from "vitest";
import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import plugin from "./eslint.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({ languageOptions: { parser: tsParser } });
const rule = plugin.rules["require-super-lifecycle"];
const IMPORT = 'import { Hook } from "@nmsmith/capt-hook";\n';

ruleTester.run("require-super-lifecycle", rule, {
  valid: [
    IMPORT + "class A extends Hook { mounted() { super.mounted(); } destroyed() { super.destroyed(); } }",
    IMPORT + "class A extends Hook { mounted() { if (x) { super.mounted(); } } }",
    IMPORT + "class A extends Hook { mounted() { queueMicrotask(() => super.mounted()); } }",
    IMPORT + "class A extends Hook { updated() {} }",
    IMPORT + "class A extends Hook { static mounted() {} }",
    IMPORT + "const A = class extends Hook { mounted() { super.mounted(); } };",
    'import { Hook as Base } from "@nmsmith/capt-hook";\nclass A extends Base { mounted() { super.mounted(); } }',
    // Not a capt-hook Hook
    'import { Hook } from "other";\nclass A extends Hook { mounted() {} }',
    "class A extends Hook { mounted() {} }",
    IMPORT + "class A extends Other { mounted() {} }",
  ],
  invalid: [
    {
      code: IMPORT + "class A extends Hook { mounted() {} }",
      errors: [{ messageId: "missingSuper", data: { name: "mounted" } }],
    },
    {
      code: IMPORT + "class A extends Hook { destroyed() { cleanup(); } }",
      errors: [{ messageId: "missingSuper", data: { name: "destroyed" } }],
    },
    {
      code: IMPORT + "class A extends Hook { mounted() { super.destroyed(); } destroyed() { super.mounted(); } }",
      errors: [
        { messageId: "missingSuper", data: { name: "mounted" } },
        { messageId: "missingSuper", data: { name: "destroyed" } },
      ],
    },
    {
      code: 'import { Hook as Base } from "@nmsmith/capt-hook";\nclass A extends Base { mounted() {} }',
      errors: [{ messageId: "missingSuper" }],
    },
    {
      code: IMPORT + "class A extends Hook<HTMLTextAreaElement> { mounted() {} }",
      errors: [{ messageId: "missingSuper" }],
    },
    {
      code: IMPORT + "const A = class extends Hook { mounted() {} };",
      errors: [{ messageId: "missingSuper" }],
    },
    {
      // A nested class's super call doesn't count for the outer method
      code: IMPORT + "class A extends Hook { mounted() { class B extends Hook { mounted() { super.mounted(); } } } }",
      errors: [{ messageId: "missingSuper", line: 2, column: 24 }],
    },
  ],
});
