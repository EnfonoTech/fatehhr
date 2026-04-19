<script setup lang="ts">
/**
 * Icon — single-source SVG icon set.
 *
 * All icons:
 *   - 24×24 viewBox
 *   - 1.75 stroke, round caps/joins
 *   - currentColor so they inherit the text colour
 *
 * Add new icons by appending to the template with `v-else-if="name === ..."`.
 * Keep the visual weight consistent so they sit together in grids.
 */
defineProps<{
  name:
    | "home"
    | "clock"
    | "calendar"
    | "leave"
    | "receipt"
    | "tasks"
    | "payslip"
    | "megaphone"
    | "bell"
    | "user"
    | "more"
    | "riyal"
    | "chevron-right"
    | "arrow-up"
    | "arrow-down"
    | "pin"
    | "history";
  size?: number | string;
}>();
</script>

<template>
  <svg
    class="ic"
    :width="size ?? 22"
    :height="size ?? 22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- Home: roof + door -->
    <template v-if="name === 'home'">
      <path d="M3 11 12 4l9 7" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </template>

    <!-- Clock: attendance -->
    <template v-else-if="name === 'clock'">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </template>

    <!-- Calendar: for attendance calendar + leave -->
    <template v-else-if="name === 'calendar'">
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </template>

    <!-- Leave: calendar + check -->
    <template v-else-if="name === 'leave'">
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="M9 15.5l2 2 4-4.5" />
    </template>

    <!-- Receipt: for expense -->
    <template v-else-if="name === 'receipt'">
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </template>

    <!-- Tasks: checklist -->
    <template v-else-if="name === 'tasks'">
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M7.5 9l2 2 3-3.5M7.5 15l2 2 3-3.5M16 9.5h2M16 15.5h2" />
    </template>

    <!-- Payslip: document with lines -->
    <template v-else-if="name === 'payslip'">
      <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </template>

    <!-- Megaphone: announcements -->
    <template v-else-if="name === 'megaphone'">
      <path d="M4 10v4l11 5V5L4 10z" />
      <path d="M4 10H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h1" />
      <path d="M15 8a4 4 0 0 1 0 8" />
    </template>

    <!-- Bell: notifications -->
    <template v-else-if="name === 'bell'">
      <path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2Z" />
      <path d="M10.5 20a1.5 1.5 0 0 0 3 0" />
    </template>

    <!-- User: profile -->
    <template v-else-if="name === 'user'">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </template>

    <!-- More: three dots -->
    <template v-else-if="name === 'more'">
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </template>

    <!-- Saudi Riyal: inspired by the new SAMA glyph.
         Three horizontal calligraphic strokes + accent. Not identical to the
         official logo (which is a brand mark) but reads unambiguously as SR.
    -->
    <template v-else-if="name === 'riyal'">
      <path d="M6 7l6 2 7-2" />
      <path d="M6 11l6 2 7-2" />
      <path d="M9 14l0 5" />
      <path d="M14 14l0 5" />
    </template>

    <!-- Chevron: row indicator -->
    <template v-else-if="name === 'chevron-right'">
      <path d="M9 6l6 6-6 6" />
    </template>

    <!-- Arrows: IN / OUT -->
    <template v-else-if="name === 'arrow-up'">
      <path d="M12 19V5M6 11l6-6 6 6" />
    </template>
    <template v-else-if="name === 'arrow-down'">
      <path d="M12 5v14M6 13l6 6 6-6" />
    </template>

    <!-- Pin: map marker for check-in -->
    <template v-else-if="name === 'pin'">
      <path d="M12 21s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </template>

    <!-- History: clockwise arrow -->
    <template v-else-if="name === 'history'">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </template>
  </svg>
</template>

<style scoped>
.ic { display: inline-block; vertical-align: middle; flex-shrink: 0; }
[dir="rtl"] .ic { transform: none; }
</style>
