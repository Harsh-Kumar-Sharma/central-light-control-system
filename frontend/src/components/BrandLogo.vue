<script setup>
// The ARS monogram in its light-on-dark colours (lavender + sky blue), made for
// dark-blue surfaces: the sidebar and the login hero. Don't place it on white —
// the brand kit's other variant is for that.
defineProps({
  height: { type: Number, default: 48 },
});
</script>

<template>
  <img class="brand-logo" src="/brand/logo/ars-logo-on-dark.svg" alt="ARS" :style="{ height: `${height}px` }" decoding="async" draggable="false" />
</template>

<style scoped>
/* no display rule on purpose: parents decide when to show/hide it */
.brand-logo { width: auto; user-select: none; }
</style>
