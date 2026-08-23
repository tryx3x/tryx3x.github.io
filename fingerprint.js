(function (global) {
  "use strict";

  var STORAGE_KEY = "nms_device_uuid";
  var SESSION_KEY = "nms_session_start";

  function getOrCreateDeviceUuid() {
    try {
      var existing = localStorage.getItem(STORAGE_KEY);
      if (existing) return existing;
      var fresh = randomUuid();
      localStorage.setItem(STORAGE_KEY, fresh);
      return fresh;
    } catch (e) {
      return randomUuid();
    }
  }

  function randomUuid() {
    if (global.crypto && global.crypto.randomUUID) {
      return global.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  async function sha256Hex(input) {
    try {
      var data = typeof input === "string" ? new TextEncoder().encode(input) : input;
      var digest = await global.crypto.subtle.digest("SHA-256", data);
      var bytes = new Uint8Array(digest);
      var hex = "";
      for (var i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, "0");
      }
      return hex;
    } catch (e) {
      return "";
    }
  }

  function getCanvasDataUrl() {
    try {
      var canvas = document.createElement("canvas");
      canvas.width = 260;
      canvas.height = 60;
      var ctx = canvas.getContext("2d");
      if (!ctx) return "";

      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = "#f60";
      ctx.fillRect(0, 0, 100, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("NightmareSpire, Шпиль 🜏 <canvas> 1.0", 2, 15);
      ctx.fillStyle = "rgba(102, 200, 0, 0.6)";
      ctx.fillText("NightmareSpire, Шпиль 🜏 <canvas> 1.0", 4, 25);
      ctx.beginPath();
      ctx.arc(220, 30, 20, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.fillStyle = "rgba(200, 20, 60, 0.7)";
      ctx.fill();

      return canvas.toDataURL();
    } catch (e) {
      return "";
    }
  }

  function getWebglInfo() {
    var result = { hashSource: "", vendor: "", renderer: "" };
    try {
      var canvas = document.createElement("canvas");
      var gl =
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl");
      if (!gl) return result;

      var debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        result.vendor = String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "");
        result.renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "");
      } else {
        result.vendor = String(gl.getParameter(gl.VENDOR) || "");
        result.renderer = String(gl.getParameter(gl.RENDERER) || "");
      }

      var parts = [
        result.vendor,
        result.renderer,
        String(gl.getParameter(gl.VERSION) || ""),
        String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION) || ""),
        (gl.getSupportedExtensions() || []).join(","),
      ];
      result.hashSource = parts.join("|");
    } catch (e) {
    }
    return result;
  }

  function getAudioFingerprint() {
    return new Promise(function (resolve) {
      try {
        var AudioCtx = global.OfflineAudioContext || global.webkitOfflineAudioContext;
        if (!AudioCtx) return resolve("");

        var context = new AudioCtx(1, 44100, 44100);
        var oscillator = context.createOscillator();
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(10000, context.currentTime);

        var compressor = context.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-50, context.currentTime);
        compressor.knee.setValueAtTime(40, context.currentTime);
        compressor.ratio.setValueAtTime(12, context.currentTime);
        compressor.attack.setValueAtTime(0, context.currentTime);
