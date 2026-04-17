<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import { getPhoto, savePhoto, removePhoto } from "@/offline/photos";

const props = defineProps<{
  modelValue: string | null;
  aspect?: "3:4" | "16:9" | "1:1";
  label?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string | null];
}>();

const thumbUrl = ref<string | null>(null);
const busy = ref(false);

async function load(id: string | null) {
  if (thumbUrl.value) URL.revokeObjectURL(thumbUrl.value);
  thumbUrl.value = null;
  if (!id) return;
  const row = await getPhoto(id);
  if (!row) {
    // frappe-vue-pwa §4.7: auto-clear when blob is missing
    emit("update:modelValue", null);
    return;
  }
  thumbUrl.value = URL.createObjectURL(row.blob);
}

onMounted(() => load(props.modelValue));
watch(() => props.modelValue, load);
onBeforeUnmount(() => {
  if (thumbUrl.value) URL.revokeObjectURL(thumbUrl.value);
});

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  busy.value = true;
  try {
    const id = await savePhoto(file, file.type || "image/jpeg");
    emit("update:modelValue", id);
  } finally {
    busy.value = false;
    input.value = "";
  }
}

async function onClear() {
  if (props.modelValue) await removePhoto(props.modelValue);
  emit("update:modelValue", null);
}
</script>

<template>
  <div class="photoslot" :class="[modelValue ? 'photoslot--filled' : 'photoslot--empty', `photoslot--${aspect ?? '3:4'}`]">
    <label v-if="!modelValue" class="photoslot__picker">
      <input type="file" accept="image/*" capture="environment" @change="onPick" hidden />
      <span>{{ label ?? "+ Add photo" }}</span>
    </label>
    <template v-else>
      <img v-if="thumbUrl" :src="thumbUrl" alt="" />
      <button class="photoslot__remove" aria-label="Remove photo" @click="onClear">×</button>
    </template>
  </div>
</template>

<style scoped>
.photoslot {
  position: relative; display: block; border-radius: var(--r-md);
  background: var(--bg-sunk); overflow: hidden;
}
.photoslot--3\:4 { aspect-ratio: 3 / 4; }
.photoslot--16\:9 { aspect-ratio: 16 / 9; }
.photoslot--1\:1 { aspect-ratio: 1 / 1; }
.photoslot--empty { box-shadow: inset 0 0 0 1.5px var(--hairline-strong); }
.photoslot__picker {
  display: grid; place-items: center; height: 100%; cursor: pointer;
  color: var(--ink-secondary); font-size: 13px;
}
.photoslot img { width: 100%; height: 100%; object-fit: cover; }
.photoslot__remove {
  position: absolute; top: 8px; right: 8px;
  width: 28px; height: 28px; border-radius: var(--r-full);
  background: rgba(0, 0, 0, 0.55); color: #fff; font-size: 18px; line-height: 1;
}
[dir="rtl"] .photoslot__remove { left: 8px; right: auto; }
</style>
