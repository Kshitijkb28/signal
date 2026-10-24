/**
 * Single source of truth for all portfolio content.
 * Every string here comes from Kshitij-Bhardwaj-Resume_V4.pdf (wording lightly polished, nothing invented).
 */

export const SITE = {
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://kshitijkb28.github.io",
  name: "Kshitij Bhardwaj",
  title: "Kshitij Bhardwaj — Full Stack Developer",
  description:
    "Full Stack Developer in Gurugram, India with three years of hands-on experience across PHP, Python, JavaScript, React, Laravel, Node.js, FastAPI and Flask — now building the backends, evaluation pipelines and internal tools behind AI-powered applications at Ethara AI.",
  year: 2026,
} as const;

export const profile = {
  name: "Kshitij Bhardwaj",
  firstName: "Kshitij",
  lastName: "Bhardwaj",
  initials: "KB",
  role: "Full Stack Developer",
  city: "Gurugram",
  location: "Gurugram, India",
  timezone: "Asia/Kolkata",
  email: "Kshitijbhardwajkb28@gmail.com",
  phone: "9729916844",
  /** +91 inferred from the Gurugram, India location on the resume. */
  phoneHref: "tel:+919729916844",
  yearsExperience: 3,
  eyebrow: "Full Stack Developer · Gurugram, India",
  hook: "Three years shipping full-stack products — now building the backends, evaluation pipelines and internal tools behind AI-powered applications at Ethara AI.",
  summary: [
    "Dedicated, results-oriented full-stack web developer with three years of hands-on experience, an entrepreneurial mindset and a strong professional aptitude in computer science.",
    "Analytical, innovative and goal-driven, I deliver high-quality solutions and give clients a never-before experience.",
  ],
  nowLine:
    "Today at Ethara AI I build Python backends for AI-powered products and contribute to LLM post-training — dataset preparation, evaluation pipelines and response-quality work.",
  now: {
    label: "Now",
    role: "Software Engineer",
    company: "Ethara AI",
    href: "https://www.ethara.ai/",
  },
  resumePdf: "/Kshitij-Bhardwaj-Resume.pdf",
  /** Optional portrait (e.g. "/portrait.jpg"). The GitHub avatar is a default identicon, so none is used. */
  photo: null as string | null,
} as const;

export const links = {
  site: { label: "kshitijkb28.github.io", href: "https://kshitijkb28.github.io" },
  linkedin: {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/kshitij-bhardwaj-067240232",
  },
  github: { label: "GitHub", href: "https://github.com/Kshitijkb28" },
} as const;

export interface SkillGroup {
  id: string;
  label: string;
  items: string[];
  /** index 0 = top of the hero tower (tangerine) … 4 = bottom (mint) */
  rampIndex: number;
}

/** Exactly the five groups on the resume, top → bottom of the "stack". */
export const skills: SkillGroup[] = [
  { id: "languages", label: "Languages", items: ["PHP", "Python", "JavaScript", "C++"], rampIndex: 0 },
  { id: "frontend", label: "Frontend", items: ["HTML", "CSS", "Bootstrap", "JavaScript", "React"], rampIndex: 1 },
  { id: "backend", label: "Backend", items: ["Laravel", "Node.js", "FastAPI", "Flask"], rampIndex: 2 },
  { id: "database", label: "Database", items: ["MySQL", "MongoDB", "PostgreSQL"], rampIndex: 3 },
  { id: "cloud", label: "Cloud", items: ["AWS S3"], rampIndex: 4 },
];

export const allSkills: string[] = Array.from(new Set(skills.flatMap((g) => g.items)));

export interface Experience {
  id: string;
  index: string;
  company: string;
  href: string;
  location: string;
  role: string;
  period: string;
  start: string;
  end: string;
  bullets: string[];
  tags: string[];
}

export const experience: Experience[] = [
  {
    id: "ethara",
    index: "01",
    company: "Ethara AI",
    href: "https://www.ethara.ai/",
    location: "Gurugram",
    role: "Software Engineer",
    period: "Jan 2026 – Present",
    start: "2026-01",
    end: "Present",
    bullets: [
      "Building APIs and backend systems using Python (FastAPI / Flask) for AI-powered applications.",
      "Contributing to LLM post-training workflows — dataset preparation, evaluation pipelines and response-quality improvement.",
      "Developing internal tools to support AI model evaluation and prompt optimisation.",
      "Integrating LLM capabilities into products for intelligent automation and enhanced user experiences.",
      "Collaborating with cross-functional teams to improve AI system performance and reliability.",
    ],
    tags: ["Python", "FastAPI", "Flask", "LLMs"],
  },
  {
    id: "mind2web",
    index: "02",
    company: "Mind2web LLP",
    href: "https://mind2web.io/",
    location: "Mohali",
    role: "Software Engineer",
    period: "Aug 2023 – Oct 2025",
    start: "2023-08",
    end: "2025-10",
    bullets: [
      "Configured and deployed projects on servers, ensuring smooth setup and optimal performance.",
      "Enhanced platform scalability and performance by fixing critical bugs and optimising backend code.",
      "Set up Linux-based servers, configured environments (Apache/Nginx, PHP, Node.js) and deployed multiple projects with proper security, monitoring and performance optimisation.",
    ],
    tags: ["Linux", "Nginx", "Apache", "PHP", "Node.js"],
  },
];

export interface Project {
  id: string;
  index: string;
  name: string;
  /** Giant letter used for the generative card artwork. */
  initial: string;
  href: string;
  domain: string;
  period: string;
  blurb: string;
  bullets: string[];
  tags: string[];
  /** Card skin: alternates for rhythm. */
  skin: "surface" | "tangerine" | "mint";
}

export const projects: Project[] = [
  {
    id: "yot",
    index: "01",
    name: "Yot Ecommerce",
    initial: "Y",
    href: "https://fuse.systems",
    domain: "fuse.systems",
    period: "Jan 2025 – Oct 2025",
    blurb: "Search, workflows, notifications and product management for an e-commerce platform.",
    bullets: [
      "Improved search, workflows and notifications using Meilisearch, Ragic DB and Twilio, plus product-management features with secure OAuth2 authentication.",
      "Created background jobs that fetch data from third-party suppliers and automatically update product information.",
      "Implemented PostgreSQL queries to retrieve and display all screen-listing data.",
    ],
    tags: ["Meilisearch", "Ragic DB", "Twilio", "OAuth2", "PostgreSQL"],
    skin: "surface",
  },
  {
    id: "remodely",
    index: "02",
    name: "Remodely",
    initial: "R",
    href: "https://remodely.com",
    domain: "remodely.com",
    period: "Oct 2024 – Dec 2025",
    blurb: "Service booking and dashboard modules, plus a flow to design bathrooms and interiors.",
    bullets: [
      "Built the service booking and dashboard modules.",
      "Created a flow to design bathrooms and interiors.",
    ],
    tags: ["Booking", "Dashboards", "Design flow"],
    skin: "tangerine",
  },
  {
    id: "servicepoints",
    index: "03",
    name: "Service Points",
    initial: "S",
    href: "https://app.servicepoints.nl",
    domain: "app.servicepoints.nl",
    period: "Oct 2023 – Oct 2024",
    blurb: "Chatbot flows, real-time chat and performance charts.",
    bullets: [
      "Built and integrated chatbot functionality, including custom conversational flows using prompt engineering.",
      "Developed and enhanced real-time chat features using WebSockets and CKEditor in Node.js.",
      "Resolved multiple front-end design and UI issues to enhance visual consistency and usability.",
      "Developed performance charts showing 7-day page-load trends by retrieving response times with automated cURL-based requests.",
    ],
    tags: ["Node.js", "WebSockets", "CKEditor", "Prompt engineering", "cURL"],
    skin: "mint",
  },
];

export interface Education {
  id: string;
  school: string;
  degree: string;
  field: string;
  score: string;
  /** numeric percentage for the hairline, exactly as printed on the resume */
  scoreValue: number;
  period: string;
}

export const education: Education[] = [
  {
    id: "piet",
    school: "Panipat Institute of Engineering and Technology",
    degree: "Bachelor of Technology",
    field: "Computer Science",
    score: "67.4%",
    scoreValue: 67.4,
    period: "Jul 2019 – Jun 2023",
  },
  {
    id: "hvp",
    school: "Hindu Vidya Peeth",
    degree: "12th",
    field: "Science",
    score: "64%",
    scoreValue: 64,
    period: "Mar 2018 – Mar 2019",
  },
];

export const facts = [
  { label: "Experience", value: "3 years" },
  { label: "Based in", value: "Gurugram, India" },
  { label: "Degree", value: "B.Tech, Computer Science" },
  { label: "Now", value: "Software Engineer, Ethara AI" },
] as const;

export const stats = [
  { value: 3, suffix: " yrs", label: "Hands-on experience" },
  { value: 2, suffix: "", label: "Companies", caption: "Ethara AI · Mind2web LLP" },
  { value: 3, suffix: "", label: "Products", caption: "Yot Ecommerce · Remodely · Service Points" },
] as const;

export interface SectionMeta {
  id: string;
  index: string;
  label: string;
  /** Contrast-word title: light part (weight 200) + bold part (weight 800). */
  title: [string, string];
  annotation?: string;
}

export const sections: SectionMeta[] = [
  { id: "about", index: "01", label: "About", title: ["Full stack", "by trade."] },
  { id: "experience", index: "02", label: "Experience", title: ["Where I have", "shipped."], annotation: "2 roles · 2023 — present" },
  { id: "projects", index: "03", label: "Projects", title: ["Selected", "work."], annotation: "3 products · 2023 — 2025" },
  { id: "stack", index: "04", label: "Stack", title: ["Tools I", "reach for."], annotation: "17 tools · 5 layers" },
  { id: "education", index: "05", label: "Education", title: ["Where it", "started."] },
  { id: "contact", index: "06", label: "Contact", title: ["Let's build", "something."] },
];

export const sectionMeta = Object.fromEntries(sections.map((s) => [s.id, s])) as Record<string, SectionMeta>;

/** Desktop top-nav links. */
export const navLinks = [
  { id: "about", label: "About" },
  { id: "experience", label: "Experience" },
  { id: "projects", label: "Projects" },
  { id: "stack", label: "Stack" },
  { id: "contact", label: "Contact" },
] as const;

/** Mobile bottom tab bar (5 items, thumb reach). */
export const tabs = [
  { id: "top", label: "Home", icon: "home" },
  { id: "about", label: "About", icon: "user" },
  { id: "experience", label: "Exp.", icon: "briefcase" },
  { id: "projects", label: "Projects", icon: "layers" },
  { id: "contact", label: "Contact", icon: "mail" },
] as const;

/** Sections that have no tab map to the nearest one. */
export const tabForSection: Record<string, string> = {
  top: "top",
  about: "about",
  experience: "experience",
  projects: "projects",
  stack: "projects",
  education: "contact",
  contact: "contact",
};

/** The slab colour ramp shared by the hero tower, skills rows, monogram ring, progress bar and favicon. */
export const ramp = {
  tangerine: "#FF6B2C",
  amber: "#FFB86B",
  mint: "#7EF2C5",
} as const;
