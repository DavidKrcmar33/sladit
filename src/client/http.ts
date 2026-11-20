import { z } from 'zod'
import {
  AcceptInviteResponseSchema,
  CalendarResponseSchema,
  ActionResourceSchema,
  ActionResponseSchema,
  ActionsResponseSchema,
  ActionViewResponseSchema,
  CreateFriendInviteResponseSchema,
  CreateInviteResponseSchema,
  ErrorResponseSchema,
  FriendsResponseSchema,
  GroupResponseSchema,
  GroupsResponseSchema,
  ImportResponseSchema,
  InvitePreviewResponseSchema,
  MeResponseSchema,
  PeopleResponseSchema,
  PersonResponseSchema,
} from '@/contract/api'
import { BackendError, type Backend } from './backend'

const OkResponseSchema = z.object({ ok: z.literal(true) })
const MaybeActionResponseSchema = z.object({ action: ActionResourceSchema.nullable() })

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
  const group = (method: string, path: string, body?: unknown) =>
    call(GroupResponseSchema, method, path, body).then((data) => data.group)
  // Token pozvánky jde jen do cesty na vlastní server, nikam jinam.
  const invite = (token: string) => `/invites/${encodeURIComponent(token)}`

  const calendar = (method: string, path: string, body?: unknown) =>
    call(CalendarResponseSchema, method, path, body).then((data) => data.calendar)

  return {
    loginUrl: '/api/auth/google',
    calendarConnectUrl: '/api/calendar/connect',
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
    createAction: (details, inviteUserIds = []) =>
      action('POST', '/actions', { details, inviteUserIds }),
    updateAction: (actionId, details) => action('PATCH', `/actions/${actionId}`, { details }),
    deleteAction: (actionId) => ok('DELETE', `/actions/${actionId}`),
    actionView: (actionId) =>
      call(ActionViewResponseSchema, 'GET', `/actions/${actionId}/view`).then((data) => data.view),
    inviteToAction: (actionId, userIds) =>
      action('POST', `/actions/${actionId}/invites`, { userIds }),
    cancelInvite: (actionId, userId) => action('DELETE', `/actions/${actionId}/invites/${userId}`),
    respondToAction: (actionId, accept) =>
      call(MaybeActionResponseSchema, 'POST', `/actions/${actionId}/response`, { accept }).then(
        (data) => data.action,
      ),
    confirmAction: (actionId, slot) =>
      slot
        ? action('PUT', `/actions/${actionId}/confirmed`, slot)
        : action('DELETE', `/actions/${actionId}/confirmed`),

    friends: () => call(FriendsResponseSchema, 'GET', '/friends'),
    createFriendInvite: () => call(CreateFriendInviteResponseSchema, 'POST', '/friends/invites'),
    revokeFriendInvite: (inviteId) => ok('DELETE', `/friends/invites/${inviteId}`),
    removeFriend: (userId) => ok('DELETE', `/friends/${userId}`),

    groups: () => call(GroupsResponseSchema, 'GET', '/groups').then((data) => data.groups),
    createGroup: (name) => group('POST', '/groups', { name }),
    deleteGroup: (groupId) => ok('DELETE', `/groups/${groupId}`),
    leaveGroup: (groupId) => ok('POST', `/groups/${groupId}/leave`),
    removeMember: (groupId, userId) => group('DELETE', `/groups/${groupId}/members/${userId}`),
    createInvite: (groupId) =>
      call(CreateInviteResponseSchema, 'POST', `/groups/${groupId}/invites`),
    revokeInvite: (groupId, inviteId) => group('DELETE', `/groups/${groupId}/invites/${inviteId}`),

    invitePreview: (token) =>
      call(InvitePreviewResponseSchema, 'GET', invite(token)).then((data) => data.invite),
    acceptInvite: (token) => call(AcceptInviteResponseSchema, 'POST', `${invite(token)}/accept`),

    calendarStatus: () => calendar('GET', '/calendar'),
    setCalendarAutoWrite: (autoWrite) => calendar('PATCH', '/calendar', { autoWrite }),
    disconnectCalendar: () => calendar('DELETE', '/calendar'),
    syncCalendar: () => calendar('POST', '/calendar/sync'),
    addToCalendar: (actionId) => action('POST', `/actions/${actionId}/calendar`),
    removeFromCalendar: (actionId) => action('DELETE', `/actions/${actionId}/calendar`),

    importActions: (actions) =>
      call(ImportResponseSchema, 'POST', '/import', { actions }).then((data) => data.imported),
  }
}
