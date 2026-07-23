import { apiCall } from "./client";

export interface LoginResp {
  user: string;
  api_key: string;
  api_secret: string;
  require_pin_setup: boolean;
}

export const authApi = {
  // Guest auth calls run noAuth: they must never send a (possibly stale) token,
  // which Frappe would 401 at validate_auth() before the login even runs.
  login: (usr: string, pwd: string) =>
    apiCall<LoginResp>("POST", "fatehhr.api.auth.login", { usr, pwd }, { noAuth: true }),
  setPin: (pin: string) =>
    apiCall<{ ok: true }>("POST", "fatehhr.api.auth.set_pin", { pin }),
  verifyPin: (user: string, pin: string) =>
    apiCall<LoginResp>("POST", "fatehhr.api.auth.verify_pin", { user, pin }, { noAuth: true }),
  changePin: (old_pin: string, new_pin: string) =>
    apiCall<{ ok: true }>("POST", "fatehhr.api.auth.change_pin", { old_pin, new_pin }),
  forgotPin: (usr: string, pwd: string) =>
    apiCall<{ ok: true }>("POST", "fatehhr.api.auth.forgot_pin", { usr, pwd }, { noAuth: true }),
};
