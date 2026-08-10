/**
 * Renders one JSON-LD document into the page.
 *
 * `dangerouslySetInnerHTML` is the only way to emit a `<script>` body in React —
 * children of a `<script>` are escaped as text, which produces `&quot;` inside
 * the JSON and a block no parser accepts.
 *
 * Rewriting every left angle bracket as its six-character JSON unicode escape
 * closes the one real injection route. Every value here comes from repo
 * constants rather than user input, so this guards against a future caller
 * rather than fixing a present hole: a string containing a closing script tag
 * would otherwise end the element early and spill the rest of the JSON into the
 * document as markup. The escape leaves the JSON semantically identical — any
 * parser decodes it back to the same character — while leaving no literal
 * closing tag anywhere in the HTML.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
