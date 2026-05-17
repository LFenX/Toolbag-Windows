import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";

import { AppShell } from "./shell/AppShell";
import { AboutPage } from "../features/about/AboutPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { LogsPage } from "../features/logs/LogsPage";
import { MarketplacePage } from "../features/marketplace/MarketplacePage";
import { PluginsPage } from "../features/plugins/PluginsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { ToolPage } from "../features/tools/ToolPage";
import { ThemeController } from "./theme";

const rootRoute = createRootRoute({
  component: () => (
    <>
      <ThemeController />
      <AppShell>
        <Outlet />
      </AppShell>
    </>
  ),
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

const toolRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tools/$toolId",
  component: ToolPage,
});

const marketplaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/marketplace",
  component: MarketplacePage,
});

const pluginsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/plugins",
  component: PluginsPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const logsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/logs",
  component: LogsPage,
});

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/about",
  component: AboutPage,
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  toolRoute,
  marketplaceRoute,
  pluginsRoute,
  settingsRoute,
  logsRoute,
  aboutRoute,
]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  return <RouterProvider router={router} />;
}
