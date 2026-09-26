import { Helmet } from 'react-helmet-async'
import { Container } from '@/components/ui/Container'
import { Badge } from '@/components/ui/Badge'
import { MarginCalculator } from '@/pages/admin/MarginCalculator'

/** Free public tools. The first is the forex / gold / crypto margin and position-size calculator I use myself. */
export function Tools() {
  return (
    <section className="relative py-28 sm:py-32">
      <Helmet>
        <title>Free Margin &amp; Position Size Calculator — Techie Myil</title>
        <meta name="description" content="Free margin calculator for gold (XAUUSD), US30, Bitcoin and forex: live prices, leverage per instrument, margin needed, profit and loss in USD and INR." />
        <link rel="canonical" href="https://portfolio.techiemyil.com/tools" />
        <meta property="og:title" content="Free Margin & Position Size Calculator" />
        <meta property="og:url" content="https://portfolio.techiemyil.com/tools" />
      </Helmet>
      <Container>
        <div className="mb-8 max-w-2xl">
          <Badge>Free tool</Badge>
          <h1 className="mt-4 font-display text-4xl font-semibold text-text">Margin &amp; position size calculator</h1>
          <p className="mt-3 text-text-secondary">
            Work out the margin a trade needs, what a move is worth, and your profit after tax, with live gold, US30, Bitcoin and USD/INR prices. Nothing you type leaves your browser.
          </p>
        </div>
        <MarginCalculator />
      </Container>
    </section>
  )
}
