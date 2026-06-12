import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Employees from "@/pages/employees";
import NewEmployee from "@/pages/new-employee";
import EmployeeDetail from "@/pages/employee-detail";
import CameraPage from "@/pages/camera";
import Attendance from "@/pages/attendance";
import Reports from "@/pages/reports";
import { Layout } from "@/components/layout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000 },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <Layout>
          <Dashboard />
        </Layout>
      </Route>
      <Route path="/employees/new">
        <Layout>
          <NewEmployee />
        </Layout>
      </Route>
      <Route path="/employees/:id">
        <Layout>
          <EmployeeDetail />
        </Layout>
      </Route>
      <Route path="/employees">
        <Layout>
          <Employees />
        </Layout>
      </Route>
      <Route path="/camera">
        <Layout>
          <CameraPage />
        </Layout>
      </Route>
      <Route path="/attendance">
        <Layout>
          <Attendance />
        </Layout>
      </Route>
      <Route path="/reports">
        <Layout>
          <Reports />
        </Layout>
      </Route>
      <Route>
        <Layout>
          <NotFound />
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
