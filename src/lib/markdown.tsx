import { Fragment, type ReactNode } from 'react'

function safeHref(href: string) {
  const value = href.trim()
  if (/^https?:\/\//i.test(value) || value.startsWith('/uploads/')) return value
  return ''
}

function inline(text: string, keyPrefix = 'i'): ReactNode[] {
  const nodes: ReactNode[] = []
  const re =
    /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|<u>([\s\S]+?)<\/u>|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = re.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    if (match[2]) {
      const src = safeHref(match[2])
      nodes.push(src ? <img key={`${keyPrefix}-${key++}`} src={src} alt={match[1]} /> : match[0])
    } else if (match[4]) {
      const href = safeHref(match[4])
      nodes.push(
        href ? (
          <a key={`${keyPrefix}-${key++}`} href={href} target="_blank" rel="noreferrer">
            {match[3]}
          </a>
        ) : (
          match[3]
        ),
      )
    } else if (match[5]) nodes.push(<u key={`${keyPrefix}-${key++}`}>{inline(match[5], `${keyPrefix}-u${key}`)}</u>)
    else if (match[6]) nodes.push(<strong key={`${keyPrefix}-${key++}`}>{match[6]}</strong>)
    else if (match[7]) nodes.push(<em key={`${keyPrefix}-${key++}`}>{match[7]}</em>)
    else if (match[8]) nodes.push(<code key={`${keyPrefix}-${key++}`}>{match[8]}</code>)
    last = match.index + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function isTableSep(line: string) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line)
}

function isTableLine(line: string) {
  const value = line.trim()
  if (!value || value.startsWith('```')) return false
  return value.includes('|')
}

function splitCells(line: string) {
  let value = line.trim()
  if (value.startsWith('|')) value = value.slice(1)
  if (value.endsWith('|')) value = value.slice(0, -1)
  return value.split('|').map((cell) => cell.trim())
}

type ListPart = { text: string; at: number; end: number }

type ListNode = {
  indent: number
  ordered: boolean
  parts: ListPart[]
  breakBefore: number
  children: ListNode[]
}

function mdRange(at: number, end: number) {
  return { 'data-md-at': at, 'data-md-end': end }
}

function matchList(line: string) {
  const match = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/)
  if (!match) return null
  return {
    indent: match[1].replace(/\t/g, '  ').replace(/\u3000/g, '  ').length,
    ordered: /^\d+\./.test(match[2]),
    text: match[3],
  }
}

function collectList(lines: string[], at: number[], start: number) {
  const items: Omit<ListNode, 'children'>[] = []
  let i = start
  let breakBefore = 0
  while (i < lines.length) {
    const row = matchList(lines[i])
    if (row) {
      items.push({
        indent: row.indent,
        ordered: row.ordered,
        parts: [{ text: row.text, at: at[i], end: at[i] + lines[i].length }],
        breakBefore,
      })
      breakBefore = 0
      i += 1
      continue
    }
    if (!lines[i].trim()) {
      let look = i + 1
      let blanks = 1
      while (look < lines.length && !lines[look].trim()) {
        blanks += 1
        look += 1
      }
      if (look < lines.length && matchList(lines[look])) {
        breakBefore += blanks
        i = look
        continue
      }
      break
    }
    const indent = lines[i].replace(/\t/g, '  ').replace(/\u3000/g, '  ').match(/^ */)?.[0].length ?? 0
    const last = items[items.length - 1]
    if (last && indent > last.indent) {
      last.parts.push({ text: lines[i].trim(), at: at[i], end: at[i] + lines[i].length })
      i += 1
      continue
    }
    break
  }
  return { items, next: i }
}

function nestList(items: Omit<ListNode, 'children'>[]): ListNode[] {
  const root: ListNode[] = []
  const stack: ListNode[] = []
  for (const item of items) {
    const node: ListNode = { ...item, children: [] }
    while (stack.length && stack[stack.length - 1].indent >= item.indent) stack.pop()
    if (!stack.length) root.push(node)
    else stack[stack.length - 1].children.push(node)
    stack.push(node)
  }
  return root
}

function renderList(nodes: ListNode[], prefix: string): ReactNode {
  if (!nodes.length) return null
  const groups: ListNode[][] = []
  for (const node of nodes) {
    const last = groups[groups.length - 1]
    if (!last || last[0].ordered !== node.ordered) groups.push([node])
    else last.push(node)
  }
  return groups.map((group, gi) => {
    const Tag = group[0].ordered ? 'ol' : 'ul'
    return (
      <Tag key={`${prefix}-g${gi}`}>
        {group.map((node, index) => (
          <li key={index} style={node.breakBefore ? { marginTop: `${node.breakBefore * 1.6}em` } : undefined}>
            {node.parts.map((part, pi) => (
              <Fragment key={pi}>
                {pi ? <br /> : null}
                <span {...mdRange(part.at, part.end)}>{inline(part.text, `${prefix}-${gi}-${index}-${pi}`)}</span>
              </Fragment>
            ))}
            {node.children.length ? renderList(node.children, `${prefix}-${gi}-${index}-c`) : null}
          </li>
        ))}
      </Tag>
    )
  })
}

const CODE_KEYWORDS = new Set(
  `const let var function return if else for while class import export from async await new try catch throw
def elif lambda pass None True False
public private static void int bool enum interface type extends implements
break continue switch case default yield
null undefined true false
package func struct
SELECT FROM WHERE INSERT UPDATE DELETE JOIN`.split(/\s+/),
)

function highlightCode(source: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let plain = ''
  let key = 0
  const flush = () => {
    if (!plain) return
    nodes.push(plain)
    plain = ''
  }
  const emit = (text: string, kind: string) => {
    flush()
    nodes.push(
      <span key={key++} className={`md-c-${kind}`}>
        {text}
      </span>,
    )
  }
  let i = 0
  while (i < source.length) {
    const rest = source.slice(i)
    if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/')
      const size = end < 0 ? rest.length : end + 2
      emit(rest.slice(0, size), 'comment')
      i += size
      continue
    }
    if (rest.startsWith('//')) {
      const end = rest.indexOf('\n')
      const size = end < 0 ? rest.length : end
      emit(rest.slice(0, size), 'comment')
      i += size
      continue
    }
    if (rest[0] === '#') {
      const atLine = i === 0 || source[i - 1] === '\n' || /\s/.test(source[i - 1])
      const hex = /^#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/.test(rest)
      if (atLine && !hex) {
        const end = rest.indexOf('\n')
        const size = end < 0 ? rest.length : end
        emit(rest.slice(0, size), 'comment')
        i += size
        continue
      }
    }
    if (rest[0] === '"' || rest[0] === "'" || rest[0] === '`') {
      const quote = rest[0]
      let j = 1
      while (j < rest.length) {
        if (rest[j] === '\\') {
          j += 2
          continue
        }
        if (rest[j] === '\n' && quote !== '`') break
        if (rest[j] === quote) {
          j += 1
          break
        }
        j += 1
      }
      if (rest[j - 1] === quote) {
        emit(rest.slice(0, j), 'string')
        i += j
        continue
      }
    }
    const word = rest.match(/^[A-Za-z_]\w*/)
    if (word) {
      if (CODE_KEYWORDS.has(word[0])) emit(word[0], 'keyword')
      else plain += word[0]
      i += word[0].length
      continue
    }
    const num = rest.match(/^\d[\d_]*(?:\.\d+)?/)
    if (num) {
      emit(num[0], 'number')
      i += num[0].length
      continue
    }
    plain += rest[0]
    i += 1
  }
  flush()
  return nodes
}

function lineSpans(source: string) {
  const raw = source.split('\n')
  const lines: string[] = []
  const at: number[] = []
  let cursor = 0
  for (const row of raw) {
    at.push(cursor)
    lines.push(row.endsWith('\r') ? row.slice(0, -1) : row)
    cursor += row.length + 1
  }
  return { lines, at }
}

function cellRanges(line: string, lineAt: number) {
  const cells = splitCells(line)
  let search = 0
  return cells.map((cell) => {
    const found = cell ? line.indexOf(cell, search) : search
    const start = found < 0 ? search : found
    const end = start + cell.length
    search = Math.max(search, end)
    return { cell, at: lineAt + start, end: lineAt + end }
  })
}

function parseBlocks(source: string): ReactNode[] {
  const { lines, at } = lineSpans(source)
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]
    const fence = line.match(/^```(\w*)$/)
    if (fence) {
      const lang = fence[1]
      const open = i
      const body: number[] = []
      i += 1
      while (i < lines.length && !lines[i].startsWith('```')) {
        body.push(i)
        i += 1
      }
      if (i < lines.length) i += 1
      blocks.push(
        <pre key={key++} {...mdRange(at[open], at[open] + lines[open].length)}>
          <code className={lang ? `lang-${lang}` : undefined}>
            {body.map((lineNo) => (
              <span key={lineNo} className="md-code-line" {...mdRange(at[lineNo], at[lineNo] + lines[lineNo].length)}>
                {lines[lineNo] ? highlightCode(lines[lineNo]) : '\u200b'}
              </span>
            ))}
          </code>
        </pre>,
      )
      continue
    }
    if (/^(\*\s*\*\s*\*|-{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={key++} {...mdRange(at[i], at[i] + line.length)} />)
      i += 1
      continue
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      const text = inline(heading[2].trim(), `h${key}`)
      const level = heading[1].length
      const range = mdRange(at[i], at[i] + line.length)
      if (level === 1) blocks.push(<h1 key={key++} {...range}>{text}</h1>)
      else if (level === 2) blocks.push(<h2 key={key++} {...range}>{text}</h2>)
      else if (level === 3) blocks.push(<h3 key={key++} {...range}>{text}</h3>)
      else blocks.push(<h4 key={key++} {...range}>{text}</h4>)
      i += 1
      continue
    }
    if (isTableLine(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const rows: { cells: { cell: string; at: number; end: number }[] }[] = []
      while (i < lines.length && isTableLine(lines[i])) {
        if (!isTableSep(lines[i])) rows.push({ cells: cellRanges(lines[i], at[i]) })
        i += 1
      }
      if (rows.length) {
        const head = rows[0].cells
        const body = rows.slice(1)
        const tableKey = key++
        blocks.push(
          <div key={tableKey} className="md-table-wrap">
            <table>
              <thead>
                <tr>
                  {head.map((cell, ci) => (
                    <th key={ci} {...mdRange(cell.at, cell.end)}>
                      {inline(cell.cell, `th-${tableKey}-${ci}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              {body.length ? (
                <tbody>
                  {body.map((row, ri) => (
                    <tr key={ri}>
                      {row.cells.map((cell, ci) => (
                        <td key={ci} {...mdRange(cell.at, cell.end)}>
                          {inline(cell.cell, `td-${tableKey}-${ri}-${ci}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ) : null}
            </table>
          </div>,
        )
      }
      continue
    }
    if (/^>\s?/.test(line)) {
      const quote: { text: string; at: number; end: number }[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push({ text: lines[i].replace(/^>\s?/, ''), at: at[i], end: at[i] + lines[i].length })
        i += 1
      }
      const quoteKey = key++
      blocks.push(
        <blockquote key={quoteKey}>
          {quote.map((part, pi) => (
            <Fragment key={pi}>
              {pi ? <br /> : null}
              <span {...mdRange(part.at, part.end)}>{inline(part.text, `q${quoteKey}-${pi}`)}</span>
            </Fragment>
          ))}
        </blockquote>,
      )
      continue
    }
    if (matchList(line)) {
      const collected = collectList(lines, at, i)
      i = collected.next
      const tree = nestList(collected.items)
      blocks.push(<Fragment key={key++}>{renderList(tree, `l${key}`)}</Fragment>)
      continue
    }
    if (!line.trim()) {
      i += 1
      continue
    }
    const para: { text: string; at: number; end: number }[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|```|>\s?|\s*[-*+]\s|\s*\d+\.\s|(\*\s*\*\s*\*|-{3,}|_{3,})\s*$)/.test(lines[i]) &&
      !(isTableLine(lines[i]) && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) {
      para.push({ text: lines[i], at: at[i], end: at[i] + lines[i].length })
      i += 1
    }
    const paraKey = key++
    blocks.push(
      <p key={paraKey}>
        {para.map((part, pi) => (
          <Fragment key={pi}>
            {pi ? <br /> : null}
            <span {...mdRange(part.at, part.end)}>{inline(part.text, `p${paraKey}-${pi}`)}</span>
          </Fragment>
        ))}
      </p>,
    )
  }
  return blocks
}

export function MarkdownView({ text }: { text: string }) {
  if (!text.trim()) return <p className="md-empty">點編輯，用 Markdown 寫筆記。</p>
  return <div className="md-view">{parseBlocks(text)}</div>
}
