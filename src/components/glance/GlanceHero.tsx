import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Dumbbell, Globe, Mail, MapPin, Phone } from "lucide-react";
import { FaInstagram, FaTelegram, FaWhatsapp } from "react-icons/fa";
import { SiTradingview } from "react-icons/si";
import { Button } from "@/components/ui/Button";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";
import { personal } from "@/data/personal";
import { stats } from "@/data/stats";
import {
  formatExperienceDuration,
  getExperienceDuration,
} from "@/lib/experience";
import { useTheme } from "@/hooks/useTheme";
import profileImgDark from "@/assets/images/profile.jpg";
import profileImgLight from "@/assets/images/profile_light.png";
import profileImgGold from "@/assets/images/profile_gold.jpg";

export function GlanceHero() {
  const { theme } = useTheme();
  const profileImg =
    theme === "light"
      ? profileImgLight
      : theme === "royal"
        ? profileImgGold
        : profileImgDark;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.15fr_auto_0.85fr] lg:items-center lg:gap-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <p className="text-sm font-medium text-accent">Hello, I'm</p>
        <h1 className="mt-1 text-balance font-display text-4xl font-semibold leading-[1.1] tracking-tight text-text sm:text-5xl">
          {personal.firstName}{" "}
          <span className="text-gradient-accent">Sakthivel</span>
        </h1>
        <p className="mt-2 text-sm font-medium text-text-secondary sm:text-base">
          {personal.title}
        </p>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-text-secondary">
          {formatExperienceDuration(getExperienceDuration())} of experience
          building scalable full-stack applications, leading high-performing
          teams, and delivering intelligent solutions with AI, cloud, and modern
          technologies.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-text-secondary">
          <a
            href={`tel:${personal.phone}`}
            className="flex items-center gap-2 transition-colors hover:text-accent"
          >
            <Phone className="h-4 w-4 text-accent" />
            {personal.phone}
          </a>
          <a
            href={`mailto:${personal.email}`}
            className="flex items-center gap-2 transition-colors hover:text-accent"
          >
            <Mail className="h-4 w-4 text-accent" />
            {personal.email}
          </a>
          <a
            href={personal.links.whatsapp}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 transition-colors hover:text-accent"
          >
            <FaWhatsapp className="h-4 w-4 text-accent" />
            WhatsApp
          </a>
          <a
            href={personal.links.telegram}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 transition-colors hover:text-accent"
          >
            <FaTelegram className="h-4 w-4 text-accent" />
            Telegram
          </a>
          <a
            href={personal.links.instagram}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 transition-colors hover:text-accent"
          >
            <FaInstagram className="h-4 w-4 text-accent" />
            Instagram
          </a>
          <a
            href={personal.links.tradingview}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 transition-colors hover:text-accent"
          >
            <SiTradingview className="h-4 w-4 text-accent" />
            TradingView
          </a>
          <a
            href={personal.links.cultfit}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 transition-colors hover:text-accent"
          >
            <Dumbbell className="h-4 w-4 text-accent" />
            Cult.fit
          </a>
          <span className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-accent" />
            {personal.location}
          </span>
          <a
            href={personal.links.studio}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 transition-colors hover:text-accent"
          >
            <Globe className="h-4 w-4 text-accent" />
            studio.techiemyil.com
          </a>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            onClick={() => window.open(`mailto:${personal.email}`)}
          >
            Let's Connect
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Link to="/#projects">
            <Button size="sm" variant="secondary">
              View My Work
            </Button>
          </Link>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="relative mx-auto h-40 w-40 shrink-0 overflow-hidden rounded-[28px] border border-surface-10 bg-card/60 p-1.5 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.5)] sm:h-48 sm:w-48"
      >
        <img
          src={profileImg}
          alt={`Portrait of ${personal.name}`}
          className="h-full w-full rounded-[22px] object-cover"
          loading="eager"
          width={192}
          height={192}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="grid grid-cols-2 gap-3"
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="h-full rounded-2xl border border-border bg-card/50 p-4"
          >
            <stat.icon className="mb-2 h-4 w-4 text-accent" />
            <div className="font-display text-xl font-semibold text-text">
              <AnimatedCounter value={stat.value} suffix={stat.suffix} />
            </div>
            <div className="mt-0.5 text-xs text-text-secondary">
              {stat.label}
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
