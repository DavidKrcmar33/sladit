import type {
  ActionResource,
  MeResponse,
  OwnedPerson,
  ReadingRequest,
  UpdateSourceRequest,
} from '@/contract/api'
import type { Action, ActionDetails, Shift } from '@/core/schema'

/**
 * Co aplikace v prohlížeči potřebuje od serveru. Skutečný server je v http.ts, varianta v paměti
 * (memory.ts) slouží testům a ukázce bez přihlášení.
 */
export interface Backend {
  /** Adresa, na kterou prohlížeč přejde, aby se přihlásil přes Google. */
  readonly loginUrl: string
  me(): Promise<MeResponse>
  logout(): Promise<void>
  deleteAccount(): Promise<void>

  people(): Promise<OwnedPerson[]>
  renamePerson(personId: string, name: string): Promise<OwnedPerson>
  read(personId: string, request: ReadingRequest): Promise<OwnedPerson>
  updateSource(personId: string, sourceId: string, patch: UpdateSourceRequest): Promise<OwnedPerson>
  deleteSource(personId: string, sourceId: string): Promise<OwnedPerson>
  setOverride(personId: string, date: string, shifts: Shift[]): Promise<OwnedPerson>
  deleteOverride(personId: string, date: string): Promise<OwnedPerson>

  actions(): Promise<ActionResource[]>
  createAction(details: ActionDetails): Promise<ActionResource>
  updateAction(actionId: string, details: ActionDetails): Promise<ActionResource>
  deleteAction(actionId: string): Promise<void>
  addGuest(actionId: string, name: string): Promise<{ person: OwnedPerson; action: ActionResource }>
  removeParticipant(actionId: string, personId: string): Promise<ActionResource>

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
