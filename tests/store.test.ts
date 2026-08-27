import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { ProfileNotFoundError, ProfileStore, StoreReadError } from '../src/main/store'
import type { Profile } from '../src/shared/types'

let dir: string
let store: ProfileStore

const makeProfile = (name: string, overrides: Partial<Profile> = {}): Profile => ({
  id: `id-${name}`,
  name,
  args: [`id:${name} res:2560x1440`],
  screens: [],
  signature: `sig-${name}`,
  hotkey: null,
  autoApply: false,
  createdAt: '2026-08-27T00:00:00.000Z',
  ...overrides
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'displaydeck-'))
  store = new ProfileStore(dir)
})

describe('reading', () => {
  it('starts empty when the file does not exist', () => {
    expect(store.list()).toEqual([])
    expect(existsSync(store.path)).toBe(false)
  })

  it('throws a named error on malformed JSON rather than silently resetting', () => {
    writeFileSync(store.path, '{ not json', 'utf8')
    expect(() => new ProfileStore(dir).list()).toThrow(StoreReadError)
  })

  it('drops entries that are not shaped like profiles', () => {
    writeFileSync(
      store.path,
      JSON.stringify({ version: 1, profiles: [makeProfile('good'), { junk: true }] }),
      'utf8'
    )
    expect(new ProfileStore(dir).list().map((p) => p.name)).toEqual(['good'])
  })
})

describe('persistence across restart', () => {
  it('survives a fresh store instance reading the same path', () => {
    store.create(makeProfile('Desk'))
    store.create(makeProfile('Portrait side'))

    // A new instance shares no in-memory state — this is the restart case.
    const reopened = new ProfileStore(dir)
    expect(reopened.list().map((p) => p.name)).toEqual(['Desk', 'Portrait side'])
  })

  it('writes version 1 and pretty JSON', () => {
    store.create(makeProfile('Desk'))
    const parsed: unknown = JSON.parse(readFileSync(store.path, 'utf8'))
    expect(parsed).toMatchObject({ version: 1 })
  })

  it('leaves no temp files behind', () => {
    store.create(makeProfile('Desk'))
    store.rename('id-Desk', 'Renamed')
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([])
    expect(readdirSync(dir)).toEqual(['profiles.json'])
  })
})

describe('mutations', () => {
  beforeEach(() => {
    store.create(makeProfile('One'))
    store.create(makeProfile('Two'))
    store.create(makeProfile('Three'))
  })

  it('renames and trims', () => {
    expect(store.rename('id-One', '  Desk  ').name).toBe('Desk')
    expect(new ProfileStore(dir).find('id-One')?.name).toBe('Desk')
  })

  it('rejects an empty rename', () => {
    expect(() => store.rename('id-One', '   ')).toThrow(/cannot be empty/)
  })

  it('deletes', () => {
    store.delete('id-Two')
    expect(new ProfileStore(dir).list().map((p) => p.name)).toEqual(['One', 'Three'])
  })

  it('throws ProfileNotFoundError for unknown ids', () => {
    expect(() => store.delete('nope')).toThrow(ProfileNotFoundError)
    expect(() => store.rename('nope', 'x')).toThrow(ProfileNotFoundError)
    expect(() => store.setHotkey('nope', null)).toThrow(ProfileNotFoundError)
  })

  it('reorders', () => {
    const result = store.reorder(['id-Three', 'id-One', 'id-Two'])
    expect(result.map((p) => p.name)).toEqual(['Three', 'One', 'Two'])
    expect(new ProfileStore(dir).list().map((p) => p.name)).toEqual(['Three', 'One', 'Two'])
  })

  it('keeps ids missing from a partial reorder', () => {
    expect(store.reorder(['id-Three']).map((p) => p.name)).toEqual(['Three', 'One', 'Two'])
  })

  it('ignores unknown ids in a reorder', () => {
    expect(store.reorder(['ghost', 'id-Two']).map((p) => p.name)).toEqual(['Two', 'One', 'Three'])
  })
})

describe('hotkeys', () => {
  beforeEach(() => {
    store.create(makeProfile('One'))
    store.create(makeProfile('Two'))
  })

  it('assigns a hotkey', () => {
    expect(store.setHotkey('id-One', 'Control+Alt+1').hotkey).toBe('Control+Alt+1')
  })

  it('steals a combo already held by another profile', () => {
    store.setHotkey('id-One', 'Control+Alt+1')
    store.setHotkey('id-Two', 'Control+Alt+1')

    const reopened = new ProfileStore(dir)
    expect(reopened.find('id-One')?.hotkey).toBeNull()
    expect(reopened.find('id-Two')?.hotkey).toBe('Control+Alt+1')
  })

  it('clears a hotkey without disturbing others', () => {
    store.setHotkey('id-One', 'Control+Alt+1')
    store.setHotkey('id-Two', 'Control+Alt+2')
    store.setHotkey('id-One', null)

    expect(store.find('id-One')?.hotkey).toBeNull()
    expect(store.find('id-Two')?.hotkey).toBe('Control+Alt+2')
  })

  it('toggles autoApply', () => {
    expect(store.setAutoApply('id-One', true).autoApply).toBe(true)
    expect(new ProfileStore(dir).find('id-One')?.autoApply).toBe(true)
  })
})
