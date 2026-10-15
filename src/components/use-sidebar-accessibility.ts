'use client';
import { useEffect } from 'react';
import { useGraphStore } from '@/store/graph-store';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
export function useSidebarAccessibility() {
 const open=useGraphStore(s=>s.isNavMenuOpen),collapsed=useGraphStore(s=>s.isSidebarCollapsed);
 useEffect(()=>{
  const sidebar=document.getElementById('sidebar');const workspace=document.querySelector<HTMLElement>('.workspace');const media=window.matchMedia('(max-width: 850px)');
  let release:(()=>void)|undefined;
  const focusables=()=>sidebar?Array.from(sidebar.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]')).filter(element=>element.getClientRects().length>0):[];
  function update(){
   release?.();release=undefined;
   if(sidebar)sidebar.inert=media.matches?!open:collapsed;
   if(workspace)workspace.inert=media.matches&&open;
   if(media.matches&&open){release=lockBodyScroll();focusables()[0]?.focus();}
  }
  function trap(event:KeyboardEvent){if(!media.matches||!open||event.key!=='Tab')return;const elements=focusables();if(!elements.length)return;const first=elements[0],last=elements[elements.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
  update();media.addEventListener('change',update);document.addEventListener('keydown',trap);
  return()=>{release?.();media.removeEventListener('change',update);document.removeEventListener('keydown',trap);if(sidebar)sidebar.inert=false;if(workspace)workspace.inert=false;if(open&&media.matches)document.querySelector<HTMLElement>('.menu-toggle')?.focus()};
 },[open,collapsed]);
}
