/**
 * Base44 Client for Chrome Extension
 * Lightweight wrapper around the Base44 REST API
 */
const Base44Client = (() => {
  // Configuration - update this after deploying your Base44 project
  const CONFIG = {
    // Replace with your Base44 app URL after running `base44 deploy`
    API_BASE: "https://app.base44.com/api/v1",
    APP_ID: "", // Will be set from storage
  };

  let authToken = null;

  /**
   * Initialize the client with stored credentials
   */
  async function init() {
    const stored = await chrome.storage.local.get(["base44_token", "base44_app_id"]);
    if (stored.base44_token) {
      authToken = stored.base44_token;
    }
    if (stored.base44_app_id) {
      CONFIG.APP_ID = stored.base44_app_id;
    }
    return !!authToken;
  }

  /**
   * Set the Base44 app ID
   */
  async function setAppId(appId) {
    CONFIG.APP_ID = appId;
    await chrome.storage.local.set({ base44_app_id: appId });
  }

  /**
   * Make an authenticated API request
   */
  async function apiRequest(endpoint, options = {}) {
    const url = `${CONFIG.API_BASE}/apps/${CONFIG.APP_ID}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || error.error || `API Error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Authentication
   */
  const auth = {
    async login(email, password) {
      const response = await fetch(`${CONFIG.API_BASE}/apps/${CONFIG.APP_ID}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Login failed");
      }

      const data = await response.json();
      authToken = data.token;
      await chrome.storage.local.set({ base44_token: authToken });
      return data;
    },

    async me() {
      return apiRequest("/auth/me");
    },

    async logout() {
      authToken = null;
      await chrome.storage.local.remove(["base44_token"]);
    },

    isAuthenticated() {
      return !!authToken;
    },
  };

  /**
   * Entity operations factory
   */
  function entityOps(entityName) {
    const base = `/entities/${entityName}`;

    return {
      async create(data) {
        return apiRequest(base, {
          method: "POST",
          body: JSON.stringify(data),
        });
      },

      async get(id) {
        return apiRequest(`${base}/${id}`);
      },

      async list(params = {}) {
        const query = new URLSearchParams();
        if (params.limit) query.set("limit", params.limit);
        if (params.skip) query.set("skip", params.skip);
        if (params.sort) query.set("sort", params.sort);
        if (params.fields) query.set("fields", params.fields.join(","));
        const qs = query.toString();
        return apiRequest(`${base}${qs ? "?" + qs : ""}`);
      },

      async filter(conditions, params = {}) {
        return apiRequest(`${base}/filter`, {
          method: "POST",
          body: JSON.stringify({ filter: conditions, ...params }),
        });
      },

      async update(id, data) {
        return apiRequest(`${base}/${id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        });
      },

      async delete(id) {
        return apiRequest(`${base}/${id}`, {
          method: "DELETE",
        });
      },
    };
  }

  /**
   * Functions invocation
   */
  const functions = {
    async invoke(functionName, data = {}) {
      return apiRequest(`/functions/${functionName}`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
  };

  /**
   * Entities proxy
   */
  const entities = new Proxy(
    {},
    {
      get(target, name) {
        if (!target[name]) {
          target[name] = entityOps(name);
        }
        return target[name];
      },
    }
  );

  return {
    init,
    setAppId,
    auth,
    entities,
    functions,
  };
})();

// Make available globally
if (typeof window !== "undefined") {
  window.Base44Client = Base44Client;
}
