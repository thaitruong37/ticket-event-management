import { redirect } from "next/navigation";

import { getCurrentSession } from "../../server/auth";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

function safeNext(value: string | undefined): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (await getCurrentSession()) redirect("/");

  const query = await searchParams;
  const message =
    query.error === "rate_limited"
      ? "Too many sign-in attempts. Wait a few minutes and try again."
      : query.error
        ? "Email or password is incorrect."
        : null;

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f5f5f5" }}>
      <section
        aria-labelledby="login-title"
        style={{ width: "100%", maxWidth: 420, padding: 32, borderRadius: 12, background: "white", boxShadow: "0 12px 40px rgb(0 0 0 / 10%)" }}
      >
        <h1 id="login-title" style={{ margin: "0 0 8px", fontSize: 28 }}>Ticket Operations</h1>
        <p style={{ margin: "0 0 24px", color: "#595959" }}>Sign in with the staff account created by your administrator.</p>
        {message ? (
          <p role="alert" style={{ padding: 12, borderRadius: 8, color: "#a8071a", background: "#fff1f0" }}>{message}</p>
        ) : null}
        <form action="/api/auth/login" method="post" style={{ display: "grid", gap: 16 }}>
          <input type="hidden" name="next" value={safeNext(query.next)} />
          <label style={{ display: "grid", gap: 6 }}>
            <span>Email</span>
            <input
              required
              autoComplete="username"
              inputMode="email"
              type="email"
              name="email"
              maxLength={320}
              style={{ minHeight: 42, padding: "8px 10px", border: "1px solid #d9d9d9", borderRadius: 6, font: "inherit" }}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Password</span>
            <input
              required
              autoComplete="current-password"
              type="password"
              name="password"
              maxLength={256}
              style={{ minHeight: 42, padding: "8px 10px", border: "1px solid #d9d9d9", borderRadius: 6, font: "inherit" }}
            />
          </label>
          <button type="submit" style={{ minHeight: 44, border: 0, borderRadius: 6, background: "#1677ff", color: "white", font: "inherit", fontWeight: 600, cursor: "pointer" }}>
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
