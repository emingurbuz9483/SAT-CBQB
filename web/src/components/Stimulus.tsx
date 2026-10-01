import type { Block } from '../types'
import { figureUrl } from '../data'

// All html strings come from our own extraction of the CBQB PDF and only contain
// <em> <strong> <u> <sub> <sup>, so rendering them directly is safe.
export const Html = ({ html, as: Tag = 'span', className }: { html: string; as?: 'span' | 'p' | 'div' | 'li' | 'figcaption'; className?: string }) => (
  <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />
)

function BlockView({ b }: { b: Block }) {
  switch (b.type) {
    case 'p':
      return <Html as="p" html={b.html} />
    case 'label':
      return <Html as="p" className="stim-label" html={b.html} />
    case 'list':
      return (
        <ul className="stim-list">
          {b.items.map((h, i) => (
            <Html key={i} as="li" html={h} />
          ))}
        </ul>
      )
    case 'quote':
      if (b.lines)
        return (
          <div className="stim-quote verse">
            {b.lines.map((l, i) => (
              <div key={i} style={{ paddingLeft: `${l.indent ?? 0}em` }} dangerouslySetInnerHTML={{ __html: l.html }} />
            ))}
          </div>
        )
      return (
        <div className="stim-quote" style={{ paddingLeft: b.indent ? `${b.indent}em` : undefined }}>
          <Html as="p" html={b.html ?? ''} />
        </div>
      )
    case 'table':
      return (
        <figure className="stim-table">
          {b.caption && <Html as="figcaption" html={b.caption} />}
          <div className="table-scroll">
            <table>
              <tbody>
                {b.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((c, j) => {
                      const Tag = c.header ? 'th' : 'td'
                      return (
                        <Tag
                          key={j}
                          colSpan={c.colspan}
                          rowSpan={c.rowspan}
                          style={{ textAlign: c.align ?? 'left' }}
                          dangerouslySetInnerHTML={{ __html: c.html }}
                        />
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </figure>
      )
    case 'figure':
      return (
        <figure className="stim-figure">
          <img src={figureUrl(b.src)} alt={b.alt} width={Math.round(b.width * 1.25)} style={{ aspectRatio: `${b.width} / ${b.height}` }} />
        </figure>
      )
  }
}

export function Stimulus({ blocks }: { blocks: Block[] }) {
  return (
    <div className="stimulus">
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} />
      ))}
    </div>
  )
}
