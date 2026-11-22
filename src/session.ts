import { computed, reactive, watch } from 'vue'
import { BackendError, type Backend } from './client/backend'
import { httpBackend } from './client/http'
import { memoryBackend } from './client/memory'
import type {
  ActionResource,
  ActionView,
  CalendarStatus,
  ClarifyResponse,
  ConfirmedSlot,
  Friend,
  FriendRequest,
  FriendsResponse,
  Group,
  InviteLink,
  InvitePreview,
  NotificationSettings,
  OwnedPerson,
  SentFriendRequest,
  SlotResponseRequest,
  User,
} from './contract/api'
import {
  buildCalendar,
  findReadingWarnings,
  findUncertainDays,
  privateRow,
  type CalendarView,
  type PersonDay,
} from './core/calendar'
import { composePeople, findParityQuestions } from './core/compose'
import { icsForEvent } from './core/ics'
import type { SourceAnswer } from './core/review'
import { sampleAction } from './core/fixtures'
import {
  actionDetails,
  createAction as validateNewAction,
  updateActionDetails,
  type NewActionErrors,
  type NewActionInput,
} from './core/newAction'
import type { Action, ActionDetails, DateString, Shift, SourceFile } from './core/schema'
import { findProposals } from './core/scheduler'
import { analyzeStability } from './core/sensitivity'
import { detectSourceFileKind } from './core/sourceFile'
import { LEGACY_STORAGE_KEY, STORAGE_KEY, loadState } from './core/storage'
import { addDays, eachDay, mondayOf } from './core/time'

/**
 * Stav aplikace v prohlížeči. Zdrojem pravdy je server (účet uživatele), tady je jeho kopie
 * a to, co na server nepatří: vložené a ještě nepřečtené soubory, otevřená stránka, výběr.
 *
 * Každý má jeden rozpis („Můj rozvrh“), který si nahraje sám. V akci jsou organizátor
 * a přátelé, kteří pozvánku přijali. O nich aplikace ví jen „může / nemůže / nevíme“.
 */

/** Klíč, pod kterým pozvánka z odkazu přečká přihlášení přes Google (sessionStorage). */
export const INVITE_STORAGE_KEY = 'sladit.pozvanka'
/** Akce z odkazu v e-mailu (?akce=<id>). Přečká přihlášení stejně jako pozvánka. */
export const ACTION_STORAGE_KEY = 'sladit.akce'

/** Zprávy po návratu od Googlu z připojování kalendáře (?kalendar=…). */
const CALENDAR_RESULTS: Record<string, string> = {
  pripojen: 'Google Kalendář je připojený. Obsazenost z něj se započítá do tvého rozvrhu.',
  chyba: 'Kalendář se nepodařilo připojit. Zkus to znovu.',
  zamitnuto: 'Připojení kalendáře bylo zamítnuto.',
  nedostupny: 'Google Kalendář zatím není na serveru nastavený.',
}

/** Token pozvánky z adresy /pozvanka/<token>, jinak null. */
export function inviteTokenFromPath(pathname: string): string | null {
  return /^\/pozvanka\/([\w-]{16,200})\/?$/.exec(pathname)?.[1] ?? null
}

type StorageLike = Pick<Storage, 'getItem' | 'removeItem'>
type WritableStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type SessionStatus = 'loading' | 'signedOut' | 'ready' | 'failed'

/** Otevřená stránka hlavní části. */
export type Page = 'action' | 'schedule' | 'friends' | 'group' | 'settings'
export type PendingWork = 'confirm' | 'unconfirm' | 'calendar' | 'slot'

/** Jedna zpráva v okně doptání: od aplikace, nebo moje odpověď. */
export interface ReviewMessage {
  from: 'app' | 'me'
  text: string
}

/** Pozvánka do skupiny nebo do přátel čekající na odpověď. Náhled je null, dokud nedorazí. */
export interface PendingInvite {
  token: string
  preview: InvitePreview | null
  error: string | null
}

/** Člověk, kterého jde pozvat do akce: přítel, nebo člen některé z mých skupin. */
export interface Contact {
  userId: string
  name: string
  isFriend: boolean
  groupNames: string[]
}

/** Kolik týdnů ukazuje Můj rozvrh a za jak dlouhé období se čtou podklady. */
const SCHEDULE_WEEKS = 4
const READING_WEEKS = 12
/** Denní okno, ve kterém Můj rozvrh ukazuje volno. */
const SCHEDULE_DAY = { durationMinutes: 60, windowStart: '06:00', windowEnd: '23:00' }

const PASTED_TEXT_NAME = 'Vložený text'

class MissingFilesError extends Error {}

const READ_ERROR = 'Rozpis se nepodařilo přečíst.'
const UNREADABLE_ERROR = 'Podklad je nečitelný, vlož ostřejší fotku nebo jiný soubor.'
const NOTHING_TO_READ_ERROR = 'V podkladu není co číst.'
const RATE_LIMIT_ERROR = 'Došel limit, zkus to za chvíli.'
const MISSING_FILES_ERROR = 'Podklady je potřeba vložit znovu.'
const SAVE_ERROR = 'Změnu se nepodařilo uložit.'

const FRIEND_REQUEST_RESULTS = {
  sent: 'Žádost odeslána. Po přijetí přibude mezi přáteli.',
  accepted: 'Žádost od tohoto člověka už čekala, teď jste přátelé.',
  friends: 'S tímto člověkem už přátelé jste.',
} as const

function readErrorMessage(error: unknown): string {
  if (error instanceof MissingFilesError) return MISSING_FILES_ERROR
  if (error instanceof BackendError) {
    // Když se část podkladu modelu neposlala, je to pravděpodobnější příčina než špatná fotka.
    if (error.code === 'unreadable') {
      return error.notes.length > 0
        ? `${NOTHING_TO_READ_ERROR} ${error.notes.join(' ')}`
        : UNREADABLE_ERROR
    }
    if (error.code === 'busy') return RATE_LIMIT_ERROR
    return error.message
  }
  // Chyba při přípravě v prohlížeči, třeba poškozený Excel. Zpráva je česky.
  return error instanceof Error && error.message ? error.message : READ_ERROR
}

function localToday(): DateString {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export interface SessionOptions {
  backend: Backend
  generateId?: () => string
  /** Úložiště prohlížeče, ze kterého jde jednou převzít akce z doby před účty. */
  storage?: StorageLike | null
  /** Ukázka bez přihlášení: nic se neukládá a ukázková akce se otevře sama. */
  demo?: boolean
  /** Token pozvánky z otevřeného odkazu. */
  inviteToken?: string | null
  /** Úložiště, ve kterém pozvánka přečká přihlášení (sessionStorage). */
  inviteStorage?: WritableStorage | null
  /** Dnešní datum (testy). */
  today?: () => DateString
  /** Výsledek připojení kalendáře z adresy (?kalendar=pripojen a podobně). */
  calendarResult?: string | null
  /** Akce z odkazu v e-mailu, otevře se po načtení. */
  openActionId?: string | null
}

export function createSession(options: SessionOptions) {
  const { backend } = options
  const generateId = options.generateId ?? (() => crypto.randomUUID())
  const storage = options.storage ?? null
  const today = options.today ?? localToday
  const inviteStorage = options.inviteStorage ?? null
  if (options.inviteToken) inviteStorage?.setItem(INVITE_STORAGE_KEY, options.inviteToken)
  let inviteToken = options.inviteToken ?? inviteStorage?.getItem(INVITE_STORAGE_KEY) ?? null
  if (options.openActionId) inviteStorage?.setItem(ACTION_STORAGE_KEY, options.openActionId)
  let openActionId = options.openActionId ?? inviteStorage?.getItem(ACTION_STORAGE_KEY) ?? null

  const state = reactive({
    status: 'loading' as SessionStatus,
    user: null as User | null,
    fakeGoogle: false,
    demo: options.demo ?? false,
    page: 'schedule' as Page,
    /** Můj rozpis: člověk „sám za sebe“ s podklady a ručními úpravami. */
    people: [] as OwnedPerson[],
    actions: [] as ActionResource[],
    selectedActionId: null as string | null,
    selectedGroupId: null as string | null,
    groups: [] as Group[],
    friends: [] as Friend[],
    friendInvites: [] as InviteLink[],
    /** Žádosti o přátelství podle e-mailu: které mi přišly a které jsem poslal. */
    friendRequests: {
      incoming: [] as FriendRequest[],
      outgoing: [] as SentFriendRequest[],
    },
    /** Odkaz s pozvánkou, který se ukáže jen jednou, hned po založení. */
    lastInvite: null as { target: 'friends' | string; url: string } | null,
    /** Pozvánka z odkazu. Před přihlášením je známý jen token. */
    invite: null as PendingInvite | null,
    /** E-mailová upozornění. Null, dokud se nenačtou. */
    notifications: null as NotificationSettings | null,
    /** Pohledy ze serveru na akce s cizími lidmi: návrhy a stav dne ostatních. */
    views: {} as Record<string, ActionView>,
    /** Vložené a ještě nepřečtené soubory mého rozvrhu. Obsah drží jen paměť (fileBlobs). */
    pendingFiles: [] as SourceFile[],
    reading: false,
    readError: null as string | null,
    /** První den (pondělí) období, které ukazuje Můj rozvrh. */
    scheduleFrom: mondayOf(today()),
    selectedDay: null as PersonDay | null,
    /** Parametry akce před poslední úpravou, aby šla vrátit. */
    lastActionEdit: null as { actionId: string; previous: NewActionInput } | null,
    /** Poslední chyba při ukládání, ukáže se nahoře. */
    error: null as string | null,
    /** Akce uložené v tomto prohlížeči z doby před účty, které jde převzít. */
    localActions: [] as Action[],
    /** Nabídka převzetí je pro tuto návštěvu odložená: zůstane jen v Nastavení. */
    localActionsDismissed: false,
    calendar: null as CalendarStatus | null,
    /** Zpráva po připojení kalendáře, ukáže se nahoře. */
    calendarNotice: (options.calendarResult && CALENDAR_RESULTS[options.calendarResult]) || null,
    /** Akce, u kterých uživatel odmítl zápis do kalendáře (jen pro tuto návštěvu). */
    dismissedCalendarPrompts: [] as string[],
    /**
     * Co se právě ukládá: potvrzení termínu, jeho zrušení, nebo zápis do kalendáře. První zápis
     * do Google Kalendáře trvá i několik sekund, tlačítka se mezitím zablokují.
     */
    pending: null as PendingWork | null,
    /** Doptání k podkladu. Rozhovor a návrh od AI platí jen pro tuto návštěvu. */
    review: {
      /** Podklad v otevřeném okně doptání. Okno se otevře samo po čtení, jinak tlačítkem. */
      sourceId: null as string | null,
      messages: {} as Record<string, ReviewMessage[]>,
      /** Návrh změn od AI, čeká na potvrzení. */
      proposal: null as (ClarifyResponse & { sourceId: string }) | null,
      sending: false,
      error: null as string | null,
    },
  })

  const fileBlobs = new Map<string, File>()

  // Můj rozvrh

  const me = computed(() => state.people.find((person) => person.isSelf) ?? null)

  /** Můj rozvrh jako „akce“ jen se mnou, aby šel ukázat stejným kalendářem. */
  const scheduleAction = computed<Action | null>(() => {
    const person = me.value
    if (!person) return null
    return {
      id: 'muj-rozvrh',
      name: 'Můj rozvrh',
      from: state.scheduleFrom,
      to: addDays(state.scheduleFrom, SCHEDULE_WEEKS * 7 - 1),
      ...SCHEDULE_DAY,
      people: [{ ...person, files: state.pendingFiles }],
    }
  })

  const scheduleComposed = computed(() =>
    scheduleAction.value ? composePeople(scheduleAction.value) : [],
  )

  const scheduleCalendar = computed(() =>
    scheduleAction.value ? buildCalendar(scheduleAction.value, scheduleComposed.value) : null,
  )

  const scheduleParityQuestions = computed(() =>
    scheduleAction.value ? findParityQuestions(scheduleAction.value) : [],
  )

  const scheduleWarnings = computed(() => findReadingWarnings(scheduleComposed.value))

  /** Podklad v otevřeném okně doptání. Starší podklady bez uloženého čtení se doptat nedají. */
  const reviewSource = computed(
    () =>
      me.value?.sources.find((source) => source.id === state.review.sourceId && source.questions) ??
      null,
  )

  /**
   * Podklady, u kterých zbývají otázky, ale okno je zavřené. Nad kalendářem se jen připomenou,
   * aby okno nevyskakovalo při každé návštěvě.
   */
  const waitingReviews = computed(() =>
    (me.value?.sources ?? []).filter(
      (source) => (source.questions?.length ?? 0) > 0 && source.id !== state.review.sourceId,
    ),
  )

  const scheduleUncertainDays = computed(() =>
    scheduleAction.value ? findUncertainDays(scheduleAction.value, scheduleComposed.value) : [],
  )

  // Akce

  // Akce ve tvaru, se kterým počítá jádro (core): jen lidé, jejichž rozpis znám, tedy já.
  function assemble(resource: ActionResource): Action {
    const person = me.value
    const takesPart = person !== null && resource.participantIds.includes(person.id)
    return {
      id: resource.id,
      ...resource.details,
      people: takesPart ? [{ ...person, files: [] }] : [],
    }
  }

  const selectedResource = computed(
    () => state.actions.find((action) => action.id === state.selectedActionId) ?? null,
  )

  const selectedAction = computed(() =>
    selectedResource.value ? assemble(selectedResource.value) : null,
  )

  const selectedGroup = computed(
    () => state.groups.find((group) => group.id === state.selectedGroupId) ?? null,
  )

  /** Akci upravuje, zve do ní a potvrzuje termín jen organizátor. */
  const canEditAction = computed(() => selectedResource.value?.isOrganizer ?? false)

  /** Návrhy počítá server, když jsou v akci lidé, jejichž rozpis přihlášený nevidí. */
  const usesServerView = computed(() => (selectedResource.value?.others.length ?? 0) > 0)

  /** Pohled ze serveru, jen pokud sedí na dnešní období akce. */
  const currentView = computed<ActionView | null>(() => {
    const action = selectedAction.value
    const view = action ? state.views[action.id] : undefined
    if (!action || !view) return null
    const dates = eachDay(action.from, action.to)
    return view.dates.length === dates.length && view.dates.every((date, i) => date === dates[i])
      ? view
      : null
  })

  /** Účastníci vybrané akce v pořadí: organizátor a ti, kdo přijali. */
  const participants = computed(() => {
    const resource = selectedResource.value
    if (!resource) return []
    return resource.participantIds.flatMap((personId) => {
      if (me.value?.id === personId)
        return [{ id: personId, name: me.value.name, isPrivate: false }]
      const other = resource.others.find((person) => person.id === personId)
      return other ? [{ id: other.id, name: other.name, isPrivate: true }] : []
    })
  })

  const composedPeople = computed(() =>
    selectedAction.value ? composePeople(selectedAction.value) : [],
  )

  /** Kalendář akce: můj řádek s rozpisem, ostatní jen se stavem dne ze serveru. */
  const calendar = computed<CalendarView | null>(() => {
    const action = selectedAction.value
    if (!action) return null
    const own = buildCalendar(action, composedPeople.value)
    if (!usesServerView.value) return own
    const rows = new Map(own.rows.map((row) => [row.personId, row]))
    return {
      dates: own.dates,
      rows: participants.value.flatMap((person) => {
        if (!person.isPrivate) return rows.has(person.id) ? [rows.get(person.id)!] : []
        const days = currentView.value?.others.find((other) => other.personId === person.id)
        return [privateRow(person.id, person.name, own.dates, days?.days)]
      }),
    }
  })

  /** Zda se nejlepší termín může změnit a na čích datech to stojí. */
  const stability = computed(() => {
    if (usesServerView.value) return currentView.value?.stability ?? null
    return selectedAction.value
      ? analyzeStability(selectedAction.value, composedPeople.value)
      : null
  })

  const proposals = computed(() => {
    if (usesServerView.value) return currentView.value?.proposals ?? []
    return selectedAction.value ? findProposals(selectedAction.value, composedPeople.value) : []
  })

  /**
   * Nejistá čtení, která mohou změnit nejlepší termín. Nejistá směna zpochybní svůj den
   * a noční i ráno dne dalšího, proto se počítá i den po ní.
   */
  function isPivotal(day: PersonDay): boolean {
    const pivot = stability.value?.pivots.find((item) => item.personId === day.personId)
    return (
      pivot?.dates.some(
        (item) =>
          item.reason === 'uncertain' &&
          (item.date === day.date || item.date === addDays(day.date, 1)),
      ) ?? false
    )
  }

  /** Moje nejistá čtení v období akce, nejdřív ta, na kterých stojí nejlepší termín. */
  const uncertainDays = computed(() => {
    if (!selectedAction.value) return []
    const days = findUncertainDays(selectedAction.value, composedPeople.value)
    return [...days.filter(isPivotal), ...days.filter((day) => !isPivotal(day))]
  })

  const pivotalUncertainCount = computed(() => uncertainDays.value.filter(isPivotal).length)

  const readingWarnings = computed(() => findReadingWarnings(composedPeople.value))

  const parityQuestions = computed(() =>
    selectedAction.value ? findParityQuestions(selectedAction.value) : [],
  )

  /**
   * Zeptat se na zápis do kalendáře: termín je potvrzený, účastním se, mám kalendář se zápisem,
   * ale ne automatický zápis, a termín v kalendáři ještě nemám.
   */
  const calendarPrompt = computed(() => {
    const resource = selectedResource.value
    const calendar = state.calendar
    return (
      resource !== null &&
      resource.confirmed !== null &&
      // Zapsat jde jen termín, na který jdu: organizátor vždy, ostatní po odpovědi „jdu“.
      (resource.isOrganizer || resource.mySlot === 'going') &&
      !resource.inMyCalendar &&
      calendar?.state === 'connected' &&
      calendar.canWrite &&
      !calendar.autoWrite &&
      !state.dismissedCalendarPrompts.includes(resource.id)
    )
  })

  /** Položky seznamu akcí: počet účastníků, čeká na moji odpověď, potvrzený termín. */
  const actionItems = computed(() =>
    state.actions.map((action) => ({
      id: action.id,
      name: action.details.name,
      from: action.details.from,
      to: action.details.to,
      peopleCount: action.participantIds.length,
      waitingForMe: action.myStatus === 'invited',
      /** Navržený termín čeká na moji odpověď, nebo (u organizátora) někdo navrhl jiný. */
      slotWaiting:
        action.mySlot === 'pending' ||
        (action.isOrganizer && action.invites.some((invite) => invite.slot === 'counter')),
      confirmed: action.confirmed,
      agreed: action.agreed,
    })),
  )

  /**
   * Upozornění nahoře: navržený termín čeká na moji odpověď, nebo organizátorovi někdo
   * navrhl jiný termín. Jen první, další jsou vidět u akcí v menu.
   */
  const slotNotice = computed<{ actionId: string; text: string } | null>(() => {
    for (const action of state.actions) {
      if (action.mySlot === 'pending' && action.confirmed) {
        return {
          actionId: action.id,
          text: `${action.organizerName} navrhuje termín akce ${action.details.name}. Jdeš?`,
        }
      }
      const counter = action.isOrganizer
        ? action.invites.find((invite) => invite.slot === 'counter')
        : undefined
      if (counter) {
        return {
          actionId: action.id,
          text: `${counter.name} navrhuje jiný termín akce ${action.details.name}.`,
        }
      }
    }
    return null
  })

  /** Koho jde pozvat: přátelé a členové mých skupin, každý jednou. */
  const contacts = computed<Contact[]>(() => {
    const byId = new Map<string, Contact>()
    for (const friend of state.friends) {
      byId.set(friend.userId, { ...friend, isFriend: true, groupNames: [] })
    }
    for (const group of state.groups) {
      for (const member of group.members) {
        if (member.isYou) continue
        const contact = byId.get(member.userId) ?? {
          userId: member.userId,
          name: member.name,
          isFriend: false,
          groupNames: [],
        }
        contact.groupNames.push(group.name)
        byId.set(member.userId, contact)
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'cs'))
  })

  // Práce se serverem

  function signedOut() {
    state.status = 'signedOut'
    state.user = null
    state.people = []
    state.actions = []
    state.selectedActionId = null
    state.selectedGroupId = null
    state.groups = []
    state.friends = []
    state.friendInvites = []
    state.friendRequests = { incoming: [], outgoing: [] }
    state.lastInvite = null
    state.views = {}
    state.pendingFiles = []
    state.lastActionEdit = null
    state.localActions = []
    state.localActionsDismissed = false
    state.calendar = null
    state.review = {
      sourceId: null,
      messages: {},
      proposal: null,
      sending: false,
      error: null,
    }
    fileBlobs.clear()
    // Pozvánka z odkazu zůstává: po přihlášení se nabídne.
    state.invite = inviteToken ? { token: inviteToken, preview: null, error: null } : null
  }

  /** Volání serveru. Chyba se ukáže uživateli, vypršelé přihlášení vrátí na přihlašovací obrazovku. */
  async function guarded<T>(work: () => Promise<T>): Promise<T | null> {
    state.error = null
    try {
      return await work()
    } catch (error) {
      if (error instanceof BackendError && error.status === 401) {
        signedOut()
        return null
      }
      state.error = error instanceof BackendError ? error.message : SAVE_ERROR
      return null
    }
  }

  function replaceMe(person: OwnedPerson) {
    state.people = state.people.map((existing) => (existing.id === person.id ? person : existing))
  }

  function replaceAction(action: ActionResource) {
    state.actions = state.actions.some((existing) => existing.id === action.id)
      ? state.actions.map((existing) => (existing.id === action.id ? action : existing))
      : [...state.actions, action]
  }

  function replaceGroup(group: Group) {
    state.groups = state.groups.some((existing) => existing.id === group.id)
      ? state.groups.map((existing) => (existing.id === group.id ? group : existing))
      : [...state.groups, group]
  }

  async function reload() {
    const [people, loaded, groups, friends, calendar, notifications] = await Promise.all([
      backend.people(),
      backend.actions(),
      backend.groups(),
      backend.friends(),
      backend.calendarStatus(),
      backend.notificationSettings(),
    ])
    state.calendar = calendar
    state.notifications = notifications
    state.people = people
    state.actions = loaded
    state.groups = groups
    applyFriends(friends)
    if (!loaded.some((action) => action.id === state.selectedActionId)) {
      state.selectedActionId = loaded[0]?.id ?? null
      if (state.page === 'action' && !state.selectedActionId) state.page = 'schedule'
    }
    if (!groups.some((group) => group.id === state.selectedGroupId)) {
      state.selectedGroupId = null
      if (state.page === 'group') state.page = 'schedule'
    }
  }

  function forgetInvite() {
    inviteToken = null
    inviteStorage?.removeItem(INVITE_STORAGE_KEY)
    state.invite = null
  }

  /** Načte, kam pozvánka zve. Neplatnou ukáže s vysvětlením. */
  async function loadInvite() {
    if (!inviteToken) return
    const token = inviteToken
    state.invite = { token, preview: null, error: null }
    try {
      state.invite = { token, preview: await backend.invitePreview(token), error: null }
    } catch (error) {
      if (error instanceof BackendError && error.status === 401) return signedOut()
      state.invite = {
        token,
        preview: null,
        error: error instanceof BackendError ? error.message : 'Pozvánku se nepodařilo načíst.',
      }
    }
  }

  async function init() {
    state.status = 'loading'
    state.error = null
    try {
      const response = await backend.me()
      state.fakeGoogle = response.fakeGoogle
      if (!response.user) {
        signedOut()
        return
      }
      state.user = response.user
      await reload()
      // Po návratu z Googlu se otevře Nastavení s kalendářem. Kdo ještě nemá rozpis, začne
      // Můj rozvrh. Jinak se otevře první akce.
      const mine = state.people.find((person) => person.isSelf)
      const hasSchedule = (mine?.sources.length ?? 0) + (mine?.overrides.length ?? 0) > 0
      state.page = state.calendarNotice
        ? 'settings'
        : state.selectedActionId && (hasSchedule || state.demo)
          ? 'action'
          : 'schedule'
      state.localActions = !state.demo && storage ? (loadState(storage)?.actions ?? []) : []
      // Odkaz z e-mailu otevře svou akci, i když člověk ještě nemá rozpis.
      if (openActionId) {
        if (state.actions.some((action) => action.id === openActionId)) {
          state.selectedActionId = openActionId
          state.page = 'action'
        }
        openActionId = null
        inviteStorage?.removeItem(ACTION_STORAGE_KEY)
      }
      state.status = 'ready'
      if (!state.demo) await loadInvite()
    } catch (error) {
      state.status = 'failed'
      state.error = error instanceof BackendError ? error.message : 'Aplikace se nenačetla.'
    }
  }

  async function logout() {
    await guarded(() => backend.logout())
    signedOut()
  }

  async function deleteAccount() {
    const done = await guarded(async () => {
      await backend.deleteAccount()
      return true
    })
    if (done) signedOut()
  }

  /** Převezme akce uložené v prohlížeči do účtu. Z prohlížeče zmizí až po úspěchu. */
  async function acceptLocalActions() {
    const imported = await guarded(() => backend.importActions(state.localActions))
    if (imported === null) return
    storage?.removeItem(STORAGE_KEY)
    storage?.removeItem(LEGACY_STORAGE_KEY)
    state.localActions = []
    await guarded(reload)
  }

  /**
   * Nabídku nahoře skryje pro tuto návštěvu. Data v prohlížeči zůstanou a převzít je jde
   * dál v Nastavení.
   */
  function dismissLocalActions() {
    state.localActionsDismissed = true
  }

  // Stránky

  function open(page: Page) {
    state.page = page
    state.selectedDay = null
    // Jednorázový odkaz s pozvánkou se ukazuje jen na stránce, kde vznikl.
    const here =
      page === 'group'
        ? state.selectedGroupId
        : page === 'action'
          ? `action:${state.selectedActionId}`
          : page
    if (state.lastInvite && state.lastInvite.target !== here) state.lastInvite = null
  }

  function showSchedule() {
    open('schedule')
  }

  function showFriends() {
    open('friends')
  }

  function showSettings() {
    open('settings')
  }

  function selectAction(actionId: string) {
    state.selectedActionId = actionId
    open('action')
  }

  function selectGroup(groupId: string) {
    state.selectedGroupId = groupId
    open('group')
  }

  // Akce

  /** Založí akci a pozve vybrané přátele. Vrací chyby formuláře. */
  async function createNewAction(
    input: NewActionInput,
    inviteUserIds: string[] = [],
  ): Promise<NewActionErrors | null> {
    const checked = validateNewAction('nova', input)
    if (!checked.ok) return checked.errors
    const action = await guarded(() => backend.createAction(input, inviteUserIds))
    if (!action) return null
    replaceAction(action)
    selectAction(action.id)
    return null
  }

  /** Změní parametry vybrané akce. Rozpisy zůstanou, termíny se přepočítají. Vrací chyby formuláře. */
  async function updateAction(input: NewActionInput): Promise<NewActionErrors | null> {
    const action = selectedAction.value
    if (!action) return null
    const checked = updateActionDetails(action, input)
    if (!checked.ok) return checked.errors
    const previous = actionDetails(action)
    const updated = await guarded(() => backend.updateAction(action.id, input))
    if (!updated) return null
    replaceAction(updated)
    state.lastActionEdit = { actionId: action.id, previous }
    state.selectedDay = null
    return null
  }

  /** Vrátí poslední úpravu parametrů akce. */
  async function undoActionUpdate() {
    const edit = state.lastActionEdit
    if (!edit || edit.actionId !== state.selectedActionId) return
    const restored = await guarded(() => backend.updateAction(edit.actionId, edit.previous))
    if (!restored) return
    replaceAction(restored)
    state.lastActionEdit = null
    state.selectedDay = null
  }

  async function deleteAction() {
    const actionId = state.selectedActionId
    if (!actionId) return
    const done = await guarded(async () => {
      await backend.deleteAction(actionId)
      return true
    })
    if (!done) return
    state.actions = state.actions.filter((action) => action.id !== actionId)
    state.selectedActionId = state.actions[0]?.id ?? null
    open(state.selectedActionId ? 'action' : 'schedule')
  }

  async function inviteToAction(userIds: string[]) {
    const actionId = state.selectedActionId
    if (!actionId || userIds.length === 0) return
    const action = await guarded(() => backend.inviteToAction(actionId, userIds))
    if (action) replaceAction(action)
  }

  /** Odkaz rovnou do akce. Ukáže se jen teď, server zná jen jeho otisk. */
  async function createActionLink() {
    const actionId = state.selectedActionId
    if (!actionId) return
    const created = await guarded(() => backend.createActionLink(actionId))
    if (!created) return
    replaceAction(created.action)
    state.lastInvite = { target: `action:${actionId}`, url: created.url }
  }

  async function revokeActionLink(linkId: string) {
    const actionId = state.selectedActionId
    if (!actionId) return
    const action = await guarded(() => backend.revokeActionLink(actionId, linkId))
    if (action) replaceAction(action)
  }

  /**
   * Akce z jedné věty. Vrátí parametry do formuláře, nebo zprávu, proč to nešlo.
   * Chyba se ukáže ve formuláři, ne nahoře na stránce.
   */
  async function draftAction(
    text: string,
  ): Promise<{ details: ActionDetails | null; reply: string }> {
    try {
      return await backend.draftAction(text)
    } catch (error) {
      if (error instanceof BackendError && error.status === 401) signedOut()
      return {
        details: null,
        reply: error instanceof BackendError ? error.message : 'Větu se nepodařilo zpracovat.',
      }
    }
  }

  async function setEmailNotifications(email: boolean) {
    const settings = await guarded(() => backend.setNotificationSettings({ email }))
    if (settings) state.notifications = settings
  }

  async function cancelInvite(userId: string) {
    const actionId = state.selectedActionId
    if (!actionId) return
    const action = await guarded(() => backend.cancelInvite(actionId, userId))
    if (action) replaceAction(action)
  }

  /** Odpověď na pozvánku. Po odmítnutí akce zmizí ze seznamu. */
  async function respondToAction(accept: boolean) {
    const actionId = state.selectedActionId
    if (!actionId) return
    const result = await guarded(async () => ({
      action: await backend.respondToAction(actionId, accept),
    }))
    if (!result) return
    if (result.action) {
      replaceAction(result.action)
      return
    }
    state.actions = state.actions.filter((action) => action.id !== actionId)
    state.selectedActionId = state.actions[0]?.id ?? null
    open(state.selectedActionId ? 'action' : 'schedule')
  }

  /** Organizátor potvrdí termín, nebo potvrzení zruší (null). */
  /** Spustí ukládání, jen když žádné jiné neběží, a po dobu běhu ho ukáže v `state.pending`. */
  async function onePending<T>(work: PendingWork, run: () => Promise<T>): Promise<T | null> {
    if (state.pending) return null
    state.pending = work
    try {
      return await run()
    } finally {
      state.pending = null
    }
  }

  async function respondToSlot(request: SlotResponseRequest) {
    const actionId = state.selectedActionId
    if (!actionId) return
    const action = await onePending('slot', () =>
      guarded(() => backend.respondToSlot(actionId, request)),
    )
    if (action) replaceAction(action)
  }

  async function adoptCounter(userId: string) {
    const actionId = state.selectedActionId
    if (!actionId) return
    const action = await onePending('confirm', () =>
      guarded(() => backend.adoptCounter(actionId, userId)),
    )
    if (action) replaceAction(action)
  }

  async function confirmSlot(slot: ConfirmedSlot | null) {
    const actionId = state.selectedActionId
    if (!actionId) return
    const action = await onePending(slot ? 'confirm' : 'unconfirm', () =>
      guarded(() => backend.confirmAction(actionId, slot)),
    )
    if (action) replaceAction(action)
  }

  // Přátelé

  /** Osobní odkaz „přidej si mě do přátel“. Ukáže se jen teď, server si ho nepamatuje. */
  async function createFriendInvite() {
    const created = await guarded(() => backend.createFriendInvite())
    if (!created) return
    state.friendInvites = [...state.friendInvites, created.invite]
    state.lastInvite = { target: 'friends', url: created.url }
  }

  async function revokeFriendInvite(inviteId: string) {
    const done = await guarded(async () => {
      await backend.revokeFriendInvite(inviteId)
      return true
    })
    if (done) state.friendInvites = state.friendInvites.filter((item) => item.id !== inviteId)
  }

  function applyFriends(response: FriendsResponse) {
    state.friends = response.friends
    state.friendInvites = response.invites
    state.friendRequests = { incoming: response.incoming, outgoing: response.outgoing }
  }

  /** Žádost o přátelství podle e-mailu. Vrátí větu pro formulář: potvrzení, nebo chybu. */
  async function sendFriendRequest(email: string): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await backend.sendFriendRequest(email)
      applyFriends(response)
      return { ok: true, message: FRIEND_REQUEST_RESULTS[response.result] }
    } catch (error) {
      if (error instanceof BackendError && error.status === 401) signedOut()
      return { ok: false, message: error instanceof BackendError ? error.message : SAVE_ERROR }
    }
  }

  async function acceptFriendRequest(requestId: string) {
    const response = await guarded(() => backend.acceptFriendRequest(requestId))
    if (response) applyFriends(response)
  }

  /** Odmítnutí žádosti, kterou jsem dostal, i zrušení té, kterou jsem poslal. */
  async function deleteFriendRequest(requestId: string) {
    const response = await guarded(() => backend.deleteFriendRequest(requestId))
    if (response) applyFriends(response)
  }

  async function removeFriend(userId: string) {
    const done = await guarded(async () => {
      await backend.removeFriend(userId)
      return true
    })
    if (done) state.friends = state.friends.filter((friend) => friend.userId !== userId)
  }

  // Skupiny

  async function createGroup(name: string): Promise<string | null> {
    const trimmed = name.trim()
    if (!trimmed) return 'Vyplň název skupiny.'
    const group = await guarded(() => backend.createGroup(trimmed))
    if (!group) return state.error
    replaceGroup(group)
    selectGroup(group.id)
    return null
  }

  async function createInvite(groupId: string) {
    const created = await guarded(() => backend.createInvite(groupId))
    if (!created) return
    replaceGroup(created.group)
    state.lastInvite = { target: groupId, url: created.url }
  }

  async function revokeInvite(groupId: string, inviteId: string) {
    const group = await guarded(() => backend.revokeInvite(groupId, inviteId))
    if (group) replaceGroup(group)
  }

  async function addMember(groupId: string, userId: string) {
    const group = await guarded(() => backend.addMember(groupId, userId))
    if (group) replaceGroup(group)
  }

  async function removeMember(groupId: string, userId: string) {
    const group = await guarded(() => backend.removeMember(groupId, userId))
    if (group) replaceGroup(group)
  }

  /** Odchod ze skupiny, nebo její smazání zakladatelem. Akce zůstávají. */
  async function leaveGroup(groupId: string, remove = false) {
    const done = await guarded(async () => {
      await (remove ? backend.deleteGroup(groupId) : backend.leaveGroup(groupId))
      state.groups = state.groups.filter((group) => group.id !== groupId)
      return true
    })
    if (done) {
      state.selectedGroupId = null
      open('schedule')
    }
  }

  // Pozvánky odkazem

  async function acceptInvite() {
    const token = state.invite?.token
    if (!token) return
    const result = await guarded(() => backend.acceptInvite(token))
    if (!result) return
    forgetInvite()
    if (result.kind === 'group') {
      replaceGroup(result.group)
      selectGroup(result.group.id)
    } else if (result.kind === 'action') {
      // Přibyl přítel i akce: načte se všechno znovu a akce se otevře.
      replaceAction(result.action)
      await guarded(reload)
      selectAction(result.action.id)
    } else {
      if (!state.friends.some((friend) => friend.userId === result.friend.userId)) {
        state.friends = [...state.friends, result.friend]
      }
      showFriends()
    }
  }

  function declineInvite() {
    forgetInvite()
  }

  // Google Kalendář

  async function setCalendarAutoWrite(autoWrite: boolean) {
    const calendar = await guarded(() => backend.setCalendarAutoWrite(autoWrite))
    if (calendar) state.calendar = calendar
  }

  /** Odpojí kalendář. Obsazenost z něj zmizí, zapsané události v kalendáři zůstanou. */
  async function disconnectCalendar() {
    const done = await guarded(async () => {
      state.calendar = await backend.disconnectCalendar()
      state.people = await backend.people()
      return true
    })
    if (done) state.calendarNotice = null
  }

  /** Načte obsazenost z kalendáře hned. */
  async function syncCalendar() {
    await guarded(async () => {
      state.calendar = await backend.syncCalendar()
      state.people = await backend.people()
    })
  }

  async function addToCalendar() {
    const actionId = state.selectedActionId
    if (!actionId) return
    const action = await onePending('calendar', () =>
      guarded(() => backend.addToCalendar(actionId)),
    )
    if (action) replaceAction(action)
  }

  async function removeFromCalendar() {
    const actionId = state.selectedActionId
    if (!actionId) return
    const action = await onePending('calendar', () =>
      guarded(() => backend.removeFromCalendar(actionId)),
    )
    if (action) replaceAction(action)
  }

  function dismissCalendarPrompt() {
    if (state.selectedActionId) state.dismissedCalendarPrompts.push(state.selectedActionId)
  }

  function dismissCalendarNotice() {
    state.calendarNotice = null
  }

  /** Soubor .ics s potvrzeným termínem vybrané akce, pro lidi bez připojeného kalendáře. */
  function icsForSelectedAction(): { fileName: string; content: string } | null {
    const resource = selectedResource.value
    if (!resource?.confirmed) return null
    const content = icsForEvent({
      uid: `${resource.id}@sladit`,
      title: resource.details.name,
      ...resource.confirmed,
      description: `Termín potvrzený v aplikaci Sladit. Pořádá ${resource.organizerName}.`,
      createdAt: new Date().toISOString(),
    })
    const safeName = resource.details.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
    return { fileName: `${safeName || 'akce'}.ics`, content }
  }

  // Pohled ze serveru na akce s cizími lidmi

  let viewRequest = 0

  /** Načte návrhy a stav dne ostatních pro vybranou akci. Starší odpověď novější nepřepíše. */
  async function refreshView() {
    const resource = selectedResource.value
    if (!resource || resource.others.length === 0 || state.status !== 'ready') return
    const request = ++viewRequest
    try {
      const view = await backend.actionView(resource.id)
      if (request === viewRequest) state.views[resource.id] = view
    } catch (error) {
      if (error instanceof BackendError && error.status === 401) return signedOut()
      if (request === viewRequest) {
        state.error = error instanceof BackendError ? error.message : SAVE_ERROR
      }
    }
  }

  // Pohled se přepočítá, když se změní akce nebo můj rozpis.
  const viewKey = computed(() => {
    const resource = selectedResource.value
    if (!resource || resource.others.length === 0) return null
    const mine = me.value ? [me.value.sources, me.value.overrides] : null
    return JSON.stringify([resource, mine, state.status])
  })
  watch(viewKey, (key) => {
    if (key) void refreshView()
  })

  // Můj rozvrh: podklady, čtení, ruční úpravy

  /** Vloží soubory k přečtení. Vrací názvy souborů, které neumíme přečíst. */
  function addFiles(files: File[]): string[] {
    const rejectedNames: string[] = []
    for (const file of files) {
      const kind = detectSourceFileKind(file.name, file.type)
      if (!kind) {
        rejectedNames.push(file.name)
        continue
      }
      const id = generateId()
      fileBlobs.set(id, file)
      state.pendingFiles.push({ id, name: file.name, kind })
    }
    state.readError = null
    return rejectedNames
  }

  function addText(text: string) {
    addFiles([new File([text], `${PASTED_TEXT_NAME}.txt`, { type: 'text/plain' })])
  }

  function removePendingFile(fileId: string) {
    state.pendingFiles = state.pendingFiles.filter((file) => file.id !== fileId)
    fileBlobs.delete(fileId)
  }

  /** Přečte vložené podklady modelem a přidá je k mému rozpisu. Starší zdroje a úpravy zůstanou. */
  async function readSchedule() {
    const person = me.value
    const files = state.pendingFiles
    if (!person || files.length === 0 || state.reading) return
    state.reading = true
    state.readError = null
    try {
      const blobs = files.map((file) => fileBlobs.get(file.id))
      if (blobs.some((blob) => blob === undefined)) throw new MissingFilesError()
      // Příprava běží v prohlížeči: z Excelu jde jen viditelná část a název souboru se neposílá.
      // Modul s ExcelJS se načte až tady, ať se s ním nestahuje úvodní stránka.
      const { prepareSource } = await import('./llm/ingest')
      const parts = await Promise.all(
        files.map((file, index) => prepareSource(blobs[index]!, file.kind)),
      )
      const from = mondayOf(today())
      const updated = await backend.read(person.id, {
        from,
        to: addDays(from, READING_WEEKS * 7 - 1),
        files: [...files],
        parts,
      })
      const before = new Set(person.sources.map((source) => source.id))
      replaceMe(updated)
      state.pendingFiles = []
      // Má-li nový podklad otázky, okno doptání vyskočí hned po čtení.
      const added = updated.sources.find(
        (source) => !before.has(source.id) && (source.questions?.length ?? 0) > 0,
      )
      if (added) openReview(added.id)
    } catch (error) {
      if (error instanceof BackendError && error.status === 401) signedOut()
      state.readError = readErrorMessage(error)
    } finally {
      state.reading = false
    }
  }

  async function renameMe(name: string): Promise<string | null> {
    const person = me.value
    const trimmed = name.trim()
    if (!person) return null
    if (!trimmed) return 'Jméno nesmí být prázdné.'
    const updated = await guarded(() => backend.renamePerson(person.id, trimmed))
    if (!updated) return state.error
    replaceMe(updated)
    return null
  }

  function selectDay(day: PersonDay | null) {
    state.selectedDay = day
  }

  /** Ruční úprava dne. Pokrývá jen ten den a nové čtení ji nepřepíše. */
  async function saveDayShifts(date: DateString, shifts: Shift[]) {
    const person = me.value
    if (!person) return
    const updated = await guarded(() => backend.setOverride(person.id, date, shifts))
    if (updated) replaceMe(updated)
  }

  /** Den se zase řídí podklady. */
  async function clearDayOverride(date: DateString) {
    const person = me.value
    if (!person) return
    const updated = await guarded(() => backend.deleteOverride(person.id, date))
    if (updated) replaceMe(updated)
  }

  async function removeSource(sourceId: string) {
    const person = me.value
    if (!person) return
    const updated = await guarded(() => backend.deleteSource(person.id, sourceId))
    if (!updated) return
    replaceMe(updated)
    // Obsah souborů smazaného zdroje už není potřeba ani pro náhled.
    const referenced = new Set([
      ...state.pendingFiles.map((file) => file.id),
      ...updated.sources.flatMap((source) => source.files.map((file) => file.id)),
    ])
    for (const fileId of fileBlobs.keys()) if (!referenced.has(fileId)) fileBlobs.delete(fileId)
  }

  async function changeSourceCircle(sourceId: string, circle: string) {
    const person = me.value
    if (!person) return
    const updated = await guarded(() => backend.updateSource(person.id, sourceId, { circle }))
    if (updated) replaceMe(updated)
  }

  /** Potvrzení, zda je týden s daným dnem lichý, nebo sudý. */
  async function answerWeekParity(sourceId: string, date: DateString, odd: boolean) {
    const person = me.value
    if (!person) return
    const updated = await guarded(() =>
      backend.updateSource(person.id, sourceId, { weekParity: { date, odd } }),
    )
    if (updated) replaceMe(updated)
  }

  // Doptání k podkladu

  function openReview(sourceId: string) {
    state.review.sourceId = sourceId
    state.review.error = null
  }

  function closeReview() {
    state.review.sourceId = null
    state.review.proposal = null
    state.review.error = null
  }

  function sayInReview(sourceId: string, message: ReviewMessage) {
    state.review.messages[sourceId] = [...(state.review.messages[sourceId] ?? []), message]
  }

  /** Volání serveru z okna doptání. Chyba se ukáže v okně, ne nahoře nad stránkou. */
  async function reviewCall<T>(work: () => Promise<T>): Promise<T | null> {
    if (state.review.sending) return null
    state.review.sending = true
    state.review.error = null
    try {
      return await work()
    } catch (error) {
      if (error instanceof BackendError && error.status === 401) signedOut()
      state.review.error = error instanceof BackendError ? error.message : SAVE_ERROR
      return null
    } finally {
      state.review.sending = false
    }
  }

  /** Odpověď z tlačítka. `echo` je moje odpověď, jak se ukáže v rozhovoru. */
  async function answerReview(sourceId: string, answers: SourceAnswer[], echo: string) {
    const person = me.value
    if (!person || state.review.sending) return false
    const updated = await reviewCall(() => backend.answerSource(person.id, sourceId, answers))
    if (!updated) return false
    // Do rozhovoru až po uložení: neuložená odpověď by tam strašila jako platná.
    sayInReview(sourceId, { from: 'me', text: echo })
    replaceMe(updated)
    return true
  }

  /** Zpráva vlastními slovy: AI z ní navrhne změny, uloží se až po potvrzení. */
  async function sendReviewMessage(sourceId: string, text: string) {
    const person = me.value
    const message = text.trim()
    if (!person || !message || state.review.sending) return
    sayInReview(sourceId, { from: 'me', text: message })
    state.review.proposal = null
    const result = await reviewCall(() => backend.clarifySource(person.id, sourceId, message))
    if (!result) return
    sayInReview(sourceId, { from: 'app', text: result.reply })
    if (result.answers.length > 0) state.review.proposal = { ...result, sourceId }
  }

  async function applyReviewProposal() {
    const proposal = state.review.proposal
    if (!proposal) return
    state.review.proposal = null
    const done = await answerReview(proposal.sourceId, proposal.answers, 'Použít změny')
    if (done) sayInReview(proposal.sourceId, { from: 'app', text: 'Hotovo, rozpis je upravený.' })
  }

  function discardReviewProposal() {
    const proposal = state.review.proposal
    if (!proposal) return
    state.review.proposal = null
    sayInReview(proposal.sourceId, { from: 'app', text: 'Dobře, nic neměním.' })
  }

  /** Posune Můj rozvrh o daný počet týdnů. */
  function shiftSchedule(weeks: number) {
    state.scheduleFrom = addDays(state.scheduleFrom, weeks * 7)
    state.selectedDay = null
  }

  function fileBlob(fileId: string): File | undefined {
    return fileBlobs.get(fileId)
  }

  return {
    state,
    loginUrl: backend.loginUrl,
    calendarConnectUrl: backend.calendarConnectUrl,
    calendarPrompt,
    setCalendarAutoWrite,
    disconnectCalendar,
    syncCalendar,
    addToCalendar,
    removeFromCalendar,
    dismissCalendarPrompt,
    dismissCalendarNotice,
    icsForSelectedAction,
    me,
    scheduleAction,
    scheduleCalendar,
    scheduleComposed,
    scheduleParityQuestions,
    scheduleWarnings,
    scheduleUncertainDays,
    reviewSource,
    waitingReviews,
    actionItems,
    slotNotice,
    contacts,
    selectedResource,
    selectedAction,
    selectedGroup,
    canEditAction,
    usesServerView,
    participants,
    composedPeople,
    calendar,
    stability,
    proposals,
    uncertainDays,
    pivotalUncertainCount,
    readingWarnings,
    parityQuestions,
    init,
    logout,
    deleteAccount,
    acceptLocalActions,
    dismissLocalActions,
    createActionLink,
    revokeActionLink,
    draftAction,
    setEmailNotifications,
    showSchedule,
    showFriends,
    showSettings,
    selectAction,
    selectGroup,
    createAction: createNewAction,
    updateAction,
    undoActionUpdate,
    deleteAction,
    inviteToAction,
    cancelInvite,
    respondToAction,
    confirmSlot,
    respondToSlot,
    adoptCounter,
    createFriendInvite,
    revokeFriendInvite,
    removeFriend,
    sendFriendRequest,
    acceptFriendRequest,
    deleteFriendRequest,
    createGroup,
    createInvite,
    revokeInvite,
    addMember,
    removeMember,
    leaveGroup,
    acceptInvite,
    declineInvite,
    refreshView,
    addFiles,
    addText,
    removePendingFile,
    readSchedule,
    renameMe,
    selectDay,
    saveDayShifts,
    clearDayOverride,
    removeSource,
    changeSourceCircle,
    answerWeekParity,
    openReview,
    closeReview,
    answerReview,
    sendReviewMessage,
    applyReviewProposal,
    discardReviewProposal,
    shiftSchedule,
    fileBlob,
  }
}

export type Session = ReturnType<typeof createSession>

let session: Session | null = null

/** Ukázka bez přihlášení na adrese s ?ukazka. Nic se v ní neukládá a podklady se nečtou. */
function isDemo(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('ukazka')
}

/**
 * Token z odkazu /pozvanka/<token>. Adresa se hned přepíše na úvodní, aby token nezůstal
 * v historii ani na snímku obrazovky. Do přihlášení ho drží sessionStorage.
 */
/** Výsledek připojení kalendáře z adresy. Adresa se hned přepíše na úvodní. */
function takeCalendarResultFromUrl(): string | null {
  if (typeof location === 'undefined') return null
  const result = new URLSearchParams(location.search).get('kalendar')
  if (result) history.replaceState(null, '', '/')
  return result
}

/** Akce z odkazu v e-mailu (?akce=<id>). Adresa se hned přepíše na úvodní. */
function takeActionFromUrl(): string | null {
  if (typeof location === 'undefined') return null
  const actionId = new URLSearchParams(location.search).get('akce')
  if (actionId) history.replaceState(null, '', '/')
  return actionId && /^[\w-]{1,100}$/.test(actionId) ? actionId : null
}

function takeInviteTokenFromUrl(): string | null {
  if (typeof location === 'undefined') return null
  const token = inviteTokenFromPath(location.pathname)
  if (token) history.replaceState(null, '', '/')
  return token
}

export function useSession(): Session {
  if (!session) {
    const demo = isDemo()
    session = createSession({
      backend: demo
        ? memoryBackend({ user: { id: 'ukazka', email: '', name: 'Ty' }, sample: sampleAction })
        : httpBackend(),
      storage: typeof localStorage === 'undefined' ? null : localStorage,
      demo,
      inviteToken: demo ? null : takeInviteTokenFromUrl(),
      calendarResult: demo ? null : takeCalendarResultFromUrl(),
      openActionId: demo ? null : takeActionFromUrl(),
      inviteStorage: typeof sessionStorage === 'undefined' ? null : sessionStorage,
    })
    void session.init()
  }
  return session
}
