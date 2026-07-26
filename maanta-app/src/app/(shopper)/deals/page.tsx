import { redirect } from "next/navigation";

/** Wireframe My deals — canonical route is /my-deals. */
export default function DealsIndex() {
  redirect("/my-deals");
}
