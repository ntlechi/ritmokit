"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";

export function LogoutButton({ label }: { label: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      await logoutAction();
      router.push("/");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      data-interactive
      disabled={isPending}
      onClick={handleLogout}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-40"
    >
      <LogOut className="h-4 w-4" aria-hidden />
    </button>
  );
}
