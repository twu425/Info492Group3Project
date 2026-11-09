import type { Metadata } from 'next'
import { LoginPage } from '@/components/login/login-page'

export const metadata: Metadata = {
  title: 'Log in — BidGrid',
}

export default function Login() {
  return <LoginPage />
}
