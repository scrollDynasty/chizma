/**
 * The only script a Chizma site runs: it performs the block actions from the safe registry
 * (link, window with optional form, show/hide, scroll). It reads JSON from data attributes and
 * builds every piece of UI with textContent, never innerHTML. Generated block code has no
 * scripts at all; the page CSP only allows this script (by nonce).
 */
export const RUNTIME_JS = String.raw`(() => {
  "use strict";
  const root = document.documentElement;
  const api = root.dataset.chzApi || "";
  const viaParent = root.dataset.chzSubmit === "parent";
  const cellOf = (id) => document.querySelector('[data-el="' + CSS.escape(id) + '"]');
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  };

  function send(formId, values) {
    if (!viaParent) {
      return fetch(api + "/v1/forms/" + encodeURIComponent(formId) + "/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      }).then((r) => r.ok);
    }
    return new Promise((resolve) => {
      const reqId = Math.random().toString(36).slice(2);
      const onReply = (event) => {
        const data = event.data || {};
        if (data.type !== "chizma:submitted" || data.reqId !== reqId) return;
        window.removeEventListener("message", onReply);
        resolve(Boolean(data.ok));
      };
      window.addEventListener("message", onReply);
      window.parent.postMessage({ type: "chizma:submit", reqId, formId, values }, "*");
    });
  }

  function openModal(action) {
    const dialog = el("dialog", "chz-modal");
    const close = el("button", "chz-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "close");
    close.addEventListener("click", () => dialog.close());
    dialog.append(close, el("h2", "", action.title));
    if (action.text) dialog.append(el("p", "chz-text", action.text));
    const form = action.form;
    if (form && form.id) {
      const node = el("form", "chz-form");
      const values = {};
      for (const field of form.fields) {
        const id = "chz-" + field.name;
        const label = el("label", "", field.label);
        label.htmlFor = id;
        const input = el(field.type === "textarea" ? "textarea" : "input");
        input.id = id;
        if (field.type !== "textarea") input.type = field.type;
        input.required = Boolean(field.required);
        input.addEventListener("input", () => { values[field.name] = input.value; });
        node.append(label, input);
      }
      const trap = el("input");
      trap.name = "_hp";
      trap.tabIndex = -1;
      trap.className = "chz-hp";
      trap.setAttribute("aria-hidden", "true");
      trap.addEventListener("input", () => { values._hp = trap.value; });
      // Sent by script, never as an HTML form submission: sandboxed previews block those,
      // and the site never navigates away.
      const submit = el("button", "chz-submit", form.submit_label);
      submit.type = "button";
      const status = el("p", "chz-status");
      node.append(trap, submit, status);
      const go = () => {
        if (submit.disabled || !node.reportValidity()) return;
        submit.disabled = true;
        send(form.id, values).then((ok) => {
          if (ok) node.replaceWith(el("p", "chz-success", form.success_text));
          else { status.textContent = "!"; submit.disabled = false; }
        });
      };
      submit.addEventListener("click", go);
      node.addEventListener("submit", (event) => event.preventDefault());
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && event.target.tagName === "INPUT") {
          event.preventDefault();
          go();
        }
      });
      dialog.append(node);
    }
    dialog.addEventListener("close", () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }

  function run(action) {
    if (action.type === "link") {
      window.open(action.url, action.new_tab ? "_blank" : "_top", "noopener,noreferrer");
    } else if (action.type === "modal") {
      openModal(action);
    } else if (action.type === "toggle") {
      const target = cellOf(action.target_id);
      if (target) target.hidden = !target.hidden;
    } else if (action.type === "scroll") {
      const target = cellOf(action.target_id);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const SAFE_URL = /^(https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+|tel:\+?[0-9 ()-]{3,30})$/i;
  const valid = (a) =>
    a && (a.type === "link" ? typeof a.url === "string" && SAFE_URL.test(a.url)
      : a.type === "modal" || a.type === "toggle" || a.type === "scroll");

  document.addEventListener("click", (event) => {
    // Only the block cell carries an action; markup inside a block cannot add its own.
    const cell = event.target.closest(".chz-cell");
    if (!cell || !cell.dataset.chzAction) return;
    event.preventDefault();
    let action = null;
    try { action = JSON.parse(cell.dataset.chzAction); } catch (_) { return; }
    if (valid(action)) run(action);
  });
})();`;
