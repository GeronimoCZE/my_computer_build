// Example builds: the builder's starting points and the /builds pages.
// Prices, power and FPS on those pages come from the engine, so only the words live here.

export const PRESETS = [
  {
    slug: 'budget-1080p-gaming-pc',
    name: 'Budget 1080p',
    title: 'Budget 1080p gaming PC',
    tag: 'Arc B580',
    summary: 'A Ryzen 5 5600 and an Intel Arc B580 on a B550 board: a low-cost AM4 build for high settings at 1080p.',
    intro: 'The cheapest build here that still plays new games well. AM4 keeps the board and DDR4 memory inexpensive, the Ryzen 5 5600 runs fine on its bundled cooler, and the Arc B580’s 12 GB of video memory gives it room that 8 GB cards no longer have at 1080p. The 650 W supply leaves space for a faster card later.',
    resolution: '1080p',
    build: { case: 'case-nzxt-h5-flow', motherboard: 'mb-asus-b550-plus', cpu: 'cpu-r5-5600', cooler: null, ram: 'ram-corsair-lpx-16-3200', gpu: 'gpu-arc-b580-le', psu: 'psu-bequiet-pp12m-650', storage: ['ssd-crucial-p3plus-1tb'] },
  },
  {
    slug: '1440p-gaming-pc',
    name: '1440p sweet spot',
    title: '1440p gaming PC with a Ryzen 7 7800X3D',
    tag: 'RX 9070 XT',
    summary: 'Ryzen 7 7800X3D and Radeon RX 9070 XT in a compact mATX case: high refresh rate 1440p gaming on AM5.',
    intro: 'The balanced choice for a 1440p monitor. The 7800X3D’s extra cache keeps frame rates high in CPU-heavy games, and the RX 9070 XT has 16 GB of video memory. Everything fits in a Micro-ATX case, and the AM5 socket takes future Ryzen chips.',
    resolution: '1440p',
    build: { case: 'case-jonsbo-d31', motherboard: 'mb-gb-b650m-elite', cpu: 'cpu-r7-7800x3d', cooler: 'cool-thermalright-pa120se', ram: 'ram-gskill-z5neo-32-6000', gpu: 'gpu-rx9070xt-pulse', psu: 'psu-seasonic-gx750', storage: ['ssd-wd-sn850x-1tb'] },
  },
  {
    slug: '4k-gaming-pc-rtx-5090',
    name: '4K flagship',
    title: '4K gaming PC with an RTX 5090',
    tag: 'RTX 5090',
    summary: 'Ryzen 7 9800X3D, GeForce RTX 5090 and a 360 mm liquid cooler: a no-compromise 4K gaming build.',
    intro: 'The fastest gaming parts in the catalog. The RTX 5090 draws up to 575 W through a single 16-pin connector, so the build uses a 1600 W ATX 3.0 supply with a native cable. A 360 mm AIO and the airy O11 Dynamic EVO keep it cool.',
    resolution: '4K',
    build: { case: 'case-lianli-o11-evo', motherboard: 'mb-asus-x870e-e', cpu: 'cpu-r7-9800x3d', cooler: 'cool-arctic-lf3-360', ram: 'ram-corsair-veng-64-6000', gpu: 'gpu-rtx5090-fe', psu: 'psu-seasonic-tx1600', storage: ['ssd-crucial-t705-2tb', 'ssd-samsung-990pro-2tb'] },
  },
  {
    slug: 'dual-gpu-workstation',
    name: 'Dual-GPU workstation',
    title: 'Dual-GPU workstation with two RTX 5080s',
    tag: '2× RTX 5080',
    summary: 'Ryzen 9 9950X, two GeForce RTX 5080 cards and 64 GB of DDR5 for rendering and AI work.',
    intro: 'Built for work that uses every card, such as rendering and machine learning. Two memory kits fill all four DIMM slots for 64 GB, and three drives give fast scratch space and bulk storage. Games use only one of the two cards, so the FPS figures match a single RTX 5080.',
    resolution: '4K',
    build: { case: 'case-fractal-north', motherboard: 'mb-asus-x870e-e', cpu: 'cpu-r9-9950x', cooler: 'cool-arctic-lf3-360', ram: 'ram-crucial-pro-32-5600', gpu: 'gpu-rtx5080-fe', psu: 'psu-seasonic-tx1600', storage: ['ssd-samsung-990pro-2tb', 'ssd-samsung-990pro-2tb', 'hdd-wd-blue-4tb'], qty: { ram: 2, gpu: 2 } },
  },
  {
    slug: 'used-gtx-1080-gaming-pc',
    name: 'Pascal classic 2017',
    title: 'Used GTX 1080 gaming PC (2017)',
    tag: 'GTX 1080',
    summary: 'Core i7-7700K and GeForce GTX 1080 on Z270: a classic 2017 build that is cheap to put together from used parts.',
    intro: 'A high-end PC from 2017 that now sells for little on the used market. It still runs esports games at high frame rates and older AAA games well at 1080p. Check used parts carefully: ask for photos of the CPU pins and a stress-test screenshot for the graphics card.',
    resolution: '1080p',
    build: { case: 'case-nzxt-s340', motherboard: 'mb-asus-prime-z270-a', cpu: 'cpu-i7-7700k', cooler: 'cool-cm-hyper212', ram: 'ram-corsair-lpx-16-2400', gpu: 'gpu-gtx1080-fe', psu: 'psu-corsair-cx550m', storage: ['ssd-samsung-850evo-500gb'] },
  },
  {
    slug: 'retro-2014-gaming-pc',
    name: 'Retro 2014 rig',
    title: 'Retro 2014 gaming PC with a Core i7-4790K',
    tag: 'i7-4790K',
    summary: 'Core i7-4790K, DDR3 and a GTX 1080 Ti: a Haswell-era build revived with the fastest card of its time.',
    intro: 'A Devil’s Canyon i7 on Z97 with DDR3, paired with a GTX 1080 Ti. The quad-core CPU holds the card back in newer games, which the FPS estimates show as CPU-limited. The 500 W supply is tight for this card, so the checker flags it.',
    resolution: '1080p',
    build: { case: 'case-nzxt-h510', motherboard: 'mb-asus-z97-a', cpu: 'cpu-i7-4790k', cooler: 'cool-cm-hyper212', ram: 'ram-hyperx-fury-16-1866', gpu: 'gpu-gtx1080ti-fe', psu: 'psu-evga-500w1', storage: ['ssd-samsung-870evo-1tb', 'hdd-seagate-barracuda-2tb'] },
  },
];

export const presetBySlug = (slug) => PRESETS.find((p) => p.slug === slug) || null;
