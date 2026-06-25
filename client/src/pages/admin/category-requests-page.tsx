import { Redirect } from "wouter";

/** @deprecated Use /admin/categories?section=category-requests */
export default function CategoryRequestsPage() {
  return <Redirect to="/admin/categories?section=category-requests" />;
}
