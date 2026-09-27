(function (window, document) {
  const Auth = (window.FranchiseAuth = window.FranchiseAuth || {});
  if (!window.FranchiseAuthCore || typeof window.FranchiseAuthCore.create !== "function") {
    throw new Error("FranchiseAuthCore belum dimuat.");
  }
  const AuthCore = window.FranchiseAuthCore.create(Auth);
  const SELF_ASSIGNABLE_ROLES = AuthCore.SELF_ASSIGNABLE_ROLES;
  const initClerk = AuthCore.initClerk;
  const syncUser = AuthCore.syncUser;
  const activateSession = AuthCore.activateSession;
  const setPendingRole = AuthCore.setPendingRole;
  const clearPendingRole = AuthCore.clearPendingRole;
  const setPendingNext = AuthCore.setPendingNext;
  const clearPendingNext = AuthCore.clearPendingNext;
  const clerkErrorMessage = AuthCore.clerkErrorMessage;
  const nextUrl = AuthCore.nextUrl;
  const registrationNextUrl = AuthCore.registrationNextUrl;
  const oauthCallbackUrl = AuthCore.oauthCallbackUrl;

  document.addEventListener("DOMContentLoaded", function () {
    mountAuthPage();
  });
  Auth.mountAuthPage = mountAuthPage;

  function mountAuthPage(options = {}) {
    const root = document.getElementById("franchise-auth-root") || document.getElementById("wpforms-725");
    if (!root) return;
    if (root.getAttribute("data-auth-defer") === "true" && !options.force) return;
    if (root.getAttribute("data-auth-rendered") === "true") return;
    root.setAttribute("data-auth-rendered", "true");

    const variant = root.getAttribute("data-auth-variant") || "public";
    const isLoginOnly = variant === "staff";
    const defaultMode = root.getAttribute("data-auth-mode") || new URLSearchParams(window.location.search).get("mode") || "login";
    root.innerHTML = authTemplate(normalizeAuthMode(defaultMode, isLoginOnly), {
      isLoginOnly,
    });
    bindAuthEvents(root);
    showInitialAuthMessage(root);
    renderSessionState(root);
  }

  function authTemplate(mode, options = {}) {
    if (!window.FranchiseAuthUI || typeof window.FranchiseAuthUI.authTemplate !== "function") {
      throw new Error("Tampilan login belum siap. Silakan muat ulang halaman.");
    }
    return window.FranchiseAuthUI.authTemplate(mode, options);
  }

  function bindAuthEvents(root) {
    root.querySelectorAll("[data-auth-oauth]").forEach(function (button) {
      button.addEventListener("click", function () {
        handleOAuth(root, button);
      });
    });

    root.querySelectorAll("[data-auth-switch]").forEach(function (button) {
      button.addEventListener("click", function () {
        switchMode(root, button.getAttribute("data-auth-switch"));
      });
    });

    const loginForm = root.querySelector('[data-auth-form="login"]');
    const registerForm = root.querySelector('[data-auth-form="register"]');
    const verifyForm = root.querySelector('[data-auth-form="verify"]');
    const forgotPasswordForm = root.querySelector('[data-auth-form="forgot-password"]');
    const resetPasswordForm = root.querySelector('[data-auth-form="reset-password"]');

    if (loginForm) {
      loginForm.addEventListener("submit", function (event) {
        event.preventDefault();
        handleLogin(root, loginForm);
      });
    }

    if (registerForm) {
      registerForm.addEventListener("submit", function (event) {
        event.preventDefault();
        handleRegister(root, registerForm);
      });
    }

    if (verifyForm) {
      verifyForm.addEventListener("submit", function (event) {
        event.preventDefault();
        handleVerification(root, verifyForm);
      });
    }

    if (forgotPasswordForm) {
      forgotPasswordForm.addEventListener("submit", function (event) {
        event.preventDefault();
        handleForgotPassword(root, forgotPasswordForm);
      });
    }

    if (resetPasswordForm) {
      resetPasswordForm.addEventListener("submit", function (event) {
        event.preventDefault();
        handleResetPassword(root, resetPasswordForm);
      });
    }
  }

  async function renderSessionState(root) {
    try {
      const clerk = await initClerk();
      const holder = root.querySelector("[data-auth-session]");
      if (!holder || !clerk.session) return;

      const user = await syncUser();
      const privileged = isPrivilegedUser(user);
      holder.innerHTML = `
        <div class="fr-auth-status ${privileged ? "is-inspectable" : ""}">
          <div>
            <strong><i class="fas fa-user-check" aria-hidden="true"></i> Anda sudah login.</strong>
            <div class="fr-auth-muted">${escapeHtml(user?.email || clerk.user?.primaryEmailAddress?.emailAddress || "")}</div>
          </div>
          <div class="fr-auth-actions">
            <a class="fr-auth-button" href="${escapeHtml(nextUrl(root))}"><i class="fas fa-arrow-right" aria-hidden="true"></i> Lanjutkan</a>
            <button class="fr-auth-link-button" type="button" data-auth-signout><i class="fas fa-sign-out-alt" aria-hidden="true"></i> Logout</button>
          </div>
        </div>
      `;
      if (!privileged) hideForms(root);
      holder.querySelector("[data-auth-signout]").addEventListener("click", async function () {
        await clerk.signOut();
        window.location.reload();
      });
    } catch (error) {
      showMessage(root, clerkErrorMessage(error), "error");
    }
  }

  function showInitialAuthMessage(root) {
    const next = new URLSearchParams(window.location.search).get("next") || "";
    if (next.startsWith("/daftar")) {
      showMessage(root, {
        text: "Masuk atau buat akun dulu untuk melanjutkan ke form daftar mitra.",
        actions: [{ label: "Buat akun baru", switchMode: "register" }],
      }, "info");
      return;
    }
    if (next.startsWith("/profil")) {
      showMessage(root, {
        text: "Masuk dulu untuk membuka profil akun.",
        actions: [{ label: "Buat akun baru", switchMode: "register" }],
      }, "info");
    }
  }

  async function handleLogin(root, form) {
    setBusy(form, true);
    showMessage(root, "", "");
    try {
      const clerk = await initClerk();
      const data = formData(form);
      let signIn;
      try {
        signIn = await clerk.client.signIn.create({
          identifier: data.email,
          password: data.password,
        });
      } catch (error) {
        if (!isUnknownAccount(error)) throw error;
        // No account on this email yet. Across this network that means the person is new, not mistaken, so the
        // first login IS the registration — hand them to the registration form with the email already filled in
        // rather than showing "account not found" and making them hunt for a separate sign-up page.
        startFirstTimeRegistration(root, data.email);
        return;
      }

      if (signIn.status !== "complete" || !signIn.createdSessionId) {
        throw new Error("Login memerlukan langkah verifikasi tambahan yang belum diaktifkan di halaman ini.");
      }

      await activateSession(clerk, signIn.createdSessionId);
      await syncUser();
      showMessage(root, "Login berhasil.", "success");
      window.location.href = nextUrl(root);
    } catch (error) {
      showMessage(root, clerkErrorMessage(error), "error");
    } finally {
      setBusy(form, false);
    }
  }

  /**
   * Whether Clerk is telling us the identifier has no account at all.
   *
   * Only `form_identifier_not_found` counts. `form_password_incorrect` must never lead here: that is somebody
   * with a real account mistyping their password, and moving them into registration would offer to create a
   * second account for an email that already has one.
   */
  function isUnknownAccount(error) {
    const codes = Array.isArray(error?.errors) ? error.errors.map(function (entry) { return entry?.code; }) : [];
    return codes.indexOf("form_identifier_not_found") !== -1;
  }

  /**
   * The first-login path: same address, no account yet, so registration begins here.
   *
   * Signature verification for the resulting account is unchanged — it still runs through signUp.create and the
   * email code, which is what makes the address verified and therefore what makes cross-site account linking
   * possible at all.
   */
  function startFirstTimeRegistration(root, email) {
    switchMode(root, "register");
    const emailInput = root.querySelector('[data-auth-form="register"] input[name="email"]');
    if (emailInput && email) emailInput.value = email;
    showMessage(root, {
      text: "Email ini belum terdaftar, jadi login pertama Anda sekaligus membuat akunnya.",
      hint: "Pilih peran Anda, lalu lanjutkan dengan Google atau buat password. Kami akan mengirim kode verifikasi ke email Anda.",
    }, "success");
    root.querySelector('[data-auth-form="register"] input[name="role"]')?.focus();
  }

  async function handleForgotPassword(root, form) {
    setBusy(form, true);
    showMessage(root, "", "");
    try {
      const clerk = await initClerk();
      const data = formData(form);
      const signIn = await clerk.client.signIn.create({
        strategy: "reset_password_email_code",
        identifier: data.email,
      });
      Auth.resetPasswordSignIn = signIn;
      Auth.resetPasswordEmail = data.email;
      switchMode(root, "reset-password");
      showMessage(root, {
        text: "Kode atur ulang password sudah dikirim ke email Anda.",
        hint: "Buka email Anda, masukkan kode di form ini, lalu buat password baru.",
        actions: [{ label: "Masukkan kode", switchMode: "reset-password" }],
      }, "success");
      root.querySelector('[data-auth-form="reset-password"] input[name="code"]')?.focus();
    } catch (error) {
      showMessage(root, clerkErrorMessage(error), "error");
    } finally {
      setBusy(form, false);
    }
  }

  async function handleResetPassword(root, form) {
    setBusy(form, true);
    showMessage(root, "", "");
    try {
      const clerk = await initClerk();
      const data = formData(form);
      if (!Auth.resetPasswordSignIn) {
        throw new Error("Silakan kirim kode atur ulang password terlebih dahulu.");
      }
      if (String(data.password || "").length < 8) {
        throw new Error("Password minimal 8 karakter.");
      }
      if (data.password !== data.confirm_password) {
        throw new Error("Ulangi password baru dengan nilai yang sama.");
      }

      const verified = await Auth.resetPasswordSignIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: data.code,
      });
      if (verified.status !== "needs_new_password") {
        throw new Error("Kode belum valid. Periksa email dan coba lagi.");
      }

      const reset = await verified.resetPassword({
        password: data.password,
        signOutOfOtherSessions: true,
      });
      if (reset.status !== "complete" || !reset.createdSessionId) {
        throw new Error("Password belum bisa disimpan. Silakan coba lagi.");
      }

      await activateSession(clerk, reset.createdSessionId);
      await syncUser();
      Auth.resetPasswordSignIn = null;
      Auth.resetPasswordEmail = "";
      showMessage(root, {
        text: "Password baru tersimpan.",
        actions: [{ label: "Lanjutkan", href: nextUrl(root) }],
      }, "success");
      window.location.href = nextUrl(root);
    } catch (error) {
      showMessage(root, clerkErrorMessage(error), "error");
    } finally {
      setBusy(form, false);
    }
  }

  async function handleOAuth(root, button) {
    button.disabled = true;
    showMessage(root, "", "");
    try {
      const clerk = await initClerk();
      const mode = button.getAttribute("data-auth-oauth-mode") || "login";
      const role = mode === "register" ? getSelectedRegisterRole(root) : "";
      if (SELF_ASSIGNABLE_ROLES.has(role)) {
        setPendingRole(role);
      }
      const redirectUrlComplete = mode === "register" ? registrationNextUrl(role) : nextUrl(root);

      const params = {
        strategy: "oauth_google",
        redirectUrl: oauthCallbackUrl(),
        redirectUrlComplete,
        signInFallbackRedirectUrl: redirectUrlComplete,
        signUpFallbackRedirectUrl: redirectUrlComplete,
        continueSignIn: true,
        continueSignUp: true,
      };
      setPendingNext(params.redirectUrlComplete);

      if (mode === "register" && clerk.client?.signUp?.authenticateWithRedirect) {
        await clerk.client.signUp.authenticateWithRedirect({
          ...params,
          unsafeMetadata: role ? { requested_role: role } : undefined,
        });
        return;
      }

      if (clerk.client?.signIn?.authenticateWithRedirect) {
        await clerk.client.signIn.authenticateWithRedirect(params);
        return;
      }

      throw new Error("Login Google belum tersedia saat ini.");
    } catch (error) {
      clearPendingRole();
      clearPendingNext();
      button.disabled = false;
      showMessage(root, clerkErrorMessage(error), "error");
    }
  }

  async function handleRegister(root, form) {
    setBusy(form, true);
    showMessage(root, "", "");
    try {
      const clerk = await initClerk();
      const data = formData(form);
      Auth.pendingRole = data.role;
      setPendingRole(data.role);
      setPendingNext(registrationNextUrl(data.role));
      const signUp = await clerk.client.signUp.create({
        emailAddress: data.email,
        password: data.password,
        unsafeMetadata: { requested_role: data.role },
      });

      if (signUp.status === "complete" && signUp.createdSessionId) {
        await finishRegistration(root, clerk, signUp.createdSessionId, data.role);
        return;
      }

      await clerk.client.signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      switchMode(root, "verify");
      showMessage(root, {
        text: "Kode verifikasi sudah dikirim ke email Anda.",
        hint: "Masukkan kode dari email di form verifikasi ini untuk menyelesaikan pembuatan akun.",
      }, "success");
    } catch (error) {
      showMessage(root, clerkErrorMessage(error), "error");
    } finally {
      setBusy(form, false);
    }
  }

  async function handleVerification(root, form) {
    setBusy(form, true);
    showMessage(root, "", "");
    try {
      const clerk = await initClerk();
      const data = formData(form);
      const result = await clerk.client.signUp.attemptEmailAddressVerification({ code: data.code });
      if (result.status !== "complete" || !result.createdSessionId) {
        throw new Error("Kode verifikasi belum valid.");
      }
      await finishRegistration(root, clerk, result.createdSessionId, Auth.pendingRole || "franchisee");
    } catch (error) {
      showMessage(root, clerkErrorMessage(error), "error");
    } finally {
      setBusy(form, false);
    }
  }

  async function finishRegistration(root, clerk, sessionId, role) {
    await activateSession(clerk, sessionId);
    await syncUser(role);
    clearPendingRole();
    clearPendingNext();
    showMessage(root, "Akun berhasil dibuat.", "success");
    window.location.href = registrationNextUrl(role);
  }

  function switchMode(root, mode) {
    const nextMode = normalizeAuthMode(mode, root?.getAttribute("data-auth-variant") === "staff", { allowReset: true });
    root.querySelector(".fr-auth-shell")?.setAttribute("data-current-mode", nextMode);
    root.querySelectorAll("[data-auth-switch]").forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-auth-switch") === nextMode);
    });
    root.querySelectorAll("[data-auth-form]").forEach(function (form) {
      const isActive = form.getAttribute("data-auth-form") === nextMode;
      form.hidden = !isActive;
      form.setAttribute("aria-hidden", isActive ? "false" : "true");
    });
  }

  function normalizeAuthMode(mode, isLoginOnly, options = {}) {
    const value = String(mode || "login").toLowerCase();
    if (isLoginOnly) return "login";
    const allowed = options.allowReset
      ? ["login", "register", "forgot-password", "reset-password", "forgot-email"]
      : ["login", "register", "forgot-password", "forgot-email"];
    return allowed.includes(value) ? value : "login";
  }

  function hideForms(root) {
    root.querySelectorAll("[data-auth-form], .fr-auth-tabs").forEach(function (item) {
      item.hidden = true;
      item.setAttribute("aria-hidden", "true");
    });
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function getSelectedRegisterRole(root) {
    return root.querySelector('[data-auth-form="register"] input[name="role"]:checked')?.value || "franchisee";
  }

  function isPrivilegedUser(user) {
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    return roles.some(function (role) {
      const name = typeof role === "string" ? role : role?.role;
      return name === "admin" || name === "staff";
    });
  }

  function setBusy(form, busy) {
    form.querySelectorAll("button, input").forEach(function (item) {
      item.disabled = busy;
    });
  }

  function showMessage(root, message, type) {
    const target = root.querySelector("[data-auth-message]");
    if (!target) return;
    const payload = typeof message === "object" && message !== null ? message : { text: message || "" };
    target.textContent = "";
    target.className = "fr-auth-message";
    if (payload.text || payload.hint || payload.actions?.length) {
      target.classList.add("is-visible", type === "success" ? "is-success" : type === "info" ? "is-info" : "is-error");
      if (payload.text) {
        const text = document.createElement("span");
        text.textContent = payload.text;
        target.appendChild(text);
      }
      if (payload.hint) {
        const hint = document.createElement("small");
        hint.textContent = payload.hint;
        target.appendChild(hint);
      }
      if (Array.isArray(payload.actions) && payload.actions.length) {
        const actions = document.createElement("div");
        actions.className = "fr-auth-message-actions";
        payload.actions.forEach(function (action) {
          const item = document.createElement(action.href ? "a" : "button");
          item.className = "fr-auth-message-cta";
          item.textContent = action.label || "Lanjutkan";
          if (action.href) {
            item.href = action.href;
          } else {
            item.type = "button";
            if (action.switchMode) {
              item.addEventListener("click", function () {
                switchMode(root, action.switchMode);
                showMessage(root, "", "");
              });
            }
          }
          actions.appendChild(item);
        });
        target.appendChild(actions);
      }
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[char];
    });
  }
})(window, document);
