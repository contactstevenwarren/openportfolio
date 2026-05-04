"use client";

import * as React from "react";

import { api } from "@/app/lib/api";
import { Button } from "@/app/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/app/components/ui/alert-dialog";

export default function SettingsPage() {
  const [resetting, setResetting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleReset = async () => {
    setResetting(true);
    setError(null);
    try {
      await api.reset();
      // Hard-navigate to flush the SWR cache — client-side push would serve
      // stale cached data on the home page components before revalidation.
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setResetting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-8 px-4 py-6 lg:px-6">
      <header className="flex flex-col gap-1">
        <p className="text-label uppercase tracking-wide text-muted-foreground">
          Settings
        </p>
        <h1 className="text-h2">Settings</h1>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-h3">Danger zone</h2>

        <div className="rounded-lg border border-destructive/20 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-body-sm font-medium">
                Clean up account and start over
              </p>
              <p className="text-body-sm text-muted-foreground">
                Removes all accounts, positions, and targets. This cannot be
                undone.
              </p>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={resetting}>
                  {resetting ? "Deleting…" : "Clean up"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all accounts, positions, and
                    targets. You&apos;ll start with a blank slate. This cannot
                    be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={handleReset}
                  >
                    Delete everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {error && (
            <p className="mt-4 text-body-sm rounded-md bg-destructive-soft px-3 py-2 text-destructive">
              {error}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
