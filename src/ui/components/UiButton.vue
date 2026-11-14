<script setup lang="ts">
type ButtonVariant = 'primary' | 'secondary' | 'dashed' | 'ghost' | 'danger'

const { variant = 'secondary', type = 'button' } = defineProps<{
  variant?: ButtonVariant
  type?: 'button' | 'submit'
}>()

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent font-semibold text-white hover:bg-accent-dark disabled:bg-line disabled:text-muted',
  secondary: 'border border-line-strong bg-white text-ink hover:bg-panel disabled:text-muted',
  dashed: 'border border-dashed border-outline text-ink hover:bg-white',
  ghost: 'text-accent-dark hover:bg-accent-soft disabled:text-muted disabled:hover:bg-transparent',
  danger: 'text-warn hover:bg-warn-soft disabled:text-muted disabled:hover:bg-transparent',
}
</script>

<template>
  <button
    :type="type"
    :class="[
      'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed',
      variantClasses[variant],
    ]"
  >
    <slot />
  </button>
</template>
