import { useRoute, navigate } from './router'
import { useProgress } from './progress'
import { Home } from './components/Home'
import { Practice } from './components/Practice'
import { Mock } from './components/Mock'
import { Analytics } from './components/Analytics'
import { configFromParams } from './session'
import { SUBJECTS, subjectPath } from './data'
import type { Subject } from './types'
import { ChartIcon, Logo } from './components/Icons'
import { AccountButton } from './components/Account'

const link = (path: string) => ({
  href: `#${path}`,
  onClick: (e: React.MouseEvent) => {
    e.preventDefault()
    navigate(path)
  },
})

export default function App() {
  const route = useRoute()
  const progress = useProgress()
  // #/math/… is Math; everything else is Reading and Writing
  const subject: Subject = route.path === '/math' || route.path.startsWith('/math/') ? 'math' : 'rw'
  const page = subject === 'math' ? route.path.slice(5) || '/' : route.path
  const practice = page === '/practice' ? configFromParams(subject, route.params) : null
  const mockModule = page === '/mock' ? ({ '1': 1, '2': 2 } as const)[route.params.get('m') ?? ''] : undefined
  const browsing = !mockModule && !(practice && practice.skills.length)

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span aria-hidden="true" />
          <a className="brand" {...link(subjectPath(subject, '/'))}>
            <Logo />
            <span>
              CBQB <b>Practice</b>
            </span>
          </a>
          <div className="topbar-right">
            <AccountButton />
          </div>
        </div>
      </header>
      {browsing && (
        <nav className="subnav" aria-label="Sections">
          <div className="subnav-inner">
            <div className="subject-tabs" role="tablist" aria-label="Subject">
              {(['rw', 'math'] as Subject[]).map((s) => (
                <a key={s} role="tab" aria-selected={s === subject} className={`subject-tab ${s === subject ? 'on' : ''}`} {...link(subjectPath(s, page === '/analytics' ? '/analytics' : '/'))}>
                  {SUBJECTS[s].short}
                </a>
              ))}
            </div>
            <div className="view-tabs">
              <a className={`nav-link ${page !== '/analytics' ? 'on' : ''}`} aria-current={page !== '/analytics' ? 'page' : undefined} {...link(subjectPath(subject, '/'))}>
                Skills
              </a>
              <a className={`nav-link ${page === '/analytics' ? 'on' : ''}`} aria-current={page === '/analytics' ? 'page' : undefined} {...link(subjectPath(subject, '/analytics'))}>
                <ChartIcon />
                <span>Analytics</span>
              </a>
            </div>
          </div>
        </nav>
      )}
      {page === '/analytics' ? (
        <Analytics key={subject} subject={subject} progress={progress} />
      ) : mockModule ? (
        <Mock key={`${subject}-${mockModule}`} subject={subject} module={mockModule} fresh={route.params.has('fresh')} progress={progress} />
      ) : practice && practice.skills.length ? (
        <Practice subject={subject} config={practice} progress={progress} />
      ) : (
        <Home key={subject} subject={subject} progress={progress} />
      )}
    </>
  )
}
