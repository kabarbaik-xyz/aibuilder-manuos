let locks = 0;
let previous = '';
export function lockBodyScroll() {
  if (!locks++) { previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
  let released = false;
  return () => { if (!released) { released = true; if (!--locks) document.body.style.overflow = previous; } };
}
