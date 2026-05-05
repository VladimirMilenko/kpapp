import { useAutoFocus } from "../hooks/useAutoFocus";

export function MissingConfig() {
  return (
    <main className="screen center-screen">
      <section className="system-panel">
        <div className="brand-mark">K</div>
        <h1>Kino.pub</h1>
        <p>The app did not receive Kino.pub OAuth credentials. Runtime defaults are embedded, so this usually means the config script was overridden with empty values.</p>
        <pre>{`window.KINO_TV_CONFIG = {
  clientId: "xbmc",
  clientSecret: "cgg3gtifu46urtfp2zp1nqtba0k2ezxh",
  preferredStream: "hls4"
};`}</pre>
      </section>
    </main>
  );
}

export function AuthScreen({ message, onConnect }: { message: string | undefined; onConnect: () => void }) {
  useAutoFocus();

  return (
    <main className="screen center-screen">
      <section className="auth-panel">
        <div className="brand-mark">K</div>
        <h1>Connect Kino.pub</h1>
        <p className="muted">{message || "Use device login to connect this TV to your account."}</p>
        <button className="primary-action" type="button" data-focusable onClick={onConnect}>
          Connect
        </button>
      </section>
    </main>
  );
}

export function PairScreen({ userCode, verificationUri, onCancel }: { userCode: string; verificationUri: string; onCancel: () => void }) {
  useAutoFocus();

  return (
    <main className="screen center-screen">
      <section className="auth-panel code-panel">
        <div className="brand-mark">K</div>
        <p className="eyebrow">Enter this code</p>
        <h1>{userCode}</h1>
        <p className="muted">{verificationUri}</p>
        <p className="muted small-note">If the code expires, this screen automatically requests a fresh one.</p>
        <div className="loader-bar" />
        <button className="secondary-action" type="button" data-focusable onClick={onCancel}>
          Cancel
        </button>
      </section>
    </main>
  );
}

export function LoadingScreen({ text }: { text: string }) {
  return (
    <main className="screen center-screen">
      <section className="system-panel loading-panel">
        <div className="brand-mark">K</div>
        <h1>{text}</h1>
        <div className="loader-bar" />
      </section>
    </main>
  );
}

export function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  useAutoFocus();

  return (
    <main className="screen center-screen">
      <section className="system-panel">
        <div className="brand-mark">K</div>
        <h1>Playback app error</h1>
        <p>{message}</p>
        <button className="primary-action" type="button" data-focusable onClick={onRetry}>
          Retry
        </button>
      </section>
    </main>
  );
}
