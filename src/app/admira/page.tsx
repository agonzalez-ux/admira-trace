import { requireRole } from "@/lib/require-role";
import TopBar from "@/components/TopBar";
import AdmiraDashboard from "@/components/dashboards/AdmiraDashboard";

export default async function AdmiraPage() {
  const session = await requireRole("ADMIRA");
  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar title={session.name} subtitle="Admira · Coordinación" roleColor="bg-admira-700" />
      <AdmiraDashboard />
    </div>
  );
}
