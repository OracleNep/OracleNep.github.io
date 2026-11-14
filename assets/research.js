(() => {
  const contents = document.querySelector('.toc details');
  if (!contents) return;

  const compact = window.matchMedia('(max-width: 920px)');
  const updateContents = () => { contents.open = !compact.matches; };
  updateContents();
  compact.addEventListener('change', updateContents);
})();
