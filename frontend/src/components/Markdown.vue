<script setup lang="ts">
import { computed } from "vue";
import { micromark } from "micromark";

const props = defineProps<{ source: string }>();

const ALLOWED_TAGS = /^(p|strong|em|ul|ol|li|a|h2|h3|code|pre|hr|blockquote|br)$/i;
const ALLOWED_ATTR: Record<string, RegExp> = { a: /^href$/i };

function sanitize(raw: string): string {
  if (typeof document === "undefined") return raw;
  const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement;
  walk(root);
  return root.innerHTML;
}

function walk(el: Element) {
  [...el.children].forEach((c) => walk(c));
  [...el.children].forEach((c) => {
    if (!ALLOWED_TAGS.test(c.tagName)) {
      c.replaceWith(...Array.from(c.childNodes));
      return;
    }
    const allowed = ALLOWED_ATTR[c.tagName.toLowerCase()];
    [...c.attributes].forEach((a) => {
      const keep = allowed && allowed.test(a.name) && !/^javascript:/i.test(a.value);
      if (!keep) c.removeAttribute(a.name);
    });
    if (c.tagName.toLowerCase() === "a") c.setAttribute("rel", "noopener noreferrer");
  });
}

const html = computed(() => sanitize(micromark(props.source || "")));
</script>

<template><div class="md" v-html="html" /></template>

<style scoped>
.md :deep(p) { margin: 0 0 12px; }
.md :deep(ul), .md :deep(ol) { margin: 0 0 12px 20px; }
.md :deep(h2) {
  font-family: var(--font-display); font-weight: 400;
  font-size: 22px; margin: 16px 0 8px;
}
.md :deep(h3) {
  font-family: var(--font-display); font-weight: 400;
  font-size: 18px; margin: 14px 0 6px;
}
.md :deep(code) {
  font-family: var(--font-mono); background: var(--bg-sunk);
  padding: 0 4px; border-radius: 4px;
}
.md :deep(pre) {
  background: var(--bg-sunk); padding: 10px;
  border-radius: var(--r-md); overflow: auto;
}
.md :deep(a) { color: var(--accent); text-decoration: underline; }
</style>
