import { ArrowLeft } from 'lucide-react'
import { Alert } from '../../shared/ui/Alert'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'
import { Container } from '../../shared/ui/Container'
import { Input } from '../../shared/ui/Input'
import { Logo } from '../../shared/ui/Logo'
import { Reveal } from '../../shared/ui/Reveal'
import { Section } from '../../shared/ui/Section'
import { Skeleton } from '../../shared/ui/Skeleton'
import { Spinner } from '../../shared/ui/Spinner'
import { StripeBackground } from '../../shared/ui/StripeBackground'

export function DesignPage() {
  return (
    <main className="design-page" id="main-content">
      <header className="design-header"><Container><Logo /><Button to="/" variant="ghost"><ArrowLeft size={16} aria-hidden="true" /> Back to site</Button></Container></header>
      <Section tone="navy" className="design-hero"><StripeBackground variant="fade" /><Badge>DEVELOPER PREVIEW</Badge><h1>Cool-lab design system</h1><p>A working inventory of the shared interface, its states, and its accessible feedback patterns.</p></Section>
      <Section className="design-section"><h2>Buttons & badges</h2><div className="design-row"><Button>Primary action</Button><Button variant="secondary">Secondary action</Button><Button variant="ghost">Ghost action</Button><Button variant="inverse">Inverse action</Button><Button disabled>Disabled</Button><Badge>Practice mode</Badge></div></Section>
      <Section tone="muted" className="design-section"><h2>Form controls</h2><div className="design-form"><Input label="Email address" name="email" type="email" placeholder="you@example.com" hint="We’ll only use this for your account." /><Input label="Disabled input" name="disabled" value="Cannot edit this" disabled readOnly /></div></Section>
      <Section className="design-section"><h2>Cards & alerts</h2><div className="design-card-grid"><Card><span className="eyebrow">DEFAULT CARD</span><h3>A calm place for content</h3><p>Cards help group related choices without making the page feel crowded.</p></Card><Card elevated><span className="eyebrow">ELEVATED CARD</span><h3>More emphasis, same system</h3><p>A softer navy-tinted shadow helps important surfaces rise from white.</p></Card></div><div className="design-alerts"><Alert tone="success" label="Correct">Great recall. This answer is right.</Alert><Alert tone="warning" label="Try again">Review the explanation, then give it another go.</Alert><Alert tone="error" label="Not quite">That answer needs another look.</Alert></div></Section>
      <Section tone="navy" className="design-section"><h2>Loading & decorative patterns</h2><div className="design-row"><div className="design-load"><Spinner /><span>Spinner</span></div><div className="design-load"><Skeleton className="skeleton--sample" /><span>Skeleton</span></div><div className="pattern-sample"><StripeBackground variant="pinstripe" /><span>Pinstripe</span></div><div className="pattern-sample pattern-sample--band"><StripeBackground variant="band" /><span>Stripe band</span></div></div></Section>
      <Section className="design-section"><h2>Reveal motion</h2><Reveal><Card><h3>Scroll-reveal card</h3><p>Fade and rise once as this content enters view; motion is removed for reduced-motion preferences.</p></Card></Reveal></Section>
    </main>
  )
}
