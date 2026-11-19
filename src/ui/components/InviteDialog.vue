<script setup lang="ts">
import type { PendingInvite } from '@/session'
import UiButton from './UiButton.vue'
import UiDialog from './UiDialog.vue'

defineProps<{ invite: PendingInvite }>()
const emit = defineEmits<{ accept: []; decline: [] }>()
</script>

<template>
  <UiDialog title="Pozvánka do skupiny" @close="emit('decline')">
    <p v-if="invite.error" role="alert" class="font-medium text-warn">{{ invite.error }}</p>
    <p v-else-if="!invite.preview" class="text-muted">Načítám pozvánku…</p>
    <template v-else-if="invite.preview.isMember">
      <p>
        Ve skupině <strong>{{ invite.preview.groupName }}</strong> už jsi.
      </p>
    </template>
    <template v-else>
      <p>
        <strong>{{ invite.preview.ownerName }}</strong> tě zve do skupiny
        <strong>{{ invite.preview.groupName }}</strong> (členové: {{ invite.preview.memberCount }}).
      </p>
      <p class="text-muted">
        Ostatní uvidí tvé jméno a u akcí ve skupině jen to, zda v daný den můžeš, nemůžeš, nebo to
        nevíme. Tvé směny ani rozvrh neuvidí. E-mail se jim neukazuje.
      </p>
    </template>
    <div class="flex justify-end gap-3">
      <template v-if="invite.preview && !invite.preview.isMember && !invite.error">
        <UiButton @click="emit('decline')">Teď ne</UiButton>
        <UiButton variant="primary" @click="emit('accept')">Přidat se</UiButton>
      </template>
      <UiButton v-else-if="invite.preview?.isMember" variant="primary" @click="emit('accept')">
        Otevřít skupinu
      </UiButton>
      <UiButton v-else @click="emit('decline')">Zavřít</UiButton>
    </div>
  </UiDialog>
</template>
