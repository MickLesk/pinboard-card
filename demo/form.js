let nextFormId = 0;

const STYLES = `
:host {
  display: block;
  font: inherit;
  color: var(--primary-text-color);
  color-scheme: var(--demo-color-scheme, light);
}
*, *::before, *::after {
  box-sizing: border-box;
}
.demo-form-section {
  border: 1px solid var(--divider-color);
  border-radius: 10px;
  margin: 12px 0;
  padding: 12px;
}
.demo-form-section > summary {
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
}
.demo-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  gap: 0 12px;
  align-items: start;
}
.demo-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 14px 0;
  font-size: 14px;
  line-height: 1.5;
  min-width: 0;
}
.demo-field input:not([type=checkbox]),
.demo-field select {
  width: 100%;
  min-width: 0;
  min-height: 42px;
  font: inherit;
  color: inherit;
  background: var(--secondary-background-color);
  padding: 10px;
  border: 1px solid var(--divider-color);
  border-radius: 8px;
}
.demo-field small,
.demo-help {
  color: var(--secondary-text-color);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.demo-toggle {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: center;
  column-gap: 8px;
}
.demo-toggle > span {
  grid-column: 2;
  grid-row: 1;
}
.demo-toggle input {
  grid-column: 1;
  grid-row: 1;
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--primary-color);
}
.demo-toggle small {
  grid-column: 2;
}
input:focus-visible,
select:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
`;

customElements.define("ha-form", class extends HTMLElement {
  constructor() {
    super();
    this._id = ++nextFormId;
    this._expanded = new Map();
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLES;
    this._fields = document.createElement("div");
    root.append(style, this._fields);
  }

  set schema(value) { this._schema = value; this.render(); }
  set data(value) { this._data = value; this.render(); }
  set hass(value) { this._hass = value; }
  set computeLabel(value) { this._label = value; this.render(); }
  set computeHelper(value) { this._helper = value; this.render(); }

  update(name, value) {
    this.dispatchEvent(new CustomEvent("value-changed", {
      detail: { value: { ...this._data, [name]: value } },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    if (!this._schema || !this._data) return;
    const fragment = document.createDocumentFragment();
    const walk = (schemas, parent) => {
      for (const schema of schemas) {
        if (schema.schema) {
          const group = document.createElement(schema.type === "expandable" ? "details" : "div");
          group.className = schema.type === "expandable" ? "demo-form-section" : "demo-form-grid";
          if (schema.type === "expandable") {
            group.open = this._expanded.get(schema.name) ?? Boolean(schema.expanded);
            const summary = document.createElement("summary");
            summary.textContent = schema.title ?? this._label?.(schema) ?? schema.name;
            group.append(summary);
            group.addEventListener("toggle", () => this._expanded.set(schema.name, group.open));
          }
          walk(schema.schema, group);
          parent.append(group);
          continue;
        }
        const label = document.createElement("label");
        label.className = "demo-field";
        const title = document.createElement("span");
        title.textContent = this._label?.(schema) ?? schema.name;
        label.append(title);
        if (schema.type === "constant") {
          label.classList.add("demo-help");
          parent.append(label);
          continue;
        }
        const selector = schema.selector ?? {};
        const value = this._data[schema.name];
        let control;
        if (selector.boolean) {
          control = document.createElement("input");
          control.type = "checkbox";
          control.checked = Boolean(value);
          label.classList.add("demo-toggle");
        } else if (selector.select && !selector.select.custom_value) {
          control = document.createElement("select");
          for (const option of selector.select.options ?? []) {
            const item = typeof option === "string" ? { value: option, label: option } : option;
            control.add(new Option(item.label, item.value));
          }
          control.value = String(value ?? "");
        } else if (selector.ui_action) {
          control = document.createElement("select");
          for (const action of selector.ui_action.actions ?? []) control.add(new Option(action, action));
          control.value = value?.action ?? selector.ui_action.default_action ?? "none";
        } else {
          control = document.createElement("input");
          control.type = selector.number ? "number" : selector.date ? "date" : "text";
          control.value = String(value ?? "");
          if (selector.number) {
            for (const key of ["min", "max", "step"]) {
              if (selector.number[key] !== undefined) control[key] = String(selector.number[key]);
            }
          }
          const options = selector.entity
            ? Object.keys(this._hass?.states ?? {}).filter((id) => {
              const filters = selector.entity.filter ?? [];
              return !filters.length || filters.some((filter) => filter.domain === id.split(".")[0]);
            })
            : selector.attribute
              ? Object.keys(this._hass?.states?.[this._data[schema.context?.filter_entity]]?.attributes ?? {})
              : selector.select?.options ?? [];
          if (options.length) {
            const list = document.createElement("datalist");
            list.id = `demo-form-${this._id}-${schema.name}`;
            for (const option of options) {
              const item = typeof option === "string" ? { value: option, label: option } : option;
              list.append(new Option(item.label, item.value));
            }
            control.setAttribute("list", list.id);
            label.append(list);
          }
        }
        control.dataset.field = schema.name;
        control.addEventListener("change", () => {
          const next = selector.boolean ? control.checked
            : selector.number ? (control.value === "" ? "" : control.valueAsNumber)
              : selector.ui_action ? { action: control.value } : control.value;
          this.update(schema.name, next);
        });
        label.append(control);
        const helper = this._helper?.(schema);
        if (helper) {
          const hint = document.createElement("small");
          hint.textContent = helper;
          label.append(hint);
        }
        parent.append(label);
        if (selector.ui_action && value?.action && value.action !== "none" && value.action !== "flip") {
          const keys = value.action === "url" ? ["url_path"]
            : value.action === "navigate" ? ["navigation_path"]
              : value.action === "perform-action" ? ["perform_action"]
                : ["entity"];
          for (const key of keys) {
            const field = document.createElement("label");
            field.className = "demo-field";
            const caption = document.createElement("span");
            caption.textContent = key;
            const input = document.createElement("input");
            input.type = "text";
            input.value = value[key] ?? "";
            input.addEventListener("change", () => this.update(schema.name, { ...value, [key]: input.value }));
            field.append(caption, input);
            parent.append(field);
          }
        }
      }
    };
    walk(this._schema, fragment);
    this._fields.replaceChildren(fragment);
  }
});
