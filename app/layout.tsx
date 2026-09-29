import type { Metadata } from 'next'
import './globals.css'
import './user-stats.css'

export const metadata: Metadata = {
  title: 'SGBEYLION League',
  description: 'SGBEYLION CT monthly Beyblade X rankings, attendance and personal CT stats',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}
