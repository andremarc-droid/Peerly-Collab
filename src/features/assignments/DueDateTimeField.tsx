import { Input } from '../../shared/ui/Input'
import { Select } from '../../shared/ui/Select'

interface DueDateTimeFieldProps {
  value: string
  onChange: (value: string) => void
}

const hours = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))
const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'))

/** Date and local time controls with an explicit 12-hour clock and AM/PM. */
export function DueDateTimeField({ value, onChange }: DueDateTimeFieldProps) {
  const [date, time] = value.split('T')
  const [hour24 = '', minute = ''] = (time ?? '').split(':')
  const hourNumber = Number(hour24)
  const hour12 = hour24 ? String(hourNumber % 12 || 12).padStart(2, '0') : ''
  const period = hour24 ? hourNumber >= 12 ? 'PM' : 'AM' : ''

  function changeTime(nextHour = hour12, nextMinute = minute, nextPeriod = period) {
    if (!date) return
    const hour = Number(nextHour)
    if (!hour || !nextMinute || !nextPeriod) return
    const hourLocal = (hour % 12) + (nextPeriod === 'PM' ? 12 : 0)
    onChange(`${date}T${String(hourLocal).padStart(2, '0')}:${nextMinute}`)
  }

  function changeDate(nextDate: string) {
    if (!nextDate) { onChange(''); return }
    onChange(`${nextDate}T${time || '23:59'}`)
  }

  return <fieldset className="grid min-w-0 gap-3 border-0 p-0">
    <legend className="field__label mb-2">Due date</legend>
    <Input label="Date" name="assignment-due-date" type="date" aria-describedby="assignment-due-hint" value={date ?? ''} onChange={(event) => changeDate(event.target.value)} />
    <div className="grid grid-cols-3 gap-2">
      <Select label="Hour" name="assignment-due-hour" aria-describedby="assignment-due-hint" value={hour12} disabled={!date} onChange={(event) => changeTime(event.target.value)} options={[{ label: '—', value: '' }, ...hours.map((hour) => ({ label: hour.replace(/^0/, ''), value: hour }))]} />
      <Select label="Minute" name="assignment-due-minute" aria-describedby="assignment-due-hint" value={minute} disabled={!date} onChange={(event) => changeTime(hour12, event.target.value)} options={[{ label: '—', value: '' }, ...minutes.map((item) => ({ label: item, value: item }))]} />
      <Select label="AM/PM" name="assignment-due-period" aria-describedby="assignment-due-hint" value={period} disabled={!date} onChange={(event) => changeTime(hour12, minute, event.target.value)} options={[{ label: '—', value: '' }, { label: 'AM', value: 'AM' }, { label: 'PM', value: 'PM' }]} />
    </div>
    <span id="assignment-due-hint" className="field__hint">Optional · local time; a new date defaults to 11:59 PM</span>
  </fieldset>
}
