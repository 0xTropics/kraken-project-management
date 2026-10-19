import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown, markdownExcerpt } from "@/components/notes/markdown";

/**
 * One renderer serves the operator's notes and the client's portal updates, so
 * it carries the syntax both used to support. Nothing else would notice a
 * regression here until a client saw raw markup.
 */
const html = (source: string) => renderToStaticMarkup(createElement(Markdown, { content: source }));
const wrap = (inner: string) => `<div class="prose-kraken">${inner}</div>`;

describe("Markdown", () => {
  it.each([
    ["- a\n  more\n- b", "<ul><li>a<br/>more</li><li>b</li></ul>"],
    ["~~~\n<b>x</b>\n~~~", "<pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>"],
    ["```js\nint x;\n```", "<pre><code>int x;</code></pre>"],
    ["```x``` inline", "<p><code>x</code> inline</p>"],
    ["~~gone~~", '<p><span class="line-through opacity-70">gone</span></p>'],
    [
      "<https://a.example/x>",
      '<p><a href="https://a.example/x" target="_blank" rel="noopener noreferrer nofollow">https://a.example/x</a></p>',
    ],
    ["<script>alert(1)</script>", "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>"],
    ["3. three\n4. four", '<ol start="3"><li>three</li><li>four</li></ol>'],
    ["- a\n---\npara\n# H", "<ul><li>a</li></ul><hr/><p>para</p><h1>H</h1>"],
    ["snake_case_name", "<p>snake_case_name</p>"],
    ["> q1\n> q2", "<blockquote>q1<br/>q2</blockquote>"],
    ["para one\npara two\n- item", "<p>para one<br/>para two</p><ul><li>item</li></ul>"],
  ])("renders %j", (source, expected) => {
    expect(html(source)).toBe(wrap(expected));
  });

  it("renders a checked task that continues onto a second line", () => {
    const out = html("- [x] done\n  still done");
    expect(out).toContain("checked");
    expect(out).toContain("<span>done<br/>still done</span>");
  });

  it("drops a javascript: link's href", () => {
    expect(html("[x](javascript:alert(1))")).not.toContain("href");
  });

  it("renders nothing for a blank body", () => {
    expect(html("   ")).toBe("");
  });

  it("strips fenced code from an excerpt", () => {
    expect(markdownExcerpt("a\n~~~\ncode\n~~~\nb")).toBe("a b");
  });
});
