import { useEffect, useRef, useState } from 'react'
import { SettingsModal } from './components/SettingsModal'
import { Shell } from './components/Shell'
import type { View } from './lib/types'
import { ConsolePage } from './pages/Console'
import { HomePage } from './pages/Home'
import { LearnPage } from './pages/Learn'
import { NotesPage } from './pages/Notes'
import { PortalPage } from './pages/Portal'
import { IntelPage } from './pages/Intel'
import { TracesPage } from './pages/Traces'

const views: View[] = ['home', 'console', 'notes', 'learn', 'portal', 'intel', 'traces']
const PAGE_OUT_MS = 400

function viewFromHash(): View {
  const value = window.location.hash.replace('#', '') as View
  return views.includes(value) ? value : 'home'
}

function prefersReduce() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function App() {
  const [view, setView] = useState<View>(viewFromHash)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fromHome, setFromHome] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [returnFrom, setReturnFrom] = useState<View | null>(null)
  const skipHash = useRef(false)
  const viewRef = useRef(view)
  const leavingRef = useRef(false)
  const leaveTimer = useRef(0)

  viewRef.current = view

  useEffect(() => {
    const onHash = () => {
      if (skipHash.current) {
        skipHash.current = false
        return
      }
      const next = viewFromHash()
      const current = viewRef.current
      if (next === 'home' && current !== 'home') {
        goHome(current)
        return
      }
      leavingRef.current = false
      setFromHome(false)
      setLeaving(false)
      setReturnFrom(null)
      setView(next)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => () => window.clearTimeout(leaveTimer.current), [])

  function writeHash(next: View) {
    const path = `${window.location.pathname}${window.location.search}`
    if (next === 'home') {
      if (window.location.hash) {
        window.history.replaceState(null, '', path)
      }
      return
    }
    skipHash.current = true
    window.location.hash = next
  }

  function finishHome(from: View) {
    leavingRef.current = false
    writeHash('home')
    setLeaving(false)
    setFromHome(false)
    setReturnFrom(from)
    setView('home')
  }

  function goHome(from: View) {
    if (leavingRef.current) return
    if (prefersReduce()) {
      finishHome(from)
      return
    }
    leavingRef.current = true
    setLeaving(true)
    leaveTimer.current = window.setTimeout(() => finishHome(from), PAGE_OUT_MS)
  }

  function go(next: View) {
    if (leavingRef.current) return
    const current = viewRef.current
    if (next === 'home' && current !== 'home') {
      goHome(current)
      return
    }
    writeHash(next)
    setFromHome(current === 'home' && next !== 'home')
    setLeaving(false)
    setReturnFrom(null)
    setView(next)
  }

  return (
    <>
      {view === 'home' ? (
        <HomePage returnFrom={returnFrom} onView={go} onSettings={() => setSettingsOpen(true)} />
      ) : (
        <Shell
          view={view}
          fromHome={fromHome}
          leaving={leaving}
          onView={go}
        >
          {view === 'console' && <ConsolePage />}
          {view === 'notes' && <NotesPage />}
          {view === 'learn' && <LearnPage />}
          {view === 'portal' && <PortalPage />}
          {view === 'intel' && <IntelPage />}
          {view === 'traces' && <TracesPage />}
        </Shell>
      )}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
