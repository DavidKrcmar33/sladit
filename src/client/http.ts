import { z } from 'zod'
import {
  ActionResponseSchema,
  ActionsResponseSchema,
  AddGuestResponseSchema,
  ErrorResponseSchema,
  ImportResponseSchema,
  MeResponseSchema,
  PeopleResponseSchema,
  PersonResponseSchema,
} from '@/contract/api'
import { BackendError, type Backend } from './backend'

const OkResponseSchema = z.object({ ok: z.literal(true) })

/** Server na stejném původu. Cookie relace posílá prohlížeč sám, odpovědi se ověřují schématy. */
export function httpBackend(fetcher: typeof fetch = (...args) => fetch(...args)): Backend {
  async function call<T extends z.ZodType>(
    schema: T,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<z.infer<T>> {
    let response: Response
    try {
      response = await fetcher(`/api${path}`, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new BackendError('Server je nedostupný. Zkontroluj připojení.', 0)
    }
    const data: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const error = ErrorResponseSchema.safeParse(data)
      throw new BackendError(
        error.success ? error.data.error : `Server vrátil ${response.status}.`,
        response.status,
        error.success ? error.data.code : undefined,
        error.success ? (error.data.notes ?? []) : [],
      )
    }
    return schema.parse(data)
  }

  const person = (method: string, path: string, body?: unknown) =>
    call(PersonResponseSchema, method, path, body).then((data) => data.person)
  const action = (method: string, path: string, body?: unknown) =>
    call(ActionResponseSchema, method, path, body).then((data) => data.action)
  const ok = async (method: string, path: string) => {
    await call(OkResponseSchema, method, path)
  }

  return {
    loginUrl: '/api/auth/google',
    me: () => call(MeResponseSchema, 'GET', '/me'),
    logout: () => ok('POST', '/auth/logout'),
    deleteAccount: () => ok('DELETE', '/me'),

    people: () => call(PeopleResponseSchema, 'GET', '/people').then((data) => data.people),
    renamePerson: (personId, name) => person('PATCH', `/people/${personId}`, { name }),
    read: (personId, request) => person('POST', `/people/${personId}/readings`, request),
    updateSource: (personId, sourceId, patch) =>
      person('PATCH', `/people/${personId}/sources/${sourceId}`, patch),
    deleteSource: (personId, sourceId) =>
      person('DELETE', `/people/${personId}/sources/${sourceId}`),
    setOverride: (personId, date, shifts) =>
      person('PUT', `/people/${personId}/overrides/${date}`, { shifts }),
    deleteOverride: (personId, date) => person('DELETE', `/people/${personId}/overrides/${date}`),

    actions: () => call(ActionsResponseSchema, 'GET', '/actions').then((data) => data.actions),
    createAction: (details) => action('POST', '/actions', { details }),
    updateAction: (actionId, details) => action('PATCH', `/actions/${actionId}`, { details }),
    deleteAction: (actionId) => ok('DELETE', `/actions/${actionId}`),
    addGuest: (actionId, name) =>
      call(AddGuestResponseSchema, 'POST', `/actions/${actionId}/guests`, { name }),
    removeParticipant: (actionId, personId) =>
      action('DELETE', `/actions/${actionId}/participants/${personId}`),

    importActions: (actions) =>
      call(ImportResponseSchema, 'POST', '/import', { actions }).then((data) => data.imported),
  }
}
