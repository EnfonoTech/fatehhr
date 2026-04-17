import { apiCall } from "./client";
export const authApi = {
    login: (usr, pwd) => apiCall("POST", "fatehhr.api.auth.login", { usr, pwd }),
    setPin: (pin) => apiCall("POST", "fatehhr.api.auth.set_pin", { pin }),
    verifyPin: (user, pin) => apiCall("POST", "fatehhr.api.auth.verify_pin", { user, pin }),
    changePin: (old_pin, new_pin) => apiCall("POST", "fatehhr.api.auth.change_pin", { old_pin, new_pin }),
};
