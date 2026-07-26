import { redirect } from "next/navigation";

/** Legacy route — wireframe canonical is /you. */
export default function ProfileRedirect() {
  redirect("/you");
}
