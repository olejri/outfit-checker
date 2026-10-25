import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="mb-1 text-3xl font-bold tracking-tight">Outfit Checker</h1>
      <p className="mb-8 text-muted">Sign in to your wardrobe.</p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
