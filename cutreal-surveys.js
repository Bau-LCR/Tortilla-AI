/* CUT-REAL SURVEYS · selección múltiple y evaluación local */
(function () {
  'use strict';
  function evaluate(form) {
    const questions = [...form.querySelectorAll('[data-question]')];
    let answered = 0, correct = 0, known = 0;
    questions.forEach(question => {
      const selected = question.querySelector('input[type="radio"]:checked');
      const expected = question.dataset.correct || '';
      if (selected) answered++;
      if (expected) { known++; if (selected?.value === expected) correct++; }
      question.querySelectorAll('.survey-option').forEach(option => option.classList.remove('is-correct', 'is-wrong'));
      if (selected) selected.closest('.survey-option')?.classList.add(expected && selected.value === expected ? 'is-correct' : 'is-wrong');
      if (expected) question.querySelector(`input[value="${CSS.escape(expected)}"]`)?.closest('.survey-option')?.classList.add('is-correct');
    });
    const percent = known ? Math.round((correct / known) * 100) : 0;
    const result = form.querySelector('.survey-result');
    if (result) {
      result.hidden = false;
      result.innerHTML = known ? `<strong>Resultado: ${percent}%</strong><span>${correct} de ${known} respuestas correctas · ${answered} respondidas</span>` : `<strong>Respuestas registradas</strong><span>La IA debe proporcionar la clave correcta para calcular un porcentaje.</span>`;
    }
    const aiButton = form.querySelector('[data-survey-ai]');
    if (aiButton) { aiButton.hidden = false; aiButton.dataset.prompt = `Analiza mi examen. Resultado: ${percent}%. Respondí ${answered} preguntas y acerté ${correct} de ${known} con clave disponible. Explica mis errores de forma clara.`; }
  }
  document.addEventListener('submit', event => { const form = event.target.closest('.chat-survey'); if (!form) return; event.preventDefault(); evaluate(form); });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-survey-ai]');
    if (!button) return;
    const input = document.getElementById('input');
    if (input) { input.value = button.dataset.prompt || 'Analiza el resultado de mi encuesta.'; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); }
  });
})();
