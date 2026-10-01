import { useRoute, navigate } from './router'
import { useProgress } from './progress'
import { Home } from './components/Home'
import { Practice } from './components/Practice'
import { configFromParams } from './session'
import { Logo } from './components/Icons'

export default function App() {
  const route = useRoute()
  const progress = useProgress()
  const practice = route.path === '/practice' ? configFromParams(route.params) : null

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
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
        </div>
      </header>
      {practice && practice.skills.length ? <Practice config={practice} progress={progress} /> : <Home progress={progress} />}
    </>
  )
}
