import { useRoute, navigate } from './router'
import { useProgress } from './progress'
import { Home } from './components/Home'
import { Practice } from './components/Practice'
import { configFromParams } from './session'
import { Logo } from './components/Icons'
import { AccountButton } from './components/Account'

export default function App() {
  const route = useRoute()
  const progress = useProgress()
  const practice = route.path === '/practice' ? configFromParams(route.params) : null

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span aria-hidden="true" />
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
      {practice && practice.skills.length ? <Practice config={practice} progress={progress} /> : <Home progress={progress} />}
    </>
  )
}
