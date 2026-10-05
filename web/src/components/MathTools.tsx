import { useEffect, useState } from 'react'
import { CloseIcon } from './Icons'

/** Bluebook's Math tools: the Desmos graphing calculator (opened in its own window) and the reference sheet. */
export function MathTools() {
  const [ref, setRef] = useState(false)
  useEffect(() => {
    if (!ref) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setRef(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ref])
  return (
    <>
      <button
        type="button"
        className="btn text small tool-btn"
        title="Open the Desmos graphing calculator in a new window"
        onClick={() => window.open('https://www.desmos.com/calculator', 'desmos', 'width=520,height=720')}
      >
        Calculator
      </button>
      <button type="button" className="btn text small tool-btn" aria-expanded={ref} onClick={() => setRef((r) => !r)}>
        Reference
      </button>
      {ref && (
        <>
          <div className="mock-scrim" onClick={() => setRef(false)} />
          <div className="refsheet" role="dialog" aria-label="Reference sheet">
            <div className="mock-nav-head">
              <strong>Reference</strong>
              <button className="icon-btn" aria-label="Close" onClick={() => setRef(false)}>
                <CloseIcon size={18} />
              </button>
            </div>
            <ul>
              <li>
                Circle: <i>A</i> = π<i>r</i>², <i>C</i> = 2π<i>r</i>
              </li>
              <li>
                Rectangle: <i>A</i> = ℓ<i>w</i>
              </li>
              <li>
                Triangle: <i>A</i> = ½<i>bh</i>
              </li>
              <li>
                Pythagorean theorem: <i>c</i>² = <i>a</i>² + <i>b</i>²
              </li>
              <li>
                Special right triangles: 30°-60°-90° has sides <i>x</i>, <i>x</i>√3, 2<i>x</i>; 45°-45°-90° has sides <i>s</i>, <i>s</i>, <i>s</i>√2
              </li>
              <li>
                Rectangular prism: <i>V</i> = ℓ<i>wh</i>
              </li>
              <li>
                Cylinder: <i>V</i> = π<i>r</i>²<i>h</i>
              </li>
              <li>
                Sphere: <i>V</i> = <sup>4</sup>⁄<sub>3</sub>π<i>r</i>³
              </li>
              <li>
                Cone: <i>V</i> = <sup>1</sup>⁄<sub>3</sub>π<i>r</i>²<i>h</i>
              </li>
              <li>
                Pyramid: <i>V</i> = <sup>1</sup>⁄<sub>3</sub>ℓ<i>wh</i>
              </li>
            </ul>
            <p>The number of degrees of arc in a circle is 360.</p>
            <p>The number of radians of arc in a circle is 2π.</p>
            <p>The sum of the measures in degrees of the angles of a triangle is 180.</p>
          </div>
        </>
      )}
    </>
  )
}
