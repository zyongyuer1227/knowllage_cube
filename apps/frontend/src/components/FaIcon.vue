<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  name: string;
  fixedWidth?: boolean;
}>();

const classes = computed(() => {
  const values = ["fa-solid", `fa-${props.name}`];
  if (props.fixedWidth) {
    values.push("fa-fw");
  }
  return values;
});
</script>

<template>
  <i :class="classes" aria-hidden="true"></i>
</template>
