import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { setAiConsentRequiredListener } from '@workspace/api-client-react';
import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

export function AiConsentNotice() {
  const [, navigate] = useLocation();
  const lastShown = useRef(0);
  useEffect(() => {
    setAiConsentRequiredListener(() => {
      if (Date.now() - lastShown.current < 5000) return;
      lastShown.current = Date.now();
      const notice = toast({
        title: 'AI permission is off',
        description: 'This feature needs AI permission. You can turn it on in Account.',
        duration: 8000,
        action: <ToastAction altText="Open Account to review AI permission"
          onClick={() => { notice.dismiss(); navigate('/account'); }}>Open Account</ToastAction>,
      });
    });
    return () => setAiConsentRequiredListener(null);
  }, [navigate]);
  return null;
}
