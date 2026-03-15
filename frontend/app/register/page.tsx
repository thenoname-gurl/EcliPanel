"use client"

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { API_ENDPOINTS } from "@/lib/panel-config";
import { COUNTRIES } from "@/lib/countries";
import { apiFetch } from "@/lib/api-client";
import { AlertTriangle, Info } from "lucide-react";

export default function RegisterPage() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    address: "",
    address2: "",
    billingCompany: "",
    billingCity: "",
    billingState: "",
    billingZip: "",
    billingCountry: "",
    middleName: "",
    phone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [panelSettings, setPanelSettings] = useState<{ registrationEnabled: boolean; registrationNotice: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    apiFetch(API_ENDPOINTS.panelSettings)
      .then((data) => setPanelSettings(data))
      .catch(() => setPanelSettings({ registrationEnabled: true, registrationNotice: "" }));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch(API_ENDPOINTS.userRegister, {
        method: "POST",
        body: JSON.stringify(form),
      });
      router.push("/login");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const registrationDisabled = panelSettings !== null && !panelSettings.registrationEnabled;
  const notice = panelSettings?.registrationNotice || "";

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-8">
        <h2 className="mb-6 text-center text-2xl font-semibold text-foreground">
          Create an account
        </h2>
        {/* Panel notice — shown even when registration is open */}
        {notice && !registrationDisabled && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
            <p className="text-sm text-blue-300">{notice}</p>
          </div>
        )}
        {/* Registration disabled banner */}
        {registrationDisabled && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
            <div>
              <p className="text-sm font-semibold text-yellow-300">Registration is currently unavailable</p>
              {notice && <p className="mt-1 text-sm text-yellow-200/80">{notice}</p>}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {registrationDisabled ? (
          <div className="mt-2 text-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <a href="/login" className="text-primary underline hover:text-primary/80">Sign in</a>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input
              name="firstName"
              type="text"
              placeholder="First Name *"
              value={form.firstName}
              onChange={handleChange}
              required
              aria-required="true"
              className="col-span-full rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <input
              name="lastName"
              type="text"
              placeholder="Last Name *"
              value={form.lastName}
              onChange={handleChange}
              required
              aria-required="true"
              className="col-span-full rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <input
              name="email"
              type="email"
              placeholder="Email *"
              value={form.email}
              onChange={handleChange}
              required
              aria-required="true"
              className="rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <input
              name="password"
              type="password"
              placeholder="Password *"
              value={form.password}
              onChange={handleChange}
              required
              aria-required="true"
              className="rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <input
              name="address"
              type="text"
              placeholder="Street Address *"
              value={form.address}
              onChange={handleChange}
              required
              aria-required="true"
              className="col-span-full rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <input
              name="address2"
              type="text"
              placeholder="Address Line 2 (optional)"
              value={form.address2}
              onChange={handleChange}
              className="col-span-full rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <input
              name="billingCompany"
              type="text"
              placeholder="Company (optional)"
              value={form.billingCompany}
              onChange={handleChange}
              className="col-span-full rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <input
              name="billingCity"
              type="text"
              placeholder="City *"
              value={form.billingCity}
              onChange={handleChange}
              required
              aria-required="true"
              className="col-span-full rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <input
              name="billingState"
              type="text"
              placeholder="State / Province *"
              value={form.billingState}
              onChange={handleChange}
              required
              aria-required="true"
              className="col-span-full rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <input
              name="billingZip"
              type="text"
              placeholder="ZIP / Postal Code *"
              value={form.billingZip}
              onChange={handleChange}
              required
              aria-required="true"
              className="col-span-full rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <select
              name="billingCountry"
              value={form.billingCountry}
              onChange={handleChange}
              required
            >
              <option value="">Country *</option>
              {COUNTRIES.map((country) => (
                <option key={country.code} value={country.name}>
                  {country.name}
                </option>
              ))}
            </select>
            <input
              name="phone"
              type="tel"
              placeholder="Phone *"
              value={form.phone}
              onChange={handleChange}
              required
              aria-required="true"
              className="col-span-full rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <p className="col-span-full text-xs text-muted-foreground">Fields marked <span className="text-destructive">*</span> are required.</p>
            <p className="col-span-full text-xs text-muted-foreground">
              By signing in you agree to the{" "}
              <a
                href="https://ecli.app/documents/Terms%20of%20Service.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                Terms of Service
              </a>
              {" "}and <a
                href="https://ecli.app/documents/Privacy%20Policy.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                Privacy Policy
              </a>.
            </p>
            <div className="col-span-full flex items-center justify-between">
              <a href="/login" className="text-xs text-muted-foreground underline hover:text-foreground">
                Already have an account?
              </a>
              <button
                type="submit"
                disabled={loading}
                className="mt-2 rounded bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "Creating..." : "Sign Up"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
