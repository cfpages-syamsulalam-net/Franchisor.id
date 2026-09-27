(function (window) {
  function createRenderer(state, helpers) {
    const Auth = helpers.Auth;
    const attr = helpers.attr;
    const escapeHtml = helpers.escapeHtml;
    const hasGoogleAccount = helpers.hasGoogleAccount;
    const passwordHelperText = helpers.passwordHelperText;

    function accountPanel() {
      const user = state.data.user;
      const clerkUser = state.clerk?.user || Auth.clerk?.user || {};
      const passwordEnabled = Boolean(clerkUser.passwordEnabled);
      const googleLinked = hasGoogleAccount(clerkUser);
      return `
        <h2 class="fr-profile-section-title"><i class="fas fa-user-gear" aria-hidden="true"></i> Akun</h2>
        <p class="fr-profile-copy">Kelola nama, email, dan cara masuk akun Anda.</p>
        ${state.accountMessage ? `<p class="fr-profile-message is-${attr(state.accountMessage.type)}">${escapeHtml(state.accountMessage.text)}</p>` : ""}
        <div class="fr-profile-account-list">
          ${accountFieldForm({
            field: "display_name",
            icon: "fa-id-card",
            label: "Nama",
            value: user.display_name,
            type: "text",
            otherName: "email",
            otherValue: user.email,
            buttonLabel: "Edit nama",
          })}
          ${accountFieldForm({
            field: "email",
            icon: "fa-envelope",
            label: "Email",
            value: user.email,
            type: "email",
            otherName: "display_name",
            otherValue: user.display_name,
            buttonLabel: "Edit email",
          })}
          <section class="fr-profile-account-row">
            <div class="fr-profile-account-main">
              <label for="profile-password-view"><i class="fas fa-lock" aria-hidden="true"></i> Password</label>
              <div class="fr-profile-inline">
                <input id="profile-password-view" type="password" value="${passwordEnabled ? "********" : ""}" readonly placeholder="${passwordEnabled ? "" : "Belum ditambahkan"}">
                ${state.accountEditingField === "password" ? "" : `<button class="fr-profile-icon-button" type="button" data-account-edit="password" aria-label="${passwordEnabled ? "Edit password" : "Tambah password"}" data-fr-tooltip="${passwordEnabled ? "Edit password" : "Tambah password"}"><i class="fas ${passwordEnabled ? "fa-pen" : "fa-plus"}" aria-hidden="true"></i></button>`}
              </div>
              <p class="fr-profile-field-note">${escapeHtml(passwordHelperText(passwordEnabled, googleLinked))}</p>
            </div>
            ${state.accountEditingField === "password" ? passwordEditForm(passwordEnabled) : ""}
          </section>
        </div>
        <section class="fr-profile-account-row">
          <div class="fr-profile-account-main">
            <label><i class="fas fa-triangle-exclamation" aria-hidden="true" style="color:#cf322e;"></i> Hapus &amp; blokir akun</label>
            <p class="fr-profile-field-note">Menghapus data Anda dan memblokir akun ini untuk selamanya. Tindakan ini tidak bisa dibatalkan sendiri.</p>
          </div>
          <div class="fr-profile-account-actions">
            <a class="fr-profile-secondary" href="/pengaturan/hapus-akun/" style="color:#cf322e;"><i class="fas fa-user-slash" aria-hidden="true"></i> Hapus &amp; blokir akun</a>
          </div>
        </section>
      `;
    }

    function accountFieldForm(config) {
      const editing = state.accountEditingField === config.field;
      return `
        <form class="fr-profile-account-row" data-profile-form="account">
          <input type="hidden" name="${attr(config.otherName)}" value="${attr(config.otherValue)}">
          <div class="fr-profile-account-main">
            <label for="profile-${attr(config.field)}"><i class="fas ${attr(config.icon)}" aria-hidden="true"></i> ${escapeHtml(config.label)}</label>
            <div class="fr-profile-inline">
              <input id="profile-${attr(config.field)}" name="${attr(config.field)}" type="${attr(config.type)}" value="${attr(config.value)}" ${editing ? "" : "readonly"} required>
              ${editing ? "" : `<button class="fr-profile-icon-button" type="button" data-account-edit="${attr(config.field)}" aria-label="${attr(config.buttonLabel)}" data-fr-tooltip="${attr(config.buttonLabel)}"><i class="fas fa-pen" aria-hidden="true"></i></button>`}
            </div>
            <p class="fr-profile-message" data-profile-message></p>
          </div>
          ${editing ? `
            <div class="fr-profile-account-actions">
              <button class="fr-profile-button" type="submit"><i class="fas fa-floppy-disk" aria-hidden="true"></i> Simpan</button>
              <button class="fr-profile-secondary" type="button" data-account-cancel><i class="fas fa-xmark" aria-hidden="true"></i> Batal</button>
            </div>
          ` : ""}
        </form>
      `;
    }

    function passwordEditForm(passwordEnabled) {
      return `
        <form class="fr-profile-password-form" data-password-form>
          ${passwordEnabled ? `
            <div class="fr-profile-field">
              <label for="profile-current-password"><i class="fas fa-key" aria-hidden="true"></i> Password saat ini</label>
              <input id="profile-current-password" name="current_password" type="password" autocomplete="current-password" required>
            </div>
          ` : ""}
          <div class="fr-profile-password-grid">
            <div class="fr-profile-field">
              <label for="profile-new-password"><i class="fas fa-lock" aria-hidden="true"></i> Password baru</label>
              <input id="profile-new-password" name="new_password" type="password" autocomplete="new-password" minlength="8" required>
            </div>
            <div class="fr-profile-field">
              <label for="profile-confirm-password"><i class="fas fa-check" aria-hidden="true"></i> Ulangi password baru</label>
              <input id="profile-confirm-password" name="confirm_password" type="password" autocomplete="new-password" minlength="8" required>
            </div>
          </div>
          <label class="fr-profile-checkbox">
            <input type="checkbox" name="sign_out_other_sessions">
            <span>Keluar dari perangkat lain setelah password diganti.</span>
          </label>
          <p class="fr-profile-message" data-profile-message></p>
          <div class="fr-profile-account-actions">
            <button class="fr-profile-button" type="submit"><i class="fas fa-floppy-disk" aria-hidden="true"></i> ${passwordEnabled ? "Ganti Password" : "Tambah Password"}</button>
            <button class="fr-profile-secondary" type="button" data-account-cancel><i class="fas fa-xmark" aria-hidden="true"></i> Batal</button>
          </div>
        </form>
      `;
    }

    return { accountPanel };
  }

  window.FranchiseProfileAccount = { createRenderer };
})(window);
