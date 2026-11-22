<script setup lang="ts">
import { computed } from 'vue'
import type { PendingInvite } from '@/session'
import { formatDateRange } from '@/ui/format'
import UiButton from './UiButton.vue'
import UiDialog from './UiDialog.vue'

const props = defineProps<{ invite: PendingInvite }>()
const emit = defineEmits<{ accept: []; decline: [] }>()

const preview = computed(() => props.invite.preview)

/** Odkaz, který není co přijmout: vlastní odkaz, už přátelé, už člen nebo účastník. */
const nothingToAccept = computed(() => {
  const value = preview.value
  if (!value) return false
  if (value.kind === 'group') return value.isMember
  if (value.kind === 'action') return value.isParticipant || value.isSelf
  return value.isFriend || value.isSelf
})

const title = computed(() => {
  if (preview.value?.kind === 'friend') return 'Žádost o přátelství'
  if (preview.value?.kind === 'action') return 'Pozvánka do akce'
  return 'Pozvánka do skupiny'
})

const acceptLabel = computed(() => {
  if (preview.value?.kind === 'friend') return 'Přidat do přátel'
  if (preview.value?.kind === 'action') return 'Souhlasím, přijmout'
  return 'Přidat se'
})
</script>

<template>
  <UiDialog :title="title" @close="emit('decline')">
    <p v-if="invite.error" role="alert" class="font-medium text-warn">{{ invite.error }}</p>
    <p v-else-if="!preview" class="text-muted">Načítám pozvánku…</p>

    <template v-else-if="preview.kind === 'group'">
      <p v-if="preview.isMember">
        Ve skupině <strong>{{ preview.groupName }}</strong> už jsi.
      </p>
      <template v-else>
        <p>
          <strong>{{ preview.ownerName }}</strong> tě zve do skupiny
          <strong>{{ preview.groupName }}</strong> (členové: {{ preview.memberCount }}).
        </p>
        <p class="text-muted">
          Členové tě budou moct zvát do akcí. Z tvého rozvrhu uvidí jen, zda v daný den můžeš. Tvé
          směny ani e-mail neuvidí.
        </p>
      </template>
    </template>

    <template v-else-if="preview.kind === 'action'">
      <p v-if="preview.isSelf">
        Tohle je odkaz do tvé akce <strong>{{ preview.actionName }}</strong>. Pošli ho ostatním.
      </p>
      <p v-else-if="preview.isParticipant">
        V akci <strong>{{ preview.actionName }}</strong> už jsi.
      </p>
      <template v-else>
        <p>
          <strong>{{ preview.organizerName }}</strong> tě zve do akce
          <strong>{{ preview.actionName }}</strong> ({{
            formatDateRange(preview.from, preview.to)
          }}).
        </p>
        <p class="text-muted">
          Když přijmeš, budete s {{ preview.organizerName }} přátelé a ostatní v akci uvidí jen, kdy
          můžeš (může / nemůže / nevíme). Tvé směny, události ani e-mail neuvidí.
        </p>
      </template>
    </template>

    <template v-else>
      <p v-if="preview.isSelf">Tohle je tvůj vlastní odkaz. Pošli ho kamarádům.</p>
      <p v-else-if="preview.isFriend">
        S <strong>{{ preview.fromName }}</strong> už jste přátelé.
      </p>
      <template v-else>
        <p>
          <strong>{{ preview.fromName }}</strong> si tě chce přidat do přátel.
        </p>
        <p class="text-muted">
          Přátelé se můžou zvát do akcí. Z tvého rozvrhu uvidí jen, zda v daný den můžeš. Tvé směny
          ani e-mail neuvidí.
        </p>
      </template>
    </template>

    <div class="flex justify-end gap-3">
      <template v-if="preview && !nothingToAccept && !invite.error">
        <UiButton @click="emit('decline')">Teď ne</UiButton>
        <UiButton variant="primary" @click="emit('accept')">{{ acceptLabel }}</UiButton>
      </template>
      <UiButton v-else @click="emit('decline')">Zavřít</UiButton>
    </div>
  </UiDialog>
</template>
