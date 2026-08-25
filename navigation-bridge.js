window.addEventListener('main:navigate', event => {
  const view = event.detail;
  if (!view) return;
  const button = document.querySelector(`[data-view="${CSS.escape(view)}"]`);
  if (button) button.click();
});
