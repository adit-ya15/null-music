function buildError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getSupabaseAuthConfig() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const apiKey = String(
    process.env.SUPABASE_ANON_KEY
    || process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || ""
  ).trim();
  const emailRedirectTo = String(process.env.SUPABASE_EMAIL_REDIRECT_TO || "").trim();

  if (!url || !apiKey) {
    throw buildError("Supabase email OTP is not configured on the server.", 501);
  }

  return { url, apiKey, emailRedirectTo };
}

async function callSupabaseAuth(path, payload) {
  const { url, apiKey } = getSupabaseAuthConfig();
  const response = await fetch(`${url}/auth/v1${path}`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw buildError(data?.msg || data?.error_description || data?.message || "Supabase email OTP failed.", response.status);
  }

  return data;
}

export async function sendEmailOtp(email, options = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw buildError("Enter a valid email address.", 400);
  }

  const { emailRedirectTo } = getSupabaseAuthConfig();
  await callSupabaseAuth("/otp", {
    email: normalizedEmail,
    create_user: true,
    data: options?.name ? { name: String(options.name).trim().slice(0, 80) } : undefined,
    ...(emailRedirectTo ? { email_redirect_to: emailRedirectTo } : {}),
  });

  return {
    email: normalizedEmail,
    status: "pending",
  };
}

export async function verifyEmailOtpCode(email, code) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = String(code || "").trim();

  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw buildError("Enter a valid email address.", 400);
  }

  if (!/^\d{4,10}$/.test(normalizedCode)) {
    throw buildError("Enter a valid OTP code.", 400);
  }

  const data = await callSupabaseAuth("/verify", {
    email: normalizedEmail,
    token: normalizedCode,
    type: "email",
  });

  const user = data?.user || {};
  return {
    email: normalizeEmail(user?.email || normalizedEmail),
    name: String(user?.user_metadata?.name || user?.email?.split?.("@")?.[0] || "").trim(),
    status: "verified",
  };
}
