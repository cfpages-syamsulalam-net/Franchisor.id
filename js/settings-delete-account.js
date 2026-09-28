/**
 * Settings → "Hapus & blokir akun saya".
 *
 * The page owns the consequence text, the contract and the typed-confirmation phrase; this owns the request and
 * the signature. Nothing here decides whether an account may be removed — the server does, and it validates the
 * phrase and the contract against the same versions, so a stray click or a replayed request cannot remove one.
 *
 * The signature is stored as a **path**, not an image. A gesture is roughly 100-300 samples and encodes to under a
 * kilobyte, against tens of kilobytes for any raster, and this row is kept for years in a database with a hard
 * 500 MB ceiling. It is also the raw gesture rather than a downsampled picture of it, and it can be re-rendered at
 * any size later. See `scripts/render-signature.mjs` for the reader.
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
  var contract = document.getElementById("fr-delete-contract");
  var nameInput = document.getElementById("fr-signer-name");
  var canvas = document.getElementById("fr-signature-pad");
  var clearButton = document.getElementById("fr-signature-clear");

  var acknowledgementVersion = (consequences && consequences.getAttribute("data-acknowledgement-version")) || "";
  var contractVersion = (contract && contract.getAttribute("data-contract-version")) || "";

  if (!input || !ack || !submit || !status || !nameInput || !canvas) return;

  // --- signature pad -------------------------------------------------------------------
  // Bounded on purpose: the payload cap in the schema is 8 KB, and a signature that needs more than this many
  // points is not more recognisable, only larger.
  var MAX_POINTS = 512;
  var MIN_DISTANCE = 1.5;

  var points = [];
  var drawing = false;
  var lastX = null;
  var lastY = null;
  var cssWidth = 1;
  var cssHeight = 1;
  var ctx = canvas.getContext("2d");

  function clampInt16(value) {
    return Math.max(-32768, Math.min(32767, value));
  }

  function initPad() {
    var rect = canvas.getBoundingClientRect();
    cssWidth = Math.max(1, Math.round(rect.width));
    cssHeight = Math.max(1, Math.round(rect.height));
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
  }

  function clearPad() {
    points = [];
    lastX = null;
    lastY = null;
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    refresh();
  }

  function addPoint(event) {
    var rect = canvas.getBoundingClientRect();
    var x = Math.round(event.clientX - rect.left);
    var y = Math.round(event.clientY - rect.top);

    if (lastX !== null) {
      var dx = x - lastX;
      var dy = y - lastY;
      // Simplify: a scribble does not need 60 Hz fidelity, and dropping near-duplicate samples is most of what
      // keeps the stored payload small without changing how the signature looks.
      if (dx * dx + dy * dy < MIN_DISTANCE * MIN_DISTANCE) return;
    }
    if (points.length >= MAX_POINTS) return;

    if (lastX !== null) {
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    points.push([x, y]);
    lastX = x;
    lastY = y;
    refresh();
  }

  canvas.addEventListener("pointerdown", function (event) {
    drawing = true;
    lastX = null;
    lastY = null;
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    addPoint(event);
    event.preventDefault();
  });

  canvas.addEventListener("pointermove", function (event) {
    if (!drawing) return;
    addPoint(event);
    event.preventDefault();
  });

  function endStroke() {
    drawing = false;
    lastX = null;
    lastY = null;
  }
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);
  canvas.addEventListener("pointerleave", endStroke);

  if (clearButton) {
    clearButton.addEventListener("click", function () {
      clearPad();
    });
  }

  function bytesToBase64(bytes) {
    var binary = "";
    for (var index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
    return btoa(binary);
  }

  /**
   * `path/v1`: the canvas size, then each point as a signed 16-bit delta from the previous one.
   *
   * Self-describing on purpose — the canvas dimensions travel with the points, so the renderer does not have to
   * know what the layout was on the day it was signed, and a later redesign cannot silently distort old records.
   */
  function encodePath() {
    var buffer = new ArrayBuffer(4 + points.length * 4);
    var view = new DataView(buffer);
    view.setInt16(0, cssWidth, true);
    view.setInt16(2, cssHeight, true);

    var offset = 4;
    var previousX = 0;
    var previousY = 0;
    for (var index = 0; index < points.length; index += 1) {
      // Clamped because a delta outside a signed 16-bit range would wrap, and the renderer would draw a stroke
      // clean across the page. Unreachable at these canvas sizes, which is exactly why it must not be assumed.
      var dx = clampInt16(points[index][0] - previousX);
      var dy = clampInt16(points[index][1] - previousY);
      view.setInt16(offset, dx, true);
      view.setInt16(offset + 2, dy, true);
      offset += 4;
      previousX += dx;
      previousY += dy;
    }

    return {
      format: "path/v1",
      payload: bytesToBase64(new Uint8Array(buffer)),
      pointCount: points.length
    };
  }

  /**
   * The fallback, which should never run. WebP encoding is not universal, so the returned prefix is verified
   * rather than assumed. Only the raw base64 is sent — never a full data URL, which would waste a third of the
   * payload on a header the server does not need.
   */
  function encodeRaster() {
    var webp = canvas.toDataURL("image/webp");
    if (webp.indexOf("data:image/webp,") === 0) {
      return { format: "image/webp", payload: webp.slice("data:image/webp,".length) };
    }
    var png = canvas.toDataURL("image/png");
    return { format: "image/png", payload: png.slice("data:image/png;base64,".length) };
  }

  function encodeSignature() {
    try {
      return encodePath();
    } catch (error) {
      return encodeRaster();
    }
  }

  // --- gating -------------------------------------------------------------------------
  function refresh() {
    var signed = points.length > 0;
    var named = nameInput.value.trim().length >= 3;
    submit.disabled = !(signed && named && input.value.trim() === phrase && ack.checked);
  }

  input.addEventListener("input", refresh);
  ack.addEventListener("change", refresh);
  nameInput.addEventListener("input", refresh);

  initPad();
  refresh();
  window.addEventListener("resize", function () {
    // The payload carries its own dimensions, so a resize after signing does not corrupt the evidence. Re-sizing
    // the canvas would only clear it, which is why this deliberately does not.
  });

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
      var signature = encodeSignature();

      var body = {
        action: "delete_account",
        confirm: input.value.trim(),
        acknowledgement_version: acknowledgementVersion,
        contract_version: contractVersion,
        signer_full_name: nameInput.value.trim(),
        signature_format: signature.format,
        signature_payload: signature.payload
      };
      if (signature.pointCount) body.signature_point_count = signature.pointCount;

      var response = await fetch("/profile-data", {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, headers),
        body: JSON.stringify(body)
      });

      var result = await window.FranchiseFetch.readJson(response, "Permintaan gagal diproses.");

      // The server owns the wording: only it knows whether the account was actually blocked and erased.
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
