"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type LoginFormProps = {
  nextPath: string;
};

export function LoginForm({ nextPath }: LoginFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: formData.get("password"),
        }),
      });

      if (!response.ok) {
        setError(response.status === 503
          ? "L’authentification n’est pas configurée."
          : "Mot de passe incorrect.");
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("Connexion impossible pour le moment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "grid", gap: 7 }}>
        <label htmlFor="password" style={{ fontSize: 14, fontWeight: 650 }}>Mot de passe</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          maxLength={1024}
          style={inputStyle}
        />
      </div>
      {error ? (
        <p role="alert" style={{ margin: 0, color: "var(--danger)", fontSize: 14 }}>{error}</p>
      ) : null}
      <button className="button button-primary" type="submit" disabled={pending} style={{ width: "100%" }}>
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}

const inputStyle = {
  width: "100%",
  minHeight: 44,
  border: "1px solid var(--line)",
  borderRadius: 10,
  background: "var(--surface-subtle)",
  color: "var(--text)",
  padding: "0 12px",
} as const;
