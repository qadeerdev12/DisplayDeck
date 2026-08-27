export interface Screen {
  id: string
  name: string
  width: number
  height: number
  boxWidth: number
  boxHeight: number
  x: number
  y: number
  degree: 0 | 90 | 180 | 270
  hz: number | null
  enabled: boolean
  raw: string
}

export interface Profile {
  id: string
  name: string
  args: string[]
  screens: Screen[]
  signature: string
  hotkey: string | null
  autoApply: boolean
  createdAt: string
}

export interface ProfileStore {
  version: 1
  profiles: Profile[]
}

/** Result of shelling out to the displayplacer binary. */
export interface RunResult {
  stdout: string
  stderr: string
  code: number
}

/**
 * Injected so tests never spawn the real binary. Main supplies an execFile
 * wrapper; tests supply canned fixture output.
 */
export type ProcessRunner = (bin: string, args: string[]) => Promise<RunResult>
