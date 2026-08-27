import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Profile, StoreFile } from '../shared/types'

const CURRENT_VERSION = 1 as const

export class ProfileNotFoundError extends Error {
  constructor(id: string) {
    super(`No profile with id ${id}`)
    this.name = 'ProfileNotFoundError'
  }
}

export class StoreReadError extends Error {
  constructor(path: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    super(`Could not read ${path}: ${detail}`)
    this.name = 'StoreReadError'
  }
}

function isProfile(value: unknown): value is Profile {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.args) &&
    Array.isArray(candidate.screens) &&
    typeof candidate.signature === 'string'
  )
}

/**
 * Profiles live in a single JSON file. Every write goes to a sibling temp file
 * and is renamed over the target, so a crash mid-write leaves the previous
 * version intact rather than a truncated file.
 */
export class ProfileStore {
  private readonly filePath: string
  private cache: StoreFile | null = null

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'profiles.json')
  }

  get path(): string {
    return this.filePath
  }

  private read(): StoreFile {
    if (this.cache) return this.cache

    let raw: string
    try {
      raw = readFileSync(this.filePath, 'utf8')
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
        this.cache = { version: CURRENT_VERSION, profiles: [] }
        return this.cache
      }
      throw new StoreReadError(this.filePath, cause)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (cause) {
      throw new StoreReadError(this.filePath, cause)
    }

    const profiles =
      typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as StoreFile).profiles)
        ? (parsed as StoreFile).profiles.filter(isProfile)
        : []

    this.cache = { version: CURRENT_VERSION, profiles }
    return this.cache
  }

  private write(profiles: Profile[]): void {
    const data: StoreFile = { version: CURRENT_VERSION, profiles }
    const serialised = `${JSON.stringify(data, null, 2)}\n`
    const temp = `${this.filePath}.${process.pid}.tmp`

    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(temp, serialised, 'utf8')
    renameSync(temp, this.filePath)

    this.cache = data
  }

  list(): Profile[] {
    return [...this.read().profiles]
  }

  find(id: string): Profile | undefined {
    return this.read().profiles.find((profile) => profile.id === id)
  }

  private require(id: string): Profile {
    const profile = this.find(id)
    if (!profile) throw new ProfileNotFoundError(id)
    return profile
  }

  create(profile: Profile): Profile {
    this.write([...this.read().profiles, profile])
    return profile
  }

  private update(id: string, change: (profile: Profile) => Profile): Profile {
    this.require(id)
    const next = this.read().profiles.map((profile) =>
      profile.id === id ? change(profile) : profile
    )
    this.write(next)
    return this.require(id)
  }

  rename(id: string, name: string): Profile {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('A profile name cannot be empty.')
    return this.update(id, (profile) => ({ ...profile, name: trimmed }))
  }

  setHotkey(id: string, hotkey: string | null): Profile {
    // A combo may only belong to one profile, so clear it from any other first.
    this.require(id)
    const next = this.read().profiles.map((profile) => {
      if (profile.id === id) return { ...profile, hotkey }
      if (hotkey !== null && profile.hotkey === hotkey) return { ...profile, hotkey: null }
      return profile
    })
    this.write(next)
    return this.require(id)
  }

  setAutoApply(id: string, autoApply: boolean): Profile {
    return this.update(id, (profile) => ({ ...profile, autoApply }))
  }

  delete(id: string): void {
    this.require(id)
    this.write(this.read().profiles.filter((profile) => profile.id !== id))
  }

  /** Ids not present in the given order keep their relative position at the end. */
  reorder(orderedIds: string[]): Profile[] {
    const current = this.read().profiles
    const byId = new Map(current.map((profile) => [profile.id, profile]))

    const ordered: Profile[] = []
    for (const id of orderedIds) {
      const profile = byId.get(id)
      if (profile) {
        ordered.push(profile)
        byId.delete(id)
      }
    }
    for (const profile of current) {
      if (byId.has(profile.id)) ordered.push(profile)
    }

    this.write(ordered)
    return ordered
  }
}
