import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { HomePage, ReaderPage } from "./pages";
import ErrorBoundary from "./components/ErrorBoundary";
import type { Theme } from "./types";

/**
 * Root route: hosts the app-level {@link ErrorBoundary} above the rendered
 * page so a bad book cannot blank the whole app, and renders the active route
 * through `<Outlet />`.
 */
const rootRoute = createRootRoute({
  component: () => (
    <ErrorBoundary>
      <Outlet />
    </ErrorBoundary>
  ),
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const readerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reader/$bookId",
  component: ReaderPage,
});

const routeTree = rootRoute.addChildren([homeRoute, readerRoute]);

/** Hash history allows static hosting without server-side SPA rewrites. */
export const router = createRouter({
  routeTree,
  history: createHashHistory(),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

/**
 * Navigation state carried between the library and the reader. It is held in
 * memory during the session and is not restored after a full page reload; the
 * route book id is the durable source.
 */
declare module "@tanstack/history" {
  interface HistoryState {
    bookId?: string;
    bookTitle?: string;
    libraryFolderId?: string;
    theme?: Theme;
  }
}
