/*
 * NightmareFingerprint — восстановлено с нуля 24.08.2026.
 *
 * Исходный fingerprint.js пропал с tryx3x.github.io (404) в районе
 * 12.06.2026, из-за чего антифрод (docs/architecture/antifraud-v2.md)
 * больше двух месяцев не получал ни одного нового device/canvas/WebGL
 * сигнала. Файл реализует ровно тот контракт, который вызывает
 * daily_nms_test.html:
 *
 *   await NightmareFingerprint.collect() -> {
 *     device_uuid, canvas_hash, webgl_hash, webgl_vendor, webgl_renderer,
 *     audio_hash, fonts_hash, combined_hash,
 *     meta: { screen_resolution, color_depth, timezone_offset, language,
 *             platform, hardware_concurrency, device_memory, max_touch_points }
 *   }
 *   NightmareFingerprint.startSession()
 *
 * Это не байт-в-байт восстановление утерянного оригинала (его исходники
 * нигде не найдены), а чистая реализация того же контракта — сервер
 * (web_app/router.py::_process_fingerprint) читает только эти поля по
 * имени, так что для него разницы нет.
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "nms_device_uuid";
  var SESSION_KEY = "nms_session_start";

  // ── device_uuid — стабильный ID устройства/браузера, переживает сессии ──
  function getOrCreateDeviceUuid() {
    try {
      var existing = localStorage.getItem(STORAGE_KEY);
      if (existing) return existing;
      var fresh = randomUuid();
      localStorage.setItem(STORAGE_KEY, fresh);
      return fresh;
    } catch (e) {
      // localStorage недоступен (приватный режим и т.п.) — новый UUID на сессию,
      // не сохраняем, совпадений устройства для этого клиента не будет.
      return randomUuid();
    }
  }

  function randomUuid() {
    if (global.crypto && global.crypto.randomUUID) {
      return global.crypto.randomUUID();
    }
    // Фолбэк на старые движки без crypto.randomUUID.
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ── SHA-256 в hex, через SubtleCrypto (работает в любом контексте GH Pages — https) ──
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

  // ── Canvas fingerprint — рендерим текст+фигуры, хешируем dataURL ──
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

  // ── WebGL fingerprint — vendor/renderer + рендер сцены ──
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
      // оставляем result как есть — частичная деградация допустима
    }
    return result;
  }

  // ── Audio fingerprint — классический OfflineAudioContext-приём ──
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
        compressor.release.setValueAtTime(0.25, context.currentTime);

        oscillator.connect(compressor);
        compressor.connect(context.destination);
        oscillator.start(0);

        var settled = false;
        var finish = function (value) {
          if (settled) return;
          settled = true;
          resolve(value);
        };

        context.oncomplete = function (event) {
          try {
            var samples = event.renderedBuffer.getChannelData(0);
            var sum = 0;
            for (var i = 0; i < samples.length; i++) {
              sum += Math.abs(samples[i]);
            }
            finish(sum.toString());
          } catch (e) {
            finish("");
          }
        };

        context.startRendering();
        // Некоторые движки никогда не зовут oncomplete в фоновой вкладке — не блокируем сбор.
        setTimeout(function () { finish(""); }, 1200);
      } catch (e) {
        resolve("");
      }
    });
  }

  // ── Fonts fingerprint — какие из «редких» шрифтов реально стоят у пользователя ──
  function getFontsSignature() {
    try {
      var baseFonts = ["monospace", "sans-serif", "serif"];
      var testFonts = [
        "Arial", "Verdana", "Times New Roman", "Courier New", "Georgia",
        "Comic Sans MS", "Impact", "Tahoma", "Trebuchet MS", "Segoe UI",
        "PT Sans", "Roboto", "Noto Sans", "Helvetica Neue", "Calibri",
      ];
      var testString = "mmmmmmmmmmlli";
      var testSize = "72px";
      var body = document.body || document.documentElement;

      var span = document.createElement("span");
      span.style.position = "absolute";
      span.style.left = "-9999px";
      span.style.top = "-9999px";
      span.style.fontSize = testSize;
      span.textContent = testString;
      body.appendChild(span);

      var baseSizes = {};
      baseFonts.forEach(function (base) {
        span.style.fontFamily = base;
        baseSizes[base] = span.offsetWidth + "x" + span.offsetHeight;
      });

      var available = [];
      testFonts.forEach(function (font) {
        var detected = baseFonts.some(function (base) {
          span.style.fontFamily = "'" + font + "', " + base;
          return span.offsetWidth + "x" + span.offsetHeight !== baseSizes[base];
        });
        if (detected) available.push(font);
      });

      body.removeChild(span);
      return available.join(",");
    } catch (e) {
      return "";
    }
  }

  function collectMeta() {
    return {
      screen_resolution: (global.screen ? global.screen.width + "x" + global.screen.height : ""),
      color_depth: global.screen ? global.screen.colorDepth : null,
      timezone_offset: new Date().getTimezoneOffset(),
      language: navigator.language || "",
      platform: navigator.platform || "",
      hardware_concurrency: navigator.hardwareConcurrency || null,
      device_memory: navigator.deviceMemory || null,
      max_touch_points: navigator.maxTouchPoints || 0,
    };
  }

  async function collect() {
    var deviceUuid = getOrCreateDeviceUuid();
    var canvasDataUrl = getCanvasDataUrl();
    var webgl = getWebglInfo();
    var meta = collectMeta();

    var canvasHash = canvasDataUrl ? await sha256Hex(canvasDataUrl) : "";
    var webglHash = webgl.hashSource ? await sha256Hex(webgl.hashSource) : "";
    var audioRaw = await getAudioFingerprint();
    var audioHash = audioRaw ? await sha256Hex(audioRaw) : "";
    var fontsSignature = getFontsSignature();
    var fontsHash = fontsSignature ? await sha256Hex(fontsSignature) : "";

    var combinedSource = [
      deviceUuid,
      canvasHash,
      webglHash,
      audioHash,
      fontsHash,
      meta.screen_resolution,
      meta.platform,
      navigator.userAgent || "",
    ].join("|");
    var combinedHash = await sha256Hex(combinedSource);

    return {
      device_uuid: deviceUuid,
      canvas_hash: canvasHash,
      webgl_hash: webglHash,
      webgl_vendor: webgl.vendor,
      webgl_renderer: webgl.renderer,
      audio_hash: audioHash,
      fonts_hash: fontsHash,
      combined_hash: combinedHash,
      meta: meta,
    };
  }

  // ── Session tracking — best-effort сигнал начала/конца сессии ──────────
  // tg.sendData() пригоден только пока WebApp открыт: на pagehide/visibilitychange
  // пытаемся отправить action="session_end", но Telegram может закрыть WebApp
  // раньше, чем сообщение уйдёт — сервер это уже учитывает (просто не получит
  // событие в редких случаях, не критично для антифрода).
  function startSession() {
    try {
      var startedAt = Date.now();
      sessionStorage.setItem(SESSION_KEY, String(startedAt));

      var deviceUuid = getOrCreateDeviceUuid();
      var tg = global.Telegram && global.Telegram.WebApp;
      if (!tg || !tg.sendData) return;

      var sendEnd = function (endReason) {
        try {
          var durationSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
          tg.sendData(JSON.stringify({
            action: "session_end",
            device_uuid: deviceUuid,
            duration_seconds: durationSeconds,
            end_reason: endReason,
          }));
        } catch (e) {
          // WebApp уже закрыт — ничего не поделать, это ожидаемо.
        }
      };

      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") sendEnd("hidden");
      });
      global.addEventListener("pagehide", function () {
        sendEnd("close");
      });
    } catch (e) {
      // Сессионный трекинг — best-effort, не должен ронять основной флоу.
    }
  }

  global.NightmareFingerprint = {
    collect: collect,
    startSession: startSession,
  };
})(window);
