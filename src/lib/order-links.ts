import type { Order } from "./domain";

export const orderNumberPattern = /^MF-\d{8}-\d{6,20}$/;
export function orderPath(order: Pick<Order, "order_number">, admin = false) {
  return `${admin ? "/admin" : ""}/orders/${encodeURIComponent(order.order_number)}`;
}
export function findOrder(orders: Order[], identifier: string) {
  return orders.find(
    (order) => order.id === identifier || order.order_number === identifier,
  );
}
export function orderLookup(path: string) {
  return /^\/(?:admin\/)?(?:orders|pay)\/([^/]+)$/.exec(path)?.[1];
}
