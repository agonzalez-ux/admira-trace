import { requireRole } from "@/lib/require-role";
import TopBar from "@/components/TopBar";
import FdmDashboard from "@/components/dashboards/FdmDashboard";

export default async function FdmPage() {
  const session = await requireRole("FDM");
  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar title={session.name} subtitle="FDM · Almacén" roleColor="bg-slate-700" />
      <FdmDashboard />
    </div>
  );
}
