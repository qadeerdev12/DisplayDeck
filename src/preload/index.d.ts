import type { DisplayDeckApi } from './index'

declare global {
  interface Window {
    displayDeck: DisplayDeckApi
  }
}

export {}
