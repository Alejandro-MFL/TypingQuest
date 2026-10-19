// Punto de entrada: conectará el motor del juego (game.js) con la interfaz (ui.js).
// T1: solo comprueba que los módulos ES se cargan correctamente.

function init() {
  const textDisplay = document.getElementById('text-display');
  textDisplay.textContent = 'TypingQuest listo. El texto de práctica aparecerá aquí.';
}

document.addEventListener('DOMContentLoaded', init);
