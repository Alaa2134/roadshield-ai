/** Only the application destinations used by our email authentication flows. */
export function authCallbackDestination(next: string | null): string {
  switch (next) {
    case '/app':
    case '/app/onboarding':
    case '/reset-password':
      return next;
    default:
      return '/app';
  }
}
