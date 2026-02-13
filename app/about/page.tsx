import { redirect } from 'next/navigation';

export default function AboutRedirectPage() {
  redirect('/?tab=about');
}
