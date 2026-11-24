import { startApp } from "./app.js";
import { createUi } from "./ui.js";

const canvas = document.getElementById("view");
const ui = createUi(document);

startApp({ canvas, ui }).catch((error) => {
  const node = document.getElementById("boot-error");
  const message = error && error.message ? error.message : "Unable to start";
  if (node) node.textContent = message;
  console.warn("heads-or-tails: boot failed", error);
});
