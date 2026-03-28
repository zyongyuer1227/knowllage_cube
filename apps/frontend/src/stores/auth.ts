import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api, type LoginPayload, UNAUTHORIZED_EVENT } from "../lib/api";

const TOKEN_KEY = "kc_admin_token";

export const useAuthStore = defineStore("auth", () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const username = ref<string>("admin");
  const loading = ref(false);
  let unauthorizedListenerBound = false;

  const isLoggedIn = computed(() => Boolean(token.value));

  async function login(payload: LoginPayload) {
    loading.value = true;
    try {
      const result = await api.login(payload);
      token.value = result.token;
      username.value = result.user.username;
      localStorage.setItem(TOKEN_KEY, result.token);
    } finally {
      loading.value = false;
    }
  }

  function logout() {
    token.value = null;
    localStorage.removeItem(TOKEN_KEY);
  }

  if (!unauthorizedListenerBound && typeof window !== "undefined") {
    window.addEventListener(UNAUTHORIZED_EVENT, () => {
      logout();
    });
    unauthorizedListenerBound = true;
  }

  return {
    token,
    username,
    loading,
    isLoggedIn,
    login,
    logout
  };
});
