/**
 * Settings → "Hapus & blokir akun saya".
 *
 * The page owns the consequence text and the typed-confirmation phrase; this owns the request. Nothing here
 * decides whether an account may be removed — the server does, and it validates the phrase against the same
 * literal, so a stray click or a replayed request cannot remove an account.
 *
 * The acknowledgement version travels with the request and is stored on the block row, so we can always show
 * what a person was actually told when they agreed.
 */
(function () {
  var form = document.getElementById("fr-delete-form");
  if (!form) return;

  var phrase = form.getAttribute("data-confirm-phrase") || "";
  var input = document.getElementById("fr-delete-confirm");
  var ack = document.getElementById("fr-delete-ack");
  var submit = document.getElementById("fr-delete-submit");
  var status = document.getElementById("fr-delete-status");
  var consequences = document.getElementById("fr-delete-consequences");
  var acknowledgementVersion = (consequences && consequences.getAttribute("data-acknowledgement-version")) || "";

  if (!input || !ack || !submit || !status) return;

  function refresh() {
    submit.disabled = !(input.value.trim() === phrase && ack.checked);
  }

  input.addEventListener("input", refresh);
  ack.addEventListener("change", refresh);
  refresh();

  function setStatus(message, ok) {
    status.textContent = message || "";
    status.style.color = ok ? "#1c7a3d" : "#cf322e";
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (submit.disabled) return;

    submit.disabled = true;
    setStatus("Memproses...", true);

    try {
      if (!window.FranchiseAuth || !window.FranchiseFetch) {
        throw new Error("Runtime login belum siap. Muat ulang halaman lalu coba lagi.");
      }

      await window.FranchiseAuth.init();
      var headers = await window.FranchiseAuth.getAuthHeaders();

      var response = await fetch("/profile-data", {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, headers),
        body: JSON.stringify({
          action: "delete_account",
          confirm: input.value.trim(),
          acknowledgement_version: acknowledgementVersion
        })
      });

      var result = await window.FranchiseFetch.readJson(response, "Permintaan gagal diproses.");

      // The server owns the wording: only it knows whether the account was actually blocked.
      setStatus(result && result.message ? result.message : "Permintaan Anda sudah dicatat.", Boolean(result && result.success));

      if (result && result.success) {
        input.value = "";
        ack.checked = false;
      }
    } catch (error) {
      // readJson raises with the server's message, which is the useful part.
      setStatus((error && error.message) || "Permintaan gagal diproses.", false);
    } finally {
      refresh();
    }
  });
})();
