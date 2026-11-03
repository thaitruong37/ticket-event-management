import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type InvitePageProps = {
  searchParams: Promise<{ token?: string; error?: string }>;
};

export default async function AcceptInvitePage({ searchParams }: InvitePageProps) {
  const query = await searchParams;
  const token = query.token?.trim() ?? "";
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f5f5f5" }}>
      <section style={{ width: "100%", maxWidth: 440, padding: 32, borderRadius: 12, background: "white", boxShadow: "0 12px 40px rgb(0 0 0 / 10%)" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 28 }}>Accept staff invitation</h1>
        <p style={{ margin: "0 0 24px", color: "#595959" }}>Create a password for your staff account.</p>
        {query.error ? <p role="alert" style={{ color: "#a8071a" }}>This invitation is invalid, expired, or already used.</p> : null}
        {!token ? (
          <p role="alert" style={{ color: "#a8071a" }}>The invitation token is missing.</p>
        ) : (
          <form action="/api/auth/accept-invite" method="post" style={{ display: "grid", gap: 16 }}>
            <input type="hidden" name="token" value={token} />
            <label style={{ display: "grid", gap: 6 }}>
              <span>Display name</span>
              <input required autoComplete="name" name="displayName" maxLength={160} style={{ minHeight: 42, padding: 10 }} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Password (at least 12 characters)</span>
              <input required autoComplete="new-password" type="password" name="password" minLength={12} maxLength={256} style={{ minHeight: 42, padding: 10 }} />
            </label>
            <button type="submit" style={{ minHeight: 44, border: 0, borderRadius: 6, background: "#1677ff", color: "white", font: "inherit", fontWeight: 600 }}>
              Create account
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
