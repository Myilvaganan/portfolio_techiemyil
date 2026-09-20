import { describe, expect, it } from 'vitest'
import { buildReportHtml, escapeHtml, toCsv } from './report'

describe('report', () => {
  it('escapes everything it prints', () => {
    expect(escapeHtml('<script>alert("x")</script> & \'y\'')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;')
    const html = buildReportHtml({
      title: '<b>Title</b>',
      sections: [{ title: 'S', kpis: [{ label: 'L', value: '<img src=x onerror=1>' }], table: { columns: ['<c>'], rows: [['<td>']] }, bullets: [{ text: '<i>b</i>' }] }],
    })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;td&gt;')
    expect(html).toContain('&lt;i&gt;b&lt;/i&gt;')
    expect(html).toContain('&lt;b&gt;Title&lt;/b&gt;')
    expect(html).toContain('&lt;img src=x onerror=1&gt;')
  })

  it('renders KPIs, bars, tables and bullets and notes truncation', () => {
    const rows = Array.from({ length: 650 }, (_, i) => [i, `row ${i}`])
    const html = buildReportHtml({
      title: 'T',
      subtitle: 'Sub',
      sections: [
        { title: 'K', kpis: [{ label: 'Net', value: '₹1,000', tone: 'good', note: 'ok' }] },
        { title: 'B', bars: [{ label: 'Food', value: 50, display: '₹50' }, { label: 'Rent', value: 100, display: '₹100' }] },
        { title: 'Tbl', table: { columns: ['#', 'Name'], rows, rightAlign: [0] } },
      ],
    })
    expect(html).toContain('₹1,000')
    expect(html).toContain('width:100%')
    expect(html).toContain('width:50%')
    expect(html).toContain('first 600 of 650 rows')
    expect((html.match(/<tr>/g) ?? []).length).toBe(601)
  })

  it('writes safe CSV', () => {
    const csv = toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['=SUM(A1)', 5]])
    expect(csv).toBe('a,b\r\n"x,y","say ""hi"""\r\n\'=SUM(A1),5')
  })
})
