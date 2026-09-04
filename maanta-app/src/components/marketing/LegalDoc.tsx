import Link from "next/link";
import { ENTITY, LEGAL_LAST_UPDATED } from "@/lib/marketing/demo";
import {
  PLACEHOLDER_ID_TOKENS,
  RESOLVED_TOKENS,
  TOKEN_OWNERS,
} from "@/lib/marketing/legal-docs";
import { PlaceholderId } from "@/components/marketing/PlaceholderId";
import { LegalDraftBanner } from "./LegalDraftBanner";

/**
 * Shared layout for the four legal documents.
 *
 * Constrained measure (~68ch), a table of contents generated from the `h2`s, a
 * prominent `Last updated`, and a contact block — per
 * `website-footer-legal-docs-plan.md` §4.
 *
 * Content is markdown, rendered by the small parser below rather than a
 * dependency. The subset these documents use is narrow and fixed — headings,
 * bold, links, tables, lists, rules, blockquotes — and a 100-line renderer is
 * easier to audit than a markdown library and its transitive tree, on pages whose
 * whole purpose is that a reader can trust what they say.
 *
 * **Unfilled tokens render as a visible marker, never as raw `{{TOKEN}}`.** The
 * handoff asks for tokens "as visibly styled placeholders in preview" while
 * failing the production build on any surviving `{{`. Both hold: the reader sees
 * "to be confirmed with counsel", the scanner sees no braces, and nobody has
 * invented a retention period or a liability cap to fill a gap.
 */

type Token = { name: string };

function PendingValue({ name }: Token) {
  const owner = TOKEN_OWNERS[name] ?? "MAANTA";
  return (
    <span
      className="inline-flex items-baseline gap-1.5 rounded border border-dashed border-rust/40 bg-brand-tint px-1.5 py-0.5 text-[13px] text-rust"
      title={`Token ${name} — owner: ${owner}`}
    >
      to be confirmed with {owner}
    </span>
  );
}

/** Split a line of markdown into inline nodes: bold, links, code, tokens. */
function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern =
    /(\{\{\s*[A-Za-z0-9_.-]+\s*\}\})|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))|(`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const raw = m[0];
    const key = `${keyPrefix}-${i++}`;

    if (raw.startsWith("{{")) {
      const name = raw.replace(/[{}\s]/g, "");
      const resolved = RESOLVED_TOKENS[name];
      if (resolved && PLACEHOLDER_ID_TOKENS.has(name)) {
        // Placeholder regulatory identifiers render through <PlaceholderId> —
        // never as plain text (demo-mode-spec §2, drift D75).
        nodes.push(<PlaceholderId key={key} value={resolved} />);
      } else {
        nodes.push(resolved ? <span key={key}>{resolved}</span> : <PendingValue key={key} name={name} />);
      }
    } else if (raw.startsWith("**")) {
      // Recurse: these documents write `**{{DISPUTE_WINDOW}}**`, and rendering
      // the bold content as a flat string leaked the raw token straight past the
      // build check. Anything nestable inside bold has to be parsed, not sliced.
      nodes.push(
        <strong key={key} className="font-semibold text-ink">
          {inline(raw.slice(2, -2), key)}
        </strong>
      );
    } else if (raw.startsWith("[")) {
      const label = raw.slice(1, raw.indexOf("]"));
      const href = raw.slice(raw.indexOf("(") + 1, -1);
      nodes.push(
        href.startsWith("/") ? (
          <Link key={key} href={href} className="underline underline-offset-4 hover:text-ink">
            {label}
          </Link>
        ) : (
          <a
            key={key}
            href={href}
            className="underline underline-offset-4 hover:text-ink"
            rel="noopener noreferrer"
          >
            {label}
          </a>
        )
      );
    } else {
      nodes.push(
        <code key={key} className="rounded bg-paper px-1 py-0.5 font-mono text-[13px]">
          {raw.slice(1, -1)}
        </code>
      );
    }
    last = m.index + raw.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

/** Headings, for the generated table of contents. */
function extractHeadings(markdown: string): { id: string; text: string }[] {
  return markdown
    .split("\n")
    .filter((l) => l.startsWith("## "))
    .map((l) => {
      const text = l.slice(3).replace(/\*\*/g, "").trim();
      return { id: slugify(text), text };
    });
}

function renderMarkdown(markdown: string): React.ReactNode[] {
  const lines = markdown.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      out.push(<hr key={i} className="my-10 border-line" />);
      i++;
      continue;
    }

    // Headings. h1 is rendered by the page shell, so it is skipped here.
    if (line.startsWith("# ")) {
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      const text = line.slice(4).replace(/\*\*/g, "");
      out.push(
        <h3 key={i} className="mt-8 text-base font-bold text-ink">
          {inline(text, `h3-${i}`)}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      const text = line.slice(3).replace(/\*\*/g, "").trim();
      out.push(
        <h2
          key={i}
          id={slugify(text)}
          className="mt-12 scroll-mt-24 text-xl font-black text-ink sm:text-2xl"
        >
          {text}
        </h2>
      );
      i++;
      continue;
    }

    // Table
    if (line.trim().startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i]);
        i++;
      }
      const cells = (r: string) =>
        r
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());
      const header = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push(
        // Wide content scrolls inside its own container; the page body must
        // never scroll horizontally on a 360px screen.
        <div key={`t-${i}`} className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                {header.map((h, hi) => (
                  <th key={hi} className="py-2 pr-4 font-bold text-ink">
                    {inline(h, `th-${i}-${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="border-b border-line/60 align-top">
                  {r.map((c, ci) => (
                    <td key={ci} className="py-2.5 pr-4 text-secondary">
                      {inline(c, `td-${i}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        buf.push(lines[i].slice(2));
        i++;
      }
      out.push(
        <blockquote
          key={`q-${i}`}
          className="mt-6 border-l-2 border-line pl-5 text-sm leading-relaxed text-secondary"
        >
          {inline(buf.join(" "), `q-${i}`)}
        </blockquote>
      );
      continue;
    }

    // Lists
    if (/^[-*] /.test(line.trim()) || /^\d+\. /.test(line.trim())) {
      const ordered = /^\d+\. /.test(line.trim());
      const items: string[] = [];
      while (
        i < lines.length &&
        (/^[-*] /.test(lines[i].trim()) || /^\d+\. /.test(lines[i].trim()))
      ) {
        items.push(lines[i].trim().replace(/^[-*] /, "").replace(/^\d+\.\s*/, ""));
        i++;
      }
      const cls = "mt-4 space-y-2 pl-5 text-base leading-relaxed text-secondary";
      out.push(
        ordered ? (
          <ol key={`l-${i}`} className={`list-decimal ${cls}`}>
            {items.map((t, li) => (
              <li key={li}>{inline(t, `li-${i}-${li}`)}</li>
            ))}
          </ol>
        ) : (
          <ul key={`l-${i}`} className={`list-disc ${cls}`}>
            {items.map((t, li) => (
              <li key={li}>{inline(t, `li-${i}-${li}`)}</li>
            ))}
          </ul>
        )
      );
      continue;
    }

    // Paragraph — consume until a blank line or a block-level marker.
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("#") &&
      !lines[i].trim().startsWith("|") &&
      !lines[i].startsWith("> ") &&
      !/^---+$/.test(lines[i].trim()) &&
      !/^[-*] /.test(lines[i].trim()) &&
      !/^\d+\. /.test(lines[i].trim())
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push(
      <p key={`p-${i}`} className="mt-4 text-base leading-relaxed text-secondary">
        {inline(buf.join(" "), `p-${i}`)}
      </p>
    );
  }

  return out;
}

export function LegalDoc({ title, markdown }: { title: string; markdown: string }) {
  const headings = extractHeadings(markdown);

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <LegalDraftBanner />

      <h1 className="mt-8 text-3xl font-black leading-tight text-ink sm:text-4xl">{title}</h1>
      <p className="mt-3 text-sm text-muted">
        {ENTITY.name} · Last updated {LEGAL_LAST_UPDATED}
      </p>

      {headings.length > 1 ? (
        <nav aria-label="On this page" className="mt-8 rounded-card border border-line p-5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted">
            On this page
          </h2>
          <ol className="mt-3 space-y-1.5">
            {headings.map((h) => (
              <li key={h.id}>
                <a
                  href={`#${h.id}`}
                  className="text-sm text-secondary underline-offset-4 hover:text-ink hover:underline"
                >
                  {h.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <article className="mt-10">{renderMarkdown(markdown)}</article>

      <div className="mt-14 rounded-card border border-line bg-paper p-6">
        <h2 className="text-base font-bold text-ink">Questions about this document</h2>
        <p className="mt-2 text-sm leading-relaxed text-secondary">
          Write to{" "}
          <a
            href={`mailto:${ENTITY.email}`}
            className="underline underline-offset-4 hover:text-ink"
          >
            {ENTITY.email}
          </a>
          .
        </p>
      </div>
    </div>
  );
}
