import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'River Club — Poker with your people', description: 'Your private Texas Hold’em table. Play with 2–10 friends, four custom decks, bomb pots and bounty rounds.' };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
