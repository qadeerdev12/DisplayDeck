import { execFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { Profile, ProcessRunner, RunResult, Screen } from '../shared/types'

/** A packaged .app inherits no shell PATH, so every candidate is absolute. */
const BINARY_CANDIDATES = [
  '/opt/homebrew/bin/displayplacer',
  '/usr/local/bin/displayplacer',
  '/usr/bin/displayplacer'
]

/**
 * displayplacer exits 0 even when an individual screen fails to move, so the
 * only reliable failure signal is the wording of its stdout.
 */
const FAILURE_MARKERS = ['unable', 'cannot', 'error']

export class BinaryNotFoundError extends Error {
  readonly candidates = BINARY_CANDIDATES
  constructor() {
    super(
      'displayplacer was not found. Install it with: brew install displayplacer'
    )
    this.name = 'BinaryNotFoundError'
  }
}

export class NoActiveScreensError extends Error {
  constructor() {
    super(
      'No displays are currently active — they may be asleep. ' +
        'Wake your displays and try saving again.'
    )
    this.name = 'NoActiveScreensError'
  }
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

export type ExistsCheck = (path: string) => boolean

const defaultExists: ExistsCheck = (path) => {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export const defaultRunner: ProcessRunner = (bin, args) =>
  new Promise<RunResult>((resolve) => {
    execFile(bin, args, { timeout: 30_000 }, (error, stdout, stderr) => {
      const code =
        error && typeof (error as { code?: unknown }).code === 'number'
          ? (error as { code: number }).code
          : error
            ? 1
            : 0
      resolve({ stdout, stderr, code })
    })
  })

export function resolveBinary(exists: ExistsCheck = defaultExists): string {
  const found = BINARY_CANDIDATES.find((candidate) => exists(candidate))
  if (!found) throw new BinaryNotFoundError()
  return found
}

export function isBinaryInstalled(exists: ExistsCheck = defaultExists): boolean {
  return BINARY_CANDIDATES.some((candidate) => exists(candidate))
}

/** Pull the friendly `Type:` label for each persistent screen id. */
function parseScreenNames(stdout: string): Map<string, string> {
  const names = new Map<string, string>()
  let currentId: string | null = null

  for (const line of stdout.split('\n')) {
    const idMatch = /^Persistent screen id:\s*(\S+)/.exec(line)
    if (idMatch?.[1]) {
      currentId = idMatch[1]
      continue
    }
    const typeMatch = /^Type:\s*(.+?)\s*$/.exec(line)
    if (typeMatch?.[1] && currentId) {
      names.set(currentId, typeMatch[1])
      currentId = null
    }
  }
  return names
}

/** Extract the quoted per-screen arguments from the trailing command line. */
export function extractArgs(stdout: string): string[] {
  const lines = stdout.split('\n')
  const commandLine = lines
    .slice()
    .reverse()
    .find((line) => line.trimStart().startsWith('displayplacer "'))

  if (!commandLine) {
    throw new ParseError(
      'No `displayplacer "..."` command line found in the output. ' +
        'The binary may have failed or changed its output format.'
    )
  }

  const args = [...commandLine.matchAll(/"([^"]*)"/g)]
    .map((match) => match[1])
    .filter((arg): arg is string => typeof arg === 'string' && arg.length > 0)

  if (args.length === 0) {
    throw new ParseError('The displayplacer command line contained no arguments.')
  }
  return args
}

function toDegree(value: string | undefined): 0 | 90 | 180 | 270 {
  switch (value) {
    case '90':
      return 90
    case '180':
      return 180
    case '270':
      return 270
    default:
      return 0
  }
}

function parseArg(raw: string, names: Map<string, string>): Screen {
  const fields = new Map<string, string>()
  for (const token of raw.split(' ')) {
    const separator = token.indexOf(':')
    if (separator > 0) {
      fields.set(token.slice(0, separator), token.slice(separator + 1))
    }
  }

  const rawId = fields.get('id')
  if (!rawId) throw new ParseError(`Screen argument has no id: ${raw}`)
  // Mirrored sets are emitted as `id:<primary>+<secondary>`; key off the primary.
  const id = rawId.split('+')[0] ?? rawId

  const resolution = /^(\d+)x(\d+)$/.exec(fields.get('res') ?? '')
  const origin = /^\((-?\d+),(-?\d+)\)$/.exec(fields.get('origin') ?? '')
  const degree = toDegree(fields.get('degree'))
  const rotated = degree === 90 || degree === 270

  // Verified against displayplacer 1.4.0: `res` is already the rotated,
  // on-desktop footprint, so it maps to box*. The framebuffer is that with the
  // axes swapped back. Getting this backwards lays a portrait screen out
  // sideways in the preview.
  const boxWidth = resolution ? Number(resolution[1]) : 0
  const boxHeight = resolution ? Number(resolution[2]) : 0
  const width = rotated ? boxHeight : boxWidth
  const height = rotated ? boxWidth : boxHeight

  const hzField = fields.get('hz')
  const hz = hzField !== undefined && /^\d+$/.test(hzField) ? Number(hzField) : null

  return {
    id,
    name: names.get(id) ?? 'Unknown screen',
    width,
    height,
    boxWidth,
    boxHeight,
    x: origin ? Number(origin[1]) : 0,
    y: origin ? Number(origin[2]) : 0,
    degree,
    hz,
    enabled: fields.get('enabled') !== 'false',
    raw
  }
}

export function parseList(stdout: string): { args: string[]; screens: Screen[] } {
  const names = parseScreenNames(stdout)
  const args = extractArgs(stdout)
  return { args, screens: args.map((arg) => parseArg(arg, names)) }
}

export function computeSignature(screens: Screen[]): string {
  return screens
    .map((screen) => screen.id)
    .sort()
    .join('|')
}

export async function captureProfile(
  name: string,
  runner: ProcessRunner = defaultRunner,
  exists: ExistsCheck = defaultExists
): Promise<Profile> {
  const binary = resolveBinary(exists)
  const { stdout, stderr, code } = await runner(binary, ['list'])
  if (code !== 0) {
    throw new ParseError(
      `displayplacer list exited with code ${code}: ${stderr.trim() || 'no stderr'}`
    )
  }

  const { args, screens } = parseList(stdout)

  // Asleep displays are reported as `enabled:false` with no geometry. Saving
  // that captures a profile which, when applied, switches every screen off.
  if (!screens.some((screen) => screen.enabled)) throw new NoActiveScreensError()

  return {
    id: randomUUID(),
    name,
    args,
    screens,
    signature: computeSignature(screens),
    hotkey: null,
    autoApply: false,
    createdAt: new Date().toISOString()
  }
}

export interface ApplyResult {
  ok: boolean
  error?: string
}

export async function applyProfile(
  profile: Pick<Profile, 'args'>,
  runner: ProcessRunner = defaultRunner,
  exists: ExistsCheck = defaultExists
): Promise<ApplyResult> {
  const binary = resolveBinary(exists)
  const { stdout, stderr, code } = await runner(binary, profile.args)

  const combined = `${stdout}\n${stderr}`.toLowerCase()
  const marker = FAILURE_MARKERS.find((word) => combined.includes(word))
  if (marker) {
    const detail = (stdout.trim() || stderr.trim()).split('\n')[0] ?? marker
    return { ok: false, error: detail }
  }
  if (code !== 0) {
    return { ok: false, error: stderr.trim() || `displayplacer exited with code ${code}` }
  }
  return { ok: true }
}
