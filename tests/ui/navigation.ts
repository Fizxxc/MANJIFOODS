export function usePathname() {
  return new URL(location.href).pathname;
}
const router = {
  push: (url: string) => location.assign(url),
  replace: (url: string) => location.replace(url),
  refresh: () => {},
};
export function useRouter() {
  return router;
}
