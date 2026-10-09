from chizma_api.generation.sanitize import clean_css, sanitize_fragment


def test_removes_scripts_and_event_handlers() -> None:
    html = '<div onclick="steal()">Hi<script>alert(1)</script></div>'

    assert sanitize_fragment(html) == "<div>Hi</div>"


def test_drops_embedded_documents_with_their_content() -> None:
    html = '<p>a</p><iframe src="https://x"><b>inside</b></iframe><object>o</object><p>b</p>'

    assert sanitize_fragment(html) == "<p>a</p><p>b</p>"


def test_neutralises_links_and_external_images() -> None:
    html = (
        '<a href="javascript:alert(1)">x</a><a href="https://evil.example">y</a>'
        '<a href="#menu">z</a><img src="https://evil.example/t.png" alt="t">'
    )

    assert sanitize_fragment(html) == (
        '<a href="#">x</a><a href="#">y</a><a href="#menu">z</a><img alt="t">'
    )


def test_keeps_inline_svg_and_data_images() -> None:
    html = (
        '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#fc0"/></svg>'
        '<img src="data:image/png;base64,iVBORw0KGgo=">'
    )

    cleaned = sanitize_fragment(html)

    assert '<svg viewbox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#fc0"/></svg>' in cleaned
    assert 'src="data:image/png;base64,iVBORw0KGgo="' in cleaned


def test_drops_svg_foreign_object_and_use_tricks() -> None:
    html = '<svg><foreignObject><div>html</div></foreignObject><use href="https://x#a"/></svg>'

    assert sanitize_fragment(html) == "<svg></svg>"


def test_closes_unclosed_tags_and_escapes_text() -> None:
    assert sanitize_fragment("<div><p>1 < 2 & 3") == "<div><p>1 &lt; 2 &amp; 3</p></div>"


def test_strips_form_submission_target() -> None:
    html = '<form action="https://evil.example" method="post"><input name="q"></form>'

    assert sanitize_fragment(html) == '<form><input name="q"></form>'


def test_style_attribute_loses_remote_urls() -> None:
    html = '<div style="background:url(https://evil.example/x.png);color:red"></div>'

    assert sanitize_fragment(html) == '<div style="background:none;color:red"></div>'


def test_css_keeps_rules_but_not_imports_or_remote_urls() -> None:
    css = '@import "https://x/y.css"; .a{background:url("https://x/b.png")} .b{color:red}'

    cleaned = clean_css(css)

    assert "@import" not in cleaned
    assert "https://" not in cleaned
    assert ".b{color:red}" in cleaned
