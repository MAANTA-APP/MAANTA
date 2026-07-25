/*
 * support.js — MAANTA Mobile Wireframes · Claim & Till
 * Progressive-enhancement interactivity for the wireframe canvas.
 * Everything degrades to a static, readable wireframe if JS is off.
 * No dependencies, no network.
 */
(function () {
  "use strict";

  /* ---- Till keypad: type a 6-digit code into the OTP cells --------------- */
  // A keypad frame wires [data-key] buttons to the [data-otp] cell group in
  // the same frame. Digits fill left-to-right; "back" deletes; "clear" resets.
  function wireKeypad(frame) {
    var cells = Array.prototype.slice.call(frame.querySelectorAll("[data-otp] > *"));
    if (!cells.length) return;
    var buf = [];

    function render() {
      cells.forEach(function (cell, i) {
        cell.textContent = buf[i] || "";
        cell.classList.toggle("is-filled", i < buf.length);
        cell.classList.toggle("is-cursor", i === buf.length);
      });
      var status = frame.querySelector("[data-otp-status]");
      if (status) status.hidden = buf.length !== cells.length;
    }

    frame.querySelectorAll("[data-key]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var k = btn.getAttribute("data-key");
        if (k === "back") buf.pop();
        else if (k === "clear") buf = [];
        else if (buf.length < cells.length && /^[0-9]$/.test(k)) buf.push(k);
        render();
      });
    });
    render();
  }

  /* ---- State switchers: flip a frame between labelled variants ----------- */
  // [data-switch] buttons show the matching [data-state] panel in their frame.
  function wireSwitch(group) {
    var frame = group.closest("[data-frame]") || group.parentElement;
    var buttons = Array.prototype.slice.call(group.querySelectorAll("[data-switch]"));
    var panels = Array.prototype.slice.call(frame.querySelectorAll("[data-state]"));
    if (!buttons.length || !panels.length) return;

    function show(name) {
      panels.forEach(function (p) { p.hidden = p.getAttribute("data-state") !== name; });
      buttons.forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-switch") === name));
      });
    }
    buttons.forEach(function (b) {
      b.addEventListener("click", function () { show(b.getAttribute("data-switch")); });
    });
    show(buttons[0].getAttribute("data-switch"));
  }

  /* ---- Bottom sheet demo: open/close the claim confirm sheet ------------- */
  function wireSheet(root) {
    document.querySelectorAll("[data-sheet-open]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = document.getElementById(btn.getAttribute("data-sheet-open"));
        if (target) target.hidden = false;
      });
    });
    document.querySelectorAll("[data-sheet-close]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sheet = btn.closest("[data-sheet]");
        if (sheet) sheet.hidden = true;
      });
    });
  }

  function init() {
    document.querySelectorAll("[data-keypad]").forEach(wireKeypad);
    document.querySelectorAll("[data-switch-group]").forEach(wireSwitch);
    wireSheet(document);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
