import { isAddress } from "ethers";

export const docsSections = [
  ["what", "What it is"],
  ["how", "How it works"],
  ["addresses", "Addresses"],
  ["integrate", "Integrate a project"],
  ["listing", "Get listed"],
  ["points", "Points"],
  ["agents", "For agents"],
] as const;
export type DocSection = (typeof docsSections)[number][0];
export const pages = [
  ["#/", "Home"],
  ["#/stack", "Stack"],
  ["#/projects", "Projects"],
  ["#/apply", "Apply"],
  ["#/leaderboard", "Leaderboard"],
  ["#/docs/what", "Docs"],
] as const;
export type Route =
  | {
      page:
        "home" | "stack" | "projects" | "apply" | "leaderboard" | "not-found";
      title: string;
    }
  | { page: "project"; title: string; address: string }
  | { page: "docs"; title: string; section: DocSection };

export function parseRoute(hash: string): Route {
  const paths: Record<string, Route> = {
    "#/": { page: "home", title: "Home" },
    "#/stack": { page: "stack", title: "Your stack" },
    "#/projects": { page: "projects", title: "Projects" },
    "#/apply": { page: "apply", title: "Apply" },
    "#/leaderboard": { page: "leaderboard", title: "Leaderboard" },
  };
  if (paths[hash || "#/"]) return paths[hash || "#/"];
  const doc = docsSections.find(
    ([slug]) =>
      hash === `#/docs/${slug}` || (hash === "#/docs" && slug === "what"),
  );
  if (doc) return { page: "docs", section: doc[0], title: doc[1] };
  const match = /^#\/projects\/(0x[\da-fA-F]{40})$/.exec(hash);
  if (match && isAddress(match[1]))
    return { page: "project", title: "Project", address: match[1] };
  return { page: "not-found", title: "Page not found" };
}
export const projectPath = (address: string) => `#/projects/${address}`;
export function currentPage(route: Route, href: string) {
  if (href === "#/docs/what") return route.page === "docs";
  if (href === "#/projects")
    return route.page === "projects" || route.page === "project";
  return href === (route.page === "home" ? "#/" : `#/${route.page}`);
}
