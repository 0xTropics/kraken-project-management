import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * A small markdown renderer that builds React nodes directly.
 *
 * There is no `dangerouslySetInnerHTML` anywhere in this file, and no HTML
 * parser: raw markup in a note is text and renders as text. That matters here
 * more than it usually would, because progress notes are re-published to a
 * client portal, so the note body is treated as untrusted input on both ends
 * of the trip.
 *
 * The supported subset is what people actually write in a work log: headings,
 * lists (with task boxes and continuation lines), fenced and inline code,
 * quotes, rules, links, bold, italic and strikethrough.
 *
 * The same renderer draws the operator's view and the client portal; neither
 * passes element classes, so each surface's type scale comes from its parent.
 */

const HEADING = /^(#{1,3})\s+(.*)$/;
const UNORDERED = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
// ``` with an info string (but no backticks, so ```x``` stays inline code), or ~~~.
const FENCE = /^\s*(?:```[^`]*|~~~.*)$/;
const TASK = /^\[([ xX])\]\s+([\s\S]*)$/;

/**
 * URL allow-list. Anything that is not an absolute http(s)/mailto URL or a
 * same-document path renders as plain text, which closes `javascript:` and
 * `data:` without needing to guess at encodings.
 */
function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  if (/^mailto:[^\s]+@[^\s]+$/i.test(href)) return href;
  if (/^[/#][^\s]*$/.test(href)) return href;
  return null;
}

const INLINE =
  /(`+)([\s\S]*?)\1|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|(?<!\w)\*([^*\n]+)\*(?!\w)|(?<!\w)_([^_\n]+)_(?!\w)|~~([\s\S]+?)~~|\[([^\]\n]*)\]\(([^)\s]+)\)|<(https?:\/\/[^>\s]+)>|(https?:\/\/[^\s<>[\]()]+)/;

function inline(text: string, key: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let rest = text;
  let index = 0;

  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (!match || match.index === undefined) {
      nodes.push(rest);
      break;
    }
    if (match.index > 0) nodes.push(rest.slice(0, match.index));
    const id = `${key}-${index++}`;
    const [, , code, strongA, strongB, emA, emB, strike, linkText, linkHref, angled, bare] = match;
    const autolink = angled ?? bare;

    if (code !== undefined) {
      nodes.push(<code key={id}>{code.trim()}</code>);
    } else if (strongA ?? strongB) {
      nodes.push(<strong key={id}>{inline((strongA ?? strongB)!, id)}</strong>);
    } else if (emA ?? emB) {
      nodes.push(<em key={id}>{inline((emA ?? emB)!, id)}</em>);
    } else if (strike !== undefined) {
      nodes.push(
        <span key={id} className="line-through opacity-70">
          {inline(strike, id)}
        </span>,
      );
    } else if (linkHref !== undefined) {
      const href = safeHref(linkHref);
      const label = linkText || linkHref;
      nodes.push(
        href ? (
          <a key={id} href={href} target="_blank" rel="noopener noreferrer nofollow">
            {inline(label, id)}
          </a>
        ) : (
          <span key={id}>{label}</span>
        ),
      );
    } else if (autolink !== undefined) {
      nodes.push(
        <a key={id} href={autolink} target="_blank" rel="noopener noreferrer nofollow">
          {autolink}
        </a>,
      );
    }

    rest = rest.slice(match.index + match[0].length);
  }

  return nodes;
}

/** Soft line breaks inside a paragraph become real breaks, as in Notion. */
function withBreaks(lines: string[], key: string): React.ReactNode[] {
  return lines.flatMap((line, i) =>
    i === 0
      ? inline(line, `${key}-${i}`)
      : [<br key={`${key}-br-${i}`} />, ...inline(line, `${key}-${i}`)],
  );
}

/** A line that opens a block of its own, so it ends a paragraph or list item. */
function startsBlock(line: string): boolean {
  return [HEADING, UNORDERED, ORDERED, QUOTE, RULE, FENCE].some((pattern) => pattern.test(line));
}

function renderBlocks(source: string): React.ReactNode[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  /** Consecutive items; a following non-blank, non-block line continues the item above it. */
  function listItems(pattern: RegExp, group: number): string[] {
    const items: string[] = [];
    while (i < lines.length && pattern.test(lines[i])) {
      items.push(pattern.exec(lines[i])![group]);
      i += 1;
      while (i < lines.length && lines[i].trim() !== "" && !startsBlock(lines[i])) {
        items[items.length - 1] += `\n${lines[i].trim()}`;
        i += 1;
      }
    }
    return items;
  }

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(
        <pre key={key++}>
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (RULE.test(line)) {
      blocks.push(<hr key={key++} />);
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      const content = inline(heading[2], `h${key}`);
      blocks.push(
        level === 1 ? (
          <h1 key={key++}>{content}</h1>
        ) : level === 2 ? (
          <h2 key={key++}>{content}</h2>
        ) : (
          <h3 key={key++}>{content}</h3>
        ),
      );
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        body.push(QUOTE.exec(lines[i])![1]);
        i += 1;
      }
      blocks.push(<blockquote key={key++}>{withBreaks(body, `q${key}`)}</blockquote>);
      continue;
    }

    if (UNORDERED.test(line)) {
      const items = listItems(UNORDERED, 1);
      blocks.push(
        <ul key={key++}>
          {items.map((item, index) => {
            const task = TASK.exec(item);
            if (!task) return <li key={index}>{withBreaks(item.split("\n"), `li${key}-${index}`)}</li>;
            return (
              <li key={index} className="list-none -ml-5 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={task[1].toLowerCase() === "x"}
                  readOnly
                  aria-label={task[2]}
                  className="mt-1.5 size-3.5 shrink-0 accent-[var(--accent)]"
                />
                <span>{withBreaks(task[2].split("\n"), `li${key}-${index}`)}</span>
              </li>
            );
          })}
        </ul>,
      );
      continue;
    }

    if (ORDERED.test(line)) {
      const start = Number(ORDERED.exec(line)![1]);
      const items = listItems(ORDERED, 2);
      blocks.push(
        <ol key={key++} start={start}>
          {items.map((item, index) => (
            <li key={index}>{withBreaks(item.split("\n"), `ol${key}-${index}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !startsBlock(lines[i])) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push(<p key={key++}>{withBreaks(paragraph, `p${key}`)}</p>);
  }

  return blocks;
}

export function Markdown({
  content,
  className,
}: {
  content: string | null | undefined;
  className?: string;
}) {
  const body = (content ?? "").trim();
  if (!body) return null;
  return <div className={cn("prose-kraken", className)}>{renderBlocks(body)}</div>;
}

/** Strips markdown to a single line, for list previews and activity rows. */
export function markdownExcerpt(source: string, max = 160): string {
  const text = source
    .replace(/(```|~~~)[\s\S]*?\1/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
