import { motion } from 'framer-motion'
import { NAV_TABS } from './Header'

export default function FloatingRail({ activeTab, setActiveTab, alertCount }) {
  return (
    <>
      {/* ── Desktop Left Icon Rail (md+, hidden on xl+ since top bar handles it) */}
      <aside className="
        hidden md:flex xl:hidden
        fixed left-3 top-20 z-40
        flex-col items-center gap-1.5 py-3 px-2
        bg-white dark:bg-navy-900
        rounded-2xl border border-slate-200/80 dark:border-slate-800
        shadow-card dark:shadow-card-dark
        transition-colors
      ">
        {NAV_TABS.map(tab => {
          const Icon     = tab.icon
          const isActive = activeTab === tab.id
          const hasAlert = tab.id === 'alerts' && alertCount > 0

          return (
            <div key={tab.id} className="relative group">
              <button
                onClick={() => setActiveTab(tab.id)}
                className={`
                  relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200
                  ${isActive
                    ? 'bg-cobalt-600 text-white shadow-cobalt'
                    : 'text-slate-400 dark:text-slate-500 hover:bg-cobalt-50 dark:hover:bg-slate-800 hover:text-cobalt-600 dark:hover:text-cobalt-400'
                  }
                `}
                title={tab.label}
              >
                {isActive && (
                  <motion.div
                    layoutId="railActiveBg"
                    className="absolute inset-0 rounded-xl bg-cobalt-600"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <Icon className="relative z-10 w-4.5 h-4.5" strokeWidth={isActive ? 2.5 : 2} />
                {hasAlert && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center z-20">
                    {alertCount > 9 ? '9+' : alertCount}
                  </span>
                )}
              </button>

              {/* Hover tooltip */}
              <div className="
                absolute left-14 top-1/2 -translate-y-1/2
                hidden group-hover:flex items-center
                bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold
                px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap pointer-events-none z-50
              ">
                {tab.label}
              </div>
            </div>
          )
        })}
      </aside>

      {/* ── Mobile Bottom Nav Bar (< md) ──────────────────────────────── */}
      <nav className="
        md:hidden fixed bottom-0 left-0 right-0 z-50
        bg-white/95 dark:bg-navy-900/95 backdrop-blur-xl
        border-t border-slate-200 dark:border-slate-800
        flex items-center justify-around px-1 py-1
        shadow-[0_-2px_12px_-2px_rgba(15,23,42,0.08)]
      ">
        {NAV_TABS.map(tab => {
          const Icon     = tab.icon
          const isActive = activeTab === tab.id
          const hasAlert = tab.id === 'alerts' && alertCount > 0

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                relative flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors min-w-0
                ${isActive ? 'text-cobalt-600 dark:text-cobalt-400' : 'text-slate-400 dark:text-slate-500'}
              `}
            >
              <div className={`
                w-8 h-8 rounded-xl flex items-center justify-center transition-all
                ${isActive ? 'bg-cobalt-50 dark:bg-cobalt-900/40' : ''}
              `}>
                <Icon className="w-4 h-4" strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className="text-[9px] font-semibold tracking-tight whitespace-nowrap">
                {tab.label.split(' ')[0]}
              </span>
              {hasAlert && (
                <span className="absolute top-0.5 right-1 w-3.5 h-3.5 rounded-full bg-rose-500 text-white text-[8px] font-bold flex items-center justify-center">
                  {alertCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </>
  )
}
