import Link from "next/link";

import { getAuthConfigurationStatus } from "@/auth/config";
import { LoginForm } from "@/app/login/login-form";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const status = getAuthConfigurationStatus();
  const nextPath = safeNextPath(firstValue(params.next));

  return (
    <main style={shellStyle}>
      <section aria-labelledby="login-title" style={cardStyle}>
        <div>
          <p className="text-accent" style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 750, letterSpacing: ".08em", textTransform: "uppercase" }}>
            Mosaïque
          </p>
          <h1 id="login-title" style={{ margin: 0, fontSize: "clamp(1.7rem, 5vw, 2.2rem)", lineHeight: 1.1 }}>
            Accès administrateur
          </h1>
          <p className="text-muted" style={{ margin: "12px 0 0", lineHeight: 1.55 }}>
            La bibliothèque est publique. Saisissez le mot de passe uniquement
            pour importer ou administrer les publications.
          </p>
        </div>

        {status === "disabled" ? (
          <div role="status" style={noticeStyle}>
            <strong>Authentification désactivée en développement.</strong>
            <span>Le bypass explicite <code>AUTH_DISABLED=true</code> est actif.</span>
            <Link className="button button-primary" href={nextPath}>Ouvrir la bibliothèque</Link>
          </div>
        ) : status === "missing" ? (
          <div role="alert" style={{ ...noticeStyle, background: "var(--danger-soft)", color: "var(--danger)" }}>
            <strong>Authentification indisponible.</strong>
            <span>Configurez les variables serveur requises avant de continuer.</span>
          </div>
        ) : (
          <LoginForm nextPath={nextPath} />
        )}
      </section>
    </main>
  );
}

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function safeNextPath(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

const shellStyle = {
  minHeight: "100dvh",
  display: "grid",
  placeItems: "center",
  padding: 20,
  background: "var(--background)",
} as const;
const cardStyle = {
  width: "min(100%, 440px)",
  display: "grid",
  gap: 28,
  border: "1px solid var(--line)",
  borderRadius: 18,
  background: "var(--surface)",
  boxShadow: "var(--shadow)",
  padding: "clamp(24px, 6vw, 36px)",
} as const;

const noticeStyle = {
  display: "grid",
  gap: 12,
  borderRadius: 12,
  background: "var(--accent-soft)",
  color: "var(--text)",
  padding: 16,
  fontSize: 14,
  lineHeight: 1.5,
} as const;
