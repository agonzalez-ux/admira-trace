import RestablecerForm from "@/components/RestablecerForm";

export default function RestablecerPage({ searchParams }: { searchParams: { token?: string } }) {
  return <RestablecerForm token={searchParams.token || ""} />;
}
