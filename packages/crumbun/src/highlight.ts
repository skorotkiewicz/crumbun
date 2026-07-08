const KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "finally",
  "for",
  "from",
  "function",
  "get",
  "if",
  "implements",
  "import",
  "in",
  "infer",
  "instanceof",
  "interface",
  "keyof",
  "let",
  "namespace",
  "new",
  "of",
  "readonly",
  "return",
  "satisfies",
  "set",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "try",
  "type",
  "typeof",
  "var",
  "void",
  "while",
  "yield",
]);

const BOOLEANS = new Set(["true", "false", "null", "undefined", "NaN", "Infinity"]);

const SHELL_BUILTINS = new Set(["bun", "bunx", "cd", "echo", "export", "git", "mkdir", "npm", "open", "rm"]);

const BUILTINS = new Set([
  "Bun",
  "PageContext",
  "Request",
  "Response",
  "URL",
  "URLSearchParams",
  "Headers",
  "JSON",
  "Math",
  "Object",
  "Array",
  "String",
  "Number",
  "Boolean",
  "Symbol",
  "Promise",
  "console",
  "process",
  "globalThis",
  "document",
  "window",
  "string",
  "number",
  "boolean",
  "object",
  "unknown",
  "any",
  "never",
  "createApp",
  "exportStatic",
  "highlightCode",
  "json",
  "render",
  "serve",
]);

// ponytail: tokens after these read as type names (generics, annotations, aliases)
const TYPE_HINTS = new Set(["as", "extends", "implements", "interface", "type", "class", "enum", "new", ":", "<", ">", "&", "|"]);

export const highlightCss = `
.cb-comment { color: #6f6f78; font-style: italic; }
.cb-string { color: #9ece6a; }
.cb-regex { color: #b4f9f8; }
.cb-number, .cb-boolean { color: #ff9e64; }
.cb-keyword { color: #7aa2f7; }
.cb-builtin { color: #e0af68; }
.cb-function { color: #7dcfff; }
.cb-type { color: #bb9af7; }
.cb-property { color: #73daca; }
.cb-variable { color: #f7768e; }
.cb-operator { color: #89ddff; }
.cb-punct { color: #c0caf5; }
.cb-decorator { color: #bb9af7; }
`.trim();

export function highlightCode(source: string, language = "text") {
  const lang = language.toLowerCase();
  const isShell = lang === "sh" || lang === "bash" || lang === "shell" || lang === "zsh";
  const re = tokenRegex(isShell);
  let html = "";
  let index = 0;
  let prev = "";

  for (const match of source.matchAll(re)) {
    const token = match[0];
    const start = match.index ?? 0;
    html += escapeHtml(source.slice(index, start));

    let cls: string | null = null;
    if (token.startsWith("/*") || token.startsWith("//") || (isShell && token.startsWith("#"))) {
      cls = "cb-comment";
    } else if (isShell && token.startsWith("$")) {
      cls = "cb-variable";
    } else if (token.startsWith("`") || token.startsWith("\"") || token.startsWith("'")) {
      cls = "cb-string";
    } else if (/^\/(?![/*])/.test(token)) {
      cls = "cb-regex";
    } else if (token.startsWith("@")) {
      cls = "cb-decorator";
    } else if (isShell && /^--?[\w-]/.test(token)) {
      cls = "cb-property";
    } else if (/^\d|^(\.\d)/.test(token)) {
      cls = "cb-number";
    } else if (/^[A-Za-z_$]/.test(token)) {
      const rest = source.slice(start + token.length);
      const nextMatch = rest.match(/\S/);
      const next = nextMatch ? nextMatch[0] : "";
      cls = classifyIdent(token, prev, next, isShell);
    } else if (/^[=+\-*/%&|^!~?:<>]/.test(token)) {
      cls = "cb-operator";
    } else if (/^[(){}[\];,.]/.test(token)) {
      cls = "cb-punct";
    }

    if (cls) {
      html += `<span class="${cls}">${escapeHtml(token)}</span>`;
    } else {
      html += escapeHtml(token);
    }

    if (cls !== "cb-comment" && /\S/.test(token)) prev = token;
    index = start + token.length;
  }

  return html + escapeHtml(source.slice(index));
}

function classifyIdent(token: string, prev: string, next: string, isShell: boolean): string | null {
  if (prev === ".") return "cb-property";
  if (isShell && SHELL_BUILTINS.has(token)) return "cb-builtin";
  if (KEYWORDS.has(token)) return "cb-keyword";
  if (BOOLEANS.has(token)) return "cb-boolean";
  if (BUILTINS.has(token)) return "cb-builtin";
  if (next === ":" && (prev === "{" || prev === "," || prev === ";")) return "cb-property";
  if (next === "(") return "cb-function";
  if (/^[A-Z]/.test(token)) return "cb-type";
  if (TYPE_HINTS.has(prev)) return "cb-type";
  return null;
}

function tokenRegex(isShell: boolean) {
  const comment = isShell
    ? "\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*|#[^\\n]*"
    : "\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*";
  const shellTokens = isShell ? ["\\$\\{?[A-Za-z_][\\w]*\\}?", "--?[A-Za-z][\\w-]*(?:=[^\\s]+)?"] : [];

  return new RegExp(
    [
      comment,
      "`(?:\\\\.|[^`\\\\])*`",
      "\"(?:\\\\.|[^\"\\\\])*\"",
      "'(?:\\\\.|[^'\\\\])*'",
      "\\/(?![/*\\s])(?:\\\\.|\\[(?:\\\\.|[^\\]\\\\])*\\]|[^\\/\\\\\\n])+\\/[dgimsuvy]*",
      ...shellTokens,
      "@[A-Za-z_$][\\w$]*",
      "\\b0[xX][\\da-fA-F]+\\b|\\b0[bB][01]+\\b|\\b0[oO][0-7]+\\b|\\b\\d[\\d_]*\\.?\\d*(?:[eE][+-]?\\d+)?\\b|\\B\\.\\d+\\b",
      "[A-Za-z_$][\\w$]*",
      "\\.\\.\\.|=>|\\?\\?|\\?\\.|<<=?|>>=?|===|!==|==|!=|<=|>=|\\+\\+|--|\\*\\*|[=+\\-*/%&|^!~?:<>]",
      "[(){}[\\];,.]",
      "\\s+",
      "[^\\s]",
    ].join("|"),
    "g",
  );
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
