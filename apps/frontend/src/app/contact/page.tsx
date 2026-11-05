import type { Metadata } from "next";
import Link from "next/link";
import { Github, Globe, Linkedin, Mail, MapPin, Twitter } from "lucide-react";
import { LandingSubpage } from "@/components/landing/LandingSubpage";

export const metadata: Metadata = { title: "Contact | Wall-E Arena" };

const CARDS = [
  {
    icon: Mail,
    title: "Email Us",
    subtitle: "Send us an email anytime",
    body: (
      <a href="mailto:walleevents@gmail.com" className="text-accent-pink-500 hover:underline">
        walleevents@gmail.com
      </a>
    ),
  },
  {
    icon: MapPin,
    title: "Visit Us",
    subtitle: "Our office location",
    body: (
      <p className="text-accent-pink-500">
        Mumbai, Maharashtra
        <br />
        India
      </p>
    ),
  },
  {
    icon: Globe,
    title: "Call Us",
    subtitle: "Reach us by phone",
    body: (
      <a href="tel:+919137055633" className="text-accent-pink-500 hover:underline">
        +91 91370 55633
      </a>
    ),
  },
];

const SOCIALS = [
  { href: "https://twitter.com/wallearena", icon: Twitter, label: "Twitter" },
  { href: "https://github.com/wallearena", icon: Github, label: "GitHub" },
  { href: "https://linkedin.com/company/wallearena", icon: Linkedin, label: "LinkedIn" },
];

export default function ContactPage() {
  return (
    <LandingSubpage>
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h1 className="font-heading text-5xl md:text-6xl font-bold mb-6">
            Get in <span className="gradient-text">Touch</span>
          </h1>
          <p className="text-text-muted text-xl max-w-2xl mx-auto">
            Have questions about our tournaments? We&apos;d love to hear from you.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {CARDS.map((card) => (
            <div
              key={card.title}
              className="bg-bg-elevated rounded-3xl p-8 border border-border-subtle text-center hover:scale-105 transition-transform duration-300"
            >
              <div className="bg-accent-pink-tonal w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <card.icon className="w-8 h-8 text-accent-pink-500" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{card.title}</h3>
              <p className="text-text-muted mb-4">{card.subtitle}</p>
              {card.body}
            </div>
          ))}
        </div>

        <div className="bg-bg-elevated rounded-3xl p-12 border border-border-subtle">
          <div className="text-center mb-8">
            <h2 className="font-heading text-3xl font-bold mb-4">Follow Us</h2>
            <p className="text-text-muted text-lg">
              Stay updated with the latest tournaments and gaming news
            </p>
          </div>
          <div className="flex justify-center gap-6">
            {SOCIALS.map((social) => (
              <a
                key={social.href}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={social.label}
                className="bg-accent-pink-tonal hover:bg-accent-pink-tonal-hover w-16 h-16 rounded-full flex items-center justify-center transition-transform hover:scale-110"
              >
                <social.icon className="w-8 h-8 text-accent-pink-500" />
              </a>
            ))}
          </div>
        </div>

        <div className="mt-16 text-center">
          <Link
            href="/#tournaments"
            className="inline-block bg-gradient-button-primary text-text-main font-semibold px-8 py-4 rounded-2xl transition-transform hover:scale-105"
          >
            Back to Tournaments
          </Link>
        </div>
      </div>
    </LandingSubpage>
  );
}
