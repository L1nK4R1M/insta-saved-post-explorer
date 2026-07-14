import { redirect } from "next/navigation";
import { getSession } from "@/auth/session";
import { AdminCenter } from "@/features/admin/admin-center";

export default async function AdminPage() {
  const session = await getSession().catch(() => null);
  if (session?.role !== "admin") redirect("/login?next=/admin");
  return <AdminCenter />;
}
