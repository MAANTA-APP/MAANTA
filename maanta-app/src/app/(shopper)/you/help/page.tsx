import {
  BackToYouLink,
  Body,
  HeadingLg,
  Page,
  Section,
} from "@/components/ui/claude";
import { HelpFaqs, HelpWhatsAppButton } from "@/components/marketing/help-content";

/**
 * 8r Help / support, app shell.
 *
 * Same content as `/help`, rendered inside the product chrome a signed-in
 * shopper is already in. Reached from You → Help & support and from a ticket.
 */
export default function YouHelpPage() {
  return (
    <Page className="px-0 pt-4">
      <div className="px-4">
        <BackToYouLink />
        <HeadingLg className="mt-4">Help</HeadingLg>
        <Body className="mt-1">Answers and a line to WhatsApp support.</Body>
      </div>
      <Section className="mt-6">
        <HelpFaqs />
        <HelpWhatsAppButton className="mt-6" />
      </Section>
    </Page>
  );
}
