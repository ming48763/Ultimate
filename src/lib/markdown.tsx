import { Fragment, type ReactNode } from 'react'

function safeHref(href: string) {
  const value = href.trim()
  if (/^https?:\/\//i.test(value) || value.startsWith('/uploads/')) return value
  return ''
}

function inline(text: string, keyPrefix = 'i'): ReactNode[] {
  const nodes: ReactNode[] = []
  const re =
    /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g
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
    } else if (match[5]) nodes.push(<strong key={`${keyPrefix}-${key++}`}>{match[5]}</strong>)
    else if (match[6]) nodes.push(<em key={`${keyPrefix}-${key++}`}>{match[6]}</em>)
    else if (match[7]) nodes.push(<code key={`${keyPrefix}-${key++}`}>{match[7]}</code>)
    last = match.index + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function linesInline(lines: string[], prefix: string) {
  const nodes: ReactNode[] = []
  lines.forEach((line, index) => {
    if (index) nodes.push(<br key={`${prefix}-br-${index}`} />)
    nodes.push(...inline(line, `${prefix}-${index}`))
  })
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

type ListNode = {
  indent: number
  ordered: boolean
  text: string
  children: ListNode[]
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

function collectList(lines: string[], start: number) {
  const items: { indent: number; ordered: boolean; text: string }[] = []
  let i = start
  while (i < lines.length) {
    const row = matchList(lines[i])
    if (row) {
      items.push(row)
      i += 1
      continue
    }
    if (!lines[i].trim()) {
      let look = i + 1
      while (look < lines.length && !lines[look].trim()) look += 1
      if (look < lines.length && matchList(lines[look])) {
        i = look
        continue
      }
      break
    }
    const indent = lines[i].replace(/\t/g, '  ').replace(/\u3000/g, '  ').match(/^ */)?.[0].length ?? 0
    const last = items[items.length - 1]
    if (last && indent > last.indent) {
      last.text += `\n${lines[i].trim()}`
      i += 1
      continue
    }
    break
  }
  return { items, next: i }
}

function nestList(items: { indent: number; ordered: boolean; text: string }[]): ListNode[] {
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
          <li key={index}>
            {linesInline(node.text.split('\n'), `${prefix}-${gi}-${index}`)}
            {node.children.length ? renderList(node.children, `${prefix}-${gi}-${index}-c`) : null}
          </li>
        ))}
      </Tag>
    )
  })
}

function parseBlocks(source: string): ReactNode[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]
    const fence = line.match(/^```(\w*)$/)
    if (fence) {
      const lang = fence[1]
      const body: string[] = []
      i += 1
      while (i < lines.length && !lines[i].startsWith('```')) {
        body.push(lines[i])
        i += 1
      }
      if (i < lines.length) i += 1
      blocks.push(
        <pre key={key++}>
          <code className={lang ? `lang-${lang}` : undefined}>{body.join('\n')}</code>
        </pre>,
      )
      continue
    }
    if (/^(\*\s*\*\s*\*|-{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={key++} />)
      i += 1
      continue
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      const text = inline(heading[2].trim(), `h${key}`)
      const level = heading[1].length
      if (level === 1) blocks.push(<h1 key={key++}>{text}</h1>)
      else if (level === 2) blocks.push(<h2 key={key++}>{text}</h2>)
      else if (level === 3) blocks.push(<h3 key={key++}>{text}</h3>)
      else blocks.push(<h4 key={key++}>{text}</h4>)
      i += 1
      continue
    }
    if (isTableLine(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const rows: string[][] = []
      while (i < lines.length && isTableLine(lines[i])) {
        if (!isTableSep(lines[i])) rows.push(splitCells(lines[i]))
        i += 1
      }
      if (rows.length) {
        const head = rows[0]
        const body = rows.slice(1)
        const tableKey = key++
        blocks.push(
          <div key={tableKey} className="md-table-wrap">
            <table>
              <thead>
                <tr>
                  {head.map((cell, ci) => (
                    <th key={ci}>{inline(cell, `th-${tableKey}-${ci}`)}</th>
                  ))}
                </tr>
              </thead>
              {body.length ? (
                <tbody>
                  {body.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci}>{inline(cell, `td-${tableKey}-${ri}-${ci}`)}</td>
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
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''))
        i += 1
      }
      blocks.push(<blockquote key={key++}>{linesInline(quote, `q${key}`)}</blockquote>)
      continue
    }
    if (matchList(line)) {
      const collected = collectList(lines, i)
      i = collected.next
      const tree = nestList(collected.items)
      blocks.push(<Fragment key={key++}>{renderList(tree, `l${key}`)}</Fragment>)
      continue
    }
    if (!line.trim()) {
      i += 1
      continue
    }
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|```|>\s?|\s*[-*+]\s|\s*\d+\.\s|(\*\s*\*\s*\*|-{3,}|_{3,})\s*$)/.test(lines[i]) &&
      !(isTableLine(lines[i]) && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) {
      para.push(lines[i])
      i += 1
    }
    const paraKey = key++
    blocks.push(<p key={paraKey}>{linesInline(para, `p${paraKey}`)}</p>)
  }
  return blocks
}

export function MarkdownView({ text }: { text: string }) {
  const source = text.trim()
  if (!source) return <p className="md-empty">點編輯，用 Markdown 寫筆記。</p>
  return <div className="md-view">{parseBlocks(source)}</div>
}
