import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { SheetHeader } from "@/components/ui/SheetHeader";
import { profile, sectionMeta } from "@/data/resume";
import { withBase } from "@/lib/base";
import { ContactRows } from "./contact/ContactRows";
import { EmailFlap } from "./contact/EmailFlap";
import styles from "./contact/contact.module.css";
import shared from "./sections.module.css";

/** 06 CONTACT (docs/DESIGN.md §7.7): the email flap button, the ruled rows and the primary résumé button. */
export function Contact() {
  const meta = sectionMeta.contact;
  return (
    <Sheet id="contact">
      <div className="container-x">
        <SheetHeader id="contact" index={meta.index} title={meta.label} annotation={meta.annotation} />
        <p className={shared.intro}>{meta.title.join(" ")}</p>
        <div className={styles.grid}>
          <div className={styles.email}>
            <EmailFlap />
          </div>
          <div className={styles.aside}>
            <ContactRows />
            <Button href={withBase(profile.resumePdf)} variant="primary" external className={styles.resume}>
              Résumé (PDF)
            </Button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
