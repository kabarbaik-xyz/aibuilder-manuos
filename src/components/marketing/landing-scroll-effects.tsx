'use client';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';

export function LandingScrollEffects() {
 const [visible,setVisible]=useState(false);
 useEffect(()=>{
  const update=()=>setVisible(window.scrollY>Math.max(360,window.innerHeight*0.6));
  update();window.addEventListener('scroll',update,{passive:true});
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const animations=new Set<Animation>();
  // Visible by default: unsupported browsers or disabled JS never hide content.
  const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>{
   for(const entry of entries) {
    if(!entry.isIntersecting) continue;
    observer?.unobserve(entry.target);
    if(media.matches||!entry.target.animate) continue;
    const animation=entry.target.animate([{opacity:0,transform:'translateY(20px)'},{opacity:1,transform:'translateY(0)'}],{duration:560,easing:'cubic-bezier(0.16, 1, 0.3, 1)'});
    animations.add(animation);animation.onfinish=()=>animations.delete(animation);
   }
  },{threshold:0.08,rootMargin:'0px 0px -24px 0px'}):null;
  document.querySelectorAll('.landing-container main > section:not(.l-hero-v3) > .l-section-inner').forEach(element=>observer?.observe(element));
  const reduce=()=>{if(media.matches)animations.forEach(animation=>animation.cancel());};
  media.addEventListener('change',reduce);
  return ()=>{window.removeEventListener('scroll',update);media.removeEventListener('change',reduce);observer?.disconnect();animations.forEach(animation=>animation.cancel());};
 },[]);
 return visible?<button type="button" className="l-back-to-top" aria-label="Back to top" title="Back to top" onClick={()=>{window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});document.getElementById('main-content')?.focus({preventScroll:true});}}><Icon name="arrow-left"/></button>:null;
}
