// Better-auth integration for export-runtime
// This module provides authentication via better-auth with D1 storage

let betterAuthModule = null;

// Lazy load better-auth (optional peer dependency)
const loadBetterAuth = async () => {
  if (betterAuthModule) return betterAuthModule;
  try {
    betterAuthModule = await import("better-auth");
    return betterAuthModule;
  } catch {
    return null;
  }
};

// Create auth instance for a request
export const createAuth = async (env, authConfig) => {
  const { betterAuth } = await loadBetterAuth() || {};
  if (!betterAuth) {
    console.warn("[export-runtime] better-auth not installed. Run: npm install better-auth");
    return null;
  }

  const { database, providers = {}, ...restConfig } = authConfig;
  const dbBinding = database || "AUTH_DB";
  const db = env[dbBinding];

  if (!db) {
    console.warn(`[export-runtime] D1 binding "${dbBinding}" not found for auth`);
    return null;
  }

  // Build social providers config
  const socialProviders = {};

  if (providers.google) {
    socialProviders.google = {
      clientId: providers.google.clientId || env.GOOGLE_CLIENT_ID,
      clientSecret: providers.google.clientSecret || env.GOOGLE_CLIENT_SECRET,
    };
  }

  if (providers.github) {
    socialProviders.github = {
      clientId: providers.github.clientId || env.GITHUB_CLIENT_ID,
      clientSecret: providers.github.clientSecret || env.GITHUB_CLIENT_SECRET,
    };
  }

  if (providers.discord) {
    socialProviders.discord = {
      clientId: providers.discord.clientId || env.DISCORD_CLIENT_ID,
      clientSecret: providers.discord.clientSecret || env.DISCORD_CLIENT_SECRET,
    };
  }

  // Initialize better-auth
  const auth = betterAuth({
    database: {
      provider: "sqlite",
      url: db, // D1 is SQLite-compatible
    },
    secret: env.BETTER_AUTH_SECRET || env.AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
    },
    socialProviders,
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // Refresh after 1 day
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 minutes
      },
    },
    ...restConfig,
  });

  return auth;
};

// Handle auth HTTP routes
export const handleAuthRoute = async (request, env, authConfig) => {
  const auth = await createAuth(env, authConfig);
  if (!auth) {
    return new Response(JSON.stringify({ error: "Auth not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Let better-auth handle the request
  return auth.handler(request);
};

// Get session from request headers (for WebSocket auth)
export const getSessionFromRequest = async (request, env, authConfig) => {
  const auth = await createAuth(env, authConfig);
  if (!auth) return null;

  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    return session;
  } catch {
    return null;
  }
};

// Verify session token (for WebSocket messages)
export const verifySession = async (token, env, authConfig) => {
  const auth = await createAuth(env, authConfig);
  if (!auth) return null;

  try {
    // Create a mock request with the session cookie
    const mockHeaders = new Headers();
    mockHeaders.set("Cookie", `better-auth.session_token=${token}`);

    const session = await auth.api.getSession({
      headers: mockHeaders,
    });
    return session;
  } catch {
    return null;
  }
};
