import { requireRole } from "@/lib/require-role";
import TopBar from "@/components/TopBar";
import TecnicoDashboard from "@/components/dashboards/TecnicoDashboard";

export default async function TecnicoPage() {
  const session = await requireRole("TECNICO");
  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar title={session.name} subtitle="Técnico · Admira Trace" roleColor="bg-emerald-700" />
      <TecnicoDashboard />
    </div>
  );
}
