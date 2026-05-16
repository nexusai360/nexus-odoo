"use client";

import { motion } from "framer-motion";
import { ShieldCheck, Users as UsersIcon } from "lucide-react";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { AuthUser } from "@/lib/auth-helpers";

import { AuditsTable } from "./audits-table";
import { UsersContent } from "./users-content";

interface UsersTabsProps {
  currentUser: AuthUser;
}

export function UsersTabs({ currentUser }: UsersTabsProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      <Tabs defaultValue="users" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="users">
            <UsersIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="audits">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Auditoria
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <UsersContent currentUser={currentUser} />
        </TabsContent>

        <TabsContent value="audits">
          <AuditsTable />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

export default UsersTabs;
