import clsx from "clsx";
import { LinkRow } from "@/components/ui/LinkRow";
import { Stagger } from "@/components/ui/Stagger";
import { links, profile } from "@/data/resume";
import { LocalTime } from "./LocalTime";
import styles from "./contact.module.css";

/** Host-less display form of a profile URL, e.g. "in/kshitij-bhardwaj-067240232". */
const handle = (href: string) => new URL(href).pathname.replace(/^\/+|\/+$/g, "");

/** The ruled contact list: email, phone, LinkedIn, GitHub and the location with its live local time; the rows enter 40 ms apart (Stagger). */
export function ContactRows() {
  return (
    <Stagger as="ul" className={clsx("link-rows", styles.rows)} role="list">
      <li>
        <LinkRow href={`mailto:${profile.email}`} label="Email" value={profile.email} />
      </li>
      <li>
        <LinkRow href={profile.phoneHref} label="Phone" value={profile.phone} />
      </li>
      <li>
        <LinkRow href={links.linkedin.href} label={links.linkedin.label} value={handle(links.linkedin.href)} external />
      </li>
      <li>
        <LinkRow href={links.github.href} label={links.github.label} value={handle(links.github.href)} external />
      </li>
      <li className={styles.staticRow}>
        <span className="label">Location</span>
        <span className={styles.staticValue}>
          {profile.location} · {profile.timezone} · <LocalTime />
        </span>
      </li>
    </Stagger>
  );
}
