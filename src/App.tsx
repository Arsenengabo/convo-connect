import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { IncomingCallProvider } from "@/components/call/IncomingCallProvider";
import { ServiceWorkerProvider } from "@/components/ServiceWorkerProvider";
import { NetworkStatus } from "@/components/NetworkStatus";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Install from "./pages/Install";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ServiceWorkerProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <NetworkStatus />
            <IncomingCallProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/install" element={<Install />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </IncomingCallProvider>
          </TooltipProvider>
        </AuthProvider>
      </ServiceWorkerProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
