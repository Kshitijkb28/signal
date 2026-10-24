import { Hero } from "@/components/hero/Hero";
import { About } from "@/components/sections/About";
import { Experience } from "@/components/sections/Experience";
import { Projects } from "@/components/sections/Projects";
import { Stack } from "@/components/sections/Stack";
import { Education } from "@/components/sections/Education";
import { Contact } from "@/components/sections/Contact";
import { Footer } from "@/components/sections/Footer";
import { Gap } from "@/components/ui/Gap";
import { interludeFor } from "@/data/derived";

export default function Page() {
  return (
    <main id="content">
      <Hero />
      <Gap {...interludeFor("about")} />
      <About />
      <Gap {...interludeFor("experience")} />
      <Experience />
      <Gap {...interludeFor("projects")} />
      <Projects />
      <Gap {...interludeFor("stack")} />
      <Stack />
      <Gap {...interludeFor("education")} />
      <Education />
      <Gap {...interludeFor("contact")} />
      <Contact />
      <Footer />
    </main>
  );
}
