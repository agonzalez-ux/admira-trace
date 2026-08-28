import FormularioViabilidad from "@/components/FormularioViabilidad";

export default function FormularioViabilidadPage({ searchParams }: { searchParams: { token?: string } }) {
  return <FormularioViabilidad token={searchParams.token || ""} />;
}
