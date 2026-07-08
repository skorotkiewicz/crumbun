const highlightKeywords = new Set([
  "as",
  "async",
  "await",
  "const",
  "default",
  "else",
  "export",
  "extends",
  "false",
  "from",
  "function",
  "if",
  "import",
  "let",
  "new",
  "null",
  "return",
  "true",
  "type",
]);

const highlightBuiltins = new Set([
  "Bun",
  "PageContext",
  "Request",
  "Response",
  "URL",
  "createApp",
  "exportStatic",
  "highlightCode",
  "json",
  "render",
  "serve",
]);

export function highlightCode(source: string, language = "text") {
  const lang = language.toLowerCase();
  const isShell = lang === "sh" || lang === "bash" || lang === "shell";
  const tokenPattern = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|`(?:\\[\s\S]|[^`\\])*`|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b/g;
  let html = "";
  let index = 0;

  for (const match of source.matchAll(tokenPattern)) {
    const token = match[0];
    const start = match.index ?? 0;
    const className = highlightClass(token, isShell);

    html += escapeHtml(source.slice(index, start));
    html += className ? `<span class="${className}">${escapeHtml(token)}</span>` : escapeHtml(token);
    index = start + token.length;
  }

  return html + escapeHtml(source.slice(index));
}

function highlightClass(token: string, isShell: boolean) {
  if (token.startsWith("//") || token.startsWith("/*") || (isShell && token.startsWith("#"))) return "cb-comment";
  if (token.startsWith("\"") || token.startsWith("'") || token.startsWith("`")) return "cb-string";
  if (/^\d/.test(token)) return "cb-number";
  if (highlightKeywords.has(token)) return "cb-keyword";
  if (highlightBuiltins.has(token)) return "cb-builtin";
  return null;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
