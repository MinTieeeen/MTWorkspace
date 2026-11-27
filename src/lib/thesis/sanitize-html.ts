// Lọc HTML từ hệ thống trường (không tin cậy) trước khi hiển thị. Chỉ chạy ở trình duyệt.

const ALLOWED = new Set([
  "P", "BR", "UL", "OL", "LI", "STRONG", "B", "EM", "I", "U", "S",
  "A", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "CODE", "PRE",
  "SPAN", "DIV", "SUB", "SUP", "HR",
]);
// Thẻ bỏ luôn cả nội dung bên trong
const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "SVG", "MATH", "TEMPLATE"]);

export function looksLikeHtml(text: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(text);
}

function clean(node: Node, out: Node, doc: Document) {
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out.appendChild(doc.createTextNode(child.textContent ?? ""));
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as Element;
    const tag = el.tagName.toUpperCase();
    if (DROP.has(tag)) return;
    if (!ALLOWED.has(tag)) {
      // Thẻ lạ: giữ nội dung, bỏ thẻ
      clean(el, out, doc);
      return;
    }
    const copy = doc.createElement(tag.toLowerCase());
    if (tag === "A") {
      const href = el.getAttribute("href") ?? "";
      if (/^(https?:|mailto:)/i.test(href.trim())) {
        copy.setAttribute("href", href.trim());
        copy.setAttribute("target", "_blank");
        copy.setAttribute("rel", "noopener noreferrer");
      }
    }
    clean(el, copy, doc);
    out.appendChild(copy);
  });
}

/** Trả về HTML an toàn, hoặc null nếu không chạy được (server) */
export function sanitizeHtml(html: string): string | null {
  if (typeof DOMParser === "undefined") return null;
  const src = new DOMParser().parseFromString(html, "text/html");
  const doc = document.implementation.createHTMLDocument("");
  const holder = doc.createElement("div");
  clean(src.body, holder, doc);
  return holder.innerHTML;
}
