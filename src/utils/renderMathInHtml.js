import katex from "katex";

function renderSegment(source, displayMode) {
  try {
    return katex.renderToString(source, {
      throwOnError: false,
      displayMode,
      strict: "ignore",
    });
  } catch {
    return source;
  }
}

export function renderMathInHtml(html = "") {
  return html
    .replace(/\\\[((?:.|\n)*?)\\\]/g, (_, expression) =>
      renderSegment(expression.trim(), true)
    )
    .replace(/\\\(((?:.|\n)*?)\\\)/g, (_, expression) =>
      renderSegment(expression.trim(), false)
    );
}
