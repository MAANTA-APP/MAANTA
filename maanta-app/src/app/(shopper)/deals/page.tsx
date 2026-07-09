import { redirect } from "next/navigation";

/** The old /deals list is superseded by the home feed. */
export default function DealsIndex() {
  redirect("/feed");
}
