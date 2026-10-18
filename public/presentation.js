/* ManuOS product film. A deterministic visual timeline, not an operational client.
 * Every example is illustrative; this file performs no API requests or domain writes.
 */
(() => {
  'use strict';
  const scenes = [...document.querySelectorAll('.scene')];
  const durations = scenes.map(scene => Number(scene.dataset.duration) * 1000);
  const offsets = durations.map((_, i) => durations.slice(0, i).reduce((a, b) => a + b, 0));
  const total = durations.reduce((a, b) => a + b, 0);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = window.matchMedia('(max-width: 900px)');
  const byId = id => document.getElementById(id);
  const player = byId('player');
  const playButton = byId('play');
  const seek = byId('seek');
  const status = byId('playback-status');
  const params = new URLSearchParams(location.search);
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => 1 - Math.pow(1 - clamp(value), 4);
  const format = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  let position = 0;
  let index = -1;
  let playing = false;
  let ready = false;
  let previousTime = null;
  let frame = null;
  let resumeAfterVisibility = false;
  const cues = scenes.map(scene => [...scene.querySelectorAll('[data-cue]')].map(el => ({ el, at: Number(el.dataset.cue) * 1000 })));
  const chapterButtons = scenes.map((scene, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${String(i + 1).padStart(2, '0')} ${['Handoffs', 'Quantities', 'Disruption', 'ManuOS', 'Ask AI', 'AI drafts', 'Recovery', 'Evidence', 'Explore', 'Closing'][i]}`;
    button.title = scene.dataset.title;
    button.setAttribute('aria-label', `Scene ${i + 1}: ${scene.dataset.title}`);
    button.addEventListener('click', () => jump(offsets[i]));
    byId('chapters').append(button);
    return button;
  });
  seek.max = String(total);
  const initialScene = Number(params.get('scene') || location.hash.replace('#scene-', '') || 1);
  if (Number.isInteger(initialScene) && initialScene >= 1 && initialScene <= scenes.length) position = offsets[initialScene - 1];

  function updateControls() {
    playButton.textContent = playing ? 'Pause' : position >= total ? 'Replay film' : 'Play film';
    playButton.setAttribute('aria-label', playing ? 'Pause presentation' : position >= total ? 'Replay presentation' : 'Play presentation');
    playButton.setAttribute('aria-pressed', String(playing));
    status.textContent = !ready ? 'Loading assets…' : position >= total ? 'Complete · Home to restart' : playing ? 'Playing' : 'Paused · Space to play';
    byId('previous').disabled = index <= 0;
    byId('next').disabled = index >= scenes.length - 1;
  }

  function render() {
    const nextIndex = Math.max(0, offsets.findLastIndex(offset => position >= offset));
    if (nextIndex !== index) {
      index = nextIndex;
      scenes.forEach((scene, i) => {
        const active = i === index;
        scene.hidden = !active;
        scene.classList.toggle('active', active);
        scene.inert = !active;
        scene.setAttribute('aria-hidden', String(!active));
        chapterButtons[i].setAttribute('aria-current', active ? 'step' : 'false');
      });
      byId('chapter-name').textContent = scenes[index].dataset.title;
      byId('scene-count').textContent = `${String(index + 1).padStart(2, '0')} / ${scenes.length}`;
      // Hash is shareable and never creates a new browser-history entry during playback.
      history.replaceState(null, '', `${location.pathname}${location.search}#scene-${index + 1}`);
      updateControls();
    }
    // Keep the authored shot/cue sequence intact when the editorial runtime changes.
    const sceneElapsed = position - offsets[index];
    const storyDuration = Number(scenes[index].dataset.storyDuration || scenes[index].dataset.duration) * 1000;
    const elapsed = sceneElapsed * storyDuration / durations[index];
    const scene = scenes[index];
    const entrance = playing ? ease(elapsed / (reducedMotion.matches ? 200 : 950)) : 1;
    scene.style.opacity = String(.2 + .8 * entrance);
    scene.style.translate = reducedMotion.matches || narrow.matches ? 'none' : `${(1 - entrance) * 26}px 0`;
    // Each scene has a different visual job. Photo pans, evidence focus, and recovery
    // scrutiny are time-authored and seekable, with no background animation timers.
    const camera = scene.querySelector('[data-camera]');
    if (camera) {
      let scale = 1, x = 0, y = 0;
      if (!reducedMotion.matches && !narrow.matches) {
        const type = camera.dataset.camera;
        if (type === 'photo') { scale = 1 + .025 * clamp(sceneElapsed / durations[index]); x = -3 * clamp(sceneElapsed / durations[index]); }
        if (type === 'quantity') { scale = 1 + .025 * ease((elapsed - 4000) / 2000); y = -4 * ease((elapsed - 4000) / 2000); }
        if (type === 'assistant') { const focus = ease((elapsed - 10500) / 1800); scale = 1 + .045 * focus; y = -9 * focus; x = -5 * focus; }
        if (type === 'draft') { const focus = ease((elapsed - 4800) / 1800); scale = 1 + .025 * focus; y = -5 * focus; }
        if (type === 'recovery') { scale = 1 + .018 * ease((elapsed - 9000) / 1800); }
        if (type === 'passport') { scale = 1 + .025 * ease((elapsed - 7000) / 2500); y = -5 * ease((elapsed - 7000) / 2500); }
      }
      camera.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
    }
    cues[index].forEach(({ el, at }) => {
      const visible = elapsed >= at;
      el.classList.toggle('cue-visible', visible);
      el.inert = !visible;
      el.setAttribute('aria-hidden', String(!visible));
      if (!visible) return;
      const p = ease((elapsed - at) / (reducedMotion.matches ? 180 : 850));
      el.style.opacity = String(p);
      let x = 0, y = 0, clip = 'none';
      if (!reducedMotion.matches) {
        if (el.classList.contains('answer-line')) clip = `inset(0 ${(1 - p) * 100}% 0 0)`;
        else if (el.classList.contains('chain-line')) el.style.scale = `${p} 1`;
        else if (el.classList.contains('revision-record')) { x = (el.classList.contains('new-record') ? 28 : -28) * (1 - p); y = -8 * (1 - p); }
        else if (el.classList.contains('source-inspector')) { y = (1 - p) * 45; clip = `inset(0 0 ${(1 - p) * 100}% 0)`; }
        else if (el.classList.contains('recovery-step')) { x = (1 - p) * 22; }
        else if (el.closest('.evidence-timeline')) { x = (1 - p) * 16; }
        else if (el.classList.contains('quantity-complete') || el.classList.contains('quantity-remaining')) clip = `inset(0 ${(1 - p) * 100}% 0 0)`;
        else if (el.classList.contains('reveal-logo')) { y = (1 - p) * 24; el.style.scale = String(.94 + .06 * p); }
        else y = (1 - p) * 12;
      } else { el.style.scale = '1'; }
      el.style.translate = `${x}px ${y}px`;
      el.style.clipPath = clip;
    });
    seek.value = String(Math.round(position));
    seek.setAttribute('aria-valuetext', `${format(position)} of ${format(total)}; ${scene.dataset.title}`);
    byId('timecode').textContent = `${format(position)} / ${format(total)}`;
  }

  function tick(now) {
    frame = null;
    if (!playing) return;
    if (previousTime !== null) position = Math.min(total, position + now - previousTime);
    previousTime = now;
    render();
    if (position >= total) { pause(); return; }
    frame = requestAnimationFrame(tick);
  }
  function pause() {
    playing = false;
    previousTime = null;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    updateControls();
  }
  function play() {
    if (!ready || document.hidden || playing) return;
    if (position >= total) jump(0);
    playing = true;
    previousTime = null;
    updateControls();
    frame = requestAnimationFrame(tick);
  }
  function togglePlay() { if (playing) pause(); else play(); }
  function jump(value) {
    position = Math.max(0, Math.min(total, value));
    previousTime = null;
    render();
    if (position >= total) pause();
    updateControls();
  }
  function setRecording(recording) {
    document.body.classList.toggle('recording', recording);
    player.inert = recording;
    byId('record').setAttribute('aria-pressed', String(recording));
    if (recording && player.contains(document.activeElement)) document.activeElement.blur();
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { status.textContent = 'Fullscreen unavailable. Use your browser fullscreen control.'; }
  }
  playButton.addEventListener('click', togglePlay);
  byId('previous').addEventListener('click', () => jump(offsets[Math.max(0, index - 1)]));
  byId('next').addEventListener('click', () => jump(offsets[Math.min(scenes.length - 1, index + 1)]));
  byId('replay').addEventListener('click', () => { jump(0); play(); });
  byId('record').addEventListener('click', () => setRecording(!document.body.classList.contains('recording')));
  byId('fullscreen').addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', () => byId('fullscreen').setAttribute('aria-pressed', String(Boolean(document.fullscreenElement))));
  seek.addEventListener('input', () => jump(Number(seek.value)));
  window.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    if (event.key === 'Escape') { setRecording(false); return; }
    if (event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    // Preserve native Space activation on focused controls; other film shortcuts
    // remain usable immediately after clicking Play or a chapter.
    if (event.code === 'Space' && event.target.closest('button,a')) return;
    if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); jump(offsets[Math.min(scenes.length - 1, index + 1)]); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); jump(offsets[Math.max(0, index - 1)]); }
    if (event.key === 'Home') { event.preventDefault(); jump(0); play(); }
    if (event.key.toLowerCase() === 'r') setRecording(!document.body.classList.contains('recording'));
    if (event.key.toLowerCase() === 'f') toggleFullscreen();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { resumeAfterVisibility = playing; pause(); }
    else if (resumeAfterVisibility) { resumeAfterVisibility = false; play(); }
  });
  reducedMotion.addEventListener('change', render);
  narrow.addEventListener('change', render);
  window.addEventListener('pagehide', pause);
  setRecording(params.get('record') === '1');
  render();
  // Asset loading is bounded: failed media must never prevent the deck from starting.
  const assets = Promise.allSettled([
    document.fonts.ready,
    ...[...document.images].map(img => img.decode ? img.decode() : Promise.resolve()),
  ]);
  let loadingTimeout;
  Promise.race([assets, new Promise(resolve => { loadingTimeout = setTimeout(resolve, 8000); })]).then(() => {
    clearTimeout(loadingTimeout);
    ready = true;
    updateControls();
    if (params.get('autoplay') === '1' && !reducedMotion.matches) play();
  });
})();
