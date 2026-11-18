import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, Radio, FlaskConical, Layers, Wrench, Cpu, Bell as BellIcon,
  Search, Sun, Moon, Menu, X, Wifi, WifiOff,
} from 'lucide-react'

// ─── Canonical tab list shared with FloatingRail ──────────────────────────────
export const NAV_TABS = [
  { id: 'overview',     label: 'Overview',         icon: Activity      },
  { id: 'diagnostics',  label: 'Live Diagnostics',  icon: Radio         },
  { id: 'simulator',    label: 'What-If Simulator', icon: FlaskConical  },
  { id: 'fleet',        label: 'Fleet Directory',   icon: Layers        },
  { id: 'maintenance',  label: 'Maintenance',        icon: Wrench        },
  { id: 'benchmarks',  label: 'AI Benchmarks',     icon: Cpu           },
  { id: 'alerts',      label: 'Alert Logs',         icon: BellIcon      },
]

export default function Header({
  activeTab,
  setActiveTab,
  theme,
  toggleTheme,
  alertCount,
  serverOnline,
  mobileMenuOpen,
  setMobileMenuOpen,
}) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchVal,  setSearchVal]  = useState('')

  return (
    <header className="
      fixed top-0 left-0 right-0 z-50 h-16
      bg-white/90 dark:bg-navy-900/90
      backdrop-blur-xl
      border-b border-slate-200/70 dark:border-slate-800/80
      shadow-[0_1px_6px_-1px_rgba(15,23,42,0.06)]
    ">
      <div className="max-w-8xl mx-auto h-full px-4 sm:px-6 flex items-center gap-3">

        {/* ── Brand ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 shrink-0 select-none">
          <div className="w-8 h-8 rounded-xl bg-cobalt-600 flex items-center justify-center shadow-cobalt">
            <Activity className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="hidden sm:block font-extrabold text-[15px] tracking-tight text-slate-900 dark:text-white">
            Sentinel<span className="text-cobalt-600">-X</span>
          </span>
        </div>

        {/* ── Top Tab Bar (xl+, scrollable so 7 tabs never wrap) ─────── */}
        <nav className="hidden xl:flex items-center gap-0.5 ml-3 p-1 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/50 overflow-x-auto scrollbar-none">
          {NAV_TABS.map(tab => {
            const Icon     = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold
                  transition-colors duration-150 whitespace-nowrap shrink-0
                  ${isActive
                    ? 'text-cobalt-600 dark:text-cobalt-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }
                `}
              >
                {isActive && (
                  <motion.div
                    layoutId="headerActivePill"
                    className="absolute inset-0 bg-white dark:bg-slate-900 rounded-lg shadow-sm"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <Icon className="relative z-10 w-3.5 h-3.5 shrink-0" />
                <span className="relative z-10">{tab.label}</span>
                {tab.id === 'alerts' && alertCount > 0 && (
                  <span className="relative z-10 ml-0.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {alertCount > 9 ? '9+' : alertCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="flex-1" />

        {/* ── Right Actions ──────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5">

          {/* Search */}
          <AnimatePresence mode="wait">
            {searchOpen ? (
              <motion.div
                key="open"
                initial={{ width: 32, opacity: 0 }}
                animate={{ width: 180, opacity: 1 }}
                exit={{ width: 32, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 overflow-hidden"
              >
                <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
                <input
                  autoFocus
                  value={searchVal}
                  onChange={e => setSearchVal(e.target.value)}
                  onBlur={() => { if (!searchVal) setSearchOpen(false) }}
                  placeholder="Search machines…"
                  className="bg-transparent text-xs text-slate-800 dark:text-white outline-none w-full placeholder-slate-400"
                />
                {searchVal && (
                  <button onClick={() => { setSearchVal(''); setSearchOpen(false) }}>
                    <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
                  </button>
                )}
              </motion.div>
            ) : (
              <motion.button
                key="closed"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                onClick={() => setSearchOpen(true)}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Search className="w-4 h-4" />
              </motion.button>
            )}
          </AnimatePresence>

          {/* Alert Bell */}
          <button
            onClick={() => setActiveTab('alerts')}
            className="relative p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <BellIcon className="w-4 h-4" />
            {alertCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            {theme === 'light'
              ? <Moon className="w-4 h-4" />
              : <Sun  className="w-4 h-4 text-amber-400" />
            }
          </button>

          {/* Plant status badge (replaces personal avatar) */}
          <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              {serverOnline
                ? <Wifi    className="w-3 h-3 text-emerald-500 shrink-0" />
                : <WifiOff className="w-3 h-3 text-amber-400 shrink-0" />
              }
              <div className="leading-none">
                <div className="text-[11px] font-bold text-slate-800 dark:text-white whitespace-nowrap">
                  PLANT-01
                </div>
                <div className={`text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap ${
                  serverOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500 dark:text-amber-400'
                }`}>
                  {serverOnline ? 'Digital Twin Live' : 'Simulated'}
                </div>
              </div>
            </div>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(o => !o)}
            className="xl:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400 transition-colors"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* ── Mobile dropdown menu ───────────────────────────────────────── */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="xl:hidden overflow-hidden bg-white dark:bg-navy-900 border-b border-slate-200 dark:border-slate-800 px-4 pb-3"
          >
            <div className="pt-2 grid grid-cols-2 gap-1">
              {NAV_TABS.map(tab => {
                const Icon     = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors text-left
                      ${isActive
                        ? 'bg-cobalt-600 text-white'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-xs">{tab.label}</span>
                    {tab.id === 'alerts' && alertCount > 0 && (
                      <span className="ml-auto w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                        {alertCount}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
