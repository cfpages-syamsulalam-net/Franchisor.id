(function (window) {
  const GOOGLE_ICON = `
    <svg class="fr-auth-google-logo" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3.01h3.88c2.27-2.09 3.54-5.17 3.54-8.88z"/>
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.88-3.01c-1.08.72-2.45 1.14-4.05 1.14-3.11 0-5.75-2.1-6.7-4.93H1.29v3.1A11.99 11.99 0 0 0 12 24z"/>
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.29a12.02 12.02 0 0 0 0 10.8l4.01-3.1z"/>
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.79l3.43-3.43A11.52 11.52 0 0 0 12 0 11.99 11.99 0 0 0 1.29 6.6L5.3 9.7C6.25 6.87 8.89 4.77 12 4.77z"/>
    </svg>
  `;

  window.FranchiseAuthUI = {
    authTemplate,
  };

  function authTemplate(mode, options = {}) {
    const isRegister = mode === "register";
    const isForgotPassword = mode === "forgot-password";
    const isForgotEmail = mode === "forgot-email";
    const isLoginOnly = Boolean(options.isLoginOnly);
    return `
      <div class="fr-auth-shell" data-current-mode="${mode}">
        <div class="fr-auth-panel">
          ${isLoginOnly ? `
            <div class="fr-auth-context">
              <h2>Login Admin / Staff</h2>
              <p>Gunakan akun internal yang sudah diberi akses admin atau staff.</p>
            </div>
          ` : `
            <div class="fr-auth-context">
              <h2>Masuk ke akun jaringan Anda</h2>
              <p>Satu akun untuk seluruh jaringan. Gunakan email yang <strong>sama</strong> seperti di situs jaringan kami yang lain, supaya brand, langganan, dan pengaturan Anda langsung tersinkron.</p>
              <p>Belum pernah mendaftar? Tidak perlu daftar terpisah &mdash; login pertama Anda sekaligus membuat akunnya.</p>
            </div>
          `}
          <div class="fr-auth-message" data-auth-message></div>
          <div data-auth-session></div>
          <form class="fr-auth-form" data-auth-form="login" ${mode !== "login" ? "hidden" : ""} aria-hidden="${mode === "login" ? "false" : "true"}">
            <div class="fr-auth-oauth">
              <button class="fr-auth-oauth-button" type="button" data-auth-oauth="google" data-auth-oauth-mode="login">
                <span class="fr-auth-oauth-icon" aria-hidden="true">${GOOGLE_ICON}</span>
                <span>Lanjutkan dengan Google</span>
              </button>
              <p class="fr-auth-oauth-note"><i class="fas fa-circle-check" aria-hidden="true"></i> Paling disarankan. Lebih cepat, dan email Anda sudah terverifikasi Google sehingga data langsung tersinkron dengan situs jaringan kami yang lain.</p>
              <div class="fr-auth-divider"><span>atau masuk dengan email</span></div>
            </div>
            <div class="fr-auth-field">
              <label for="fr-auth-login-email"><i class="fas fa-envelope" aria-hidden="true"></i> Email</label>
              <input id="fr-auth-login-email" name="email" type="email" autocomplete="email" required>
            </div>
            <div class="fr-auth-field">
              <label for="fr-auth-login-password"><i class="fas fa-lock" aria-hidden="true"></i> Password</label>
              <input id="fr-auth-login-password" name="password" type="password" autocomplete="current-password" required>
            </div>
            <div class="fr-auth-actions">
              <button class="fr-auth-button" type="submit"><i class="fas fa-sign-in-alt" aria-hidden="true"></i> Masuk</button>
            </div>
            ${isLoginOnly ? "" : `<div class="fr-auth-help-row">
              <button class="fr-auth-inline-link" type="button" data-auth-switch="forgot-password"><i class="fas fa-key" aria-hidden="true"></i> Lupa password?</button>
              <button class="fr-auth-inline-link" type="button" data-auth-switch="forgot-email"><i class="fas fa-envelope-circle-check" aria-hidden="true"></i> Lupa email?</button>
            </div>`}
            ${isLoginOnly ? "" : `<p class="fr-auth-switch-note">
              Pertama kali di jaringan ini?
              <button class="fr-auth-inline-link" type="button" data-auth-switch="register">Lengkapi pendaftaran di sini.</button>
            </p>`}
          </form>
          ${isLoginOnly ? "" : `<form class="fr-auth-form" data-auth-form="register" ${!isRegister ? "hidden" : ""} aria-hidden="${!isRegister ? "true" : "false"}">
            <div class="fr-auth-context">
              <h2><i class="fas fa-user-plus" aria-hidden="true"></i> Lengkapi pendaftaran Anda</h2>
              <p>Email ini belum terdaftar, jadi login pertama Anda sekaligus membuat akunnya. Pilih peran Anda, lalu lanjutkan dengan Google (lebih disarankan) atau buat password.</p>
            </div>
            <div class="fr-auth-role-control" aria-label="Daftar sebagai">
              <div class="fr-auth-role-title"><i class="fas fa-users" aria-hidden="true"></i> Daftar sebagai</div>
              <div class="fr-auth-role-grid">
                <label class="fr-auth-role">
                  <input type="radio" name="role" value="franchisee" checked>
                  <span><i class="fas fa-user-tie" aria-hidden="true"></i> Franchisee</span>
                </label>
                <label class="fr-auth-role">
                  <input type="radio" name="role" value="franchisor">
                  <span><i class="fas fa-store" aria-hidden="true"></i> Franchisor</span>
                </label>
              </div>
            </div>
            <div class="fr-auth-oauth">
              <button class="fr-auth-oauth-button" type="button" data-auth-oauth="google" data-auth-oauth-mode="register">
                <span class="fr-auth-oauth-icon" aria-hidden="true">${GOOGLE_ICON}</span>
                <span>Daftar dengan Google</span>
              </button>
              <div class="fr-auth-divider"><span>atau</span></div>
            </div>
            <div class="fr-auth-field">
              <label for="fr-auth-register-email"><i class="fas fa-envelope" aria-hidden="true"></i> Email</label>
              <input id="fr-auth-register-email" name="email" type="email" autocomplete="email" required>
            </div>
            <div class="fr-auth-field">
              <label for="fr-auth-register-password"><i class="fas fa-lock" aria-hidden="true"></i> Password</label>
              <input id="fr-auth-register-password" name="password" type="password" autocomplete="new-password" minlength="8" required>
            </div>
            <div class="fr-auth-actions">
              <button class="fr-auth-button" type="submit"><i class="fas fa-user-plus" aria-hidden="true"></i> Buat Akun</button>
            </div>
            <p class="fr-auth-switch-note">
              Sudah punya akun?
              <button class="fr-auth-inline-link" type="button" data-auth-switch="login">Masuk di sini.</button>
            </p>
          </form>
          <form class="fr-auth-form" data-auth-form="forgot-password" ${!isForgotPassword ? "hidden" : ""} aria-hidden="${isForgotPassword ? "false" : "true"}">
            <div class="fr-auth-context">
              <h2><i class="fas fa-key" aria-hidden="true"></i> Atur ulang password</h2>
              <p>Masukkan email akun Anda. Kami akan mengirim kode untuk membuat password baru.</p>
            </div>
            <div class="fr-auth-field">
              <label for="fr-auth-forgot-email"><i class="fas fa-envelope" aria-hidden="true"></i> Email</label>
              <input id="fr-auth-forgot-email" name="email" type="email" autocomplete="email" required>
            </div>
            <div class="fr-auth-actions">
              <button class="fr-auth-button" type="submit"><i class="fas fa-paper-plane" aria-hidden="true"></i> Kirim Kode</button>
            </div>
            <p class="fr-auth-switch-note">
              Sudah ingat?
              <button class="fr-auth-inline-link" type="button" data-auth-switch="login">Masuk di sini.</button>
            </p>
          </form>
          <form class="fr-auth-form" data-auth-form="reset-password" hidden aria-hidden="true">
            <div class="fr-auth-context">
              <h2><i class="fas fa-lock" aria-hidden="true"></i> Password baru</h2>
              <p>Masukkan kode dari email dan buat password baru.</p>
            </div>
            <div class="fr-auth-field">
              <label for="fr-auth-reset-code"><i class="fas fa-key" aria-hidden="true"></i> Kode</label>
              <input id="fr-auth-reset-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" required>
            </div>
            <div class="fr-auth-field">
              <label for="fr-auth-reset-password"><i class="fas fa-lock" aria-hidden="true"></i> Password baru</label>
              <input id="fr-auth-reset-password" name="password" type="password" autocomplete="new-password" minlength="8" required>
            </div>
            <div class="fr-auth-field">
              <label for="fr-auth-reset-confirm"><i class="fas fa-check" aria-hidden="true"></i> Ulangi</label>
              <input id="fr-auth-reset-confirm" name="confirm_password" type="password" autocomplete="new-password" minlength="8" required>
            </div>
            <div class="fr-auth-actions">
              <button class="fr-auth-button" type="submit"><i class="fas fa-check-circle" aria-hidden="true"></i> Simpan Password</button>
            </div>
            <p class="fr-auth-switch-note">
              Belum menerima kode?
              <button class="fr-auth-inline-link" type="button" data-auth-switch="forgot-password">Kirim ulang.</button>
            </p>
          </form>
          <div class="fr-auth-form" data-auth-form="forgot-email" ${!isForgotEmail ? "hidden" : ""} aria-hidden="${isForgotEmail ? "false" : "true"}">
            <div class="fr-auth-context">
              <h2><i class="fas fa-envelope-circle-check" aria-hidden="true"></i> Cari email akun</h2>
              <p>Jika akun pernah dibuat dengan Google, masuk dengan Google. Jika memakai email dan password, cek inbox yang pernah menerima email dari Franchisor.id.</p>
            </div>
            <div class="fr-auth-oauth">
              <button class="fr-auth-oauth-button" type="button" data-auth-oauth="google" data-auth-oauth-mode="login">
                <span class="fr-auth-oauth-icon" aria-hidden="true">${GOOGLE_ICON}</span>
                <span>Masuk dengan Google</span>
              </button>
            </div>
            <p class="fr-auth-switch-note">
              Sudah menemukan email?
              <button class="fr-auth-inline-link" type="button" data-auth-switch="forgot-password">Atur ulang password</button>
              atau
              <button class="fr-auth-inline-link" type="button" data-auth-switch="login">masuk biasa.</button>
            </p>
          </div>
          <form class="fr-auth-form" data-auth-form="verify" hidden aria-hidden="true">
            <div class="fr-auth-field">
              <label for="fr-auth-code"><i class="fas fa-key" aria-hidden="true"></i> Kode verifikasi email</label>
              <input id="fr-auth-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" required>
            </div>
            <div class="fr-auth-actions">
              <button class="fr-auth-button" type="submit"><i class="fas fa-check-circle" aria-hidden="true"></i> Verifikasi</button>
            </div>
          </form>`}
        </div>
      </div>
    `;
  }
})(window);
