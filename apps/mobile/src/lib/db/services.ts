import { getSupabase } from "../supabase";

export interface Service {
  slug: string;
  name: string;
  description: string;
  features: string[];
  icon: string;
}

export const services: Service[] = [
  {
    slug: "marketing",
    name: "Digital Marketing",
    description: "Comprehensive digital marketing solutions to grow your business online",
    features: [
      "Social Media Marketing",
      "Search Engine Optimization (SEO)",
      "Pay-Per-Click Advertising",
      "Content Marketing Strategy",
      "Email Marketing Campaigns",
      "Analytics & Reporting"
    ],
    icon: "megaphone-outline",
  },
  {
    slug: "software",
    name: "Software Development",
    description: "Custom software solutions tailored to your business needs",
    features: [
      "Web Application Development",
      "Mobile App Development",
      "E-commerce Solutions",
      "API Development & Integration",
      "Database Design & Management",
      "Software Maintenance & Support"
    ],
    icon: "code-slash-outline",
  },
  {
    slug: "design",
    name: "UI/UX Design",
    description: "Beautiful and intuitive design solutions for your digital products",
    features: [
      "User Research & Analysis",
      "Wireframing & Prototyping",
      "UI Design Systems",
      "User Testing & Optimization",
      "Brand Identity Design",
      "Responsive Web Design"
    ],
    icon: "palette-outline",
  },
];