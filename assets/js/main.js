(function () {
    'use strict';

    var $ = function (s, c) { return (c || document).querySelector(s); };
    var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- preloader ---------- */
    (function () {
        var bar = $('#plBar'), pre = $('#preloader'), done = false;
        if (!bar || !pre) return; /* pages without a preloader (service pages) skip this block */
        var MIN_SHOW = 2400, begin = performance.now(), tick = 0, last = begin;
        function frame(now) {
            tick += Math.min(now - last, 90);
            last = now;
            var el = (tick - begin) / MIN_SHOW;
            el = Math.max(0, Math.min(1, el));
            var ease = 1 - Math.pow(1 - el, 2);
            bar.style.width = Math.round(ease * 100) + '%';
            if (!done && el < 1) requestAnimationFrame(frame);
            else if (!done) { done = true; setTimeout(function () { pre.classList.add('done'); }, 350); }
        }
        window.addEventListener('load', function () {
            begin = tick;
            requestAnimationFrame(frame);
            setTimeout(function () {
                if (!done) { done = true; pre.classList.add('done'); }
            }, 5600);
        });

        /* falling binary + math-symbol rain */
        (function () {
            var canvas = $('#plRain');
            if (!canvas) return;
            var ctx = canvas.getContext('2d');
            var FONT = 15, cols = [], drops = [], timer;
            var glyphs = '01√φπ∞ΣΔ±≈≠≤≥÷×+=·<>θλ∑∫%';
            function size() {
                var w = canvas.width = innerWidth, h = canvas.height = innerHeight;
                cols.length = 0; drops.length = 0;
                for (var i = 0, n = Math.ceil(w / FONT); i < n; i++) {
                    cols[i] = (Math.random() * h / FONT) | 0;
                }
            }
            function step() {
                ctx.fillStyle = 'rgba(246,245,241,.28)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.font = FONT + 'px ui-monospace, Menlo, monospace';
                ctx.textBaseline = 'top';
                var i, g, y;
                for (i = 0; i < cols.length; i++) {
                    g = glyphs[(Math.random() * glyphs.length) | 0];
                    y = drops[i] * FONT;
                    ctx.fillStyle = 'rgba(59,75,244,' + (0.4 + Math.random() * 0.3) + ')';
                    if (Math.random() < .18) ctx.fillStyle = 'rgba(124,70,232,' + (0.5 + Math.random() * 0.3) + ')';
                    if (Math.random() < .1) ctx.fillStyle = 'rgba(19,18,23,' + (0.45 + Math.random() * 0.3) + ')';
                    ctx.fillText(g, i * FONT, y);
                    if (y > canvas.height && Math.random() > .965) drops[i] = 0;
                    drops[i]++;
                }
            }
            timer = setInterval(step, 50);
            window.addEventListener('resize', size);
            $('#preloader').addEventListener('transitionend', function () {
                clearInterval(timer); ctx.clearRect(0, 0, canvas.width, canvas.height);
            });
            size();
        })();
    })();

    /* ---------- custom cursor ---------- */
    if (window.matchMedia('(pointer: fine)').matches) {
        (function () {
            var ring = $('#cursor'), dot = $('#cursorDot');
            if (!ring || !dot) return; /* no custom cursor markup on this page */
            var rx = innerWidth / 2, ry = innerHeight / 2, dx = rx, dy = ry;
            function move(e) { rx = e.clientX; ry = e.clientY; dot.style.opacity = 1; ring.style.opacity = 1; }
            function loop() {
                dx += (rx - dx) * 0.16; dy += (ry - dy) * 0.16;
                ring.style.transform = 'translate(' + (dx - ring.offsetWidth / 2) + 'px,' + (dy - ring.offsetHeight / 2) + 'px)';
                dot.style.transform = 'translate(' + (rx - 3) + 'px,' + (ry - 3) + 'px)';
                requestAnimationFrame(loop);
            }
            var enter = function (e) {
                var t = e.target;
                while (t && t !== document) {
                    if (t.closest && t.closest('a, button, .btn, input, textarea, .tile, .pcard, .proc, .c-chip, .s-chip')) { ring.classList.add('grow'); return; }
                    t = t.parentNode;
                }
                ring.classList.remove('grow');
            };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseover', enter);
            document.addEventListener('mouseleave', function () { dot.style.opacity = 0; ring.style.opacity = 0; });
            addEventListener('mousemove', move);
            requestAnimationFrame(loop);
        })();
    }

    /* ---------- marquee duplicate (seamless loop) ---------- */
    (function () {
        var track = $('#marqueeTrack');
        if (track) track.innerHTML += track.innerHTML;
    })();

    /* ---------- word rotator ---------- */
    (function () {
        var el = $('#rotateWord');
        if (!el) return;
        var words = ['Digital Experiences', 'Beautiful Interfaces', 'Smart SEO Growth', 'User-First Design', 'Memorable Brands'];
        var i = 0;
        setInterval(function () {
            el.classList.add('out');
            setTimeout(function () {
                i = (i + 1) % words.length;
                el.textContent = words[i];
                el.classList.remove('out');
            }, 500);
        }, 3600);
    })();

    /* ---------- reveal on scroll ---------- */
    (function () {
        if (!('IntersectionObserver' in window)) { $$('[data-reveal]').forEach(function (n) { n.classList.add('in'); }); return; }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
        $$('[data-reveal]').forEach(function (n) {
            var d = n.getAttribute('data-delay');
            if (d) n.style.setProperty('--d', d + 'ms');
            io.observe(n);
        });
    })();

    /* ---------- counters ---------- */
    (function () {
        function go(el) {
            var target = +el.getAttribute('data-count') || 0;
            var suffix = el.getAttribute('data-suffix') || '';
            if (reduced || target === 0) { el.textContent = target + suffix; return; }
            var t0, dur = 1500;
            function step(now) {
                if (!t0) t0 = now;
                var p = Math.min(1, (now - t0) / dur);
                el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
                if (p < 1) requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
        }
        var els = $$('.stat-num');
        if (!('IntersectionObserver' in window)) { els.forEach(go); return; }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) { go(en.target); io.unobserve(en.target); }
            });
        }, { threshold: 0.5 });
        els.forEach(function (el) { io.observe(el); });
    })();

    /* ---------- 3D tilt ---------- */
    if (!reduced && window.matchMedia('(pointer: fine)').matches) {
        $$('[data-tilt]').forEach(function (card) {
            var raf = 0, calc = function (e) {
                var r = card.getBoundingClientRect();
                var px = (e.clientX - r.left) / r.width - 0.5;
                var py = (e.clientY - r.top) / r.height - 0.5;
                requestAnimationFrame(function () {
                    card.style.transform = 'perspective(900px) rotateX(' + (-py * 7) + 'deg) rotateY(' + (px * 8) + 'deg) translateY(-2px)';
                });
            };
            card.addEventListener('mousemove', calc);
            card.addEventListener('mouseleave', function () {
                requestAnimationFrame(function () { card.style.transform = ''; });
            });
        });
    }

    /* ---------- spotlight hover ---------- */
    $$('[data-spot]').forEach(function (el) {
        el.addEventListener('mousemove', function (e) {
            var r = el.getBoundingClientRect();
            el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
            el.style.setProperty('--my', (e.clientY - r.top) + 'px');
        });
    });

    /* ---------- magnetic buttons ---------- */
    if (!reduced && window.matchMedia('(pointer: fine)').matches) {
        $$('.magnetic').forEach(function (el) {
            el.addEventListener('mousemove', function (e) {
                var r = el.getBoundingClientRect();
                var x = e.clientX - (r.left + r.width / 2);
                var y = e.clientY - (r.top + r.height / 2);
                el.style.transform = 'translate(' + x * 0.22 + 'px, ' + y * 0.22 + 'px)';
            });
            el.addEventListener('mouseleave', function () { el.style.transform = ''; });
        });
    }

    /* ---------- hero parallax orbs + chips ---------- */
    (function () {
        var orbA = $('#orbA'), orbB = $('#orbB'), chipA = $('#chipA'), chipB = $('#chipB'), chipC = $('#chipC');
        if (!orbA) return;
        var moves = [];
        var pairs = [[orbA, 24], [orbB, -18], [chipA, 12], [chipB, -10], [chipC, 8]];
        function onMove(e) {
            var cx = e.clientX / innerWidth - 0.5, cy = e.clientY / innerHeight - 0.5;
            pairs.forEach(function (p) {
                var el = p[0]; if (!el) return;
                el.style.translate = (cx * p[1]).toFixed(1) + 'px ' + (cy * p[1]).toFixed(1) + 'px';
            });
        }
        document.querySelector('.hero-inner') && addEventListener('mousemove', onMove);
    })();

    /* ---------- scroll progress / nav / active links ---------- */
    (function () {
        var bar = $('#scrollbar'), nav = $('#nav');
        var links = $$('.nav-links a');
        var map = {};
        links.forEach(function (a) { map['#' + a.getAttribute('href').slice(1)] = a; });
        function onScroll() {
            var st = scrollY, h = document.documentElement.scrollHeight - innerHeight;
            if (bar) bar.style.width = (h > 0 ? (st / h) * 100 : 0) + '%';
            if (nav) nav.classList.toggle('scrolled', st > 12);
            var best = 'home', bestd = 1e9;
            Object.keys(map).forEach(function (id) {
                var sec = document.querySelector(id);
                if (!sec) return;
                var d = Math.abs(sec.getBoundingClientRect().top);
                if (d < bestd) { bestd = d; best = id.slice(1); }
            });
            links.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + best); });
        }
        addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    })();

    /* ---------- scroll cue hide ---------- */
    (function () {
        var cue = $('.scroll-cue'); if (!cue) return;
        addEventListener('scroll', function () {
            cue.style.opacity = scrollY > 40 ? 0 : 1;
        }, { passive: true });
    })();

    /* ---------- testimonials (static grid) ---------- */

    /* ---------- contact form ---------- */
    (function () {
        var form = $('#contactForm'), note = $('#formNote');
        if (!form) return;
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (!form.checkValidity()) { form.reportValidity(); return; }
            note.classList.add('show');
            var btn = $('.btn-block', form);
            btn.disabled = true; btn.style.opacity = .6;
            form.reset();
            setTimeout(function () { note.classList.remove('show'); btn.disabled = false; btn.style.opacity = 1; }, 4200);
        });
    })();

    /* ---------- mobile nav ---------- */
    (function () {
        var toggle = $('#navToggle'), links = $('#navLinks'), overlay = $('#navOverlay');
        if (!toggle || !links) return;
        function close() { toggle.classList.remove('open'); links.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
        toggle.addEventListener('click', function () {
            var open = links.classList.toggle('open');
            toggle.classList.toggle('open', open);
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        links.addEventListener('click', function (e) { if (e.target.tagName === 'A') close(); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    })();
})();