import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins/organization";
import { admin } from "better-auth/plugins/admin";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db/prisma";
import { mailer } from "@/lib/notifications/mailer";
import { resetPasswordTemplate } from "@/lib/notifications/templates/reset-password";

// Better Auth owns identity, sessions, organizations (= our tenants) and
// memberships. It only stores a free-form role string per member — the
// granular, per-tenant-customizable RBAC (Role/Permission/RolePermission)
// is modeled ourselves in Prisma and resolved from that role string, so we
// deliberately do not configure Better Auth's own access-control statements
// here (see lib/rbac).
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    // We ignore Better Auth's own `url` (it targets a generic internal
    // path) and build our own — the dedicated /redefinir-senha/[token]
    // page owns the "type a new password" UI.
    sendResetPassword: async ({ user, token }) => {
      const url = `${process.env.NEXT_PUBLIC_APP_URL}/redefinir-senha/${token}`;
      await mailer.send(
        resetPasswordTemplate({ to: user.email, userName: user.name, url })
      );
    },
  },
  plugins: [
    organization({
      // Membership creation on signup, invitations, and role assignment are
      // driven by our own onboarding/invitation services, not by letting
      // members self-serve org creation.
      allowUserToCreateOrganization: true,
      schema: {
        organization: {
          additionalFields: {
            // Editable by the tenant itself (Minha Empresa / branding).
            primaryColor: { type: "string", required: false },
            // Only ever changed by platform-admin actions (suspend/cancel),
            // never through the public organization.update API.
            status: {
              type: "string",
              required: false,
              input: false,
              defaultValue: "ACTIVE",
            },
          },
        },
      },
    }),
    admin(),
    nextCookies(),
  ],
});
