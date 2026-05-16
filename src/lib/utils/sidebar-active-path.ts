import type { NavItem } from "@/lib/constants/nav";

export function collectLeafHrefs(items: NavItem[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    if (it.children?.length) {
      out.push(...collectLeafHrefs(it.children));
    } else {
      out.push(it.href);
    }
  }
  return out;
}

export function isLeafActive(
  href: string,
  pathname: string,
  allLeafHrefs: readonly string[],
): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (pathname === href) return true;
  if (!pathname.startsWith(href + "/")) return false;
  const moreSpecific = allLeafHrefs.find(
    (h) =>
      h !== href &&
      h.startsWith(href + "/") &&
      (pathname === h || pathname.startsWith(h + "/")),
  );
  return !moreSpecific;
}

export function isGroupActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}
