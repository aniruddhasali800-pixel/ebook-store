import { AppChrome } from '@/components/AppChrome';
import { VisitorBeacon } from '@/components/VisitorBeacon';

export default function CafeLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppChrome>
      {children}
      <VisitorBeacon />
    </AppChrome>
  );
}
