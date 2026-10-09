"""Allow-list sanitizer for model-generated HTML/SVG and CSS.

Defence in depth: the editor sanitises again (DOMPurify) and renders inside a
sandboxed iframe with ``default-src 'none'``. Here we make sure stored output never
contains scripts, event handlers, embedded documents or external URLs.
"""

import re
from html import escape
from html.parser import HTMLParser

_HTML_TAGS = {
    "a", "article", "aside", "b", "blockquote", "br", "button", "div", "em", "figcaption",
    "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "i",
    "img", "input", "label", "li", "main", "nav", "ol", "option", "p", "section", "select",
    "small", "span", "strong", "table", "tbody", "td", "textarea", "th", "thead", "tr", "ul",
}  # fmt: skip
# html.parser lowercases names; browsers restore SVG casing (viewBox, linearGradient).
_SVG_TAGS = {
    "circle", "defs", "desc", "ellipse", "g", "line", "lineargradient", "path", "polygon",
    "polyline", "radialgradient", "rect", "stop", "svg", "text", "title", "tspan",
}  # fmt: skip
ALLOWED_TAGS = _HTML_TAGS | _SVG_TAGS
VOID_TAGS = {"br", "hr", "img", "input"}
# Everything inside these is dropped, not just the tag.
DROP_WITH_CONTENT = {
    "script", "style", "iframe", "object", "embed", "template", "noscript", "foreignobject",
    "math", "frame", "frameset", "link", "meta", "base",
}  # fmt: skip

ALLOWED_ATTRS = {
    "class", "id", "style", "role", "title", "alt", "href", "src", "type", "placeholder",
    "name", "value", "for", "disabled", "checked", "rows", "cols", "colspan", "rowspan",
    "width", "height", "viewbox", "xmlns", "fill", "stroke", "stroke-width",
    "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "d", "cx", "cy", "r", "rx", "ry",
    "x", "y", "x1", "y1", "x2", "y2", "points", "transform", "opacity", "fill-opacity",
    "stroke-opacity", "offset", "stop-color", "stop-opacity", "gradientunits",
    "gradienttransform", "preserveaspectratio", "font-size", "font-family", "font-weight",
    "text-anchor", "dominant-baseline", "fill-rule", "clip-rule", "vector-effect",
}  # fmt: skip

_DATA_IMAGE = re.compile(r"^data:image/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$", re.I)
_CSS_URL = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.I | re.S)
_CSS_IMPORT = re.compile(r"@import[^;{}]*;?", re.I)
_CSS_BANNED = re.compile(r"@import|expression\s*\(|javascript:|behavior\s*:|-moz-binding", re.I)


def clean_css(css: str) -> str:
    """Keep plain CSS; drop imports, scripting hooks and non-data URLs."""

    def keep_data_urls(match: re.Match[str]) -> str:
        return match.group(0) if _DATA_IMAGE.match(match.group(2).strip()) else "none"

    css = css.replace("<", "").replace("\\", "")
    css = _CSS_IMPORT.sub("", css)
    css = _CSS_URL.sub(keep_data_urls, css)
    return _CSS_BANNED.sub("", css)


def _clean_attr(tag: str, name: str, value: str) -> str | None:
    if name.startswith("aria-"):
        return value
    if name.startswith("data-") and re.fullmatch(r"data-[a-z0-9-]{1,40}", name):
        return value
    if name not in ALLOWED_ATTRS:
        return None
    if name == "href":
        # Navigation is assigned later from the action registry, never by the model.
        return value if value.startswith("#") or value == "" else "#"
    if name == "src":
        return value if tag == "img" and _DATA_IMAGE.match(value.strip()) else None
    if name == "style":
        return clean_css(value)
    if "javascript:" in value.lower():
        return None
    return value


class _Sanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.drop_depth = 0
        self.stack: list[str] = []

    def _open(self, tag: str, attrs: list[tuple[str, str | None]], self_closing: bool) -> None:
        if self.drop_depth:
            if tag in DROP_WITH_CONTENT and not self_closing:
                self.drop_depth += 1
            return
        if tag in DROP_WITH_CONTENT:
            if not self_closing and tag not in VOID_TAGS:
                self.drop_depth = 1
            return
        if tag not in ALLOWED_TAGS:
            return
        parts = [tag]
        for name, raw in attrs:
            cleaned = _clean_attr(tag, name, raw or "")
            if cleaned is not None:
                parts.append(f'{name}="{escape(cleaned, quote=True)}"')
        if tag == "form":
            parts = [p for p in parts if not p.startswith(("action=", "method="))]
        if self_closing and tag not in VOID_TAGS:
            self.out.append(f"<{' '.join(parts)}/>")
            return
        self.out.append(f"<{' '.join(parts)}>")
        if tag not in VOID_TAGS:
            self.stack.append(tag)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._open(tag, attrs, self_closing=False)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._open(tag, attrs, self_closing=True)

    def handle_endtag(self, tag: str) -> None:
        if self.drop_depth:
            if tag in DROP_WITH_CONTENT:
                self.drop_depth -= 1
            return
        if tag in self.stack:
            while self.stack:
                open_tag = self.stack.pop()
                self.out.append(f"</{open_tag}>")
                if open_tag == tag:
                    break

    def handle_data(self, data: str) -> None:
        if not self.drop_depth:
            self.out.append(escape(data, quote=False))

    def result(self) -> str:
        while self.stack:
            self.out.append(f"</{self.stack.pop()}>")
        return "".join(self.out)


def sanitize_fragment(html: str) -> str:
    parser = _Sanitizer()
    parser.feed(html)
    parser.close()
    return parser.result()
