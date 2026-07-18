import { useEffect, useMemo, useRef } from "preact/hooks";

import { marked } from "marked";

marked.setOptions({ breaks: true, gfm: true });

const TAG_RE = /#([\p{L}\d_-]+)/gu;

const ALLOWED_TAGS = new Set([
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "input",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
]);

function sanitizeHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;

  template.content.querySelectorAll("*").forEach((element) => {
    const tagName = element.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();

      if (name.startsWith("on") || name === "style") {
        element.removeAttribute(attribute.name);
        return;
      }

      if (tagName === "span" && name === "class" && value === "markdown-tag") {
        return;
      }

      if (tagName === "a" && name === "href") {
        if (!/^(https?:|mailto:|vscode:)/i.test(value)) {
          element.removeAttribute(attribute.name);
        }
        return;
      }

      if (
        tagName === "img" &&
        (name === "src" || name === "alt" || name === "title")
      ) {
        if (
          name === "src" &&
          !/^(data:image\/(png|jpeg|gif|webp|bmp);base64,|https?:)/i.test(value)
        ) {
          element.removeAttribute(attribute.name);
        }
        return;
      }

      if (tagName === "input") {
        if (name === "type" && value === "checkbox") return;
        if (name === "checked" || name === "disabled") return;
      }

      element.removeAttribute(attribute.name);
    });

    if (tagName === "input") {
      const input = element as HTMLInputElement;
      if (input.type !== "checkbox") {
        element.remove();
        return;
      }
      input.disabled = true;
    }
  });

  highlightTags(template.content);

  return template.innerHTML;
}

function highlightTags(root: DocumentFragment): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent || !TAG_RE.test(node.textContent || "")) {
        TAG_RE.lastIndex = 0;
        return NodeFilter.FILTER_REJECT;
      }
      TAG_RE.lastIndex = 0;
      if (parent.closest("code, pre, a, .markdown-tag")) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }

  for (const node of nodes) {
    const text = node.textContent || "";
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    TAG_RE.lastIndex = 0;

    for (const match of text.matchAll(TAG_RE)) {
      const index = match.index ?? 0;
      if (index > lastIndex) {
        fragment.append(document.createTextNode(text.slice(lastIndex, index)));
      }
      const span = document.createElement("span");
      span.className = "markdown-tag";
      span.textContent = match[0];
      fragment.append(span);
      lastIndex = index + match[0].length;
    }

    if (lastIndex < text.length) {
      fragment.append(document.createTextNode(text.slice(lastIndex)));
    }

    node.replaceWith(fragment);
  }
}

interface MarkdownContentProps {
  content: string;
  className?: string;
  onDblClick?: () => void;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Unable to encode image"));
      }
    }, "image/png");
  });
}

async function copyImage(image: HTMLImageElement): Promise<void> {
  const src = image.currentSrc || image.src;

  if ("ClipboardItem" in window && navigator.clipboard.write) {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to copy image");
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToPngBlob(canvas);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return;
  }

  await navigator.clipboard.writeText(src);
}

export function MarkdownContent({
  content,
  className = "",
  onDblClick,
}: MarkdownContentProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const html = useMemo(
    () => sanitizeHtml(marked.parse(content) as string),
    [content],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    root.querySelectorAll(".markdown-image-wrapper").forEach((wrapper) => {
      const image = wrapper.querySelector("img");
      if (!image) {
        wrapper.remove();
      } else {
        wrapper.replaceWith(image);
      }
    });

    root.querySelectorAll("img").forEach((image) => {
      if (image.closest(".markdown-image-wrapper")) return;

      const wrapper = document.createElement("span");
      wrapper.className = "markdown-image-wrapper";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "markdown-image-copy-btn codicon codicon-copy";
      button.title = "Copy image";
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        try {
          await copyImage(image);
          button.classList.replace("codicon-copy", "codicon-check");
        } catch {
          button.classList.replace("codicon-copy", "codicon-error");
          button.title = "Image copy failed";
        }
        window.setTimeout(() => {
          button.classList.remove("codicon-check", "codicon-error");
          button.classList.add("codicon-copy");
          button.title = "Copy image";
        }, 1200);
      });

      image.replaceWith(wrapper);
      wrapper.append(image, button);
    });
  }, [html]);

  return (
    <div
      ref={rootRef}
      class={`markdown-content ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
      onDblClick={onDblClick}
    />
  );
}
