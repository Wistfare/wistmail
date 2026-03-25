import { redirect } from 'next/navigation'

export default function Home() {
  // TODO: Check auth state and redirect accordingly
  redirect('/login')
}
