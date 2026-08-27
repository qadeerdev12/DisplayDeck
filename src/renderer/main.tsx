import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Popover } from './Popover'
import './main.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root container is missing from index.html')

// One bundle serves both windows; the tray popover asks for itself by query.
const isPopover = new URLSearchParams(window.location.search).get('view') === 'popover'

createRoot(container).render(
  <StrictMode>{isPopover ? <Popover /> : <App />}</StrictMode>
)
