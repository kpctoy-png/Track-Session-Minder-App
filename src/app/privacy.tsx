import { useRouter } from 'expo-router';

import { PrivacyPolicy } from '@/components/PrivacyPolicy';

// A page of its own (/privacy) so it can be linked from emails and app store listings. Done returns to My Day.
export default function PrivacyScreen() {
  const router = useRouter();
  return <PrivacyPolicy onDone={() => router.navigate('/me')} />;
}
