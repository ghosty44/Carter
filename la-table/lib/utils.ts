import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, startOfWeek, addDays } from 'date-fns'
import { fr } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getWeekStart(date: Date = new Date()): Date {
  return startOfWeek(date, { weekStartsOn: 1 }) // Monday
}

export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

export function formatWeekStart(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function formatDate(dateStr: string): string {
  return format(new Date(dateStr), 'd MMM yyyy', { locale: fr })
}

export function formatDay(date: Date): string {
  return format(date, 'EEE d', { locale: fr })
}

export function formatDayFull(date: Date): string {
  return format(date, 'EEEE d MMMM', { locale: fr })
}

export function totalTime(prep: number | null, cook: number | null): string {
  const total = (prep ?? 0) + (cook ?? 0)
  if (!total) return ''
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`
}

export function formatPrice(price: number | null): string {
  if (price == null) return ''
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(price)
}

export function cartTotal(items: { price: number | null; qty: number | null }[]): number {
  return items.reduce((sum, item) => sum + (item.price ?? 0) * (item.qty ?? 1), 0)
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
