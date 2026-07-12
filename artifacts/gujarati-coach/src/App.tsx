import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';

import Home from '@/pages/home';
import CategoryDetail from '@/pages/category-detail';
import Practice from '@/pages/practice';
import Progress from '@/pages/progress';
import ProfileSelect from '@/pages/profile-select';
import NotFound from '@/pages/not-found';
import { ProfileProvider, useProfile } from '@/lib/profile';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/learn/:categoryId" component={CategoryDetail} />
      <Route path="/practice/:categoryId" component={Practice} />
      <Route path="/progress" component={Progress} />
      <Route component={NotFound} />
    </Switch>
  );
}

function Gate() {
  const { profile } = useProfile();
  if (!profile) return <ProfileSelect />;
  return <Router />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ProfileProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Gate />
          </WouterRouter>
        </ProfileProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
