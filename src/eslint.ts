import type { ESLint, Linter, Rule } from "eslint";
import type { Class } from "estree";

const PACKAGE = "@nmsmith/capt-hook";
const LIFECYCLE_METHODS = new Set(["mounted", "destroyed"]);

/**
 * Requires `mounted()` and `destroyed()` overrides in `Hook` subclasses to
 * call `super.mounted()` / `super.destroyed()`.
 */
const requireSuperLifecycle: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Require `super.mounted()` and `super.destroyed()` in Hook subclasses",
    },
    messages: {
      missingSuper: "`{{name}}()` must call `super.{{name}}()`.",
    },
    schema: [],
  },
  create(context) {
    // Local names `Hook` is imported as, e.g. `import { Hook as Base } ...`
    const hookNames = new Set<string>();
    // One entry per lifecycle method being visited, tracking whether it has
    // called super yet
    const stack: Array<{ node: Rule.Node; name: string; calledSuper: boolean }> = [];

    const isHookSubclass = (node: Rule.Node) => {
      if (node.type !== "ClassBody") return false;
      const { superClass } = node.parent as Class;
      return superClass?.type === "Identifier" && hookNames.has(superClass.name);
    };

    return {
      ImportDeclaration(node) {
        if (node.source.value !== PACKAGE) return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === "ImportSpecifier" &&
            specifier.imported.type === "Identifier" &&
            specifier.imported.name === "Hook"
          ) {
            hookNames.add(specifier.local.name);
          }
        }
      },

      MethodDefinition(node) {
        if (
          node.kind === "method" &&
          !node.static &&
          !node.computed &&
          node.key.type === "Identifier" &&
          LIFECYCLE_METHODS.has(node.key.name) &&
          isHookSubclass(node.parent)
        ) {
          stack.push({ node, name: node.key.name, calledSuper: false });
        }
      },

      CallExpression(node) {
        const current = stack.at(-1);
        if (
          current &&
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "Super" &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === current.name
        ) {
          current.calledSuper = true;
        }
      },

      "MethodDefinition:exit"(node: Rule.Node) {
        const current = stack.at(-1);
        if (current?.node !== node) return;
        stack.pop();
        if (!current.calledSuper) {
          context.report({ node, messageId: "missingSuper", data: { name: current.name } });
        }
      },
    };
  },
};

const plugin = {
  meta: { name: `${PACKAGE}/eslint` },
  rules: { "require-super-lifecycle": requireSuperLifecycle },
  configs: {} as Record<string, Linter.Config>,
} satisfies ESLint.Plugin;

plugin.configs.recommended = {
  plugins: { "capt-hook": plugin },
  rules: { "capt-hook/require-super-lifecycle": "error" },
};

export default plugin;
