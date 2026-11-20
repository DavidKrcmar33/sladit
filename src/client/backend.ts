import type {
  AcceptInviteResponse,
  ActionResource,
  ActionView,
  CalendarStatus,
  ClarifyResponse,
  ConfirmedSlot,
  FriendsResponse,
  Group,
  InviteLink,
  InvitePreview,
  MeResponse,
  OwnedPerson,
  ReadingRequest,
  SendFriendRequestResponse,
  UpdateSourceRequest,
} from '@/contract/api'
import type { SourceAnswer } from '@/core/review'
import type { Action, ActionDetails, Shift } from '@/core/schema'

/**
 * Co aplikace v prohlížeči potřebuje od serveru. Skutečný server je v http.ts, varianta v paměti
 * (memory.ts) slouží testům a ukázce bez přihlášení.
 */
export interface Backend {
  /** Adresa, na kterou prohlížeč přejde, aby se přihlásil přes Google. */
  readonly loginUrl: string
  /** Adresa, na kterou prohlížeč přejde, aby připojil Google Kalendář. */
  readonly calendarConnectUrl: string
  me(): Promise<MeResponse>
  logout(): Promise<void>
  deleteAccount(): Promise<void>

  /** Rozpis přihlášeného (člověk „sám za sebe“). */
  people(): Promise<OwnedPerson[]>
  renamePerson(personId: string, name: string): Promise<OwnedPerson>
  read(personId: string, request: ReadingRequest): Promise<OwnedPerson>
  updateSource(personId: string, sourceId: string, patch: UpdateSourceRequest): Promise<OwnedPerson>
  /** Odpovědi na doptání k podkladu. Podklad se podle nich hned přepočítá. */
  answerSource(personId: string, sourceId: string, answers: SourceAnswer[]): Promise<OwnedPerson>
  /** Návrh změn od AI z věty napsané vlastními slovy. Nic neuloží. */
  clarifySource(personId: string, sourceId: string, message: string): Promise<ClarifyResponse>
  deleteSource(personId: string, sourceId: string): Promise<OwnedPerson>
  setOverride(personId: string, date: string, shifts: Shift[]): Promise<OwnedPerson>
  deleteOverride(personId: string, date: string): Promise<OwnedPerson>

  actions(): Promise<ActionResource[]>
  createAction(details: ActionDetails, inviteUserIds?: string[]): Promise<ActionResource>
  updateAction(actionId: string, details: ActionDetails): Promise<ActionResource>
  deleteAction(actionId: string): Promise<void>
  /** Návrhy a stav dne ostatních, spočítané na serveru. Jen pro akce s cizími lidmi. */
  actionView(actionId: string): Promise<ActionView>
  inviteToAction(actionId: string, userIds: string[]): Promise<ActionResource>
  cancelInvite(actionId: string, userId: string): Promise<ActionResource>
  /** Odpověď pozvaného. Po odmítnutí akci neuvidí, vrátí se null. */
  respondToAction(actionId: string, accept: boolean): Promise<ActionResource | null>
  confirmAction(actionId: string, slot: ConfirmedSlot | null): Promise<ActionResource>

  friends(): Promise<FriendsResponse>
  /** Žádost o přátelství podle e-mailu. */
  sendFriendRequest(email: string): Promise<SendFriendRequestResponse>
  acceptFriendRequest(requestId: string): Promise<FriendsResponse>
  /** Odmítne žádost, kterou jsem dostal, nebo zruší tu, kterou jsem poslal. */
  deleteFriendRequest(requestId: string): Promise<FriendsResponse>
  createFriendInvite(): Promise<{ invite: InviteLink; url: string }>
  revokeFriendInvite(inviteId: string): Promise<void>
  removeFriend(userId: string): Promise<void>

  groups(): Promise<Group[]>
  createGroup(name: string): Promise<Group>
  deleteGroup(groupId: string): Promise<void>
  leaveGroup(groupId: string): Promise<void>
  /** Zakladatel přidá přítele rovnou, bez odkazu. */
  addMember(groupId: string, userId: string): Promise<Group>
  removeMember(groupId: string, userId: string): Promise<Group>
  createInvite(groupId: string): Promise<{ group: Group; url: string }>
  revokeInvite(groupId: string, inviteId: string): Promise<Group>

  /** Odkaz s pozvánkou do skupiny, nebo do přátel. */
  invitePreview(token: string): Promise<InvitePreview>
  acceptInvite(token: string): Promise<AcceptInviteResponse>

  calendarStatus(): Promise<CalendarStatus>
  setCalendarAutoWrite(autoWrite: boolean): Promise<CalendarStatus>
  disconnectCalendar(): Promise<CalendarStatus>
  /** Načte obsazenost z kalendáře hned, ne až po 10 minutách. */
  syncCalendar(): Promise<CalendarStatus>
  /** Zapíše potvrzený termín akce do mého kalendáře, nebo ho odtud odebere. */
  addToCalendar(actionId: string): Promise<ActionResource>
  removeFromCalendar(actionId: string): Promise<ActionResource>

  importActions(actions: Action[]): Promise<number>
}

/** Chyba od serveru. Kód říká, o jakou jde, zpráva je česky pro uživatele. */
export class BackendError extends Error {
  override name = 'BackendError'

  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly notes: string[] = [],
  ) {
    super(message)
  }
}
