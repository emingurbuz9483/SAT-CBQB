import { useRoute, navigate } from './router'
import { useProgress } from './progress'
import { Home } from './components/Home'
import { Practice } from './components/Practice'
import { Mock } from './components/Mock'
import { Analytics } from './components/Analytics'
import { configFromParams } from './session'
import { ChartIcon, Logo } from './components/Icons'
import { AccountButton } from './components/Account'

export default function App() {
  const route = useRoute()
  const progress = useProgress()
  const practice = route.path === '/practice' ? configFromParams(route.params) : null
  const mockModule = route.path === '/mock' ? ({ '1': 1, '2': 2 } as const)[route.params.get('m') ?? ''] : undefined

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <nav className="topbar-left">
            <a
              className={`nav-link ${route.path === '/analytics' ? 'on' : ''}`}
              href="#/analytics"
              aria-current={route.path === '/analytics' ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault()
                navigate('/analytics')
              }}
            >
              <ChartIcon />
              <span>Analytics</span>
            </a>
          </nav>
          <a
            className="brand"
            href="#/"
            onClick={(e) => {
              e.preventDefault()
              navigate('/')
            }}
          >
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
      {route.path === '/analytics' ? (
        <Analytics progress={progress} />
      ) : mockModule ? (
        <Mock key={mockModule} module={mockModule} fresh={route.params.has('fresh')} progress={progress} />
      ) : practice && practice.skills.length ? (
        <Practice config={practice} progress={progress} />
      ) : (
        <Home progress={progress} />
      )}
    </>
  )
}
