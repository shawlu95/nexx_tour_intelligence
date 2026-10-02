import { Redirect } from 'expo-router';

// Landing route for the Google sign-in redirect (nora://auth-callback). The code
// exchange happens in signInWithGoogle; this screen just returns home.
export default function AuthCallback() {
  return <Redirect href="/tour" />;
}
