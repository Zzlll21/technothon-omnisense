(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelector('omni-office')?.addEventListener('office-node-select', event => {
    const one = event.detail.id === 'node-01';
    document.querySelector('.sensor-caption').textContent = `Node ${one ? '01' : '02'} · Vacant · fresh ${one ? '6' : '12'}s ago · valid evidence`;
  });
  const receiptToggle = document.querySelector('.receipt-toggle');
  receiptToggle.addEventListener('click', event => {
    const open = receiptToggle.getAttribute('aria-expanded') !== 'true';
    receiptToggle.setAttribute('aria-expanded', String(open));
    receiptToggle.querySelector('span').textContent = open ? '−' : '+';
    const report = document.getElementById('reported-output');
    if (window.gsap) {
      gsap.killTweensOf(report);
      gsap.set(report, {clearProps:'opacity,transform'});
    }
    report.hidden = !open;
    if (open && event.detail > 0 && window.gsap) {
      const from = reduce.matches ? {opacity:0} : {opacity:0,y:6};
      gsap.fromTo(report, from, {opacity:1,y:0,duration:reduce.matches ? .2 : .25,ease:'power2.out',clearProps:'opacity,transform'});
    }
  });
  if (!window.gsap || !window.ScrollTrigger) {
    document.body.classList.add('static-story');
    return;
  }
  gsap.registerPlugin(ScrollTrigger);
  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    gsap.from('.hero-enter', {y:24,opacity:0,duration:.8,stagger:.06,ease:'power3.out',clearProps:'transform,opacity'});
    gsap.utils.toArray('.reveal').forEach(element => gsap.from(element, {y:30,opacity:0,duration:.75,ease:'power3.out',scrollTrigger:{trigger:element,start:'top 92%',once:true},clearProps:'transform,opacity'}));
  });
  mm.add('(min-width: 801px) and (min-height: 680px) and (prefers-reduced-motion: no-preference)', () => {
    // Keep the stage in normal document flow. Native sticky positioning avoids
    // the fixed/transform handoff and generated spacer used by JS pinning.
    document.body.classList.add('scroll-story');
    const section = document.querySelector('.story-section');
    const stage = document.querySelector('.story-pin');
    const panels = gsap.utils.toArray('.story-panel');
    const labels = document.querySelectorAll('.story-progress span');
    let activeIndex = -1;
    // Preserve the original card choreography. A small transition-only blur
    // softens the crossfade without a hard wipe through the headings.
    gsap.set(panels, {filter:'blur(0px)'});
    gsap.set(panels.slice(1), {autoAlpha:0,y:100,scale:.94,filter:'blur(2px)'});
    // A scrubbed story maps directly to native scrolling; no catch-up tween
    // or wheel interception. Reversing scroll reverses the same presentation.
    const sequence = gsap.timeline({defaults:{ease:'none'},onUpdate:()=>{
      const progress = sequence.progress();
      const index = progress < .273 ? 0 : progress < .705 ? 1 : 2;
      if (index === activeIndex) return;
      activeIndex = index;
      labels.forEach((label,i)=>label.classList.toggle('active',i===index));
      panels.forEach((panel,i)=>panel.setAttribute('aria-hidden',String(i!==index)));
    },scrollTrigger:{trigger:section,start:'top 96px',end:()=>`+=${section.offsetHeight-stage.offsetHeight}`,scrub:true,invalidateOnRefresh:true}});
    sequence.to({}, {duration:.35});
    panels.slice(0,-1).forEach((outgoing,index) => {
      if (index > 0) sequence.to({}, {duration:.45});
      const start = sequence.duration();
      const incoming = panels[index+1];
      sequence.to(outgoing, {y:-60,scale:.94,filter:'blur(2px)',duration:.5}, start)
        .to(outgoing, {autoAlpha:0,duration:.3}, start)
        .to(incoming, {y:0,scale:1,filter:'blur(0px)',duration:.5}, start)
        .to(incoming, {autoAlpha:1,duration:.3}, start+.2);
    });
    sequence.to({}, {duration:.4});
    return () => {
      document.body.classList.remove('scroll-story');
      panels.forEach(panel=>panel.removeAttribute('aria-hidden'));
    };
  });
  mm.add('(prefers-reduced-motion: reduce)', () => {
    document.body.classList.add('static-story');
    return () => document.body.classList.remove('static-story');
  });
})();
