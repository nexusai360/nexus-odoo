"use client";

import { motion } from "framer-motion";
import { PersonalInfoCard } from "./personal-info-card";
import { EmailChangeCard } from "./email-change-card";
import { PasswordChangeCard } from "./password-change-card";
import { AppearanceCard } from "./appearance-card";
import { WhatsappCard } from "./whatsapp-card";
import { AccessCard } from "./access-card";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
};

interface ProfileContentProps {
  initialName: string;
  initialEmail: string;
  initialAvatarUrl: string | null;
  initialTheme: "dark" | "light" | "system";
  createdAt: string;
  /** Números de WhatsApp do usuário (somente leitura). */
  whatsappNumbers: string[];
  /** Domínios de negócio com acesso (somente leitura). */
  domains: string[];
}

export function ProfileContent({
  initialName,
  initialEmail,
  initialAvatarUrl,
  initialTheme,
  createdAt,
  whatsappNumbers,
  domains,
}: ProfileContentProps) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Perfil
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie suas informações pessoais
        </p>
      </motion.div>

      <motion.div variants={itemVariants}>
        <PersonalInfoCard
          initialName={initialName}
          initialAvatarUrl={initialAvatarUrl}
          createdAt={createdAt}
        />
      </motion.div>

      <motion.div variants={itemVariants}>
        <WhatsappCard numbers={whatsappNumbers} />
      </motion.div>

      <motion.div variants={itemVariants}>
        <AccessCard domains={domains} />
      </motion.div>

      <motion.div variants={itemVariants}>
        <EmailChangeCard currentEmail={initialEmail} />
      </motion.div>

      <motion.div variants={itemVariants}>
        <PasswordChangeCard />
      </motion.div>

      <motion.div variants={itemVariants}>
        <AppearanceCard initialTheme={initialTheme} />
      </motion.div>
    </motion.div>
  );
}
