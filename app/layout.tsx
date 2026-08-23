import type { Metadata } from 'next'
import './globals.css'
export const metadata: Metadata = { title: 'Weekly CT Leaderboard', description: 'Monthly Beyblade X leaderboard' }
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html> }
