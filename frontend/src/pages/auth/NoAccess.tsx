import { ShieldOff, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import { MODULE_LABELS, landingPath } from '@/lib/access';

/**
 * Shown when a signed-in account holds no module that covers the screen it
 * asked for — or, at `/no-access`, no module at all.
 *
 * This is a real state, not an error. A SALES or WAREHOUSE account defaults to
 * no portal modules because its work is the standalone LPO and picking apps, so
 * a valid login that opens nothing here is the configuration working as
 * specified. It says so plainly, names what the account CAN open if anything,
 * and tells the holder who can change it — rather than the blank screen or the
 * "something went wrong" that both read as a bug.
 */
export default function NoAccess({ module }: { module?: string }) {
  const navigate = useNavigate();
  const access = useAuthStore((s) => s.access);
  const logout = useAuthStore((s) => s.logout);

  const held = access?.modules ?? [];
  const elsewhere = landingPath(access);

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6 rounded-2xl border border-outline-variant bg-surface-container-lowest p-10 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-600">
          <ShieldOff className="h-7 w-7" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-on-surface">
            {module ? 'This screen is not part of your access' : 'Your account opens nothing here'}
          </h2>
          <p className="text-sm text-on-surface-variant">
            {module ? (
              <>
                Opening it needs the <span className="font-semibold">{module}</span> module, which
                your account does not hold.
              </>
            ) : (
              <>
                You are signed in, but no portal module is granted to this account. Field sales and
                warehouse accounts work in the standalone LPO and picking apps, and default to no
                web portal screens at all — so this is often the intended configuration rather than
                a fault.
              </>
            )}
          </p>
        </div>

        {held.length > 0 && (
          <div className="rounded-xl border border-outline-variant bg-surface-container px-4 py-3 text-left">
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Your account can open
            </p>
            <ul className="mt-1.5 space-y-1 text-sm text-on-surface">
              {held.map((m) => (
                <li key={m}>· {MODULE_LABELS[m] ?? m}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-on-surface-variant">
          A user administrator can change this from User Management.
          {access?.role && (
            <>
              {' '}
              Your role is <span className="font-semibold">{access.role}</span>.
            </>
          )}
        </p>

        <div className="flex justify-center gap-3">
          {elsewhere && (
            <Button onClick={() => navigate(elsewhere, { replace: true })}>
              Go to my dashboard
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
