"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Settings, ShieldCheck, User as UserIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { signOut } from "@/actions/auth/sign-out";

export function UserMenu({
  name,
  email,
  image,
  tenantSlug,
  isPlatformAdmin,
}: {
  name: string;
  email: string;
  image: string | null;
  tenantSlug: string;
  isPlatformAdmin: boolean;
}) {
  const router = useRouter();
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button type="button" className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
        }
      >
        <Avatar className="size-8">
          {image && <AvatarImage src={image} alt={name} />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={`/app/${tenantSlug}/configuracoes/perfil`} />}>
          <UserIcon className="size-4" />
          Meu perfil
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={`/app/${tenantSlug}/configuracoes/seguranca`} />}>
          <Settings className="size-4" />
          Segurança
        </DropdownMenuItem>
        {isPlatformAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/admin" />}>
              <ShieldCheck className="size-4" />
              Administração do sistema
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
          <LogOut className="size-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
