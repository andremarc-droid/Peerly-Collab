import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'

interface TabItem { label: string; content: ReactNode; count?: number }
interface TabsProps { label: string; tabs: TabItem[]; defaultIndex?: number }

export function Tabs({ label, tabs, defaultIndex = 0 }: TabsProps) {
  const [active, setActive] = useState(defaultIndex)
  const id = useId()
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    setActive(next)
    document.getElementById(`${id}-tab-${next}`)?.focus()
  }
  return <div className="tabs"><div className="tabs__scroll"><div role="tablist" aria-label={label} className="tabs__list">{tabs.map((tab, index) => <button id={`${id}-tab-${index}`} type="button" role="tab" aria-selected={active === index} aria-controls={`${id}-panel`} tabIndex={active === index ? 0 : -1} key={tab.label} onClick={() => setActive(index)} onKeyDown={(event) => move(event, index)}>{tab.label}{tab.count !== undefined && <><span aria-hidden="true"> </span><span className="tabs__count" aria-hidden="true">{tab.count}</span><span className="sr-only">{tab.count} items</span></>}</button>)}</div></div><div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${active}`} tabIndex={0} className="tabs__panel">{tabs[active]?.content}</div></div>
}
