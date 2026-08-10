import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import LoginScreen from "@/components/LoginScreen";

export default async function HomePage() {
  const session = await getSession();
  if (session) {
    redirect(`/${session.role.toLowerCase()}`);
  }
  return <LoginScreen />;
}
