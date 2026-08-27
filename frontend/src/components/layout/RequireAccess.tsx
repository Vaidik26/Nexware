import { ReactNode } from 'react';
import { useAuthStore } from '@/store/authStore';
import { PageLoader } from '@/components/ui/PageLoader';
import NoAccess from '@/pages/auth/NoAccess';
import { PortalModule, hasModule, ownsPortal } from '@/lib/access';

/**
 * Route guard. Renders `children` only when the signed-in account may open them.
 *
 * COSMETIC BY DESIGN. The enforcing gate is `require_module` on the backend
 * routers; this stops a link being followed to a screen that would answer 403,
 * and stops a screen rendering half its chrome before that happens. Removing it
 * in the browser reveals an empty page, not data.
 *
 * `module` names the module the screen belongs to. Omit it for the screens that
 * belong to no module — warehouse, delivery, market intelligence, master data —
 * which only the admin persona reaches.
 */
export function RequireAccess({
  children,
  module,
}: {
  children: ReactNode;
  module?: PortalModule;
}) {
  const access = useAuthStore((s) => s.access);
  const accessLoaded = useAuthStore((s) => s.accessLoaded);

  // "Not loaded yet" and "loaded, and it holds nothing" are the same empty
  // object and must not look the same: refusing during the first render would
  // flash a denial at somebody who is entitled to the screen.
  if (!accessLoaded) {
    return <PageLoader message="Checking access..." subtitle="Reading your account permissions" />;
  }

  const allowed = module ? ownsPortal(access) || hasModule(access, module) : ownsPortal(access);

  return allowed ? <>{children}</> : <NoAccess module={module} />;
}
