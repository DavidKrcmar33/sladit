import { describe, expect, it, vi } from 'vitest'
import { actionDraftContext, draftAction, toDraft } from './actionDraft'

const today = '2026-11-20'

function output(overrides: Record<string, unknown> = {}) {
  return {
    understood: true,
    name: 'Pivo',
    from: '2026-11-23',
    to: '2026-11-29',
    durationMinutes: 180,
    windowStart: '17:00',
    windowEnd: '23:00',
    reply: 'Pivo příští týden večer na 3 hodiny.',
    ...overrides,
  }
}

describe('akce z jedné věty', () => {
  it('gives the model a calendar, so it does not count dates itself', () => {
    const context = actionDraftContext({ text: 'pivo příští pátek', today })
    expect(context).toContain('Dnes je pátek 2026-11-20.')
    expect(context).toContain('2026-11-27 pátek')
    expect(context).toContain('"""pivo příští pátek"""')
  })

  it('turns the answer into action details', () => {
    expect(toDraft(output(), today)).toEqual({
      details: {
        name: 'Pivo',
        from: '2026-11-23',
        to: '2026-11-29',
        durationMinutes: 180,
        windowStart: '17:00',
        windowEnd: '23:00',
      },
      reply: 'Pivo příští týden večer na 3 hodiny.',
    })
  })

  it('rounds to half hours and moves a past period to today', () => {
    const draft = toDraft(
      output({
        from: '2026-11-18',
        durationMinutes: 100,
        windowStart: '17:10',
        windowEnd: '24:00',
      }),
      today,
    )
    expect(draft.details).toMatchObject({
      from: today,
      durationMinutes: 90,
      windowStart: '17:00',
      windowEnd: '23:30',
    })
  })

  it('falls back to the next week when the dates are not dates', () => {
    const draft = toDraft(output({ from: 'pátek', to: '' }), today)
    expect(draft.details).toMatchObject({ from: today, to: '2026-11-26' })
    expect(draft.reply).toContain('příštích 7 dní')
  })

  it('refuses what the form would refuse, and sentences that are not an action', () => {
    expect(toDraft(output({ windowStart: '22:00', windowEnd: '23:00' }), today).details).toBeNull()
    const nonsense = toDraft(
      output({ understood: false, reply: 'Chybí, o jakou akci jde.' }),
      today,
    )
    expect(nonsense).toEqual({ details: null, reply: 'Chybí, o jakou akci jde.' })
  })

  it('asks once more after an invalid answer', async () => {
    const generateJson = vi.fn().mockResolvedValueOnce({ name: 1 }).mockResolvedValueOnce(output())
    const draft = await draftAction({ text: 'pivo', today }, { generateJson })
    expect(draft.details?.name).toBe('Pivo')
    expect(generateJson).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(generateJson.mock.calls[1][0].parts)).toContain('neplatná')
  })
})
